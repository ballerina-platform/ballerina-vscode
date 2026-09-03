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

import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EditableTitle } from "../../../components/EditableTitle";
import {
    ProjectStructure,
    EVENT_TYPE,
    MACHINE_VIEW,
    BuildMode,
    BI_COMMANDS,
    DIRECTORY_MAP,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Typography, Codicon, ProgressRing, Button, Icon, Divider, CheckBox, ProgressIndicator, Overlay, Dropdown } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Markdown } from "../../../components/Markdown";
import { IOpenInConsoleCmdParams, WICommandIds } from "@wso2/wso2-platform-core";
import { AlertBoxWithClose } from "../../AIPanel/AlertBoxWithClose";
import { getIntegrationTypes, validateComponentName } from "./utils";
import { UndoRedoGroup } from "../../../components/UndoRedoGroup";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { PublishToCentralButton } from "./PublishToCentralButton";
import { LibraryOverview } from "./LibraryOverview";
import { CopilotComposer } from "./CopilotComposer";
import { useAgentRunState, useAiPanelOpen } from "../../../components/AgentStatusOrb/shared";

/** The diagram engine (`@wso2/component-diagram` and its layout stack) is the
 *  heaviest thing this view renders. Kept out of the overview's chunk so the page —
 *  header, README, deployment panel — paints without waiting for it; the diagram
 *  fills in a moment later, and the prefetcher usually has it warm before then. */
const LazyComponentDiagram = React.lazy(() => import("../ComponentDiagram"));

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const Title = styled(Typography)`
    margin: 8px 0;
`;

const Description = styled(Typography)`
    color: var(--vscode-descriptionForeground);
`;

const IconButtonContainer = styled.div`
    display: flex;
    align-items: flex-end;
`;

const ButtonContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
`;

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
`;

const EmptyStateContainer = styled.div`
    position: absolute;
    inset: 0;
`;

// Overlapping layers so the composer and the fallback crossfade instead of popping.
const CrossFadeLayer = styled.div<{ $show: boolean; $center?: boolean }>`
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: ${(props: { $center?: boolean }) => (props.$center ? "center" : "stretch")};
    justify-content: ${(props: { $center?: boolean }) => (props.$center ? "center" : "stretch")};
    opacity: ${(props: { $show: boolean }) => (props.$show ? 1 : 0)};
    // visibility (not just opacity) keeps the faded-out layer's buttons out of the tab order.
    visibility: ${(props: { $show: boolean }) => (props.$show ? "visible" : "hidden")};
    pointer-events: ${(props: { $show: boolean }) => (props.$show ? "auto" : "none")};
    transition: opacity 240ms ease, visibility 240ms;
`;

const PageLayout = styled.div`
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
`;

const HeaderRow = styled.div<{ isBallerinaWorkspace?: boolean }>`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0 16px 16px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-dropdown-border);
    margin: ${(props: { isBallerinaWorkspace?: boolean }) => props.isBallerinaWorkspace ? '0 16px 0 16px' : '16px 16px 0 16px'};
`;

const HeaderControls = styled.div`
    display: flex;
    gap: 8px;
    margin-right: 16px;
    align-items: center;
`;

const MainContent = styled.div<{ fullWidth?: boolean, sideCollapsed?: boolean }>`
    padding: 16px;
    display: grid;
    grid-template-columns: ${(props: { fullWidth?: boolean, sideCollapsed?: boolean }) =>
        props.fullWidth ? '1fr' : props.sideCollapsed ? '1fr 0fr' : '3fr 1fr'};
    grid-template-rows: minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
    transition: grid-template-columns 220ms ease;
`;

const DiagramPanel = styled.div<{ noPadding?: boolean, noBorder?: boolean }>`
    border: ${(props: { noBorder?: boolean }) => props.noBorder ? "none" : `1px solid ${ThemeColors.OUTLINE_VARIANT}`};
    border-radius: 4px;
    // Mirror the header's top inset at the bottom; the inner header supplies top/side padding.
    padding: ${(props: { noPadding?: boolean }) => (props.noPadding ? "0 0 16px 0" : "16px")};
    overflow: auto;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const LeftContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0; // Prevents flex blowout
`;

const SidePanel = styled.div<{ collapsed?: boolean }>`
    margin-left: ${(props: { collapsed?: boolean }) => (props.collapsed ? "0" : "16px")};
    // Sits outside the design panel, so its first heading needs the panel's own header inset
    // to share a baseline with the Design/Readme tabs.
    padding-top: 20px;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    opacity: ${(props: { collapsed?: boolean }) => (props.collapsed ? 0 : 1)};
    // visibility (not display) keeps the collapsed panel out of the tab order while still animating.
    visibility: ${(props: { collapsed?: boolean }) => (props.collapsed ? "hidden" : "visible")};
    transition: opacity 180ms ease, margin-left 220ms ease, visibility 220ms;
`;

// Full-height README view that replaces the design panel.
const ReadmePanel = styled.div`
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    padding: 16px;
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
`;

const ActionContainer = styled.div`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
`;

// Only labelled while the panel is hidden, so the label has to grow/shrink rather than pop.
// Width has to be an explicit px value, not max-width: `overflow: hidden` zeroes the span's
// min-content contribution, so the button would reserve no room for the label and clip it.
const DeployToggleLabel = styled.span<{ shown?: boolean, textWidth?: number }>`
    display: inline-block;
    flex: 0 0 auto;
    overflow: hidden;
    white-space: nowrap;
    width: ${(props: { shown?: boolean, textWidth?: number }) => (props.shown ? `${props.textWidth ?? 0}px` : "0")};
    opacity: ${(props: { shown?: boolean }) => (props.shown ? 1 : 0)};
    margin-left: ${(props: { shown?: boolean }) => (props.shown ? "5px" : "0")};
    transition: width 220ms ease, opacity 180ms ease, margin-left 220ms ease;
`;

const DEPLOY_PANEL_COLLAPSED_KEY = "ballerina.overview.deployPanelCollapsed";

// Storage may be unavailable/quota-restricted in the webview — default to expanded rather
// than throwing during render.
function loadDeployCollapsed(): boolean {
    try {
        return localStorage.getItem(DEPLOY_PANEL_COLLAPSED_KEY) === "true";
    } catch {
        return false;
    }
}

function storeDeployCollapsed(collapsed: boolean): void {
    try {
        localStorage.setItem(DEPLOY_PANEL_COLLAPSED_KEY, String(collapsed));
    } catch {
        return;
    }
}

const EmptyReadmeContainer = styled.div`
    display: flex;
    margin: 50px 0px;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    justify-content: center;
    height: 100%;
`;

const DiagramHeaderContainer = styled.div<{ withPadding?: boolean }>`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: ${(props: { withPadding?: boolean }) => props.withPadding ? "16px 16px 0 16px" : "0"};
`;


const DiagramContent = styled.div`
    flex: 1;
    min-height: 0; // Prevents flex blowout
    position: relative;
`;

const DeploymentContent = styled.div`
    margin-top: 16px;
    min-width: 130px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--vscode-descriptionForeground);

    h3 {
        margin: 0 0 16px 0;
        color: inherit;
    }

    p {
        color: inherit;
    }
`;

const DeployButtonContainer = styled.div`
    margin-top: 16px;
    margin-bottom: 16px;
`;

const ReadmeHeaderContainer = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
`;

const ReadmeButtonContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const ViewTabs = styled.div`
    display: flex;
    align-items: baseline;
    gap: 16px;
`;

// A real button, styled to keep the h2-heading look the switch always had.
const ViewTab = styled.button<{ active?: boolean }>`
    background: none;
    border: none;
    padding: 0;
    margin: 8px 0;
    font: inherit;
    font-size: 1.5em;
    font-weight: bold;
    color: inherit;
    cursor: ${(props: { active?: boolean }) => (props.active ? "default" : "pointer")};
    opacity: ${(props: { active?: boolean }) => (props.active ? 1 : 0.45)};
    transition: opacity 0.1s;

    &:hover {
        opacity: ${(props: { active?: boolean }) => (props.active ? 1 : 0.75)};
    }

    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
    }
`;

const ReadmeContent = styled.div`
    margin-top: 16px;
    text-wrap: pretty;
    overflow-wrap: break-word;

    p, li, td, th, blockquote {
        overflow-wrap: break-word;
    }

    pre {
        overflow-x: auto;
        overflow-wrap: break-word;
    }
    
    code {
        white-space: pre-wrap;
        overflow-wrap: break-word;
    }
`;

const TitleContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 8px;
`;

const ProjectTitle = styled.h1`
    font-weight: bold;
    font-size: 1.5rem;
    margin-bottom: 0;
    margin-top: 0;
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

const DeployButton = styled.div`
    border: 1px solid var(--vscode-welcomePage-tileBorder);
    cursor: default !important;
    background: var(--vscode-welcomePage-tileBackground);
    border-radius: 6px;
    display: flex;
    overflow: hidden;
    width: 100%;
    padding: 10px;
    flex-direction: column;
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

const DevantHeaderWrap = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    title: ReactNode;
    description: string;
    buttonText: string;
    isExpanded: boolean;
    onToggle: () => void;
    onDeploy: () => void;
    learnMoreLink?: string;
    hasDeployableIntegration?: boolean;
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
    secondaryAction,
    hasDeployableIntegration
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
                    tooltip={hasDeployableIntegration ? "" : "No deployable integration found"}
                >
                    {buttonText}
                </Button>
                {secondaryAction && (
                    <>
                        <p>{secondaryAction.description}</p>
                        <Button appearance="primary" onClick={(e) => {
                            e.stopPropagation();
                            secondaryAction.onClick()
                        }}>
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
                {"Manage long-running workflows in this integration, including human tasks, activities, and execution state."}
            </p>
            <div style={{ paddingLeft: 10 }}>
                <CheckBox
                    checked={enabled}
                    onChange={handleWorkflowManagement}
                    label="Enable Workflow Management"
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

    const refreshStatus = async () => {
        try {
            const res = await rpcClient.getICPRpcClient().isICPServerRunning({ projectPath: '' });
            setServerRunning(!!res.enabled);
        } catch (err) {
            console.error('[ICP] Failed to refresh ICP server status:', err);
        }
    };

    useEffect(() => {
        refreshStatus();
        const interval = setInterval(refreshStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
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

function DevantDashboard({ projectStructure, handleDeploy, goToDevant }: { projectStructure: ProjectStructure, handleDeploy: () => void, goToDevant: () => void }) {
    const { rpcClient } = useRpcContext();
    const { platformExtState } = usePlatformExtContext();

    const handleSaveAndDeployToDevant = () => {
        handleDeploy();
    }

    const handlePushChanges = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.DEVANT_PUSH_TO_CLOUD] });
    }

    // Check if integration has automation or service.
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


interface PackageOverviewProps {
    projectPath: string;
    isInDevant: boolean;
    isICPSupported?: boolean;
}

/** Keeps a node mounted for `delayMs` after it should hide, so it can animate out. */
function useDelayedUnmount(shouldRender: boolean, delayMs: number): boolean {
    const [mounted, setMounted] = useState(shouldRender);
    useEffect(() => {
        if (shouldRender) {
            setMounted(true);
            return;
        }
        const timer = setTimeout(() => setMounted(false), delayMs);
        return () => clearTimeout(timer);
    }, [shouldRender, delayMs]);
    return mounted;
}

export function PackageOverview(props: PackageOverviewProps) {
    const { projectPath, isInDevant, isICPSupported } = props;
    const { rpcClient } = useRpcContext();
    const [readmeContent, setReadmeContent] = React.useState<string>("");
    const { platformExtState } = usePlatformExtContext();
    const [enabled, setEnableICP] = useState(false);
    const [workflowMgmtEnabled, setWorkflowMgmtEnabled] = useState(false);
    const [showAlert, setShowAlert] = React.useState(false);
    const [projectStructure, setProjectStructure] = useState<ProjectStructure>();
    const [isInProject, setIsInProject] = useState(false);
    const [isLibrary, setIsLibrary] = useState<boolean>(false);
    const [isNPSupported, setIsNPSupported] = useState<boolean>(false);
    const [overviewView, setOverviewView] = useState<"design" | "readme">("design");
    const [deployCollapsed, setDeployCollapsed] = useState<boolean>(loadDeployCollapsed);
    const [deployLabelWidth, setDeployLabelWidth] = useState(0);
    // Measured on attach rather than in an effect: the label mounts below an early return,
    // so a mount effect would only ever see a null ref.
    const deployLabelRef = useCallback((node: HTMLSpanElement | null) => {
        if (node) {
            setDeployLabelWidth((width) => (width === 0 ? node.scrollWidth : width));
        }
    }, []);
    const aiPanelOpen = useAiPanelOpen();
    const agentState = useAgentRunState();
    const awaitingInput = agentState === "awaiting-input";
    const agentWorking = agentState === "running" || awaitingInput;
    // Show the composer when the panel is closed, and also while a run is active even with the
    // panel open — so the run status looks the same either way (it renders only its run-state then).
    const showHero = !isLibrary && (!aiPanelOpen || agentWorking);
    // Keep the outgoing surface mounted through the 240ms crossfade.
    const composerMounted = useDelayedUnmount(showHero, 260);
    const fallbackMounted = useDelayedUnmount(!isLibrary && !showHero, 260);

    const fetchContext = useCallback(() => {
        rpcClient
            .getBIDiagramRpcClient()
            .getProjectStructure()
            .then((res) => {
                const project = res.projects.find(project => isSamePath(project.projectPath, projectPath));
                setIsInProject(res.workspaceName !== undefined);
                if (project) {
                    setProjectStructure(project);
                    setIsLibrary(project.isLibrary ?? false);
                }
            });

        rpcClient.getCommonRpcClient().isNPSupported().then(setIsNPSupported);

        rpcClient
            .getBIDiagramRpcClient()
            .handleReadmeContent({ projectPath, read: true })
            .then((res) => {
                setReadmeContent(res.content);
            });

        if (isICPSupported) {
            rpcClient
                .getICPRpcClient()
                .isIcpEnabled({ projectPath: '' })
                .then((res) => {
                    setEnableICP(res.enabled);
                });
        }

        rpcClient
            .getWorkflowManagementRpcClient()
            .isWorkflowManagementEnabled({ projectPath })
            .then((res) => {
                setWorkflowMgmtEnabled(res.enabled);
            });
    }, [rpcClient, projectPath, isICPSupported]);

    useEffect(() => {
        fetchContext();
        showLoginAlert().then((status) => {
            setShowAlert(status);
        });
    }, [projectPath, fetchContext]);

    // Keep a stable ref so the subscription callback always calls the latest fetchContext
    // without needing to re-register the listener every time fetchContext changes.
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

    const deployableIntegrationTypes = useMemo(() => {
        return getIntegrationTypes(projectStructure);
    }, [projectStructure]);

    const integrationTitle = useMemo(() => {
        return projectStructure?.projectTitle || projectStructure?.projectName;
    }, [projectStructure]);

    const validateTitle = useCallback((value: string): string => {
        return validateComponentName(value.trim(), isLibrary) ?? "";
    }, [isLibrary]);

    const handleTitleUpdate = useCallback(async (newTitle: string) => {
        await rpcClient.getBIDiagramRpcClient().updatePackageTitle({
            packagePath: projectPath,
            title: newTitle,
        });
        // Optimistically update the displayed title immediately.
        // Do NOT call fetchContext() here — buildProjectsStructure in the backend is async;
        // calling getProjectStructure() too early would return stale data and overwrite this update.
        // The backend's notifyCurrentWebview() fires after buildProjectsStructure completes,
        // which triggers onProjectContentUpdated → fetchContext() as the background confirm.
        setProjectStructure(prev => prev ? { ...prev, projectTitle: newTitle } : prev);
    }, [projectPath, rpcClient]);

    function isEmptyIntegration(): boolean {
        // Filter out connections that start with underscore
        const validConnections = projectStructure.directoryMap[DIRECTORY_MAP.CONNECTION]?.filter(
            conn => !conn.name.startsWith('_')
        ) || [];

        return (
            (!projectStructure.directoryMap[DIRECTORY_MAP.AUTOMATION] || projectStructure.directoryMap[DIRECTORY_MAP.AUTOMATION].length === 0) &&
            (validConnections.length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.LISTENER] || projectStructure.directoryMap[DIRECTORY_MAP.LISTENER].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.SERVICE] || projectStructure.directoryMap[DIRECTORY_MAP.SERVICE].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.WORKFLOW] || projectStructure.directoryMap[DIRECTORY_MAP.WORKFLOW].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.ACTIVITY] || projectStructure.directoryMap[DIRECTORY_MAP.ACTIVITY].length === 0) &&
            (!projectStructure.directoryMap[DIRECTORY_MAP.AGENT] || projectStructure.directoryMap[DIRECTORY_MAP.AGENT].length === 0)
        );
    }

    if (!projectStructure) {
        return (
            <SpinnerContainer>
                <ProgressRing color={ThemeColors.PRIMARY} />
            </SpinnerContainer>
        );
    }

    const handleAddConstruct = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIComponentView,
            },
        });
    };

    const handleDeploy = async () => {
        await rpcClient.getBIDiagramRpcClient().deployProject({
            integrationTypes: deployableIntegrationTypes
        });
    };

    const refreshWorkflowManagementState = () => {
        rpcClient.getWorkflowManagementRpcClient().isWorkflowManagementEnabled({ projectPath })
            .then((res) => setWorkflowMgmtEnabled(res.enabled));
    };

    const handleICP = (icpEnabled: boolean) => {
        // Update the checkbox state optimistically so it doesn't flicker while the RPC is in flight.
        setEnableICP(icpEnabled);
        if (icpEnabled) {
            rpcClient.getICPRpcClient().addICP({ projectPath: '' })
                .then(() => {
                    setEnableICP(true);
                    // Enabling ICP may auto-enable Workflow Management (when the integration has
                    // workflow functions), so re-sync that checkbox from the language server.
                    refreshWorkflowManagementState();
                })
                .catch(() => setEnableICP(false));
        } else {
            rpcClient.getICPRpcClient().disableICP({ projectPath: '' })
                .then(() => setEnableICP(false))
                .catch(() => setEnableICP(true));
        }
    };

    const handleWorkflowManagement = (wfEnabled: boolean) => {
        // Optimistic update to avoid checkbox flicker during the RPC round-trip.
        setWorkflowMgmtEnabled(wfEnabled);
        if (wfEnabled) {
            rpcClient.getWorkflowManagementRpcClient().addWorkflowManagement({ projectPath })
                // The RPC reports failures via errorMsg (it resolves rather than rejects), so roll
                // back to the pre-toggle state instead of trusting enabled on a reported failure.
                .then((res) => setWorkflowMgmtEnabled(res.errorMsg ? false : (res.enabled ?? true)))
                .catch(() => setWorkflowMgmtEnabled(false));
        } else {
            rpcClient.getWorkflowManagementRpcClient().disableWorkflowManagement({ projectPath })
                .then((res) => setWorkflowMgmtEnabled(res.errorMsg ? true : (res.enabled ?? false)))
                .catch(() => setWorkflowMgmtEnabled(true));
        }
    };

    const handleGenerateWithReadme = () => {
        rpcClient.getBIDiagramRpcClient().openAIChat({
            readme: true,
            planMode: true,
        });
    };

    const handleEditReadme = () => {
        rpcClient.getBIDiagramRpcClient().openReadme({ projectPath });
    };

    const handleLocalRun = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.BI_RUN_PROJECT] });
    };

    const handleLocalDebug = () => {
        rpcClient.getCommonRpcClient().executeCommand({ commands: [BI_COMMANDS.BI_DEBUG_PROJECT] });
    };

    const handleLocalConfigure = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.ViewConfigVariables,
            },
        });
    }

    const handleDockerBuild = () => {
        rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.DOCKER);
    };

    const handleJarBuild = () => {
        rpcClient.getBIDiagramRpcClient().buildProject(BuildMode.JAR);
    };

    const goToDevant = () => {
        rpcClient.getCommonRpcClient().executeCommand({
            commands: [
                WICommandIds.OpenInConsole,
                {
                    componentFsPath: projectPath,
                    component: platformExtState?.selectedComponent,
                    newComponentParams: { buildPackLang: "ballerina" }
                } as IOpenInConsoleCmdParams]
        })
    };

    function handleSettings() {
        rpcClient.getAiPanelRpcClient().openAIPanel({
            type: 'text',
            planMode: false,
            text: ''
        });
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

    const handleBack = () => {
        rpcClient.getVisualizerRpcClient().goBack();
    };

    const handleToggleDeployPanel = () => {
        setDeployCollapsed((collapsed) => {
            storeDeployCollapsed(!collapsed);
            return !collapsed;
        });
    };

    // Labelled only while the panel is hidden; expanded, its own "Deployment Options" heading names it.
    const deployPanelToggle = (
        <Button
            appearance="icon"
            onClick={handleToggleDeployPanel}
            tooltip={deployCollapsed ? "Show deployment panel" : "Hide deployment panel"}
            aria-label={deployCollapsed ? "Show deployment panel" : "Hide deployment panel"}
            aria-expanded={!deployCollapsed}
            buttonSx={{ padding: "4px 8px" }}
        >
            <Codicon name={deployCollapsed ? "layout-sidebar-right-off" : "layout-sidebar-right"} />
            <DeployToggleLabel ref={deployLabelRef} shown={deployCollapsed} textWidth={deployLabelWidth}>
                Deployment
            </DeployToggleLabel>
        </Button>
    );

    const headerActions = (
        <>
            <Button appearance="icon" onClick={handleLocalConfigure} buttonSx={{ padding: "4px 8px" }}>
                <Icon
                    name="bi-settings"
                    sx={{
                        marginRight: 5,
                        fontSize: "16px",
                        width: "16px",
                    }}
                />
                Configure
            </Button>
            {!isLibrary && (
                <>
                    <Button appearance="icon" onClick={handleLocalRun} buttonSx={{ padding: "4px 8px" }}>
                        <Codicon name="play" sx={{ marginRight: 5 }} /> Run
                    </Button>
                    <Button appearance="icon" onClick={handleLocalDebug} buttonSx={{ padding: "4px 8px" }}>
                        <Codicon name="debug" sx={{ marginRight: 5 }} /> Debug
                    </Button>
                    {deployPanelToggle}
                </>
            )}
            {isLibrary && (
                <PublishToCentralButton />
            )}
        </>
    );

    const viewSwitch = !isLibrary ? (
        <ViewTabs role="tablist" aria-label="Overview view">
            <ViewTab
                type="button"
                role="tab"
                aria-selected={overviewView === "design"}
                aria-controls="overview-design-view"
                active={overviewView === "design"}
                onClick={() => setOverviewView("design")}
            >
                Design
            </ViewTab>
            <ViewTab
                type="button"
                role="tab"
                aria-selected={overviewView === "readme"}
                aria-controls="overview-readme-view"
                active={overviewView === "readme"}
                onClick={() => setOverviewView("readme")}
            >
                Readme
            </ViewTab>
        </ViewTabs>
    ) : undefined;


    return (
        <PageLayout>
            {isInProject && <TopNavigationBar projectPath={projectPath} />}
            {isInProject ? (
                    <TitleBar
                        title={integrationTitle}
                        subtitle={isLibrary ? "Library" : "Integration"}
                        onBack={handleBack}
                        actions={headerActions}
                        onTitleEdit={handleTitleUpdate}
                        validateTitle={validateTitle}
                    />
                ) : (
                    <HeaderRow>
                        <TitleContainer>
                            <EditableTitle
                                title={integrationTitle}
                                onCommit={handleTitleUpdate}
                                validate={validateTitle}
                            >
                                <ProjectTitle>{integrationTitle}</ProjectTitle>
                            </EditableTitle>
                            <ProjectSubtitle>{isLibrary ? "Library" : "Integration"}</ProjectSubtitle>
                        </TitleContainer>
                        <HeaderControls>
                            <UndoRedoGroup key={Date.now()} />
                            {headerActions}
                        </HeaderControls>
                    </HeaderRow>
                )}
                <MainContent fullWidth={isLibrary} sideCollapsed={deployCollapsed}>
                    <LeftContent>
                        {overviewView === "readme" && !isLibrary ? (
                            <ReadmePanel id="overview-readme-view" role="tabpanel">
                                <ReadmeHeaderContainer>
                                    {viewSwitch}
                                    <ReadmeButtonContainer>
                                        {readmeContent && isEmptyIntegration() && (
                                            <Button appearance="icon" onClick={handleGenerateWithReadme} buttonSx={{ padding: "4px 8px" }}>
                                                <Codicon name="wand" sx={{ marginRight: 4, fontSize: 16 }} /> Generate with Readme
                                            </Button>
                                        )}
                                        <Button appearance="icon" onClick={handleEditReadme} buttonSx={{ padding: "4px 8px" }}>
                                            <Icon name="bi-edit" sx={{ marginRight: 8, fontSize: 16 }} /> Edit
                                        </Button>
                                    </ReadmeButtonContainer>
                                </ReadmeHeaderContainer>
                                <ReadmeContent>
                                    {readmeContent ? (
                                        <Markdown>{readmeContent}</Markdown>
                                    ) : (
                                        <EmptyReadmeContainer>
                                            <Description variant="body2">
                                                Describe your integration and generate your artifacts with AI
                                            </Description>
                                            <VSCodeLink onClick={handleEditReadme}>Add a README</VSCodeLink>
                                        </EmptyReadmeContainer>
                                    )}
                                </ReadmeContent>
                            </ReadmePanel>
                        ) : (
                        <DiagramPanel id="overview-design-view" role="tabpanel" noPadding={true} noBorder={isLibrary}>
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
                            {!isLibrary && (
                                <DiagramHeaderContainer withPadding={true}>
                                    {viewSwitch}
                                    {/* An empty integration has its own copy of this below,
                                        centred in the empty state, so only one is ever on screen. */}
                                    {!isEmptyIntegration() && (
                                        <ActionContainer>
                                            <Button appearance="primary" onClick={handleAddConstruct}>
                                                <Codicon name="add" sx={{ marginRight: 8 }} /> Add Artifact
                                            </Button>
                                        </ActionContainer>
                                    )}
                                </DiagramHeaderContainer>
                            )}
                            {isLibrary && <LibraryOverview projectStructure={projectStructure} isNPSupported={isNPSupported} projectPath={projectPath} onRefresh={fetchContext} />}
                            {!isLibrary && (
                                <DiagramContent>
                                    {isEmptyIntegration() ? (
                                        <EmptyStateContainer>
                                            {composerMounted && (
                                                <CrossFadeLayer $show={showHero}>
                                                    <CopilotComposer onAddArtifactManually={handleAddConstruct} hiding={!showHero} />
                                                </CrossFadeLayer>
                                            )}
                                            {fallbackMounted && (
                                                <CrossFadeLayer $show={!showHero} $center>
                                                    <Typography variant="h3" sx={{ marginBottom: "16px" }}>
                                                        Your integration is empty
                                                    </Typography>
                                                    <StatusRow>
                                                        <Typography
                                                            variant="body1"
                                                            sx={{ color: "var(--vscode-descriptionForeground)" }}
                                                        >
                                                            Add an artifact to get started
                                                        </Typography>
                                                    </StatusRow>
                                                    <ButtonContainer>
                                                        <Button appearance="primary" onClick={handleAddConstruct}>
                                                            <Codicon name="add" sx={{ marginRight: 8 }} /> Add Artifact
                                                        </Button>
                                                    </ButtonContainer>
                                                </CrossFadeLayer>
                                            )}
                                        </EmptyStateContainer>
                                    ) : (
                                        <React.Suspense
                                            fallback={
                                                <SpinnerContainer>
                                                    <ProgressRing color={ThemeColors.PRIMARY} />
                                                </SpinnerContainer>
                                            }
                                        >
                                            <LazyComponentDiagram projectStructure={projectStructure} />
                                        </React.Suspense>
                                    )}
                                </DiagramContent>
                            )}
                        </DiagramPanel>
                        )}
                    </LeftContent>
                    {!isLibrary && (
                        <SidePanel collapsed={deployCollapsed} aria-hidden={deployCollapsed}>
                            {!isInDevant &&
                                <>
                                    <DeploymentOptions
                                        handleDockerBuild={handleDockerBuild}
                                        handleJarBuild={handleJarBuild}
                                        handleDeploy={handleDeploy}
                                        goToDevant={goToDevant}
                                        hasDeployableIntegration={deployableIntegrationTypes.length > 0}
                                        projectPath={projectPath}
                                    />
                                    {isICPSupported && (
                                        <>
                                            <Divider sx={{ margin: "16px 0" }} />
                                            <IntegrationControlPlane enabled={enabled} handleICP={handleICP} />
                                            <div style={{ marginTop: 8 }}>
                                                <LocalICPDeployment />
                                            </div>
                                        </>
                                    )}
                                    {(projectStructure?.directoryMap?.[DIRECTORY_MAP.WORKFLOW]?.length ?? 0) > 0 && (
                                        <>
                                            <Divider sx={{ margin: "16px 0" }} />
                                            <WorkflowManagement
                                                enabled={workflowMgmtEnabled}
                                                handleWorkflowManagement={handleWorkflowManagement}
                                            />
                                        </>
                                    )}
                                </>
                            }
                            {isInDevant &&
                                <DevantDashboard
                                    projectStructure={projectStructure}
                                    handleDeploy={handleDeploy}
                                    goToDevant={goToDevant}
                                />
                            }
                        </SidePanel>
                    )}
                </MainContent>
        </PageLayout>
    );
}
