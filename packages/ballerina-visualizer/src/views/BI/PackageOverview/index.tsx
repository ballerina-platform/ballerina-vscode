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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ProjectStructure,
    EVENT_TYPE,
    MACHINE_VIEW,
    BI_COMMANDS,
    DIRECTORY_MAP,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Typography, Codicon, ProgressRing, Button, Icon, ProgressIndicator, Overlay, Dropdown } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Markdown } from "../../../components/Markdown";
import { AlertBoxWithClose } from "../../AIPanel/AlertBoxWithClose";
import { getIntegrationTypes, hasWorkflowArtifacts, hasAgentArtifacts, validateComponentName, useProjectContentRefresh } from "./utils";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { PageHeader } from "../components/PageHeader";
import { DeploymentPanel } from "../../../components/DeploymentControl";
import { useDeploymentControl } from "../../../hooks/useDeploymentControl";
import { useTracingStatus } from "../../../hooks/useProductMode";
import { PublishToCentralButton } from "./PublishToCentralButton";
import { LibraryOverview } from "./LibraryOverview";
import { CopilotComposer } from "./CopilotComposer";
import { useAgentRunState, useAiPanelOpen } from "../../../components/AgentStatusOrb/shared";

/** The diagram engine (`@wso2/component-diagram` and its layout stack) is the
 *  heaviest thing this view renders. Kept out of the overview's chunk so the page —
 *  header, README, deployment panel — paints without waiting for it; the diagram
 *  fills in a moment later, and the prefetcher usually has it warm before then. */
const LazyComponentDiagram = React.lazy(() => import("../ComponentDiagram"));

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const Description = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

const IconButtonContainer = styled.div`
    display: flex;
    align-items: flex-end;
`;

const ButtonContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
`;

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
`;

const EmptyStateContainer = styled.div`
    position: absolute;
    inset: 0;
`;

// Overlapping layers so the composer and the fallback crossfade instead of popping.
const CrossFadeLayer = styled.div<{ $show: boolean; $center?: boolean }>`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: ${(props: { $center?: boolean }) => (props.$center ? "center" : "stretch")};
    justify-content: ${(props: { $center?: boolean }) => (props.$center ? "center" : "stretch")};
    opacity: ${(props: { $show: boolean }) => (props.$show ? 1 : 0)};
    // visibility (not just opacity) keeps the faded-out layer's buttons out of the tab order.
    visibility: ${(props: { $show: boolean }) => (props.$show ? "visible" : "hidden")};
    pointer-events: ${(props: { $show: boolean }) => (props.$show ? "auto" : "none")};
    transition: opacity 240ms ease, visibility 240ms;
`;

const PageLayout = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
`;

const MainContent = styled.div<{ fullWidth?: boolean, sideCollapsed?: boolean }>`
    padding: 16px;
    display: grid;
    grid-template-columns: ${(props: { fullWidth?: boolean, sideCollapsed?: boolean }) =>
        props.fullWidth ? '1fr' : props.sideCollapsed ? '1fr 0fr' : '3fr 1fr'};
    grid-template-rows: minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
    transition: grid-template-columns 220ms ease;
`;

const DiagramPanel = styled.div<{ noPadding?: boolean, noBorder?: boolean }>`
    border: ${(props: { noBorder?: boolean }) => props.noBorder ? "none" : `1px solid ${ThemeColors.OUTLINE_VARIANT}`};
    border-radius: 4px;
    // Mirror the header's top inset at the bottom; the inner header supplies top/side padding.
    padding: ${(props: { noPadding?: boolean }) => (props.noPadding ? "0 0 16px 0" : "16px")};
    overflow: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const LeftContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0; // Prevents flex blowout
`;

const SidePanel = styled.div<{ collapsed?: boolean }>`
    margin-left: ${(props: { collapsed?: boolean }) => (props.collapsed ? "0" : "16px")};
    // Sits outside the design panel, so its first heading needs the panel's own header inset
    // to share a baseline with the Design/Readme tabs.
    padding-top: 20px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    opacity: ${(props: { collapsed?: boolean }) => (props.collapsed ? 0 : 1)};
    // visibility (not display) keeps the collapsed panel out of the tab order while still animating.
    visibility: ${(props: { collapsed?: boolean }) => (props.collapsed ? "hidden" : "visible")};
    transition: opacity 180ms ease, margin-left 220ms ease, visibility 220ms;
`;

// Full-height README view that replaces the design panel.
const ReadmePanel = styled.div`
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    padding: 16px;
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
`;

const ActionContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
`;

// Only labelled while the panel is hidden, so the label has to grow/shrink rather than pop.
// Width has to be an explicit px value, not max-width: `overflow: hidden` zeroes the span's
// min-content contribution, so the button would reserve no room for the label and clip it.
const DeployToggleLabel = styled.span<{ shown?: boolean, textWidth?: number }>`
    display: inline-block;
    flex: 0 0 auto;
    overflow: hidden;
    white-space: nowrap;
    width: ${(props: { shown?: boolean, textWidth?: number }) => (props.shown ? `${props.textWidth ?? 0}px` : "0")};
    opacity: ${(props: { shown?: boolean }) => (props.shown ? 1 : 0)};
    margin-left: ${(props: { shown?: boolean }) => (props.shown ? "5px" : "0")};
    transition: width 220ms ease, opacity 180ms ease, margin-left 220ms ease;
`;

const DEPLOY_PANEL_COLLAPSED_KEY = "ballerina.overview.deployPanelCollapsed";

// Storage may be unavailable/quota-restricted in the webview — default to expanded rather
// than throwing during render.
function loadDeployCollapsed(): boolean {
    try {
        return localStorage.getItem(DEPLOY_PANEL_COLLAPSED_KEY) === "true";
    } catch {
        return false;
    }
}

function storeDeployCollapsed(collapsed: boolean): void {
    try {
        localStorage.setItem(DEPLOY_PANEL_COLLAPSED_KEY, String(collapsed));
    } catch {
        return;
    }
}

const EmptyReadmeContainer = styled.div`
    display: flex;
    margin: 50px 0px;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    justify-content: center;
    height: 100%;
`;

const DiagramHeaderContainer = styled.div<{ withPadding?: boolean }>`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: ${(props: { withPadding?: boolean }) => props.withPadding ? "16px 16px 0 16px" : "0"};
`;


const DiagramContent = styled.div`
    flex: 1;
    min-height: 0; // Prevents flex blowout
    position: relative;
`;

const DeploymentContent = styled.div`
    margin-top: 16px;
    min-width: 130px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--vscode-descriptionForeground);

    h3 {
        margin: 0 0 16px 0;
        color: inherit;
    }

    p {
        color: inherit;
    }
`;

const DeployButtonContainer = styled.div`
    margin-top: 16px;
    margin-bottom: 16px;
`;

const ReadmeHeaderContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ReadmeButtonContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const ViewTabs = styled.div`
    display: flex;
    align-items: baseline;
    gap: 16px;
`;

// A real button, styled to keep the h2-heading look the switch always had.
const ViewTab = styled.button<{ active?: boolean }>`
    background: none;
    border: none;
    padding: 0;
    margin: 8px 0;
    font: inherit;
    font-size: 1.5em;
    font-weight: bold;
    color: inherit;
    cursor: ${(props: { active?: boolean }) => (props.active ? "default" : "pointer")};
    opacity: ${(props: { active?: boolean }) => (props.active ? 1 : 0.45)};
    transition: opacity 0.1s;

    &:hover {
        opacity: ${(props: { active?: boolean }) => (props.active ? 1 : 0.75)};
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const ReadmeContent = styled.div`
    margin-top: 16px;
    text-wrap: pretty;
    overflow-wrap: break-word;

    p, li, td, th, blockquote {
        overflow-wrap: break-word;
    }

    pre {
        overflow-x: auto;
        overflow-wrap: break-word;
    }
    
    code {
        white-space: pre-wrap;
        overflow-wrap: break-word;
    }
`;

const DeployButton = styled.div`
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    cursor: default !important;
    background: var(--vscode-welcomePage-tileBackground);
    border-radius: 6px;
    display: flex;
    overflow: hidden;
    width: 100%;
    padding: 10px;
    flex-direction: column;
`;

interface PackageOverviewProps {
    projectPath: string;
    isInDevant: boolean;
    isICPSupported?: boolean;
}

/** Keeps a node mounted for `delayMs` after it should hide, so it can animate out. */
function useDelayedUnmount(shouldRender: boolean, delayMs: number): boolean {
    const [mounted, setMounted] = useState(shouldRender);
    useEffect(() => {
        if (shouldRender) {
            setMounted(true);
            return;
        }
        const timer = setTimeout(() => setMounted(false), delayMs);
        return () => clearTimeout(timer);
    }, [shouldRender, delayMs]);
    return mounted;
}

export function PackageOverview(props: PackageOverviewProps) {
    const { projectPath, isInDevant, isICPSupported } = props;
    const { rpcClient } = useRpcContext();
    const [readmeContent, setReadmeContent] = React.useState<string>("");
    const { platformExtState } = usePlatformExtContext();
    const [showAlert, setShowAlert] = React.useState(false);
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const hasWorkflows = hasWorkflowArtifacts(projectStructure);
    const hasAgents = hasAgentArtifacts(projectStructure);
    const [isInProject, setIsInProject] = useState(false);
    const [isLibrary, setIsLibrary] = useState<boolean>(false);
    const [isNPSupported, setIsNPSupported] = useState<boolean>(false);
    const [overviewView, setOverviewView] = useState<"design" | "readme">("design");
    const [deployCollapsed, setDeployCollapsed] = useState<boolean>(loadDeployCollapsed);
    const [deployLabelWidth, setDeployLabelWidth] = useState(0);
    // Measured on attach rather than in an effect: the label mounts below an early return,
    // so a mount effect would only ever see a null ref.
    const deployLabelRef = useCallback((node: HTMLSpanElement | null) => {
        if (node) {
            setDeployLabelWidth((width) => (width === 0 ? node.scrollWidth : width));
        }
    }, []);
    const aiPanelOpen = useAiPanelOpen();
    const agentState = useAgentRunState();
    const awaitingInput = agentState === "awaiting-input";
    const agentWorking = agentState === "running" || awaitingInput;
    // Show the composer when the panel is closed, and also while a run is active even with the
    // panel open — so the run status looks the same either way (it renders only its run-state then).
    const showHero = !isLibrary && (!aiPanelOpen || agentWorking);
    // Keep the outgoing surface mounted through the 240ms crossfade.
    const composerMounted = useDelayedUnmount(showHero, 260);
    const fallbackMounted = useDelayedUnmount(!isLibrary && !showHero, 260);

    const fetchContext = useCallback(() => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then((res) => {
                const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
                setIsInProject(res.workspaceName !== undefined);
                if (project) {
                    setProjectStructure(project);
                    setIsLibrary(project.isLibrary ?? false);
                }
            });

        rpcClient.getCommonRpcClient().isNPSupported().then(setIsNPSupported);

        rpcClient
            .getBIDiagramRpcClient()
            .handleReadmeContent({ projectPath, read: true })
            .then((res) => {
                setReadmeContent(res.content);
            });
    }, [rpcClient, projectPath]);

    useEffect(() => {
        fetchContext();
        showLoginAlert().then((status) => {
            setShowAlert(status);
        });
    }, [projectPath, fetchContext]);

    useProjectContentRefresh(rpcClient, fetchContext);

    const deployableIntegrationTypes = useMemo(() => {
        return getIntegrationTypes(projectStructure);
    }, [projectStructure]);
    // No tracing toggle button on this page, but useTracingStatus still owns the single live
    // subscription to the backend's tracing-status notification (see useDeploymentControl).
    const { ampTracingEnabled, setAmpTracingEnabled } = useTracingStatus(rpcClient, projectPath);
    const deploymentControl = useDeploymentControl(rpcClient, projectPath, {
        isICPSupported,
        deployableIntegrationTypes,
        ampTracingEnabled,
        setAmpTracingEnabled,
    });

    const integrationTitle = useMemo(() => {
        return projectStructure?.projectTitle || projectStructure?.projectName;
    }, [projectStructure]);

    const validateTitle = useCallback((value: string): string => {
        return validateComponentName(value.trim(), isLibrary) ?? "";
    }, [isLibrary]);

    const handleTitleUpdate = useCallback(async (newTitle: string) => {
        await rpcClient.getBIDiagramRpcClient().updatePackageTitle({
            packagePath: projectPath,
            title: newTitle,
        });
        // Optimistically update the displayed title immediately.
        // Do NOT call fetchContext() here — buildProjectsStructure in the backend is async;
        // calling getProjectStructure() too early would return stale data and overwrite this update.
        // The backend's notifyCurrentWebview() fires after buildProjectsStructure completes,
        // which triggers onProjectContentUpdated → fetchContext() as the background confirm.
        setProjectStructure(prev => prev ? { ...prev, projectTitle: newTitle } : prev);
    }, [projectPath, rpcClient]);

    function isEmptyIntegration(): boolean {
        // Filter out connections that start with underscore
        const validConnections = projectStructure.directoryMap[DIRECTORY_MAP.CONNECTION]?.filter(
            conn => !conn.name.startsWith('_')
        ) || [];

        return (
            (!projectStructure.directoryMap[DIRECTORY_MAP.AUTOMATION] || projectStructure.directoryMap[DIRECTORY_MAP.AUTOMATION].length === 0) &&
            (validConnections.length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.LISTENER] || projectStructure.directoryMap[DIRECTORY_MAP.LISTENER].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.SERVICE] || projectStructure.directoryMap[DIRECTORY_MAP.SERVICE].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.WORKFLOW] || projectStructure.directoryMap[DIRECTORY_MAP.WORKFLOW].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.ACTIVITY] || projectStructure.directoryMap[DIRECTORY_MAP.ACTIVITY].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.AGENT] || projectStructure.directoryMap[DIRECTORY_MAP.AGENT].length === 0)
        );
    }

    if (!projectStructure) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    const handleAddConstruct = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIComponentView,
            },
        });
    };

    const handleGenerateWithReadme = () => {
        rpcClient.getBIDiagramRpcClient().openAIChat({
            readme: true,
            planMode: true,
        });
    };

    const handleEditReadme = () => {
        rpcClient.getBIDiagramRpcClient().openReadme({ projectPath });
    };

    const handleLocalRun = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.BI_RUN_PROJECT] });
    };

    const handleLocalDebug = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.BI_DEBUG_PROJECT] });
    };

    const handleLocalConfigure = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.ViewConfigVariables,
            },
        });
    }

    function handleSettings() {
        rpcClient.getAiPanelRpcClient().openAIPanel({
            type: 'text',
            planMode: false,
            text: ''
        });
    }

    async function handleClose() {
        await rpcClient.getAiPanelRpcClient().markAlertShown();
        setShowAlert(false);
    }

    async function showLoginAlert() {
        const resp = await rpcClient.getAiPanelRpcClient().showSignInAlert();
        setShowAlert(resp);
        return resp;
    }

    const handleBack = () => {
        rpcClient.getVisualizerRpcClient().goBack();
    };

    const handleToggleDeployPanel = () => {
        setDeployCollapsed((collapsed) => {
            storeDeployCollapsed(!collapsed);
            return !collapsed;
        });
    };

    // Labelled only while the panel is hidden; expanded, its own "Deployment Options" heading names it.
    const deployPanelToggle = (
        <Button
            appearance="icon"
            onClick={handleToggleDeployPanel}
            tooltip={deployCollapsed ? "Show deployment panel" : "Hide deployment panel"}
            aria-label={deployCollapsed ? "Show deployment panel" : "Hide deployment panel"}
            aria-expanded={!deployCollapsed}
            buttonSx={{ padding: "4px 8px" }}
        >
            <Codicon name={deployCollapsed ? "layout-sidebar-right-off" : "layout-sidebar-right"} />
            <DeployToggleLabel ref={deployLabelRef} shown={deployCollapsed} textWidth={deployLabelWidth}>
                Deployment
            </DeployToggleLabel>
        </Button>
    );

    const headerActions = (
        <>
            <Button appearance="icon" onClick={handleLocalConfigure} buttonSx={{ padding: "4px 8px" }}>
                <Icon
                    name="bi-settings"
                    sx={{
                        marginRight: 5,
                        fontSize: "16px",
                        width: "16px",
                    }}
                />
                Configure
            </Button>
            {!isLibrary && (
                <>
                    <Button appearance="icon" onClick={handleLocalRun} buttonSx={{ padding: "4px 8px" }}>
                        <Codicon name="play" sx={{ marginRight: 5 }} /> Run
                    </Button>
                    <Button appearance="icon" onClick={handleLocalDebug} buttonSx={{ padding: "4px 8px" }}>
                        <Codicon name="debug" sx={{ marginRight: 5 }} /> Debug
                    </Button>
                    {deployPanelToggle}
                </>
            )}
            {isLibrary && (
                <PublishToCentralButton />
            )}
        </>
    );

    const viewSwitch = !isLibrary ? (
        <ViewTabs role="tablist" aria-label="Overview view">
            <ViewTab
                type="button"
                role="tab"
                aria-selected={overviewView === "design"}
                aria-controls="overview-design-view"
                active={overviewView === "design"}
                onClick={() => setOverviewView("design")}
            >
                Design
            </ViewTab>
            <ViewTab
                type="button"
                role="tab"
                aria-selected={overviewView === "readme"}
                aria-controls="overview-readme-view"
                active={overviewView === "readme"}
                onClick={() => setOverviewView("readme")}
            >
                Readme
            </ViewTab>
        </ViewTabs>
    ) : undefined;


    return (
        <PageLayout>
            {isInProject && <TopNavigationBar projectPath={projectPath} />}
            {isInProject ? (
                    <TitleBar
                        title={integrationTitle}
                        subtitle={isLibrary ? "Library" : "Integration"}
                        onBack={handleBack}
                        actions={headerActions}
                        onTitleEdit={handleTitleUpdate}
                        validateTitle={validateTitle}
                    />
                ) : (
                    <PageHeader
                        title={integrationTitle}
                        subtitle={isLibrary ? "Library" : "Integration"}
                        actions={headerActions}
                        onTitleEdit={handleTitleUpdate}
                        validateTitle={validateTitle}
                    />
                )}
                <MainContent fullWidth={isLibrary} sideCollapsed={deployCollapsed}>
                    <LeftContent>
                        {overviewView === "readme" && !isLibrary ? (
                            <ReadmePanel id="overview-readme-view" role="tabpanel">
                                <ReadmeHeaderContainer>
                                    {viewSwitch}
                                    <ReadmeButtonContainer>
                                        {readmeContent && isEmptyIntegration() && (
                                            <Button appearance="icon" onClick={handleGenerateWithReadme} buttonSx={{ padding: "4px 8px" }}>
                                                <Codicon name="wand" sx={{ marginRight: 4, fontSize: 16 }} /> Generate with Readme
                                            </Button>
                                        )}
                                        <Button appearance="icon" onClick={handleEditReadme} buttonSx={{ padding: "4px 8px" }}>
                                            <Icon name="bi-edit" sx={{ marginRight: 8, fontSize: 16 }} /> Edit
                                        </Button>
                                    </ReadmeButtonContainer>
                                </ReadmeHeaderContainer>
                                <ReadmeContent>
                                    {readmeContent ? (
                                        <Markdown>{readmeContent}</Markdown>
                                    ) : (
                                        <EmptyReadmeContainer>
                                            <Description variant="body2">
                                                Describe your integration and generate your artifacts with AI
                                            </Description>
                                            <VSCodeLink onClick={handleEditReadme}>Add a README</VSCodeLink>
                                        </EmptyReadmeContainer>
                                    )}
                                </ReadmeContent>
                            </ReadmePanel>
                        ) : (
                        <DiagramPanel id="overview-design-view" role="tabpanel" noPadding={true} noBorder={isLibrary}>
                            {showAlert && (
                                <AlertBoxWithClose
                                    subTitle={
                                        "Please log in to WSO2 AI Platform to access AI features. You won't be able to use AI features until you log in."
                                    }
                                    title={"Login to WSO2 AI Platform"}

                                    btn1Title="Manage Accounts"
                                    btn1IconName="settings-gear"
                                    btn1OnClick={() => handleSettings()}
                                    btn1Id="settings"

                                    btn2Title="Close"
                                    btn2IconName="close"
                                    btn2OnClick={() => handleClose()}
                                    btn2Id="Close"
                                />
                            )}
                            {!isLibrary && (
                                <DiagramHeaderContainer withPadding={true}>
                                    {viewSwitch}
                                    {/* An empty integration has its own copy of this below,
                                        centred in the empty state, so only one is ever on screen. */}
                                    {!isEmptyIntegration() && (
                                        <ActionContainer>
                                            <Button appearance="primary" onClick={handleAddConstruct}>
                                                <Codicon name="add" sx={{ marginRight: 8 }} /> Add Artifact
                                            </Button>
                                        </ActionContainer>
                                    )}
                                </DiagramHeaderContainer>
                            )}
                            {isLibrary && <LibraryOverview projectStructure={projectStructure} isNPSupported={isNPSupported} projectPath={projectPath} onRefresh={fetchContext} />}
                            {!isLibrary && (
                                <DiagramContent>
                                    {isEmptyIntegration() ? (
                                        <EmptyStateContainer>
                                            {composerMounted && (
                                                <CrossFadeLayer $show={showHero}>
                                                    <CopilotComposer onAddArtifactManually={handleAddConstruct} hiding={!showHero} />
                                                </CrossFadeLayer>
                                            )}
                                            {fallbackMounted && (
                                                <CrossFadeLayer $show={!showHero} $center>
                                                    <Typography variant="h3" sx={{ marginBottom: "16px" }}>
                                                        Your integration is empty
                                                    </Typography>
                                                    <StatusRow>
                                                        <Typography
                                                            variant="body1"
                                                            sx={{ color: "var(--vscode-descriptionForeground)" }}
                                                        >
                                                            Add an artifact to get started
                                                        </Typography>
                                                    </StatusRow>
                                                    <ButtonContainer>
                                                        <Button appearance="primary" onClick={handleAddConstruct}>
                                                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add Artifact
                                                        </Button>
                                                    </ButtonContainer>
                                                </CrossFadeLayer>
                                            )}
                                        </EmptyStateContainer>
                                    ) : (
                                        <React.Suspense
                                            fallback={
                                                <SpinnerContainer>
                                                    <ProgressRing color={ThemeColors.PRIMARY} />
                                                </SpinnerContainer>
                                            }
                                        >
                                            <LazyComponentDiagram projectStructure={projectStructure} />
                                        </React.Suspense>
                                    )}
                                </DiagramContent>
                            )}
                        </DiagramPanel>
                        )}
                    </LeftContent>
                    {!isLibrary && (
                        <SidePanel collapsed={deployCollapsed} aria-hidden={deployCollapsed}>
                            <DeploymentPanel
                                projectPath={projectPath}
                                projectStructure={projectStructure}
                                isInDevant={isInDevant}
                                isICPSupported={isICPSupported}
                                hasWorkflows={hasWorkflows}
                                hasAgents={hasAgents}
                                hasDeployableIntegration={deployableIntegrationTypes.length > 0}
                                {...deploymentControl}
                            />
                        </SidePanel>
                    )}
                </MainContent>
        </PageLayout>
    );
}
