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

const MenuItemLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    min-width: 180px;
`;

interface AgentBuilderOverviewProps {
    projectPath: string;
}

export function AgentBuilderOverview({ projectPath }: AgentBuilderOverviewProps) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const [isInProject, setIsInProject] = useState(false);
    const [selectedKey, setSelectedKey] = useState<string>();
    const [showAddAgent, setShowAddAgent] = useState(false);
    const [deployAnchor, setDeployAnchor] = useState<HTMLElement | null>(null);

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

    const selectedAgent = useMemo(
        () => agents.find((agent) => agentKey(agent) === selectedKey) ?? agents[0],
        [agents, selectedKey]
    );

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
            <Button appearance="icon" onClick={handleConfigure} buttonSx={{ padding: "4px 8px" }}>
                <Icon name="bi-settings" sx={{ marginRight: 5, fontSize: "16px", width: "16px" }} />
                Configure
            </Button>
            <Button appearance="icon" onClick={handleRun} buttonSx={{ padding: "4px 8px" }}>
                <Codicon name="play" sx={{ marginRight: 5 }} /> Run
            </Button>
            <Button
                appearance="icon"
                onClick={(e: React.MouseEvent<HTMLElement | SVGSVGElement>) =>
                    setDeployAnchor(e.currentTarget as HTMLElement)
                }
                buttonSx={{ padding: "4px 8px" }}
            >
                <Codicon name="cloud-upload" sx={{ marginRight: 5 }} /> Deploy
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
                    <Panel bordered={!!selectedAgent}>
                        {agents.length > 0 && (
                            <AgentTabs
                                agents={agents}
                                selectedKey={selectedAgent ? agentKey(selectedAgent) : ""}
                                onSelect={(agent) => setSelectedKey(agentKey(agent))}
                                onAdd={() => setShowAddAgent(true)}
                            />
                        )}
                        {selectedAgent ? (
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
                                        onReady={() => { }}
                                    />
                                </React.Suspense>
                            </CanvasSlot>
                        ) : (
                            <EmptyState onCreateFromScratch={() => setShowAddAgent(true)} />
                        )}
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
        </>
    );
}
