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

import { AgentUsage, NodeMetadata, unwrapBallerinaString } from "@wso2/ballerina-core";
import {
    AGENT_CALL_TOOL_SECTION_GAP,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    AGENT_NODE_USAGE_GAP,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NodeTypes,
} from "../../../resources/constants";
import { FlowNode } from "../../../utils/types";

export type AgentWidgetType = NodeTypes.AGENT_NODE | NodeTypes.TYPED_AGENT_NODE | NodeTypes.AGENT_CALL_NODE;

const PROMPT_CHARS_PER_LINE = 42;
const PROMPT_LINE_HEIGHT = 17;
const PROMPT_LINES_IN_BASE_HEIGHT = 4;
const PROMPT_MAX_EXTRA_LINES = 6;

function getPromptExtraHeight(agentInfo?: NodeMetadata["agentInfo"]): number {
    const instructions = unwrapBallerinaString(agentInfo?.systemPrompt?.instructions);
    if (!instructions) {
        return 0;
    }
    const lines = instructions
        .split(/\r?\n|\\n/)
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / PROMPT_CHARS_PER_LINE)), 0);
    const extraLines = Math.min(Math.max(lines - PROMPT_LINES_IN_BASE_HEIGHT, 0), PROMPT_MAX_EXTRA_LINES);
    return extraLines * PROMPT_LINE_HEIGHT;
}

const layoutStrategies = {
    [NodeTypes.AGENT_NODE]: (toolHeight: number, agentInfo?: NodeMetadata["agentInfo"]) => NODE_HEIGHT
        + AGENT_NODE_TOOL_SECTION_GAP + toolHeight + (NODE_HEIGHT + AGENT_NODE_TOOL_GAP)
        + (toolHeight === 0 ? getPromptExtraHeight(agentInfo) : 0),
    [NodeTypes.TYPED_AGENT_NODE]: (toolHeight: number, agentInfo?: NodeMetadata["agentInfo"]) => {
        const memoryHeight = agentInfo?.memory?.propertyKey ? 52 : 0;
        const hasPrompt = Boolean(agentInfo?.systemPrompt?.role && agentInfo?.systemPrompt?.instructions);
        const descriptionHeight = hasPrompt ? 115 : agentInfo?.description ? 95 : 0;
        return Math.max(NODE_HEIGHT + memoryHeight + descriptionHeight, NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + toolHeight);
    },
    [NodeTypes.AGENT_CALL_NODE]: (toolHeight: number) => NODE_HEIGHT + AGENT_CALL_TOOL_SECTION_GAP
        + AGENT_NODE_TOOL_GAP * 2 + 38 + toolHeight,
} satisfies Record<AgentWidgetType, (toolHeight: number, agentInfo?: NodeMetadata["agentInfo"]) => number>;

export const AGENT_USAGE_ROW_PITCH = NODE_HEIGHT + AGENT_NODE_USAGE_GAP;

export const AGENT_USAGE_ROW_LIMIT = 5;

export const AGENT_USAGE_COLUMN_WIDTH = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;

export type AgentUsageOptions = {
    canAddTrigger?: boolean;
};

export function getAgentNodeUsages(node: FlowNode): AgentUsage[] {
    const agentInfo = (node.metadata?.data as NodeMetadata | undefined)?.agentInfo;
    return agentInfo?.usages ?? [];
}

export function getVisibleAgentUsages(node: FlowNode): AgentUsage[] {
    return getAgentNodeUsages(node).slice(0, AGENT_USAGE_ROW_LIMIT);
}

export function showsAddTriggerTile(type: AgentWidgetType, options?: AgentUsageOptions): boolean {
    return type === NodeTypes.AGENT_NODE && Boolean(options?.canAddTrigger);
}

export function hasAgentUsageColumn(
    node: FlowNode,
    type: AgentWidgetType,
    options?: AgentUsageOptions
): boolean {
    return getAgentNodeUsages(node).length > 0 || showsAddTriggerTile(type, options);
}

export function getAgentUsageRowCount(
    node: FlowNode,
    type: AgentWidgetType = NodeTypes.AGENT_NODE,
    options?: AgentUsageOptions
): number {
    const total = getAgentNodeUsages(node).length;
    return Math.min(total, AGENT_USAGE_ROW_LIMIT)
        + (total > AGENT_USAGE_ROW_LIMIT ? 1 : 0)
        + (showsAddTriggerTile(type, options) ? 1 : 0);
}

export function getAgentNodeLayoutHeight(node: FlowNode, type: AgentWidgetType): number {
    const agentInfo = (node.metadata?.data as NodeMetadata | undefined)?.agentInfo;
    const toolCount = agentInfo?.tools?.length ?? 0;
    const toolHeight = toolCount * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
    return layoutStrategies[type](toolHeight, agentInfo);
}

export function getAgentNodeContainerHeight(
    node: FlowNode,
    type: AgentWidgetType,
    options?: AgentUsageOptions
): number {
    const usageHeight = getAgentUsageRowCount(node, type, options) * AGENT_USAGE_ROW_PITCH;
    return Math.max(getAgentNodeLayoutHeight(node, type), usageHeight);
}
