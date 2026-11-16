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

import { jsonSchema, tool, Tool } from "ai";
import type { FrozenToolDefinition } from "@wso2/ballerina-core/lib/state-machine-types";

import { CopilotEventHandler } from "../../utils/events";
import { getMcpClientManager, McpClientManager } from "./McpClientManager";
import { namespaceToolName } from "./naming";

/**
 * Best-effort flattening of MCP's `CallToolResult` content blocks into a plain
 * string that the LLM can consume. Non-text blocks are stringified so the model
 * can still see they exist; the result preserves block order.
 */
function flattenToolResult(result: unknown): string {
    if (result === null || result === undefined) {
        return "";
    }
    if (typeof result === "string") {
        return result;
    }
    if (typeof result !== "object") {
        return String(result);
    }
    const r = result as { isError?: boolean; content?: Array<{ type?: string; text?: string;[k: string]: unknown }> };
    if (!Array.isArray(r.content)) {
        return JSON.stringify(result);
    }
    const parts: string[] = [];
    for (const block of r.content) {
        if (!block || typeof block !== "object") {
            continue;
        }
        if (block.type === "text" && typeof block.text === "string") {
            parts.push(block.text);
        } else {
            parts.push(JSON.stringify(block));
        }
    }
    const joined = parts.join("\n");
    return r.isError ? `[mcp tool error]\n${joined}` : joined;
}

type ConnectedTools = ReturnType<McpClientManager["getConnectedTools"]>;

/** Every connected server's tools by namespaced name; on a clash after sanitising, the first wins. */
function connectedToolsByName(manager: McpClientManager): Map<string, { server: ConnectedTools[number]; mcpTool: ConnectedTools[number]["tools"][number] }> {
    const out = new Map<string, { server: ConnectedTools[number]; mcpTool: ConnectedTools[number]["tools"][number] }>();
    for (const server of manager.getConnectedTools()) {
        for (const mcpTool of server.tools) {
            const name = namespaceToolName(server.name, mcpTool.name);
            if (out.has(name)) {
                console.warn(`[mcp] Duplicate namespaced tool name '${name}' — skipping ${server.name}/${mcpTool.name}`);
                continue;
            }
            out.set(name, { server, mcpTool });
        }
    }
    return out;
}

/** The tool definitions of every connected server, namespaced `mcp__<server>__<tool>`. */
export function liveMcpToolDefinitions(): FrozenToolDefinition[] {
    const manager = getMcpClientManager();
    if (!manager) {
        return [];
    }
    return [...connectedToolsByName(manager)].map(([name, { server, mcpTool }]) => ({
        name,
        description: mcpTool.description ?? `MCP tool '${mcpTool.name}' from server '${server.name}'.`,
        inputSchema: (mcpTool.inputSchema ?? { type: "object" }) as Record<string, unknown>,
    }));
}

/**
 * Tools for MCP definitions as first sent in the thread. A call goes to whichever connected server
 * owns the name now, so a changed schema stays stale but valid; a name with no connected server
 * answers that its server is not connected.
 */
export function bridgeMcpToolDefinitions(
    definitions: readonly FrozenToolDefinition[],
    eventHandler: CopilotEventHandler,
): Record<string, Tool> {
    const out: Record<string, Tool> = {};
    for (const definition of definitions) {
        const namespaced = definition.name;
        out[namespaced] = tool({
            description: definition.description,
            inputSchema: jsonSchema(definition.inputSchema as Parameters<typeof jsonSchema>[0]),
            execute: async (input: unknown, context?: { toolCallId?: string }) => {
                const toolCallId = context?.toolCallId ?? `mcp-${Date.now()}`;
                eventHandler({ type: "tool_call", toolName: namespaced, toolInput: input, toolCallId });
                const manager = getMcpClientManager();
                const owner = manager && connectedToolsByName(manager).get(namespaced);
                if (!owner) {
                    const message = `MCP tool '${namespaced}' is not available: its server is not connected.`;
                    eventHandler({ type: "tool_result", toolName: namespaced, toolOutput: { error: message }, toolCallId, failed: true });
                    return message;
                }
                const { server, mcpTool } = owner;
                try {
                    const result = await manager!.callTool(server.scope, server.name, mcpTool.name, input);
                    const text = flattenToolResult(result);
                    const isError = !!(result && typeof result === "object" && (result as { isError?: boolean }).isError);
                    eventHandler({ type: "tool_result", toolName: namespaced, toolOutput: { text }, toolCallId, failed: isError });
                    return text;
                } catch (err: any) {
                    const message = err?.message ?? String(err);
                    eventHandler({ type: "tool_result", toolName: namespaced, toolOutput: { error: message }, toolCallId, failed: true });
                    return `MCP tool '${server.scope}:${server.name}/${mcpTool.name}' failed: ${message}`;
                }
            },
        });
    }
    return out;
}
