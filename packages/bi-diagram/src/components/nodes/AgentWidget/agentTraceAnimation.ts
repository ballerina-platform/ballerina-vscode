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

import { TraceAnimationState } from "../../DiagramContext";
import { AgentData, ToolData } from "../../../utils/types";
import { sanitizeAgentData } from "../agentNodeUtils";

export type EntrypointContext = {
    serviceName?: string;
    functionName?: string;
};

export type AgentTraceState = {
    isModelActive: boolean;
    activeToolNames: string[];
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

function matchesTools(trace: TraceAnimationState, toolNames: string[]): boolean {
    return trace.activeAgentToolNames.some(name => toolNames.includes(name))
        || trace.entries.some(e => e.type === 'execute_tool' && e.toolName && toolNames.includes(e.toolName));
}

export function getAgentTraceState(params: AgentTraceParams): AgentTraceState {
    const { traceAnimation, tools, systemPrompt, enabled, requireEntrypointMatch, entrypointContext } = params;

    if (!enabled || !traceAnimation) {
        return INACTIVE;
    }
    if (requireEntrypointMatch && !matchesEntrypoint(traceAnimation, entrypointContext)) {
        return INACTIVE;
    }

    const toolNames = tools.map(tool => tool.name);
    const usedPrompt = Boolean(traceAnimation.systemInstructions);
    const matched = (usedPrompt && matchesPrompt(traceAnimation.systemInstructions, systemPrompt))
        || matchesTools(traceAnimation, toolNames);
    if (!matched) {
        return INACTIVE;
    }

    const activeToolNames = traceAnimation.entries
        .filter(e => e.type === 'execute_tool' && e.phase === 'active'
            && e.toolName && toolNames.includes(e.toolName))
        .map(e => e.toolName);
    const isAnyToolActive = activeToolNames.length > 0;
    const isModelActive = traceAnimation.entries
        .some(e => e.type === 'chat' && e.phase === 'active') && !isAnyToolActive;

    return {
        isModelActive,
        activeToolNames,
        isAgentNodeActive: isModelActive || isAnyToolActive,
        activeEntrypoint: {
            serviceName: traceAnimation.entrypointServiceName,
            functionName: traceAnimation.entrypointFunctionName,
        },
    };
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
