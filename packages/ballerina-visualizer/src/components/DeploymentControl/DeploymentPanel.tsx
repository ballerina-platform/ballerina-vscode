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

import React, { ReactNode, useState } from "react";
import styled from "@emotion/styled";
import { useQuery } from "@tanstack/react-query";
import { ProjectStructure, isSamePath, BI_COMMANDS } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Typography, Codicon, ProgressRing, Button, Divider, CheckBox, ThemeColors } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../providers/platform-ext-ctx-provider";
import { DeploymentControlState } from "../../hooks/useDeploymentControl";

const Title = styled(Typography)`
    margin: 8px 0;
`;

const ButtonContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
`;

export const SidePanel = styled.div<{ collapsed?: boolean }>`
    flex: 0 0 ${(props: { collapsed?: boolean }) => (props.collapsed ? "0" : "320px")};
    width: ${(props: { collapsed?: boolean }) => (props.collapsed ? "0" : "320px")};
    margin-left: ${(props: { collapsed?: boolean }) => (props.collapsed ? "0" : "16px")};
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    opacity: ${(props: { collapsed?: boolean }) => (props.collapsed ? 0 : 1)};
    // visibility (not display) keeps the collapsed panel out of the tab order while still animating.
    visibility: ${(props: { collapsed?: boolean }) => (props.collapsed ? "hidden" : "visible")};
    transition: opacity 180ms ease, flex-basis 220ms ease, width 220ms ease, margin-left 220ms ease, visibility 220ms;
`;

interface DeploymentOptionContainerProps {
    isExpanded: boolean;
}

export const DeploymentOptionContainer = styled.div<DeploymentOptionContainerProps>`
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

export const DeploymentHeader = styled.div`
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

const DevantHeaderWrap = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

interface DeploymentBodyProps {
    isExpanded: boolean;
}

export const DeploymentBody = styled.div<DeploymentBodyProps>`
    max-height: ${(props: DeploymentBodyProps) => props.isExpanded ? '200px' : '0'};
    overflow: hidden;
    transition: max-height 0.3s ease-in-out;
    margin-top: ${(props: DeploymentBodyProps) => props.isExpanded ? '8px' : '0'};
`;

export interface DeploymentOptionProps {
    title: ReactNode;
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

export function DeploymentOption({
    title,
    description,
    buttonText,
    isExpanded,
    onToggle,
    onDeploy,
    learnMoreLink,
    secondaryAction,
    hasDeployableIntegration,
    disabledTooltip,
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
                        <Button appearance="primary" onClick={(e) => {
                            e.stopPropagation();
                            secondaryAction.onClick()
                        }} sx={{ marginTop: 8 }}>
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
    hasDeployableIntegration: boolean;
    projectPath: string;
}

function DeploymentOptions({
    handleDockerBuild,
    handleJarBuild,
    handleDeploy,
    goToDevant,
    hasDeployableIntegration,
    projectPath
}: DeploymentOptionsProps) {
    const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set(['cloud', 'devant']));
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

    const { data: devantMetadata, isLoading: isDevantLoading, refetch: refetchDevantMetadata } = useQuery({
        queryKey: ["project-devant-metadata", projectPath],
        queryFn: () => rpcClient.getBIDiagramRpcClient().getWorkspaceDevantMetadata(),
        enabled: platformExtState.isExtInstalled,
        refetchInterval: 5000,
    });
    const currentProjectMeta = devantMetadata?.projectsMetadata?.find(p => isSamePath(p.projectPath, projectPath));
    const isDeployed = devantMetadata?.isLoggedIn
        ? (currentProjectMeta?.hasComponent ?? false)
        : false;

    const handleRefreshDeploymentStatus = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsRefreshing(true);
        try {
            await rpcClient.getCommonRpcClient().executeCommand({
                commands: [WICommandIds.RefreshDirectoryContext],
            });
            await refetchDevantMetadata();
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <>
            <div>
                <Title variant="h3">Deployment Options</Title>

                {platformExtState.isExtInstalled && !isDevantLoading && (
                    <DeploymentOption
                        title={
                            isDeployed ? (
                                <DevantHeaderWrap>
                                    <span>Deployed in WSO2 Cloud</span>
                                    {isRefreshing ? (
                                        <ProgressRing sx={{ width: 16, height: 16 }} />
                                    ) : (
                                        <Button appearance="icon" tooltip="Refresh deployment status" onClick={handleRefreshDeploymentStatus}>
                                            <Codicon name="refresh" />
                                        </Button>
                                    )}
                                </DevantHeaderWrap>
                            ) : (
                                "Deploy to WSO2 Cloud"
                            )
                        }
                        description={
                            isDeployed
                                ? "This integration is already deployed in WSO2 Cloud."
                                : "Deploy your integration to WSO2 Cloud."
                        }
                        buttonText={isDeployed ? "View in Console" : "Deploy"}
                        isExpanded={expandedOptions.has("devant")}
                        onToggle={() => toggleOption("devant")}
                        onDeploy={isDeployed ? () => goToDevant() : handleDeploy}
                        learnMoreLink={"https://wso2.com/integration-platform/docs/deploy/cloud/push-from-ide/"}
                        hasDeployableIntegration={hasDeployableIntegration && !isRefreshing}
                        secondaryAction={
                            isDeployed && currentProjectMeta?.hasLocalChanges
                                ? {
                                    description: "To redeploy in WSO2 Cloud, please commit and push your changes.",
                                    buttonText: "Open Source Control",
                                    onClick: () =>
                                        rpcClient
                                            .getCommonRpcClient()
                                            .executeCommand({ commands: ["workbench.scm.focus"] }),
                                }
                                : undefined
                        }
                    />
                )}

                <DeploymentOption
                    title="Deploy with Docker"
                    description="Create a Docker image of your integration and deploy it to any Docker-enabled system."
                    buttonText="Create Docker Image"
                    isExpanded={expandedOptions.has('docker')}
                    onToggle={() => toggleOption('docker')}
                    onDeploy={handleDockerBuild}
                    hasDeployableIntegration={hasDeployableIntegration}
                />

                <DeploymentOption
                    title="Deploy on a VM"
                    description="Create a self-contained Ballerina executable and run it on any system with Java installed."
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

interface IntegrationControlPlaneProps {
    enabled: boolean;
    handleICP: (checked: boolean) => void;
}

function IntegrationControlPlane({ enabled, handleICP }: IntegrationControlPlaneProps) {
    const { rpcClient } = useRpcContext();

    const openLearnMoreURL = () => {
        rpcClient.getCommonRpcClient().openExternalUrl({
            url: "https://wso2.com/integrator/integration-control-plane/"
        })
    };

    return (
        <div>
            <Title variant="h3">Integration Control Plane</Title>
            <p>
                {"Monitor and manage your integration deployments using a single enhanced interface, and streamline operations and increase efficiency."}
                <VSCodeLink onClick={openLearnMoreURL} style={{ marginLeft: '4px' }}> Learn More </VSCodeLink>
            </p>
            <div style={{ paddingLeft: 10 }}>
                <CheckBox
                    checked={enabled}
                    onChange={handleICP}
                    label="Enable ICP monitoring"
                />
            </div>
        </div>
    );
}

interface WorkflowManagementProps {
    enabled: boolean;
    handleWorkflowManagement: (checked: boolean) => void;
}

function WorkflowManagement({ enabled, handleWorkflowManagement }: WorkflowManagementProps) {
    return (
        <div>
            <Title variant="h3">Workflow</Title>
            <p>
                {"Expose the workflow management REST API from this integration — to list, inspect and act on "
                    + "workflow instances, human tasks and reviews. Enabling it imports "
                    + "ballerina/workflow.management.rest in main.bal; the API's port, TLS and CORS settings "
                    + "are configured in the configuration editor."}
            </p>
            <div style={{ paddingLeft: 10 }}>
                <CheckBox
                    checked={enabled}
                    onChange={handleWorkflowManagement}
                    label="Enable Workflow Management REST API"
                />
            </div>
        </div>
    );
}

interface AgentManagerTracingProps {
    enabled: boolean;
    handleAmpTracing: (checked: boolean) => void;
}

function AgentManagerTracing({ enabled, handleAmpTracing }: AgentManagerTracingProps) {
    return (
        <div>
            <Title variant="h3">Agent Manager</Title>
            <p>
                {"Publish agent traces to WSO2 Agent Manager. Enabling it configures the "
                    + "agent manager tracing provider and its endpoint/API key in Config.toml; "
                    + "disabling it removes that configuration."}
            </p>
            <div style={{ paddingLeft: 10 }}>
                <CheckBox
                    checked={enabled}
                    onChange={handleAmpTracing}
                    label="Enable Agent Manager tracing"
                />
            </div>
        </div>
    );
}

const LocalICPBody = styled.div<DeploymentBodyProps>`
    max-height: ${(props: DeploymentBodyProps) => props.isExpanded ? '400px' : '0'};
    visibility: ${(props: DeploymentBodyProps) => props.isExpanded ? 'visible' : 'hidden'};
    overflow: hidden;
    transition: max-height 0.3s ease-in-out,
        visibility 0s linear ${(props: DeploymentBodyProps) => props.isExpanded ? '0s' : '0.3s'};
    margin-top: ${(props: DeploymentBodyProps) => props.isExpanded ? '8px' : '0'};
`;

function LocalICPDeployment() {
    const { rpcClient } = useRpcContext();
    const [isExpanded, setIsExpanded] = useState(false);
    const [serverRunning, setServerRunning] = useState(false);
    const [serverBusy, setServerBusy] = useState(false);

    const refreshStatus = React.useCallback(async () => {
        try {
            const res = await rpcClient.getICPRpcClient().isICPServerRunning({ projectPath: '' });
            setServerRunning(!!res.enabled);
        } catch (err) {
            console.error('[ICP] Failed to refresh ICP server status:', err);
        }
    }, [rpcClient]);

    React.useEffect(() => {
        refreshStatus();
        const interval = setInterval(refreshStatus, 3000);
        return () => clearInterval(interval);
    }, [refreshStatus]);

    React.useEffect(() => {
        if (serverRunning) {
            setIsExpanded(true);
        }
    }, [serverRunning]);

    const handleServerToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setServerBusy(true);
        try {
            await rpcClient.getCommonRpcClient().executeCommand({
                commands: [serverRunning ? 'ballerina.icp.stop' : 'ballerina.icp.start']
            });
            await refreshStatus();
        } catch (err) {
            console.error('[ICP] Failed to toggle ICP server:', err);
        } finally {
            setServerBusy(false);
        }
    };

    const handleViewInICP = (e: React.MouseEvent) => {
        e.stopPropagation();
        rpcClient.getICPRpcClient().viewInICP({ projectPath: '' }).catch((err) => {
            console.error('[ICP] Failed to open ICP dashboard:', err);
        });
    };

    const toggleExpanded = () => setIsExpanded(prev => !prev);

    const handleHeaderKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleExpanded();
        }
    };

    return (
        <DeploymentOptionContainer
            isExpanded={isExpanded}
            onClick={toggleExpanded}
            onKeyDown={handleHeaderKeyDown}
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
        >
            <DeploymentHeader>
                {isExpanded ? (
                    <Codicon name={'triangle-down'} sx={{ color: 'var(--vscode-textLink-foreground)' }} />
                ) : (
                    <Codicon name={'triangle-right'} sx={{ color: 'inherit' }} />
                )}
                <h3>Publish to local ICP</h3>
            </DeploymentHeader>
            <LocalICPBody isExpanded={isExpanded}>
                <p style={{ marginTop: 8 }}>Publish to a local ICP server to try it out.</p>
                <ol style={{ marginTop: 0, paddingLeft: 20 }}>
                    <li>Start the ICP server</li>
                    <li>Enable ICP for the integration</li>
                    <li>Run the integration — traces will be published to the local ICP server</li>
                </ol>
                <ButtonContainer>
                    <Button
                        appearance="secondary"
                        onClick={handleServerToggle}
                        disabled={serverBusy}
                    >
                        <Codicon
                            name={serverRunning ? "debug-stop" : "play"}
                            sx={{ marginRight: 8 }}
                        />
                        {serverRunning ? "Stop ICP Server" : "Start ICP Server"}
                    </Button>
                    {serverRunning && (
                        <Button appearance="secondary" onClick={handleViewInICP}>
                            <Codicon name="link-external" sx={{ marginRight: 8 }} />
                            View in ICP
                        </Button>
                    )}
                </ButtonContainer>
            </LocalICPBody>
        </DeploymentOptionContainer>
    );
}

interface DevantDashboardProps {
    projectStructure: ProjectStructure;
    handleDeploy: () => void;
    goToDevant: () => void;
}

function DevantDashboard({ projectStructure, handleDeploy, goToDevant }: DevantDashboardProps) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();

    const handleSaveAndDeployToDevant = () => {
        handleDeploy();
    }

    const handlePushChanges = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.DEVANT_PUSH_TO_CLOUD] });
    }

    const hasAutomationOrService = projectStructure?.directoryMap && (
        (projectStructure.directoryMap.AUTOMATION && projectStructure.directoryMap.AUTOMATION.length > 0) ||
        (projectStructure.directoryMap.SERVICE && projectStructure.directoryMap.SERVICE.length > 0)
    );

    return (
        <React.Fragment>
            {platformExtState?.selectedComponent ? <Title variant="h3">Deployed in WSO2 Cloud</Title> : <Title variant="h3">Deploy to WSO2 Cloud</Title>}
            {!hasAutomationOrService ? (
                <Typography sx={{ color: "var(--vscode-descriptionForeground)" }}>
                    Before you can deploy your integration to WSO2 Cloud, please add an artifact (such as a Service or Automation) to your integration.
                </Typography>
            ) : (
                <>
                    {platformExtState?.selectedComponent ? (
                        <>
                            <Typography sx={{ color: "var(--vscode-descriptionForeground)" }}>
                                This integration is deployed in WSO2 Cloud.
                            </Typography>
                            <Button
                                appearance="secondary"
                                disabled={!platformExtState?.hasLocalChanges}
                                onClick={handlePushChanges}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginTop: "10px",
                                    mx: "auto"
                                }}
                            >
                                <Codicon name="save" sx={{ marginRight: 8 }} /> Push Changes to WSO2 Cloud
                            </Button>
                            <Button
                                appearance="icon"
                                onClick={goToDevant}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginTop: "10px",
                                    mx: "auto"
                                }}
                            >
                                <Codicon name="link" sx={{ marginRight: 8 }} /> Open in Console
                            </Button>
                        </>
                    ) : (
                        <React.Fragment>
                            <Typography sx={{ color: "var(--vscode-descriptionForeground)" }}>
                                Deploy your integration in WSO2 Cloud.
                            </Typography>
                            <Button
                                appearance="primary"
                                onClick={handleSaveAndDeployToDevant}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    marginTop: "10px",
                                    mx: "auto"
                                }}
                            >
                                <Codicon name="save" sx={{ marginRight: 8 }} /> Save and Deploy
                            </Button>
                        </React.Fragment>
                    )}
                </>
            )}
        </React.Fragment>
    );
}

export interface DeploymentPanelProps extends DeploymentControlState {
    projectPath: string;
    projectStructure: ProjectStructure;
    isInDevant: boolean;
    isICPSupported?: boolean;
    hasWorkflows: boolean;
    hasAgents: boolean;
    hasDeployableIntegration: boolean;
}

/**
 * The "Deployment" drawer's content: deploy actions, ICP monitoring and workflow-management, or the
 * Devant dashboard when already in Devant. Wrapper-agnostic — the caller supplies the collapsible
 * container (e.g. `SidePanel` from this module) since its layout mechanics differ per page.
 */
export function DeploymentPanel({
    projectPath,
    projectStructure,
    isInDevant,
    isICPSupported,
    hasWorkflows,
    hasAgents,
    hasDeployableIntegration,
    icpEnabled,
    handleICP,
    workflowMgmtEnabled,
    handleWorkflowManagement,
    ampTracingEnabled,
    handleAmpTracing,
    handleDeploy,
    handleDockerBuild,
    handleJarBuild,
    goToDevant,
}: DeploymentPanelProps) {
    return (
        <>
            {!isInDevant && (
                <>
                    <DeploymentOptions
                        handleDockerBuild={handleDockerBuild}
                        handleJarBuild={handleJarBuild}
                        handleDeploy={handleDeploy}
                        goToDevant={goToDevant}
                        hasDeployableIntegration={hasDeployableIntegration}
                        projectPath={projectPath}
                    />
                    {isICPSupported && (
                        <>
                            <Divider sx={{ margin: "16px 0" }} />
                            <IntegrationControlPlane enabled={icpEnabled} handleICP={handleICP} />
                            <div style={{ marginTop: 8 }}>
                                <LocalICPDeployment />
                            </div>
                        </>
                    )}
                    {hasAgents && (
                        <>
                            <Divider sx={{ margin: "16px 0" }} />
                            <AgentManagerTracing enabled={ampTracingEnabled} handleAmpTracing={handleAmpTracing} />
                        </>
                    )}
                    {hasWorkflows && (
                        <>
                            <Divider sx={{ margin: "16px 0" }} />
                            <WorkflowManagement
                                enabled={workflowMgmtEnabled}
                                handleWorkflowManagement={handleWorkflowManagement}
                            />
                        </>
                    )}
                </>
            )}
            {isInDevant && (
                <DevantDashboard
                    projectStructure={projectStructure}
                    handleDeploy={handleDeploy}
                    goToDevant={goToDevant}
                />
            )}
        </>
    );
}
