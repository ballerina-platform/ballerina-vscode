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
    AGENT_CALL_REFERENCE_HEIGHT,
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
const USAGE_LABEL_EXTRA_WIDTH = 48;

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
    [NodeTypes.AGENT_CALL_NODE]: (_toolHeight: number, _agentInfo: NodeMetadata["agentInfo"] | undefined, node?: FlowNode) => {
        const hasReferenceRow =
            node?.codedata?.node !== "AGENT_CALL" ||
            (typeof node.properties?.connection?.value === "string" && node.properties.connection.value.trim().length > 0);
        return NODE_HEIGHT + (hasReferenceRow ? AGENT_CALL_REFERENCE_HEIGHT : 0);
    },
} satisfies Record<AgentWidgetType, (toolHeight: number, agentInfo?: NodeMetadata["agentInfo"], node?: FlowNode) => number>;

export const AGENT_USAGE_ROW_PITCH = NODE_HEIGHT + AGENT_NODE_USAGE_GAP;

export const AGENT_USAGE_ROW_LIMIT = 5;

export const AGENT_USAGE_COLUMN_WIDTH = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + USAGE_LABEL_EXTRA_WIDTH;

export type AgentUsageOptions = {
    canAddTrigger?: boolean;
    canAddEventTrigger?: boolean;
};

export function getAgentNodeUsages(node: FlowNode): AgentUsage[] {
    const agentInfo = (node.metadata?.data as NodeMetadata | undefined)?.agentInfo;
    return agentInfo?.usages ?? [];
}

export function getDurableAgentUsages(node: FlowNode): AgentUsage[] {
    return ((node.metadata?.data as { usages?: AgentUsage[] } | undefined)?.usages) ?? [];
}

export function durableRunUsages(usages: AgentUsage[]): AgentUsage[] {
    return usages.filter((usage) => !usage.channel);
}

export function durableChannelSenders(usages: AgentUsage[], channel: string): AgentUsage[] {
    return usages.filter((usage) => usage.channel === channel);
}

export function durableHasSenders(events: { name: string }[], usages: AgentUsage[]): boolean {
    return events.some((event) => durableChannelSenders(usages, event.name).length > 0);
}

export function durableChannelRows(usages: AgentUsage[], channel: string, canAddTrigger: boolean): number {
    return durableUsageRowCount(durableChannelSenders(usages, channel)) + (canAddTrigger ? 1 : 0);
}

export function durableLeftSenders(humanTasks: number, events: { name: string }[], usages: AgentUsage[], canAddTrigger = false): number[] {
    return [...Array<number>(humanTasks).fill(0), ...events.map((event) => durableChannelRows(usages, event.name, canAddTrigger))];
}

export function durableUsageRowCount(usages: AgentUsage[]): number {
    return Math.min(usages.length, AGENT_USAGE_ROW_LIMIT) + (usages.length > AGENT_USAGE_ROW_LIMIT ? 1 : 0);
}

export const DURABLE_USAGE_COLUMN_EXTRA_WIDTH = USAGE_LABEL_EXTRA_WIDTH;
export const DURABLE_LEFT_SECTION_GAP = 30;
export const DURABLE_SENDER_COLUMN_WIDTH = 80;
export const DURABLE_CAPTION_HEIGHT = 16;

export function durableLeftColumnWidth(sideColumnWidth: number, triggerRows: number, hasSenders = false): number {
    return sideColumnWidth + (triggerRows > 0 ? DURABLE_USAGE_COLUMN_EXTRA_WIDTH : 0) + (hasSenders ? DURABLE_SENDER_COLUMN_WIDTH : 0);
}

export function canAddTrigger(options?: AgentUsageOptions): boolean {
    return Boolean(options?.canAddTrigger);
}

export function canAddEventTrigger(options?: AgentUsageOptions): boolean {
    return Boolean(options?.canAddEventTrigger);
}

export function durableTriggerRows(usages: AgentUsage[], canAddTrigger: boolean): number {
    return durableUsageRowCount(usages) + (canAddTrigger ? 1 : 0);
}

export interface DurableUsageColumn {
    visible: AgentUsage[];
    hidden: number;
    rows: number;
    triggerRows: number;
    canAddTrigger: boolean;
    shift: number;
}

export function durableUsageColumn(usages: AgentUsage[], canAddTrigger: boolean): DurableUsageColumn {
    const triggerRows = durableTriggerRows(usages, canAddTrigger);
    return {
        visible: usages.slice(0, AGENT_USAGE_ROW_LIMIT),
        hidden: Math.max(0, usages.length - AGENT_USAGE_ROW_LIMIT),
        rows: durableUsageRowCount(usages),
        triggerRows,
        canAddTrigger,
        shift: durableLeftColumnWidth(0, triggerRows),
    };
}

export function durableColumnHeight(rows: number): number {
    return NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + (Math.max(rows, 1) - 1) * CAPABILITY_ROW_PITCH;
}

const CAPABILITY_ROW_PITCH = NODE_HEIGHT + AGENT_NODE_TOOL_GAP;

export interface DurableBoxRows {
    triggerRows: number;
    leftSenders: number[];
    leftTiles: number;
    rightRows: number;
}

export const DURABLE_FOOTER_TILE_PITCH = 36;

export function durableSlotHeight(senderRows: number): number {
    if (senderRows === 0) {
        return CAPABILITY_ROW_PITCH;
    }
    return Math.max(senderRows * AGENT_USAGE_ROW_PITCH, CAPABILITY_ROW_PITCH + DURABLE_CAPTION_HEIGHT);
}

export function durableSlotCircleOffset(senderRows: number): number {
    return senderRows <= 1 ? 0 : ((senderRows - 1) * AGENT_USAGE_ROW_PITCH) / 2;
}

function groupHeight(slots: number[]): number {
    return slots.length > 0 ? DURABLE_LEFT_SECTION_GAP + slots.reduce((sum, senderRows) => sum + durableSlotHeight(senderRows), 0) : 0;
}

function tilesHeight(rows: DurableBoxRows): number {
    if (rows.leftTiles === 0) {
        return 0;
    }
    const lead = rows.leftSenders.length > 0 ? 0 : DURABLE_LEFT_SECTION_GAP;
    return lead + NODE_HEIGHT + (rows.leftTiles - 1) * DURABLE_FOOTER_TILE_PITCH;
}

export function durableLeftColumnHeight(rows: DurableBoxRows): number {
    return rows.triggerRows * AGENT_USAGE_ROW_PITCH + groupHeight(rows.leftSenders) + tilesHeight(rows);
}

export function durableAgentBoxHeight(rows: DurableBoxRows): number {
    return Math.max(durableColumnHeight(rows.rightRows), durableLeftColumnHeight(rows));
}

export function durableLeftCircleTop(rows: DurableBoxRows, index: number, containerHeight: number): number {
    const tilesTop = containerHeight - NODE_HEIGHT - (rows.leftTiles - 1) * DURABLE_FOOTER_TILE_PITCH;
    return tilesTop - rows.leftSenders.slice(index).reduce((sum, senderRows) => sum + durableSlotHeight(senderRows), 0);
}

export function durableBottomTileY(containerHeight: number, indexFromBottom: number): number {
    return containerHeight - NODE_HEIGHT + 24 - indexFromBottom * DURABLE_FOOTER_TILE_PITCH;
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
    return layoutStrategies[type](toolHeight, agentInfo, node);
}

export function getAgentNodeContainerHeight(
    node: FlowNode,
    type: AgentWidgetType,
    options?: AgentUsageOptions
): number {
    const usageHeight = getAgentUsageRowCount(node, type, options) * AGENT_USAGE_ROW_PITCH;
    return Math.max(getAgentNodeLayoutHeight(node, type), usageHeight);
}
