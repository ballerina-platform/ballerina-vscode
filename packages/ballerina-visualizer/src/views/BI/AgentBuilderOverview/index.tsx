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
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, Menu, MenuItem, Popover, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { PageHeader } from "../components/PageHeader";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { getIntegrationTypes, validateComponentName } from "../PackageOverview/utils";
import { AgentTabs, agentKey } from "./AgentTabs";
import { EmptyState } from "./EmptyState";

const LazyFocusFlowDiagram = React.lazy(() =>
    import("../FocusFlowDiagram").then((m) => ({ default: m.BIFocusFlowDiagram }))
);
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
    padding: 8px 16px 16px;
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
`;

const Layer = styled.div<{ $show?: boolean }>`
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    opacity: ${(props: { $show?: boolean }) => (props.$show ? 1 : 0)};
    transform: ${(props: { $show?: boolean }) => (props.$show ? "none" : "scale(0.99)")};
    pointer-events: ${(props: { $show?: boolean }) => (props.$show ? "auto" : "none")};
    transition: opacity 500ms ease, transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1);

    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
`;

/** The focus diagram wraps itself in a 100vh `View`. */
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

export interface AgentFocusRequest {
    path: string;
    startLine: number;
    requestId: number;
}

interface AgentBuilderOverviewProps {
    projectPath: string;
    agentFocus?: AgentFocusRequest;
}

export function AgentBuilderOverview({ projectPath, agentFocus }: AgentBuilderOverviewProps) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const [isInProject, setIsInProject] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string>();
    const [showAddAgent, setShowAddAgent] = useState(false);
    const [showAddLibraryArtifact, setShowAddLibraryArtifact] = useState(false);
    const [deployAnchor, setDeployAnchor] = useState<HTMLElement | null>(null);
    const [isTracingEnabled, setIsTracingEnabled] = useState(false);
    const [canvasReady, setCanvasReady] = useState(false);
    // Only true once the empty state has actually been on screen, so opening a
    // project that already has an agent never flashes it.
    const [emptyMounted, setEmptyMounted] = useState(false);
    const compactHeader = useCompactHeader();
    const togglingTracingRef = useRef(false);
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

    const fetchContextRef = useRef(fetchContext);
    fetchContextRef.current = fetchContext;

    useEffect(() => {
        if (!rpcClient) return;
        return rpcClient.onProjectContentUpdated((state: boolean) => {
            if (state) {
                fetchContextRef.current();
            }
        });
    }, [rpcClient]);

    const agents = useMemo(
        () => projectStructure?.directoryMap?.[DIRECTORY_MAP.AGENT] ?? [],
        [projectStructure]
    );

    const isLibrary = projectStructure?.isLibrary ?? false;

    const selectedAgent = useMemo(
        () => agents.find((agent) => agentKey(agent) === selectedKey) ?? agents[0],
        [agents, selectedKey]
    );

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
        setShowAddAgent(false);
    }, [agents, agentFocus]);

    // The fade belongs to the agent arriving while the empty state is on screen.
    // Navigating to a project that already has one shows the canvas outright, and
    // this must not count the render before projectStructure resolves.
    if (projectStructure && !selectedAgent) {
        sawEmptyRef.current = true;
    }
    const canvasVisible = canvasReady || !sawEmptyRef.current;

    const handleCanvasReady = useCallback(() => {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => setCanvasReady(true), READY_SETTLE_MS);
    }, []);

    useEffect(() => {
        if (!projectStructure) {
            return;
        }
        if (!selectedAgent) {
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
    }, [projectStructure, selectedAgent]);

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
        return validateComponentName(value.trim(), false) ?? "";
    }, []);

    const handleTitleUpdate = useCallback(
        async (newTitle: string) => {
            await rpcClient.getBIDiagramRpcClient().updatePackageTitle({ packagePath: projectPath, title: newTitle });
            setProjectStructure((prev) => (prev ? { ...prev, projectTitle: newTitle } : prev));
        },
        [projectPath, rpcClient]
    );

    const handleConfigure = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: { view: MACHINE_VIEW.ViewConfigVariables },
        });
    };

    const handleRun = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.BI_RUN_PROJECT] });
    };

    const checkTracingStatus = useCallback(async () => {
        try {
            const status = await rpcClient.getAgentChatRpcClient().getTracingStatus({ projectPath });
            setIsTracingEnabled(status.enabled);
        } catch (error) {
            setIsTracingEnabled(false);
        }
    }, [rpcClient, projectPath]);

    useEffect(() => {
        checkTracingStatus();
    }, [checkTracingStatus]);

    const checkTracingStatusRef = useRef(checkTracingStatus);
    checkTracingStatusRef.current = checkTracingStatus;

    useEffect(() => {
        rpcClient.getAgentChatRpcClient().onTracingStatusChanged(() => {
            checkTracingStatusRef.current();
        });
    }, [rpcClient]);

    const handleToggleTracing = async () => {
        if (togglingTracingRef.current) {
            return;
        }
        togglingTracingRef.current = true;
        try {
            const command = isTracingEnabled ? "ballerina.disableTracing" : "ballerina.enableTracing";
            await rpcClient.getCommonRpcClient().executeCommand({ commands: [command] });
            await checkTracingStatus();
        } finally {
            togglingTracingRef.current = false;
        }
    };

    const deployMenuItems = useMemo(() => {
        const items = [
            {
                id: "docker",
                label: (
                    <MenuItemLabel>
                        <Codicon name="package" /> Build Docker Image
                    </MenuItemLabel>
                ),
                disabled: !hasDeployable,
                onClick: () => {
                    rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.DOCKER);
                },
            },
            {
                id: "vm",
                label: (
                    <MenuItemLabel>
                        <Codicon name="server" /> Build Executable
                    </MenuItemLabel>
                ),
                disabled: !hasDeployable,
                onClick: () => {
                    rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.JAR);
                },
            },
        ];
        if (platformExtState.isExtInstalled) {
            items.unshift({
                id: "cloud",
                label: (
                    <MenuItemLabel>
                        <Codicon name="cloud-upload" /> Deploy to WSO2 Cloud
                    </MenuItemLabel>
                ),
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
                        onClick={handleToggleTracing}
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
                            {selectedAgent && (
                                <Layer $show={canvasVisible}>
                                    <AgentTabs
                                        agents={agents}
                                        selectedKey={agentKey(selectedAgent)}
                                        onSelect={(agent) => setSelectedKey(agentKey(agent))}
                                        onAdd={() => setShowAddAgent(true)}
                                    />
                                    <CanvasSlot>
                                        <React.Suspense
                                            fallback={
                                                <CenteredSlot>
                                                    <ProgressRing color={ThemeColors.PRIMARY} />
                                                </CenteredSlot>
                                            }
                                        >
                                            <LazyFocusFlowDiagram
                                                key={agentKey(selectedAgent)}
                                                embedded={true}
                                                projectPath={projectPath}
                                                filePath={selectedAgent.path}
                                                position={selectedAgent.position}
                                                view={
                                                    selectedAgent.moduleName === "ai"
                                                        ? FOCUS_FLOW_DIAGRAM_VIEW.AGENT
                                                        : FOCUS_FLOW_DIAGRAM_VIEW.TYPED_AGENT
                                                }
                                                onUpdate={() => { }}
                                                onReady={handleCanvasReady}
                                            />
                                        </React.Suspense>
                                    </CanvasSlot>
                                </Layer>
                            )}
                            {(!selectedAgent || emptyMounted) && (
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
