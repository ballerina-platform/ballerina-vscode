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
import { McpMutableScope, McpServerConfigDTO, McpServerStatusDTO } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

const NAME_REGEX = /^[a-zA-Z0-9_.-]{1,64}$/;

type Transport = "stdio" | "http";

export interface EditTarget {
    name: string;
    scope: McpMutableScope;
    config: McpServerConfigDTO;
}

interface Props {
    isOpen: boolean;
    servers: McpServerStatusDTO[];
    hasWorkspace: boolean;
    editTarget?: EditTarget;
    onClose: () => void;
    onAdded: () => void;
}

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1999;
    display: flex;
    align-items: center;
    justify-content: center;
`;

const Dialog = styled.div`
    z-index: 2000;
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    font-family: var(--vscode-font-family);
    font-size: 13px;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
`;

const Title = styled.h2`
    margin: 0;
    font-size: 14px;
    font-weight: 600;
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    width: 22px;
    height: 22px;
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

const Body = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
`;

const TabRow = styled.div`
    display: flex;
    border-bottom: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
`;

const Tab = styled.button<{ active: boolean }>`
    background: transparent;
    border: none;
    color: ${(p: { active: boolean }) => p.active ? "var(--vscode-foreground)" : "var(--vscode-descriptionForeground)"};
    font-weight: ${(p: { active: boolean }) => p.active ? 600 : 400};
    font-size: 12px;
    font-family: var(--vscode-font-family);
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 2px solid ${(p: { active: boolean }) => p.active ? "var(--vscode-focusBorder, var(--vscode-button-background))" : "transparent"};
    margin-bottom: -1px;

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const FieldGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Label = styled.label`
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-foreground);
`;

const Input = styled.input<{ hasError?: boolean }>`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid ${(p: { hasError?: boolean }) => p.hasError ? "var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground))" : "var(--vscode-input-border, var(--vscode-widget-border, var(--vscode-panel-border)))"};
    border-radius: 3px;
    padding: 6px 8px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    width: 100%;
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder, var(--vscode-button-background));
    }

    &::placeholder {
        color: var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));
    }
`;

const KvTable = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const KvRowEl = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 24px;
    gap: 6px;
    align-items: center;
`;

const ArgRowEl = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24px;
    gap: 6px;
    align-items: center;
`;

const KvRemove = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    border-radius: 3px;
    height: 24px;
    width: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-errorForeground); }
`;

const KvAdd = styled.button`
    align-self: flex-start;
    background: transparent;
    border: 1px dashed var(--vscode-widget-border, var(--vscode-panel-border));
    color: var(--vscode-descriptionForeground);
    border-radius: 3px;
    padding: 4px 10px;
    font-size: 11px;
    font-family: var(--vscode-font-family);
    cursor: pointer;

    &:hover {
        color: var(--vscode-foreground);
        border-color: var(--vscode-focusBorder, var(--vscode-button-background));
    }
`;

const Hint = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
`;

const FieldError = styled.div`
    font-size: 11px;
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground));
`;

const Banner = styled.div`
    background: var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1));
    color: var(--vscode-errorForeground);
    border: 1px solid var(--vscode-inputValidation-errorBorder, var(--vscode-errorForeground));
    border-radius: 3px;
    padding: 6px 8px;
    font-size: 11px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
`;

const BaseButton = styled.button`
    border-radius: 3px;
    padding: 4px 12px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
    cursor: pointer;
    min-width: 64px;

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

const PrimaryButton = styled(BaseButton)`
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: 1px solid var(--vscode-button-background);

    &:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
    }
`;

const SecondaryButton = styled(BaseButton)`
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, var(--vscode-panel-border)));

    &:hover:not(:disabled) {
        background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground));
    }
`;

interface ArgsEditorProps {
    rows: string[];
    onChange: (rows: string[]) => void;
}

const ArgsEditor: React.FC<ArgsEditorProps> = ({ rows, onChange }) => {
    const updateRow = (idx: number, value: string) => {
        const next = rows.slice();
        next[idx] = value;
        onChange(next);
    };
    const removeRow = (idx: number) => {
        const next = rows.slice();
        next.splice(idx, 1);
        onChange(next);
    };
    return (
        <KvTable>
            {rows.map((row, idx) => (
                <ArgRowEl key={idx}>
                    <Input
                        type="text"
                        value={row}
                        placeholder="argument"
                        onChange={(e) => updateRow(idx, e.target.value)}
                    />
                    <KvRemove type="button" title="Remove" onClick={() => removeRow(idx)}>
                        <span className="codicon codicon-trash" style={{ fontSize: 12 }} />
                    </KvRemove>
                </ArgRowEl>
            ))}
            <KvAdd type="button" onClick={() => onChange([...rows, ""])}>+ Add argument</KvAdd>
        </KvTable>
    );
};

type KvRow = { key: string; value: string };

function recordToRows(record?: Record<string, string>): KvRow[] {
    if (!record) return [];
    return Object.entries(record)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => ({ key, value }));
}

function rowsToRecord(rows: KvRow[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows) {
        const k = row.key.trim();
        if (!k) continue;
        out[k] = row.value;
    }
    return out;
}

/** Like rowsToRecord but trims values too — for env-var references that are looked up verbatim at runtime. */
function rowsToEnvRefRecord(rows: KvRow[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows) {
        const k = row.key.trim();
        const v = row.value.trim();
        if (!k || !v) continue;
        out[k] = v;
    }
    return out;
}

interface KvEditorProps {
    rows: KvRow[];
    onChange: (rows: KvRow[]) => void;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}

const KvEditor: React.FC<KvEditorProps> = ({ rows, onChange, keyPlaceholder, valuePlaceholder }) => {
    const updateRow = (idx: number, patch: Partial<KvRow>) => {
        const next = rows.slice();
        next[idx] = { ...next[idx], ...patch };
        onChange(next);
    };
    const removeRow = (idx: number) => {
        const next = rows.slice();
        next.splice(idx, 1);
        onChange(next);
    };
    const addRow = () => onChange([...rows, { key: "", value: "" }]);

    return (
        <KvTable>
            {rows.map((row, idx) => (
                <KvRowEl key={idx}>
                    <Input
                        type="text"
                        value={row.key}
                        placeholder={keyPlaceholder ?? "Key"}
                        onChange={(e) => updateRow(idx, { key: e.target.value })}
                    />
                    <Input
                        type="text"
                        value={row.value}
                        placeholder={valuePlaceholder ?? "Value"}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                    />
                    <KvRemove type="button" title="Remove" onClick={() => removeRow(idx)}>
                        <span className="codicon codicon-trash" style={{ fontSize: 12 }} />
                    </KvRemove>
                </KvRowEl>
            ))}
            <KvAdd type="button" onClick={addRow}>+ Add</KvAdd>
        </KvTable>
    );
};

export const AddMcpServerModal: React.FC<Props> = ({ isOpen, servers, hasWorkspace, editTarget, onClose, onAdded }) => {
    const { rpcClient } = useRpcContext();
    const isEdit = !!editTarget;
    const [scope, setScope] = useState<McpMutableScope>("user");
    const [transport, setTransport] = useState<Transport>("stdio");
    const [name, setName] = useState("");
    const [command, setCommand] = useState("");
    const [argsRows, setArgsRows] = useState<string[]>([]);
    const [envRows, setEnvRows] = useState<KvRow[]>([]);
    const [url, setUrl] = useState("");
    const [headerRows, setHeaderRows] = useState<KvRow[]>([]);
    const [envHeaderRows, setEnvHeaderRows] = useState<KvRow[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);

    // Uniqueness is scoped — `user:foo` and `workspace:foo` can coexist.
    // In edit mode, the existing entry doesn't count as a duplicate.
    const namesInScope = useMemo(
        () => new Set(
            servers
                .filter(s => s.scope === scope)
                .filter(s => !(isEdit && editTarget && s.scope === editTarget.scope && s.name === editTarget.name))
                .map(s => s.name),
        ),
        [servers, scope, isEdit, editTarget],
    );

    useEffect(() => {
        if (!isOpen) {
            // Reset on close so reopening shows a fresh form.
            setScope(hasWorkspace ? "workspace" : "user");
            setTransport("stdio");
            setName("");
            setCommand("");
            setArgsRows([]);
            setEnvRows([]);
            setUrl("");
            setHeaderRows([]);
            setEnvHeaderRows([]);
            setSubmitting(false);
            setServerError(null);
            return;
        }
        if (editTarget) {
            // Pre-populate fields for edit mode. Name and scope are locked.
            setScope(editTarget.scope);
            setTransport(editTarget.config.type);
            setName(editTarget.name);
            if (editTarget.config.type === "stdio") {
                setCommand(editTarget.config.command);
                setArgsRows(editTarget.config.args ?? []);
                setEnvRows(recordToRows(editTarget.config.env));
                setUrl("");
                setHeaderRows([]);
                setEnvHeaderRows([]);
            } else {
                setUrl(editTarget.config.url);
                setHeaderRows(recordToRows(editTarget.config.headers));
                setEnvHeaderRows(recordToRows(editTarget.config.headersFromEnv));
                setCommand("");
                setArgsRows([]);
                setEnvRows([]);
            }
            setServerError(null);
            return;
        }
        // Smart default on open (Add mode): prefer workspace when available.
        setScope(prev => (hasWorkspace && prev === "user" && !name && !command && !url ? "workspace" : prev));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, hasWorkspace, editTarget]);

    if (!isOpen) return null;

    const trimmedName = name.trim();
    const nameError = (() => {
        if (!trimmedName) return null; // empty: don't show error yet, but disable submit
        if (!NAME_REGEX.test(trimmedName)) return "Use letters, digits, _, ., or - only (max 64 chars).";
        if (namesInScope.has(trimmedName)) {
            const label = scope === "workspace" ? "project" : "user";
            return `A ${label}-scope server with this name already exists.`;
        }
        return null;
    })();

    const urlError = (() => {
        if (transport !== "http") return null;
        if (!url.trim()) return null;
        try { new URL(url.trim()); return null; }
        catch { return "Enter a valid URL (https://...)."; }
    })();

    const canSubmit = !submitting
        && !!trimmedName
        && !nameError
        && (transport === "stdio"
            ? !!command.trim()
            : !!url.trim() && !urlError);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setServerError(null);
        let config: McpServerConfigDTO;
        if (transport === "stdio") {
            const args = argsRows.map(a => a.trim()).filter(Boolean);
            const env = rowsToRecord(envRows);
            config = {
                type: "stdio",
                command: command.trim(),
                ...(args.length > 0 ? { args } : {}),
                ...(Object.keys(env).length > 0 ? { env } : {}),
            };
        } else {
            const headers = rowsToRecord(headerRows);
            const headersFromEnv = rowsToEnvRefRecord(envHeaderRows);
            config = {
                type: "http",
                url: url.trim(),
                ...(Object.keys(headers).length > 0 ? { headers } : {}),
                ...(Object.keys(headersFromEnv).length > 0 ? { headersFromEnv } : {}),
                // The dialog has no OAuth fields, so an edit keeps the sign-in settings it was added with.
                ...(editTarget?.config.type === "http" && editTarget.config.oauth ? { oauth: editTarget.config.oauth } : {}),
            };
        }
        try {
            const api = rpcClient.getAiPanelRpcClient();
            const res = isEdit
                ? await api.updateMcpServer({ name: trimmedName, scope, config })
                : await api.addMcpServer({ name: trimmedName, scope, config });
            if (!res.success) {
                setServerError(res.error ?? "Failed to add server.");
                setSubmitting(false);
                return;
            }
            onAdded();
            onClose();
        } catch (err: any) {
            setServerError(err?.message ?? String(err));
            setSubmitting(false);
        }
    };

    const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <Overlay onClick={onClose}>
            <Dialog role="dialog" aria-modal="true" onClick={stopPropagation}>
                <Header>
                    <Title>{isEdit ? "Edit MCP server" : "Add MCP server"}</Title>
                    <CloseButton type="button" aria-label="Close" onClick={onClose}>
                        <span className="codicon codicon-close" style={{ fontSize: 14 }} />
                    </CloseButton>
                </Header>
                <Body>
                    {serverError && <Banner>{serverError}</Banner>}

                    <FieldGroup>
                        <Label>Scope</Label>
                        <TabRow>
                            <Tab
                                active={scope === "workspace"}
                                disabled={isEdit || !hasWorkspace}
                                onClick={() => !isEdit && hasWorkspace && setScope("workspace")}
                            >
                                Project
                            </Tab>
                            <Tab
                                active={scope === "user"}
                                disabled={isEdit}
                                onClick={() => !isEdit && setScope("user")}
                            >
                                User
                            </Tab>
                        </TabRow>
                        {isEdit ? (
                            <Hint>Scope cannot be changed when editing. Delete and re-add to move scopes.</Hint>
                        ) : !hasWorkspace && (
                            <Hint>No trusted project is open — only user scope is available.</Hint>
                        )}
                    </FieldGroup>

                    <FieldGroup>
                        <Label htmlFor="mcp-name">Name</Label>
                        <Input
                            id="mcp-name"
                            type="text"
                            value={name}
                            onChange={(e) => !isEdit && setName(e.target.value)}
                            placeholder="my-server"
                            hasError={!!nameError}
                            readOnly={isEdit}
                            autoFocus={!isEdit}
                        />
                        {nameError && <FieldError>{nameError}</FieldError>}
                    </FieldGroup>

                    <FieldGroup>
                        <Label>Transport</Label>
                        <TabRow>
                            <Tab active={transport === "stdio"} onClick={() => setTransport("stdio")}>Stdio</Tab>
                            <Tab active={transport === "http"} onClick={() => setTransport("http")}>Streamable HTTP</Tab>
                        </TabRow>
                    </FieldGroup>

                    {transport === "stdio" ? (
                        <>
                            <FieldGroup>
                                <Label htmlFor="mcp-command">Command</Label>
                                <Input
                                    id="mcp-command"
                                    type="text"
                                    value={command}
                                    onChange={(e) => setCommand(e.target.value)}
                                    placeholder="e.g. npx, uvx, python"
                                />
                            </FieldGroup>
                            <FieldGroup>
                                <Label>Arguments</Label>
                                <ArgsEditor rows={argsRows} onChange={setArgsRows} />
                            </FieldGroup>
                            <FieldGroup>
                                <Label>Environment variables</Label>
                                <KvEditor rows={envRows} onChange={setEnvRows} keyPlaceholder="KEY" valuePlaceholder="value" />
                            </FieldGroup>
                        </>
                    ) : (
                        <>
                            <FieldGroup>
                                <Label htmlFor="mcp-url">URL</Label>
                                <Input
                                    id="mcp-url"
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://example.com/mcp"
                                    hasError={!!urlError}
                                />
                                {urlError && <FieldError>{urlError}</FieldError>}
                            </FieldGroup>
                            <FieldGroup>
                                <Label>Headers</Label>
                                <KvEditor rows={headerRows} onChange={setHeaderRows} keyPlaceholder="Header-Name" valuePlaceholder="value" />
                            </FieldGroup>
                            <FieldGroup>
                                <Label>Headers from environment variables</Label>
                                <KvEditor rows={envHeaderRows} onChange={setEnvHeaderRows} keyPlaceholder="Header-Name" valuePlaceholder="ENV_VAR_NAME" />
                                <Hint>Set the header name and an environment variable name. The value is read from that variable at runtime.</Hint>
                            </FieldGroup>
                        </>
                    )}
                </Body>
                <Footer>
                    <SecondaryButton type="button" onClick={onClose} disabled={submitting}>Cancel</SecondaryButton>
                    <PrimaryButton type="button" onClick={handleSubmit} disabled={!canSubmit}>
                        {submitting ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save" : "Add")}
                    </PrimaryButton>
                </Footer>
            </Dialog>
        </Overlay>
    );
};

export default AddMcpServerModal;
