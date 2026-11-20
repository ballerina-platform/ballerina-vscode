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

import React, { useEffect, useRef, useState } from 'react';
import { DiagramEngine, DiagramModel } from '@projectstorm/react-diagrams';
import { NavigationWrapperCanvasWidget, ProgressRing, ThemeColors } from '@wso2/ui-toolkit';
import { createEntitiesEngine, entityModeller } from './utils';

import { DiagramContainer, useStyles } from './utils/CanvasStyles';

import './resources/assets/font/fonts.css';

import { dagreEngine } from './resources/constants';
import { DesignDiagramContext } from './components/common';
import { DiagramControls } from './components/Controls/DiagramControls';
import { OverlayLayerModel } from './components/OverlayLoader';
import { FilteringInfoBanner } from './components/FilteringInfoBanner';
import { Type } from '@wso2/ballerina-core';
import { focusToNode } from './utils/utils';
import { graphqlModeller } from './utils/model-mapper/entityModelMapper';

interface TypeDiagramProps {
    typeModel: Type[];
    rootService?: Type;
    isGraphql?: boolean;
    selectedNodeId?: string;
    focusedNodeId?: string;
    readonly?: boolean;
    updateFocusedNodeId?: (nodeId: string) => void;
    showProblemPanel?: () => void;
    goToSource: (node: Type) => void
    onTypeEdit: (typeId: string, isGraphqlRoot?: boolean) => void;
    onTypeDelete: (typeId: string) => void;
    verifyTypeDelete: (typeId: string) => Promise<boolean>;
    /** Whether the GraphQL service has a request context, which its root node then indicates. */
    hasRequestContext?: boolean;
    /** Opens the request context editor; offered on the GraphQL root node when given. */
    onOpenRequestContext?: () => void;
}

export interface ModelResult {
    model: DiagramModel;
    isFirstLevelDependenciesFiltered?: boolean;
}

/**
 * A fingerprint of what the diagram draws: the types and their members, without the source positions that every
 * edit above them shifts.
 */
export function structureOf(typeModel: Type[], rootService?: Type): string {
    return JSON.stringify({ typeModel, rootService }, (key, value) => key === "lineRange" ? undefined : value);
}

export function TypeDiagram(props: TypeDiagramProps) {
    const { typeModel, showProblemPanel, selectedNodeId, goToSource, focusedNodeId, readonly, updateFocusedNodeId, rootService, isGraphql, verifyTypeDelete, hasRequestContext, onOpenRequestContext } = props;

    const [diagramEngine] = useState<DiagramEngine>(createEntitiesEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel>(undefined);
    const [hasDiagnostics, setHasDiagnostics] = useState<boolean>(false);
    const [selectedDiagramNode, setSelectedDiagramNode] = useState<string>(selectedNodeId);
    const [isFirstLevelFiltered, setIsFirstLevelFiltered] = useState<boolean>(false);

    // What the diagram shows, without where each type sits in source: an edit elsewhere in a file (adding an
    // annotation, say) moves every line range below it but changes nothing on the canvas.
    const drawnStructure = useRef<string>();
    const drawnFocus = useRef<string>();
    // The layout a draw schedules once the nodes have rendered; until it runs, the model has no positions to keep.
    const pendingLayout = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => () => clearTimeout(pendingLayout.current), []);

    useEffect(() => {
        const structure = structureOf(typeModel, rootService);
        const unchanged = drawnStructure.current === structure && drawnFocus.current === focusedNodeId
            && !!diagramEngine.getModel() && !pendingLayout.current;
        drawnStructure.current = structure;
        drawnFocus.current = focusedNodeId;
        if (unchanged) {
            refreshInPlace();
        } else {
            drawDiagram(focusedNodeId);
        }
    }, [typeModel, focusedNodeId, rootService]);

    useEffect(() => {
        setSelectedDiagramNode(selectedNodeId);
    }, [selectedNodeId]);

    const drawDiagram = (focusedNode?: string) => {

        let diagramModel: DiagramModel;


        // Create diagram model based on type
        if (isGraphql && rootService) {
            console.log("Modeling  graphql diagram");
            diagramModel = graphqlModeller(rootService, typeModel);
        } else if (typeModel && !isGraphql) {
            console.log("Modeling entity diagram", focusedNode, selectedNodeId);
            const modellerResult: ModelResult = entityModeller(typeModel, focusedNode);
            diagramModel = modellerResult.model;
            setIsFirstLevelFiltered(modellerResult.isFirstLevelDependenciesFiltered || false);
        }

        if (diagramModel) {
            // Setup initial model
            diagramModel.addLayer(new OverlayLayerModel());
            diagramEngine.setModel(diagramModel);
            setDiagramModel(diagramModel);

            // Layout and focus handling. A layout still pending from an earlier draw would lay out this model and
            // then put its own back on the engine, so it is dropped.
            clearTimeout(pendingLayout.current);
            pendingLayout.current = setTimeout(() => {
                pendingLayout.current = undefined;
                dagreEngine.redistribute(diagramEngine.getModel());

                if (selectedNodeId) {
                    const selectedModel = diagramEngine.getModel().getNode(selectedNodeId);
                    focusToNode(selectedModel, diagramEngine.getModel().getZoomLevel(), diagramEngine);
                } else if (diagramEngine?.getCanvas()?.getBoundingClientRect) {
                    diagramEngine.zoomToFitNodes({ margin: 10, maxZoom: 1 });
                }

                // Cleanup and refresh
                diagramEngine.getModel().removeLayer(
                    diagramEngine.getModel().getLayers().find(layer => layer instanceof OverlayLayerModel)
                );
                diagramEngine.setModel(diagramModel);
                diagramEngine.repaintCanvas();
            }, 300);
        }
    }

    /**
     * Rebuilds the model from the latest types, so every node carries current source positions, while keeping the
     * view exactly as it is: each node stays where it was, and the zoom and scroll are kept. No loading overlay and no
     * re-layout, so a change that does not touch the schema does not flicker the canvas.
     */
    const refreshInPlace = () => {
        const current = diagramEngine.getModel();
        const next = isGraphql && rootService
            ? graphqlModeller(rootService, typeModel)
            : entityModeller(typeModel, focusedNodeId).model;
        if (!current || !next) {
            return;
        }
        next.getNodes().forEach((node) => {
            const previous = current.getNode(node.getID());
            if (previous) {
                node.setPosition(previous.getX(), previous.getY());
            }
        });
        next.setZoomLevel(current.getZoomLevel());
        next.setOffset(current.getOffsetX(), current.getOffsetY());
        diagramEngine.setModel(next);
        setDiagramModel(next);
        diagramEngine.repaintCanvas();
    };

    // const defaultOrg = useRef<string>('');

    const styles = useStyles();

    const onTypeEdit = (typeId: string, isGraphqlRoot?: boolean) => {
        console.log("Editing type: ", typeId, isGraphqlRoot);
        // setSelectedNodeId(typeId);
        props.onTypeEdit(typeId, isGraphqlRoot);
    }

    const updateSelectionOnDiagram = (nodeId: string) => {
        setSelectedDiagramNode(nodeId);
    }

    const onNodeDelete = (typeId: string) => {
        console.log("Deleting node: ", selectedDiagramNode);
        props.onTypeDelete(typeId);
    }

    let ctx = {
        selectedNodeId: selectedDiagramNode,
        setSelectedNodeId: updateSelectionOnDiagram,
        setHasDiagnostics,
        hasDiagnostics,
        focusedNodeId,
        readonly,
        setFocusedNodeId: updateFocusedNodeId,
        onEditNode: onTypeEdit,
        goToSource,
        onNodeDelete,
        verifyTypeDelete,
        hasRequestContext,
        onOpenRequestContext
    }

    const refreshDiagram = () => {
        drawDiagram(focusedNodeId);
    };

    return (
        <DesignDiagramContext {...ctx}>
            {diagramEngine?.getModel() && diagramModel ? (
                <>
                    {isFirstLevelFiltered && <FilteringInfoBanner />}
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                        <DiagramContainer data-testid="type-diagram">
                            <NavigationWrapperCanvasWidget
                                diagramEngine={diagramEngine}
                                className={styles.canvas}
                                focusedNode={diagramEngine?.getModel()?.getNode(selectedDiagramNode)}
                            />
                        </DiagramContainer>
                        <DiagramControls
                            engine={diagramEngine}
                            refreshDiagram={refreshDiagram}
                            showProblemPanel={showProblemPanel}
                        />
                    </div>
                </>
            ) : (
                <ProgressRing sx={{ color: ThemeColors.PRIMARY }} />
            )}
        </DesignDiagramContext>
    );
}
