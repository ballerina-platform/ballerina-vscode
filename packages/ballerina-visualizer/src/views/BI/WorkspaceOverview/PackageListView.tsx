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

import React, { useMemo } from 'react';
import styled from '@emotion/styled';
import { Codicon, Icon, Tooltip, Typography } from '@wso2/ui-toolkit';
import { DIRECTORY_MAP, EVENT_TYPE, MACHINE_VIEW, ProjectStructureResponse, SCOPE } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { getIntegrationTypes } from '../PackageOverview/utils';

export const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    width: 100%;
`;

export const Container = styled.div`
    padding: 0 20px 20px 20px;
`;

const PackageCard = styled.div`
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px;
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    &:hover .delete-button {
        opacity: 1;
    }

    &:active {
        transform: translateY(0);
    }
`;

const PackageHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
`;

const PackageTitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    line-height: 1;
`;

const PackageIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
`;

const PackageName = styled(Typography)`
    font-weight: 500;
    font-size: 15px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    display: flex;
    align-items: center;
`;

const PackageActions = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
`;

const DeleteButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
    color: var(--vscode-foreground);

    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
        color: var(--vscode-errorForeground);
    }

    &:active {
        background: var(--vscode-toolbar-activeBackground);
    }
`;

const ChipContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 28px;
`;

const MetaRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
`;

const Chip = styled.div<{ color: string }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    background: color-mix(in srgb, ${(props: { color: string }) => props.color} 12%, transparent);
    color: ${(props: { color: string }) => props.color};
    border: 1px solid color-mix(in srgb, ${(props: { color: string }) => props.color} 25%, transparent);
    text-transform: capitalize;
    white-space: nowrap;
`;

const ICPBadge = styled.div`
    --icp-badge-green: #00b894;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.03em;
    color: var(--icp-badge-green);
    background: color-mix(in srgb, var(--icp-badge-green) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--icp-badge-green) 55%, transparent);
    white-space: nowrap;
`;

const ICPBadgeIcon = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    line-height: 1;
`;

const ICPBadgeText = styled.span`
    display: inline-flex;
    align-items: center;
    height: 100%;
    line-height: 1;
`;

export interface PackageListViewProps {
    projectCollection: ProjectStructureResponse;
    icpStatusByProjectPath?: Record<string, boolean>;
    showICPBadge?: boolean;
}

const getTypeColor = (type: SCOPE): string => {
    const colors: Record<SCOPE, string> = {
        [SCOPE.AUTOMATION]: 'var(--vscode-charts-blue)',
        [SCOPE.INTEGRATION_AS_API]: 'var(--vscode-charts-green)',
        [SCOPE.EVENT_INTEGRATION]: 'var(--vscode-charts-orange)',
        [SCOPE.FILE_INTEGRATION]: 'var(--vscode-charts-purple)',
        [SCOPE.AI_AGENT]: 'var(--vscode-terminal-ansiBlue)',
        [SCOPE.MCP]: 'var(--vscode-terminal-ansiCyan)',
        [SCOPE.LIBRARY]: 'var(--vscode-charts-foreground)',
        [SCOPE.WORKFLOW]: 'var(--vscode-charts-yellow)',
        [SCOPE.ANY]: 'var(--vscode-charts-gray)'
    };
    return colors[type];
};

const getTypeIcon = (type: SCOPE): { name: string; source: 'icon' | 'codicon' } => {
    const icons: Record<SCOPE, { name: string; source: 'icon' | 'codicon' }> = {
        [SCOPE.AUTOMATION]: { name: 'task', source: 'icon' },
        [SCOPE.INTEGRATION_AS_API]: { name: 'cloud', source: 'codicon' },
        [SCOPE.EVENT_INTEGRATION]: { name: 'Event', source: 'icon' },
        [SCOPE.FILE_INTEGRATION]: { name: 'file', source: 'icon' },
        [SCOPE.AI_AGENT]: { name: 'bi-ai-agent', source: 'icon' },
        [SCOPE.MCP]: { name: 'bi-mcp', source: 'icon' },
        [SCOPE.LIBRARY]: { name: 'library', source: 'codicon' },
        [SCOPE.WORKFLOW]: { name: 'bi-flowchart', source: 'icon' },
        [SCOPE.ANY]: { name: 'package', source: 'codicon' }
    };
    return icons[type];
};

const getTypeLabel = (type: SCOPE): string => {
    const labels: Record<SCOPE, string> = {
        [SCOPE.AUTOMATION]: 'Automation',
        [SCOPE.INTEGRATION_AS_API]: 'API Integration',
        [SCOPE.EVENT_INTEGRATION]: 'Event Integration',
        [SCOPE.FILE_INTEGRATION]: 'File Integration',
        [SCOPE.AI_AGENT]: 'AI Agent',
        [SCOPE.MCP]: 'MCP Server',
        [SCOPE.LIBRARY]: 'Library',
        [SCOPE.WORKFLOW]: 'Workflow',
        [SCOPE.ANY]: ''
    };
    return labels[type];
};

const renderIcon = (iconConfig: { name: string; source: 'icon' | 'codicon' }) => {
    const iconProps = {
        iconSx: { fontSize: 25, opacity: 0.85 },
        sx: { height: 25, width: 25 }
    };

    return iconConfig.source === 'icon' ? (
        <Icon name={iconConfig.name} {...iconProps} />
    ) : (
        <Codicon name={iconConfig.name} {...iconProps} />
    );
};

const renderPackageIcon = (types: SCOPE[]) => {
    if (types.length > 0) {
        const iconConfig = getTypeIcon(types[0]);
        return renderIcon(iconConfig);
    }
    
    return renderIcon({ name: 'project', source: 'codicon' });
};

export function PackageListView(props: PackageListViewProps) {
    const { rpcClient } = useRpcContext();
    const projectCollection = props.projectCollection;
    const icpStatusByProjectPath = props.icpStatusByProjectPath ?? {};
    const showICPBadge = props.showICPBadge ?? false;

    const integrationItems = useMemo(() => {
        return projectCollection.projects.map((project) => {
            return {
                id: project.projectName,
                name: project.projectTitle,
                projectPath: project.projectPath,
                isLibrary: project.isLibrary ?? false,
                types: getIntegrationTypes(project),
                hasAgentDefinitions: Boolean(
                    project.isLibrary && project.directoryMap[DIRECTORY_MAP.AGENT_DEFINITION]?.length
                )
            }
        });
    }, [projectCollection]);

    const handleItemClick = (itemId: string, event: React.MouseEvent) => {
        // Don't trigger if clicking on delete button
        if ((event.target as HTMLElement).closest('.delete-button')) {
            return;
        }
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                projectPath: integrationItems.find((item) => item.id === itemId)?.projectPath,
                view: MACHINE_VIEW.PackageOverview,
                package: itemId
            },
        });
    };

    const handleDeleteClick = (projectPath: string, isLibrary: boolean, event: React.MouseEvent) => {
        event.stopPropagation();
        console.log(`Deleting ${isLibrary ? "library" : "integration"}: ${projectPath}`);
        rpcClient.getBIDiagramRpcClient().deleteProject({
            projectPath: projectPath
        });
    };

    return (
        <Container>
            <CardGrid>
                {integrationItems.map((item) => (
                    <PackageCard key={item.id} onClick={(e) => handleItemClick(item.id, e)}>
                        <PackageHeader>
                            <PackageTitleRow title={item.name}>
                                <PackageIcon>
                                    {renderPackageIcon(item.types)}
                                </PackageIcon>
                                <PackageName>{item.name}</PackageName>
                            </PackageTitleRow>
                            <PackageActions>
                                <DeleteButton 
                                    className="delete-button"
                                    onClick={(e) => handleDeleteClick(item.projectPath, item.isLibrary, e)}
                                    title={item.isLibrary ? "Delete library" : "Delete integration"}
                                >
                                    <Codicon name="trash" iconSx={{ fontSize: 18 }} />
                                </DeleteButton>
                                <Codicon name="chevron-right" iconSx={{ fontSize: 18, opacity: 0.5 }} />
                            </PackageActions>
                        </PackageHeader>
                        <MetaRow>
                            <ChipContainer>
                                {item.types.length > 0 && item.types.map((type) => (
                                    <Chip key={type} color={getTypeColor(type)}>
                                        {type !== SCOPE.ANY ? getTypeLabel(type) : ''}
                                    </Chip>
                                ))}
                                {item.hasAgentDefinitions && (
                                    <Chip color="var(--vscode-terminal-ansiBlue)">
                                        Agent Definition
                                    </Chip>
                                )}
                            </ChipContainer>
                            {showICPBadge && !item.isLibrary && icpStatusByProjectPath[item.projectPath] && (
                                <Tooltip content="Integration Control Plane is enabled for this integration">
                                    <ICPBadge>
                                        <ICPBadgeIcon>
                                            <Codicon name="pass-filled" iconSx={{ fontSize: 14, display: "block", lineHeight: 1 }} />
                                        </ICPBadgeIcon>
                                        <ICPBadgeText>ICP</ICPBadgeText>
                                    </ICPBadge>
                                </Tooltip>
                            )}
                        </MetaRow>
                    </PackageCard>
                ))}
            </CardGrid>
        </Container>
    );
}
