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
import {
    autoDistribute,
    calculateEntryNodeHeight,
    calculateGraphQLNodeHeight,
    calculateWorkflowNodeHeight,
    createNodesLink,
    createPortNodeLink,
    createPortsLink,
    generateEngine,
    sortItems,
} from "../utils/diagram";
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
import { EntryNodeModel } from "./nodes/EntryNode";
import { ListenerNodeModel } from "./nodes/ListenerNode";
import { ConnectionNodeModel } from "./nodes/ConnectionNode";

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
                    updatedState[service.uuid] = { Query: true, Subscription: false, Mutation: false };
                }
            });

            return updatedState;
        });
    }, [project]);

    useEffect(() => {
        if (diagramEngine) {
            const { nodes, links } = getDiagramData();
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
            const current = prev[serviceUuid] ?? { Query: true, Subscription: false, Mutation: false };
            const next = { ...current, [group]: !current[group] } as { Query: boolean; Subscription: boolean; Mutation: boolean };
            return { ...prev, [serviceUuid]: next };
        });
    };

    const getDiagramData = () => {
        const nodes: NodeModel[] = [];
        const links: NodeLinkModel[] = [];

        // filtered autogenerated connections and connections with enableFlowModel as false
        const filteredConnections = project.connections?.filter((connection) => 
            !connection.symbol?.startsWith("_") && connection.enableFlowModel !== false
        );
        // Sort and create connections
        const sortedConnections = sortItems(filteredConnections || []) as CDConnection[];
        sortedConnections.forEach((connection, index) => {
            const node = new ConnectionNodeModel(connection);
            node.setPosition(0, 100 + index * 100);
            nodes.push(node);
        });

        let startY = 100;

        // Create workflow nodes first so service function rows can link to them.
        // Their edges are created after the services and the automation below.
        // Filter autogenerated workflows, mirroring the connection filtering above
        const filteredWorkflows = project.workflows?.filter(
            (workflow) => !workflow.symbol?.startsWith("_") && workflow.enableFlowModel !== false
        );
        const sortedWorkflows = sortItems(filteredWorkflows || []) as CDWorkflow[];
        let workflowStartY = 100;
        sortedWorkflows.forEach((workflow) => {
            const workflowNode = new EntryNodeModel(workflow, "workflow");
            const numRows = (workflow.events?.length ?? 0) + (workflow.humanTasks?.length ?? 0);
            const nodeHeight = calculateWorkflowNodeHeight(numRows);
            workflowNode.height = nodeHeight;
            workflowNode.setPosition(0, workflowStartY);
            nodes.push(workflowNode);
            workflowStartY += nodeHeight + 16;
        });

        // Sort services by sortText before creating nodes
        const sortedServices = sortItems(project.services || []) as CDService[];
        sortedServices.forEach((service) => {
            // Create entry node with calculated height
            const node = new EntryNodeModel(service, "service");

            const isGraphQL = service.type === "graphql:Service";
            if (isGraphQL) {
                const { visible, hidden } = partitionGraphQLServiceFunctions(
                    service,
                    expandedNodes,
                    graphQLGroupOpen[service.uuid] ?? { Query: true, Subscription: false, Mutation: false }
                );
                // Reusable function to create connections for a list of functions to a given port getter
                const nodeHeight = calculateGraphQLNodeHeight(
                    visible,
                    hidden,
                    graphQLGroupOpen[service.uuid] || { Query: true, Subscription: false, Mutation: false });

                node.height = nodeHeight;
                node.setPosition(0, startY);
                nodes.push(node);
                startY += nodeHeight + 16;

                // For GraphQL, handle visible and hidden per group
                (Object.keys(visible) as GroupKey[]).forEach((group) => {
                    createFunctionConnections(
                        visible[group],
                        nodes,
                        node,
                        (func) => node.getFunctionPort(func),
                        links,
                        group
                    );
                });

                (Object.keys(hidden) as GroupKey[]).forEach((group) => {
                    createFunctionConnections(
                        hidden[group],
                        nodes,
                        node,
                        (_func, grp) => node.getGraphQLGroupPort(grp!),
                        links,
                        group
                    );
                });

            } else {

                // Calculate height based on visible functions and expansion state
                const totalFunctions = service.remoteFunctions.length + service.resourceFunctions.length;
                const isExpanded = expandedNodes.has(service.uuid);
                const nodeHeight = calculateEntryNodeHeight(totalFunctions, isExpanded);
                node.height = nodeHeight;
                node.setPosition(0, startY);
                nodes.push(node);

                startY += nodeHeight + 16;

                const { hidden, visible } = partitionRegularServiceFunctions(service, expandedNodes);
                createFunctionConnections(
                    visible,
                    nodes,
                    node,
                    (func) => node.getFunctionPort(func),
                    links
                );

                if (hidden.length > 0) {
                    createFunctionConnections(
                        hidden,
                        nodes,
                        node,
                        () => node.getViewAllResourcesPort(),
                        links
                    );
                }
            }
        });
        // create automation
        const automation = project.automation;
        if (automation) {
            const automationNode = new EntryNodeModel(automation, "automation");
            nodes.push(automationNode);
            // link connections
            automation.connections?.forEach((connectionUuid) => {
                const connectionNode = nodes.find((node) => node.getID() === connectionUuid);
                if (connectionNode) {
                    const link = createNodesLink(automationNode, connectionNode);
                    if (link) {
                        links.push(link);
                    }
                }
            });
        }

        // create workflow edges
        sortedWorkflows.forEach((workflow) => {
            const workflowNode = nodes.find((node) => node.getID() === workflow.uuid) as EntryNodeModel;
            if (!workflowNode) {
                return;
            }

            // link the services that trigger this workflow via workflow:run. When a specific
            // function of the service runs the workflow, the link is already drawn from the
            // function row (createFunctionConnections); only fall back to a service-level edge
            const serviceFunctionLinksTo = (service: CDService, workflowUuid: string) =>
                [...(service.remoteFunctions ?? []), ...(service.resourceFunctions ?? [])].some((func) =>
                    func.workflows?.includes(workflowUuid)
                );
            workflow.attachedServices?.forEach((serviceUuid) => {
                const service = project.services?.find((item) => item.uuid === serviceUuid);
                if (service && serviceFunctionLinksTo(service, workflow.uuid)) {
                    return;
                }
                const triggerNode = nodes.find((node) => node.getID() === serviceUuid);
                if (triggerNode) {
                    const link = createNodesLink(triggerNode, workflowNode);
                    if (link) {
                        links.push(link);
                    }
                }
            });

            // link the automation that triggers this workflow via workflow:run
            workflow.attachedFunctions?.forEach((triggerUuid) => {
                const triggerNode = nodes.find((node) => node.getID() === triggerUuid);
                if (triggerNode) {
                    const link = createNodesLink(triggerNode, workflowNode);
                    if (link) {
                        links.push(link);
                    }
                }
            });

            // draw broken links for workflow:sendData calls whose data event cannot be matched.
            // Edges from a specific service function row are already drawn by createFunctionConnections
            const serviceFunctionInvalidSendsTo = (service: CDService, workflowUuid: string) =>
                [...(service.remoteFunctions ?? []), ...(service.resourceFunctions ?? [])].some((func) =>
                    func.invalidWorkflowSendData?.includes(workflowUuid)
                );
            const invalidSenderUuids = [
                ...(workflow.invalidSendDataServices ?? []).filter((serviceUuid) => {
                    const service = project.services?.find((item) => item.uuid === serviceUuid);
                    return !(service && serviceFunctionInvalidSendsTo(service, workflow.uuid));
                }),
                ...(workflow.invalidSendDataFunctions ?? []),
            ];
            invalidSenderUuids.forEach((senderUuid) => {
                const senderNode = nodes.find((node) => node.getID() === senderUuid);
                if (senderNode) {
                    const link = createNodesLink(senderNode, workflowNode, { visible: true, broken: true });
                    if (link) {
                        links.push(link);
                    }
                }
            });

            // link the entry points that send data to this workflow via workflow:sendData. Edges
            // from a specific service function row are already drawn by createFunctionConnections;
            // only fall back to a service-level edge when no function row carries the link
            const serviceFunctionSendsTo = (service: CDService, workflowUuid: string, eventName: string) =>
                [...(service.remoteFunctions ?? []), ...(service.resourceFunctions ?? [])].some((func) =>
                    func.workflowSendData?.[workflowUuid]?.includes(eventName)
                );
            workflow.events?.forEach((event) => {
                const eventPort = workflowNode.getEventPort(event);
                if (!eventPort) {
                    return;
                }
                const senderUuids = [
                    ...(event.attachedServices ?? []).filter((serviceUuid) => {
                        const service = project.services?.find((item) => item.uuid === serviceUuid);
                        return !(service && serviceFunctionSendsTo(service, workflow.uuid, event.name));
                    }),
                    ...(event.attachedFunctions ?? []),
                ];
                senderUuids.forEach((senderUuid) => {
                    const senderNode = nodes.find((node) => node.getID() === senderUuid);
                    if (senderNode && senderNode.getOutPort()) {
                        const link = createPortsLink(senderNode.getOutPort(), eventPort);
                        link.setSourceNode(senderNode);
                        link.setTargetNode(workflowNode);
                        links.push(link);
                    }
                });
            });

            // link this workflow to the connections used by its activities. Activities are not
            // rendered on the overview — only the derived workflow → connection edges are drawn.
            const linkedConnections = new Set<string>();
            workflow.activities?.forEach((activityUuid) => {
                const activity = project.activities?.find((item) => item.uuid === activityUuid);
                activity?.connections?.forEach((connectionUuid) => {
                    if (linkedConnections.has(connectionUuid)) {
                        return;
                    }
                    linkedConnections.add(connectionUuid);
                    const connectionNode = nodes.find((node) => node.getID() === connectionUuid);
                    if (connectionNode) {
                        const link = createNodesLink(workflowNode, connectionNode);
                        if (link) {
                            links.push(link);
                        }
                    }
                });
            });
        });

        // create listeners
        project.listeners?.forEach((listener) => {
            const node = new ListenerNodeModel(listener);
            nodes.push(node);
            // link services
            listener.attachedServices.forEach((serviceUuid) => {
                const serviceNode = nodes.find((node) => node.getID() === serviceUuid);
                if (serviceNode) {
                    const link = createNodesLink(node, serviceNode);
                    if (link) {
                        links.push(link);
                    }
                }
            });
        });

        return { nodes, links };
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

function getGraphQLGroupLabel(accessor?: string, name?: string): GroupKey | null {
    if (accessor === "get") return "Query";
    if (accessor === "subscribe") return "Subscription";
    if (!accessor && name) return "Mutation";
    return null;
}

function partitionRegularServiceFunctions(
    service: CDService,
    expandedNodes: Set<string>
): { visible: Array<CDFunction | CDResourceFunction>; hidden: Array<CDFunction | CDResourceFunction> } {
    const serviceFunctions: Array<CDFunction | CDResourceFunction> = [];
    if (service.remoteFunctions?.length) serviceFunctions.push(...service.remoteFunctions);
    if (service.resourceFunctions?.length) serviceFunctions.push(...service.resourceFunctions);

    const isExpanded = expandedNodes.has(service.uuid);
    if (serviceFunctions.length <= SHOW_ALL_THRESHOLD || isExpanded) {
        return { visible: serviceFunctions, hidden: [] };
    }
    return { visible: serviceFunctions.slice(0, PREVIEW_COUNT), hidden: serviceFunctions.slice(PREVIEW_COUNT) };
}

function partitionGraphQLServiceFunctions(
    service: CDService,
    expandedNodes: Set<string>,
    groupOpen?: { Query: boolean; Subscription: boolean; Mutation: boolean; }
): { visible: GQLFuncListType; hidden: GQLFuncListType } {
    const serviceFunctions: Array<CDFunction | CDResourceFunction> = [];
    if (service.remoteFunctions?.length) serviceFunctions.push(...service.remoteFunctions);
    if (service.resourceFunctions?.length) serviceFunctions.push(...service.resourceFunctions);



    const grouped = serviceFunctions.reduce((acc, fn) => {
        const accessor = (fn as CDResourceFunction).accessor;
        const name = (fn as CDFunction).name;
        const group = getGraphQLGroupLabel(accessor, name);
        if (!group) return acc;
        (acc[group] ||= []).push(fn);
        return acc;
    }, {} as GQLFuncListType);

    const visible: GQLFuncListType = {
        Query: [],
        Subscription: [],
        Mutation: [],
    };
    const hidden: GQLFuncListType = {
        Query: [],
        Subscription: [],
        Mutation: [],
    };

    (Object.keys(grouped) as GroupKey[]).forEach((group) => {
        const items = grouped[group];
        const isOpen = groupOpen ? !!groupOpen[group] : true; // default open if not provided
        if (!isOpen) {
            hidden[group].push(...items);
            return;
        }
        const groupExpanded = expandedNodes.has(service.uuid + group);
        if (items.length <= SHOW_ALL_THRESHOLD || groupExpanded) {
            visible[group].push(...items);
        } else {
            visible[group].push(...items.slice(0, PREVIEW_COUNT));
            hidden[group].push(...items.slice(PREVIEW_COUNT));
        }
    });

    return { visible, hidden };
}

function createFunctionConnections(
    funcs: Array<CDFunction | CDResourceFunction>,
    nodes: NodeModel[],
    node: EntryNodeModel,
    portGetter: (func: CDFunction | CDResourceFunction, group?: GroupKey) => any,
    links: NodeLinkModel[],
    group?: GroupKey
) {
    funcs.forEach((func) => {
        [...(func.connections ?? []), ...(func.workflows ?? [])].forEach((targetUuid) => {
            const targetNode = nodes.find((n) => n.getID() === targetUuid);
            if (targetNode) {
                const port = portGetter(func, group);
                if (port) {
                    const link = createPortNodeLink(port, targetNode);
                    if (link) {
                        links.push(link);
                    }
                }
            }
        });
        // link workflow:sendData calls to the specific data event of the workflow
        Object.entries(func.workflowSendData ?? {}).forEach(([workflowUuid, eventNames]) => {
            const workflowNode = nodes.find((n) => n.getID() === workflowUuid) as EntryNodeModel;
            if (!workflowNode) {
                return;
            }
            eventNames.forEach((eventName) => {
                const eventPort = workflowNode.getEventPortByName(eventName);
                const port = portGetter(func, group);
                if (eventPort && port) {
                    const link = createPortsLink(port, eventPort);
                    link.setSourceNode(node);
                    link.setTargetNode(workflowNode);
                    links.push(link);
                }
            });
        });
        // workflow:sendData calls whose data event cannot be matched are drawn as broken links
        func.invalidWorkflowSendData?.forEach((workflowUuid) => {
            const workflowNode = nodes.find((n) => n.getID() === workflowUuid);
            if (workflowNode) {
                const port = portGetter(func, group);
                if (port) {
                    const link = createPortNodeLink(port, workflowNode, { visible: true, broken: true });
                    if (link) {
                        links.push(link);
                    }
                }
            }
        });
    });
}
