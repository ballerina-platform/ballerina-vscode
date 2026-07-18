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

import React, { useEffect, useRef, useState } from "react";
import { STNode } from "@wso2/syntax-tree";
import { Button, Icon, Switch, View, ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import { BIFlowDiagram } from "../FlowDiagram";
import { BISequenceDiagram } from "../SequenceDiagram";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { CodeData, DIRECTORY_MAP, EVENT_TYPE, FOCUS_FLOW_DIAGRAM_VIEW, FocusFlowDiagramView, FunctionModel, isSamePath, LineRange, ParentMetadata, ProjectStructureArtifactResponse, Protocol, SHARED_COMMANDS } from "@wso2/ballerina-core";
import { VisualizerLocation, NodePosition } from "@wso2/ballerina-core";
import { MACHINE_VIEW } from "@wso2/ballerina-core";
import styled from "@emotion/styled";
import { BIFocusFlowDiagram } from "../FocusFlowDiagram";
import { getColorByMethod } from "../ServiceDesigner/components/ResourceAccordion";
import { SwitchSkeleton, TitleBarSkeleton } from "../../../components/Skeletons";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { ResourceForm } from "../ServiceDesigner/Forms/ResourceForm";
import { AddServiceElementDropdown, DropdownOptionProps } from "../ServiceDesigner/components/AddServiceElementDropdown";
import { removeForwardSlashes } from "../ServiceDesigner/utils";
import { getTryItAIDefaultPromptResource, getTryItDropdownOptions, TryItOptionValue, TryItQuickPickItem } from "../shared/tryIt";

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const TRACING_LABEL_BREAKPOINT = 600;

const SubTitleWrapper = styled.div`
    display: flex;
    align-items: center;
    align-self: center;
    justify-content: flex-start;
    gap: 12px;
    width: 100%;
`;

const LeftElementsWrapper = styled.div`
    display: flex;
    align-items: baseline;
    gap: 12px;
`;

const AccessorType = styled.span<{ color?: string }>`
    background-color: ${(props: { color: any; }) => props.color};
    color: ${ThemeColors.ON_SURFACE};
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    text-transform: uppercase;
    font-family: "GilmerBold";
    color: #FFF;
    padding: 4px 8px;
    border-radius: 4px;
    min-width: 60px;
    text-align: center;
    align-items: center;
    font-weight: bold;
`;

const Path = styled.span`
    color: ${ThemeColors.ON_SURFACE};
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    max-width: 250px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.3;
`;

function servicePositionWithinArtifact(artifactPos: NodePosition | undefined, svcPos: NodePosition | undefined): boolean {
    if (!artifactPos || !svcPos) {
        return false;
    }
    const oStart = artifactPos.startLine ?? 0;
    const oEnd = artifactPos.endLine ?? oStart;
    const iStart = svcPos.startLine ?? 0;
    const iEnd = svcPos.endLine ?? iStart;
    if (iStart < oStart || iEnd > oEnd) {
        return false;
    }
    if (iStart === oStart && (svcPos.startColumn ?? 0) < (artifactPos.startColumn ?? 0)) {
        return false;
    }
    if (iEnd === oEnd && (svcPos.endColumn ?? 0) > (artifactPos.endColumn ?? 0)) {
        return false;
    }
    return true;
}


export interface DiagramWrapperProps {
    projectPath: string;
    filePath?: string;
    view?: FocusFlowDiagramView;
    breakpointState?: number;
    syntaxTree?: STNode;
}

export function DiagramWrapper(param: DiagramWrapperProps) {
    const { projectPath, filePath, view, breakpointState, syntaxTree } = param;
    const { rpcClient } = useRpcContext();

    const [showSequenceDiagram, setShowSequenceDiagram] = useState(false);
    const [enableSequenceDiagram, setEnableSequenceDiagram] = useState(false);
    const [loadingDiagram, setLoadingDiagram] = useState(true);
    const [hasLoadedTitleBar, setHasLoadedTitleBar] = useState(false);
    const [fileName, setFileName] = useState("");
    const [serviceType, setServiceType] = useState("");
    const [serviceName, setServiceName] = useState("");
    const [agentName, setAgentName] = useState("");
    const [basePath, setBasePath] = useState("");
    const [listener, setListener] = useState("");
    const [parentMetadata, setParentMetadata] = useState<ParentMetadata>();
    const [currentPosition, setCurrentPosition] = useState<NodePosition>();
    const [parentCodedata, setParentCodedata] = useState<CodeData>();

    const [functionModel, setFunctionModel] = useState<FunctionModel>();
    const [resources, setResources] = useState<ProjectStructureArtifactResponse[]>([]);
    const [servicePosition, setServicePosition] = useState<NodePosition>();
    const [isSaving, setIsSaving] = useState(false);
    const [isTracingEnabled, setIsTracingEnabled] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [isNarrowViewport, setIsNarrowViewport] = useState(
        typeof window !== "undefined" && window.innerWidth < TRACING_LABEL_BREAKPOINT
    );
    const [selectedTryItOption, setSelectedTryItOption] = useState<TryItOptionValue>(TryItOptionValue.TRY_IT);
    const [isTryItInProgress, setIsTryItInProgress] = useState(false);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsNarrowViewport(window.innerWidth < TRACING_LABEL_BREAKPOINT);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        rpcClient.getVisualizerLocation().then((location) => {
            if (location.metadata?.enableSequenceDiagram) {
                setEnableSequenceDiagram(true);
            }
            if (location.identifier) {
                setAgentName(location.identifier);
            }

            rpcClient
                .getBIDiagramRpcClient()
                .getEnclosedFunction({
                    filePath: location.documentUri,
                    position: {
                        line: location?.position?.startLine,
                        offset: location?.position?.startColumn,
                    },
                    findClass: true,
                })
                .then((serviceLocation) => {
                    if (serviceLocation) {
                        rpcClient
                            .getServiceDesignerRpcClient()
                            .getServiceModelFromCode({
                                filePath: serviceLocation.filePath,
                                codedata: {
                                    lineRange: {
                                        startLine: {
                                            line: serviceLocation?.startLine.line,
                                            offset: serviceLocation?.startLine.offset,
                                        },
                                        endLine: {
                                            line: serviceLocation?.endLine.line,
                                            offset: serviceLocation?.endLine.offset,
                                        },
                                    },
                                },
                            })
                            .then((serviceModel) => {
                                setServicePosition({
                                    startLine: serviceModel.service?.codedata.lineRange.startLine.line,
                                    startColumn: serviceModel.service?.codedata.lineRange.startLine.offset,
                                    endLine: serviceModel.service?.codedata.lineRange.endLine.line,
                                    endColumn: serviceModel.service?.codedata.lineRange.endLine.offset,
                                });
                                setServiceType(serviceModel.service?.type);
                                setServiceName(serviceModel.service?.name ?? "");
                                setBasePath(serviceModel.service?.properties?.basePath?.value?.trim());
                                setListener(serviceModel.service?.properties?.listener?.value?.trim());
                            });
                    }
                });
        });
    }, [rpcClient]);

    // Load persisted preferred Try It option on mount (if set)
    useEffect(() => {
        (async () => {
            try {
                const preferred = await rpcClient.getCommonRpcClient().getPreferredTryItOption();

                if (!isMountedRef.current) return;

                if (
                    preferred === TryItOptionValue.TRY_IT ||
                    preferred === TryItOptionValue.TRY_IT_WITH_AI
                ) {
                    setSelectedTryItOption(preferred as TryItOptionValue);
                }
            } catch (e) {
                // ignore
            }
        })();
    }, [rpcClient]);


    useEffect(() => {
        checkTracingStatus();
    }, []);

    // Re-query on every change so the button reflects this project's file,
    // not whatever project triggered the broadcast.
    useEffect(() => {
        rpcClient.getAgentChatRpcClient().onTracingStatusChanged(() => {
            checkTracingStatus();
        });
    }, [rpcClient]);

    const checkTracingStatus = async () => {
        try {
            const status = await rpcClient.getAgentChatRpcClient().getTracingStatus({ projectPath });
            setIsTracingEnabled(status.enabled);
        } catch (error) {
            setIsTracingEnabled(false);
        }
    };

    const handleToggleTracing = async () => {
        if (isToggling) {
            return;
        }

        setIsToggling(true);
        try {
            const command = isTracingEnabled ? "ballerina.disableTracing" : "ballerina.enableTracing";
            await rpcClient.getCommonRpcClient().executeCommand({ commands: [command] });
            await checkTracingStatus();
        } catch (error) {
            console.error("Failed to toggle tracing:", error);
            throw error;
        } finally {
            setIsToggling(false);
        }
    };

    const handleFunctionClose = () => {
        setFunctionModel(undefined);
    };

    const handleToggleDiagram = () => {
        setShowSequenceDiagram(!showSequenceDiagram);
    };

    const handleUpdateDiagram = () => {
        setLoadingDiagram(true);
    };

    const handleReadyDiagram = (fileName?: string, parentMetadata?: ParentMetadata, position?: NodePosition, parentCodedata?: CodeData) => {
        setLoadingDiagram(false);
        setHasLoadedTitleBar(true);
        if (fileName) {
            setFileName(fileName);
        }
        if (parentMetadata) {
            setParentMetadata(parentMetadata);
        }
        if (position) {
            setCurrentPosition(position);
        }
        if (parentCodedata) {
            setParentCodedata(parentCodedata);
        }
    };

    const getFunctionModel = async () => {
        const visualizerLocation = await rpcClient.getVisualizerLocation();
        const location = visualizerLocation.position;
        const codeData: CodeData = {
            lineRange: {
                fileName: filePath,
                startLine: { line: location.startLine, offset: location.startColumn },
                endLine: { line: location.endLine, offset: location.endColumn },
            }
        }
        const functionModel = await rpcClient.getServiceDesignerRpcClient().getFunctionFromSource({ filePath: filePath, codedata: codeData });
        const projectStructure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
        const project = projectStructure.projects.find(project => isSamePath(project.projectPath, visualizerLocation.projectPath));
        const services = project?.directoryMap[DIRECTORY_MAP.SERVICE] || [];
        const selectedService = services.find(
            service => service.path === filePath && servicePositionWithinArtifact(service.position, servicePosition)
        ) || services.find(service => service.name === serviceName);
        setResources(selectedService?.resources || []);
        setFunctionModel(functionModel.function);
    }

    const handleResourceSubmit = async (value: FunctionModel) => {
        setIsSaving(true);
        handleUpdateDiagram();
        const lineRange: LineRange = {
            startLine: { line: servicePosition.startLine, offset: servicePosition.startColumn },
            endLine: { line: servicePosition.endLine, offset: servicePosition.endColumn },
        };
        let res = undefined;
        res = await rpcClient
            .getServiceDesignerRpcClient()
            .updateResourceSourceCode({ filePath, codedata: { lineRange }, function: value });
        /**
         * Update the artifact identifier to the current updated resource 
         * Resource identifier pattern --> METHOD#PATH --> 'get#foo' OR METHOD#WITH_PARAMS ---> 'post#bar/[string car]]'
         */
        const accessor = value.accessor.value;
        const path = value.name.value;
        const resourceIdentifier = `${accessor}#${path}`;
        await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.UPDATE_PROJECT_LOCATION, location: { identifier: resourceIdentifier } });

        setIsSaving(false);
        setFunctionModel(undefined);
    };

    const handleEdit = (fileUri?: string, position?: NodePosition) => {
        const isTestFunction = parentCodedata?.sourceCode.includes("@test:Config");
        const isAIEvaluation = isTestFunction && parentCodedata?.sourceCode.includes('"evaluations"');

        if (isAIEvaluation) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIAIEvaluationForm,
                    identifier: parentMetadata?.label || "",
                    documentUri: fileUri,
                    serviceType: 'UPDATE_TEST',
                }
            });
            return;
        }

        if (isTestFunction) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BITestFunctionForm,
                    identifier: parentMetadata?.label || "",
                    documentUri: fileUri,
                    serviceType: 'UPDATE_TEST',
                }
            });
            return;
        }

        if (isWorkflow) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIWorkflowForm,
                    identifier: parentMetadata?.label || "",
                    documentUri: fileUri,
                    position: position || currentPosition,
                }
            });
            return;
        }

        if (isActivity) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIActivityForm,
                    identifier: parentMetadata?.label || "",
                    documentUri: fileUri,
                    position: position || currentPosition,
                }
            });
            return;
        }

        const context: VisualizerLocation = {
            view:
                view === FOCUS_FLOW_DIAGRAM_VIEW.NP_FUNCTION
                    ? MACHINE_VIEW.BINPFunctionForm
                    : parentMetadata?.isServiceFunction ?
                        MACHINE_VIEW.ServiceFunctionForm : MACHINE_VIEW.BIFunctionForm,
            identifier: parentMetadata?.label || "",
            documentUri: fileUri,
            position: position || currentPosition
        };
        rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: context });
    };

    let isAutomation = parentMetadata?.kind === "Function" && parentMetadata?.label === "main";
    let isResource = parentMetadata?.kind === "Resource";
    let isRemote = parentMetadata?.kind === "Remote Function";
    let isAgent = parentMetadata?.kind === "AI Chat Agent" && parentMetadata?.label === "chat";
    let isInitFunction = parentMetadata?.kind === "Function" && parentMetadata?.label === "init";
    let isWorkflow = parentMetadata?.kind === "Workflow";
    let isActivity = parentMetadata?.kind === "Activity";
    let isNPFunction = view === FOCUS_FLOW_DIAGRAM_VIEW.NP_FUNCTION;
    let isAgentFocus = view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT || view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT_TYPE;

    const handleAgentFocusChat = () => {
        if (!agentName || !filePath) {
            console.error("Cannot start inline agent chat: missing agent variable name or file path");
            return;
        }
        rpcClient.getBIDiagramRpcClient().startInlineAgentChat({
            agentVarName: agentName,
            filePath,
        });
    };

    const handleResourceTryIt = async (methodValue: string, pathValue: string) => {
        if (serviceType !== "http") { return; }

        await rpcClient.getCommonRpcClient().executeCommand({
            commands: ["ballerina.tryIt", false, { methodValue, pathValue }, { basePath, listener }]
        });
    };

    const handleResourceTryItWithAI = async () => {
        if (serviceType !== "http") { return; }
        const methodValue = parentMetadata?.accessor || "GET";
        const pathValue = removeForwardSlashes(parentMetadata?.label || "/");
        const serviceName = basePath?.replace(/^\//, "") || "Service";
        const prompt = getTryItAIDefaultPromptResource(methodValue, pathValue, serviceName, basePath);

        await rpcClient.getCommonRpcClient().executeCommand({
            commands: [SHARED_COMMANDS.OPEN_AI_PANEL, prompt]
        });
    };

    const handleTryItDropdownOption = async (option: string) => {
        if (isTryItInProgress) {
            return;
        }

        const selectedOption = option as TryItOptionValue;
        if (isMountedRef.current) {
            setSelectedTryItOption(selectedOption);
            setIsTryItInProgress(true);
        }
        rpcClient.getCommonRpcClient().setPreferredTryItOption(selectedOption).catch((error: unknown) => {
            console.error("Error saving preferred Try It option:", error);
        });

        try {
            switch (selectedOption) {
                case TryItOptionValue.TRY_IT:
                    await handleResourceTryIt(parentMetadata?.accessor || "", parentMetadata?.label || "");
                    break;
                case TryItOptionValue.TRY_IT_WITH_AI:
                    await handleResourceTryItWithAI();
                    break;
            }
        } catch (error) {
            console.error("Error handling Try It option:", error);
        } finally {
            if (isMountedRef.current) {
                setIsTryItInProgress(false);
            }
        }
    };

    const handleTryItPrimaryAction = async () => {
        if (isTryItInProgress) {
            return;
        }

        if (isMountedRef.current) {
            setIsTryItInProgress(true);
        }

        let optionToRun = selectedTryItOption;
        try {
            const preferredOption = await rpcClient.getCommonRpcClient().getPreferredTryItOption();
            if (preferredOption === TryItOptionValue.TRY_IT || preferredOption === TryItOptionValue.TRY_IT_WITH_AI) {
                optionToRun = preferredOption;
                if (isMountedRef.current) {
                    setSelectedTryItOption(optionToRun);
                }
            } else {
                const tryItOptions = getTryItDropdownOptions("resource").map(option => ({
                    label: option.title,
                    description: `(${option.description})`,
                    value: option.value
                }));
                const selected: TryItQuickPickItem = await rpcClient.getCommonRpcClient().showQuickPick({
                    items: tryItOptions,
                    options: { title: "Choose how you want to try out your resource", placeHolder: "Select an option" }
                }) as TryItQuickPickItem;

                if (!selected) {
                    return;
                }
                optionToRun = selected.value;
                if (isMountedRef.current) {
                    setSelectedTryItOption(optionToRun);
                }
                await rpcClient.getCommonRpcClient().setPreferredTryItOption(optionToRun);
            }

            switch (optionToRun) {
                case TryItOptionValue.TRY_IT:
                    await handleResourceTryIt(parentMetadata?.accessor || "", parentMetadata?.label || "");
                    break;
                case TryItOptionValue.TRY_IT_WITH_AI:
                    await handleResourceTryItWithAI();
                    break;
            }
        } catch (error) {
            console.error("Error handling Try It first-time flow:", error);
        } finally {
            if (isMountedRef.current) {
                setIsTryItInProgress(false);
            }
        }
    };

    const tryItDropdownOptions: DropdownOptionProps[] = getTryItDropdownOptions("resource");
    const activeTryItOption =
        tryItDropdownOptions.find((option) => option.value === selectedTryItOption) ?? tryItDropdownOptions[0];

    // HACK: This need to be fixed from getFlowModel API 
    const getWorkflowTitleFromSource = () => {
        if (parentMetadata?.kind !== "Function" || !parentMetadata?.sourceCode) {
            return undefined;
        }

        const normalizedSource = parentMetadata.sourceCode.trimStart();
        if (normalizedSource.startsWith("@workflow:Activity")) {
            return "Workflow Activity";
        }
        if (normalizedSource.startsWith("@workflow:Process")) {
            return "Workflow";
        }
        return undefined;
    };

    // Calculate title based on conditions
    const getTitle = () => {
        if (view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT) return agentName || "AI Agent";
        if (view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT_TYPE) return agentName || "AI Agent";
        if (isNPFunction) return "Natural Function";
        if (isAutomation) return "Automation";
        const workflowTitle = getWorkflowTitleFromSource();
        if (workflowTitle) return workflowTitle;
        if (parentCodedata?.sourceCode.includes("@ai:AgentTool")) return "Agent Tool";
        if ((parentCodedata?.sourceCode.includes("@test:Config")) && parentCodedata?.sourceCode.includes("\"evaluations\"")) return "AI Evaluation";
        if (parentCodedata?.sourceCode.includes("@test:Config")) return "Test";
        return parentMetadata?.kind || "";
    };

    // Calculate subtitle element based on conditions
    const getSubtitleElement = getTitleBarSubEl(
        parentMetadata?.label || "",
        parentMetadata?.accessor || "",
        isResource,
        isAutomation
    );

    // Calculate actions based on conditions
    const getActions = () => {
        const tracingButton = (
            <ActionButton
                appearance={isTracingEnabled ? "primary" : "secondary"}
                onClick={handleToggleTracing}
                disabled={isToggling}
                tooltip={isTracingEnabled ? "Tracing is on. Click to disable." : "Tracing is off. Click to enable."}
            >
                <Icon
                    name={isTracingEnabled ? "telescope" : "circle-slash"}
                    isCodicon={true}
                    sx={{ marginRight: 5, width: 16, height: 16, fontSize: 14 }}
                />
                {isNarrowViewport ? "Tracing" : isTracingEnabled ? "Tracing: On" : "Tracing: Off"}
            </ActionButton>
        );

        if (isAgent) {
            return (
                <>
                    {tracingButton}
                    <ActionButton
                        appearance="secondary"
                        onClick={() => {
                            rpcClient.getCommonRpcClient().executeCommand({
                                commands: ["ballerina.tryIt", false, undefined, { basePath, listener }]
                            });
                        }}
                    >
                        <Icon
                            name="comment-discussion"
                            isCodicon={true}
                            sx={{ marginRight: 5, width: 16, height: 16, fontSize: 14 }}
                        />
                        Chat
                    </ActionButton>
                </>
            );
        }

        if (isAgentFocus) {
            return (
                <ActionButton
                    appearance="secondary"
                    onClick={handleAgentFocusChat}
                    tooltip="Generate a chat service for this agent"
                >
                    <Icon
                        name="comment-discussion"
                        isCodicon={true}
                        sx={{ marginRight: 5, width: 16, height: 16, fontSize: 14 }}
                    />
                    Chat
                </ActionButton>
            );
        }

        if (isResource && serviceType === "http") {
            return (
                <>
                    <ActionButton id="bi-edit" appearance="secondary" onClick={() => getFunctionModel()}>
                        <Icon
                            name="bi-settings"
                            sx={{
                                marginRight: 5,
                                fontSize: "16px",
                                width: "16px",
                            }}
                        />
                        Configure
                    </ActionButton >
                    <AddServiceElementDropdown
                        buttonTitle={activeTryItOption?.title || "Try It"}
                        toolTip="Try Resource"
                        defaultOption={selectedTryItOption}
                        onPrimaryAction={handleTryItPrimaryAction}
                        buttonIconName={isTryItInProgress ? "loading" : activeTryItOption?.iconName}
                        buttonIconIsCodicon={isTryItInProgress ? true : activeTryItOption?.iconIsCodicon}
                        showButtonSpinner={isTryItInProgress}
                        onOptionChange={handleTryItDropdownOption}
                        options={tryItDropdownOptions}
                    />
                </>
            );
        }

        if (parentMetadata && !isResource && !isRemote && !isInitFunction) {
            return (
                <ActionButton id="bi-edit" appearance="secondary" onClick={() => handleEdit(fileName, currentPosition)}>
                    <Icon
                        name="bi-settings"
                        sx={{
                            marginRight: 5,
                            fontSize: "16px",
                            width: "16px",
                        }}
                    /> Configure
                </ActionButton>
            );
        }

        return null;
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            {loadingDiagram && !hasLoadedTitleBar ? (
                <TitleBarSkeleton />
            ) : (
                <TitleBar
                    title={getTitle()}
                    {...(view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT || view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT_TYPE
                        ? { subtitle: "AI Agent" }
                        : { subtitleElement: getSubtitleElement })}
                    actions={getActions()}
                />
            )}
            {enableSequenceDiagram && !isAgent && !view &&
                (
                    !loadingDiagram ? (
                        <Switch
                            leftLabel="Flow"
                            rightLabel="Sequence"
                            checked={showSequenceDiagram}
                            checkedColor="var(--vscode-button-background)"
                            enableTransition={true}
                            onChange={handleToggleDiagram}
                            sx={{
                                width: "250px",
                                margin: "auto",
                                position: "fixed",
                                top: "120px",
                                right: "16px",
                                zIndex: "3",
                                border: "unset",
                            }}
                            disabled={loadingDiagram}
                        />
                    ) : (
                        <SwitchSkeleton
                            checked={showSequenceDiagram}
                            sx={{
                                width: "250px",
                                margin: "auto",
                                position: "fixed",
                                top: "120px",
                                right: "16px",
                                zIndex: "3",
                                border: "unset",
                            }}
                        />
                    )
                )
            }
            {
                showSequenceDiagram ? (
                    <BISequenceDiagram onUpdate={handleUpdateDiagram} onReady={handleReadyDiagram} />
                ) : view ? (
                    <BIFocusFlowDiagram
                        projectPath={projectPath}
                        filePath={filePath}
                        view={view}
                        onUpdate={handleUpdateDiagram}
                        onReady={handleReadyDiagram}
                    />
                ) : (
                    <BIFlowDiagram
                        syntaxTree={syntaxTree}
                        breakpointState={breakpointState}
                        projectPath={projectPath}
                        onUpdate={handleUpdateDiagram}
                        onReady={handleReadyDiagram}
                    />
                )
            }
            {/* This is for editing a http resource */}
            <PanelContainer
                title={"Resource Configuration"}
                show={!!(isResource && functionModel?.kind === "RESOURCE")}
                onClose={handleFunctionClose}
                width={400}
                overlay={true}
            >
                {functionModel && (
                    <ResourceForm
                        model={functionModel}
                        isSaving={isSaving}
                        isNew={false}
                        filePath={filePath}
                        onSave={handleResourceSubmit}
                        onClose={handleFunctionClose}
                        existingResources={resources}
                        payloadContext={{
                            protocol: Protocol.HTTP,
                            serviceName: serviceName ?? "",
                            serviceBasePath: basePath ?? "",
                        }}
                    />
                )}
            </PanelContainer>
        </View >
    );
}

export default DiagramWrapper;

export function getTitleBarSubEl(label: string, accessor: string, isResource: boolean, isAutomation: boolean): React.ReactNode {
    return (
        <SubTitleWrapper>
            <LeftElementsWrapper>
                {isResource && (
                    <AccessorType color={getColorByMethod(accessor || "")}>
                        {accessor || ""}
                    </AccessorType>
                )}
                {!isAutomation && <Path>{removeForwardSlashes(label || "")}</Path>}
            </LeftElementsWrapper>
        </SubTitleWrapper>
    );
}
