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

import React, { createRef, useCallback, useEffect, useRef, useState } from "react";
import {
    KeyboardNavigationManager,
    MachineStateValue,
    STModification,
    MACHINE_VIEW,
    PopupMachineStateValue,
    EVENT_TYPE,
    ParentPopupData,
    ProjectStructureArtifactResponse,
    DIRECTORY_MAP,
    CodeData,
    LinePosition,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { BiWsClientProvider } from "./views/BI/wsManager/WsClientContext";
import { Global, css } from "@emotion/react";
import { debounce } from "lodash";
import styled from "@emotion/styled";
import { LoadingRing } from "./components/Loader";
import { WebviewErrorState } from "./components/WebviewErrorState";
import { handleRedo, handleUndo } from "./utils/utils";
import { STKindChecker } from "@wso2/syntax-tree";
import { URI, Utils } from "vscode-uri";
import { CONNECTIONS_FILE } from "./constants";
import { ErrorBoundary, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { PanelType, useModalStack, useVisualizerContext } from "./Context";
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import Popup from "./components/Popup";

const globalStyles = css`
    *,
    *::before,
    *::after {
        box-sizing: border-box;
    }
    
    @keyframes fadeIn {
        0% { 
            opacity: 0;
        }
        100% { 
            opacity: 1;
        }
    }
    
    .loading-dots::after {
        content: '';
        animation: dots 1.5s infinite;
    }
    
    @keyframes dots {
        0%, 20% { content: ''; }
        40% { content: '.'; }
        60% { content: '..'; }
        80%, 100% { content: '...'; }
    }
`;

const ProgressRing = styled(VSCodeProgressRing)`
    height: 50px;
    width: 50px;
    margin: 1.5rem;
`;

const VisualizerContainer = styled.div`
    width: 100%;
    /* height: 100%; */
`;

const ComponentViewWrapper = styled.div`
    height: calc(100vh - 24px);
`;

const PopUpContainer = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2000;
`;

const LoadingViewContainer = styled.div`
    background-color: var(--vscode-editor-background);
    height: 100vh;
    width: 100%;
    display: flex;
    font-family: var(--vscode-font-family);
`;

const LoadingContent = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    height: 100%;
    width: 100%;
    padding-top: 30vh;
    text-align: center;
    max-width: 500px;
    margin: 0 auto;
    animation: fadeIn 1s ease-in-out;
`;

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: ${ThemeColors.SURFACE_CONTAINER};
    opacity: 0.4;
    z-index: 2099;
    pointer-events: auto;
`;

const LoadingTitle = styled.h1`
    color: var(--vscode-foreground);
    font-size: 1.5em;
    font-weight: 400;
    margin: 0;
    letter-spacing: -0.02em;
    line-height: normal;
`;

const LoadingSubtitle = styled.p`
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    margin: 0.5rem 0 2rem 0;
    opacity: 0.8;
`;

const LoadingText = styled.div`
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 500;
`;

const LazyConstructPanel = React.lazy(() =>
    import("./views/ConstructPanel").then((module) => ({ default: module.ConstructPanel }))
);
const LazyEditPanel = React.lazy(() =>
    import("./views/EditPanel").then((module) => ({ default: module.EditPanel }))
);
const LazyRecordEditor = React.lazy(() =>
    import("./views/RecordEditor/RecordEditor").then((module) => ({ default: module.RecordEditor }))
);
const LazyPopupPanel = React.lazy(() => import("./PopupPanel"));
const LazyConnectorList = React.lazy(() =>
    import("./views/Connectors/ConnectorWizard").then((module) => ({ default: module.ConnectorList }))
);
const LazyPopupMessage = React.lazy(() =>
    import("./views/BI/PopupMessage").then((module) => ({ default: module.PopupMessage }))
);
const LazyEndpointList = React.lazy(async () => {
    const [{ EndpointList }, { getSymbolInfo }] = await Promise.all([
        import("./views/Connectors/EndpointList"),
        import("@wso2/ballerina-low-code-diagram"),
    ]);

    return {
        default: ({ applyModifications }: { applyModifications: (modifications: STModification[], isRecordModification?: boolean) => Promise<void> }) => (
            <EndpointList stSymbolInfo={getSymbolInfo()} applyModifications={applyModifications} />
        ),
    };
});

const ConditionalPanelFallback = (): null => null;

const MainPanel = () => {
    const { rpcClient } = useRpcContext();
    const { sidePanel, setSidePanel, popupMessage, setPopupMessage, activePanel, showOverlay, setShowOverlay } = useVisualizerContext();
    const { modalStack, closeModal } = useModalStack()
    const errorBoundaryRef = createRef<any>();
    const [viewComponent, setViewComponent] = useState<React.ReactNode>();
    const [viewError, setViewError] = useState<string>();
    const [navActive, setNavActive] = useState<boolean>(true);
    const [showHome, setShowHome] = useState<boolean>(true);
    const [popupState, setPopupState] = useState<PopupMachineStateValue>("initialize");
    const [breakpointState, setBreakpointState] = useState<number>(0);
    const breakpointStateRef = useRef<number>(0);
    const navKeyRef = useRef<number>(0);
    const remountKeyRef = useRef<number>(0);
    const previousNavTargetRef = useRef<string | undefined>(undefined);


    const gitIssueUrl = "https://github.com/wso2/product-integrator/issues";

    const debounceFetchContext = useCallback(
        debounce(() => {
            fetchContext();
        }, 200), []
    );

    useEffect(() => {
        rpcClient?.onStateChanged((newState: MachineStateValue) => {
            if (typeof newState === "object" && "viewActive" in newState && newState.viewActive === "viewReady") {
                debounceFetchContext();
            }
        });

        rpcClient?.onPopupStateChanged((newState: PopupMachineStateValue) => {
            setPopupState(newState);
        });

        rpcClient?.onBreakpointChanges((state: boolean) => {
            console.log("Breakpoint changes - updating state");
            setBreakpointState(prev => {
                const newValue = prev + 1;
                breakpointStateRef.current = newValue;
                return newValue;
            });
        });
    }, [rpcClient]);

    // TODO: Need to refactor this function. use util apply modifications function
    const applyModifications = async (modifications: STModification[], isRecordModification?: boolean) => {
        const langServerRPCClient = rpcClient.getLangClientRpcClient();
        let filePath;
        let m: STModification[];
        if (isRecordModification) {
            filePath = (await rpcClient.getVisualizerLocation()).metadata?.recordFilePath;
            if (modifications.length === 1) {
                // Change the start position of the modification to the beginning of the file
                m = [
                    {
                        ...modifications[0],
                        startLine: 0,
                        startColumn: 0,
                        endLine: 0,
                        endColumn: 0,
                    },
                ];
            }
        } else {
            filePath = (await rpcClient.getVisualizerLocation()).documentUri;
            m = modifications;
        }
        const {
            parseSuccess,
            source: newSource,
            syntaxTree,
        } = await langServerRPCClient?.stModify({
            astModifications: m,
            documentIdentifier: {
                uri: URI.file(filePath).toString(),
            },
        });
        if (parseSuccess) {
            rpcClient.getVisualizerRpcClient().addToUndoStack({
                source: newSource,
                filePath,
            });
            await langServerRPCClient.updateFileContent({
                content: newSource,
                filePath,
            });
        }
    };

    const fetchContext = () => {
        navKeyRef.current += 1;
        const navKey = navKeyRef.current;
        setNavActive(true);
        setViewError(undefined);

        const handleViewLoadError = (error: unknown, message: string) => {
            console.error(message, error);
            setViewComponent(undefined);
            setViewError(message);
        };

        rpcClient.getVisualizerLocation().then(async (value) => {
            const isStaleNavigation = () => navKey !== navKeyRef.current;

            try {
                if (isStaleNavigation()) return;
                const navTarget = `${value?.view ?? ''}-${value?.identifier ?? ''}-${value?.documentUri ?? ''}-${value?.projectPath ?? ''}`;
                if (navTarget !== previousNavTargetRef.current) {
                    remountKeyRef.current += 1;
                    previousNavTargetRef.current = navTarget;
                }
                const remountKey = remountKeyRef.current;
                const getDefaultFunctionsFile = async () => {
                    if (value.documentUri) {
                        return value.documentUri;
                    }

                    return (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['functions.bal'] })).filePath;
                };

                const getConfigFilePath = async () =>
                    (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['config.bal'] })).filePath;

                const getTestsConfigTomlPath = async () => {
                    const testsFolderResult = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                        segments: ['tests'],
                        checkExists: true
                    });

                    if (!testsFolderResult.exists) {
                        return undefined;
                    }

                    return (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                        segments: ['tests', 'Config.toml']
                    })).filePath;
                };

                if (!value?.view) {
                    setViewComponent(<LoadingRing />);
                } else {
                    switch (value?.view) {
                        case MACHINE_VIEW.PackageOverview: {
                            const { PackageOverview } = await import("./views/BI/PackageOverview");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <PackageOverview
                                    projectPath={value.projectPath}
                                    isInDevant={value.isInDevant}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.WorkspaceOverview: {
                            const { WorkspaceOverview } = await import("./views/BI/WorkspaceOverview");
                            if (isStaleNavigation()) return;
                            setViewComponent(<WorkspaceOverview isInDevant={value.isInDevant} />);
                            break;
                        }
                        case MACHINE_VIEW.ServiceDesigner: {
                            const { ServiceDesigner } = await import("./views/BI/ServiceDesigner");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ServiceDesigner
                                    projectPath={value.projectPath}
                                    serviceIdentifier={value.identifier}
                                    filePath={value.documentUri}
                                    position={value?.position}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.AIAgentDesigner: {
                            const { AIAgentDesigner } = await import("./views/BI/AIChatAgent");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <AIAgentDesigner
                                    projectPath={value?.projectPath}
                                    filePath={value.documentUri}
                                    position={value?.position}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIDiagram:
                            const { default: DiagramWrapper } = await import("./views/BI/DiagramWrapper");
                            if (isStaleNavigation()) return;
                            rpcClient.getLangClientRpcClient().getSTByRange({
                                documentIdentifier: {
                                    uri: URI.file(value.documentUri).toString(),
                                },
                                lineRange: {
                                    start: {
                                        line: value?.position?.startLine,
                                        character: value?.position?.startColumn,
                                    },
                                    end: {
                                        line: value?.position?.endLine,
                                        character: value?.position?.endColumn,
                                    },
                                },
                            }).then((st) => {
                                if (isStaleNavigation()) return;
                                setViewComponent(
                                    <DiagramWrapper
                                        key={[value?.documentUri, value?.identifier].filter(Boolean).join('#')}
                                        syntaxTree={st.syntaxTree}
                                        projectPath={value?.projectPath}
                                        filePath={value?.documentUri}
                                        view={value?.focusFlowDiagramView}
                                        breakpointState={breakpointStateRef.current}
                                    />
                                );
                            }).catch((error) => {
                                console.error("Error fetching ST:", error);
                                if (isStaleNavigation()) return;
                                // Fallback to render without waiting
                                setViewComponent(
                                    <DiagramWrapper
                                        key={[value?.documentUri, value?.identifier].filter(Boolean).join('#')}
                                        projectPath={value?.projectPath}
                                        filePath={value?.documentUri}
                                        view={value?.focusFlowDiagramView}
                                        breakpointState={breakpointStateRef.current}
                                    />
                                );
                            });
                            break;
                        case MACHINE_VIEW.ERDiagram: {
                            const { ERDiagram } = await import("./views/ERDiagram");
                            if (isStaleNavigation()) return;
                            setViewComponent(<ERDiagram projectPath={value.projectPath} />);
                            break;
                        }
                        case MACHINE_VIEW.TypeDiagram: {
                            const { TypeDiagram } = await import("./views/TypeDiagram");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <TypeDiagram
                                    key={remountKey}
                                    selectedTypeId={value?.identifier}
                                    addType={value?.addType}
                                    projectPath={value?.projectPath}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.DataMapper: {
                            const { DataMapper } = await import("./views/DataMapper");
                            if (isStaleNavigation()) return;
                            let position: LinePosition = {
                                line: value?.position?.startLine,
                                offset: value?.position?.startColumn
                            };
                            if (STKindChecker.isFunctionDefinition(value?.syntaxTree) &&
                                STKindChecker.isExpressionFunctionBody(value?.syntaxTree.functionBody)
                            ) {
                                position = {
                                    line: value?.syntaxTree.functionBody.expression.position.startLine,
                                    offset: value?.syntaxTree.functionBody.expression.position.startColumn
                                };
                            }
                            setViewComponent(
                                <DataMapper
                                    key={value?.dataMapperMetadata?.name}
                                    filePath={value.documentUri}
                                    codedata={value?.dataMapperMetadata?.codeData}
                                    name={value?.dataMapperMetadata?.name}
                                    projectPath={value.projectPath}
                                    position={position}
                                    reusable
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.InlineDataMapper: {
                            const { DataMapper } = await import("./views/DataMapper");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <DataMapper
                                    projectPath={value.projectPath}
                                    filePath={value.documentUri}
                                    codedata={value?.dataMapperMetadata?.codeData}
                                    name={value?.dataMapperMetadata?.name}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIDataMapperForm: {
                            const { FunctionForm } = await import("./views/BI/FunctionForm");
                            const defaultFunctionsFile = await getDefaultFunctionsFile();
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <FunctionForm
                                    key={remountKey}
                                    projectPath={value.projectPath}
                                    filePath={defaultFunctionsFile}
                                    functionName={value?.identifier}
                                    isDataMapper={true}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BINPFunctionForm: {
                            const { FunctionForm } = await import("./views/BI/FunctionForm");
                            const defaultFunctionsFile = await getDefaultFunctionsFile();
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <FunctionForm
                                    projectPath={value.projectPath}
                                    filePath={defaultFunctionsFile}
                                    functionName={value?.identifier}
                                    isDataMapper={false}
                                    isNpFunction={true}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.GraphQLDiagram:
                            const { GraphQLDiagram } = await import("./views/GraphQLDiagram");
                            if (isStaleNavigation()) return;
                            const projectStructure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
                            if (isStaleNavigation()) return;
                            const project = projectStructure.projects.find(project => isSamePath(project.projectPath, value.projectPath));
                            const services = project?.directoryMap?.[DIRECTORY_MAP.SERVICE] as ProjectStructureArtifactResponse[] | undefined;
                            const entryPoint = services?.find((service: ProjectStructureArtifactResponse) => service.name === value?.identifier);
                            setViewComponent(
                                <GraphQLDiagram
                                    projectPath={value.projectPath}
                                    serviceIdentifier={value?.identifier}
                                    filePath={value?.documentUri}
                                    position={entryPoint?.position ?? value?.position}
                                />);
                            break;
                        case MACHINE_VIEW.BallerinaUpdateView: {
                            const { BallerinaUpdateView } = await import("./views/BI/BallerinaUpdateView");
                            if (isStaleNavigation()) return;
                            setNavActive(false);
                            setViewComponent(<BallerinaUpdateView />);
                            break;
                        }
                        case MACHINE_VIEW.BIWelcome: {
                            const { WelcomeView } = await import("./views/BI/WelcomeView");
                            if (isStaleNavigation()) return;
                            setNavActive(false);
                            setViewComponent(<WelcomeView isBISupported={value.metadata.isBISupported} />);
                            break;
                        }
                        case MACHINE_VIEW.BISamplesView: {
                            const { SamplesView } = await import("./views/BI/SamplesView");
                            if (isStaleNavigation()) return;
                            setNavActive(false);
                            setViewComponent(<SamplesView />);
                            break;
                        }
                        case MACHINE_VIEW.SetupView: {
                            const { SetupView } = await import("./views/BI/SetupView");
                            if (isStaleNavigation()) return;
                            setNavActive(false);
                            setViewComponent(<SetupView haveLS={value.metadata.haveLS} />);
                            break;
                        }
                        case MACHINE_VIEW.BIProjectForm: {
                            const { ProjectForm } = await import("./views/BI/ProjectForm");
                            if (isStaleNavigation()) return;
                            setShowHome(false);
                            setViewComponent(<ProjectForm />);
                            break;
                        }
                        case MACHINE_VIEW.BIImportIntegration: {
                            const { ImportIntegration } = await import("./views/BI/ImportIntegration");
                            if (isStaleNavigation()) return;
                            setShowHome(false);
                            setViewComponent(
                                <BiWsClientProvider
                                    onBack={() =>
                                        rpcClient.getVisualizerRpcClient().openView({
                                            type: EVENT_TYPE.OPEN_VIEW,
                                            location: { view: MACHINE_VIEW.BIWelcome },
                                        })
                                    }
                                >
                                    <ImportIntegration />
                                </BiWsClientProvider>
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIAddProjectForm: {
                            const { AddProjectForm } = await import("./views/BI/ProjectForm/AddProjectForm");
                            if (isStaleNavigation()) return;
                            setShowHome(false);
                            setViewComponent(<AddProjectForm />);
                            break;
                        }
                        case MACHINE_VIEW.BIComponentView: {
                            const { ComponentListView } = await import("./views/BI/ComponentListView");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ComponentListView
                                    projectPath={value?.projectPath}
                                    scope={value.scope}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.AIChatAgentWizard: {
                            const { AIChatAgentWizard } = await import("./views/BI/AIChatAgent/AIChatAgentWizard");
                            if (isStaleNavigation()) return;
                            setViewComponent(<AIChatAgentWizard />);
                            break;
                        }
                        case MACHINE_VIEW.BIServiceWizard: {
                            const { ServiceCreationView } = await import("./views/BI/ServiceDesigner/ServiceCreationView");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ServiceCreationView
                                    projectPath={value.projectPath}
                                    orgName={value?.artifactInfo.org}
                                    packageName={value?.artifactInfo.packageName}
                                    moduleName={value?.artifactInfo.moduleName}
                                    version={value?.artifactInfo.version}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIServiceClassDesigner: {
                            const { ServiceClassDesigner } = await import("./views/BI/ServiceClassEditor/ServiceClassDesigner");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ServiceClassDesigner
                                    projectPath={value.projectPath}
                                    type={value?.type}
                                    fileName={value?.documentUri}
                                    position={value?.position}
                                    isGraphql={value?.isGraphql}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIServiceConfigView: {
                            const { default: ServiceConfigureView } = await import("./views/BI/ServiceDesigner/ServiceConfigureView");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ServiceConfigureView
                                    projectPath={value.projectPath}
                                    filePath={value.documentUri}
                                    position={value?.position}
                                    listenerName={value?.identifier}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIServiceClassConfigView: {
                            const { ServiceClassConfig } = await import("./views/BI/ServiceClassEditor/ServiceClassConfig");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ServiceClassConfig
                                    projectPath={value.projectPath}
                                    type={value?.type}
                                    fileName={value.documentUri}
                                    position={value?.position}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIListenerConfigView: {
                            const { ListenerEditView } = await import("./views/BI/ServiceDesigner/ListenerEditView");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ListenerEditView
                                    projectPath={value.projectPath}
                                    filePath={value.documentUri}
                                    position={value?.position}
                                />);
                            break;
                        }
                        case MACHINE_VIEW.AddConnectionWizard: {
                            const { default: AddConnectionPopup } = await import("./views/BI/Connection/AddConnectionPopup");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <AddConnectionPopup
                                    key={remountKey}
                                    projectPath={value.projectPath}
                                    fileName={value.documentUri || Utils.joinPath(URI.file(value.projectPath), CONNECTIONS_FILE).fsPath}
                                    onNavigateToOverview={handleNavigateToOverview}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.AddAgent: {
                            const { default: AddAgentPopup } = await import("./views/BI/AIChatAgent/AddAgentPopup");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <AddAgentPopup
                                    key={remountKey}
                                    projectPath={value.projectPath}
                                    onNavigateToOverview={handleNavigateToOverview}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.EditConnectionWizard: {
                            const { default: EditConnectionPopup } = await import("./views/BI/Connection/EditConnectionPopup");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <EditConnectionPopup
                                    key={remountKey}
                                    connectionName={value?.identifier}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.AddCustomConnector: {
                            const { default: AddConnectionWizard } = await import("./views/BI/Connection/AddConnectionWizard");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <AddConnectionWizard
                                    projectPath={value.projectPath}
                                    fileName={value.documentUri || Utils.joinPath(URI.file(value.projectPath), CONNECTIONS_FILE).fsPath}
                                    openCustomConnectorView={true}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIMainFunctionForm: {
                            const { FunctionForm } = await import("./views/BI/FunctionForm");
                            const defaultFunctionsFile = await getDefaultFunctionsFile();
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <FunctionForm
                                    projectPath={value.projectPath}
                                    filePath={defaultFunctionsFile}
                                    functionName={value?.identifier}
                                    isAutomation={true}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BIFunctionForm: {
                            const { FunctionForm } = await import("./views/BI/FunctionForm");
                            const defaultFunctionsFile = await getDefaultFunctionsFile();
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <FunctionForm
                                    key={remountKey}
                                    projectPath={value.projectPath}
                                    filePath={defaultFunctionsFile}
                                    functionName={value?.identifier}
                                />);
                            break;
                        }
                        case MACHINE_VIEW.BIWorkflowForm: {
                            const { FunctionForm } = await import("./views/BI/FunctionForm");
                            const defaultFunctionsFile = await getDefaultFunctionsFile();
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <FunctionForm
                                    key={remountKey}
                                    projectPath={value.projectPath}
                                    filePath={defaultFunctionsFile}
                                    functionName={value?.identifier}
                                    isWorkflow={true}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.BITestFunctionForm: {
                            const { TestFunctionForm } = await import("./views/BI/TestFunctionForm");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <TestFunctionForm
                                    key={value?.identifier} // Force remount when switching between different tests
                                    projectPath={value.projectPath}
                                    functionName={value?.identifier}
                                    filePath={value?.documentUri}
                                    serviceType={value?.serviceType}
                                />);
                            break;
                        }
                        case MACHINE_VIEW.BIAIEvaluationForm: {
                            const { AIEvaluationForm } = await import("./views/BI/AIEvaluationForm");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <AIEvaluationForm
                                    key={value?.identifier} // Force remount when switching between different tests
                                    projectPath={value.projectPath}
                                    functionName={value?.identifier}
                                    filePath={value?.documentUri}
                                    serviceType={value?.serviceType}
                                    isVersionSupported={value?.metadata?.featureSupport?.aiEvaluation}
                                />);
                            break;
                        }
                        case MACHINE_VIEW.ViewConfigVariables: {
                            const { default: ViewConfigurableVariables } = await import("./views/BI/Configurables/ViewConfigurableVariables");
                            const [configFilePath, testsConfigTomlPath] = await Promise.all([
                                getConfigFilePath(),
                                getTestsConfigTomlPath(),
                            ]);
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ViewConfigurableVariables
                                    key={remountKey}
                                    projectPath={value?.projectPath}
                                    fileName={configFilePath}
                                    testsConfigTomlPath={testsConfigTomlPath}
                                    org={value?.org}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.AddConfigVariables: {
                            const { default: ViewConfigurableVariables } = await import("./views/BI/Configurables/ViewConfigurableVariables");
                            const [configFilePath, testsConfigTomlPath] = await Promise.all([
                                getConfigFilePath(),
                                getTestsConfigTomlPath(),
                            ]);
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ViewConfigurableVariables
                                    key={remountKey}
                                    projectPath={value?.projectPath}
                                    fileName={configFilePath}
                                    testsConfigTomlPath={testsConfigTomlPath}
                                    org={value?.org}
                                    addNew={true}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.ServiceFunctionForm: {
                            const { ServiceFunctionForm } = await import("./views/BI/ServiceFunctionForm");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ServiceFunctionForm
                                    position={value?.position}
                                    currentFilePath={value.documentUri}
                                    projectPath={value.projectPath}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.ReviewMode: {
                            const { ReviewMode } = await import("./views/ReviewMode");
                            if (isStaleNavigation()) return;
                            setViewComponent(<ReviewMode />);
                            break;
                        }
                        case MACHINE_VIEW.EvalsetViewer: {
                            const { EvalsetViewer } = await import("./views/EvalsetViewer/EvalsetViewer");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <EvalsetViewer
                                    projectPath={value.projectPath}
                                    filePath={value?.evalsetData.filePath}
                                    content={value?.evalsetData.content}
                                    threadId={value?.evalsetData?.threadId}
                                />
                            );
                            break;
                        }
                        case MACHINE_VIEW.ConfigurationCollector: {
                            const { ConfigurationCollector } = await import("./views/AIPanel/components/ConfigurationCollector");
                            if (isStaleNavigation()) return;
                            setViewComponent(
                                <ConfigurationCollector
                                    data={value.agentMetadata?.configurationCollector}
                                    onClose={() => handleApprovalClose(value.agentMetadata?.configurationCollector)}
                                />
                            );
                            break;
                        }

                        default:
                            setNavActive(false);
                            setViewComponent(<LoadingRing />);
                    }
                }
            } catch (error) {
                if (isStaleNavigation()) return;
                handleViewLoadError(error, "Failed to load the selected visualizer view.");
            }
        }).catch((error) => {
            if (navKey !== navKeyRef.current) return;
            handleViewLoadError(error, "Failed to load visualizer context.");
        });
    };

    useEffect(() => {
        debounceFetchContext();
    }, [breakpointState]);

    useEffect(() => {
        const mouseTrapClient = KeyboardNavigationManager.getClient();

        mouseTrapClient.bindNewKey(["command+z", "ctrl+z"], () => handleUndo(rpcClient));
        mouseTrapClient.bindNewKey(["command+shift+z", "ctrl+y"], async () => handleRedo(rpcClient));

        return () => {
            mouseTrapClient.resetMouseTrapInstance();
        };
    }, [viewComponent]);

    const handleOnCloseMessage = () => {
        setPopupMessage(false);
    };

    const handleOnClose = (parent?: ParentPopupData) => {
        rpcClient
            .getVisualizerRpcClient()
            .openView({ type: EVENT_TYPE.CLOSE_VIEW, location: { view: null, recentIdentifier: parent?.recentIdentifier, artifactType: parent?.artifactType }, isPopup: true });
    };

    const handleNavigateToOverview = () => {
        rpcClient.getVisualizerRpcClient().goHome({ isPackageOverview: true });
    };

    const handleApprovalClose = (approvalData: any | undefined) => {
        const requestId = approvalData?.requestId;

        if (requestId) {
            console.log('[MainPanel] Approval view closed, notifying backend:', requestId);
            rpcClient.getVisualizerRpcClient().handleApprovalPopupClose({ requestId });
        }
    };

    const handlePopupClose = (id: string) => {
        closeModal(id);
    }

    return (
        <>
            <Global styles={globalStyles} />
            <VisualizerContainer id="visualizer-container">
                <ErrorBoundary goHome={handleNavigateToOverview} errorMsg="An error occurred in the visualizer" issueUrl={gitIssueUrl} ref={errorBoundaryRef} resetKeys={[viewComponent]}>
                    {/* {navActive && <NavigationBar showHome={showHome} />} */}
                    {(showOverlay || modalStack.length > 0) && <Overlay />}
                    {viewError && (
                        <ComponentViewWrapper>
                            <WebviewErrorState
                                title="Unable to load this view"
                                message={viewError}
                                onRetry={fetchContext}
                            />
                        </ComponentViewWrapper>
                    )}
                    {!viewError && viewComponent && <ComponentViewWrapper>{viewComponent}</ComponentViewWrapper>}
                    {!viewError && !viewComponent && (
                        <ComponentViewWrapper>
                            <LoadingViewContainer>
                                <LoadingContent>
                                    <ProgressRing />
                                    <LoadingTitle>Loading Integration</LoadingTitle>
                                    <LoadingSubtitle>Setting up your integration environment</LoadingSubtitle>
                                    <LoadingText>
                                        <span className="loading-dots">Please wait</span>
                                    </LoadingText>
                                </LoadingContent>
                            </LoadingViewContainer>
                        </ComponentViewWrapper>
                    )}
                    {sidePanel !== "EMPTY" && sidePanel === "ADD_CONNECTION" && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <LazyConnectorList applyModifications={applyModifications} />
                        </React.Suspense>
                    )}

                    {popupMessage && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <LazyPopupMessage onClose={handleOnCloseMessage}>
                                <Typography variant="h3">This feature is coming soon!</Typography>
                            </LazyPopupMessage>
                        </React.Suspense>
                    )}
                    {sidePanel === "RECORD_EDITOR" && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <LazyRecordEditor
                                isRecordEditorOpen={sidePanel === "RECORD_EDITOR"}
                                onClose={() => setSidePanel("EMPTY")}
                                rpcClient={rpcClient}
                            />
                        </React.Suspense>
                    )}
                    {activePanel?.isActive && activePanel.name === PanelType.CONSTRUCTPANEL && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <LazyConstructPanel applyModifications={applyModifications} />
                        </React.Suspense>
                    )}
                    {activePanel?.isActive && activePanel.name === PanelType.STATEMENTEDITOR && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <LazyEditPanel applyModifications={applyModifications} />
                        </React.Suspense>
                    )}
                    {typeof popupState === "object" && "open" in popupState && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <PopUpContainer>
                                <LazyPopupPanel onClose={handleOnClose} formState={popupState} handleNavigateToOverview={handleNavigateToOverview} />
                            </PopUpContainer>
                        </React.Suspense>
                    )}
                    {sidePanel !== "EMPTY" && sidePanel === "ADD_ACTION" && (
                        <React.Suspense fallback={<ConditionalPanelFallback />}>
                            <LazyEndpointList applyModifications={applyModifications} />
                        </React.Suspense>
                    )}
                    {
                        modalStack.map((modal) => (
                            <Popup title={modal.title} onClose={() => {
                                modal.onClose && modal.onClose();
                                handlePopupClose(modal.id)
                            }} key={modal.id} width={modal.width} height={modal.height}>{modal.modal}</Popup>
                        ))
                    }
                </ErrorBoundary>
            </VisualizerContainer>
        </>
    );
};

export default MainPanel;
