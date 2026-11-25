/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { createContext, ReactNode, useContext } from "react";
import { FlowNode, NodeMetadata } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import type { AgentEditorView } from "./useAgentEditorController";
import { findFlowNodeByModuleVarName } from "./utils";

/** Which part of the agent the open form sets; NESTED is a form opened from one of them. */
export type AgentPart = Exclude<AgentEditorView, "NONE"> | "AGENT" | "MODEL_PROVIDER" | "NEW_MODEL_PROVIDER" | "NESTED";

/** The agent an agent screen's forms belong to, so their Copilot fills them for that agent. */
export interface AgentScope {
    agent: FlowNode;
    part: AgentPart;
    // Closes the agent panel when the main Copilot takes a request over.
    close?: () => void;
}

const TOOL = { sets: "a new tool for" };
const PARTS: Record<AgentPart, { sets: string }> = {
    AGENT: { sets: "" },
    MODEL_PROVIDER: { sets: "the model provider of" },
    NEW_MODEL_PROVIDER: { sets: "a new model provider for" },
    MEMORY: { sets: "the memory of" },
    MEMORY_STORE: { sets: "the memory store of" },
    ADD_TOOL: TOOL,
    NEW_TOOL_CUSTOM: TOOL,
    NEW_TOOL_CONNECTION: TOOL,
    NEW_TOOL_FUNCTION: TOOL,
    NEW_TOOL_KNOWLEDGE_BASE: TOOL,
    NEW_TOOL_AGENT: { sets: "an agent tool for" },
    NEW_TOOL_AGENT_FORM: { sets: "an agent tool for" },
    ADD_MCP: { sets: "a new MCP server for" },
    EDIT_MCP: { sets: "an MCP server of" },
    NESTED: { sets: "for" },
};

const AgentScopeContext = createContext<AgentScope | undefined>(undefined);

export const useAgentScope = () => useContext(AgentScopeContext);

export function AgentScopeProvider({ scope, children }: { scope?: AgentScope; children: ReactNode }) {
    return <AgentScopeContext.Provider value={scope}>{children}</AgentScopeContext.Provider>;
}

/** The scope for a form opened from an agent form, e.g. Create New Memory Store: same agent, no panel to close. */
export const nestedScope = (scope?: AgentScope): AgentScope | undefined => scope && { agent: scope.agent, part: "NESTED" };

export const scopeOf = (agent: FlowNode | undefined, part: AgentPart | "NONE", close?: () => void): AgentScope | undefined =>
    agent && part !== "NONE" ? { agent, part, close } : undefined;

const text = (value: unknown) => (typeof value === "string" ? value : "");
const clip = (value = "", max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);
const infoOf = (agent: FlowNode) => (agent.metadata?.data as NodeMetadata | undefined)?.agentInfo;

// An agent call node names its agent in `connection`; the declaration in `variable`.
export const agentName = (agent: FlowNode) => text(agent.properties?.connection?.value) || text(agent.properties?.variable?.value);

const agentTitle = (agent: FlowNode) => [agent.metadata?.label ?? "AI Agent", agentName(agent)].filter(Boolean).join(" ");

// What the model reads about the agent as saved, cut so a long prompt stays a summary. The agent's own form leaves out
// the Role and Instructions it edits: the form holds their newer values.
function agentSummary(agent: FlowNode, part: AgentPart): string {
    const info = infoOf(agent);
    const memory = info?.memory?.presentation;
    const tools = info?.tools ?? [];
    const own = part === "AGENT";
    const prompt = own ? undefined : info?.systemPrompt;
    return [
        own && "This form is the agent's own: its Role and Instructions are in the Values, and the user's requests define them. How the agent answers and works (its output format, tone, language, steps) is set in its Instructions: change it there. Never steer them back to what the agent did before.",
        `Name: ${agentTitle(agent)}`,
        prompt?.role && `Role: ${clip(prompt.role, 300)}`,
        prompt?.instructions && `Instructions: ${clip(prompt.instructions, 800)}`,
        info?.modelProvider?.presentation && `Model provider: ${info.modelProvider.presentation.label ?? info.modelProvider.presentation.name}`,
        memory && `Memory: ${[memory.type, memory.size].filter(Boolean).join(", ")}`,
        tools.length && `Tools:\n${tools.map((tool) => `- ${tool.label ?? tool.name}${tool.description ? `: ${clip(tool.description, 150)}` : ""}`).join("\n")}`,
    ].filter(Boolean).join("\n");
}

// The flow page holds an agent call, so its declaration is read from the module.
async function declarationLine(agent: FlowNode, rpcClient: BallerinaRpcClient): Promise<string | undefined> {
    const declaration = agent.codedata?.node === "AGENT" ? agent : await findFlowNodeByModuleVarName(agentName(agent), rpcClient);
    const range = declaration?.codedata?.lineRange;
    return range?.fileName ? `${agentTitle(agent)} is declared in ${range.fileName} at line ${range.startLine.line + 1}.` : undefined;
}

/** What a form's Copilot says about where its change goes, and what the main Copilot gets when it takes a request over. */
export interface AssistTarget {
    subject?: string;
    agent?: string;
    handoffContext(): Promise<string[]>;
    close?: () => void;
}

export function useAssistTarget(rpcClient: BallerinaRpcClient): AssistTarget {
    const scope = useAgentScope();
    if (!scope) {
        return { handoffContext: async () => [] };
    }
    const part = PARTS[scope.part];
    const subject = [part.sets, agentTitle(scope.agent)].filter(Boolean).join(" ");
    return {
        subject,
        agent: agentSummary(scope.agent, scope.part),
        handoffContext: async () => [`The form in the side panel ${part.sets ? "sets" : "edits"} ${subject}.`, await declarationLine(scope.agent, rpcClient)].filter(Boolean),
        close: scope.close,
    };
}
