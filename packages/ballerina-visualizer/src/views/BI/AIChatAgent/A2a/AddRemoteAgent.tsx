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

import { useEffect, useRef, useState } from "react";
import { cloneDeep } from "lodash";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { A2aAgentCardInfo, FlowNode, NodePosition, ToolData } from "@wso2/ballerina-core";
import { Button, CheckBox, Dropdown, TextField } from "@wso2/ui-toolkit";
import {
    getEndOfFileLineRange, refreshAgentNodeLineRange, resolveAgentNodePosition, resolveVariableValue,
    withCurrentAgentTools,
} from "../utils";
import { AgentCardView, Footer, InfoBanner, Mono, Muted, Stack, WarnBanner } from "./AgentCardView";
import {
    A2aAuth, A2aAuthKind, AUTH_CHOICES, authKindOfScheme, buildConnection, DEFAULT_API_KEY_HEADER, NO_AUTH, readAuth,
} from "./remoteAgentConnection";

/**
 * "Use Remote Agent (A2A)": enter an agent's URL, read its card, choose the credential it needs and add it to the
 * agent as a tool. The connection is written by the language server as an `ai:A2aToolKit` module variable.
 */

const A2A_TOOL_KIT = "A2A_TOOL_KIT";
export const A2A_AGENT_TOOL_TYPE = "A2A Agent";

interface AddRemoteAgentProps {
    agentNode: FlowNode;
    /** Set to view and edit an A2A tool that is already on the agent, instead of adding one. */
    editToolName?: string;
    onAddTool?: (tool: ToolData, save: () => Promise<NodePosition | undefined>) => void;
    onSave?: () => void;
}

const stringOf = (value: unknown): string => (typeof value === "string" ? value : "");

/** Sets an expression property the way the form would: its value, with the expression type selected. */
function setExpression(node: FlowNode, key: string, value: string | undefined) {
    const property = (node.properties as any)?.[key];
    if (!property) {
        return;
    }
    if (value === undefined) {
        delete property.value;
        return;
    }
    property.value = value;
    property.modified = true;
    const wanted = value === "true" || value === "false" ? "FLAG" : "EXPRESSION";
    for (const type of property.types ?? []) {
        type.selected = type.fieldType === wanted;
    }
}

/** Names already declared at module level, which the toolkit's variable must not reuse. */
function moduleNames(moduleNodes: { flowModel?: { connections?: FlowNode[]; variables?: FlowNode[] } } | undefined): Set<string> {
    const names = new Set<string>();
    for (const node of [...(moduleNodes?.flowModel?.connections ?? []), ...(moduleNodes?.flowModel?.variables ?? [])]) {
        const value = (node.properties as any)?.variable?.value;
        if (typeof value === "string" && value) {
            names.add(value);
        }
    }
    return names;
}

function uniqueName(base: string, reserved: Set<string>): string {
    let name = base;
    for (let i = 1; reserved.has(name); i++) {
        name = `${base}${i}`;
    }
    return name;
}

/** The headers a card fetch carries for the chosen credential, for an agent behind a gateway that protects its card. */
function cardFetchHeaders(auth: A2aAuth): Record<string, string> {
    if (auth.secret === "") {
        return {};
    }
    if (auth.kind === "apiKey") {
        return { [auth.headerName.trim() || DEFAULT_API_KEY_HEADER]: auth.secret };
    }
    if (auth.kind === "bearer") {
        return { Authorization: `Bearer ${auth.secret}` };
    }
    return {};
}

export function AddRemoteAgent({ agentNode, editToolName, onAddTool, onSave }: AddRemoteAgentProps) {
    const { rpcClient } = useRpcContext();
    const editing = Boolean(editToolName);
    const [source, setSource] = useState("");
    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(editing);
    const [error, setError] = useState<string>();
    const [card, setCard] = useState<A2aAgentCardInfo>();
    const [unsupported, setUnsupported] = useState<string>();
    const [agentUrl, setAgentUrl] = useState("");
    const [toolkitName, setToolkitName] = useState(editToolName ?? "");
    const [auth, setAuth] = useState<A2aAuth>(NO_AUTH);
    const [requiresApproval, setRequiresApproval] = useState(false);
    const existingNode = useRef<FlowNode>();
    const reservedNames = useRef<Set<string>>(new Set());

    const updateAuth = (change: Partial<A2aAuth>) => setAuth((current) => ({ ...current, ...change }));

    // Names the toolkit may not take, and, when editing, the toolkit as the code has it.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const moduleNodes = await rpcClient.getBIDiagramRpcClient().getModuleNodes();
                if (cancelled) {
                    return;
                }
                reservedNames.current = moduleNames(moduleNodes);
                if (!editToolName) {
                    return;
                }
                const node = moduleNodes.flowModel?.variables?.find(
                    (variable) => variable.codedata?.node === A2A_TOOL_KIT && variable.properties.variable?.value === editToolName
                );
                if (!node) {
                    setError(`Couldn't find the declaration of ${editToolName} in the project.`);
                    return;
                }
                existingNode.current = node;
                const properties = node.properties as any;
                setAuth(readAuth(stringOf(properties?.headers?.value), stringOf(properties?.clientConfig?.value)));
                setRequiresApproval(stringOf(properties?.requiresApproval?.value) === "true");
                const { projectPath } = await rpcClient.getVisualizerLocation();
                const filePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [node.codedata?.lineRange?.fileName ?? "connections.bal"],
                })).filePath;
                const resolved = await resolveVariableValue(stringOf(properties?.agent?.value), rpcClient, projectPath, filePath);
                const url = resolved ?? stringOf(properties?.agent?.value).replace(/^"|"$/g, "");
                if (!cancelled) {
                    setAgentUrl(url);
                }
                if (url) {
                    await fetchCard(url, false);
                }
            } catch (e) {
                console.error("Error reading the A2A tool:", e);
                if (!cancelled) {
                    setError("Couldn't read this tool from the project.");
                }
            }
            if (!cancelled) {
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [editToolName]);

    const fetchCard = async (from: string = source, replaceUrl = true) => {
        setFetching(true);
        setError(undefined);
        setCard(undefined);
        setUnsupported(undefined);
        try {
            const res = await rpcClient.getAIAgentRpcClient().fetchA2aAgentCard({ source: from, headers: cardFetchHeaders(auth) });
            if (res.error || !res.card) {
                setError(res.error ?? "Couldn't read an Agent Card from that.");
            } else {
                setCard(res.card);
                setUnsupported(res.unsupported);
                if (replaceUrl) {
                    setAgentUrl(res.agentUrl ?? (res.card.endpointUrl ?? "").replace(/\/(rest|rpc)\/?$/i, ""));
                    setToolkitName(uniqueName(res.toolkitName ?? "remoteAgent", reservedNames.current));
                }
                // The card says which credential it expects; offer it unless one is already chosen.
                const suggested = authKindOfScheme(res.card.securitySchemes[0]?.kind ?? "");
                if (suggested && auth.kind === "none" && !editing) {
                    updateAuth({ kind: suggested });
                }
            }
        } catch (e) {
            console.error("Error fetching the Agent Card:", e);
            setError("Couldn't fetch the Agent Card.");
        }
        setFetching(false);
    };

    const authComplete = (): boolean => {
        switch (auth.kind) {
            case "oauth2": return auth.tokenUrl.trim() !== "";
            default: return true;
        }
    };

    /** The toolkit node as it should be saved, and the configurables it reads. */
    const buildNode = async () => {
        const connection = buildConnection(toolkitName, agentUrl.trim(), auth);
        let node: FlowNode;
        if (existingNode.current) {
            node = cloneDeep(existingNode.current);
        } else {
            const agentFile = agentNode.codedata?.lineRange?.fileName;
            const endLine = await getEndOfFileLineRange(agentFile, rpcClient);
            const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: { line: endLine.endLine.line, offset: endLine.endLine.offset },
                filePath: endLine.fileName,
                id: { node: A2A_TOOL_KIT },
            });
            if (!response.flowNode) {
                throw new Error("The language server returned no A2A toolkit template.");
            }
            node = response.flowNode;
        }
        setExpression(node, "variable", toolkitName);
        setExpression(node, "agent", connection.agent);
        setExpression(node, "headers", connection.headers);
        setExpression(node, "clientConfig", connection.clientConfig);
        setExpression(node, "requiresApproval", requiresApproval ? "true" : undefined);
        return { node, configurables: connection.configurables };
    };

    const write = async (): Promise<NodePosition | undefined> => {
        const { node, configurables } = await buildNode();
        const latest = await withCurrentAgentTools(agentNode, rpcClient);
        if (!latest.current) {
            await refreshAgentNodeLineRange(latest.node, rpcClient);
        }
        await rpcClient.getAIAgentRpcClient().updateA2aToolKit({
            agentFlowNode: latest.node,
            updatedNode: node,
            // A secret is only written when it was typed; an edit that leaves it empty keeps what Config.toml has.
            configurables: editing ? configurables.filter((c) => c.configValue !== undefined || c.defaultValue !== undefined) : configurables,
        });
        await rpcClient.getAIAgentRpcClient().fixMissingImports().catch((): undefined => undefined);
        return await resolveAgentNodePosition(latest.node, rpcClient);
    };

    const save = async () => {
        setError(undefined);
        if (onAddTool && !editing) {
            // A new tool is saved in the background, so the panel closes at once.
            onAddTool({ name: toolkitName, type: A2A_AGENT_TOOL_TYPE } as ToolData, write);
            return;
        }
        setSaving(true);
        try {
            await write();
            onSave?.();
        } catch (e) {
            console.error("Error saving the remote agent:", e);
            setError("Couldn't save the remote agent. Check the project for errors and try again.");
        }
        setSaving(false);
    };

    const needsSecret = auth.kind === "apiKey" || auth.kind === "bearer";
    const secretLabel = auth.kind === "apiKey" ? "API Key" : "Token";
    const canSave = Boolean(card) && !unsupported && agentUrl.trim() !== "" && toolkitName !== "" && authComplete() && !saving;

    return (
        <Stack style={{ padding: 16 }}>
            {!editing && (
                <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <TextField
                                id="a2a-source"
                                label="Agent URL"
                                required
                                placeholder="http://localhost:9092"
                                value={source}
                                onTextChange={setSource}
                                onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && source.trim() && !fetching && fetchCard()}
                            />
                        </div>
                        <Button appearance="secondary" disabled={!source.trim() || fetching} onClick={() => fetchCard()}>
                            {fetching ? "Fetching..." : "Fetch Card"}
                        </Button>
                    </div>
                    <Muted>The agent's address, or the URL of its Agent Card (ending in /.well-known/agent-card.json).</Muted>
                </div>
            )}
            {editing && (
                <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                            <TextField id="a2a-edit-url" label="Agent URL" required value={agentUrl} onTextChange={setAgentUrl} />
                        </div>
                        <Button appearance="secondary" disabled={!agentUrl.trim() || fetching}
                            onClick={() => fetchCard(agentUrl.trim(), false)}>
                            {fetching ? "Fetching..." : "Refresh Card"}
                        </Button>
                    </div>
                    <Muted>Saved as the configurable <Mono>{toolkitName}Url</Mono>; each environment can point elsewhere.</Muted>
                </div>
            )}
            {loading && <Muted>Reading the tool...</Muted>}
            {error && <WarnBanner message={error} />}
            {unsupported && <WarnBanner message={unsupported} />}
            {card && (
                <>
                    <AgentCardView card={card} agentUrl={agentUrl} />
                    {!editing && (
                        <div>
                            <TextField id="a2a-agent-url" label="Agent URL" required value={agentUrl} onTextChange={setAgentUrl} />
                            <Muted>Saved as the configurable <Mono>{toolkitName}Url</Mono>, so each environment can point elsewhere.</Muted>
                        </div>
                    )}
                    <Dropdown
                        id="a2a-auth"
                        label="Authentication"
                        containerSx={{ width: "100%" }}
                        value={auth.kind}
                        onValueChange={(value: string) => updateAuth({ kind: value as A2aAuthKind })}
                        items={AUTH_CHOICES.map((choice) => ({ value: choice.kind, content: choice.label }))}
                    />
                    {auth.kind === "apiKey" && (
                        <TextField id="a2a-header" label="Header Name" value={auth.headerName}
                            onTextChange={(headerName: string) => updateAuth({ headerName })} />
                    )}
                    {needsSecret && (
                        <TextField id="a2a-secret" label={secretLabel} type="password" value={auth.secret}
                            placeholder={editing ? "Unchanged" : undefined}
                            onTextChange={(secret: string) => updateAuth({ secret })} />
                    )}
                    {auth.kind === "oauth2" && (
                        <>
                            <TextField id="a2a-token-url" label="Token URL" required value={auth.tokenUrl}
                                onTextChange={(tokenUrl: string) => updateAuth({ tokenUrl })} />
                            <TextField id="a2a-client-id" label="Client ID" value={auth.clientId}
                                placeholder={editing ? "Unchanged" : undefined}
                                onTextChange={(clientId: string) => updateAuth({ clientId })} />
                            <TextField id="a2a-client-secret" label="Client Secret" type="password" value={auth.clientSecret}
                                placeholder={editing ? "Unchanged" : undefined}
                                onTextChange={(clientSecret: string) => updateAuth({ clientSecret })} />
                        </>
                    )}
                    {auth.kind !== "none" && (
                        <InfoBanner message={`The credential is saved as a configurable in Config.toml and read by the code; it is never written into the code. Sent with every call${auth.kind === "apiKey" ? ` in the ${auth.headerName.trim() || DEFAULT_API_KEY_HEADER} header` : ""}.`} />
                    )}
                    <CheckBox
                        label="Requires approval before each call"
                        checked={requiresApproval}
                        onChange={setRequiresApproval}
                    />
                    {!editing && (
                        <Muted>
                            Adds <Mono>{toolkitName}</Mono> to this agent's tools as one tool that asks the remote agent,
                            keeping a conversation per session.
                        </Muted>
                    )}
                    <Footer>
                        <Button appearance="primary" disabled={!canSave} onClick={save}>
                            {saving ? "Saving..." : editing ? "Save" : "Add as Tool"}
                        </Button>
                    </Footer>
                </>
            )}
        </Stack>
    );
}

export default AddRemoteAgent;
