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

import { keyframes } from "@emotion/react";
import { unwrapBallerinaString } from "@wso2/ballerina-core";
import { AgentData, ToolData } from "../../utils/types";

export const getSyncPulseAnimation = (color: string) => keyframes`
    0% { filter: drop-shadow(0 0 2px color-mix(in srgb, ${color} 30%, transparent)); }
    100% { filter: drop-shadow(0 0 8px color-mix(in srgb, ${color} 60%, transparent)) drop-shadow(0 0 12px color-mix(in srgb, ${color} 30%, transparent)); }
`;

export const getBoxSyncPulseAnimation = (color: string) => keyframes`
    0% { box-shadow: 0 0 3px color-mix(in srgb, ${color} 20%, transparent); }
    100% { box-shadow: 0 0 10px color-mix(in srgb, ${color} 50%, transparent), 0 0 20px color-mix(in srgb, ${color} 20%, transparent); }
`;

export const flowDashAnimation = keyframes`
    to { stroke-dashoffset: -12; }
`;

export function sanitizeId(name: string): string {
    return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function sanitizeAgentData(data: AgentData): AgentData {
    return {
        ...data,
        role: data.role ? unwrapBallerinaString(data.role) : data.role,
        instructions: data.instructions ? unwrapBallerinaString(data.instructions) : data.instructions,
    };
}

export const releaseBoxHover = (setHovered: (hovered: boolean) => void) => ({
    onMouseEnter: () => setHovered(false),
    onMouseLeave: () => setHovered(true),
});

function mcpToolKitSimpleClassName(tool: ToolData): string | undefined {
    return tool.type === "MCP Server" ? tool.className?.split(":").pop() : undefined;
}

function simpleClassName(name: string): string {
    return name.split(":").pop() ?? name;
}

// MCP tools trace by toolkit class name, not tool.name (which is the toolkit variable name, never seen in a trace).
export function isToolTraceActive(tool: ToolData, activeToolNames: string[], activeToolKitNames: string[]): boolean {
    const mcpClassName = mcpToolKitSimpleClassName(tool);
    if (mcpClassName) {
        return activeToolKitNames.some(name => name !== undefined && simpleClassName(name) === mcpClassName);
    }
    return activeToolNames.includes(tool.name);
}

// Whether a trace entry belongs to this agent's tools, matching MCP entries by toolkit class name.
export function toolEntryMatchesTools(entry: { toolName?: string; toolKitName?: string }, tools: ToolData[]): boolean {
    if (entry.toolName && tools.some(t => t.name === entry.toolName)) {
        return true;
    }
    const toolKitName = entry.toolKitName;
    if (!toolKitName) {
        return false;
    }
    const traceClassName = simpleClassName(toolKitName);
    return tools.some(t => mcpToolKitSimpleClassName(t) === traceClassName);
}
