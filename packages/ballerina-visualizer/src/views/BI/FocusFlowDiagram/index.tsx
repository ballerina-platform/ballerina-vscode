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

import { debounce } from "lodash";
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
    NodePosition
} from "@wso2/ballerina-core";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { ConnectionConfig, ConnectionCreator, ConnectionSelectionList } from "../../../components/ConnectionSelector";

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
import { createPromptHelperPane } from "./utils";


const Container = styled.div`
    width: 100%;
    height: calc(100vh - 50px);
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
    onUpdate: () => void;
    onReady: (fileName: string, parentMetadata?: ParentMetadata, position?: NodePosition) => void;
}

export function BIFocusFlowDiagram(props: BIFocusFlowDiagramProps) {
    const { projectPath, filePath, onUpdate, onReady } = props;
    const { rpcClient } = useRpcContext();

    const [model, setModel] = useState<Flow>();
    const [suggestedModel, setSuggestedModel] = useState<Flow>();
    const [showProgressIndicator, setShowProgressIndicator] = useState(false);
    const [breakpointInfo, setBreakpointInfo] = useState<BreakpointInfo>();
    const [showConnectionPanel, setShowConnectionPanel] = useState(false);
    const [selectedConnectionKind, setSelectedConnectionKind] = useState<ConnectionKind>();
    const [connectionView, setConnectionView] = useState<SidePanelView.CONNECTION_CONFIG | SidePanelView.CONNECTION_SELECT | SidePanelView.CONNECTION_CREATE>();
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

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
        debouncedGetFlowModel();
    }, []);

    useEffect(() => {
        rpcClient.onProjectContentUpdated((state: boolean) => {
            console.log(">>> on project content updated", state);
            fetchNodes(topNodeRef.current, targetRef.current, true);
        });
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            console.log(">>> on parent popup submitted", parent);
            const toNode = topNodeRef.current;
            const target = targetRef.current;
            fetchNodes(toNode, target, false);
        });
    }, [rpcClient]);

    const debouncedGetFlowModel = useCallback(
        debounce(() => {
            getFlowModel();
        }, 1000),
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
            // if node doesn't have properties. don't show edit form
            if (!response.flowNode.properties && !nodesWithCustomForms.includes(response.flowNode.codedata.node)) {
                console.log(">>> Node doesn't have properties. Don't show edit form", response.flowNode);
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
        getFlowModel();
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

    return (
        <>
            <View>
                {(showProgressIndicator) && model && (
                    <ProgressIndicator color={ThemeColors.PRIMARY} />
                )}
                <Container>
                    {!model && (
                        <SpinnerContainer>
                            <ProgressRing color={ThemeColors.PRIMARY} />
                        </SpinnerContainer>
                    )}
                    {model && <MemoizedDiagram {...memoizedDiagramProps} />}
                </Container>
            </View>

            {showConnectionPanel && selectedNodeRef.current && (
                <PanelContainer
                    title="Configure Model Provider Connection"
                    show={showConnectionPanel}
                    onClose={handleCloseConnectionPanel}
                    onBack={connectionView === SidePanelView.CONNECTION_SELECT ? () => setConnectionView(SidePanelView.CONNECTION_CONFIG) :
                        connectionView === SidePanelView.CONNECTION_CREATE ? () => setConnectionView(SidePanelView.CONNECTION_SELECT) :
                            undefined}
                >
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
                            expandedGroupId={expandedGroupId}
                            onExpandedGroupChange={setExpandedGroupId}
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
                </PanelContainer>
            )}
        </>
    );
}
