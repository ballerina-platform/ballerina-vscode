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
import { useQuery } from "@tanstack/react-query";
import {
    BI_COMMANDS,
    BuildMode,
    DIRECTORY_MAP,
    EVENT_TYPE,
    MACHINE_VIEW,
    ProjectStructureResponse,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon, Menu, MenuItem, Popover, ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { PageHeader } from "../components/PageHeader";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { getWorkspaceProjectScopes } from "../PackageOverview/utils";

const Page = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
`;

const MainContent = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
`;

const SectionTitle = styled.h2`
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
`;

const Card = styled.div`
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background: var(--vscode-editorWidget-background);
    cursor: pointer;
    transition: border-color 150ms ease, background-color 150ms ease;

    &:hover {
        border-color: ${ThemeColors.PRIMARY};
        background: var(--vscode-toolbar-hoverBackground);
    }

    &:hover .card-delete {
        opacity: 1;
    }
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
`;

const IconTile = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 8px;
    color: ${ThemeColors.PRIMARY};
    background: color-mix(in srgb, ${ThemeColors.PRIMARY} 12%, transparent);
`;

const CardName = styled.span`
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const DeleteButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    opacity: 0;
    transition: opacity 150ms ease, color 150ms ease;

    &:hover {
        color: var(--vscode-errorForeground);
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

const PillRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 22px;
    align-items: center;
`;

const Pill = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const PillLabel = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const MutedNote = styled.span`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 72px 24px;
    text-align: center;
    border: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
`;

const EmptyHeading = styled.h3`
    margin: 0;
    font-size: 18px;
    font-weight: 400;
    color: var(--vscode-foreground);
`;

const CenteredSlot = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
`;

const MenuItemLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px;
    min-width: 180px;
`;

interface AgentBuilderWorkspaceOverviewProps {
    isInDevant: boolean;
}

export function AgentBuilderWorkspaceOverview({ isInDevant }: AgentBuilderWorkspaceOverviewProps) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [projectCollection, setProjectCollection] = useState<ProjectStructureResponse>();
    const [deployAnchor, setDeployAnchor] = useState<HTMLElement | null>(null);

    const { data: devantMetadata } = useQuery({
        queryKey: ["project-devant-metadata"],
        queryFn: () => rpcClient.getBIDiagramRpcClient().getWorkspaceDevantMetadata(),
    });

    const fetchContext = useCallback(() => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then(setProjectCollection);
    }, [rpcClient]);

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

    const packages = useMemo(() => {
        return (projectCollection?.projects ?? []).map((project) => ({
            id: project.projectName,
            name: project.projectTitle || project.projectName,
            projectPath: project.projectPath,
            isLibrary: project.isLibrary ?? false,
            agents: (project.directoryMap[DIRECTORY_MAP.AGENT] ?? []).map((agent) => agent.name),
            agentDefinitions: (project.directoryMap[DIRECTORY_MAP.AGENT_DEFINITION] ?? []).map((agent) => agent.name),
        }));
    }, [projectCollection]);

    const libraryProjectPaths = useMemo(() => {
        return new Set(
            (projectCollection?.projects ?? [])
                .filter((project) => project.isLibrary && project.projectPath)
                .map((project) => project.projectPath)
        );
    }, [projectCollection]);

    const projectScopes = useMemo(() => getWorkspaceProjectScopes(projectCollection), [projectCollection]);

    const undeployedProjectScopes = useMemo(() => {
        const deployedPaths = new Set(
            (devantMetadata?.projectsMetadata ?? []).filter((p) => p.hasComponent).map((p) => p.projectPath)
        );
        return projectScopes.filter(
            (scope) => !deployedPaths.has(scope.projectPath) && !libraryProjectPaths.has(scope.projectPath)
        );
    }, [projectScopes, devantMetadata, libraryProjectPaths]);

    const hasDeployable = useMemo(() => {
        return projectScopes.some(
            (scope) => scope.integrationTypes.length > 0 && !libraryProjectPaths.has(scope.projectPath)
        );
    }, [projectScopes, libraryProjectPaths]);

    const validateTitle = useCallback((value: string): string => {
        const trimmed = value.trim();
        if (!trimmed) {
            return "You are required to enter a project name.";
        }
        if (!/^[a-zA-Z]/.test(trimmed)) {
            return "Name must start with an alphabetical letter.";
        }
        if (trimmed.length < 3) {
            return "The name must have at least three characters.";
        }
        if (/[^a-zA-Z0-9\-_ ]/.test(trimmed)) {
            return "The name cannot contain special characters.";
        }
        return "";
    }, []);

    const handleTitleUpdate = useCallback(
        async (newTitle: string) => {
            if (!projectCollection?.workspacePath) return;
            await rpcClient.getBIDiagramRpcClient().updateProjectTitle({
                projectPath: projectCollection.workspacePath,
                title: newTitle,
            });
            setProjectCollection((prev) => (prev ? { ...prev, workspaceTitle: newTitle } : prev));
        },
        [projectCollection?.workspacePath, rpcClient]
    );

    const handleAdd = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.ADD_PROJECT] });
    };

    const handleOpenPackage = (packageId: string, projectPath: string) => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: { view: MACHINE_VIEW.PackageOverview, projectPath, package: packageId },
        });
    };

    const handleDelete = (projectPath: string, event: React.MouseEvent) => {
        event.stopPropagation();
        rpcClient.getBIDiagramRpcClient().deleteProject({ projectPath });
    };

    const deployMenuItems = useMemo(() => {
        const items = [];
        if (platformExtState.isExtInstalled) {
            items.push({
                id: "cloud",
                label: (
                    <MenuItemLabel>
                        <Codicon name="cloud-upload" /> Deploy to WSO2 Cloud
                    </MenuItemLabel>
                ),
                disabled: undeployedProjectScopes.length === 0,
                onClick: () => {
                    rpcClient.getBIDiagramRpcClient().deployWorkspace({
                        projectScopes: undeployedProjectScopes,
                        rootDirectory: projectCollection?.workspacePath ?? "",
                    });
                },
            });
        }
        if (!isInDevant) {
            items.push(
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
                }
            );
        }
        return items;
    }, [
        platformExtState.isExtInstalled,
        isInDevant,
        hasDeployable,
        undeployedProjectScopes,
        projectCollection?.workspacePath,
        rpcClient,
    ]);

    const headerActions = deployMenuItems.length > 0 && (
        <>
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

    if (!projectCollection) {
        return (
            <Page>
                <CenteredSlot>
                    <ProgressRing color={ThemeColors.PRIMARY} />
                </CenteredSlot>
            </Page>
        );
    }

    return (
        <Page>
            <PageHeader
                title={projectCollection.workspaceTitle || projectCollection.workspaceName || ""}
                subtitle="Project"
                actions={headerActions}
                onTitleEdit={handleTitleUpdate}
                validateTitle={validateTitle}
            />
            <MainContent>
                <SectionHeader>
                    <SectionTitle>Agentic Integrations & Libraries</SectionTitle>
                    {packages.length > 0 && (
                        <Button appearance="primary" onClick={handleAdd}>
                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add
                        </Button>
                    )}
                </SectionHeader>
                {packages.length === 0 ? (
                    <EmptyState>
                        <EmptyHeading>Your project is empty</EmptyHeading>
                        <MutedNote>Start by adding agentic integrations and libraries to your project</MutedNote>
                        <Button appearance="primary" onClick={handleAdd} sx={{ marginTop: 8 }}>
                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add Agentic Integration or Library
                        </Button>
                    </EmptyState>
                ) : (
                    <CardGrid>
                        {packages.map((item) => (
                            <Card key={item.id} onClick={() => handleOpenPackage(item.id, item.projectPath)}>
                                <CardHeader>
                                    <IconTile>
                                        <Icon
                                            name={item.isLibrary ? "library" : "bi-ai-agent"}
                                            isCodicon={item.isLibrary}
                                            sx={{ width: 20, height: 20 }}
                                            iconSx={{ fontSize: 20, color: "inherit" }}
                                        />
                                    </IconTile>
                                    <CardName title={item.name}>{item.name}</CardName>
                                    <DeleteButton
                                        className="card-delete"
                                        title={item.isLibrary ? "Delete library" : "Delete integration"}
                                        onClick={(e) => handleDelete(item.projectPath, e)}
                                    >
                                        <Codicon name="trash" iconSx={{ fontSize: 16 }} />
                                    </DeleteButton>
                                    <Codicon name="chevron-right" iconSx={{ fontSize: 16, opacity: 0.5 }} />
                                </CardHeader>
                                <PillRow>
                                    {item.isLibrary && (
                                        <Pill>
                                            <PillLabel>Library</PillLabel>
                                        </Pill>
                                    )}
                                    {[...item.agents, ...item.agentDefinitions].map((name) => (
                                        <Pill key={name}>
                                            <Icon
                                                name="bi-ai-agent"
                                                sx={{ width: 13, height: 13 }}
                                                iconSx={{ fontSize: 13, color: ThemeColors.PRIMARY }}
                                            />
                                            <PillLabel>{name}</PillLabel>
                                        </Pill>
                                    ))}
                                    {item.agents.length === 0 && item.agentDefinitions.length === 0 && (
                                        <MutedNote>No agents yet</MutedNote>
                                    )}
                                </PillRow>
                            </Card>
                        ))}
                    </CardGrid>
                )}
            </MainContent>
        </Page>
    );
}
