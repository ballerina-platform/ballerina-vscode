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

import React, { useEffect, useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Button, Codicon } from "@wso2/ui-toolkit";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { McpLoadErrorsDTO, McpMutableScope, McpScope, McpServerConfigDTO, McpServerStatusDTO } from "@wso2/ballerina-core";

import { AIChatView, DangerActionButton, PrimaryActionButton, SecondaryActionButton } from "../styles";
import AddMcpServerModal from "../components/AIChatInput/AddMcpServerModal";
import { ExperimentalTag } from "../components/ExperimentalTag";
import { Loader } from "../components/Loader";

interface Props {
    onClose: () => void;
    backTooltip?: string;
}

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

const TitleGroup = styled.div`
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
`;

const HeaderActions = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
`;

const HeaderDivider = styled.div`
    width: 1px;
    height: 14px;
    background: var(--vscode-widget-border, var(--vscode-panel-border));
    opacity: 0.6;
    flex-shrink: 0;
`;

const HeaderInlineToggle = styled.button<{ $on: boolean }>`
    width: 30px;
    height: 16px;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    background: ${(p: { $on: boolean }) => (p.$on
        ? "var(--vscode-button-background)"
        : "var(--vscode-input-background)")};
    border: 1px solid ${(p: { $on: boolean }) => (p.$on
        ? "var(--vscode-contrastBorder, var(--vscode-button-background))"
        : "var(--vscode-contrastBorder, var(--vscode-checkbox-border, var(--vscode-descriptionForeground)))")};
    transition: background 0.15s, border-color 0.15s;

    &::after {
        content: "";
        position: absolute;
        box-sizing: border-box;
        top: 1px;
        left: ${(p: { $on: boolean }) => (p.$on ? "15px" : "1px")};
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${(p: { $on: boolean }) => (p.$on
            ? "var(--vscode-button-foreground)"
            : "var(--vscode-descriptionForeground)")};
        border: 1px solid var(--vscode-contrastBorder, transparent);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        transition: left 0.15s, background 0.15s;
    }
`;

const PanelContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: var(--vscode-font-family);
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
`;

const SectionTitleButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    padding: 2px 0;
    margin: 0;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--vscode-font-family);

    &:hover { color: var(--vscode-foreground); }

    .codicon { font-size: 12px; }
`;

const SectionDivider = styled.div`
    flex: 1;
    height: 1px;
    background: var(--vscode-widget-border, var(--vscode-panel-border));
    opacity: 0.5;
    align-self: center;
`;

const EmptyHint = styled.div`
    padding: 16px;
    border: 1px dashed var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 6px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    text-align: center;
`;

const WarningBanner = styled.button`
    width: 100%;
    text-align: left;
    background: var(--vscode-inputValidation-warningBackground, rgba(255, 200, 0, 0.1));
    color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-charts-orange));
    border-radius: 4px;
    padding: 8px 12px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    display: flex;
    align-items: flex-start;
    gap: 8px;

    &:hover {
        background: var(--vscode-inputValidation-warningBackground, rgba(255, 200, 0, 0.18));
    }
`;

const CenteredEmpty = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 48px 24px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
`;

const CenteredEmptyTitle = styled.div`
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const CenteredEmptyBody = styled.div`
    font-size: 12px;
    line-height: 1.5;
    max-width: 360px;
`;

const SectionHelper = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin: -2px 0 4px 16px;
`;

const RowsContainer = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
    border-radius: 6px;
    overflow: hidden;
    background: var(--vscode-editor-background);
`;

/* One server. The first row is always the compact header (name + meta +
   toggle). Edit/Delete reveal on hover or keyboard focus inside the row. */
const ServerRow = styled.div`
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--vscode-panel-border);

    &:last-child { border-bottom: none; }
`;

const RowHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    transition: background 0.12s ease;

    &:hover { background: var(--vscode-list-hoverBackground); }

    /* Reveal row actions on hover or any focus within the row. */
    &:hover .mcp-row-actions,
    &:focus-within .mcp-row-actions {
        visibility: visible;
    }
`;

const RowNameButton = styled.button<{ $clickable: boolean }>`
    flex: 1;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    text-align: left;
    cursor: ${(p: { $clickable: boolean }) => (p.$clickable ? "pointer" : "default")};
`;

const RowName = styled.span<{ $dim?: boolean }>`
    font-size: 13px;
    font-weight: 500;
    color: ${(p: { $dim?: boolean }) => (p.$dim
        ? "var(--vscode-descriptionForeground)"
        : "var(--vscode-foreground)")};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
`;

const RowMeta = styled.span<{ $failed?: boolean }>`
    flex-shrink: 0;
    font-size: 11.5px;
    color: ${(p: { $failed?: boolean }) => (p.$failed
        ? "var(--vscode-errorForeground)"
        : "var(--vscode-descriptionForeground)")};
    white-space: nowrap;
`;

const RowExpandChevron = styled.span`
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    display: inline-flex;
    align-items: center;
`;

const RowActions = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    /* Hidden by default; RowHeader hover/focus-within reveals via the
       .mcp-row-actions class hook. */
    visibility: hidden;
`;

const RowIconButton = styled.button<{ $danger?: boolean }>`
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-font-family);

    &:hover {
        background: ${(p: { $danger?: boolean }) => (p.$danger
            ? "var(--vscode-inputValidation-errorBackground, var(--vscode-toolbar-hoverBackground))"
            : "var(--vscode-toolbar-hoverBackground)")};
        color: ${(p: { $danger?: boolean }) => (p.$danger
            ? "var(--vscode-errorForeground)"
            : "var(--vscode-foreground)")};
    }

    .codicon { font-size: 14px; }
`;

const StatusDot = styled.span<{ $status: McpServerStatusDTO["status"] }>`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    background: ${(p: { $status: McpServerStatusDTO["status"] }) => {
        switch (p.$status) {
            case "connected": return "var(--vscode-charts-green, #388a34)";
            case "connecting": return "var(--vscode-charts-blue, #007acc)";
            case "failed": return "var(--vscode-errorForeground, #f48771)";
            default: return "var(--vscode-descriptionForeground)";
        }
    }};
`;

const RowError = styled.div`
    padding: 0 12px 8px 28px;
    font-size: 11px;
    color: var(--vscode-errorForeground);
    word-break: break-word;
`;

const ExpandedToolsArea = styled.div`
    padding: 0 12px 10px 28px;
`;

const ToolsList = styled.div`
    display: flex;
    flex-direction: column;
    margin-top: 4px;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--vscode-editor-background);
`;

const ToolRow = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    transition: background 0.12s ease;

    &:last-child { border-bottom: none; }
    &:hover { background: var(--vscode-list-hoverBackground); }
    &:hover .tool-desc {
        -webkit-line-clamp: unset;
        overflow: visible;
    }
`;

const ToolIcon = styled.span`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 16px;
    color: var(--vscode-symbolIcon-methodForeground, var(--vscode-descriptionForeground));
    opacity: 0.85;
`;

const ToolBody = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
`;

const ToolName = styled.span`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
    line-height: 16px;
    word-break: break-all;
`;

const ToolDesc = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
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

const ToggleSwitch = styled.button<{ $on: boolean }>`
    width: 30px;
    height: 16px;
    border-radius: 8px;
    cursor: pointer;
    position: relative;
    flex-shrink: 0;
    background: ${(p: { $on: boolean }) => (p.$on
        ? "var(--vscode-button-background)"
        : "var(--vscode-input-background)")};
    border: 1px solid ${(p: { $on: boolean }) => (p.$on
        ? "var(--vscode-contrastBorder, var(--vscode-button-background))"
        : "var(--vscode-contrastBorder, var(--vscode-checkbox-border, var(--vscode-descriptionForeground)))")};
    transition: background 0.15s, border-color 0.15s;

    &::after {
        content: "";
        position: absolute;
        box-sizing: border-box;
        top: 1px;
        left: ${(p: { $on: boolean }) => (p.$on ? "15px" : "1px")};
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${(p: { $on: boolean }) => (p.$on
            ? "var(--vscode-button-foreground)"
            : "var(--vscode-descriptionForeground)")};
        border: 1px solid var(--vscode-contrastBorder, transparent);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        transition: left 0.15s, background 0.15s;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
`;

const ActionButton = SecondaryActionButton;
const DeleteButton = DangerActionButton;

const ConfirmRow = styled.div`
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
`;

const ConfirmText = styled.span`
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    strong {
        font-weight: 600;
    }
`;

const Spacer = styled.div`
    flex: 1;
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface EditTarget {
    name: string;
    scope: McpMutableScope;
    config: McpServerConfigDTO;
}

const SCOPE_ORDER: McpScope[] = ["builtin", "workspace", "user"];

/** Display name for a transport token. */
function transportName(transport: string): string {
    return transport === "http" ? "Streamable HTTP" : "Stdio";
}

function scopeHeading(scope: McpScope): string {
    if (scope === "builtin") { return "Built-in"; }
    return scope === "workspace" ? "Project" : "User";
}

function scopeHelperText(scope: McpScope): string {
    if (scope === "builtin") { return "Curated by WSO2"; }
    if (scope === "workspace") { return "Available only within this project"; }
    return "Available across all your projects";
}

export const McpManagerPanel: React.FC<Props> = ({ onClose, backTooltip }) => {
    const { rpcClient } = useRpcContext();
    const [servers, setServers] = useState<McpServerStatusDTO[]>([]);
    const [loadErrors, setLoadErrors] = useState<McpLoadErrorsDTO>({});
    const [mcpToolsEnabled, setMcpToolsEnabled] = useState(false);
    const [hasWorkspace, setHasWorkspace] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [collapsedSections, setCollapsedSections] = useState<Set<McpScope>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [pendingToggle, setPendingToggle] = useState<Set<string>>(new Set());
    const [showAddModal, setShowAddModal] = useState(false);
    const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
    // True while we're waiting for the first server list after toggling MCP
    // on/off (or on initial mount). Prevents the "No servers" empty-state from
    // flashing during boot/teardown.
    const [togglePending, setTogglePending] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const api = rpcClient.getAiPanelRpcClient();
        api.getMcpToolsEnabled().then(v => !cancelled && setMcpToolsEnabled(v)).catch(() => { /* noop */ });
        api.getMcpWorkspaceContext().then(ctx => !cancelled && setHasWorkspace(ctx.hasWorkspace)).catch(() => { /* noop */ });
        api.listMcpServers()
            .then(list => { if (!cancelled) { setServers(list); setTogglePending(false); } })
            .catch(() => { if (!cancelled) setTogglePending(false); });
        api.getMcpLoadErrors().then(errs => !cancelled && setLoadErrors(errs)).catch(() => { /* noop */ });
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
            disposeServers();
            disposeErrors();
        };
    }, [rpcClient]);

    const grouped = useMemo(() => {
        const byScope = new Map<McpScope, McpServerStatusDTO[]>();
        for (const scope of SCOPE_ORDER) byScope.set(scope, []);
        for (const s of servers) byScope.get(s.scope)?.push(s);
        return byScope;
    }, [servers]);

    const handleToggleGlobal = async () => {
        if (togglePending) return;
        const next = !mcpToolsEnabled;
        // Optimistic UI; the config_change notification handled by AIChat keeps state in sync.
        setMcpToolsEnabled(next);
        // Backend will tear down or spawn MCP clients asynchronously after the
        // setting update. Show the loader until onMcpServersChanged fires.
        // The 8s safety net guards against a missed notification.
        setTogglePending(true);
        window.setTimeout(() => setTogglePending(false), 8000);
        try {
            await rpcClient.getAiPanelRpcClient().setMcpToolsEnabled({ enabled: next });
        } catch (err) {
            console.warn("[mcp] setMcpToolsEnabled failed:", err);
            setMcpToolsEnabled(prev => !prev);
            setTogglePending(false);
        }
    };

    const [reloading, setReloading] = useState(false);
    const handleReload = async () => {
        setReloading(true);
        try {
            const api = rpcClient.getAiPanelRpcClient();
            const [list, errs] = await Promise.all([
                api.listMcpServers(),
                api.getMcpLoadErrors(),
            ]);
            setServers(list);
            setLoadErrors(errs);
        } catch (err) {
            console.warn("[mcp] reload failed:", err);
        } finally {
            // Brief spin so the user sees the action happened even on fast networks.
            setTimeout(() => setReloading(false), 300);
        }
    };

    const handleToggleServer = async (s: McpServerStatusDTO) => {
        const key = `${s.scope}:${s.name}`;
        if (pendingToggle.has(key)) return;
        setPendingToggle(prev => new Set(prev).add(key));
        window.setTimeout(() => setPendingToggle(prev => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
        }), 8000);
        try {
            await rpcClient.getAiPanelRpcClient().setMcpServerEnabled({ scope: s.scope, name: s.name, enabled: !s.enabled });
        } catch (err) {
            console.warn("[mcp] setMcpServerEnabled failed:", err);
            setPendingToggle(prev => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    const handleOpenJsonUser = () => rpcClient.getAiPanelRpcClient().openMcpConfig({ scope: "user" });
    const handleOpenJsonProject = () => rpcClient.getAiPanelRpcClient().openMcpConfig({ scope: "workspace" });

    const hasErrors = !!loadErrors.user || !!loadErrors.workspace;

    // Edit/Delete are only rendered for user/workspace rows, never built-ins.
    const handleEdit = (s: McpServerStatusDTO) => {
        setEditTarget({ name: s.name, scope: s.scope as McpMutableScope, config: s.config });
    };

    const handleDelete = async (s: McpServerStatusDTO) => {
        try {
            const res = await rpcClient.getAiPanelRpcClient().deleteMcpServer({ name: s.name, scope: s.scope as McpMutableScope });
            if (!res.success && res.error) {
                console.warn("[mcp] delete failed:", res.error);
            }
        } catch (err) {
            console.warn("[mcp] delete request failed:", err);
        } finally {
            setConfirmDelete(null);
        }
    };

    const toggleExpanded = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const renderCard = (s: McpServerStatusDTO) => {
        const key = `${s.scope}:${s.name}`;
        const isExpanded = expanded.has(key);
        const isConfirming = confirmDelete === key;
        const isTogglePending = pendingToggle.has(key);
        const toolCount = s.tools.length;
        const hasTools = toolCount > 0;
        const dim = !s.enabled;
        const statusText = s.status === "connected"
            ? `${toolCount} tool${toolCount === 1 ? "" : "s"}`
            : s.status === "connecting"
                ? "connecting…"
                : s.status === "failed"
                    ? "failed"
                    : "disabled";
        const meta = `${transportName(s.transport)} · ${statusText}${s.shadowed ? " · shadowed by project" : ""}`;
        const isBuiltIn = s.scope === "builtin";

        return (
            <ServerRow key={key}>
                <RowHeader>
                    {isConfirming ? (
                        <ConfirmRow>
                            <ConfirmText>Delete <strong>{s.name}</strong>?</ConfirmText>
                            <Spacer />
                            <DeleteButton type="button" onClick={() => handleDelete(s)}>Yes, delete</DeleteButton>
                            <ActionButton type="button" onClick={() => setConfirmDelete(null)}>Cancel</ActionButton>
                        </ConfirmRow>
                    ) : (
                        <>
                            <StatusDot $status={s.status} />
                            <RowNameButton
                                type="button"
                                $clickable={hasTools}
                                onClick={() => hasTools && toggleExpanded(key)}
                                title={hasTools ? (isExpanded ? "Hide tools" : "Show tools") : s.name}
                            >
                                <RowName $dim={dim} title={s.name}>{s.name}</RowName>
                                <RowMeta $failed={s.status === "failed"}>{meta}</RowMeta>
                                {hasTools && (
                                    <RowExpandChevron>
                                        <span className={`codicon codicon-${isExpanded ? "chevron-down" : "chevron-right"}`} style={{ fontSize: 11 }} />
                                    </RowExpandChevron>
                                )}
                            </RowNameButton>
                            {!isBuiltIn && (
                                <RowActions className="mcp-row-actions">
                                    <RowIconButton
                                        type="button"
                                        title="Edit server"
                                        aria-label="Edit server"
                                        onClick={() => handleEdit(s)}
                                    >
                                        <span className="codicon codicon-edit" />
                                    </RowIconButton>
                                    <RowIconButton
                                        type="button"
                                        $danger
                                        title="Delete server"
                                        aria-label="Delete server"
                                        onClick={() => setConfirmDelete(key)}
                                    >
                                        <span className="codicon codicon-trash" />
                                    </RowIconButton>
                                </RowActions>
                            )}
                            {isTogglePending ? (
                                <TogglePendingSlot title={s.enabled ? "Disabling…" : "Enabling…"}>
                                    <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 12 }} />
                                </TogglePendingSlot>
                            ) : (
                                <ToggleSwitch
                                    type="button"
                                    role="switch"
                                    aria-checked={s.enabled}
                                    $on={s.enabled}
                                    disabled={isTogglePending}
                                    title={s.enabled ? "Disable this server" : "Enable this server"}
                                    onClick={() => handleToggleServer(s)}
                                />
                            )}
                        </>
                    )}
                </RowHeader>

                {s.status === "failed" && s.error && <RowError>{s.error}</RowError>}

                {hasTools && isExpanded && (
                    <ExpandedToolsArea>
                        <ToolsList>
                            {s.tools.map(t => (
                                <ToolRow key={t.name}>
                                    <ToolIcon>
                                        <span className="codicon codicon-symbol-method" style={{ fontSize: 12 }} />
                                    </ToolIcon>
                                    <ToolBody>
                                        <ToolName title={t.name}>{t.name}</ToolName>
                                        {t.description && (
                                            <ToolDesc className="tool-desc" title={t.description}>{t.description}</ToolDesc>
                                        )}
                                    </ToolBody>
                                </ToolRow>
                            ))}
                        </ToolsList>
                    </ExpandedToolsArea>
                )}
            </ServerRow>
        );
    };

    const toggleSectionCollapsed = (scope: McpScope) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(scope)) next.delete(scope); else next.add(scope);
            return next;
        });
    };

    /** Render a section only when it has servers. Empty sections collapse to nothing. */
    const renderSection = (scope: McpScope) => {
        const items = grouped.get(scope) ?? [];
        if (items.length === 0) {
            return null;
        }
        const jsonDisabled = scope === "workspace" && !hasWorkspace;
        const isCollapsed = collapsedSections.has(scope);
        const isBuiltInSection = scope === "builtin";
        return (
            <Section key={scope}>
                <SectionHeader>
                    <SectionTitleButton
                        type="button"
                        onClick={() => toggleSectionCollapsed(scope)}
                        title={isCollapsed ? "Expand section" : "Collapse section"}
                    >
                        <span className={`codicon codicon-${isCollapsed ? "chevron-right" : "chevron-down"}`} />
                        {scopeHeading(scope)} ({items.length})
                    </SectionTitleButton>
                    <SectionDivider />
                    {!isBuiltInSection && (
                        <Button
                            appearance="icon"
                            tooltip={jsonDisabled ? "No trusted project is open" : "Edit raw JSON"}
                            disabled={jsonDisabled}
                            onClick={scope === "user" ? handleOpenJsonUser : handleOpenJsonProject}
                        >
                            <Codicon name="go-to-file" />
                        </Button>
                    )}
                </SectionHeader>
                {!isCollapsed && (
                    <>
                        <SectionHelper>{scopeHelperText(scope)}</SectionHelper>
                        <RowsContainer>{items.map(renderCard)}</RowsContainer>
                    </>
                )}
            </Section>
        );
    };

    const hasAnyServers = servers.length > 0;

    return (
        <AIChatView>
            <PanelHeader>
                <Button appearance="icon" onClick={onClose} tooltip={backTooltip ?? "Back"}>
                    <Codicon name="arrow-left" />
                </Button>
                <TitleGroup>
                    <PanelTitle>MCP Servers</PanelTitle>
                    <ExperimentalTag size="sm" label="Preview" tooltip="MCP tool support is in preview and may change." />
                    <HeaderInlineToggle
                        type="button"
                        role="switch"
                        aria-checked={mcpToolsEnabled}
                        $on={mcpToolsEnabled}
                        title={mcpToolsEnabled ? "Disable MCP" : "Enable MCP"}
                        onClick={handleToggleGlobal}
                    />
                </TitleGroup>
                <HeaderDivider />
                <HeaderActions>
                    <Button
                        appearance="icon"
                        tooltip="Reload servers"
                        disabled={!mcpToolsEnabled || reloading}
                        onClick={handleReload}
                    >
                        <span className={`codicon codicon-refresh${reloading ? " codicon-modifier-spin" : ""}`} />
                    </Button>
                    <PrimaryActionButton
                        type="button"
                        disabled={!mcpToolsEnabled}
                        onClick={() => setShowAddModal(true)}
                        title="Add a new MCP server"
                    >
                        <span className="codicon codicon-add" style={{ fontSize: 12 }} />
                        Add server
                    </PrimaryActionButton>
                </HeaderActions>
            </PanelHeader>

            <PanelContent>
                {hasErrors && mcpToolsEnabled && (
                    <>
                        {loadErrors.user && (
                            <WarningBanner type="button" onClick={handleOpenJsonUser} title={loadErrors.user}>
                                <span className="codicon codicon-warning" style={{ fontSize: 14, marginTop: 1 }} />
                                <span>Couldn't read user mcp.json — click to open in editor.</span>
                            </WarningBanner>
                        )}
                        {loadErrors.workspace && (
                            <WarningBanner type="button" onClick={handleOpenJsonProject} title={loadErrors.workspace}>
                                <span className="codicon codicon-warning" style={{ fontSize: 14, marginTop: 1 }} />
                                <span>Couldn't read project .mcp.json — click to open in editor.</span>
                            </WarningBanner>
                        )}
                    </>
                )}
                {!mcpToolsEnabled ? (
                    <EmptyHint>
                        MCP support is off.
                    </EmptyHint>
                ) : togglePending ? (
                    <Loader label="Loading MCP servers…" />
                ) : !hasAnyServers ? (
                    <CenteredEmpty>
                        <CenteredEmptyTitle>No MCP servers yet</CenteredEmptyTitle>
                        <CenteredEmptyBody>
                            Click <b>+ Add server</b> at the top right to set up your first one.
                            {!hasWorkspace && (
                                <><br />Open and trust a project to add project-scope servers.</>
                            )}
                        </CenteredEmptyBody>
                    </CenteredEmpty>
                ) : (
                    <>{SCOPE_ORDER.map(renderSection)}</>
                )}
            </PanelContent>

            <AddMcpServerModal
                isOpen={showAddModal || !!editTarget}
                servers={servers}
                hasWorkspace={hasWorkspace}
                editTarget={editTarget ?? undefined}
                onClose={() => { setShowAddModal(false); setEditTarget(null); }}
                onAdded={() => { /* mcpServersChanged refreshes the list */ }}
            />
        </AIChatView>
    );
};

export default McpManagerPanel;
