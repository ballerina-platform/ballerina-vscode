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
import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Button, Codicon, Icon } from "@wso2/ui-toolkit";

import { AIChatView, DangerActionButton, PrimaryActionButton, SuccessActionButton } from "../styles";
import { AIMachineEventType, AgentsMdFileInfoDTO, McpServerStatusDTO, SkillEntry } from "@wso2/ballerina-core";
import { CustomizeRow, CustomizeEntry } from "./CustomizeRow";
import type { PanelRoute } from "../components/AIChat";

// ── Layout ────────────────────────────────────────────────────────────────────

const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
`;

const PanelTitle = styled.span`
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
`;

const PanelContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 24px;
`;

const PanelFooter = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid var(--vscode-panel-border);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
    font-family: var(--vscode-font-family);
`;

// ── Section ───────────────────────────────────────────────────────────────────

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const SectionHeader = styled.h3`
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--vscode-descriptionForeground);
    margin: 0;
    font-family: var(--vscode-font-family);
`;

const SettingRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
`;

const SettingInfo = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
`;

const SettingLabel = styled.span`
    font-size: 13px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
`;

const SettingDescription = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);
`;

const EntryList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

// ── Action buttons ────────────────────────────────────────────────────────────

const DestructiveButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: var(--vscode-font-family);
    transition: all 0.15s ease;
    color: var(--vscode-errorForeground);
    background: var(--vscode-inputValidation-errorBackground, transparent);
    border: 1px solid var(--vscode-errorForeground);
    &:hover { opacity: 0.85; }
`;

const CopilotButton = styled.button<{ authorized: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: var(--vscode-font-family);
    transition: all 0.15s ease;

    ${(props: { authorized: boolean }) => props.authorized ? `
        color: var(--vscode-charts-green, #388a34);
        background: transparent;
        border: 1px solid var(--vscode-charts-green, #388a34);
        cursor: default;
        opacity: 0.85;
    ` : `
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        border: 1px solid transparent;
        &:hover { background: var(--vscode-button-hoverBackground); }
    `}
`;

const ActionButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: var(--vscode-font-family);
    transition: all 0.15s ease;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, transparent);
    border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-panel-border));
    &:hover { opacity: 0.85; }
`;

const ConfirmRow = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
`;

const CancelLink = styled.button`
    background: none;
    border: none;
    padding: 2px 4px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    &:hover { color: var(--vscode-foreground); }
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface SettingsPanelProps {
    onClose: () => void;
    onNavigate?: (route: PanelRoute) => void;
    mcpToolsEnabled?: boolean;
}

export const SettingsPanel = (props: SettingsPanelProps) => {
    const { rpcClient } = useRpcContext();

    const [copilotAuthorized, setCopilotAuthorized] = React.useState(false);
    const [mcpEnabled, setMcpEnabled] = useState(!!props.mcpToolsEnabled);
    const [mcpServers, setMcpServers] = useState<McpServerStatusDTO[]>([]);
    const [skills, setSkills] = useState<SkillEntry[]>([]);
    const [agentsMdInfo, setAgentsMdInfo] = useState<AgentsMdFileInfoDTO | null>(null);
    // TODO(auto-memory): memory UI state temporarily disabled for this release — restore once the memory feature is refined.
    // const [clearing, setClearing] = React.useState<'workspace' | 'all' | null>(null);
    // const [clearError, setClearError] = React.useState<string | null>(null);

    useEffect(() => {
        isCopilotAuthorized().then(setCopilotAuthorized);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const api = rpcClient.getAiPanelRpcClient();
        api.getMcpToolsEnabled().then(v => {
            if (cancelled) return;
            setMcpEnabled(v);
            if (v) {
                api.listMcpServers().then(list => !cancelled && setMcpServers(list)).catch(() => { /* noop */ });
            }
        }).catch(() => { /* noop */ });
        const dispose = rpcClient.onMcpServersChanged((list: McpServerStatusDTO[]) => {
            if (!cancelled) setMcpServers(list);
        });
        return () => { cancelled = true; dispose(); };
    }, [rpcClient, props.mcpToolsEnabled]);

    useEffect(() => {
        let cancelled = false;
        const api = rpcClient.getAiPanelRpcClient();
        api.getSkills()
            .then(resp => { if (!cancelled) setSkills(resp.skills); })
            .catch(() => { /* noop */ });
        api.getAgentsMdFileInfo().then(info => !cancelled && setAgentsMdInfo(info)).catch(() => { /* noop */ });
        const dispose = rpcClient.onAgentsMdFileInfoChanged((info: AgentsMdFileInfoDTO) => {
            if (cancelled) return;
            setAgentsMdInfo(info);
        });
        return () => { cancelled = true; dispose(); };
    }, [rpcClient]);

    const mcpSubtitle = (() => {
        if (!mcpEnabled) return "Off";
        if (mcpServers.length === 0) return "No servers configured";
        const connected = mcpServers.filter(s => s.status === "connected").length;
        const tools = mcpServers.reduce((acc, s) => acc + s.tools.length, 0);
        return `${connected}/${mcpServers.length} connected · ${tools} tool${tools === 1 ? "" : "s"}`;
    })();

    const skillsSubtitle = (() => {
        if (skills.length === 0) return "No skills configured";
        const enabled = skills.filter(s => s.enabled).length;
        return enabled === 0 ? "None enabled" : `${enabled} of ${skills.length} enabled`;
    })();

    const agentsMdSubtitle = (() => {
        if (!agentsMdInfo) return "…";
        if (!agentsMdInfo.hasWorkspace) return "No workspace open";
        if (!agentsMdInfo.fileExists) return "No AGENTS.md";
        if (agentsMdInfo.isEmpty) return "Empty file";
        const n = agentsMdInfo.lineCount ?? 0;
        return `${n} line${n === 1 ? "" : "s"}`;
    })();

    const handleOpenAgentsMd = () => {
        rpcClient.getAiPanelRpcClient().openOrCreateAgentsMd().catch(() => { /* noop */ });
    };


    const customizeEntries: CustomizeEntry[] = [
        {
            id: "mcp",
            icon: <Icon name="bi-mcp" sx={{ fontSize: "18px", display: "flex", alignItems: "center" }} />,
            label: "MCP servers",
            subtitle: mcpSubtitle,
            onOpenPanel: () => props.onNavigate?.("mcp"),
        },
        {
            id: "skills",
            icon: <span className="codicon codicon-lightbulb-sparkle" style={{ fontSize: 16 }} />,
            label: "Skills",
            subtitle: skillsSubtitle,
            onOpenPanel: () => props.onNavigate?.("skills"),
        },
        {
            id: "agents",
            icon: <span className="codicon codicon-file" style={{ fontSize: 16 }} />,
            label: "Agent instructions",
            subtitle: agentsMdSubtitle,
            onEditFile: handleOpenAgentsMd,
            editFileTitle: agentsMdInfo?.fileExists ? "Edit AGENTS.md" : "Create AGENTS.md",
        },
    ];

    const handleCopilotLogout = () => {
        rpcClient.sendAIStateEvent(AIMachineEventType.LOGOUT);
    };

    const handleAuthorizeCopilot = async () => {
        const resp = await rpcClient.getAiPanelRpcClient().promptGithubAuthorize();
        setCopilotAuthorized(!!resp);
    };

    const isCopilotAuthorized = async () => {
        return await rpcClient.getAiPanelRpcClient().isCopilotSignedIn();
    };

    // TODO(auto-memory): memory management temporarily disabled for this release — restore once the memory feature is refined.
    // const handleViewMemories = (scope: 'global' | 'workspace') => {
    //     rpcClient.getAiPanelRpcClient().openMemoryFiles({ scope });
    // };
    //
    // const handleClearConfirm = async (scope: 'workspace' | 'all') => {
    //     setClearError(null);
    //     try {
    //         await rpcClient.getAiPanelRpcClient().clearMemory({ scope });
    //         setClearing(null);  // success — close the confirm UI
    //     } catch (e: unknown) {
    //         const msg = e instanceof Error ? e.message : String(e);
    //         console.error('[SettingsPanel] clearMemory failed:', msg);
    //         // Surface the failure to the user; keep `clearing` set so the confirm row
    //         // and error message stay visible instead of silently disappearing as on success.
    //         setClearError(`Failed to clear ${scope === 'all' ? 'all' : 'workspace'} memories: ${msg}`);
    //     }
    // };

    return (
        <AIChatView>
            <PanelHeader>
                <Button appearance="icon" onClick={() => props.onClose()} tooltip="Back to chat">
                    <Codicon name="arrow-left" />
                </Button>
                <PanelTitle>Settings</PanelTitle>
            </PanelHeader>

            <PanelContent>
                {/* Customize Copilot */}
                <Section>
                    <SectionHeader>Customize Copilot</SectionHeader>
                    <EntryList>
                        {customizeEntries.map(entry => (
                            <CustomizeRow key={entry.id} entry={entry} />
                        ))}
                    </EntryList>
                </Section>

                {/* Integrations */}
                <Section>
                    <SectionHeader>Integrations</SectionHeader>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>GitHub Copilot</SettingLabel>
                            <SettingDescription>Enable inline completions via GitHub Copilot</SettingDescription>
                        </SettingInfo>
                        {copilotAuthorized ? (
                            <SuccessActionButton type="button" disabled>
                                <span className="codicon codicon-check" style={{ fontSize: 12 }} />
                                Authorized
                            </SuccessActionButton>
                        ) : (
                            <PrimaryActionButton type="button" onClick={handleAuthorizeCopilot}>
                                Authorize
                            </PrimaryActionButton>
                        )}
                    </SettingRow>
                </Section>

                {/* TODO(auto-memory): Memory settings section temporarily disabled for this release — restore once the memory feature is refined.
                <Section>
                    <SectionHeader>Memory</SectionHeader>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>Auto Memory</SettingLabel>
                            <SettingDescription>
                                Captures your preferences and integration patterns across sessions.
                                Stored in <code style={{ fontSize: 10 }}>~/.ballerina/copilot/memory/</code>.
                                Toggle via <em>ballerina.ai.autoMemory.enabled</em> in VS Code Settings.
                            </SettingDescription>
                        </SettingInfo>
                    </SettingRow>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>Global memories</SettingLabel>
                            <SettingDescription>Open the global memory index in the editor</SettingDescription>
                        </SettingInfo>
                        <ActionButton onClick={() => handleViewMemories('global')}>
                            <span className="codicon codicon-go-to-file" style={{ fontSize: 12 }} />
                            Open
                        </ActionButton>
                    </SettingRow>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>Workspace memories</SettingLabel>
                            <SettingDescription>Open the workspace memory index in the editor</SettingDescription>
                        </SettingInfo>
                        <ActionButton onClick={() => handleViewMemories('workspace')}>
                            <span className="codicon codicon-go-to-file" style={{ fontSize: 12 }} />
                            Open
                        </ActionButton>
                    </SettingRow>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>Clear workspace memories</SettingLabel>
                            <SettingDescription>Remove all memory files for this project</SettingDescription>
                        </SettingInfo>
                        {clearing === 'workspace' ? (
                            <ConfirmRow>
                                <DestructiveButton onClick={() => handleClearConfirm('workspace')}>Confirm</DestructiveButton>
                                <CancelLink onClick={() => setClearing(null)}>Cancel</CancelLink>
                            </ConfirmRow>
                        ) : (
                            <DestructiveButton onClick={() => setClearing('workspace')}>Clear</DestructiveButton>
                        )}
                    </SettingRow>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>Clear all memories</SettingLabel>
                            <SettingDescription>Remove global and workspace memory files</SettingDescription>
                        </SettingInfo>
                        {clearing === 'all' ? (
                            <ConfirmRow>
                                <DestructiveButton onClick={() => handleClearConfirm('all')}>Confirm</DestructiveButton>
                                <CancelLink onClick={() => setClearing(null)}>Cancel</CancelLink>
                            </ConfirmRow>
                        ) : (
                            <DestructiveButton onClick={() => setClearing('all')}>Clear</DestructiveButton>
                        )}
                    </SettingRow>
                    {clearError && (
                        <SettingRow>
                            <SettingDescription style={{ color: 'var(--vscode-errorForeground)' }}>{clearError}</SettingDescription>
                        </SettingRow>
                    )}
                </Section>
                */}

                {/* Account */}
                <Section>
                    <SectionHeader>Account</SectionHeader>
                    <SettingRow>
                        <SettingInfo>
                            <SettingLabel>Sign out</SettingLabel>
                            <SettingDescription>End your session and disconnect from AI services</SettingDescription>
                        </SettingInfo>
                        <DangerActionButton type="button" onClick={handleCopilotLogout}>
                            <span className="codicon codicon-sign-out" style={{ fontSize: 12 }} />
                            Sign out
                        </DangerActionButton>
                    </SettingRow>
                </Section>
            </PanelContent>

            <PanelFooter>
                <span>Settings persist across sessions</span>
            </PanelFooter>
        </AIChatView>
    );
};
