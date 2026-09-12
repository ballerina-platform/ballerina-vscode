/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useState, useEffect } from "react";
import { DiagramEngine, DiagramModel } from "@projectstorm/react-diagrams";
import { CanvasWidget } from "@projectstorm/react-canvas-core";
import { autoDistribute, buildDiagramData, generateEngine } from "../utils/diagram";
import { DiagramCanvas } from "./DiagramCanvas";
import { NodeModel } from "../utils/types";
import { NodeLinkModel } from "./NodeLink";
import { OverlayLayerModel } from "./OverlayLayer";
import { DiagramContextProvider, DiagramContextState } from "./DiagramContext";
import Controls from "./Controls";
import {
    CDAutomation,
    CDConnection,
    CDFunction,
    CDListener,
    CDModel,
    CDService,
    CDResourceFunction,
    CDWorkflow
} from "@wso2/ballerina-core";

export type GroupKey = "Query" | "Subscription" | "Mutation";
export const PREVIEW_COUNT = 2;
export const SHOW_ALL_THRESHOLD = 3;

export interface DiagramProps {
    project: CDModel;
    readonly?: boolean;
    onListenerSelect: (listener: CDListener) => void;
    onServiceSelect: (service: CDService) => void;
    onFunctionSelect: (func: CDFunction | CDResourceFunction) => void;
    onAutomationSelect: (automation: CDAutomation) => void;
    onWorkflowSelect?: (workflow: CDWorkflow) => void;
    onConnectionSelect: (connection: CDConnection) => void;
    onDeleteComponent: (component: CDListener | CDService | CDAutomation | CDConnection | CDWorkflow, nodeType?: string) => void;
    onCleanupTestServices?: () => void;
}

export type GQLFuncListType = Record<GroupKey, Array<CDFunction | CDResourceFunction>>;

export type GQLState = {
    Query: boolean;
    Subscription: boolean;
    Mutation: boolean;
};

/**
 * Which GraphQL function groups a service shows expanded before the user touches anything.
 * Treated as read-only - `handleToggleGraphQLGroup` replaces the state object rather than mutating
 * it, so the same instance can safely back the fallback in `buildDiagramData`.
 */
export const DEFAULT_GQL_STATE: GQLState = { Query: true, Subscription: false, Mutation: false };

export function Diagram(props: DiagramProps) {
    const {
        project,
        readonly,
        onListenerSelect,
        onServiceSelect,
        onFunctionSelect,
        onAutomationSelect,
        onWorkflowSelect,
        onConnectionSelect,
        onDeleteComponent,
    } = props;
    const [diagramEngine] = useState<DiagramEngine>(generateEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [graphQLGroupOpen, setGraphQLGroupOpen] = useState<Record<string, GQLState>>({} as Record<string, GQLState>);

    // Ensure every service has a default GraphQL group open state.
    // Defaults: Query = true, Subscription = false, Mutation = false
    useEffect(() => {
        if (!project?.services) return;

        const graphqlServices = project.services.filter(
            (svc) => svc.type === "graphql:Service"
        );
        const currentGraphqlIds = new Set(graphqlServices.map((svc) => svc.uuid));

        setGraphQLGroupOpen((previousState) => {
            const updatedState = { ...previousState };

            // Remove services that no longer exist
            Object.keys(updatedState).forEach((id) => {
                if (!currentGraphqlIds.has(id)) {
                    delete updatedState[id];
                }
            });

            // Add new services that are not yet in the state
            graphqlServices.forEach((service) => {
                if (!updatedState[service.uuid]) {
                    updatedState[service.uuid] = { ...DEFAULT_GQL_STATE };
                }
            });

            return updatedState;
        });
    }, [project]);

    useEffect(() => {
        if (diagramEngine) {
            const { nodes, links } = buildDiagramData(project, expandedNodes, graphQLGroupOpen);
            drawDiagram(nodes, links);
            autoDistribute(diagramEngine);
        }
    }, [project, expandedNodes, graphQLGroupOpen]);

    useEffect(() => {
        const handleResize = () => {
            if (diagramEngine?.getCanvas()?.getBoundingClientRect) {
                diagramEngine.zoomToFitNodes({ margin: 40, maxZoom: 1 });
                diagramEngine.repaintCanvas();
            }
        };

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [diagramEngine, diagramModel]);

    const handleToggleNodeExpansion = (nodeId: string) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return newSet;
        });
    };

    const handleToggleGraphQLGroup = (serviceUuid: string, group: "Query" | "Subscription" | "Mutation") => {
        setGraphQLGroupOpen(prev => {
            const current = prev[serviceUuid] ?? DEFAULT_GQL_STATE;
            const next = { ...current, [group]: !current[group] } as { Query: boolean; Subscription: boolean; Mutation: boolean };
            return { ...prev, [serviceUuid]: next };
        });
    };

    const drawDiagram = (nodes: NodeModel[], links: NodeLinkModel[]) => {
        const newDiagramModel = new DiagramModel();
        newDiagramModel.addLayer(new OverlayLayerModel());
        // add nodes and links to the diagram
        newDiagramModel.addAll(...nodes, ...links);

        diagramEngine.setModel(newDiagramModel);
        setDiagramModel(newDiagramModel);
        // registerListeners(diagramEngine);

        diagramEngine.setModel(newDiagramModel);

        // diagram paint with timeout
        setTimeout(() => {
            // remove loader overlay layer
            const overlayLayer = diagramEngine
                .getModel()
                .getLayers()
                .find((layer) => layer instanceof OverlayLayerModel);
            if (overlayLayer) {
                diagramEngine.getModel().removeLayer(overlayLayer);
            }
            if (diagramEngine?.getCanvas()?.getBoundingClientRect) {
                diagramEngine.zoomToFitNodes({ margin: 40, maxZoom: 1 });
            }
            diagramEngine.repaintCanvas();
        }, 200);
    };

    const context: DiagramContextState = {
        project,
        expandedNodes,
        graphQLGroupOpen,
        readonly,
        onListenerSelect,
        onServiceSelect,
        onFunctionSelect,
        onAutomationSelect,
        onWorkflowSelect,
        onConnectionSelect,
        onDeleteComponent,
        onToggleNodeExpansion: handleToggleNodeExpansion,
        onToggleGraphQLGroup: handleToggleGraphQLGroup,
    };

    return (
        <>
            <Controls engine={diagramEngine} onCleanupTestServices={props.onCleanupTestServices} />

            {diagramEngine && diagramModel && (
                <DiagramContextProvider value={context}>
                    <DiagramCanvas>
                        <CanvasWidget engine={diagramEngine} />
                    </DiagramCanvas>
                </DiagramContextProvider>
            )}
        </>
    );
}
