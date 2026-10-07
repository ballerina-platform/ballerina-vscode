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
import { ProjectStructure, isSamePath, BI_COMMANDS, ProductMode, hasWorkflowArtifacts } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Typography, Codicon, ProgressRing, Button, Divider, CheckBox, ThemeColors } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../providers/platform-ext-ctx-provider";
import { DeploymentControlState } from "../../hooks/useDeploymentControl";
import { AgentManagerSection, agentManagerTag, useAgentManagerStatus } from "./AgentManagerSection";
import { useProductMode } from "../../hooks/useProductMode";

const Title = styled(Typography)`
    margin: 8px 0;
`;

const WSO2_CLOUD_DOCS = "https://wso2.com/integration-platform/docs/deploy/cloud/push-from-ide/";
const ICP_DOCS = "https://wso2.com/integrator/integration-control-plane/";
const NOT_DEPLOYABLE = "No deployable integration found";

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

const SectionLead = styled.p`
    margin: -4px 0 8px;
    color: var(--vscode-descriptionForeground);
`;

const ItemContainer = styled.div<{ isExpanded: boolean }>`
    border: 1px solid ${(props: { isExpanded: boolean }) => (props.isExpanded ? "var(--vscode-welcomePage-tileBorder)" : "transparent")};
    background: ${(props: { isExpanded: boolean }) => (props.isExpanded ? "var(--vscode-welcomePage-tileBackground)" : "transparent")};
    border-radius: 6px;
    margin-bottom: 4px;
`;

const ItemHeader = styled.button`
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    &:hover {
        background: var(--vscode-welcomePage-tileHoverBackground);
    }
`;

const ItemBody = styled.div`
    padding: 0 10px 12px 32px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    p {
        margin: 0;
    }
`;

const Tag = styled.span`
    font-size: 11px;
    font-weight: 400;
    line-height: 18px;
    padding: 0 6px;
    border-radius: 9px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
`;

interface DrawerItemProps {
    title: string;
    tag?: string;
    isExpanded: boolean;
    onToggle: () => void;
    children: ReactNode;
}

function DrawerItem({ title, tag, isExpanded, onToggle, children }: DrawerItemProps) {
    return (
        <ItemContainer isExpanded={isExpanded}>
            <ItemHeader type="button" aria-expanded={isExpanded} onClick={onToggle}>
                <Codicon
                    name={isExpanded ? "triangle-down" : "triangle-right"}
                    sx={{ color: isExpanded ? "var(--vscode-textLink-foreground)" : "inherit" }}
                />
                <span>{title}</span>
                {tag && !isExpanded && <Tag>{tag}</Tag>}
            </ItemHeader>
            {isExpanded && <ItemBody>{children}</ItemBody>}
        </ItemContainer>
    );
}

function LearnMore({ url }: { url: string }) {
    const { rpcClient } = useRpcContext();
    return (
        <VSCodeLink onClick={() => rpcClient.getCommonRpcClient().openExternalUrl({ url })} style={{ marginLeft: 4 }}>
            Learn More
        </VSCodeLink>
    );
}

function useWso2Cloud(projectPath: string) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { data, isLoading, refetch } = useQuery({
        queryKey: ["project-devant-metadata", projectPath],
        queryFn: () => rpcClient.getBIDiagramRpcClient().getWorkspaceDevantMetadata(),
        enabled: platformExtState.isExtInstalled,
        refetchInterval: 5000,
    });
    const projectMeta = data?.projectsMetadata?.find((meta) => isSamePath(meta.projectPath, projectPath));

    const refresh = async () => {
        setIsRefreshing(true);
        try {
            await rpcClient.getCommonRpcClient().executeCommand({ commands: [WICommandIds.RefreshDirectoryContext] });
            await refetch();
        } finally {
            setIsRefreshing(false);
        }
    };

    return {
        available: platformExtState.isExtInstalled && !isLoading,
        isDeployed: !!data?.isLoggedIn && !!projectMeta?.hasComponent,
        hasLocalChanges: !!projectMeta?.hasLocalChanges,
        isRefreshing,
        refresh,
    };
}

interface Wso2CloudBodyProps {
    cloud: ReturnType<typeof useWso2Cloud>;
    noun: string;
    canDeploy: boolean;
    handleDeploy: () => Promise<void>;
    goToDevant: () => void;
}

function Wso2CloudBody({ cloud, noun, canDeploy, handleDeploy, goToDevant }: Wso2CloudBodyProps) {
    const { rpcClient } = useRpcContext();
    if (!cloud.isDeployed) {
        return (
            <>
                <p>Build and run this {noun} on WSO2 Cloud, a fully managed platform.<LearnMore url={WSO2_CLOUD_DOCS} /></p>
                <ButtonContainer>
                    <Button appearance="secondary" onClick={handleDeploy} disabled={!canDeploy} tooltip={canDeploy ? "" : NOT_DEPLOYABLE}>
                        Deploy to WSO2 Cloud
                    </Button>
                </ButtonContainer>
            </>
        );
    }
    return (
        <>
            <p>This {noun} is deployed on WSO2 Cloud.<LearnMore url={WSO2_CLOUD_DOCS} /></p>
            {cloud.hasLocalChanges && <p>Commit and push your changes to redeploy.</p>}
            <ButtonContainer>
                {cloud.hasLocalChanges && (
                    <Button appearance="primary" onClick={() => rpcClient.getCommonRpcClient().executeCommand({ commands: ["workbench.scm.focus"] })}>
                        Open Source Control
                    </Button>
                )}
                <Button appearance="secondary" onClick={goToDevant} disabled={cloud.isRefreshing}>Open in Console</Button>
                {cloud.isRefreshing
                    ? <ProgressRing sx={{ width: 16, height: 16 }} />
                    : <Button appearance="icon" tooltip="Refresh Deployment Status" onClick={cloud.refresh}><Codicon name="refresh" /></Button>}
            </ButtonContainer>
        </>
    );
}

function BuildOption({ description, label, enabled, onBuild }: { description: string; label: string; enabled: boolean; onBuild: () => void }) {
    return (
        <>
            <p>{description}</p>
            <ButtonContainer>
                <Button appearance="secondary" onClick={onBuild} disabled={!enabled} tooltip={enabled ? "" : NOT_DEPLOYABLE}>{label}</Button>
            </ButtonContainer>
        </>
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
                <h3>Publish to Local ICP</h3>
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

    // Anything that can be deployed: an automation, a service, or a workflow (a durable agent included).
    const hasDeployableArtifact = (projectStructure?.directoryMap && (
        (projectStructure.directoryMap.AUTOMATION && projectStructure.directoryMap.AUTOMATION.length > 0) ||
        (projectStructure.directoryMap.SERVICE && projectStructure.directoryMap.SERVICE.length > 0)
    )) || hasWorkflowArtifacts(projectStructure);

    return (
        <React.Fragment>
            {platformExtState?.selectedComponent ? <Title variant="h3">Deployed in WSO2 Cloud</Title> : <Title variant="h3">Deploy to WSO2 Cloud</Title>}
            {!hasDeployableArtifact ? (
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

type ItemFactory = (id: string, title: string, tag: string | undefined, body: ReactNode) => ReactNode;

const enabledTag = (enabled: boolean) => (enabled ? "Enabled" : undefined);

interface MonitorItemsOptions extends DeploymentPanelProps {
    item: ItemFactory;
    noun: string;
    agentMode: boolean;
    linkMode?: "internal" | "external";
    tracingBody: ReactNode;
}

function monitorItems(options: MonitorItemsOptions): ReactNode[] {
    const { item, noun, linkMode } = options;
    const tracing = options.hasAgents && linkMode !== "internal" && item("agentManagerTracing", "Agent Manager Observability",
        enabledTag(linkMode === "external" && options.ampTracingEnabled), options.tracingBody);
    const icp = options.isICPSupported && item("icp", "Integration Control Plane", enabledTag(options.icpEnabled), (
        <>
            <p>Monitor and manage integration deployments from a central console.<LearnMore url={ICP_DOCS} /></p>
            <CheckBox checked={options.icpEnabled} onChange={options.handleICP} label="Enable ICP Monitoring" />
            <LocalICPDeployment />
        </>
    ));
    const workflow = options.hasWorkflows && item("workflow", "Workflow Management", enabledTag(options.workflowMgmtEnabled), (
        <>
            <p>Manage workflow instances, human tasks and reviews in this {noun} through a REST API.</p>
            <CheckBox checked={options.workflowMgmtEnabled} onChange={options.handleWorkflowManagement} label="Enable Workflow Management REST API" />
        </>
    ));
    return (options.agentMode ? [tracing, icp, workflow] : [icp, tracing, workflow]).filter(Boolean);
}

export function DeploymentPanel(props: DeploymentPanelProps) {
    const { projectPath, isInDevant, hasAgents, hasDeployableIntegration, ampTracingEnabled, handleAmpTracing, handleDeploy, goToDevant } = props;
    const productMode = useProductMode();
    const agentMode = hasAgents && productMode === ProductMode.AGENT_BUILDER;
    const noun = agentMode ? "agent" : "integration";
    const cloud = useWso2Cloud(projectPath);
    const { data: agentManager } = useAgentManagerStatus(projectPath, hasAgents);
    const [open, setOpen] = useState<Partial<Record<"deploy" | "monitor", string>>>({ deploy: agentMode ? "agentManager" : "cloud" });

    if (isInDevant) {
        return <DevantDashboard projectStructure={props.projectStructure} handleDeploy={handleDeploy} goToDevant={goToDevant} />;
    }

    const itemIn = (section: "deploy" | "monitor"): ItemFactory => (id, title, tag, body) => {
        const isExpanded = open[section] === id;
        return (
            <DrawerItem key={id} title={title} tag={tag} isExpanded={isExpanded} onToggle={() => setOpen({ ...open, [section]: isExpanded ? undefined : id })}>
                {body}
            </DrawerItem>
        );
    };
    const item = itemIn("deploy");
    const agentManagerSection = (part: "deploy" | "monitor") => (
        <AgentManagerSection projectPath={projectPath} part={part} ampTracingEnabled={ampTracingEnabled} handleAmpTracing={handleAmpTracing} />
    );

    const agentManagerItem = hasAgents && item("agentManager", "WSO2 Agent Manager",
        agentManagerTag(agentManager), agentManagerSection("deploy"));
    const cloudItem = cloud.available && item("cloud", "WSO2 Cloud", cloud.isDeployed ? "Deployed" : undefined,
        <Wso2CloudBody cloud={cloud} noun={noun} canDeploy={hasDeployableIntegration && !cloud.isRefreshing}
            handleDeploy={handleDeploy} goToDevant={goToDevant} />);
    const dockerItem = item("docker", "Docker Image", undefined,
        <BuildOption description="Build a container image to deploy on Kubernetes or any container platform."
            label="Build Image" enabled={hasDeployableIntegration} onBuild={props.handleDockerBuild} />);
    const vmItem = item("vm", "Virtual Machine", undefined,
        <BuildOption description="Build an executable JAR to run on any server with a Java runtime."
            label="Build JAR" enabled={hasDeployableIntegration} onBuild={props.handleJarBuild} />);

    const deployItems = agentMode ? [agentManagerItem, cloudItem, dockerItem, vmItem] : [cloudItem, dockerItem, vmItem, agentManagerItem];
    const monitor = monitorItems({
        ...props, item: itemIn("monitor"), noun, agentMode, linkMode: agentManager?.link?.mode, tracingBody: agentManagerSection("monitor"),
    });

    return (
        <>
            <Title variant="h3">Deploy</Title>
            <SectionLead>Deploy this {noun} to a managed platform, or package it to run on your own infrastructure.</SectionLead>
            {deployItems}
            {monitor.length > 0 && (
                <>
                    <Divider sx={{ margin: "16px 0" }} />
                    <Title variant="h3">Management</Title>
                    <SectionLead>Connect deployments you host yourself to WSO2 management tools.</SectionLead>
                    {monitor}
                </>
            )}
        </>
    );
}
