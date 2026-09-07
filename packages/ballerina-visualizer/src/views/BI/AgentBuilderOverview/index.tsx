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
    BuildMode,
    DIRECTORY_MAP,
    EVENT_TYPE,
    FOCUS_FLOW_DIAGRAM_VIEW,
    MACHINE_VIEW,
    ProjectStructure,
    ProjectStructureArtifactResponse,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentSelection, TriggerSelection } from "@wso2/component-diagram";
import { Button, Codicon, Icon, Menu, MenuItem, Popover, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { PageHeader } from "../components/PageHeader";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { getIntegrationTypes, validateComponentName, useProjectContentRefresh } from "../PackageOverview/utils";
import { useTracingStatus } from "../../../hooks/useProductMode";
import { agentKey } from "./AgentTabs";
import { EmptyState } from "./EmptyState";
import { landingLevel, OverviewLevel } from "./landingLevel";
import { openTrigger } from "../AgentTopology/topologyNavigation";
import { openAddAgentTrigger } from "../AIChatAgent/utils";

const LazyFocusFlowDiagram = React.lazy(() =>
    import("../FocusFlowDiagram").then((m) => ({ default: m.BIFocusFlowDiagram }))
);
const LazyAgentTopology = React.lazy(() => import("../AgentTopology"));
const LazyAddAgentPopup = React.lazy(() => import("../AIChatAgent/AddAgentPopup"));
const LazyAddLibraryArtifactPopup = React.lazy(() => import("./AddLibraryArtifactPopup"));

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
    padding: 0 8px 0 12px;
    background-color: var(--vscode-sideBar-background, var(--vscode-panel-background));
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const BreadcrumbLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    height: 100%;
    font-size: 13px;
    color: var(--vscode-foreground);
`;

const BreadcrumbLink = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 26px;
    padding: 0 8px 0 4px;
    margin-left: -6px;
    border: none;
    background: none;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    line-height: 1;
    color: var(--vscode-textLink-foreground);
    border-radius: 5px;

    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
`;

const BreadcrumbSeparator = styled.span`
    display: inline-flex;
    align-items: center;
    color: var(--vscode-descriptionForeground);
    line-height: 1;
`;

const BreadcrumbName = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12.5px;
`;

const BreadcrumbRoot = styled.span`
    color: var(--vscode-descriptionForeground);
`;

const AddAgentButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 100%;
    border: none;
    border-left: 1px solid ${ThemeColors.OUTLINE_VARIANT};
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

const MenuItemLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    min-width: 180px;
`;

function menuLabel(icon: string, text: string) {
    return (
        <MenuItemLabel>
            <Codicon name={icon} /> {text}
        </MenuItemLabel>
    );
}

export interface AgentFocusRequest {
    path: string;
    startLine: number;
    requestId: number;
}

const rememberedKeys = new Map<string, string>();
// Only recorded once the package actually has ≥2 agents, so a single-agent package's forced
// "agent" level never poses as a deliberate drill-in once a second agent appears.
const rememberedLevel = new Map<string, OverviewLevel>();

interface AgentBuilderOverviewProps {
    projectPath: string;
    agentFocus?: AgentFocusRequest;
}

interface AgentBreadcrumbProps {
    level: OverviewLevel;
    agentCount: number;
    selectedAgentName?: string;
    onBack: () => void;
}

function AgentBreadcrumb({ level, agentCount, selectedAgentName, onBack }: AgentBreadcrumbProps) {
    if (level === "overview") {
        return <BreadcrumbLabel>Agents</BreadcrumbLabel>;
    }
    const separator = (
        <BreadcrumbSeparator aria-hidden="true">
            <Codicon name="chevron-right" iconSx={{ fontSize: 14, display: "flex" }} />
        </BreadcrumbSeparator>
    );
    if (agentCount >= 2) {
        return (
            <BreadcrumbLabel>
                <BreadcrumbLink onClick={onBack} title="Back to all agents (Esc)">
                    <Codicon name="chevron-left" iconSx={{ fontSize: 16, display: "flex" }} />
                    Agents
                </BreadcrumbLink>
                {separator}
                <BreadcrumbName>{selectedAgentName}</BreadcrumbName>
            </BreadcrumbLabel>
        );
    }
    return (
        <BreadcrumbLabel>
            <BreadcrumbRoot>Agents</BreadcrumbRoot>
            {separator}
            <BreadcrumbName>{selectedAgentName}</BreadcrumbName>
        </BreadcrumbLabel>
    );
}

interface AgentCanvasContentProps {
    level: OverviewLevel;
    projectPath: string;
    agents: ProjectStructureArtifactResponse[];
    agentDefinitions: ProjectStructureArtifactResponse[];
    selectedAgent?: ProjectStructureArtifactResponse;
    onOpenAgent: (agent: AgentSelection) => void;
    onOpenTrigger: (trigger: TriggerSelection) => void;
    onAddTrigger: (agent: AgentSelection) => void;
    onFocusReady: () => void;
}

function AgentCanvasContent(props: AgentCanvasContentProps) {
    const { level, projectPath, agents, agentDefinitions, selectedAgent, onOpenAgent, onOpenTrigger, onAddTrigger, onFocusReady } = props;
    if (level === "overview") {
        return (
            <LazyAgentTopology
                projectPath={projectPath}
                agents={agents}
                agentDefinitions={agentDefinitions}
                onOpenAgent={onOpenAgent}
                onOpenTrigger={onOpenTrigger}
                onAddTrigger={onAddTrigger}
            />
        );
    }
    if (!selectedAgent) {
        return null;
    }
    return (
        <LazyFocusFlowDiagram
            key={agentKey(selectedAgent)}
            embedded={true}
            projectPath={projectPath}
            filePath={selectedAgent.path}
            position={selectedAgent.position}
            view={selectedAgent.moduleName === "ai" ? FOCUS_FLOW_DIAGRAM_VIEW.AGENT : FOCUS_FLOW_DIAGRAM_VIEW.TYPED_AGENT}
            onUpdate={() => { }}
            onReady={onFocusReady}
        />
    );
}

export function AgentBuilderOverview({ projectPath, agentFocus }: AgentBuilderOverviewProps) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const [isInProject, setIsInProject] = useState(false);
    const [selectedKey, setSelectedKeyState] = useState<string | undefined>(() => rememberedKeys.get(projectPath));
    const [level, setLevelState] = useState<OverviewLevel>(() => rememberedLevel.get(projectPath) ?? "overview");
    const previousAgentCountRef = useRef<number>(-1);
    const pendingRenameRef = useRef<{ artifact: ProjectStructureArtifactResponse; agentsAtStash: ProjectStructureArtifactResponse[] }>();
    const [showAddAgent, setShowAddAgent] = useState(false);
    const [showAddLibraryArtifact, setShowAddLibraryArtifact] = useState(false);
    const [deployAnchor, setDeployAnchor] = useState<HTMLElement | null>(null);
    const [canvasReady, setCanvasReady] = useState(false);
    // Only true once the empty state has actually been on screen, so opening a
    // project that already has an agent never flashes it.
    const [emptyMounted, setEmptyMounted] = useState(false);
    const compactHeader = useCompactHeader();
    const { isTracingEnabled, toggleTracing } = useTracingStatus(rpcClient, projectPath);
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

    const setSelectedKey = useCallback((key: string) => {
        rememberedKeys.set(projectPath, key);
        setSelectedKeyState(key);
    }, [projectPath]);

    const setLevel = useCallback((next: OverviewLevel) => {
        if (agents.length >= 2) {
            rememberedLevel.set(projectPath, next);
        }
        setLevelState(next);
    }, [projectPath, agents.length]);

    const isLibrary = projectStructure?.isLibrary ?? false;

    const selectedAgent = useMemo(
        () => agents.find((agent) => agentKey(agent) === selectedKey) ?? agents[0],
        [agents, selectedKey]
    );

    useEffect(() => {
        if (!selectedKey && agents.length > 0) {
            setSelectedKey(agentKey(agents[0]));
        }
    }, [agents, selectedKey, setSelectedKey]);

    // Landing rule: 0/1 agents force the single-agent page; ≥2 restores the last level this
    // package was drilled to this session, defaulting to the overview on a fresh open.
    useEffect(() => {
        if (previousAgentCountRef.current === agents.length) {
            return;
        }
        previousAgentCountRef.current = agents.length;
        setLevel(landingLevel(agents.length, rememberedLevel.get(projectPath)));
    }, [agents.length, projectPath, setLevel]);

    useEffect(() => rpcClient.onIdentifierUpdated((artifacts) => {
        const renamed = artifacts?.find((artifact) => artifact.type === DIRECTORY_MAP.AGENT);
        if (renamed) {
            pendingRenameRef.current = { artifact: renamed, agentsAtStash: agents };
        }
    }), [rpcClient, agents]);

    useEffect(() => {
        const pending = pendingRenameRef.current;
        const staleSelection = selectedKey && !agents.some((agent) => agentKey(agent) === selectedKey);
        if (pending && pending.agentsAtStash !== agents) {
            pendingRenameRef.current = undefined;
            if (staleSelection) {
                setSelectedKey(agentKey(pending.artifact));
            }
            return;
        }
        // No rename in flight: a stale selection while drilled means the agent was deleted
        // elsewhere. Land back on the overview rather than silently focusing another agent.
        if (!pending && staleSelection && level === "agent" && agents.length >= 2) {
            setLevel("overview");
        }
    }, [agents, selectedKey, setSelectedKey, level, setLevel]);

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
        setSelectedKey(agentKey(match));
        setLevel("agent");
        setShowAddAgent(false);
    }, [agents, agentFocus, setSelectedKey, setLevel]);

    useEffect(() => {
        if (level !== "agent" || agents.length < 2) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || showAddAgent || showAddLibraryArtifact || deployAnchor) {
                return;
            }
            setLevel("overview");
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [level, agents.length, showAddAgent, showAddLibraryArtifact, deployAnchor, setLevel]);

    if (projectStructure && !hasAgents) {
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
        if (!hasAgents) {
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
    }, [projectStructure, hasAgents]);

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
            setSelectedKey(agentKey(match));
        }
        setLevel("agent");
    }, [agents, setSelectedKey, setLevel]);

    const handleOpenTrigger = useCallback((trigger: TriggerSelection) => {
        openTrigger(rpcClient, trigger);
    }, [rpcClient]);

    // The trigger generator calls a plain ai:Agent with `.` and a typed agent with `->`, keyed on the agent's org.
    const handleAddTriggerFromCanvas = useCallback(async (agent: AgentSelection) => {
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

    const deployMenuItems = useMemo(() => {
        const items = [
            {
                id: "docker",
                label: menuLabel("package", "Build Docker Image"),
                disabled: !hasDeployable,
                onClick: () => {
                    rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.DOCKER);
                },
            },
            {
                id: "vm",
                label: menuLabel("server", "Build Executable"),
                disabled: !hasDeployable,
                onClick: () => {
                    rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.JAR);
                },
            },
        ];
        if (platformExtState.isExtInstalled) {
            items.unshift({
                id: "cloud",
                label: menuLabel("cloud-upload", "Deploy to WSO2 Cloud"),
                disabled: !hasDeployable,
                onClick: () => {
                    rpcClient.getBIDiagramRpcClient().deployProject({ integrationTypes: deployableIntegrationTypes });
                },
            });
        }
        return items;
    }, [platformExtState.isExtInstalled, hasDeployable, deployableIntegrationTypes, rpcClient]);

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
                        onClick={(e: React.MouseEvent<HTMLElement | SVGSVGElement>) =>
                            setDeployAnchor(e.currentTarget as HTMLElement)
                        }
                        tooltip={compactHeader ? "Deploy" : undefined}
                        buttonSx={{ padding: "4px 8px" }}
                    >
                        <Codicon name="cloud-upload" sx={{ marginRight: compactHeader ? 0 : 5 }} />
                        {!compactHeader && " Deploy"}
                        <Codicon name="chevron-down" sx={{ marginLeft: 4, fontSize: 12 }} />
                    </Button>
                    <Popover
                        open={Boolean(deployAnchor)}
                        anchorEl={deployAnchor}
                        handleClose={() => setDeployAnchor(null)}
                        sx={{ padding: 0, borderRadius: 4 }}
                        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                        transformOrigin={{ vertical: "top", horizontal: "right" }}
                    >
                        <Menu>
                            {deployMenuItems.map((item) => (
                                <MenuItem
                                    key={item.id}
                                    item={item.disabled ? { ...item, onClick: () => undefined } : item}
                                    sx={item.disabled ? { opacity: 0.5 } : undefined}
                                    onClick={() => setDeployAnchor(null)}
                                />
                            ))}
                        </Menu>
                    </Popover>
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
                            {hasAgents && (
                                <Layer $show={canvasVisible}>
                                    <Strip>
                                        <AgentBreadcrumb
                                            level={level}
                                            agentCount={agents.length}
                                            selectedAgentName={selectedAgent?.name}
                                            onBack={() => setLevel("overview")}
                                        />
                                        <AddAgentButton onClick={() => setShowAddAgent(true)} title="Add an agent to this project">
                                            <Icon name="bi-plus" sx={{ fontSize: 16, width: 16, height: 16 }} />
                                            Add Agent
                                        </AddAgentButton>
                                    </Strip>
                                    <CanvasSlot>
                                        <React.Suspense
                                            fallback={
                                                <CenteredSlot>
                                                    <ProgressRing color={ThemeColors.PRIMARY} />
                                                </CenteredSlot>
                                            }
                                        >
                                            <AgentCanvasContent
                                                level={level}
                                                projectPath={projectPath}
                                                agents={agents}
                                                agentDefinitions={agentDefinitions}
                                                selectedAgent={selectedAgent}
                                                onOpenAgent={handleOpenAgentFromCanvas}
                                                onOpenTrigger={handleOpenTrigger}
                                                onAddTrigger={handleAddTriggerFromCanvas}
                                                onFocusReady={handleCanvasReady}
                                            />
                                        </React.Suspense>
                                    </CanvasSlot>
                                </Layer>
                            )}
                            {(!hasAgents || emptyMounted) && (
                                <Layer $show={!canvasVisible}>
                                    <EmptyState
                                        isLibrary={isLibrary}
                                        onCreateFromScratch={() =>
                                            isLibrary ? setShowAddLibraryArtifact(true) : setShowAddAgent(true)
                                        }
                                    />
                                </Layer>
                            )}
                        </Stage>
                    </Panel>
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
        </>
    );
}
