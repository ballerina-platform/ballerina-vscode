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

import { AgentData, FlowNode, MemoryData, NodeMetadata, ToolData } from "@wso2/ballerina-core";
import { parseToolsString } from "../AIChatAgent/utils";

// Strip Ballerina string wrappers (string-template backticks, plain backticks, double quotes).
function unwrap(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    let v = value.trim();
    v = v.replace(/^string\s*`/, "").replace(/`$/, "");
    if (v.startsWith("`") && v.endsWith("`")) {
        v = v.slice(1, -1);
    }
    if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
    }
    return v.trim();
}

// Best-effort role/instructions extraction from a raw `systemPrompt` record literal,
// used only when the analyzed AGENT node didn't surface role/instructions directly.
function parseSystemPrompt(systemPrompt: unknown): { role: string; instructions: string } {
    const result = { role: "", instructions: "" };
    if (typeof systemPrompt !== "string") {
        return result;
    }
    const roleMatch = systemPrompt.match(/role\s*:\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/);
    const instrMatch = systemPrompt.match(/instructions\s*:\s*(string\s*`[^`]*`|"(?:[^"\\]|\\.)*"|`[^`]*`)/);
    if (roleMatch) {
        result.role = unwrap(roleMatch[1]);
    }
    if (instrMatch) {
        result.instructions = unwrap(instrMatch[1]);
    }
    return result;
}

/**
 * Transform an `ai:Agent` declaration node into the synthetic `AGENT_CALL` render node that
 * `AgentCallNodeWidget` expects. The widget reads everything from `metadata.data`; since the
 * focus view deals with the agent directly, that view-model is derived from the declaration's
 * own `properties` (resolving model/memory variable names against module connections for the
 * icon/type) rather than from the LS-populated call-site metadata.
 */
export function buildAgentRenderNode(agentNode: FlowNode, connections: FlowNode[] = []): FlowNode {
    const props = (agentNode.properties || {}) as Record<string, { value?: unknown }>;

    let role = unwrap(props.role?.value);
    let instructions = unwrap(props.instructions?.value);
    if (!role && !instructions) {
        const parsed = parseSystemPrompt(props.systemPrompt?.value);
        role = parsed.role;
        instructions = parsed.instructions;
    }
    const agent: AgentData = { role, instructions };

    const findConnection = (name: string): FlowNode | undefined =>
        connections.find((c) => {
            const value = c.properties?.variable?.value;
            return typeof value === "string" && value.trim() === name;
        });

    let model: ToolData | undefined;
    const modelVar = typeof props.model?.value === "string" ? props.model.value.trim() : "";
    if (modelVar) {
        const connection = findConnection(modelVar);
        model = {
            name: modelVar,
            path: connection?.metadata?.icon,
            type: (connection?.codedata as { object?: string })?.object || connection?.codedata?.symbol,
        };
    }

    let memory: MemoryData | undefined;
    const memoryVar = typeof props.memory?.value === "string" ? props.memory.value.trim() : "";
    if (memoryVar && memoryVar !== "()") {
        const connection = findConnection(memoryVar);
        memory = { type: (connection?.codedata as { object?: string })?.object || memoryVar, size: "" };
    }

    let tools: ToolData[] = [];
    const toolsValue = props.tools?.value;
    if (typeof toolsValue === "string") {
        tools = parseToolsString(toolsValue).map((name) => ({ name }));
    } else if (Array.isArray(toolsValue)) {
        tools = toolsValue
            .map((tool: unknown) => (typeof tool === "string" ? tool : (tool as { value?: unknown })?.value))
            .filter((name: unknown): name is string => typeof name === "string")
            .map((name: string) => ({ name }));
    }

    // Prefer the rich metadata the LS injects on the AGENT node (tools/model/memory with resolved icons);
    // fall back to the property-derived view-model for older LS builds that don't populate it.
    const lsData = agentNode.metadata?.data as NodeMetadata | undefined;
    const hasLsData = !!(lsData && (lsData.agent || lsData.model || lsData.memory || (lsData.tools && lsData.tools.length)));
    const data: NodeMetadata = hasLsData ? (lsData as NodeMetadata) : { agent, model, memory, tools };

    return {
        ...agentNode,
        id: agentNode.id || "agent-focus-node",
        codedata: { ...agentNode.codedata, node: "AGENT" },
        metadata: { ...(agentNode.metadata || { label: "AI Agent", description: "" }), data },
        properties: {
            ...(agentNode.properties || {}),
        },
        branches: [],
        flags: agentNode.flags ?? 0,
        // Leaf node: prevents InitVisitor from appending a trailing EMPTY "end" node + link.
        returning: true,
    } as FlowNode;
}
