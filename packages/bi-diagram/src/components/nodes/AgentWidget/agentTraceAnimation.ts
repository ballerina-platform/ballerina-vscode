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

import { TraceAnimationEntry, TraceAnimationState } from "../../DiagramContext";
import { AgentData, ToolData } from "../../../utils/types";
import { unwrapBallerinaString } from "@wso2/ballerina-core";
import { sanitizeAgentData, toolEntryMatchesTools } from "../agentNodeUtils";

export type EntrypointContext = {
    serviceName?: string;
    functionName?: string;
};

export type AgentTraceState = {
    isModelActive: boolean;
    activeToolNames: string[];
    activeToolKitNames: string[];
    isAgentNodeActive: boolean;
    activeEntrypoint?: EntrypointContext;
};

export type AgentTraceParams = {
    traceAnimation: TraceAnimationState;
    tools: ToolData[];
    systemPrompt?: AgentData;
    enabled: boolean;
    requireEntrypointMatch: boolean;
    entrypointContext?: EntrypointContext;
};

const ROLE_PATTERN = /(?:^|\n)#\s*Role[ \t]*\r?\n([\s\S]*?)(?=\r?\n#\s*Instructions|$)/i;
const INSTRUCTIONS_PATTERN =
    /(?:^|\n)#\s*Instructions[ \t]*\r?\n([\s\S]*?)(?=\r?\n#\s*Instructions for Tool Validation Failure Handling|$)/i;
const TOOL_VALIDATION_PATTERN =
    /\n#\s*Instructions for Tool Validation Failure Handling[^\n]*\n[\s\S]*$/;

const INACTIVE: AgentTraceState = {
    isModelActive: false,
    activeToolNames: [],
    activeToolKitNames: [],
    isAgentNodeActive: false,
};

function matchesEntrypoint(trace: TraceAnimationState, context?: EntrypointContext): boolean {
    if (!context) {
        return false;
    }
    return (trace.entrypointServiceName ?? '') === (context.serviceName ?? '')
        && (trace.entrypointFunctionName ?? '') === (context.functionName ?? '');
}

function matchesPrompt(systemInstructions: string, systemPrompt?: AgentData): boolean {
    const agent = systemPrompt ? sanitizeAgentData(systemPrompt) : undefined;
    const role = systemInstructions.match(ROLE_PATTERN)?.[1]?.trim();
    const instructions = systemInstructions.match(INSTRUCTIONS_PATTERN)?.[1]
        ?.replace(TOOL_VALIDATION_PATTERN, '')
        ?.trim();
    const nodeInstructions = (agent?.instructions || '').trim();
    const instructionsMatch = instructions === nodeInstructions
        || Boolean(nodeInstructions && instructions?.startsWith(nodeInstructions));
    return role === (agent?.role || '').trim() && instructionsMatch;
}

// Entries from an agent that sent its prompt match by prompt only; a tool name shared with a nested agent is no proof
function belongsToAgent(entry: TraceAnimationEntry, tools: ToolData[], systemPrompt?: AgentData): boolean {
    if (entry.systemInstructions && hasPrompt(systemPrompt)) {
        return matchesPrompt(entry.systemInstructions, systemPrompt);
    }
    const toolNames = tools.map(tool => tool.name);
    return entry.agentToolNames.some(name => toolNames.includes(name))
        || (entry.type === 'execute_tool' && toolEntryMatchesTools(entry, tools));
}

function hasPrompt(systemPrompt?: AgentData): boolean {
    const agent = systemPrompt ? sanitizeAgentData(systemPrompt) : undefined;
    return Boolean(agent?.role?.trim() || agent?.instructions?.trim());
}

export function getAgentTraceState(params: AgentTraceParams): AgentTraceState {
    const { traceAnimation, tools, systemPrompt, enabled, requireEntrypointMatch, entrypointContext } = params;

    if (!enabled || !traceAnimation) {
        return INACTIVE;
    }
    if (requireEntrypointMatch && !matchesEntrypoint(traceAnimation, entrypointContext)) {
        return INACTIVE;
    }

    const agentEntries = traceAnimation.entries
        .filter(e => e.phase === 'active' && belongsToAgent(e, tools, systemPrompt));
    const activeEntries = agentEntries.filter(e => e.type === 'execute_tool' && toolEntryMatchesTools(e, tools));
    const activeToolNames = activeEntries.filter(e => e.toolName).map(e => e.toolName);
    const activeToolKitNames = activeEntries.filter(e => e.toolKitName).map(e => e.toolKitName);
    // An MCP call before its toolkit is known matches no circle, but the model is still waiting on it
    const isAnyToolActive = agentEntries.some(e => e.type === 'execute_tool');
    const isModelActive = agentEntries.some(e => e.type === 'chat') && !isAnyToolActive;

    return {
        isModelActive,
        activeToolNames,
        activeToolKitNames,
        isAgentNodeActive: isModelActive || isAnyToolActive,
        activeEntrypoint: {
            serviceName: traceAnimation.entrypointServiceName,
            functionName: traceAnimation.entrypointFunctionName,
        },
    };
}

/** Whether the caller in a "used as a tool by" row is running one of the tools that call this agent. */
export function matchesCallingAgent(trace: TraceAnimationState, usage: { agentRole?: string; toolNames?: string[] }): boolean {
    const role = usage.agentRole ? unwrapBallerinaString(usage.agentRole).trim() : '';
    if (!trace || !role || !usage.toolNames?.length) {
        return false;
    }
    return trace.entries.some(e => e.type === 'execute_tool' && e.phase === 'active'
        && usage.toolNames.includes(e.toolName ?? '')
        && e.systemInstructions?.match(ROLE_PATTERN)?.[1]?.trim() === role);
}

export function matchesUsageEntrypoint(
    usage: { serviceName?: string; functionName?: string },
    entrypoint?: EntrypointContext,
): boolean {
    const normalize = (value?: string) => {
        const path = (value ?? '').trim().replace(/^\//, '');
        return path === '.' ? '' : path;
    };
    const traceService = normalize(entrypoint?.serviceName);
    const usageService = normalize(usage.serviceName);
    if (!traceService || traceService !== usageService) {
        return false;
    }
    if (!usage.functionName) {
        return true;
    }
    return normalize(usage.functionName) === normalize(entrypoint?.functionName);
}
