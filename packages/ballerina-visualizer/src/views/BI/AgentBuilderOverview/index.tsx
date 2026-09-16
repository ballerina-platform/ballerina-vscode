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
    MACHINE_VIEW,
    ProjectStructure,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AgentSelection, EntrySelection, TriggerSelection } from "@wso2/component-diagram";
import { Button, Codicon, Icon, Menu, MenuItem, Popover, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { PageHeader } from "../components/PageHeader";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { getIntegrationTypes, validateComponentName, useProjectContentRefresh } from "../PackageOverview/utils";
import { useTracingStatus } from "../../../hooks/useProductMode";
import { EmptyState } from "./EmptyState";
import { openAgent, openServiceConfig, openTrigger } from "../AgentTopology/topologyNavigation";
import { entryRange } from "../AgentTopology/topologyLocation";
import { openAddAgentTrigger } from "../AIChatAgent/utils";

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

const OVERVIEW_TITLE = "Agent Overview";

interface AgentBuilderOverviewProps {
    projectPath: string;
}

export function AgentBuilderOverview({ projectPath }: AgentBuilderOverviewProps) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const [isInProject, setIsInProject] = useState(false);
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

    const isLibrary = projectStructure?.isLibrary ?? false;

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
            openAgent(rpcClient, match);
        }
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
                                        <BreadcrumbLabel>{OVERVIEW_TITLE}</BreadcrumbLabel>
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
