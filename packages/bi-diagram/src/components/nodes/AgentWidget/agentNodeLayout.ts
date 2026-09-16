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

// The durable agent box keeps its metadata flat (no agentInfo), so its usages are a flat key too.
export function getDurableAgentUsages(node: FlowNode): AgentUsage[] {
    return ((node.metadata?.data as { usages?: AgentUsage[] } | undefined)?.usages) ?? [];
}

// Callers that run the agent fill the trigger block; a send row is drawn beside the channel it sends on.
export function durableRunUsages(usages: AgentUsage[]): AgentUsage[] {
    return usages.filter((usage) => !usage.channel);
}

export function durableChannelSenders(usages: AgentUsage[], channel: string): AgentUsage[] {
    return usages.filter((usage) => usage.channel === channel);
}

// The sender column opens only for real callers; a channel's Add Trigger tile alone fits beside its circle.
export function durableHasSenders(events: { name: string }[], usages: AgentUsage[]): boolean {
    return events.some((event) => durableChannelSenders(usages, event.name).length > 0);
}

// Rows beside a channel's circle: its callers, "+N more", and the Add Trigger tile when the page offers one.
export function durableChannelRows(usages: AgentUsage[], channel: string, canAddTrigger: boolean): number {
    return durableUsageRowCount(durableChannelSenders(usages, channel)) + (canAddTrigger ? 1 : 0);
}

// Rows per left circle in the widget's circle order: the human tasks (none) first, then each channel's rows.
export function durableLeftSenders(humanTasks: number, events: { name: string }[], usages: AgentUsage[], canAddTrigger = false): number[] {
    return [...Array<number>(humanTasks).fill(0), ...events.map((event) => durableChannelRows(usages, event.name, canAddTrigger))];
}

// Rows the durable box's left column gives to callers: the visible usages plus the "+N more" line.
export function durableUsageRowCount(usages: AgentUsage[]): number {
    return Math.min(usages.length, AGENT_USAGE_ROW_LIMIT) + (usages.length > AGENT_USAGE_ROW_LIMIT ? 1 : 0);
}

// The rail's labels are wider than the capability labels, so a left column with trigger rows grows by this much.
export const DURABLE_USAGE_COLUMN_EXTRA_WIDTH = USAGE_LABEL_EXTRA_WIDTH;
// Clear space between the trigger block at the top of the left column and the capability circles below it.
export const DURABLE_LEFT_SECTION_GAP = 30;
// A sender row's square and its arrow into the event circle; the circles and trigger block move right by this much.
export const DURABLE_SENDER_COLUMN_WIDTH = 80;
// A circle with senders beside it carries its name underneath instead of on its left.
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

// Trigger rows: the visible callers, the "+N more" line, and the Add Trigger tile when the page offers one.
export function durableTriggerRows(usages: AgentUsage[], canAddTrigger: boolean): number {
    return durableUsageRowCount(usages) + (canAddTrigger ? 1 : 0);
}

// What the durable box's left column draws at its top, and how much room that takes.
export interface DurableUsageColumn {
    visible: AgentUsage[];
    hidden: number;
    // Caller rows including the "+N more" line; the Add Trigger tile sits on the row after them.
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

// The right column: the model circle at row 0, then the tool, activity and peer circles under the section gap,
// ending flush with the last row like the AI agent node's tool column. The widget's side SVG viewBox and the
// visitor's container height both come from here.
export function durableColumnHeight(rows: number): number {
    return NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + (Math.max(rows, 1) - 1) * CAPABILITY_ROW_PITCH;
}

const CAPABILITY_ROW_PITCH = NODE_HEIGHT + AGENT_NODE_TOOL_GAP;

// Row counts of the durable box's columns. The right column's rows include the model circle and its footer tile;
// the left column has its trigger rows, one slot per human-task and event circle, and its footer tiles. Tiles are
// counted only on the declaration canvas, where they are drawn.
export interface DurableBoxRows {
    triggerRows: number;
    // Sender rows drawn beside each left circle, in circle order: 0 for a human task or a channel nobody sends on.
    leftSenders: number[];
    leftTiles: number;
    rightRows: number;
}

// The footer tiles are 18px plus marks, so they stack closer than the 50px circles do.
export const DURABLE_FOOTER_TILE_PITCH = 36;

// A circle's slot: its own row, or the sender rows beside it plus room for its caption underneath.
export function durableSlotHeight(senderRows: number): number {
    if (senderRows === 0) {
        return CAPABILITY_ROW_PITCH;
    }
    return Math.max(senderRows * AGENT_USAGE_ROW_PITCH, CAPABILITY_ROW_PITCH + DURABLE_CAPTION_HEIGHT);
}

// How far down its slot a circle sits so that it is centred on the sender rows beside it.
export function durableSlotCircleOffset(senderRows: number): number {
    return senderRows <= 1 ? 0 : ((senderRows - 1) * AGENT_USAGE_ROW_PITCH) / 2;
}

function groupHeight(slots: number[]): number {
    return slots.length > 0 ? DURABLE_LEFT_SECTION_GAP + slots.reduce((sum, senderRows) => sum + durableSlotHeight(senderRows), 0) : 0;
}

// Under circles the first tile is simply the next row; under the trigger block alone it keeps the section gap.
function tilesHeight(rows: DurableBoxRows): number {
    if (rows.leftTiles === 0) {
        return 0;
    }
    const lead = rows.leftSenders.length > 0 ? 0 : DURABLE_LEFT_SECTION_GAP;
    return lead + NODE_HEIGHT + (rows.leftTiles - 1) * DURABLE_FOOTER_TILE_PITCH;
}

// The left column: trigger rows at the rail pitch, the circle slots under a gap, the footer tiles right below them.
export function durableLeftColumnHeight(rows: DurableBoxRows): number {
    return rows.triggerRows * AGENT_USAGE_ROW_PITCH + groupHeight(rows.leftSenders) + tilesHeight(rows);
}

export function durableAgentBoxHeight(rows: DurableBoxRows): number {
    return Math.max(durableColumnHeight(rows.rightRows), durableLeftColumnHeight(rows));
}

// Human-task and event circles stack directly above the footer tiles, tasks first, the way the tools stack above
// Add Tool: what the agent waits on reads together with the actions that add more of it, apart from the triggers.
export function durableLeftCircleTop(rows: DurableBoxRows, index: number, containerHeight: number): number {
    const tilesTop = containerHeight - NODE_HEIGHT - (rows.leftTiles - 1) * DURABLE_FOOTER_TILE_PITCH;
    return tilesTop - rows.leftSenders.slice(index).reduce((sum, senderRows) => sum + durableSlotHeight(senderRows), 0);
}

// The footer tiles fill the bottom of the box on both sides, counted up from the lowest one, exactly where the
// AI agent node puts Add Tool. Returns the tile's centre line (24 below the lowest row's top, as that rail is drawn).
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
