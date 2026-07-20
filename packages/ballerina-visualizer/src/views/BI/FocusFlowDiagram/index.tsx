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

import { cloneDeep, debounce } from "lodash";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory } from "@wso2/ballerina-side-panel";
import styled from "@emotion/styled";
import { MemoizedDiagram, GetHelperPaneFunction } from "@wso2/bi-diagram";
import {
    BIAvailableNodesRequest,
    Flow,
    FlowNode,
    FunctionNode,
    Branch,
    Category,
    AvailableNode,
    LineRange,
    EVENT_TYPE,
    VisualizerLocation,
    CurrentBreakpointsResponse as BreakpointInfo,
    ParentPopupData,
    ExpressionProperty,
    TRIGGER_CHARACTERS,
    TriggerCharacter,
    TextEdit,
    ParentMetadata,
    UpdatedArtifactsResponse,
    NodePosition,
    LinePosition,
    NodeMetadata,
    FOCUS_FLOW_DIAGRAM_VIEW,
    FocusFlowDiagramView
} from "@wso2/ballerina-core";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { ConnectionConfig, ConnectionCreator, ConnectionSelectionList } from "../../../components/ConnectionSelector";
import { FlowNodeForm } from "../Forms/FlowNodeForm";
import { AgentEditorPanelContent, getAgentEditorPanelTitle } from "../AIChatAgent/AgentEditorPanelContent";
import { AgentEditorView, useAgentEditorController } from "../AIChatAgent/useAgentEditorController";
import { goToAgent } from "../AIChatAgent/utils";
import { buildAgentRenderNode } from "./agent";
import { AgentPromptDisplay } from "./AgentPromptDisplay";

import {
    addDraftNodeToDiagram,
    convertBalCompletion,
    convertBICategoriesToSidePanelCategories,
    getFlowNodeForNaturalFunction,
    calculateExpressionOffsets,
    updateLineRange,
} from "../../../utils/bi";
import { getNodeTemplateForConnection } from "../FlowDiagram/utils";
import { View, ProgressRing, ProgressIndicator, ThemeColors, CompletionItem } from "@wso2/ui-toolkit";
import { EXPRESSION_EXTRACTION_REGEX } from "../../../constants";
import { ConnectionKind } from "../../../components/ConnectionSelector";
import { SidePanelView } from "../FlowDiagram/PanelManager";
import { PanelOverlayProvider } from "../FlowDiagram/context/PanelOverlayContext";
import { PanelOverlayRenderer } from "../FlowDiagram/PanelOverlayRenderer";
import { createPromptHelperPane } from "./utils";


const Container = styled.div<{ embedded?: boolean }>`
    width: 100%;
    height: ${(props: { embedded?: boolean }) => props.embedded ? "100%" : "calc(100vh - 50px)"};
`;

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

export interface BIFocusFlowDiagramProps {
    projectPath: string;
    filePath: string;
    view?: FocusFlowDiagramView;
    /** When rendering embedded (e.g. in a drawer), provide the position so the component
     *  doesn't need to fetch it from the VS Code extension state. */
    position?: NodePosition;
    embedded?: boolean;
    onUpdate: () => void;
    onReady: (fileName: string, parentMetadata?: ParentMetadata, position?: NodePosition) => void;
}

type AgentPanel = "NONE" | "FORM";

export function BIFocusFlowDiagram(props: BIFocusFlowDiagramProps) {
    const { projectPath, filePath, view, onUpdate, onReady, embedded } = props;
    const embeddedPositionRef = useRef<NodePosition | undefined>(props.position);
    const { rpcClient } = useRpcContext();
    const isAgent = view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT;
    const isAgentType = view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT_TYPE;

    const agentDeclRef = useRef<FlowNode>();
    const agentFormNodeRef = useRef<FlowNode>();
    const [agentPanel, setAgentPanel] = useState<AgentPanel>("NONE");
    const suppressAgentTypeReloadRef = useRef(false);
    const suppressAgentReloadRef = useRef(false);
    const [agentFormKey, setAgentFormKey] = useState(0);
    const [agentTypeFormMode, setAgentTypeFormMode] = useState<"ALL" | "MODEL">("ALL");

    const [model, setModel] = useState<Flow>();
    const [suggestedModel, setSuggestedModel] = useState<Flow>();
    const [showProgressIndicator, setShowProgressIndicator] = useState(false);
    const [breakpointInfo, setBreakpointInfo] = useState<BreakpointInfo>();
    const [showConnectionPanel, setShowConnectionPanel] = useState(false);
    const [selectedConnectionKind, setSelectedConnectionKind] = useState<ConnectionKind>();
    const [connectionView, setConnectionView] = useState<SidePanelView.CONNECTION_CONFIG | SidePanelView.CONNECTION_SELECT | SidePanelView.CONNECTION_CREATE>();

    const selectedNodeRef = useRef<FlowNode>();
    const nodeTemplateRef = useRef<FlowNode>();
    const topNodeRef = useRef<FlowNode | Branch>();
    const targetRef = useRef<LineRange>();
    const originalFlowModel = useRef<Flow>();
    const suggestedText = useRef<string>();
    const selectedClientName = useRef<string>();
    const initialCategoriesRef = useRef<PanelCategory[]>([]);
    const showEditForm = useRef<boolean>(false);

    const prevCompletionFetchText = useRef<string>();
    const [completions, setCompletions] = useState<CompletionItem[]>([]);
    const [filteredCompletions, setFilteredCompletions] = useState<CompletionItem[]>([]);
    const triggerCompletionOnNextRequest = useRef<boolean>(false);
    const [selectedNode, setSelectedNode] = useState<FunctionNode | undefined>();
    const expressionOffsetRef = useRef<number>(0); // To track the expression offset on adding import statements

    useEffect(() => {
        if (isAgent) {
            getAgentModel();
        } else if (isAgentType) {
            getAgentTypeModel();
        } else {
            debouncedGetFlowModel();
        }
    }, []);

    useEffect(() => {
        const unsubscribeContentUpdated = rpcClient.onProjectContentUpdated((state: boolean) => {
            console.log(">>> on project content updated", state);
            if (isAgent) {
                debouncedGetAgentModel();
                return;
            }
            if (isAgentType) {
                debouncedGetAgentTypeModel();
                return;
            }
            fetchNodes(topNodeRef.current, targetRef.current, true);
        });
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            console.log(">>> on parent popup submitted", parent);
            if (isAgent) {
                debouncedGetAgentModel();
                return;
            }
            if (isAgentType) {
                debouncedGetAgentTypeModel();
                return;
            }
            const toNode = topNodeRef.current;
            const target = targetRef.current;
            fetchNodes(toNode, target, false);
        });
        return () => {
            unsubscribeContentUpdated();
        };
    }, [rpcClient]);

    const debouncedGetFlowModel = useCallback(
        debounce(() => {
            getFlowModel();
        }, 1000),
        [rpcClient]
    );

    const debouncedGetAgentModel = useCallback(
        debounce(() => {
            getAgentModel();
        }, 300),
        [rpcClient]
    );

    const debouncedGetAgentTypeModel = useCallback(
        debounce(() => {
            getAgentTypeModel();
        }, 300),
        [rpcClient]
    );

    const getFlowModel = () => {
        setShowProgressIndicator(true);
        onUpdate();
        rpcClient
            .getBIDiagramRpcClient()
            .getBreakpointInfo()
            .then((response) => {
                setBreakpointInfo(response);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getFlowModel({})
                    .then(async (model) => {
                        console.log(">>> focus diagram flow model", model);
                        if (model?.flowModel) {
                            const functionName = (model.flowModel.nodes.find((node) => node.codedata.node === "EVENT_START")?.metadata.data as ParentMetadata).label || "";
                            const node = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
                                projectPath,
                                fileName: filePath,
                                functionName: functionName
                            });

                            setSelectedNode(node.functionDefinition);

                            if (node?.functionDefinition) {
                                const flowNode = getFlowNodeForNaturalFunction(node.functionDefinition);
                                // Enrich model provider metadata with icon URL from connections
                                const modelProviderValue = flowNode.properties?.modelProvider?.value as string;
                                if (modelProviderValue && Array.isArray(model.flowModel.connections)) {
                                    const matchingConnection = model.flowModel.connections.find(
                                        (c: any) => c?.properties?.variable?.value === modelProviderValue
                                    );
                                    if (matchingConnection?.metadata?.icon && flowNode.properties?.modelProvider?.metadata?.data) {
                                        (flowNode.properties.modelProvider.metadata.data as any).iconUrl = matchingConnection.metadata.icon;
                                    }
                                }
                                model.flowModel.nodes.push(flowNode);
                                setModel(model.flowModel);
                                const eventStartNode = model.flowModel.nodes.find(
                                    (node) => node.codedata.node === "EVENT_START"
                                );
                                const eventStartMetadata = eventStartNode?.metadata.data as ParentMetadata | undefined;
                                const parentMetadata = eventStartMetadata
                                    ? { ...eventStartMetadata, sourceCode: eventStartNode?.codedata?.sourceCode }
                                    : undefined;
                                // Get visualizer location and pass position to onReady
                                rpcClient.getVisualizerLocation().then((location: VisualizerLocation) => {
                                    onReady(model.flowModel.fileName, parentMetadata, location?.position);
                                });
                            }
                        }
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                        onReady(undefined, undefined, undefined);
                    });
            });
    };


    const getAgentFocusModel = async (kind: "AGENT" | "AGENT_TYPE", posOverride?: NodePosition) => {
        const suppressRef = kind === "AGENT" ? suppressAgentReloadRef : suppressAgentTypeReloadRef;
        const logLabel = kind === "AGENT" ? "agent focus" : "agent-type focus";
        if (suppressRef.current) {
            suppressRef.current = false;
            return;
        }
        setShowProgressIndicator(true);
        onUpdate();
        try {
            const location = await rpcClient.getVisualizerLocation();
            const pos = posOverride ?? embeddedPositionRef.current ?? location?.position;
            if (!pos) {
                console.error(`>>> ${logLabel}: no position in visualizer location`, location);
                return;
            }
            embeddedPositionRef.current = pos;

            const response = await rpcClient.getBIDiagramRpcClient().getFlowModel({
                filePath,
                startLine: { line: pos.startLine, offset: pos.startColumn },
                endLine: { line: pos.endLine, offset: pos.endColumn },
            });
            const fetchedFlow = response?.flowModel;
            const agentDecl = fetchedFlow?.nodes?.find((node) => node.codedata?.node === kind);
            if (!agentDecl) {
                console.error(`>>> ${logLabel}: ${kind} node not found`, { filePath, pos });
                return;
            }
            agentDeclRef.current = agentDecl;
            agentFormNodeRef.current = agentDecl;
            setAgentFormKey((key) => key + 1);

            const connections = fetchedFlow?.connections || [];
            const renderNode: FlowNode = kind === "AGENT"
                ? buildAgentRenderNode(agentDecl, connections)
                : {
                    ...agentDecl,
                    id: agentDecl.id || "agent-type-focus-node",
                    branches: [],
                    flags: agentDecl.flags ?? 0,
                    returning: true,
                };
            const flow: Flow = { fileName: filePath, nodes: [renderNode], connections };
            setModel(flow);

            const breakpointResponse = await rpcClient.getBIDiagramRpcClient().getBreakpointInfo();
            setBreakpointInfo(breakpointResponse);
            onReady(filePath, undefined, pos);
        } catch (error) {
            console.error(`>>> ${logLabel}: error building model`, error);
        } finally {
            setShowProgressIndicator(false);
            onReady(undefined, undefined, undefined);
        }
    };

    const getAgentModel = (posOverride?: NodePosition) => getAgentFocusModel("AGENT", posOverride);

    const getAgentTypeModel = (posOverride?: NodePosition) => getAgentFocusModel("AGENT_TYPE", posOverride);

    const handleEditAgentTypeForm = (_node: FlowNode) => {
        if (!agentDeclRef.current) {
            return;
        }
        agentFormNodeRef.current = agentDeclRef.current;
        setAgentTypeFormMode("ALL");
        setAgentPanel("FORM");
    };

    const handleEditAgentTypeModel = (_node: FlowNode) => {
        if (!agentDeclRef.current) {
            return;
        }
        agentFormNodeRef.current = agentDeclRef.current;
        setAgentTypeFormMode("MODEL");
        setAgentPanel("FORM");
    };

    const buildAgentTypeFieldOverrides = (node: FlowNode, mode: "ALL" | "MODEL") => {
        const modelParam = (node.metadata?.data as NodeMetadata)?.agentInfo?.modelProvider?.propertyKey;
        const overrides: Record<string, { hidden?: boolean }> = { type: { hidden: true } };
        if (mode === "MODEL") {
            Object.keys(node.properties || {}).forEach((key) => {
                overrides[key] = { hidden: key !== modelParam };
            });
            if (modelParam) {
                overrides[modelParam] = { hidden: false };
            }
        } else if (modelParam) {
            overrides[modelParam] = { hidden: true };
        }
        return overrides;
    };

    const handleCloseAgentPanel = () => {
        setShowConnectionPanel(false);
        setAgentPanel("NONE");
    };

    const handleEditAgentModel = (_node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        selectedNodeRef.current = agentDecl;
        setAgentPanel("NONE");
        setSelectedConnectionKind("MODEL_PROVIDER");
        setConnectionView(SidePanelView.CONNECTION_CONFIG);
        setShowConnectionPanel(true);
    };

    const handleEditAgentForm = (_node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        agentFormNodeRef.current = agentDecl;
        setShowConnectionPanel(false);
        setAgentPanel("FORM");
    };

    const handleSubmitAgentForm = async (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            return;
        }
        suppressAgentTypeReloadRef.current = false;
        setShowProgressIndicator(true);
        try {
            const fileName = model?.fileName;
            await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: fileName, flowNode: updatedNode });
        } catch (error) {
            console.error(">>> agent focus: error saving agent form", error);
        } finally {
            setShowProgressIndicator(false);
            handleCloseAgentPanel();
        }
    };

    const handleOnCloseSidePanel = () => {
        selectedNodeRef.current = undefined;
        nodeTemplateRef.current = undefined;
        topNodeRef.current = undefined;
        targetRef.current = undefined;
        selectedClientName.current = undefined;
        showEditForm.current = false;

        // restore original model
        if (originalFlowModel.current) {
            // const updatedModel = removeDraftNodeFromDiagram(model);
            // setModel(updatedModel);
            debouncedGetFlowModel();
            originalFlowModel.current = undefined;
            setSuggestedModel(undefined);
            suggestedText.current = undefined;
        }
    };

    const fetchNodes = (
        parent: FlowNode | Branch,
        target: LineRange,
        updateFlowModel = true
    ) => {
        const getNodeRequest: BIAvailableNodesRequest = {
            position: target.startLine,
            filePath: model?.fileName || parent?.codedata?.lineRange.fileName,
        };
        console.log(">>> get available node request", getNodeRequest);
        // save original model
        originalFlowModel.current = model;
        // show side panel with available nodes
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .getAvailableNodes(getNodeRequest)
            .then((response) => {
                console.log(">>> Available nodes", response);
                if (!response.categories) {
                    console.error(">>> Error getting available nodes", response);
                    return;
                }
                // filter out some categories that are not supported in the diagram
                // TODO: these categories should be supported in the future
                const notSupportedCategories = [
                    "PARALLEL_FLOW",
                    "LOCK",
                    "START",
                    "TRANSACTION",
                    "COMMIT",
                    "ROLLBACK",
                    "RETRY",
                ];
                const filteredCategories = response.categories.map((category) => ({
                    ...category,
                    items: category?.items?.filter(
                        (item) =>
                            !("codedata" in item) ||
                            !notSupportedCategories.includes((item as AvailableNode).codedata?.node)
                    ),
                })) as Category[];
                const convertedCategories = convertBICategoriesToSidePanelCategories(filteredCategories);
                initialCategoriesRef.current = convertedCategories; // Store initial categories
                // add draft node to model
                if (updateFlowModel) {
                    const updatedFlowModel = addDraftNodeToDiagram(model, parent, target);
                    setModel(updatedFlowModel);
                }
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnAddComment = (comment: string, target: LineRange) => {
        console.log(">>> on add comment", { comment, target });
        const updatedNode: FlowNode = {
            id: "40715",
            metadata: {
                label: "Comment",
                description: "This is a comment",
            },
            codedata: {
                node: "COMMENT",
                lineRange: {
                    fileName: "currency.bal",
                    ...target,
                },
            },
            returning: false,
            properties: {
                comment: {
                    metadata: {
                        label: "Comment",
                        description: "Comment to describe the flow",
                    },
                    value: `\n${comment}\n\n`, // HACK: add extra new lines to get last position right
                    optional: false,
                    advanced: false,
                    editable: true,
                },
            },
            branches: [],
            flags: 0,
        };

        rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({
                filePath: model.fileName,
                flowNode: updatedNode,
            })
            .then((response) => {
                console.log(">>> Updated source code", response);
                if (response.artifacts.length > 0) {
                    // clear memory
                    selectedNodeRef.current = undefined;
                    handleOnCloseSidePanel();
                } else {
                    console.error(">>> Error updating source code", response);
                    // handle error
                }
            });
    };

    const handleOnFormSubmit = (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            console.log(">>> No updated node found");
            updatedNode = selectedNodeRef.current;
        }
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({
                filePath: model.fileName,
                flowNode: updatedNode
            })
            .then((response) => {
                console.log(">>> Updated source code", response);
                if (response.artifacts.length > 0) {
                    // clear memory
                    selectedNodeRef.current = undefined;
                    getFlowModel();
                    handleOnCloseSidePanel();
                } else {
                    console.error(">>> Error updating source code", response);
                    // handle error
                }
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnEditNode = async (node: FlowNode) => {
        console.log(">>> on edit node", node);
        selectedNodeRef.current = node;
        if (suggestedText.current) {
            // use targetRef from suggested model
        } else {
            topNodeRef.current = undefined;
            targetRef.current = node.codedata.lineRange;
        }
        if (!targetRef.current) {
            return;
        }
        setShowProgressIndicator(true);
        rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model.fileName,
            id: node.codedata,
        }).then((response) => {
            const nodesWithCustomForms = ["IF", "FORK"];
            if (!response.flowNode.properties && !nodesWithCustomForms.includes(response.flowNode.codedata.node)) {
                setShowProgressIndicator(false);
                showEditForm.current = false;
                return;
            }

            nodeTemplateRef.current = response.flowNode;
            showEditForm.current = true;
        })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnGoToSource = (node: FlowNode) => {
        const targetPosition: NodePosition = {
            startLine: node.codedata.lineRange.startLine.line,
            startColumn: node.codedata.lineRange.startLine.offset,
            endLine: node.codedata.lineRange.endLine.line,
            endColumn: node.codedata.lineRange.endLine.offset,
        };
        rpcClient.getCommonRpcClient().goToSource({ position: targetPosition });
    };

    const handleAddBreakpoint = (node: FlowNode) => {
        const request = {
            filePath: model?.fileName,
            breakpoint: {
                line: node.codedata.lineRange.startLine.line,
                column: node.codedata.lineRange.startLine?.offset,
            },
        };

        rpcClient.getBIDiagramRpcClient().addBreakpointToSource(request);
    };

    const handleRemoveBreakpoint = (node: FlowNode) => {
        const request = {
            filePath: model?.fileName,
            breakpoint: {
                line: node.codedata.lineRange.startLine.line,
                column: node.codedata.lineRange.startLine?.offset,
            },
        };

        rpcClient.getBIDiagramRpcClient().removeBreakpointFromSource(request);
    };

    const handleOpenView = async (location: VisualizerLocation) => {
        console.log(">>> open view: ", { location });
        const context: VisualizerLocation = {
            documentUri: location.documentUri,
            position: location.position,
            projectPath: location.projectPath || undefined,
        };
        await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: context });
    };

    const handleGoToAgent = (node: FlowNode) => goToAgent(node, rpcClient);

    const handleOnChatWithAgent = (agentDeclNode: FlowNode) => {
        const agentVarName = agentDeclNode.properties?.variable?.value as string;
        const filePath = model?.fileName || agentDeclNode.codedata?.lineRange?.fileName;
        if (!agentVarName || !filePath) {
            console.error("Cannot start inline agent chat: missing agent variable name or file path");
            return;
        }
        rpcClient.getBIDiagramRpcClient().startInlineAgentChat({
            agentVarName,
            filePath,
            agentNode: agentDeclNode,
        });
    };

    const flowModel = originalFlowModel.current && suggestedModel ? suggestedModel : model;

    /* expression editor related */
    const handleExpressionEditorCancel = () => {
        setFilteredCompletions([]);
        setCompletions([]);
        triggerCompletionOnNextRequest.current = false;
    };

    const debouncedRetrieveCompletions = useCallback(
        debounce(
            async (
                value: string,
                property: ExpressionProperty,
                offset: number,
                triggerCharacter?: string
            ) => {
                let expressionCompletions: CompletionItem[] = [];
                const { parentContent, currentContent } = value
                    .slice(0, offset)
                    .match(EXPRESSION_EXTRACTION_REGEX)?.groups ?? {};
                if (
                    completions.length > 0 &&
                    !triggerCharacter &&
                    parentContent === prevCompletionFetchText.current
                ) {
                    expressionCompletions = completions
                        .filter((completion) => {
                            const lowerCaseText = currentContent.toLowerCase();
                            const lowerCaseLabel = completion.label.toLowerCase();

                            return lowerCaseLabel.includes(lowerCaseText);
                        })
                        .sort((a, b) => a.sortText.localeCompare(b.sortText));
                } else {
                    const { lineOffset, charOffset } = calculateExpressionOffsets(value, offset);
                    let completions = await rpcClient.getBIDiagramRpcClient().getExpressionCompletions({
                        filePath: filePath,
                        context: {
                            expression: value,
                            startLine: updateLineRange(
                                selectedNode.properties['prompt'].codedata.lineRange,
                                expressionOffsetRef.current
                            ).startLine,
                            lineOffset: lineOffset,
                            offset: charOffset,
                            codedata: selectedNode.codedata,
                            property: property
                        },
                        completionContext: {
                            triggerKind: triggerCharacter ? 2 : 1,
                            triggerCharacter: triggerCharacter as TriggerCharacter
                        }
                    });

                    // Convert completions to the ExpressionEditor format
                    let convertedCompletions: CompletionItem[] = [];
                    completions?.forEach((completion) => {
                        if (completion.detail) {
                            // HACK: Currently, completion with additional edits apart from imports are not supported
                            // Completions that modify the expression itself (ex: member access)
                            convertedCompletions.push(convertBalCompletion(completion));
                        }
                    });
                    setCompletions(convertedCompletions);

                    if (triggerCharacter) {
                        expressionCompletions = convertedCompletions;
                    } else {
                        expressionCompletions = convertedCompletions
                            .filter((completion) => {
                                const lowerCaseText = currentContent.toLowerCase();
                                const lowerCaseLabel = completion.label.toLowerCase();

                                return lowerCaseLabel.includes(lowerCaseText);
                            })
                            .sort((a, b) => a.sortText.localeCompare(b.sortText));
                    }
                }

                prevCompletionFetchText.current = parentContent ?? "";
                setFilteredCompletions(expressionCompletions);
            },
            250
        ),
        [rpcClient, completions, filePath, selectedNode]
    );

    const handleRetrieveCompletions = useCallback(
        async (
            value: string,
            property: ExpressionProperty,
            offset: number,
            triggerCharacter?: string
        ) => {
            await debouncedRetrieveCompletions(value, property, offset, triggerCharacter);

            if (triggerCharacter) {
                await debouncedRetrieveCompletions.flush();
            }
        },
        [debouncedRetrieveCompletions]
    );

    const handleCompletionItemSelect = async (value: string, additionalTextEdits?: TextEdit[]) => {
        if (additionalTextEdits?.[0]?.newText) {
            const response = await rpcClient.getBIDiagramRpcClient().updateImports({
                filePath: filePath,
                importStatement: additionalTextEdits[0].newText,
            });
            expressionOffsetRef.current += response.importStatementOffset;
        }
        debouncedRetrieveCompletions.cancel();
        handleExpressionEditorCancel();
    };

    const handleGetExpressionTokens = async (
        expression: string,
        fileName: string,
        position: { line: number; offset: number }
    ): Promise<number[]> => {
        return rpcClient.getBIDiagramRpcClient().getExpressionTokens({
            expression: expression,
            filePath: fileName,
            position: position
        });
    };

    const handleExpressionEditorBlur = () => {
        handleExpressionEditorCancel();
    };

    const handleOnEditNPFunctionModel = (node: FlowNode) => {
        console.log(">>> on edit np function model provider", node);
        selectedNodeRef.current = node;
        setSelectedConnectionKind('MODEL_PROVIDER');
        setConnectionView(SidePanelView.CONNECTION_CONFIG);
        setShowConnectionPanel(true);
    };

    const handleCloseConnectionPanel = () => {
        setShowConnectionPanel(false);
        selectedNodeRef.current = undefined;
        if (isAgent) {
            setAgentPanel("NONE");
        } else {
            getFlowModel();
        }
    };

    const handleNavigateToSelectionList = () => {
        setConnectionView(SidePanelView.CONNECTION_SELECT);
    };

    const handleSelectConnection = async (nodeId: string, metadata?: any) => {
        setShowProgressIndicator(true);

        try {
            const { flowNode, connectionKind } = await getNodeTemplateForConnection(
                nodeId,
                metadata,
                targetRef.current,
                model?.fileName,
                rpcClient
            );

            nodeTemplateRef.current = flowNode;
            setSelectedConnectionKind(connectionKind as ConnectionKind);
            setConnectionView(SidePanelView.CONNECTION_CREATE);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    const handleUpdateNodeWithConnection = async (selectedNode: FlowNode) => {
        setShowProgressIndicator(true);

        const clonedNode = structuredClone(selectedNode);

        const isNpFunction = clonedNode.codedata.node === "NP_FUNCTION";
        if (isNpFunction)
            clonedNode.codedata.node = "NP_FUNCTION_DEFINITION";

        await rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({ filePath: model?.fileName, flowNode: clonedNode, isFunctionNodeUpdate: isNpFunction });
        handleCloseConnectionPanel();
        setShowProgressIndicator(false);
    };

    const createHelperPane = useCallback<GetHelperPaneFunction>((
        fieldKey,
        exprRef,
        anchorRef,
        defaultValue,
        value,
        onChange,
        changeHelperPaneState,
        helperPaneHeight,
        recordTypeField,
        isAssignIdentifier,
        valueTypeConstraint,
        inputMode
    ) => {
        if (!selectedNode || !model) {
            return <></>;
        }

        return createPromptHelperPane({
            selectedNode,
            model,
            fieldKey,
            exprRef,
            anchorRef,
            defaultValue,
            value,
            onChange,
            changeHelperPaneState,
            helperPaneHeight,
            recordTypeField,
            valueTypeConstraint,
            inputMode,
            completions,
            filteredCompletions,
            projectPath,
            rpcClient,
            debouncedRetrieveCompletions
        });
    }, [model, projectPath, completions, filteredCompletions, debouncedRetrieveCompletions, rpcClient, selectedNode]);

    const agentEditor = useAgentEditorController({
        projectPath,
        filePath,
        onModelSelect: isAgentType ? handleEditAgentTypeModel : handleEditAgentModel,
        onRefresh: (position) => { void (isAgentType ? getAgentTypeModel(position) : getAgentModel(position)); },
        onLoadingChange: setShowProgressIndicator,
        onChat: isAgentType ? handleOnChatWithAgent : undefined,
        onAgentCreated: () => { suppressAgentReloadRef.current = true; },
        resolveAgentNode: (node) => agentDeclRef.current ?? node,
    });

    const isAgentPanelOpen = agentPanel !== "NONE" || showConnectionPanel || agentEditor.view !== "NONE";
    const handleOverlayClick = () => {
        if (showConnectionPanel) {
            handleCloseConnectionPanel();
        } else if (agentPanel !== "NONE") {
            handleCloseAgentPanel();
        } else {
            agentEditor.close();
        }
    };

    const memoizedDiagramProps = useMemo(
        () => ({
            model: flowModel,
            onAddComment: handleOnAddComment,
            onNodeSelect: handleOnEditNode,
            onNodeSave: handleOnFormSubmit,
            goToSource: handleOnGoToSource,
            addBreakpoint: handleAddBreakpoint,
            removeBreakpoint: handleRemoveBreakpoint,
            openView: handleOpenView,
            goToAgent: handleGoToAgent,
            projectPath,
            breakpointInfo,
            expressionContext: {
                completions: filteredCompletions,
                triggerCharacters: TRIGGER_CHARACTERS,
                retrieveCompletions: handleRetrieveCompletions,
                onCompletionItemSelect: handleCompletionItemSelect,
                onBlur: handleExpressionEditorBlur,
                onCancel: handleExpressionEditorCancel,
                getHelperPane: createHelperPane,
                getExpressionTokens: handleGetExpressionTokens
            },
            aiNodes: {
                onModelSelect: handleOnEditNPFunctionModel,
            },
        }),
        [flowModel, projectPath, breakpointInfo, filteredCompletions, createHelperPane, handleGetExpressionTokens]
    );

    const noop = () => { };

    const agentFocusDiagramProps = useMemo(
        () => ({
            model: flowModel,
            onNodeSelect: isAgentType ? handleEditAgentTypeForm : handleEditAgentForm,
            onAddNode: noop,
            onDeleteNode: noop,
            goToSource: handleOnGoToSource,
            openView: handleOpenView,
            goToAgent: handleGoToAgent,
            projectPath,
            breakpointInfo,
            readOnly: showProgressIndicator,
            isAgentFocusView: true,
            embedded,
            overlay: {
                visible: isAgentPanelOpen,
                onClickOverlay: handleOverlayClick,
            },
            agentNode: agentEditor.diagramCallbacks,
        }),
        [flowModel, projectPath, breakpointInfo, showProgressIndicator, embedded, isAgentPanelOpen,
            agentEditor.diagramCallbacks, isAgentType]
    );

    const diagramProps = isAgentType || isAgent ? agentFocusDiagramProps : memoizedDiagramProps;

    const agentTypeFormNode = (() => {
        if (!agentFormNodeRef.current || agentTypeFormMode !== "MODEL") {
            return agentFormNodeRef.current;
        }
        const node = cloneDeep(agentFormNodeRef.current);
        if (node.metadata?.description) {
            delete node.metadata.description;
        }
        return node;
    })();

    const agentTypePromptInjection = (() => {
        if (agentTypeFormMode !== "ALL") {
            return undefined;
        }
        const agent = (agentFormNodeRef.current?.metadata?.data as NodeMetadata | undefined)?.agentInfo?.systemPrompt;
        if (!agent || (!agent.role && !agent.instructions)) {
            return undefined;
        }
        return [{ component: <AgentPromptDisplay role={agent.role} instructions={agent.instructions} />, index: 0 }];
    })();

    const agentPanelTitle: string | undefined = (() => {
        if (showConnectionPanel) {
            return "Configure Model Provider Connection";
        }
        if (agentPanel === "FORM") {
            return isAgentType
                ? agentTypeFormMode === "MODEL" ? "Configure Model Provider" : "Configure Agent"
                : "Edit Agent";
        }
        return agentEditor.view !== "NONE" ? getAgentEditorPanelTitle(agentEditor) : undefined;
    })();

    const agentPanelOnBack: (() => void) | undefined = (() => {
        if (showConnectionPanel) {
            if (connectionView === SidePanelView.CONNECTION_SELECT) {
                return () => setConnectionView(SidePanelView.CONNECTION_CONFIG);
            }
            if (connectionView === SidePanelView.CONNECTION_CREATE) {
                return () => setConnectionView(SidePanelView.CONNECTION_SELECT);
            }
            return undefined;
        }
        if (agentPanel === "FORM") {
            return undefined;
        }
        const backViews: AgentEditorView[] =
            ["NEW_TOOL_CUSTOM", "NEW_TOOL_CONNECTION", "NEW_TOOL_FUNCTION", "ADD_MCP", "NEW_TOOL_AGENT_FORM"];
        return backViews.includes(agentEditor.view) ? agentEditor.back : undefined;
    })();

    const renderAgentPanelContent = () => {
        if (showConnectionPanel) {
            if (!selectedNodeRef.current) {
                return null;
            }
            return (
                <>
                    {connectionView === SidePanelView.CONNECTION_CONFIG && (
                        <ConnectionConfig
                            fileName={filePath}
                            connectionKind={selectedConnectionKind}
                            selectedNode={selectedNodeRef.current}
                            onSave={handleUpdateNodeWithConnection}
                            onNavigateToSelectionList={handleNavigateToSelectionList}
                        />
                    )}
                    {connectionView === SidePanelView.CONNECTION_SELECT && (
                        <ConnectionSelectionList
                            connectionKind={selectedConnectionKind}
                            selectedNode={selectedNodeRef.current}
                            onSelect={handleSelectConnection}
                        />
                    )}
                    {connectionView === SidePanelView.CONNECTION_CREATE && (
                        <ConnectionCreator
                            connectionKind={selectedConnectionKind}
                            nodeFormTemplate={nodeTemplateRef.current}
                            selectedNode={selectedNodeRef.current}
                            onSave={handleUpdateNodeWithConnection}
                        />
                    )}
                </>
            );
        }
        if (agentPanel === "FORM") {
            if (isAgent && agentFormNodeRef.current) {
                return (
                    <FlowNodeForm
                        key={agentFormKey}
                        fileName={model?.fileName || ""}
                        node={agentFormNodeRef.current}
                        nodeFormTemplate={agentFormNodeRef.current}
                        targetLineRange={agentFormNodeRef.current.codedata?.lineRange as any}
                        projectPath={projectPath}
                        editForm={true}
                        onSubmit={handleSubmitAgentForm}
                        submitText={showProgressIndicator ? "Saving..." : "Save"}
                        showProgressIndicator={showProgressIndicator}
                        disableSaveButton={showProgressIndicator}
                        fieldOverrides={{ model: { hidden: true }, type: { hidden: true } }}
                    />
                );
            }
            if (isAgentType && agentFormNodeRef.current) {
                return (
                    <FlowNodeForm
                        key={agentFormKey}
                        fileName={model?.fileName || ""}
                        node={agentTypeFormNode}
                        nodeFormTemplate={agentTypeFormNode}
                        targetLineRange={agentFormNodeRef.current.codedata?.lineRange as any}
                        projectPath={projectPath}
                        editForm={true}
                        onSubmit={handleSubmitAgentForm}
                        submitText={showProgressIndicator ? "Saving..." : "Save"}
                        showProgressIndicator={showProgressIndicator}
                        disableSaveButton={showProgressIndicator}
                        fieldOverrides={buildAgentTypeFieldOverrides(agentFormNodeRef.current, agentTypeFormMode)}
                        injectedComponents={agentTypePromptInjection}
                        hideInfoBanner={Boolean(agentTypePromptInjection)}
                        onConnectionCreated={() => { suppressAgentTypeReloadRef.current = true; }}
                    />
                );
            }
            return null;
        }
        return agentEditor.view !== "NONE" ? <AgentEditorPanelContent controller={agentEditor} /> : null;
    };

    return (
        <PanelOverlayProvider>
            <View>
                {(showProgressIndicator) && model && (
                    <ProgressIndicator color={ThemeColors.PRIMARY} />
                )}
                <Container embedded={embedded}>
                    {!model && (
                        <SpinnerContainer>
                            <ProgressRing color={ThemeColors.PRIMARY} />
                        </SpinnerContainer>
                    )}
                    {model && <MemoizedDiagram {...diagramProps} />}
                </Container>
            </View>

            {isAgentPanelOpen && (
                <PanelContainer
                    title={agentPanelTitle}
                    show={true}
                    onClose={showConnectionPanel ? handleCloseConnectionPanel
                        : agentPanel !== "NONE" ? handleCloseAgentPanel : () => agentEditor.close()}
                    onBack={agentPanelOnBack}
                >
                    {renderAgentPanelContent()}
                </PanelContainer>
            )}
            <PanelOverlayRenderer />
        </PanelOverlayProvider>
    );
}
