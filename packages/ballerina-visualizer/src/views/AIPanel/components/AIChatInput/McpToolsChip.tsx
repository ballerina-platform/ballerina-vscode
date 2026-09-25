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

import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { McpLoadErrorsDTO, McpScope, McpServerStatusDTO } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Icon } from "@wso2/ui-toolkit";
import { Loader } from "../Loader";

const TOOLTIP_SHOW_MS = 150;
const TOOLTIP_HIDE_MS = 200;
const POPUP_MAX_HEIGHT = 360;

interface McpToolsChipProps {
    mcpToolsEnabled: boolean;
    onOpenMcpManager: () => void;
}

const ChipWrapper = styled.div`
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-right: 4px;
`;

const Chip = styled.button<{ disabled?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 8px;
    background: var(--vscode-editor-background);
    color: ${(p: { disabled?: boolean }) => (p.disabled ? "var(--vscode-descriptionForeground)" : "var(--vscode-foreground)")};
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 10px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    transition: background-color 0.15s;

    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }

    .codicon, .fw {
        opacity: ${(p: { disabled?: boolean }) => (p.disabled ? 0.6 : 1)};
    }
`;

const StatusDot = styled.span<{ status: McpServerStatusDTO["status"] }>`
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: ${(p: { status: McpServerStatusDTO["status"] }) => {
        switch (p.status) {
            case "connected": return "var(--vscode-charts-green, #388a34)";
            case "connecting": return "var(--vscode-charts-blue, #007acc)";
            case "failed": return "var(--vscode-errorForeground, #f48771)";
            default: return "var(--vscode-descriptionForeground)";
        }
    }};
`;

const Popup = styled.div`
    position: absolute;
    bottom: calc(100% + 8px);
    right: 0;
    z-index: 1000;
    min-width: 280px;
    max-width: 340px;
    background: var(--vscode-editorHoverWidget-background);
    border: 1px solid var(--vscode-editorHoverWidget-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    color: var(--vscode-editorHoverWidget-foreground);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    &::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 0;
        right: 0;
        height: 8px;
    }
`;

const StickyHeader = styled.div`
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    gap: 8px;
`;

const HeaderLeft = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
`;

const HeaderRight = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
`;

const HeaderTitle = styled.span`
    font-weight: 600;
    font-size: 12px;
`;

const ManageButton = styled.button`
    background: transparent;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    color: var(--vscode-foreground);
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--vscode-toolbar-hoverBackground);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const IconAction = styled.button`
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 3px;
    color: var(--vscode-icon-foreground);
    cursor: pointer;

    &:hover:not(:disabled) {
        background: var(--vscode-toolbar-hoverBackground);
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .codicon-modifier-spin {
        animation: codicon-spin 1.2s steps(30) infinite;
    }
    @keyframes codicon-spin {
        100% { transform: rotate(360deg); }
    }
`;

const ScrollBody = styled.div`
    flex: 1;
    overflow-y: auto;
    max-height: ${POPUP_MAX_HEIGHT}px;
    padding: 4px;
`;

const GroupLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--vscode-descriptionForeground);
    padding: 6px 4px 2px;
`;

const WarningBanner = styled.button`
    width: 100%;
    text-align: left;
    background: var(--vscode-inputValidation-warningBackground, rgba(255, 200, 0, 0.1));
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-charts-orange));
    border-radius: 3px;
    padding: 6px 8px;
    margin: 4px 0;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 6px;

    &:hover {
        background: var(--vscode-inputValidation-warningBackground, rgba(255, 200, 0, 0.18));
    }
`;

const EmptyState = styled.div`
    padding: 16px 8px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
`;

const ServerRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    border-radius: 3px;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const ServerMeta = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
`;

const ServerName = styled.div`
    font-size: 12px;
    color: var(--vscode-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const ServerSubline = styled.div`
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const TogglePendingSlot = styled.span`
    width: 30px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const ToggleSwitch = styled.button<{ on: boolean; disabled?: boolean }>`
    width: 26px;
    height: 14px;
    border-radius: 7px;
    cursor: ${(p: { disabled?: boolean }) => (p.disabled ? "default" : "pointer")};
    position: relative;
    flex-shrink: 0;
    opacity: ${(p: { disabled?: boolean }) => (p.disabled ? 0.5 : 1)};
    background: ${(p: { on: boolean }) => (p.on
        ? "var(--vscode-button-background)"
        : "var(--vscode-input-background)")};
    border: 1px solid ${(p: { on: boolean }) => (p.on
        ? "var(--vscode-contrastBorder, var(--vscode-button-background))"
        : "var(--vscode-contrastBorder, var(--vscode-checkbox-border, var(--vscode-descriptionForeground)))")};
    transition: background 0.15s, border-color 0.15s;

    &::after {
        content: "";
        position: absolute;
        box-sizing: border-box;
        top: 1px;
        left: ${(p: { on: boolean }) => (p.on ? "13px" : "1px")};
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${(p: { on: boolean }) => (p.on
            ? "var(--vscode-button-foreground)"
            : "var(--vscode-descriptionForeground)")};
        border: 1px solid var(--vscode-contrastBorder, transparent);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        transition: left 0.15s, background 0.15s;
    }
`;

const OffMessage = styled.div`
    padding: 24px 12px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    line-height: 1.5;
`;

const SCOPE_ORDER: McpScope[] = ["builtin", "workspace", "user"];

function scopeLabel(scope: McpScope): string {
    if (scope === "builtin") { return "Built-in"; }
    return scope === "workspace" ? "Project" : "User";
}

/** Display name for a transport token. */
function transportName(transport: string): string {
    return transport === "http" ? "Streamable HTTP" : "Stdio";
}

function transportLabel(s: McpServerStatusDTO): string {
    const transport = transportName(s.transport);
    if (s.shadowed) {
        return `${transport} · shadowed by project`;
    }
    if (s.status === "failed" && s.error) {
        return `Failed: ${s.error}`;
    }
    if (s.status === "disconnected") {
        return `${transport} · disabled`;
    }
    if (s.status === "connecting") {
        return `${transport} · connecting`;
    }
    const n = s.tools.length;
    return `${transport} · ${n} tool${n === 1 ? "" : "s"}`;
}

export const McpToolsChip: React.FC<McpToolsChipProps> = ({ mcpToolsEnabled, onOpenMcpManager }) => {
    const { rpcClient } = useRpcContext();
    const [servers, setServers] = useState<McpServerStatusDTO[]>([]);
    const [loadErrors, setLoadErrors] = useState<McpLoadErrorsDTO>({});
    const [visible, setVisible] = useState(false);
    const [reloading, setReloading] = useState(false);
    // True while we're waiting for the first server list after MCP is enabled
    // (on mount or after toggle on). Prevents the "No servers" empty-state
    // from flashing while the backend is still spawning MCP clients.
    const [togglePending, setTogglePending] = useState(false);
    const [pendingToggle, setPendingToggle] = useState<Set<string>>(new Set());
    const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (showTimer.current) { clearTimeout(showTimer.current); }
            if (hideTimer.current) { clearTimeout(hideTimer.current); }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!mcpToolsEnabled) {
            // Don't fetch when globally off; clear stale state.
            setServers([]);
            setLoadErrors({});
            setTogglePending(false);
            return;
        }
        setTogglePending(true);
        // Safety net so we never spin forever if a notification is lost.
        const fallback = window.setTimeout(() => {
            if (!cancelled) setTogglePending(false);
        }, 8000);
        const api = rpcClient.getAiPanelRpcClient();
        api.listMcpServers().then((list) => {
            if (cancelled) return;
            setServers(list);
            setTogglePending(false);
        }).catch((err) => console.warn("[mcp] listMcpServers failed:", err));
        api.getMcpLoadErrors().then((errs) => {
            if (!cancelled) setLoadErrors(errs);
        }).catch((err) => console.warn("[mcp] getMcpLoadErrors failed:", err));
        const disposeServers = rpcClient.onMcpServersChanged((list: McpServerStatusDTO[]) => {
            if (cancelled) return;
            setServers(list);
            setTogglePending(false);
            setPendingToggle(new Set());
        });
        const disposeErrors = rpcClient.onMcpLoadErrorsChanged((errs: McpLoadErrorsDTO) => {
            if (!cancelled) setLoadErrors(errs);
        });
        return () => {
            cancelled = true;
            window.clearTimeout(fallback);
            disposeServers();
            disposeErrors();
        };
    }, [rpcClient, mcpToolsEnabled]);

    // Group + sort: scope groups in fixed order (Project → User). Built-in is reserved for future.
    const grouped = useMemo(() => {
        const byScope = new Map<McpScope, McpServerStatusDTO[]>();
        for (const scope of SCOPE_ORDER) byScope.set(scope, []);
        for (const s of servers) {
            byScope.get(s.scope)?.push(s);
        }
        return SCOPE_ORDER
            .map(scope => byScope.get(scope) ?? [])
            .filter(group => group.length > 0);
    }, [servers]);

    const connectedCount = servers.filter((s) => s.status === "connected").length;
    const totalTools = servers.reduce((acc, s) => acc + s.tools.length, 0);
    const headlineStatus: McpServerStatusDTO["status"] = !mcpToolsEnabled
        ? "disconnected"
        : servers.some((s) => s.status === "failed")
            ? "failed"
            : connectedCount > 0
                ? "connected"
                : servers.some((s) => s.status === "connecting")
                    ? "connecting"
                    : "disconnected";

    const scheduleShow = () => {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        showTimer.current = setTimeout(() => setVisible(true), TOOLTIP_SHOW_MS);
    };
    const scheduleHide = () => {
        if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
        hideTimer.current = setTimeout(() => setVisible(false), TOOLTIP_HIDE_MS);
    };
    const toggleVisible = () => setVisible((v) => !v);

    const handleReload = async () => {
        setReloading(true);
        try {
            const api = rpcClient.getAiPanelRpcClient();
            // listMcpServers refreshes first, so read load errors after it to get the fresh set.
            const list = await api.listMcpServers();
            const errs = await api.getMcpLoadErrors();
            setServers(list);
            setLoadErrors(errs);
        } catch (err) {
            console.warn("[mcp] reload failed:", err);
        } finally {
            setReloading(false);
        }
    };

    const handleToggleServer = async (scope: McpScope, name: string, currentEnabled: boolean) => {
        const key = `${scope}:${name}`;
        if (pendingToggle.has(key)) return;
        setPendingToggle(prev => new Set(prev).add(key));
        window.setTimeout(() => setPendingToggle(prev => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
        }), 8000);
        try {
            await rpcClient.getAiPanelRpcClient().setMcpServerEnabled({ scope, name, enabled: !currentEnabled });
        } catch (err) {
            console.warn("[mcp] setMcpServerEnabled failed:", err);
            setPendingToggle(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    const handleToggleGlobal = async () => {
        try {
            await rpcClient.getAiPanelRpcClient().setMcpToolsEnabled({ enabled: !mcpToolsEnabled });
            // State update arrives via config_change('mcpToolsEnabled') flowing through AIChat down via props.
        } catch (err) {
            console.warn("[mcp] setMcpToolsEnabled failed:", err);
        }
    };

    const handleOpenJson = async (scope: "user" | "workspace") => {
        try {
            await rpcClient.getAiPanelRpcClient().openMcpConfig({ scope });
        } catch (err) {
            console.warn("[mcp] openMcpConfig failed:", err);
        }
    };

    const hasErrors = !!loadErrors.user || !!loadErrors.workspace;

    const chipTitle = !mcpToolsEnabled
        ? "MCP is off — click to manage"
        : servers.length === 0
            ? "No MCP servers configured"
            : `${connectedCount}/${servers.length} MCP server${servers.length === 1 ? "" : "s"} connected · ${totalTools} tool${totalTools === 1 ? "" : "s"}`;

    return (
        <ChipWrapper onMouseEnter={scheduleShow} onMouseLeave={scheduleHide}>
            <Chip
                type="button"
                disabled={!mcpToolsEnabled}
                title={chipTitle}
                onClick={toggleVisible}
            >
                <Icon name="bi-mcp" sx={{ fontSize: "12px", display: "flex", alignItems: "center", height: "12px" }} iconSx={{ position: "relative", top: "1px" }} />
                <StatusDot status={headlineStatus} />
            </Chip>

            {visible && (
                <Popup onMouseEnter={scheduleShow} onMouseLeave={scheduleHide}>
                    <StickyHeader>
                        <HeaderLeft>
                            <ToggleSwitch
                                type="button"
                                role="switch"
                                aria-checked={mcpToolsEnabled}
                                on={mcpToolsEnabled}
                                title={mcpToolsEnabled ? "Disable MCP" : "Enable MCP"}
                                onClick={handleToggleGlobal}
                            />
                            <HeaderTitle>MCP</HeaderTitle>
                        </HeaderLeft>
                        <HeaderRight>
                            <IconAction
                                type="button"
                                title="Reload servers"
                                disabled={reloading || !mcpToolsEnabled}
                                onClick={handleReload}
                            >
                                <span
                                    className={`codicon codicon-refresh${reloading ? " codicon-modifier-spin" : ""}`}
                                    style={{ fontSize: 12 }}
                                />
                            </IconAction>
                            <ManageButton
                                type="button"
                                onClick={() => { setVisible(false); onOpenMcpManager(); }}
                            >
                                Manage
                            </ManageButton>
                        </HeaderRight>
                    </StickyHeader>

                    {!mcpToolsEnabled ? (
                        <OffMessage>
                            MCP support is off.
                        </OffMessage>
                    ) : (
                        <ScrollBody>
                            {hasErrors && (
                                <>
                                    {loadErrors.user && (
                                        <WarningBanner type="button" onClick={() => handleOpenJson("user")} title={loadErrors.user}>
                                            <span className="codicon codicon-warning" style={{ fontSize: 12, marginTop: 1 }} />
                                            <span>Couldn't read user mcp.json — click to open in editor.</span>
                                        </WarningBanner>
                                    )}
                                    {loadErrors.workspace && (
                                        <WarningBanner type="button" onClick={() => handleOpenJson("workspace")} title={loadErrors.workspace}>
                                            <span className="codicon codicon-warning" style={{ fontSize: 12, marginTop: 1 }} />
                                            <span>Couldn't read project .mcp.json — click to open in editor.</span>
                                        </WarningBanner>
                                    )}
                                </>
                            )}
                            {togglePending ? (
                                <Loader label="Loading MCP servers…" size="sm" />
                            ) : servers.length === 0 && !hasErrors ? (
                                <EmptyState>
                                    No servers configured. Click <b>Manage</b> to add one.
                                </EmptyState>
                            ) : (
                                grouped.map((group) => (
                                    <React.Fragment key={group[0].scope}>
                                        <GroupLabel>
                                            <span>{scopeLabel(group[0].scope)}</span>
                                        </GroupLabel>
                                        {group.map((s) => {
                                            const rowKey = `${s.scope}:${s.name}`;
                                            const rowPending = pendingToggle.has(rowKey);
                                            return (
                                            <ServerRow key={rowKey}>
                                                <StatusDot status={s.status} />
                                                <ServerMeta>
                                                    <ServerName title={s.name}>{s.name}</ServerName>
                                                    <ServerSubline title={transportLabel(s)}>{transportLabel(s)}</ServerSubline>
                                                </ServerMeta>
                                                {rowPending ? (
                                                    <TogglePendingSlot title={s.enabled ? "Disabling…" : "Enabling…"}>
                                                        <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 12 }} />
                                                    </TogglePendingSlot>
                                                ) : (
                                                <ToggleSwitch
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={s.enabled}
                                                    on={s.enabled}
                                                    disabled={rowPending}
                                                    title={s.enabled ? "Disable this server" : "Enable this server"}
                                                    onClick={() => handleToggleServer(s.scope, s.name, s.enabled)}
                                                />
                                                )}
                                            </ServerRow>
                                            );
                                        })}
                                    </React.Fragment>
                                ))
                            )}
                        </ScrollBody>
                    )}
                </Popup>
            )}
        </ChipWrapper>
    );
};

export default McpToolsChip;
