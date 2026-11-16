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

import styled from "@emotion/styled";
import type { OpenInConsoleParams } from "@wso2/wso2-cloud-client/contract";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { Codicon, Dropdown, Popover, ThemeColors, VSCodeColors, Button } from "@wso2/ui-toolkit";
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import {
    ICmdParamsBase,
    ICreateDirCtxCmdParams,
    IManageDirContextCmdParams,
    WICommandIds,
} from "@wso2/wso2-platform-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { QuickPickItem } from "vscode";

const PopupContainer = styled.div`
    min-width: 200px;
    font-family: "GilmerRegular";
    font-size: 12px;
    text-overflow: ellipsis;
    color: ${ThemeColors.ON_SURFACE};
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    ul {
        padding: 0 12px;
        margin: 0;
    }
`;

const PanelItem = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
`;

const PanelItemContent = styled.div`
    flex: 1;
`;

const PanelItemTitle = styled.div`
    font-size: 10px;
    opacity: 60%;
    line-height: 10px;
    margin-bottom: 2px;
`;

const PanelItemVal = styled.div`
    font-size: 12px;
    line-height: 12px;
`;

const PanelItemValButton = styled(PanelItemVal)`
    cursor: pointer;
    &:hover {
        text-decoration: underline;
    }
`;

const ButtonGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
    padding-top: 8px;
`;

const PanelItemVSCodeLink = styled(VSCodeLink)`
    font-size: 11px;
    line-height: 11px;
`;

export interface DiagnosticsPopUpProps {
    isVisible: boolean;
    anchorEl: HTMLElement;
    onClose: () => void;
    projectPath?: string;
}

export function PlatformExtPopover(props: DiagnosticsPopUpProps) {
    const { isVisible, onClose, anchorEl, projectPath } = props;
    const { platformExtState, platformRpcClient, loginToDevant, handleLinkWorkspace } = usePlatformExtContext();
    const { rpcClient } = useRpcContext();

    const handleSignOut = () => {
        rpcClient
            .getCommonRpcClient()
            .showInformationModal({
                message: "Are you sure you want to sign out of your WSO2 Integration Platform account?",
                items: ["Yes"],
            })
            .then((res) => {
                if (res === "Yes") {
                    rpcClient.getCommonRpcClient().executeCommand({
                        commands: [WICommandIds.SignOut],
                    });
                }
            });
    };

    const handleSwitchProject = () => {
        rpcClient.getCommonRpcClient().executeCommand({
            commands: [
                WICommandIds.ManageDirectoryContext,
                {
                    onlyShowSwitchProject: true,
                } as IManageDirContextCmdParams,
            ],
        });
    };

    const nonCriticalEnvs = platformExtState?.envs?.filter((env) => !env.critical) || [];

    const handleEnvSelect = () => {
        rpcClient
            .getCommonRpcClient()
            .showQuickPick({
                items: nonCriticalEnvs.map((env) => ({ label: env.name })) || [],
                options: { title: "Select Environment to Connect" },
            })
            .then((resp) => {
                const selectedEnv = nonCriticalEnvs.find((env) => env.name === resp?.label);
                if (selectedEnv) {
                    platformRpcClient.setSelectedEnv(selectedEnv.id);
                }
            });
    };

    const openIntegrationInConsole = () => {
        const params: OpenInConsoleParams = {
            componentFsPath: projectPath,
            project: platformExtState?.selectedContext?.project,
            component: platformExtState?.selectedIntegration?.integration,
            newComponentParams: { buildPackLang: "ballerina" },
        };
        rpcClient.getCommonRpcClient().executeCommand({ commands: [WICommandIds.OpenInConsole, params] });
    };

    const handleIntegrationSelect = () => {
        if (platformExtState?.integrations?.length === 0) {
            return;
        }
        if (platformExtState?.integrations?.length === 1) {
            openIntegrationInConsole();
            return;
        }

        const quickPickOptions: QuickPickItem[] = [
            {
                label: "View in Console",
                detail: "Open the integration in WSO2 Integration Platform Console",
            },
            { kind: -1, label: "Associated Integrations" },
            ...platformExtState?.integrations.map((item) => ({
                label: item.integration.displayName || item.integration.name,
                // The id tells two integrations with one display name apart.
                detail: item.integration.id,
                description:
                    item.integration.id === platformExtState?.selectedIntegration?.integration.id ? "Selected" : undefined,
            })),
        ];
        rpcClient
            .getCommonRpcClient()
            .showQuickPick({
                items: quickPickOptions,
                options: { title: "Select Integration" },
            })
            .then((resp) => {
                if (resp?.label === "View in Console") {
                    openIntegrationInConsole();
                    return;
                }
                const selectedIntegration = platformExtState?.integrations.find((item) => item.integration.id === resp?.detail);
                if (selectedIntegration) {
                    platformRpcClient.setSelectedIntegration(selectedIntegration.integration.id);
                }
            });
    };

    return (
        <>
            <Popover
                open={isVisible}
                anchorEl={anchorEl}
                handleClose={onClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                sx={{
                    backgroundColor: ThemeColors.SURFACE_DIM,
                    padding: 4,
                    borderRadius: 2,
                    marginTop: 4,
                    border: `1px solid ${VSCodeColors.PANEL_BORDER}`,
                    zIndex: 1000,
                }}
            >
                <PopupContainer>
                    {platformExtState?.session ? (
                        <>
                            <PanelItem>
                                <PanelItemContent>
                                    <PanelItemTitle>Account</PanelItemTitle>
                                    <PanelItemVal>{platformExtState?.session?.user.email ?? platformExtState?.session?.user.displayName}</PanelItemVal>
                                </PanelItemContent>
                                <ButtonGroup>
                                    <Button appearance="icon" tooltip="Sign Out" onClick={handleSignOut}>
                                        <Codicon name="sign-out" iconSx={{ color: ThemeColors.ERROR }} />
                                    </Button>
                                </ButtonGroup>
                            </PanelItem>
                            {platformExtState?.selectedContext ? (
                                <>
                                    <PanelItem>
                                        <PanelItemContent>
                                            <PanelItemTitle>Organization</PanelItemTitle>
                                            <PanelItemVal>{platformExtState?.session?.org.name}</PanelItemVal>
                                        </PanelItemContent>
                                    </PanelItem>
                                    <PanelItem>
                                        <PanelItemContent>
                                            <PanelItemTitle>Project</PanelItemTitle>
                                            <PanelItemValButton
                                                onClick={handleSwitchProject}
                                                title="Link with a different WSO2 Cloud project"
                                            >
                                                {platformExtState?.selectedContext?.project?.name ?? platformExtState?.selectedContext?.projectName}
                                            </PanelItemValButton>
                                        </PanelItemContent>
                                    </PanelItem>
                                    {projectPath && (
                                        <>
                                            {platformExtState?.selectedIntegration && (
                                                <PanelItem>
                                                    <PanelItemContent>
                                                        <PanelItemTitle>Integration</PanelItemTitle>
                                                        <PanelItemValButton
                                                            onClick={handleIntegrationSelect}
                                                            title="View Integration"
                                                        >
                                                            {platformExtState?.selectedIntegration?.integration.displayName ||
                                                                platformExtState?.selectedIntegration?.integration.name}
                                                        </PanelItemValButton>
                                                    </PanelItemContent>
                                                </PanelItem>
                                            )}
                                            {platformExtState?.devantConns?.list?.length > 0 &&
                                                platformExtState?.selectedEnv && (
                                                    <PanelItem>
                                                        <PanelItemContent>
                                                            <PanelItemTitle>Connected Environment</PanelItemTitle>
                                                            {nonCriticalEnvs?.length > 1 ? (
                                                                <PanelItemValButton
                                                                    onClick={handleEnvSelect}
                                                                    title="Select a different WSO2 Cloud Environment"
                                                                >
                                                                    {platformExtState?.selectedEnv?.name}
                                                                </PanelItemValButton>
                                                            ) : (
                                                                <PanelItemVal>
                                                                    {platformExtState?.selectedEnv?.name}
                                                                </PanelItemVal>
                                                            )}
                                                        </PanelItemContent>
                                                    </PanelItem>
                                                )}
                                            {platformExtState?.devantConns?.list?.length > 0 && (
                                                <PanelItem>
                                                    <PanelItemContent>
                                                        <PanelItemTitle style={{ marginBottom: 0 }}>
                                                            Using {platformExtState?.devantConns?.list?.length} WSO2 Cloud{" "}
                                                            {platformExtState?.devantConns?.list?.length < 2
                                                                ? "Connection"
                                                                : "Connections"}
                                                        </PanelItemTitle>

                                                        <PanelItemVal>
                                                            Connect to WSO2 Cloud <br />
                                                            while running or debugging
                                                        </PanelItemVal>
                                                    </PanelItemContent>
                                                    <ButtonGroup>
                                                        <VSCodeCheckbox
                                                            checked={platformExtState?.devantConns?.connectedToDevant}
                                                            onChange={() => {
                                                                platformRpcClient.setConnectedToDevant(
                                                                    !!!platformExtState?.devantConns?.connectedToDevant,
                                                                );
                                                            }}
                                                        />
                                                    </ButtonGroup>
                                                </PanelItem>
                                            )}
                                        </>
                                    )}
                                </>
                            ) : (
                                <PanelItem>
                                    <PanelItemVal style={{ textAlign: "center", maxWidth: 210 }}>
                                        <PanelItemVSCodeLink onClick={handleLinkWorkspace}>
                                            Link workspace
                                        </PanelItemVSCodeLink>{" "}
                                        with a WSO2 Cloud project to activate cloud features
                                    </PanelItemVal>
                                </PanelItem>
                            )}
                        </>
                    ) : (
                        <PanelItem>
                            <PanelItemVal style={{ textAlign: "center" }}>
                                <PanelItemVSCodeLink onClick={loginToDevant}>Login</PanelItemVSCodeLink> to your WSO2 Integration Platform account
                                <br /> to manage your project in the cloud
                            </PanelItemVal>
                        </PanelItem>
                    )}
                </PopupContainer>
            </Popover>
        </>
    );
}
