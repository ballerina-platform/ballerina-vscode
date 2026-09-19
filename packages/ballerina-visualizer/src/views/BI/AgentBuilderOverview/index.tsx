/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    BI_COMMANDS,
    DIRECTORY_MAP,
    EVENT_TYPE,
    MACHINE_VIEW,
    ProjectStructure,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentSelection, EntrySelection, TriggerSelection } from "@wso2/component-diagram";
import { Button, Codicon, Icon, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { PageHeader } from "../components/PageHeader";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { DeploymentPanel, SidePanel } from "../../../components/DeploymentControl";
import { useDeploymentControl } from "../../../hooks/useDeploymentControl";
import { getIntegrationTypes, hasWorkflowArtifacts, validateComponentName, useProjectContentRefresh } from "../PackageOverview/utils";
import { useTracingStatus } from "../../../hooks/useProductMode";
import { EmptyState } from "./EmptyState";
import { openAgent, openServiceConfig, openTrigger } from "../AgentTopology/topologyNavigation";
import { entryRange } from "../AgentTopology/topologyLocation";
import { openAddAgentTrigger } from "../AIChatAgent/utils";

const LazyAgentTopology = React.lazy(() => import("../AgentTopology"));
const LazyAddAgentPopup = React.lazy(() => import("../AIChatAgent/AddAgentPopup"));
const LazyAddLibraryArtifactPopup = React.lazy(() => import("./AddLibraryArtifactPopup"));
const LazyAddMcpServicePopup = React.lazy(() => import("./AddMcpServicePopup"));

const Page = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
`;

const MainContent = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 16px;
    padding: 0 16px 16px;
`;

const Panel = styled.div<{ bordered?: boolean }>`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid
        ${(props: { bordered?: boolean }) => (props.bordered ? ThemeColors.OUTLINE_VARIANT : "transparent")};
    border-radius: 4px;
    overflow: hidden;
    transition: border-color 500ms ease;
`;

const CROSSFADE_MS = 520;
// onReady fires when the model lands; the diagram still has a layout/fit pass to run.
const READY_SETTLE_MS = 180;
const READY_FALLBACK_MS = 2500;

const Stage = styled.div`
    display: grid;
    flex: 1;
    min-height: 0;
    min-width: 0;
`;

const Layer = styled.div<{ $show?: boolean }>`
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    opacity: ${(props: { $show?: boolean }) => (props.$show ? 1 : 0)};
    transform: ${(props: { $show?: boolean }) => (props.$show ? "none" : "scale(0.99)")};
    pointer-events: ${(props: { $show?: boolean }) => (props.$show ? "auto" : "none")};
    transition: opacity 500ms ease, transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1);

    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
`;

const CanvasSlot = styled.div`
    flex: 1;
    min-height: 0;
    position: relative;

    > div:first-of-type {
        height: 100%;
    }
`;

const CenteredSlot = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
`;

const Strip = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    min-width: 0;
    height: 40px;
    padding-inline: 12px 0;
    background-color: var(--vscode-sideBar-background, var(--vscode-panel-background));
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const BreadcrumbLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    height: 100%;
    font-size: 13px;
    color: var(--vscode-foreground);
`;

const StripActions = styled.div`
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: 100%;
`;

const AddAgentButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding-inline: 12px;
    height: 100%;
    border: none;
    border-inline-start: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background: none;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    color: var(--vscode-foreground);

    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const TracingState = styled.div`
    display: inline-grid;
    justify-items: start;

    > div {
        grid-area: 1 / 1;
        transition: opacity 150ms ease;
    }
`;

// Below this the labels are dropped and the header actions become icon-only.
const COMPACT_HEADER_WIDTH = 800;

function useCompactHeader() {
    const [compact, setCompact] = useState(false);

    useEffect(() => {
        const query = window.matchMedia(`(max-width: ${COMPACT_HEADER_WIDTH - 1}px)`);
        const update = () => setCompact(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return compact;
}

const OVERVIEW_TITLE = "Agent Overview";

export interface AgentFocusRequest {
    path: string;
    startLine: number;
    requestId: number;
}

const DEPLOY_PANEL_COLLAPSED_KEY = "ballerina.agentBuilderOverview.deployPanelCollapsed";

// Unlike the integrator overview, the drawer starts collapsed here until the user opens it once.
// Storage may be unavailable/quota-restricted in the webview — fall back to that same default.
function loadDeployCollapsed(): boolean {
    try {
        return localStorage.getItem(DEPLOY_PANEL_COLLAPSED_KEY) !== "false";
    } catch {
        return true;
    }
}

function storeDeployCollapsed(collapsed: boolean): void {
    try {
        localStorage.setItem(DEPLOY_PANEL_COLLAPSED_KEY, String(collapsed));
    } catch {
        return;
    }
}

interface AgentBuilderOverviewProps {
    projectPath: string;
    agentFocus?: AgentFocusRequest;
    isInDevant: boolean;
    isICPSupported?: boolean;
}

function hasTriggerArtifacts(directoryMap: ProjectStructure["directoryMap"] | undefined): boolean {
    return (
        (directoryMap?.[DIRECTORY_MAP.SERVICE]?.length ?? 0) > 0 ||
        (directoryMap?.[DIRECTORY_MAP.WORKFLOW]?.length ?? 0) > 0 ||
        (directoryMap?.[DIRECTORY_MAP.AUTOMATION]?.length ?? 0) > 0
    );
}

export function AgentBuilderOverview({ projectPath, agentFocus, isInDevant, isICPSupported }: AgentBuilderOverviewProps) {
    const { rpcClient } = useRpcContext();
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const [deployCollapsed, setDeployCollapsed] = useState<boolean>(loadDeployCollapsed);
    const [isInProject, setIsInProject] = useState(false);
    const [showAddAgent, setShowAddAgent] = useState(false);
    const [showAddLibraryArtifact, setShowAddLibraryArtifact] = useState(false);
    const [showAddMcpService, setShowAddMcpService] = useState(false);
    const [canvasReady, setCanvasReady] = useState(false);
    // Only true once the empty state has actually been on screen, so opening a
    // package that already has agents never mounts it — it just fades out once shown.
    const [emptyMounted, setEmptyMounted] = useState(false);
    const compactHeader = useCompactHeader();
    const { isTracingEnabled, toggleTracing, ampTracingEnabled, setAmpTracingEnabled } = useTracingStatus(rpcClient, projectPath);
    const revealTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const sawEmptyRef = useRef(false);

    const fetchContext = useCallback(() => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then((res) => {
                const project = res.projects.find((p) => isSamePath(p.projectPath, projectPath));
                setIsInProject(res.workspaceName !== undefined);
                if (project) {
                    setProjectStructure(project);
                }
            });
    }, [rpcClient, projectPath]);

    useEffect(() => {
        fetchContext();
    }, [fetchContext]);

    useProjectContentRefresh(rpcClient, fetchContext);

    const agents = useMemo(
        () => projectStructure?.directoryMap?.[DIRECTORY_MAP.AGENT] ?? [],
        [projectStructure]
    );
    const agentDefinitions = useMemo(
        () => projectStructure?.directoryMap?.[DIRECTORY_MAP.AGENT_DEFINITION] ?? [],
        [projectStructure]
    );
    const hasAgents = agents.length > 0;
    const hasContent = hasAgents || hasTriggerArtifacts(projectStructure?.directoryMap);

    const isLibrary = projectStructure?.isLibrary ?? false;

    // The canvas shows every agent at once, so a deep-link request opens the target agent's
    // own view directly instead of selecting it in-place (there is no per-agent tab here).
    const appliedFocusRef = useRef<number>();

    useEffect(() => {
        if (!agentFocus || appliedFocusRef.current === agentFocus.requestId) {
            return;
        }
        const match = agents.find(
            (agent) => isSamePath(agent.path, agentFocus.path) && (agent.position?.startLine ?? 0) === agentFocus.startLine
        );
        if (!match) {
            return;
        }
        appliedFocusRef.current = agentFocus.requestId;
        setShowAddAgent(false);
        openAgent(rpcClient, match);
    }, [agents, agentFocus, rpcClient]);

    if (projectStructure && !hasContent) {
        sawEmptyRef.current = true;
    }
    const canvasVisible = canvasReady || !sawEmptyRef.current;

    const handleCanvasReady = useCallback(() => {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => setCanvasReady(true), READY_SETTLE_MS);
    }, []);

    useEffect(() => () => clearTimeout(revealTimerRef.current), []);

    useEffect(() => {
        if (!projectStructure) {
            return;
        }
        if (!hasContent) {
            clearTimeout(revealTimerRef.current);
            setCanvasReady(false);
            setEmptyMounted(true);
            return;
        }
        if (!sawEmptyRef.current) {
            return;
        }
        const fallback = setTimeout(() => setCanvasReady(true), READY_FALLBACK_MS);
        return () => clearTimeout(fallback);
    }, [projectStructure, hasContent]);

    useEffect(() => {
        if (!canvasVisible) {
            return;
        }
        const timer = setTimeout(() => setEmptyMounted(false), CROSSFADE_MS);
        return () => clearTimeout(timer);
    }, [canvasVisible]);

    const integrationTitle = projectStructure?.projectTitle || projectStructure?.projectName;
    const deployableIntegrationTypes = useMemo(() => getIntegrationTypes(projectStructure), [projectStructure]);
    const hasDeployable = deployableIntegrationTypes.length > 0;
    const hasWorkflows = hasWorkflowArtifacts(projectStructure);
    const deploymentControl = useDeploymentControl(rpcClient, projectPath, {
        isICPSupported,
        deployableIntegrationTypes,
        ampTracingEnabled,
        setAmpTracingEnabled,
    });

    const validateTitle = useCallback((value: string): string => {
        return validateComponentName(value.trim(), isLibrary) ?? "";
    }, [isLibrary]);

    const handleTitleUpdate = useCallback(
        async (newTitle: string) => {
            await rpcClient.getBIDiagramRpcClient().updatePackageTitle({ packagePath: projectPath, title: newTitle });
            setProjectStructure((prev) => (prev ? { ...prev, projectTitle: newTitle } : prev));
        },
        [projectPath, rpcClient]
    );

    const handleOpenAgentFromCanvas = useCallback((agent: AgentSelection) => {
        const match = agents.find(
            (candidate) => isSamePath(candidate.path, agent.path) && (candidate.position?.startLine ?? 0) === agent.startLine
        );
        if (match) {
            openAgent(rpcClient, match);
            return;
        }
        openTrigger(rpcClient, { filePath: agent.path, position: { line: agent.startLine, offset: 0 } });
    }, [agents, rpcClient]);

    const handleOpenTrigger = useCallback((trigger: TriggerSelection) => {
        openTrigger(rpcClient, trigger);
    }, [rpcClient]);

    const handleConfigureEntry = useCallback((entry: EntrySelection) => {
        openServiceConfig(rpcClient, entry);
    }, [rpcClient]);

    const handleDeleteEntry = useCallback(async (entry: EntrySelection) => {
        const handlers = entry.handlerCount === 1 ? "its handler" : `its ${entry.handlerCount} handlers`;
        const confirmed = await rpcClient.getCommonRpcClient().showInformationModal({
            message: `Are you sure you want to delete the ${entry.label} service?`,
            detail: `The service and ${handlers} will be removed. The agents it runs are kept and become untriggered.`,
            items: ["Delete Service"],
        });
        if (confirmed !== "Delete Service") {
            return;
        }
        const range = entryRange(entry);
        await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
            filePath: entry.filePath,
            component: { name: entry.label, filePath: entry.filePath, ...range },
        });
    }, [rpcClient]);

    const handleAddTriggerFromCanvas = useCallback(async (agent: AgentSelection) => {
        if (agent.moduleName === "workflow") {
            openAddAgentTrigger(rpcClient, agent.name, "ballerina", "durable");
            return;
        }
        const isPlainAgent = !agent.moduleName || agent.moduleName === "ai";
        const toml = isPlainAgent ? undefined : await rpcClient.getCommonRpcClient().getCurrentProjectTomlValues();
        openAddAgentTrigger(rpcClient, agent.name, isPlainAgent ? "ballerina" : toml?.package?.org);
    }, [rpcClient]);

    const handleConfigure = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: { view: MACHINE_VIEW.ViewConfigVariables },
        });
    };

    const handleRun = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.BI_RUN_PROJECT] });
    };

    const handleToggleDeployPanel = () => {
        setDeployCollapsed((collapsed) => {
            storeDeployCollapsed(!collapsed);
            return !collapsed;
        });
    };

    const headerActions = (
        <>
            <Button
                appearance="icon"
                onClick={handleConfigure}
                tooltip={compactHeader ? "Configure" : undefined}
                buttonSx={{ padding: "4px 8px" }}
            >
                <Icon
                    name="bi-settings"
                    sx={{ marginRight: compactHeader ? 0 : 5, fontSize: "16px", width: "16px" }}
                />
                {!compactHeader && "Configure"}
            </Button>
            {agents.length > 0 && (
                <>
                    <Button
                        appearance="icon"
                        onClick={toggleTracing}
                        tooltip={isTracingEnabled ? "Tracing is on. Click to disable." : "Tracing is off. Click to enable."}
                        buttonSx={{ padding: "4px 8px", color: isTracingEnabled ? "var(--vscode-textLink-foreground)" : undefined }}
                    >
                        <Codicon name="telescope" sx={{ marginRight: compactHeader ? 0 : 5 }} />
                        {!compactHeader && (
                            <>
                                Tracing:&nbsp;
                                <TracingState>
                                    <div style={{ opacity: isTracingEnabled ? 1 : 0 }}>On</div>
                                    <div style={{ opacity: isTracingEnabled ? 0 : 1 }}>Off</div>
                                </TracingState>
                            </>
                        )}
                    </Button>
                    <Button
                        appearance="icon"
                        onClick={handleRun}
                        tooltip={compactHeader ? "Run" : undefined}
                        buttonSx={{ padding: "4px 8px" }}
                    >
                        <Codicon name="play" sx={{ marginRight: compactHeader ? 0 : 5 }} />
                        {!compactHeader && " Run"}
                    </Button>
                    <Button
                        appearance="icon"
                        onClick={handleToggleDeployPanel}
                        tooltip={deployCollapsed ? "Show deployment panel" : "Hide deployment panel"}
                        aria-label={deployCollapsed ? "Show deployment panel" : "Hide deployment panel"}
                        aria-expanded={!deployCollapsed}
                        buttonSx={{ padding: "4px 8px" }}
                    >
                        <Codicon
                            name={deployCollapsed ? "layout-sidebar-right-off" : "layout-sidebar-right"}
                            sx={{ marginRight: compactHeader ? 0 : 5 }}
                        />
                        {!compactHeader && "Deployment"}
                    </Button>
                </>
            )}
        </>
    );

    if (!projectStructure) {
        return (
            <Page>
                {isInProject && <TopNavigationBar projectPath={projectPath} bordered />}
                <CenteredSlot>
                    <ProgressRing color={ThemeColors.PRIMARY} />
                </CenteredSlot>
            </Page>
        );
    }

    return (
        <>
            <Page>
                {isInProject && <TopNavigationBar projectPath={projectPath} bordered />}
                <PageHeader
                    title={integrationTitle}
                    actions={headerActions}
                    onTitleEdit={handleTitleUpdate}
                    validateTitle={validateTitle}
                    hideDivider={true}
                    hasTopNavigationBar={isInProject}
                />
                <MainContent>
                    <Panel bordered={canvasVisible}>
                        <Stage>
                            {hasContent && (
                                <Layer $show={canvasVisible}>
                                    <Strip>
                                        <BreadcrumbLabel>{OVERVIEW_TITLE}</BreadcrumbLabel>
                                        <StripActions>
                                            <AddAgentButton onClick={() => setShowAddAgent(true)} title="Add an agent to this project">
                                                <Icon name="bi-plus" sx={{ fontSize: 16, width: 16, height: 16 }} />
                                                Add Agent
                                            </AddAgentButton>
                                            {!isLibrary && (
                                                <AddAgentButton
                                                    onClick={() => setShowAddMcpService(true)}
                                                    title="Add an MCP server to this project"
                                                >
                                                    <Icon name="bi-plus" sx={{ fontSize: 16, width: 16, height: 16 }} />
                                                    Add MCP
                                                </AddAgentButton>
                                            )}
                                        </StripActions>
                                    </Strip>
                                    <CanvasSlot>
                                        <React.Suspense
                                            fallback={
                                                <CenteredSlot>
                                                    <ProgressRing color={ThemeColors.PRIMARY} />
                                                </CenteredSlot>
                                            }
                                        >
                                            <LazyAgentTopology
                                                projectPath={projectPath}
                                                agents={agents}
                                                agentDefinitions={agentDefinitions}
                                                onOpenAgent={handleOpenAgentFromCanvas}
                                                onOpenTrigger={handleOpenTrigger}
                                                onAddTrigger={handleAddTriggerFromCanvas}
                                                onConfigureEntry={handleConfigureEntry}
                                                onDeleteEntry={handleDeleteEntry}
                                                onReady={handleCanvasReady}
                                            />
                                        </React.Suspense>
                                    </CanvasSlot>
                                </Layer>
                            )}
                            {(!hasContent || emptyMounted) && (
                                <Layer $show={!canvasVisible}>
                                    <EmptyState
                                        isLibrary={isLibrary}
                                        onCreateFromScratch={() =>
                                            isLibrary ? setShowAddLibraryArtifact(true) : setShowAddAgent(true)
                                        }
                                        onAddMcpService={
                                            isLibrary ? undefined : () => setShowAddMcpService(true)
                                        }
                                    />
                                </Layer>
                            )}
                        </Stage>
                    </Panel>
                    {agents.length > 0 && (
                        <SidePanel collapsed={deployCollapsed} aria-hidden={deployCollapsed}>
                            <DeploymentPanel
                                projectPath={projectPath}
                                projectStructure={projectStructure}
                                isInDevant={isInDevant}
                                isICPSupported={isICPSupported}
                                hasWorkflows={hasWorkflows}
                                hasAgents={hasAgents}
                                hasDeployableIntegration={hasDeployable}
                                {...deploymentControl}
                            />
                        </SidePanel>
                    )}
                </MainContent>
            </Page>
            {showAddAgent && (
                <React.Suspense fallback={null}>
                    <LazyAddAgentPopup
                        isPopup
                        projectPath={projectPath}
                        onClose={() => setShowAddAgent(false)}
                        onNavigateToOverview={() => setShowAddAgent(false)}
                    />
                </React.Suspense>
            )}
            {showAddLibraryArtifact && (
                <React.Suspense fallback={null}>
                    <LazyAddLibraryArtifactPopup onClose={() => setShowAddLibraryArtifact(false)} />
                </React.Suspense>
            )}
            {showAddMcpService && (
                <React.Suspense fallback={null}>
                    <LazyAddMcpServicePopup
                        projectPath={projectPath}
                        onClose={() => setShowAddMcpService(false)}
                    />
                </React.Suspense>
            )}
        </>
    );
}
