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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditableTitle } from "../../../components/EditableTitle";
import {
    ProjectStructureResponse,
    SHARED_COMMANDS,
    BI_COMMANDS,
    BuildMode,
    WorkspaceDevantMetadata
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { useQuery } from "@tanstack/react-query";
import { IOpenInConsoleCmdParams, WICommandIds } from "@wso2/wso2-platform-core";
import { Typography, Codicon, ProgressRing, Button, Icon, Divider } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import ReactMarkdown from "react-markdown";
import { AlertBoxWithClose } from "../../AIPanel/AlertBoxWithClose";
import { PackageListView } from "./PackageListView";
import { CopilotHeroBox } from "../../../components/AgentStatusOrb/CopilotHeroBox";
import { getWorkspaceProjectScopes } from "../PackageOverview/utils";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const Description = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

const ButtonContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
`;

const EmptyStateContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px 64px 24px;
    text-align: center;
    min-height: 300px;
`;

const PageLayout = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-dropdown-border);
    flex-shrink: 0;
    margin: 16px 16px 0 16px;
`;

const HeroRow = styled.div`
    margin: 16px 16px 0 16px;
    flex-shrink: 0;
`;

const MainContent = styled.div<{ hasDeployment?: boolean }>`
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 24px;
    display: ${(props: { hasDeployment?: boolean }) => props.hasDeployment ? 'grid' : 'flex'};
    ${(props: { hasDeployment?: boolean }) => props.hasDeployment && `
        grid-template-columns: 3fr 1fr;
        gap: 24px;
    `}
    ${(props: { hasDeployment?: boolean }) => !props.hasDeployment && `
        flex-direction: column;
        gap: 24px;
    `}
`;

const Section = styled.section`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 20px 0 20px;
    margin-bottom: 16px;
`;

const SectionTitle = styled.h2`
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--vscode-foreground);
`;

const SectionActions = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`;

const ContentPanel = styled.div<{ isEmpty?: boolean }>`
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    ${(props: { isEmpty?: boolean }) => !props.isEmpty && `
        min-height: 200px;
    `}
`;

const EmptyReadmeContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    justify-content: center;
    padding: 32px 24px 48px 24px;
    text-align: center;
`;

const ReadmeContent = styled.div`
    padding: 0 20px 20px 20px;
    text-wrap: pretty;
    overflow-wrap: break-word;
    line-height: 1.6;

    p, li, td, th, blockquote {
        overflow-wrap: break-word;
    }

    pre {
        overflow-x: auto;
        overflow-wrap: break-word;
        background: var(--vscode-textCodeBlock-background);
        padding: 12px;
        border-radius: 4px;
    }
    
    code {
        white-space: pre-wrap;
        overflow-wrap: break-word;
    }

    h1, h2, h3, h4, h5, h6 {
        margin-top: 24px;
        margin-bottom: 12px;
        &:first-child {
            margin-top: 0;
        }
    }

    p {
        margin-bottom: 12px;
    }
`;

const TitleContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
    position: relative;
`;

const ProjectTitle = styled.h1`
    font-weight: bold;
    font-size: 1.5rem;
    margin-bottom: 0;
    margin-top: 0;
    transition: opacity 0.40s ease;
    @media (min-width: 768px) {
        font-size: 1.875rem;
    }
`;

const ProjectSubtitle = styled.h2`
    display: none;
    font-weight: 200;
    font-size: 1.5rem;
    opacity: 0.3;
    margin-bottom: 0;
    margin-top: 0;
    @media (min-width: 640px) {
        display: block;
    }

    @media (min-width: 768px) {
        font-size: 1.875rem;
    }
`;

const LeftContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 24px;
    min-height: 0;
`;

const SidePanel = styled.div`
    padding: 0px 10px 10px 10px;
`;

const Title = styled(Typography)`
    margin: 8px 0;
`;

interface DeploymentOptionContainerProps {
    isExpanded: boolean;
}

const DeploymentOptionContainer = styled.div<DeploymentOptionContainerProps>`
    cursor: pointer;
    border: ${(props: DeploymentOptionContainerProps) => props.isExpanded ? '1px solid var(--vscode-welcomePage-tileBorder)' : 'none'};
    background: ${(props: DeploymentOptionContainerProps) => props.isExpanded ? 'var(--vscode-welcomePage-tileBackground)' : 'transparent'};
    border-radius: 6px;
    display: flex;
    overflow: hidden;
    width: 100%;
    padding: 10px;
    flex-direction: column;
    margin-bottom: 8px;

    &:hover {
        background: var(--vscode-welcomePage-tileHoverBackground);
    }
`;

const DeploymentTitleWrap = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
`;

const DeploymentHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    h3 {
        font-size: 13px;
        font-weight: 600;
        margin: 0;
        width: 100%;
    }
`;

interface DeploymentBodyProps {
    isExpanded: boolean;
}

const DeploymentBody = styled.div<DeploymentBodyProps>`
    max-height: ${(props: DeploymentBodyProps) => props.isExpanded ? '200px' : '0'};
    overflow: hidden;
    transition: max-height 0.3s ease-in-out;
    margin-top: ${(props: DeploymentBodyProps) => props.isExpanded ? '8px' : '0'};
`;

interface DeploymentOptionProps {
    title: React.ReactNode;
    description: string;
    buttonText: string;
    isExpanded: boolean;
    onToggle: () => void;
    onDeploy: () => void;
    learnMoreLink?: string;
    hasDeployableIntegration?: boolean;
    disabledTooltip?: string;
    secondaryAction?: {
        description: string;
        buttonText: string;
        onClick: () => void;
    };
}

function DeploymentOption({
    title,
    description,
    buttonText,
    isExpanded,
    onToggle,
    onDeploy,
    learnMoreLink,
    hasDeployableIntegration,
    disabledTooltip,
    secondaryAction
}: DeploymentOptionProps) {
    const { rpcClient } = useRpcContext();

    const openLearnMoreURL = () => {
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: learnMoreLink
        })
    };

    return (
        <DeploymentOptionContainer
            isExpanded={isExpanded}
            onClick={onToggle}
        >
            <DeploymentHeader>
                {isExpanded ? (
                    <Codicon
                        name={'triangle-down'}
                        sx={{ color: 'var(--vscode-textLink-foreground)' }}
                    />
                ) : (
                    <Codicon
                        name={'triangle-right'}
                        sx={{ color: 'inherit' }}
                    />
                )}
                <h3>{title}</h3>
            </DeploymentHeader>
            <DeploymentBody isExpanded={isExpanded}>
                <p style={{ marginTop: 8 }}>
                    {description}
                    {learnMoreLink && (
                        <VSCodeLink onClick={openLearnMoreURL} style={{ marginLeft: '4px' }}>Learn more</VSCodeLink>
                    )}
                </p>
                <Button
                    appearance="secondary"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDeploy();
                    }}
                    disabled={!hasDeployableIntegration}
                    tooltip={hasDeployableIntegration ? "" : (disabledTooltip ?? "No deployable integration found")}
                >
                    {buttonText}
                </Button>
                {secondaryAction && (
                    <>
                        <p>{secondaryAction.description}</p>
                        <Button
                            appearance="primary"
                            onClick={(e) => {
                                e.stopPropagation();
                                secondaryAction.onClick();
                            }}
                            sx={{ marginTop: 8 }}
                        >
                            {secondaryAction.buttonText}
                        </Button>
                    </>
                )}
            </DeploymentBody>
        </DeploymentOptionContainer>
    );
}

interface DeploymentOptionsProps {
    handleDockerBuild: () => void;
    handleJarBuild: () => void;
    handleDeploy: () => Promise<void>;
    goToDevant: () => void;
    devantMetadata: WorkspaceDevantMetadata | undefined;
    refetchDevantMetadata: () => Promise<unknown>;
    hasDeployableIntegration: boolean;
    hasUndeployedIntegrations: boolean;
    deployableProjectPaths: Set<string>;
    libraryProjectPaths: Set<string>;
}

function DeploymentOptions({
    handleDockerBuild,
    handleJarBuild,
    handleDeploy,
    goToDevant,
    devantMetadata,
    refetchDevantMetadata,
    hasDeployableIntegration,
    hasUndeployedIntegrations,
    deployableProjectPaths,
    libraryProjectPaths
}: DeploymentOptionsProps) {
    const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set(['cloud']));
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();

    const toggleOption = (option: string) => {
        setExpandedOptions(prev => {
            const newSet = new Set(prev);
            if (newSet.has(option)) {
                newSet.delete(option);
            } else {
                newSet.add(option);
            }
            return newSet;
        });
    };

    // Calculate deployment states, excluding library projects which are never deployable to cloud
    const deployedProjects = devantMetadata?.projectsMetadata?.filter(
        p => p.hasComponent && !libraryProjectPaths.has(p.projectPath)
    ) || [];
    const undeployedProjects = devantMetadata?.projectsMetadata?.filter(
        p => !p.hasComponent && !libraryProjectPaths.has(p.projectPath)
    ) || [];
    const deployedWithChanges = deployedProjects.filter(p => p.hasLocalChanges);

    const hasDeployedProjects = deployedProjects.length > 0;
    const hasUndeployedProjects = undeployedProjects.length > 0;

    const stopRefreshing = useCallback(() => {
        setIsRefreshing(false);
    }, []);

    const handleRefreshDeploymentStatus = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRefreshing(true);
        try {
            await rpcClient.getCommonRpcClient().executeCommand({
                commands: [WICommandIds.RefreshDirectoryContext],
            });
            await refetchDevantMetadata();
        } finally {
            stopRefreshing();
        }
    };
    const hasDeployedWithChanges = deployedWithChanges.length > 0;

    const refreshButton = isRefreshing ? (
        <ProgressRing sx={{ width: 16, height: 16 }} />
    ) : (
        <Button appearance="icon" tooltip="Refresh deployment status" onClick={handleRefreshDeploymentStatus}>
            <Codicon name="refresh" />
        </Button>
    );

    // Determine title, description, button text, and whether deployment is allowed
    let title: React.ReactNode = "Deploy to WSO2 Cloud";
    let description = "Deploy your integrations to WSO2 Cloud.";
    let buttonText = "Deploy";
    let primaryAction: () => void | Promise<void> = handleDeploy;
    let secondaryAction = undefined;
    let isDeploymentDisabled = false;
    let disabledTooltip = "";

    if (hasDeployedProjects && !hasUndeployedProjects) {
        // All projects are deployed - disable deployment button
        title = (
            <DeploymentTitleWrap>
                <span>Deployed in WSO2 Cloud</span>
                {refreshButton}
            </DeploymentTitleWrap>
        );
        description = "All integrations are deployed in WSO2 Cloud.";
        buttonText = "View in Console";
        primaryAction = goToDevant;
        isDeploymentDisabled = false; // View action is always enabled
        
        if (hasDeployedWithChanges) {
            secondaryAction = {
                description: "To redeploy in WSO2 Cloud, please commit and push your changes.",
                buttonText: "Open Source Control",
                onClick: () => rpcClient.getCommonRpcClient().executeCommand({ commands: ["workbench.scm.focus"] })
            };
        }
    } else if (hasDeployedProjects && hasUndeployedProjects) {
        // Mixed state: some deployed, some not - show clear message about remaining
        title = (
            <DeploymentTitleWrap>
                <span>Partially Deployed in WSO2 Cloud</span>
                {refreshButton}
            </DeploymentTitleWrap>
        );
        
        // Separate deployable and non-deployable undeployed projects
        const deployableUndeployed = undeployedProjects.filter(p => deployableProjectPaths.has(p.projectPath));
        const nonDeployableUndeployed = undeployedProjects.filter(p => !deployableProjectPaths.has(p.projectPath));
        
        const deployableNames = deployableUndeployed.map(p => p.projectName).filter(Boolean).join(", ");
        const nonDeployableNames = nonDeployableUndeployed.map(p => p.projectName).filter(Boolean).join(", ");
        
        if (hasUndeployedIntegrations) {
            // There are undeployed projects that CAN be deployed
            const baseMessage = deployableUndeployed.length === 1 ? "You have an undeployed integration" : "You have undeployed integrations";
            description = `${baseMessage}: ${deployableNames || deployableUndeployed.length + " integration(s)"}`;
            buttonText = "Deploy Remaining";
        } else {
            // There are undeployed projects but they CANNOT be deployed (no entry point found)
            description = `Some integration(s) (${nonDeployableNames || nonDeployableUndeployed.length + " integration(s)"}) cannot be deployed. No entry point found within these integration(s).`;
            buttonText = "Deploy Remaining";
        }
        
        primaryAction = handleDeploy;
        isDeploymentDisabled = !hasUndeployedIntegrations;
        disabledTooltip = hasUndeployedIntegrations ? "" : "No entry point found in the remaining integration(s)";
        
        if (hasDeployedWithChanges) {
            const baseMessage = deployedWithChanges.length === 1
                ? `A deployed integration has uncommitted changes (${deployedWithChanges[0].projectName})`
                : `Some deployed integrations have uncommitted changes (${deployedWithChanges.map(p => p.projectName).filter(Boolean).join(", ")})`;
            secondaryAction = {
                description: `${baseMessage}. Commit and push to redeploy.`,
                buttonText: "Open Source Control",
                onClick: () => rpcClient.getCommonRpcClient().executeCommand({ commands: ["workbench.scm.focus"] })
            };
        }
    } else {
        // No deployments yet
        isDeploymentDisabled = !hasDeployableIntegration;
        disabledTooltip = hasDeployableIntegration ? "" : "No deployable integration(s) found";
    }

    return (
        <>
            <div>
                <Title variant="h3">Deployment Options</Title>

                {platformExtState?.isExtInstalled && (
                    <DeploymentOption
                        title={title}
                        description={description}
                        buttonText={buttonText}
                        isExpanded={expandedOptions.has("cloud")}
                        onToggle={() => toggleOption("cloud")}
                        onDeploy={primaryAction}
                        learnMoreLink={"https://wso2.com/integration-platform/docs/deploy/cloud/push-from-ide/"}
                        hasDeployableIntegration={!isDeploymentDisabled && !isRefreshing}
                        disabledTooltip={isRefreshing ? "Refreshing deployment status…" : disabledTooltip}
                        secondaryAction={secondaryAction}
                    />
                )}

                <DeploymentOption
                    title="Deploy with Docker"
                    description="Create Docker image(s) of your integration(s) and deploy them to any Docker-enabled system."
                    buttonText="Create Docker Image"
                    isExpanded={expandedOptions.has('docker')}
                    onToggle={() => toggleOption('docker')}
                    onDeploy={handleDockerBuild}
                    hasDeployableIntegration={hasDeployableIntegration}
                />

                <DeploymentOption
                    title="Deploy on a VM"
                    description="Create self-contained Ballerina executable(s) and run them on any system with Java installed."
                    buttonText="Create Executable"
                    isExpanded={expandedOptions.has('vm')}
                    onToggle={() => toggleOption('vm')}
                    onDeploy={handleJarBuild}
                    hasDeployableIntegration={hasDeployableIntegration}
                />
            </div>
        </>
    );
}

function WorkspaceDevantDashboard({
    handleDeploy,
    hasDeployableIntegration,
    hasUndeployedIntegrations,
}: {
    handleDeploy: () => void;
    hasDeployableIntegration: boolean;
    hasUndeployedIntegrations: boolean;
}) {
    return (
        <React.Fragment>
            <Title variant="h3">Deploy to WSO2 Cloud</Title>
            {!hasDeployableIntegration ? (
                <Typography sx={{ color: "var(--vscode-descriptionForeground)" }}>
                    Before you can deploy your integration to WSO2 Cloud, please add an artifact (such as a Service or Automation) to your integration.
                </Typography>
            ) : (
                <>
                    <Typography sx={{ color: "var(--vscode-descriptionForeground)" }}>
                        {hasUndeployedIntegrations
                            ? "Deploy your integration in WSO2 Cloud."
                            : "All integrations are deployed in WSO2 Cloud."}
                    </Typography>
                    <Button
                        appearance="primary"
                        disabled={!hasUndeployedIntegrations}
                        onClick={handleDeploy}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: "10px",
                            mx: "auto",
                        }}
                    >
                        <Codicon name="save" sx={{ marginRight: 8 }} /> Save and Deploy
                    </Button>
                </>
            )}
        </React.Fragment>
    );
}

const ICPButtonContent = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

type IcpAction = "enableAll" | "disableAll" | "enableRemaining";

function ICPActionButton({ action, label, loadingLabel, onClick, icpActionLoading, isLoading }: {
    action: IcpAction;
    label: string;
    loadingLabel: string;
    onClick: () => void;
    icpActionLoading: IcpAction | null;
    isLoading: boolean;
}) {
    return (
        <Button appearance="secondary" onClick={onClick} disabled={isLoading}>
            <ICPButtonContent>
                {icpActionLoading === action && <ProgressRing sx={{ width: 12, height: 12 }} />}
                {icpActionLoading === action ? loadingLabel : label}
            </ICPButtonContent>
        </Button>
    );
}

interface IntegrationControlPlaneProps {
    icpState: "all" | "partial" | "none";
    enabledCount: number;
    totalCount: number;
    onEnableAll: () => void;
    onDisableAll: () => void;
    onEnableRemaining: () => void;
    icpActionLoading: IcpAction | null;
}

function IntegrationControlPlane({
    icpState,
    enabledCount,
    totalCount,
    onEnableAll,
    onDisableAll,
    onEnableRemaining,
    icpActionLoading
}: IntegrationControlPlaneProps) {
    const { rpcClient } = useRpcContext();
    const isLoading = icpActionLoading !== null;

    const openLearnMoreURL = () => {
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: "https://wso2.com/integrator/integration-control-plane/"
        })
    };

    return (
        <div>
            <Title variant="h3">Integration Control Plane</Title>
            <p>
                {"Monitor the deployment runtime using WSO2 Integration Control Plane."}
                <VSCodeLink onClick={openLearnMoreURL} style={{ marginLeft: '4px' }}> Learn More </VSCodeLink>
            </p>
            <Description variant="body3" sx={{ marginBottom: "8px" }}>
                {totalCount > 0 ? `${enabledCount}/${totalCount} integrations are ICP-enabled` : "No ICP-eligible integrations found"}
            </Description>
            {icpState === "all" && (
                <ICPActionButton
                    action="disableAll"
                    label="Disable ICP for all integrations"
                    loadingLabel="Disabling..."
                    onClick={onDisableAll}
                    icpActionLoading={icpActionLoading}
                    isLoading={isLoading}
                />
            )}
            {icpState === "none" && (
                <ICPActionButton
                    action="enableAll"
                    label="Enable ICP for all integrations"
                    loadingLabel="Enabling..."
                    onClick={onEnableAll}
                    icpActionLoading={icpActionLoading}
                    isLoading={isLoading}
                />
            )}
            {icpState === "partial" && (
                <ICPActionButton
                    action="enableRemaining"
                    label="Enable ICP for remaining integrations"
                    loadingLabel="Enabling..."
                    onClick={onEnableRemaining}
                    icpActionLoading={icpActionLoading}
                    isLoading={isLoading}
                />
            )}
        </div>
    );
}

interface WorkspaceOverviewProps {
    isInDevant: boolean;
}

export function WorkspaceOverview({ isInDevant }: WorkspaceOverviewProps) {
    const { rpcClient } = useRpcContext();
    const [readmeContent, setReadmeContent] = React.useState<string>("");
    const [projectCollection, setProjectCollection] = React.useState<ProjectStructureResponse>();
    const [icpStatusByProjectPath, setIcpStatusByProjectPath] = React.useState<Record<string, boolean>>({});
    const [displayedTitle, setDisplayedTitle] = useState("");
    const [titleVisible, setTitleVisible] = useState(true);

    const [showAlert, setShowAlert] = React.useState(false);
    const [icpActionLoading, setIcpActionLoading] = React.useState<IcpAction | null>(null);

    const { data: devantMetadata, refetch: refetchDevantMetadata } = useQuery({
        queryKey: ["project-devant-metadata"],
        queryFn: () => rpcClient.getBIDiagramRpcClient().getWorkspaceDevantMetadata(),
        refetchInterval: 5000
    });

    const getICPProjectPaths = (projects: ProjectStructureResponse["projects"]) => {
        return projects
            .filter((project) => !(project?.isLibrary ?? false))
            .map((project) => project.projectPath);
    };

    const syncProjectICPStatus = async (projectPaths: string[]) => {
        if (projectPaths.length === 0) {
            setIcpStatusByProjectPath({});
            return;
        }

        try {
            const icpStatus = await Promise.all(
                projectPaths.map((projectPath) =>
                    rpcClient.getICPRpcClient().isIcpEnabled({ projectPath })
                )
            );
            const nextStatusMap = projectPaths.reduce<Record<string, boolean>>((acc, projectPath, index) => {
                acc[projectPath] = Boolean(icpStatus[index]?.enabled);
                return acc;
            }, {});
            setIcpStatusByProjectPath(nextStatusMap);
        } catch (error) {
            console.error("Failed to sync ICP status:", error);
        }
    };

    const fetchContext = () => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then((res) => {
                setProjectCollection(res);

                rpcClient
                    .getBIDiagramRpcClient()
                    .handleReadmeContent({ projectPath: res.workspacePath, read: true })
                    .then((res) => {
                        setReadmeContent(res.content);
                    });
        
                rpcClient
                    .getBIDiagramRpcClient()
                    .getReadmeContent({ projectPath: res.workspacePath })
                    .then((res) => {
                        setReadmeContent(res.content);
                    });

                syncProjectICPStatus(getICPProjectPaths(res.projects));
            });
    };

    // Stable ref so the subscription callback always calls the latest
    // fetchContext without re-registering on every render.
    const fetchContextRef = useRef(fetchContext);
    fetchContextRef.current = fetchContext;

    useEffect(() => {
        if (!rpcClient) return;
        const unsubscribe = rpcClient.onProjectContentUpdated((state: boolean) => {
            if (state) {
                fetchContextRef.current();
            }
        });
        return unsubscribe;
    }, [rpcClient]);

    useEffect(() => {
        fetchContext();
        showLoginAlert().then((status) => {
            setShowAlert(status);
        });
    }, []);

    useEffect(() => {
        const newTitle = projectCollection?.workspaceTitle || projectCollection?.workspaceName || "";
        if (newTitle === displayedTitle) {
            return;
        }
        if (!displayedTitle) {
            // First load — no animation needed
            setDisplayedTitle(newTitle);
            return;
        }
        // Fade out → swap → fade in
        setTitleVisible(false);
        const swap = setTimeout(() => {
            setDisplayedTitle(newTitle);
            setTitleVisible(true);
        }, 400);
        return () => clearTimeout(swap);
    }, [projectCollection?.workspaceTitle, projectCollection?.workspaceName]);

    const isEmptyProject = useMemo(() => {
        return projectCollection?.projects.length === 0;
    }, [projectCollection]);

    const hasStandardIntegrations = useMemo(() => {
        return (projectCollection?.projects ?? []).some((project) => !(project?.isLibrary ?? false));
    }, [projectCollection?.projects]);

    const icpProjectPaths = useMemo(() => {
        return projectCollection ? getICPProjectPaths(projectCollection.projects) : [];
    }, [projectCollection]);

    const icpEnabledCount = useMemo(() => {
        return icpProjectPaths.filter((projectPath) => Boolean(icpStatusByProjectPath[projectPath])).length;
    }, [icpProjectPaths, icpStatusByProjectPath]);

    const icpState = useMemo<"all" | "partial" | "none">(() => {
        if (icpProjectPaths.length === 0 || icpEnabledCount === 0) {
            return "none";
        }
        if (icpEnabledCount === icpProjectPaths.length) {
            return "all";
        }
        return "partial";
    }, [icpProjectPaths, icpEnabledCount]);

    const projectScopes = useMemo(() => {
        return getWorkspaceProjectScopes(projectCollection);
    }, [projectCollection]);

    // Libraries can never be deployed to cloud; exclude them from deployment state calculations.
    const libraryProjectPaths = useMemo(() => {
        return (projectCollection?.projects ?? []).reduce<Set<string>>((paths, project) => {
            if (project.isLibrary && project.projectPath) {
                paths.add(project.projectPath);
            }
            return paths;
        }, new Set<string>());
    }, [projectCollection?.projects]);

    // Calculate which projects need deployment
    const undeployedProjectScopes = useMemo(() => {
        if (!devantMetadata?.projectsMetadata || !projectCollection) {
            return projectScopes;
        }

        const deployedPaths = new Set(
            devantMetadata.projectsMetadata
                .filter(p => p.hasComponent)
                .map(p => p.projectPath)
        );

        return projectScopes.filter(scope =>
            !deployedPaths.has(scope.projectPath) &&
            !libraryProjectPaths.has(scope.projectPath)
        );
    }, [projectScopes, devantMetadata, projectCollection, libraryProjectPaths]);

    const deployableProjectPaths = useMemo(() => {
        return new Set(projectScopes.map(scope => scope.projectPath));
    }, [projectScopes]);

    const hasDeployableIntegration = useMemo(() => {
        return projectScopes.some(scope =>
            scope.integrationTypes.length > 0 &&
            !libraryProjectPaths.has(scope.projectPath)
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

    const handleTitleUpdate = useCallback(async (newTitle: string) => {
        if (!projectCollection?.workspacePath) return;
        await rpcClient.getBIDiagramRpcClient().updateProjectTitle({
            projectPath: projectCollection.workspacePath,
            title: newTitle
        });
    }, [projectCollection, rpcClient]);

    if (!projectCollection) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    const handleGenerateWithReadme = () => {
        rpcClient.getBIDiagramRpcClient().openAIChat({
            planMode: true,
            readme: true,
        });
    };

    const handleEditReadme = () => {
        rpcClient.getBIDiagramRpcClient().openReadme({
            projectPath: projectCollection?.workspacePath,
            isWorkspaceReadme: true
        });
    };

    const handleAddResource = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.ADD_PROJECT] })
    };

    async function handleSettings() {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [SHARED_COMMANDS.OPEN_AI_PANEL] });
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

    const handleDeploy = async () => {
        // Only deploy undeployed projects
        await rpcClient.getBIDiagramRpcClient().deployWorkspace({
            projectScopes: undeployedProjectScopes,
            rootDirectory: projectCollection?.workspacePath || ''
        });
    };

    const handleDockerBuild = () => {
        rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.DOCKER);
    };

    const handleJarBuild = () => {
        rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.JAR);
    };

    const updateICPForProjectPaths = async (projectPaths: string[], enableICP: boolean) => {
        for (const projectPath of projectPaths) {
            try {
                if (enableICP) {
                    await rpcClient.getICPRpcClient().addICP({ projectPath });
                } else {
                    await rpcClient.getICPRpcClient().disableICP({ projectPath });
                }
            } catch (error) {
                console.error("Failed to update ICP for project:", projectPath, error);
            }
        }
    };

    const runIcpAction = async (action: IcpAction, paths: string[], enable: boolean) => {
        setIcpActionLoading(action);
        try {
            await updateICPForProjectPaths(paths, enable);
        } finally {
            await syncProjectICPStatus(icpProjectPaths);
            setIcpActionLoading(null);
        }
    };

    const handleEnableAllICP = () => runIcpAction("enableAll", icpProjectPaths, true);
    const handleDisableAllICP = () => runIcpAction("disableAll", icpProjectPaths, false);
    const handleEnableRemainingICP = () => {
        const remainingProjectPaths = icpProjectPaths.filter((projectPath) => !icpStatusByProjectPath[projectPath]);
        return runIcpAction("enableRemaining", remainingProjectPaths, true);
    };

    const goToDevant = () => {
        // Open the Devant console at the project level.
        // If there are deployed projects, open the first one
        if (devantMetadata?.projectsMetadata && devantMetadata.projectsMetadata.length > 0) {
            const firstDeployedProject = devantMetadata.projectsMetadata.find(p => p.hasComponent);
            if (firstDeployedProject) {
                rpcClient.getCommonRpcClient().executeCommand({
                    commands: [
                        WICommandIds.OpenInConsole,
                        {
                            componentFsPath: firstDeployedProject.projectPath,
                            newComponentParams: { buildPackLang: "ballerina" }
                        } as IOpenInConsoleCmdParams
                    ]
                });
                return;
            }
        }
        // Fallback: open console without specific component
        rpcClient.getCommonRpcClient().executeCommand({
            commands: [WICommandIds.OpenInConsole, {
                newComponentParams: { buildPackLang: "ballerina" }
            } as IOpenInConsoleCmdParams]
        });
    };

    return (
        <PageLayout>
            <HeaderRow>
                <TitleContainer>
                    <EditableTitle
                        title={projectCollection?.workspaceTitle || projectCollection?.workspaceName || ""}
                        onCommit={handleTitleUpdate}
                        validate={validateTitle}
                    >
                        <ProjectTitle style={{ opacity: titleVisible ? 1 : 0 }}>{displayedTitle}</ProjectTitle>
                    </EditableTitle>
                    <ProjectSubtitle>Project</ProjectSubtitle>
                </TitleContainer>
            </HeaderRow>

            <HeroRow>
                <CopilotHeroBox />
            </HeroRow>

            <MainContent hasDeployment={hasStandardIntegrations}>
                <LeftContent>
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

                    <Section>
                        <ContentPanel isEmpty={isEmptyProject}>
                            <SectionHeader>
                                <SectionTitle>Integrations & Libraries</SectionTitle>
                                {!isEmptyProject && (
                                    <SectionActions>
                                        <Button appearance="primary" onClick={handleAddResource}>
                                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add
                                        </Button>
                                    </SectionActions>
                                )}
                            </SectionHeader>
                            {isEmptyProject ? (
                                <EmptyStateContainer>
                                    <Typography variant="h3" sx={{ marginBottom: "16px" }}>
                                        Your project is empty
                                    </Typography>
                                    <Typography
                                        variant="body1"
                                        sx={{ marginBottom: "24px", color: "var(--vscode-descriptionForeground)" }}
                                    >
                                        Add an integration or library to get started, or describe what you want to
                                        build in the Copilot box above
                                    </Typography>
                                    <ButtonContainer>
                                        <Button appearance="primary" onClick={handleAddResource}>
                                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add Integration or Library
                                        </Button>
                                    </ButtonContainer>
                                </EmptyStateContainer>
                            ) : (
                                <PackageListView
                                    projectCollection={projectCollection}
                                    icpStatusByProjectPath={icpStatusByProjectPath}
                                    showICPBadge={icpState !== "none"}
                                />
                            )}
                        </ContentPanel>
                    </Section>

                    <Section>
                        <ContentPanel isEmpty={!readmeContent}>
                            <SectionHeader>
                                <SectionTitle>README</SectionTitle>
                                <SectionActions>
                                    {/* TODO: Add generate with AI button once AI is implemented (https://github.com/wso2/product-ballerina-integrator/issues/1899) */}
                                    {/* {readmeContent && isEmptyProject && (
                                        <Button appearance="icon" onClick={handleGenerateWithReadme} buttonSx={{ padding: "4px 8px" }}>
                                            <Codicon name="wand" sx={{ marginRight: 4, fontSize: 16 }} /> Generate with Readme
                                        </Button>
                                    )} */}
                                    <Button appearance="icon" onClick={handleEditReadme} buttonSx={{ padding: "4px 8px" }}>
                                        <Icon name="bi-edit" sx={{ marginRight: 8, fontSize: 16 }} /> Edit
                                    </Button>
                                </SectionActions>
                            </SectionHeader>
                            {readmeContent ? (
                                <ReadmeContent>
                                    <ReactMarkdown>{readmeContent}</ReactMarkdown>
                                </ReadmeContent>
                            ) : (
                                <EmptyReadmeContainer>
                                    <Description variant="body2">
                                        Document your project, integrations, and libraries
                                    </Description>
                                    <VSCodeLink onClick={handleEditReadme}>Add a README</VSCodeLink>
                                </EmptyReadmeContainer>
                            )}
                        </ContentPanel>
                    </Section>
                </LeftContent>
                {hasStandardIntegrations && (
                    <SidePanel>
                        {!isInDevant && (
                            <>
                                <DeploymentOptions
                                    handleDockerBuild={handleDockerBuild}
                                    handleJarBuild={handleJarBuild}
                                    handleDeploy={handleDeploy}
                                    goToDevant={goToDevant}
                                    devantMetadata={devantMetadata}
                                    refetchDevantMetadata={refetchDevantMetadata}
                                    hasDeployableIntegration={hasDeployableIntegration}
                                    hasUndeployedIntegrations={undeployedProjectScopes.length > 0}
                                    deployableProjectPaths={deployableProjectPaths}
                                    libraryProjectPaths={libraryProjectPaths}
                                />
                                <Divider sx={{ margin: "16px 0" }} />
                                <IntegrationControlPlane
                                    icpState={icpState}
                                    enabledCount={icpEnabledCount}
                                    totalCount={icpProjectPaths.length}
                                    onEnableAll={handleEnableAllICP}
                                    onDisableAll={handleDisableAllICP}
                                    onEnableRemaining={handleEnableRemainingICP}
                                    icpActionLoading={icpActionLoading}
                                />
                            </>
                        )}
                        {isInDevant && (
                            <WorkspaceDevantDashboard
                                handleDeploy={handleDeploy}
                                hasDeployableIntegration={hasDeployableIntegration}
                                hasUndeployedIntegrations={undeployedProjectScopes.length > 0}
                            />
                        )}
                    </SidePanel>
                )}
            </MainContent>
        </PageLayout>
    );
}
