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

/** @jsxImportSource @emotion/react */
import React, { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { DurableAgentRunNodeModel } from "./DurableAgentRunNodeModel";
import {
    AGENT_BOX_BOTTOM_AFFORDANCE_GAP,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    DRAFT_NODE_BORDER_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BORDER_ERROR_COLOR,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    LINK_COLOR,
    NODE_BG_COLOR,
    NODE_BG_HOVER_COLOR,
    NODE_HOVER_GLOW,
    NODE_BORDER_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Icon, Item, Menu, MenuItem, ThemeColors, getAIModuleIcon, DefaultLlmIcon } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources/icons";
import { AgentData, FlowNode, ToolData } from "../../../utils/types";
import NodeIcon, { DurableAgentIcon } from "../../NodeIcon";
import { ApprovalBadge } from "../AgentWidget/ApprovalBadge";
import ConnectorIcon from "../../ConnectorIcon";
import { useDiagramContext } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { getResultVariableName, nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { AgentUsage, NodeMetadata } from "@wso2/ballerina-core";
import { MarkdownWithTooltip } from "../AgentMarkdownTooltip";
import { AgentReferenceRow } from "../AgentWidget/AgentReferenceRow";
import { EdgeAddButton, UsageIcon, usageFadeIn } from "../AgentNode/AgentNodeWidget";
import {
    AGENT_USAGE_ROW_LIMIT,
    AGENT_USAGE_ROW_PITCH,
    DURABLE_SENDER_COLUMN_WIDTH,
    DurableBoxRows,
    DurableUsageColumn,
    durableAgentBoxHeight,
    durableBottomTileY,
    durableChannelSenders,
    durableHasSenders,
    durableLeftCircleTop,
    durableLeftSenders,
    durableRunUsages,
    durableSlotCircleOffset,
    durableUsageColumn,
    getDurableAgentUsages,
} from "../AgentWidget/agentNodeLayout";

export namespace NodeStyles {
    export const Node = styled.div<{ readOnly: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
    `;

    export type NodeStyleProp = {
        disabled: boolean;
        hovered: boolean;
        hasError: boolean;
        readOnly: boolean;
        isActiveBreakpoint: boolean;
        isSelected?: boolean;
    };
    export const Box = styled.div<NodeStyleProp>`
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: ${NODE_WIDTH}px;
        min-height: ${NODE_HEIGHT}px;
        padding: 0 ${NODE_PADDING}px;
        opacity: ${(props: NodeStyleProp) => (props.disabled ? 0.7 : 1)};
        border: ${(props: NodeStyleProp) => (props.disabled ? DRAFT_NODE_BORDER_WIDTH : NODE_BORDER_WIDTH)}px;
        border-style: ${(props: NodeStyleProp) => (props.disabled ? "dashed" : "solid")};
        border-color: ${(props: NodeStyleProp) =>
            props.hasError
                ? NODE_BORDER_ERROR_COLOR
                : props.isSelected && !props.disabled
                    ? NODE_BORDER_SELECTED_COLOR
                    : props.hovered && !props.disabled && !props.readOnly
                        ? NODE_BORDER_SELECTED_COLOR
                        : NODE_BORDER_COLOR};
        border-radius: 10px;
        background-color: ${(props: NodeStyleProp) =>
            props?.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : props.hovered && !props.disabled && !props.readOnly ? NODE_BG_HOVER_COLOR : NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        box-shadow: ${(props: NodeStyleProp) => props.hovered && !props.disabled && !props.readOnly ? NODE_HOVER_GLOW : 'none'};
        transition: box-shadow 0.1s ease, background-color 0.1s ease, border-color 0.1s ease;
    `;

    export const Header = styled.div<{}>`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        padding: 8px;
        margin-top: 2px;
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -3px;
        z-index: 2;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
        z-index: 2;
    `;

    export const StyledText = styled.div`
        font-size: 14px;
    `;

    export const Icon = styled.div`
        padding: 4px;
        svg {
            fill: ${NODE_TEXT_COLOR};
        }
    `;

    export const IconBox = styled.div`
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        margin-right: 4px;
    `;

    export const RunBadge = styled.div`
        position: absolute;
        bottom: -5px;
        right: -5px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
    `;

    export const Title = styled(StyledText)`
        height: 18px !important;
        max-width: ${NODE_WIDTH - 80}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "GilmerMedium";
    `;

    export const Description = styled(StyledText)`
        font-size: 12px;
        max-width: ${NODE_WIDTH - 80}px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        color: ${NODE_TEXT_COLOR};
        opacity: 0.7;
        margin-top: -2px;
    `;

    const MarkdownContent = styled.div`
        font-size: 12px;
        line-height: 1.4;
        width: 100%;

        p {
            margin: 0 0 0.3em 0;
            padding: 0;
        }

        p:last-child {
            margin-bottom: 0;
        }

        h1, h2, h3, h4, h5, h6 {
            margin: 0.4em 0 0.2em 0;
            padding: 0;
            font-weight: 600;
            font-size: 12px;
        }

        ul, ol {
            margin: 0.3em 0;
            padding-left: 1.2em;
        }

        li {
            margin: 0 0 0.1em 0;
        }

        code {
            background-color: rgba(127, 127, 127, 0.1);
            padding: 1px 3px;
            border-radius: 2px;
            font-size: 11px;
        }

        blockquote {
            margin: 0.3em 0;
            padding-left: 8px;
            border-left: 2px solid ${NODE_BORDER_COLOR};
        }

        strong {
            font-weight: 600;
        }

        em {
            font-style: italic;
        }

        a {
            color: ${LINK_COLOR};
            text-decoration: none;
        }
    `;

    export const Role = styled(MarkdownContent)`
        color: ${ThemeColors.PRIMARY};
        font-family: "GilmerMedium";
        font-weight: bold;
        padding: 0 4px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;

        /* Override paragraph margins for single line display */
        p {
            display: inline;
            margin: 0;
        }
    `;

    export const Divider = styled.div`
        width: 100%;
        border-top: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    `;

    export const RolePlaceholder = styled(Role)`
        color: ${NODE_TEXT_COLOR};
        opacity: 0.5;
        font-style: italic;
    `;

    export const Instructions = styled(MarkdownContent)`
        color: ${NODE_TEXT_COLOR};
        opacity: 0.7;
        overflow: hidden;
        height: 100%;
        max-height: calc(100% - 5px);
        padding: 0 4px 4px;
        -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
        mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
    `;

    export const InstructionsPlaceholder = styled(Instructions)`
        opacity: 0.5;
        font-style: italic;
    `;

    // Full role/instructions text shown in the hover tooltip, wrapped and scrollable since it
    // is not subject to the node box's fixed height.
    export const TooltipMarkdown = styled(MarkdownContent)`
        max-width: 280px;
        max-height: 320px;
        overflow-y: auto;
        white-space: normal;
        line-height: 1.5;
    `;

    export const InstructionsRow = styled.div<{ readOnly: boolean }>`
        flex: 1;
        overflow: hidden;
        align-items: flex-start;
        margin-bottom: ${AGENT_BOX_BOTTOM_AFFORDANCE_GAP}px;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        z-index: 2;
    `;

    export const Row = styled.div<{ readOnly: boolean }>`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        z-index: 2;
    `;

    export const Column = styled.div`
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        height: 100%;
        overflow: hidden;
    `;

    export const ActionButtonGroup = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
        gap: 2px;
    `;

    export const MenuButton = styled(Button)`
        border-radius: 5px;
    `;

    export type AffordanceAnchorName =
        | "leftMiddleUpper"
        | "leftMiddleLower"
        | "rightMiddleUpper"
        | "rightMiddleLower"
        | "bottomLeftOuter"
        | "bottomLeftInner"
        | "bottomRightOuter"
        | "bottomRightInner"
        | "topRight";

    // The capability affordances sit in vertically stacked pairs at the box's left and
    // right middles (people-facing capabilities left, execution capabilities right), so
    // they are all visible at a glance; the model configuration stays top-right. A side
    // with no capabilities yet parks its pair at the bottom corner instead.
    const anchorPosition: Record<AffordanceAnchorName, string> = {
        leftMiddleUpper: "top: calc(50% - 32px); left: -14px;",
        leftMiddleLower: "top: calc(50% + 4px); left: -14px;",
        rightMiddleUpper: "top: calc(50% - 32px); right: -14px;",
        rightMiddleLower: "top: calc(50% + 4px); right: -14px;",
        bottomLeftOuter: "bottom: -14px; left: -14px;",
        bottomLeftInner: "bottom: -14px; left: 22px;",
        bottomRightOuter: "bottom: -14px; right: -14px;",
        bottomRightInner: "bottom: -14px; right: 22px;",
        topRight: "top: -14px; right: -14px;",
    };

    // A capability add-affordance pinned to a fixed anchor of the agent box.
    export const AffordanceButton = styled.div<{ anchor: AffordanceAnchorName }>`
        position: absolute;
        ${(props: { anchor: AffordanceAnchorName }) => anchorPosition[props.anchor]}
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: ${NODE_BG_COLOR};
        border: 1.5px dashed ${NODE_BORDER_SELECTED_COLOR};
        color: ${NODE_TEXT_COLOR};
        cursor: pointer;
        z-index: 4;
        &:hover {
            border-style: solid;
            background-color: ${NODE_BG_HOVER_COLOR};
        }
    `;

    // Small "+" badge on the corner of an affordance button.
    export const AffordanceBadge = styled.div`
        position: absolute;
        top: -6px;
        right: -6px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        line-height: 1;
        background-color: ${NODE_BORDER_SELECTED_COLOR};
        color: ${NODE_BG_COLOR};
        pointer-events: none;
    `;
}

interface DurableAgentRunNodeWidgetProps {
    model: DurableAgentRunNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<DurableAgentRunNodeWidgetProps, "children"> { }

type DurableAgentNodeMetadata = NodeMetadata & {
    // The durable agent box still carries flat agent/tools metadata from the LS;
    // upstream's NodeMetadata moved the AI-agent equivalents under agentInfo.
    agent?: AgentData;
    tools?: ToolData[];
    activities?: ToolData[];
    humanTasks?: ToolData[];
    events?: ToolData[];
    peers?: ToolData[];
    agentName?: string;
    agentBox?: boolean;
    // Filled by the visualizer from the design model: the handlers that run or send to this agent.
    usages?: AgentUsage[];
    // False on a repaint of the list already on screen, so the rows fade in only when they are new.
    animateUsages?: boolean;
};

const LEFT_SVG_WIDTH = 300;
// The left circles are drawn at cx 220 with r 22; a sender's arrow lands on this edge.
const LEFT_CIRCLE_EDGE_X = 198;
// The caller square spans x 246..290 in the rail's own coordinate space; its line runs to the box edge.
const USAGE_SQUARE_X = 246;
const USAGE_TEXT_RIGHT_X = 238;
const USAGE_TEXT_CENTER_Y = 21;
const USAGE_LINE_GAP = 19;
const USAGE_ROW_STAGGER_MS = 70;

const fadeIn = (delay: number | undefined) => (delay === undefined ? "" : usageFadeIn(delay));

// A repaint of the list already on screen carries false; anything else, including the first paint, fades in.
function animatesUsages(metadata: { animateUsages?: boolean } | undefined): boolean {
    return metadata?.animateUsages !== false;
}

// A run is drawn solid, a send dotted (as the overview's event edge), a peer dashed (as its delegation edge).
function usageDash(usage: AgentUsage): string | undefined {
    if (usage.parentAgent) {
        return "6 5";
    }
    return usage.channel ? "2 4" : undefined;
}

interface UsageRowProps {
    usage: AgentUsage;
    index: number;
    boxEdgeX: number;
    codedata: FlowNode["codedata"];
    markerId: string;
    // Where the arrow lands, relative to the row: a sender row bends to its circle's centre.
    targetY?: number;
    animationDelay?: number;
    onOpen: (usage: AgentUsage) => void;
}

// One caller of the agent, drawn as the AI agent's rail draws it: a square, its labels, an arrow to the box or circle.
// The fade keyframes animate transform, so they run on an inner group and leave the row's translate alone.
function UsageRow({ usage, index, boxEdgeX, codedata, markerId, targetY = 25, animationDelay, onOpen }: UsageRowProps) {
    const title = [usage.serviceLabel ?? usage.typeLabel, usage.label].filter(Boolean).join(" — ");
    return (
        <g
            data-testid="durable-agent-usage-row"
            transform={`translate(0, ${index * AGENT_USAGE_ROW_PITCH})`}
            onClick={() => onOpen(usage)}
            css={css`
                cursor: pointer;
                > g {
                    ${fadeIn(animationDelay)}
                }
                &:hover .usage-square {
                    stroke: ${NODE_BORDER_SELECTED_COLOR};
                }
                &:hover text {
                    fill: ${NODE_BORDER_SELECTED_COLOR};
                }
            `}
        >
            <g>
                <rect className="usage-square" x={USAGE_SQUARE_X} y="2" width="44" height="44" rx="10" fill={NODE_BG_COLOR} stroke={NODE_BORDER_COLOR} strokeWidth={1.5} />
                <foreignObject x={USAGE_SQUARE_X + 10} y="12" width="44" height="44" fill={NODE_TEXT_COLOR} style={{ pointerEvents: "none" }}>
                    <div className="connector-icon"><UsageIcon usage={usage} codedata={codedata} /></div>
                </foreignObject>
                {usage.serviceLabel && (
                    <text x={USAGE_TEXT_RIGHT_X} y={USAGE_TEXT_CENTER_Y - USAGE_LINE_GAP / 2} textAnchor="end" fill={NODE_TEXT_COLOR} opacity={0.7} fontSize="12px" fontFamily="monospace" dominantBaseline="middle">
                        {usage.serviceLabel.length > 32 ? `${usage.serviceLabel.slice(0, 32)}...` : usage.serviceLabel}
                    </text>
                )}
                <text x={USAGE_TEXT_RIGHT_X} y={usage.serviceLabel ? USAGE_TEXT_CENTER_Y + USAGE_LINE_GAP / 2 : USAGE_TEXT_CENTER_Y} textAnchor="end" fill={NODE_TEXT_COLOR} fontSize="14px" fontFamily="GilmerRegular" dominantBaseline="middle">
                    {usage.label.length > 20 ? `${usage.label.slice(0, 20)}...` : usage.label}
                    <title>{title}</title>
                </text>
                <path d={`M ${USAGE_SQUARE_X + 45} 25 H ${USAGE_SQUARE_X + 57} V ${targetY} H ${boxEdgeX}`} fill="none" style={{ stroke: NODE_TEXT_COLOR, strokeWidth: 1.5, strokeDasharray: usageDash(usage), markerEnd: `url(#${markerId})` }} />
            </g>
        </g>
    );
}

interface UsageRowsProps {
    column: DurableUsageColumn;
    boxEdgeX: number;
    codedata: FlowNode["codedata"];
    markerId: string;
    readOnly: boolean;
    animate: boolean;
    onOpen: (usage: AgentUsage) => void;
    onAddTrigger: () => void;
}

// The declaration canvas offers the tile when the page can open the trigger picker; a run() reference never does.
function durableTriggerHost(
    agentNode: { onAddTrigger?: (node: FlowNode) => void } | undefined,
    isAgentReference: boolean,
    readOnly: boolean,
    node: FlowNode
): { canAddTrigger: boolean; onAddTrigger: () => void } {
    const onAddTrigger = agentNode?.onAddTrigger;
    const offered = onAddTrigger !== undefined && !isAgentReference;
    return {
        canAddTrigger: offered,
        onAddTrigger: () => {
            if (offered && !readOnly) {
                onAddTrigger(node);
            }
        },
    };
}

// The declaration canvas offers each channel its own Add Trigger tile when the page can open the picker for a data event.
function durableEventTriggerHost(
    agentNode: { onAddEventTrigger?: (node: FlowNode, event: ToolData) => void } | undefined,
    isAgentReference: boolean,
    readOnly: boolean,
    node: FlowNode
): { offered: boolean; addFor: (item: CapabilityItem) => (() => void) | undefined } {
    const onAddEventTrigger = agentNode?.onAddEventTrigger;
    const offered = onAddEventTrigger !== undefined && !isAgentReference;
    const add = (item: CapabilityItem) => () => {
        if (!readOnly) {
            onAddEventTrigger(node, item.data);
        }
    };
    return { offered, addFor: (item) => (offered ? add(item) : undefined) };
}

// The trigger block: the visible caller rows, "+N more" for the rest, then the Add Trigger tile.
function UsageRows({ column, boxEdgeX, codedata, markerId, readOnly, animate, onOpen, onAddTrigger }: UsageRowsProps) {
    const stagger = (row: number) => (animate ? row * USAGE_ROW_STAGGER_MS : undefined);
    return (
        <>
            {column.visible.map((usage: AgentUsage, index: number) => (
                <UsageRow
                    key={`${usage.documentUri}-${usage.label}-${usage.serviceLabel ?? ""}-${index}`}
                    usage={usage}
                    index={index}
                    boxEdgeX={boxEdgeX}
                    codedata={codedata}
                    markerId={markerId}
                    animationDelay={stagger(index)}
                    onOpen={onOpen}
                />
            ))}
            {column.hidden > 0 && (
                <text x={USAGE_SQUARE_X + 44} y={column.visible.length * AGENT_USAGE_ROW_PITCH + 24} textAnchor="end" fill={NODE_TEXT_COLOR} opacity={0.7} fontSize="12px" fontFamily="GilmerRegular" dominantBaseline="middle" css={css`${fadeIn(stagger(column.visible.length))}`}>
                    {`+${column.hidden} more`}
                </text>
            )}
            {column.canAddTrigger && (
                <EdgeAddButton
                    testId="durable-agent-add-trigger"
                    anchorX={boxEdgeX}
                    y={column.rows * AGENT_USAGE_ROW_PITCH + 24}
                    side="left"
                    label="Add Trigger"
                    title="Connect this agent to a chat channel or event source that will run it"
                    animationDelay={stagger(column.rows)}
                    onClick={onAddTrigger}
                    readOnly={readOnly}
                />
            )}
        </>
    );
}

interface ChannelSendersProps {
    channel: string;
    senders: AgentUsage[];
    // The circle's offset down its slot, so each row's arrow bends to the circle's centre.
    circleOffset: number;
    circleEdgeX: number;
    codedata: FlowNode["codedata"];
    markerId: string;
    animate: boolean;
    readOnly: boolean;
    onOpen: (usage: AgentUsage) => void;
    // Offered on the declaration canvas: a trigger that sends data on this channel.
    onAddTrigger?: () => void;
}

// A capability's circle and label light up together when the whole target can be clicked; the open-flow button
// shows itself while the row is hovered either way.
const capabilityHitStyle = (clickable: boolean) => css`
    cursor: ${clickable ? "pointer" : "default"};
    .capability-circle {
        transition: stroke 0.4s ease-out;
    }
    &:hover .open-flow {
        opacity: 1;
    }
    ${clickable
        ? css`
              &:hover .capability-circle {
                  stroke: ${NODE_BORDER_SELECTED_COLOR};
              }
              &:hover .capability-label {
                  fill: ${NODE_BORDER_SELECTED_COLOR};
                  color: ${NODE_BORDER_SELECTED_COLOR};
              }
          `
        : ""}
`;

const CapabilityLabel = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    color: ${NODE_TEXT_COLOR};
    font-family: "GilmerRegular";
    font-size: 14px;
    white-space: nowrap;
`;

// The agent run node's Open Agent chip, shrunk to its glyph.
const OpenFlowButton = styled.div`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;
    pointer-events: all;
    opacity: 0;
    transition: opacity 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
    &:hover {
        border-color: ${ThemeColors.PRIMARY};
        background-color: ${ThemeColors.SURFACE_BRIGHT};
    }
`;

// The vertical the sender rows' bent arrows share on their way into the circle.
const SENDER_TRUNK_X = USAGE_SQUARE_X + 57;
// The tile's plus (r 9) tops out where a square would (y 2), so the gap above it matches the gap between squares.
const SENDER_TILE_CENTER_Y = 11;

// The handlers that send on one channel, stacked beside its circle with their arrows bending into it, then the
// Add Trigger tile for the channel: alone it hangs off the circle; under senders it joins their trunk.
function ChannelSenders({ channel, senders, circleOffset, circleEdgeX, codedata, markerId, animate, readOnly, onOpen, onAddTrigger }: ChannelSendersProps) {
    const visible = senders.slice(0, AGENT_USAGE_ROW_LIMIT);
    const hidden = senders.length - visible.length;
    const rows = visible.length + (hidden > 0 ? 1 : 0);
    const tileY = rows * AGENT_USAGE_ROW_PITCH + (rows > 0 ? SENDER_TILE_CENTER_Y : 24);
    const stagger = (row: number) => (animate ? row * USAGE_ROW_STAGGER_MS : undefined);
    return (
        <>
            {visible.map((usage: AgentUsage, index: number) => (
                <UsageRow
                    key={`${usage.documentUri}-${usage.label}-${index}`}
                    usage={usage}
                    index={index}
                    boxEdgeX={circleEdgeX}
                    targetY={circleOffset + 24 - index * AGENT_USAGE_ROW_PITCH}
                    codedata={codedata}
                    markerId={markerId}
                    animationDelay={stagger(index)}
                    onOpen={onOpen}
                />
            ))}
            {hidden > 0 && (
                <text x={USAGE_SQUARE_X + 44} y={visible.length * AGENT_USAGE_ROW_PITCH + 24} textAnchor="end" fill={NODE_TEXT_COLOR} opacity={0.7} fontSize="12px" fontFamily="GilmerRegular" dominantBaseline="middle" css={css`${fadeIn(stagger(visible.length))}`}>
                    {`+${hidden} more`}
                </text>
            )}
            {onAddTrigger && rows > 0 && (
                <path
                    d={`M ${SENDER_TRUNK_X} ${tileY} V ${circleOffset + 24}`}
                    fill="none"
                    style={{ stroke: NODE_TEXT_COLOR, strokeWidth: 1.5, strokeDasharray: "2 4" }}
                    css={css`${fadeIn(stagger(rows))}`}
                />
            )}
            {onAddTrigger && (
                <EdgeAddButton
                    testId={`durable-agent-add-event-trigger-${sanitizeId(channel)}`}
                    anchorX={rows > 0 ? SENDER_TRUNK_X : circleEdgeX}
                    y={tileY}
                    side="left"
                    label="Add Trigger"
                    title={`Add an endpoint that sends data on ${channel} to a running instance`}
                    animationDelay={stagger(rows)}
                    onClick={onAddTrigger}
                    readOnly={readOnly}
                />
            )}
        </>
    );
}

type AgentCapability = ToolData & {
    lineRange?: any;
    values?: Record<string, string>;
};

type CapabilityItem = {
    data: AgentCapability;
    kind: "tool" | "activity" | "humanTask" | "event" | "peer";
};

// Capabilities addable from the agent box's "+" affordances, each pinned to a fixed anchor.
type AddableCapability = "humanTask" | "event" | "activity" | "model";

// The capability add tiles hang off the side columns under their own group — human tasks and data events on
// the left, the single tool/activity entry on the right (a plain tool is just an activity, plus the project's
// AI tools and MCP); only the model configuration is a floating affordance, top-right.
const ADD_AFFORDANCES: {
    kind: AddableCapability;
    label: string;
    title: string;
    icon: string;
}[] = [
    { kind: "humanTask", label: "Add Human Task", title: "Add a task a person decides while the agent waits", icon: "bi-user" },
    { kind: "event", label: "Add Data Event", title: "Add a channel the agent waits on for data sent from outside", icon: "bi-import" },
    { kind: "activity", label: "Add Tool/Activity", title: "Add an activity, tool or MCP server for this agent to call", icon: "bi-task" },
    { kind: "model", label: "Configure Model", title: "Configure Model", icon: "bi-ai-model" },
];

const MODEL_AFFORDANCE_ANCHOR: NodeStyles.AffordanceAnchorName = "topRight";

// The model affordance floats until the declaration has a model.
function showsModelAffordance(readOnly: boolean, nodeMetadata: DurableAgentNodeMetadata | undefined): boolean {
    return !readOnly && !nodeMetadata?.model;
}

// Row counts for both columns: the declaration canvas adds two footer tiles on the left and one on the right.
function durableBoxRows(triggerRows: number, leftSenders: number[], rightItems: number, showsTiles: boolean): DurableBoxRows {
    const tile = showsTiles ? 1 : 0;
    return { triggerRows, leftSenders, leftTiles: tile * 2, rightRows: rightItems + 1 + tile };
}

function addAffordance(kind: AddableCapability) {
    return ADD_AFFORDANCES.find((affordance) => affordance.kind === kind);
}

function affordanceIcon(kind: AddableCapability): ReactNode {
    return <Icon name={addAffordance(kind).icon} sx={{ width: 16, height: 16, fontSize: 16 }} />;
}

interface CapabilityAddTileProps {
    kind: AddableCapability;
    anchorX: number;
    y: number;
    side: "left" | "right";
    // The declaration canvas offers the tiles; a run() reference draws none.
    show: boolean;
    readOnly: boolean;
    onAdd: (kind: AddableCapability) => void;
}

// One add tile, drawn like the Add Trigger tile with the capability's own glyph.
function CapabilityAddTile({ kind, anchorX, y, side, show, readOnly, onAdd }: CapabilityAddTileProps) {
    if (!show) {
        return null;
    }
    const affordance = addAffordance(kind);
    return (
        <EdgeAddButton
            testId={`durable-agent-add-${kind}`}
            anchorX={anchorX}
            y={y}
            side={side}
            label={affordance.label}
            title={affordance.title}
            icon={affordanceIcon(kind)}
            onClick={() => onAdd(kind)}
            readOnly={readOnly}
        />
    );
}

export function DurableAgentRunNodeWidget(props: DurableAgentRunNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, removeBreakpoint, addBreakpoint, agentNode, readOnly, selectedNodeId, openView } =
        useDiagramContext();

    const isSelected = selectedNodeId === model.node.id;

    // Reference mode: the box renders at a run() call site. The agent's configuration is
    // owned by its declaration, so editing affordances are hidden and clicks navigate to
    // the agent's own model instead of opening the configuration form.
    const isAgentReference = agentNode?.durableAgentReference === true;

    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [isOpenAgentHovered, setIsOpenAgentHovered] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);

    const isMenuOpen = menuPos !== null;

    const getMenuPos = (el: HTMLElement): { top: number; left: number } => {
        const rect = el.getBoundingClientRect();
        return { top: rect.bottom, left: rect.left };
    };

    useEffect(() => {
        if (!isMenuOpen || !menuButtonElement) return;
        const handle = engine.getModel().registerListener({
            offsetUpdated: () => setMenuPos(getMenuPos(menuButtonElement)),
            zoomUpdated: () => setMenuPos(getMenuPos(menuButtonElement)),
        });
        return () => handle.deregister();
    }, [isMenuOpen, menuButtonElement]);

    useEffect(() => {
        if (!isMenuOpen) return;
        const handleClickOutside = () => setMenuPos(null);
        const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen]);

    const hasBreakpoint = model.hasBreakpoint();
    const isActiveBreakpoint = model.isActiveBreakpoint();

    useEffect(() => {
        if (model.node.suggested) {
            model.setAroundLinksDisabled(model.node.suggested === true);
        }
    }, [model.node.suggested]);

    const handleOnClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly) {
            return;
        }
        if (event.metaKey) {
            onGoToSource();
            return;
        }
        // In a caller's flow the box is the run statement, so clicking it opens that statement's
        // form — the way every other node behaves. Jumping to the agent's own diagram stays on the
        // "Open agent" affordance, which is the only one that says it navigates.
        onNodeClick();
    };

    const handleOpenAgent = (event: React.SyntheticEvent) => {
        event.stopPropagation();
        agentNode?.onGoToAgent?.(model.node);
    };

    const onNodeClick = () => {
        onClick && onClick(model.node);
        onNodeSelect && onNodeSelect(model.node);
        setMenuPos(null);
    };

    const onGoToSource = () => {
        goToSource && goToSource(model.node);
        setMenuPos(null);
    };

    const deleteNode = () => {
        onDeleteNode && onDeleteNode(model.node);
        setMenuPos(null);
    };

    const onAddBreakpoint = () => {
        addBreakpoint && addBreakpoint(model.node);
        setMenuPos(null);
    };

    const onRemoveBreakpoint = () => {
        removeBreakpoint && removeBreakpoint(model.node);
        setMenuPos(null);
    };

    // Only reachable from the owner-mode box below — reference mode returns its own
    // simplified box before any of these handlers can be wired up.
    const onModelEditClick = () => {
        if (readOnly) {
            return;
        }
        agentNode?.onModelSelect?.(model.node);
        setMenuPos(null);
    };

    // Whether an activity is gated by a review before the agent may run it. The value arrives as the
    // declared source text — `true`, or the name of a predicate function — so anything other than
    // absent or `false` gates it, which is how the chat agent's tool badge reads it too.
    const isApprovalGated = (item: CapabilityItem) => {
        const declared = (item.data as any)?.values?.requiresApproval;
        const value = typeof declared === "string" ? declared.trim() : "";
        return value !== "" && value !== "false";
    };

    const onCapabilityClick = (item: CapabilityItem) => {
        if (readOnly) {
            return;
        }
        agentNode?.onEditCapability?.(model.node, { ...item.data, type: item.kind });
    };

    // A tool or activity registers a function whose flow the sublink opens, as the AI agent's tool circles do.
    const flowOpener = (item: CapabilityItem): (() => void) | undefined => {
        if (readOnly || !agentNode?.goToTool || (item.kind !== "tool" && item.kind !== "activity")) {
            return undefined;
        }
        const functionName = item.data.values?.[item.kind] ?? item.data.name;
        return () => agentNode.goToTool({ name: functionName } as ToolData, model.node);
    };

    const onCapabilityDelete = (item: CapabilityItem) => (event: React.MouseEvent<SVGGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        agentNode?.onDeleteCapability?.(model.node, { ...item.data, type: item.kind });
    };

    const startAdding = (kind: AddableCapability) => {
        if (readOnly) {
            return;
        }
        switch (kind) {
            case "humanTask":
                agentNode?.onAddHumanTask?.(model.node);
                break;
            case "event":
                agentNode?.onAddEvent?.(model.node);
                break;
            case "activity":
                agentNode?.onAddActivity?.(model.node);
                break;
            case "model":
                agentNode?.onModelSelect?.(model.node);
                break;
        }
    };

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        const target = menuButtonElement || (event.currentTarget as HTMLElement);
        setMenuPos(getMenuPos(target));
    };

    const handleOnContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        const target = menuButtonElement || event.currentTarget;
        setMenuPos(getMenuPos(target as HTMLElement));
    };

    const disabled = model.node.suggested;
    const isDraft = model.node.metadata?.draft === true;
    const nodeMetadata = model?.node?.metadata?.data as DurableAgentNodeMetadata | undefined;
    // The big agent visualization is rendered only for the synthetic agent-box node
    // (metadata.data.agentBox) or the draft placeholder; the in-chain buildAndRun
    // statement renders as a compact node like the other register statements.
    const isAgentBox = nodeMetadata?.agentBox === true;

    const menuItems: Item[] = [
        {
            id: "edit",
            label: "Edit",
            onClick: () => onNodeClick(),
        },
        { id: "goToSource", label: "Source", onClick: () => onGoToSource() },
        { id: "delete", label: "Delete", onClick: () => deleteNode() },
        ...(isAgentBox && isAgentReference && agentNode?.onGoToAgent ? [{
            id: "goToAgent",
            label: "Open Agent",
            onClick: () => { agentNode.onGoToAgent!(model.node); setMenuPos(null); },
        }] : []),
    ];
    // The agent identifier names the box under its kind, as the AI agent node's variable does; fall back to the label.
    const nodeTitle = nodeMetadata?.agentName || model.node.metadata?.label || "Durable Agentic Workflow";
    const hasError = nodeHasError(model.node);
    const nodeModelIconUrl = nodeMetadata?.model?.path;

    const sanitizedAgent = nodeMetadata?.agent ? sanitizeAgentData(nodeMetadata.agent) : undefined;

    // Capability circles rendered on the right side: AI tools and activities (below the model circle).
    const rightItems: CapabilityItem[] = [
        ...(nodeMetadata?.tools || []).map((tool: ToolData): CapabilityItem => ({ data: tool, kind: "tool" })),
        ...(nodeMetadata?.activities || []).map((activity: AgentCapability): CapabilityItem => ({ data: activity, kind: "activity" })),
        // A peer is another agentic workflow this one delegates to, so it hangs off the same side
        // as everything else the model can invoke.
        ...(nodeMetadata?.peers || []).map((peer: AgentCapability): CapabilityItem => ({ data: peer, kind: "peer" })),
    ];

    const declaredHumanTasks: AgentCapability[] = nodeMetadata?.humanTasks || [];
    const declaredEvents: AgentCapability[] = nodeMetadata?.events || [];
    // Capability circles rendered on the left side: human tasks, then events (arrows point into the box).
    const leftItems: CapabilityItem[] = [
        ...declaredHumanTasks.map((humanTask: AgentCapability): CapabilityItem => ({ data: humanTask, kind: "humanTask" })),
        ...declaredEvents.map((event: AgentCapability): CapabilityItem => ({ data: event, kind: "event" })),
    ];

    // Triggers that run the agent take the top of the left column; the rail's labels need a wider column than the
    // circles do. A handler that sends on a channel is drawn beside that channel's circle instead, in a column of its
    // own further left, so the trigger block and the circles move right by its width when there is one.
    const triggerHost = durableTriggerHost(agentNode, isAgentReference, readOnly, model.node);
    const usages = getDurableAgentUsages(model.node);
    const usageColumn = durableUsageColumn(durableRunUsages(usages), triggerHost.canAddTrigger);
    const sendersOf = (item: CapabilityItem): AgentUsage[] => (item.kind === "event" ? durableChannelSenders(usages, item.data.name) : []);
    const eventTriggerHost = durableEventTriggerHost(agentNode, isAgentReference, readOnly, model.node);
    const leftSenders = durableLeftSenders(declaredHumanTasks.length, declaredEvents, usages, eventTriggerHost.offered);
    // A channel's Add Trigger tile alone fits beside its circle; only real callers open the sender column.
    const senderShift = durableHasSenders(declaredEvents, usages) ? DURABLE_SENDER_COLUMN_WIDTH : 0;
    const columnShift = usageColumn.shift + senderShift;
    const leftSvgWidth = LEFT_SVG_WIDTH + columnShift;
    const rows = durableBoxRows(usageColumn.triggerRows, leftSenders, rightItems.length, !isAgentReference);
    const showsLeftColumn = rows.triggerRows + rows.leftSenders.length + rows.leftTiles > 0;

    // The viewBox height for the side-connector SVGs; the box's rendered height is viewState.ch, set by
    // SizingVisitor.endVisitDurableAgentRun from the same function, so the connector lines meet the box edge.
    const containerHeight = durableAgentBoxHeight(rows);
    const footerTileY = (indexFromBottom: number) => durableBottomTileY(containerHeight, indexFromBottom);

    // Vertical offset of a capability row; row 0 aligns with the model circle.
    const rowOffsetY = (row: number) =>
        row === 0 ? 0 : row * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + AGENT_NODE_TOOL_SECTION_GAP;

    const sideSvgWidth = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + 10;
    const openUsage = (usage: AgentUsage) => openView?.({ documentUri: usage.documentUri, position: usage.position });

    const renderCapabilityIcon = (item: CapabilityItem) => {
        if (item.kind === "peer") {
            // Delegating runs another durable agent, so it wears the durable robot, not a plain tool function.
            return <NodeIcon type="DURABLE_AGENT_RUN" size={24} />;
        }
        // The three declared capability kinds are the same things the node palette lists, so they are
        // drawn through NodeIcon: one source for both the glyph and its colour, which is what keeps a
        // registered activity, human task or data event reading the same here as in the palette.
        if (item.kind === "activity") {
            return <NodeIcon type="ACTIVITY_CALL" size={24} />;
        }
        if (item.kind === "humanTask") {
            // The clock badge marks a configured deadline: the task times out and the agent
            // is told, so reviewers can spot time-bound tasks at a glance.
            const hasDeadline = !!(item.data as any)?.values?.timeout;
            return (
                <div style={{ position: "relative", display: "flex" }}>
                    <NodeIcon type="HUMAN_TASK" size={24} />
                    {hasDeadline && (
                        <Icon
                            name="bi-clock"
                            sx={{ fontSize: "11px", position: "absolute", right: "-4px", bottom: "-2px" }}
                        />
                    )}
                </div>
            );
        }
        if (item.kind === "event") {
            // Receiver icon: data arriving from outside. (The clock badge is reserved for
            // capabilities with a configured deadline.)
            return <NodeIcon type="WAIT_DATA" size={24} />;
        }
        if (item.data.path) {
            return (
                <ConnectorIcon
                    url={item.data.path}
                    style={{ width: 24, height: 24, fontSize: 24 }}
                    fallbackIcon={<Icon name="bi-function" sx={{ fontSize: "24px" }} />}
                    codedata={model.node?.codedata}
                />
            );
        }
        return <Icon name="bi-function" sx={{ fontSize: "24px" }} />;
    };

    const menuPortal = isMenuOpen && menuPos && createPortal(
        <div
            style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                zIndex: 1300,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                borderRadius: 0,
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <Menu>
                <>
                    {menuItems.map((item) => (
                        <MenuItem key={item.id} item={item} />
                    ))}
                    <BreakpointMenu
                        hasBreakpoint={hasBreakpoint}
                        onAddBreakpoint={onAddBreakpoint}
                        onRemoveBreakpoint={onRemoveBreakpoint}
                    />
                </>
            </Menu>
        </div>,
        document.body
    );

    // Draft placeholder: the enclosing function has no buildAndRun statement yet. Render a
    // dashed empty-state box (no model/capability circles) whose click routes through the
    // normal onClick/onNodeSelect path — the node's codedata already carries isNew and the
    // insertion line range, so the default edit path opens the buildAndRun creation form.
    if (isDraft) {
        return (
            <NodeStyles.Node data-testid="durable-agent-run-draft-node" readOnly={readOnly}>
                <NodeStyles.Box
                    disabled={true}
                    hovered={isBoxHovered}
                    hasError={hasError}
                    readOnly={readOnly}
                    isActiveBreakpoint={isActiveBreakpoint}
                    isSelected={isSelected}
                    onMouseEnter={() => setIsBoxHovered(true)}
                    onMouseLeave={() => setIsBoxHovered(false)}
                    onClick={handleOnClick}
                    title={model.node.metadata?.label || "Define Durable Agentic Workflow"}
                >
                    <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                    <NodeStyles.Column style={{ height: `${model.node.viewState?.ch}px` }}>
                        <NodeStyles.Row readOnly={readOnly}>
                            <NodeStyles.Icon>
                                <NodeIcon type={model.node.codedata.node} size={24} />
                            </NodeStyles.Icon>
                            <NodeStyles.Header>
                                <NodeStyles.Title>
                                    {model.node.metadata?.label || "Define Durable Agentic Workflow"}
                                </NodeStyles.Title>
                            </NodeStyles.Header>
                        </NodeStyles.Row>
                        {model.node.metadata?.description && (
                            <NodeStyles.InstructionsRow readOnly={readOnly}>
                                <NodeStyles.InstructionsPlaceholder>
                                    {model.node.metadata.description}
                                </NodeStyles.InstructionsPlaceholder>
                            </NodeStyles.InstructionsRow>
                        )}
                    </NodeStyles.Column>
                    <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
                </NodeStyles.Box>
            </NodeStyles.Node>
        );
    }

    // In-chain buildAndRun statement ("Build Agent"): compact node styled like the other
    // register statements — title from the label, the agent identifier as the second line.
    if (!isAgentBox) {
        return (
            <NodeStyles.Node data-testid="durable-agent-run-compact-node" readOnly={readOnly}>
                <NodeStyles.Box
                    disabled={disabled}
                    hovered={isBoxHovered}
                    hasError={hasError}
                    readOnly={readOnly}
                    isActiveBreakpoint={isActiveBreakpoint}
                    isSelected={isSelected}
                    onMouseEnter={() => setIsBoxHovered(true)}
                    onMouseLeave={() => setIsBoxHovered(false)}
                    onContextMenu={!readOnly ? handleOnContextMenu : undefined}
                >
                    {hasBreakpoint && (
                        <div
                            data-testid={isActiveBreakpoint ? "breakpoint-indicator-diagram-active" : "breakpoint-indicator-diagram"}
                            style={{
                                position: "absolute",
                                left: -5,
                                width: 15,
                                height: 15,
                                borderRadius: "50%",
                                backgroundColor: "red",
                                zIndex: 2,
                            }}
                        />
                    )}
                    <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                    <NodeStyles.Row readOnly={readOnly}>
                        <NodeStyles.Icon onClick={handleOnClick}>
                            <NodeIcon type={model.node.codedata.node} size={24} />
                        </NodeStyles.Icon>
                        <NodeStyles.Row readOnly={readOnly}>
                            <NodeStyles.Header onClick={handleOnClick}>
                                <NodeStyles.Title>{model.node.metadata?.label || "Build Agent"}</NodeStyles.Title>
                                <NodeStyles.Description>
                                    {(nodeMetadata?.agentName || model.node.metadata?.description) as ReactNode}
                                </NodeStyles.Description>
                            </NodeStyles.Header>
                            <NodeStyles.ActionButtonGroup>
                                {hasError && <DiagnosticsPopUp node={model.node} engine={engine} />}
                                <NodeStyles.MenuButton
                                    ref={setMenuButtonElement}
                                    buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                    appearance="icon"
                                    onClick={handleOnMenuClick}
                                >
                                    <MoreVertIcon />
                                </NodeStyles.MenuButton>
                            </NodeStyles.ActionButtonGroup>
                        </NodeStyles.Row>
                        {menuPortal}
                    </NodeStyles.Row>
                    <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
                </NodeStyles.Box>
            </NodeStyles.Node>
        );
    }

    // Reference mode: capability circles and role/instructions here only ever re-did the single
    // "go to agent" navigation (same over-inflated pattern AgentCallNode had), so the box collapses
    // to a title/description plus one reference row. The full capability detail lives in the
    // property panel that Edit opens.
    if (isAgentReference) {
        return (
            <NodeStyles.Node data-testid="durable-agent-run-node" readOnly={readOnly}>
                <NodeStyles.Box
                    disabled={disabled}
                    hovered={isBoxHovered && !isOpenAgentHovered}
                    hasError={hasError}
                    readOnly={readOnly}
                    isActiveBreakpoint={isActiveBreakpoint}
                    isSelected={isSelected}
                    onMouseEnter={() => setIsBoxHovered(true)}
                    onMouseLeave={() => setIsBoxHovered(false)}
                    onClick={!readOnly ? handleOnClick : undefined}
                    onContextMenu={!readOnly ? handleOnContextMenu : undefined}
                    title="Configure Run"
                >
                    {hasBreakpoint && (
                        <div
                            data-testid={isActiveBreakpoint ? "breakpoint-indicator-diagram-active" : "breakpoint-indicator-diagram"}
                            style={{
                                position: "absolute",
                                left: -5,
                                width: 15,
                                height: 15,
                                borderRadius: "50%",
                                backgroundColor: "red",
                                zIndex: 2,
                            }}
                        />
                    )}
                    <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                    <NodeStyles.Column style={{ height: "auto", paddingBottom: "12px" }}>
                        <NodeStyles.Row readOnly={readOnly}>
                            <NodeStyles.IconBox onClick={handleOnClick}>
                                <NodeIcon type={model.node.codedata.node} size={24} />
                                <NodeStyles.RunBadge>
                                    <Icon name="bi-play" iconSx={{ fontSize: "20px" }} sx={{ color: "var(--vscode-charts-green)", display: "flex", justifyContent: "center", alignItems: "center" }} />
                                </NodeStyles.RunBadge>
                            </NodeStyles.IconBox>
                            <NodeStyles.Row readOnly={readOnly}>
                                <NodeStyles.Header onClick={handleOnClick}>
                                    <NodeStyles.Title>durable agent : run</NodeStyles.Title>
                                    <NodeStyles.Description>
                                        {getResultVariableName(model.node)}
                                    </NodeStyles.Description>
                                </NodeStyles.Header>
                                <NodeStyles.ActionButtonGroup>
                                    {hasError && <DiagnosticsPopUp node={model.node} engine={engine} />}
                                    <NodeStyles.MenuButton
                                        ref={setMenuButtonElement}
                                        buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                        appearance="icon"
                                        onClick={handleOnMenuClick}
                                    >
                                        <MoreVertIcon />
                                    </NodeStyles.MenuButton>
                                </NodeStyles.ActionButtonGroup>
                            </NodeStyles.Row>
                            {menuPortal}
                        </NodeStyles.Row>

                        <AgentReferenceRow
                            label={nodeTitle}
                            clickable={Boolean(agentNode?.onGoToAgent)}
                            onOpen={handleOpenAgent}
                            onButtonHoverChange={setIsOpenAgentHovered}
                        />
                    </NodeStyles.Column>
                    <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
                </NodeStyles.Box>
            </NodeStyles.Node>
        );
    }

    return (
        <NodeStyles.Node data-testid="durable-agent-run-node" readOnly={readOnly}>
            {showsLeftColumn && (
                <svg
                    width={sideSvgWidth + columnShift}
                    height={model.node.viewState?.ch}
                    viewBox={`0 0 ${leftSvgWidth} ${containerHeight}`}
                    style={{ marginRight: "-10px", position: "relative", zIndex: 1 }}
                >
                    <g transform={`translate(${senderShift}, 0)`}>
                        <UsageRows
                            column={usageColumn}
                            boxEdgeX={LEFT_SVG_WIDTH + usageColumn.shift}
                            codedata={model.node.codedata}
                            markerId={`${model.node.id}-arrow-head-usage`}
                            readOnly={readOnly}
                            animate={animatesUsages(nodeMetadata)}
                            onOpen={openUsage}
                            onAddTrigger={triggerHost.onAddTrigger}
                        />
                    </g>
                    {leftItems.map((item: CapabilityItem, index: number) => {
                        if (rows.leftSenders[index] === 0) {
                            return null;
                        }
                        return (
                            <g key={`senders-${item.data.name}`} transform={`translate(0, ${durableLeftCircleTop(rows, index, containerHeight)})`}>
                                <ChannelSenders
                                    channel={item.data.name}
                                    senders={sendersOf(item)}
                                    circleOffset={durableSlotCircleOffset(rows.leftSenders[index])}
                                    circleEdgeX={columnShift + LEFT_CIRCLE_EDGE_X}
                                    codedata={model.node.codedata}
                                    markerId={`${model.node.id}-arrow-head-usage`}
                                    animate={animatesUsages(nodeMetadata)}
                                    readOnly={readOnly}
                                    onOpen={openUsage}
                                    onAddTrigger={eventTriggerHost.addFor(item)}
                                />
                            </g>
                        );
                    })}
                    <CapabilityAddTile kind="humanTask" anchorX={leftSvgWidth} y={footerTileY(1)} side="left" show={!isAgentReference} readOnly={readOnly} onAdd={startAdding} />
                    <CapabilityAddTile kind="event" anchorX={leftSvgWidth} y={footerTileY(0)} side="left" show={!isAgentReference} readOnly={readOnly} onAdd={startAdding} />
                    {/* circles for human tasks and events under the triggers — dotted arrows point into the agent box */}
                    {leftItems.map((item: CapabilityItem, index: number) => {
                        const itemName = item.data.name;
                        const hasSenders = rows.leftSenders[index] > 0;
                        const top = durableLeftCircleTop(rows, index, containerHeight) + durableSlotCircleOffset(rows.leftSenders[index]);
                        return (
                            <g key={`${item.kind}-${itemName}-${index}`} transform={`translate(${columnShift}, ${top})`}>
                                {/* The circle and its label are one target; a captioned circle's target reaches down to the caption. */}
                                <g onClick={readOnly ? undefined : () => onCapabilityClick(item)} css={capabilityHitStyle(!readOnly)}>
                                    <rect x={hasSenders ? 196 : 40} y="2" width={hasSenders ? 48 : 203} height={hasSenders ? 64 : 44} fill="transparent" style={{ pointerEvents: "all" }} />
                                    <circle
                                        className="capability-circle"
                                        cx="220"
                                        cy="24"
                                        r="22"
                                        fill={NODE_BG_COLOR}
                                        stroke={NODE_BORDER_COLOR}
                                        strokeWidth={1.5}
                                        strokeDasharray={disabled ? "5 5" : "none"}
                                        opacity={disabled ? 0.7 : 1}
                                    >
                                        <title>{itemName}</title>
                                    </circle>

                                    <foreignObject
                                        x="208"
                                        y="12"
                                        width="44"
                                        height="44"
                                        fill={NODE_TEXT_COLOR}
                                        style={{ pointerEvents: "none" }}
                                    >
                                        <div className="connector-icon">{renderCapabilityIcon(item)}</div>
                                    </foreignObject>

                                    {/* Senders occupy the circle's left, so a channel they feed carries its name underneath. */}
                                    <text
                                        className="capability-label"
                                        x={hasSenders ? 220 : 190}
                                        y={hasSenders ? 58 : 28}
                                        textAnchor={hasSenders ? "middle" : "end"}
                                        fill={NODE_TEXT_COLOR}
                                        fontSize={hasSenders ? "12px" : "14px"}
                                        fontFamily="GilmerRegular"
                                        dominantBaseline="middle"
                                    >
                                        {itemName.length > 20 ? `${itemName.slice(0, 20)}...` : itemName}
                                        <title>{itemName}</title>
                                    </text>
                                </g>

                                <g
                                    transform="translate(236, 8)"
                                    onClick={onCapabilityDelete(item)}
                                    css={css`
                                        cursor: ${readOnly ? "default" : "pointer"};
                                        opacity: 0.75;
                                        &:hover {
                                            opacity: 1;
                                        }
                                    `}
                                >
                                    <title>Remove</title>
                                    <circle cx="0" cy="0" r="7" fill={NODE_BG_COLOR} stroke={NODE_BORDER_COLOR} strokeWidth={1} />
                                    <text x="0" y="2.8" textAnchor="middle" fontSize="9" fill={NODE_TEXT_COLOR}>✕</text>
                                </g>

                                <line
                                    x1="243"
                                    y1="25"
                                    x2={LEFT_SVG_WIDTH}
                                    y2="25"
                                    style={{
                                        stroke: NODE_TEXT_COLOR,
                                        strokeWidth: 1.5,
                                        markerEnd: `url(#${model.node.id}-arrow-head-left-item-${item.kind}-${sanitizeId(itemName)})`,
                                        strokeDasharray: "6 6",
                                    }}
                                />
                            </g>
                        );
                    })}

                    <defs>
                        <marker id={`${model.node.id}-arrow-head-usage`} markerWidth="4" markerHeight="4" refX="3" refY="2" viewBox="0 0 4 4" orient="auto">
                            <polygon points="0,4 0,0 4,2" fill={NODE_TEXT_COLOR}></polygon>
                        </marker>
                        {leftItems.map((item: CapabilityItem, index: number) => (
                            <marker
                                key={`${item.kind}-${item.data.name}-${index}`}
                                id={`${model.node.id}-arrow-head-left-item-${item.kind}-${sanitizeId(item.data.name)}`}
                                markerWidth="4"
                                markerHeight="4"
                                refX="3"
                                refY="2"
                                viewBox="0 0 4 4"
                                orient="auto"
                            >
                                <polygon points="0,4 0,0 4,2" fill={NODE_TEXT_COLOR}></polygon>
                            </marker>
                        ))}
                    </defs>
                </svg>
            )}
            <NodeStyles.Box
                disabled={disabled}
                hovered={isBoxHovered}
                hasError={hasError}
                readOnly={readOnly}
                isActiveBreakpoint={isActiveBreakpoint}
                isSelected={isSelected}
                onMouseEnter={() => setIsBoxHovered(true)}
                onMouseLeave={() => setIsBoxHovered(false)}
                onContextMenu={!readOnly ? handleOnContextMenu : undefined}
                title="Configure Agent"
            >
                {hasBreakpoint && (
                    <div
                        data-testid={isActiveBreakpoint ? "breakpoint-indicator-diagram-active" : "breakpoint-indicator-diagram"}
                        style={{
                            position: "absolute",
                            left: -5,
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            backgroundColor: "red",
                            zIndex: 2,
                        }}
                    />
                )}
                <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                <NodeStyles.Column style={{ height: `${model.node.viewState?.ch}px` }}>
                    <NodeStyles.Row readOnly={readOnly}>
                        <NodeStyles.Icon onClick={handleOnClick}>
                            <DurableAgentIcon size={24} />
                        </NodeStyles.Icon>
                        <NodeStyles.Row readOnly={readOnly}>
                            <NodeStyles.Header onClick={handleOnClick}>
                                <NodeStyles.Title>Durable Agent</NodeStyles.Title>
                                <NodeStyles.Description>{nodeTitle}</NodeStyles.Description>
                            </NodeStyles.Header>
                            <NodeStyles.ActionButtonGroup>
                                {hasError && <DiagnosticsPopUp node={model.node} engine={engine} />}
                                <NodeStyles.MenuButton
                                    ref={setMenuButtonElement}
                                    buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                    appearance="icon"
                                    onClick={handleOnMenuClick}
                                >
                                    <MoreVertIcon />
                                </NodeStyles.MenuButton>
                            </NodeStyles.ActionButtonGroup>
                        </NodeStyles.Row>
                        {menuPortal}
                    </NodeStyles.Row>
                    <NodeStyles.Divider />

                    {
                        sanitizedAgent?.role ? (
                            <NodeStyles.Row readOnly={readOnly} onClick={handleOnClick}>
                                <MarkdownWithTooltip
                                    text={sanitizedAgent.role}
                                    Styled={NodeStyles.Role}
                                    TooltipStyled={NodeStyles.TooltipMarkdown}
                                    containerSx={{ display: "block", width: "100%" }}
                                />
                            </NodeStyles.Row>
                        ) : (
                            <NodeStyles.Row readOnly={readOnly} onClick={handleOnClick}>
                                <NodeStyles.RolePlaceholder>Define agent's role</NodeStyles.RolePlaceholder>
                            </NodeStyles.Row>
                        )
                    }

                    {
                        sanitizedAgent?.instructions ? (
                            <NodeStyles.InstructionsRow readOnly={readOnly} onClick={handleOnClick}>
                                <MarkdownWithTooltip
                                    text={sanitizedAgent.instructions}
                                    Styled={NodeStyles.Instructions}
                                    TooltipStyled={NodeStyles.TooltipMarkdown}
                                    containerSx={{ display: "block", width: "100%", height: "100%" }}
                                />
                            </NodeStyles.InstructionsRow>
                        ) : (
                            <NodeStyles.InstructionsRow readOnly={readOnly} onClick={handleOnClick}>
                                <NodeStyles.InstructionsPlaceholder>
                                    Provide specific instructions on how the agent should behave.
                                </NodeStyles.InstructionsPlaceholder>
                            </NodeStyles.InstructionsRow>
                        )
                    }
                </NodeStyles.Column>
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />

                {showsModelAffordance(readOnly, nodeMetadata) && (
                    <NodeStyles.AffordanceButton
                        data-testid="durable-agent-affordance-model"
                        anchor={MODEL_AFFORDANCE_ANCHOR}
                        title={addAffordance("model").label}
                        onClick={(event: React.MouseEvent<HTMLElement>) => {
                            event.stopPropagation();
                            startAdding("model");
                        }}
                    >
                        {affordanceIcon("model")}
                        <NodeStyles.AffordanceBadge>+</NodeStyles.AffordanceBadge>
                    </NodeStyles.AffordanceButton>
                )}
            </NodeStyles.Box>

            <svg
                width={sideSvgWidth}
                height={model.node.viewState?.ch}
                viewBox={`0 0 300 ${containerHeight}`}
                style={{ marginLeft: "-10px", position: "relative", zIndex: 1 }}
            >
                {/* durable agent model circle */}
                <g>
                    <circle
                        cx="80"
                        cy="24"
                        r="22"
                        fill={NODE_BG_COLOR}
                        stroke={NODE_BORDER_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray={disabled ? "5 5" : "none"}
                        opacity={disabled ? 0.7 : 1}
                        onClick={onModelEditClick}
                        css={css`
                            cursor: ${readOnly ? "default" : "pointer"};
                            transition: stroke 0.4s ease-out;
                            &:hover {
                                stroke: ${readOnly ? NODE_BORDER_COLOR : NODE_BORDER_SELECTED_COLOR};
                            }
                        `}
                    >
                        <title>{"Configure Model Provider"}</title>
                    </circle>

                    <foreignObject
                        x="68"
                        y="12"
                        width="44"
                        height="44"
                        fill={NODE_TEXT_COLOR}
                        style={{ pointerEvents: "none" }}
                    >
                        {getAIModuleIcon(nodeMetadata?.model?.type) ?? (nodeModelIconUrl ? <img src={nodeModelIconUrl} style={{ width: 24, height: 24 }} /> : <Icon name="bi-ai-model" sx={{ fontSize: 24, width: 24, height: 24 }} />)}
                    </foreignObject>

                    <line
                        x1="0"
                        y1="25"
                        x2="57"
                        y2="25"
                        style={{
                            stroke: NODE_TEXT_COLOR,
                            strokeWidth: 1.5,
                            markerEnd: `url(#${model.node.id}-arrow-head)`,
                            markerStart: `url(#${model.node.id}-diamond-start)`,
                        }}
                    />
                </g>

                <CapabilityAddTile kind="activity" anchorX={0} y={footerTileY(0)} side="right" show={!isAgentReference} readOnly={readOnly} onAdd={startAdding} />
                {/* circles for tools and activities */}
                {rightItems.map((item: CapabilityItem, index: number) => {
                    const itemName = item.data.name;
                    // A registered tool has no configuration form of its own to open.
                    const clickable = !readOnly && item.kind !== "tool";
                    const openFlow = flowOpener(item);
                    return (
                        <g
                            key={`${item.kind}-${itemName}-${index}`}
                            transform={`translate(0, ${rowOffsetY(index + 1)})`}
                        >
                            {/* The circle, its badge and its label are one target: the label is the easier thing to aim at. */}
                            <g onClick={clickable ? () => onCapabilityClick(item) : undefined} css={capabilityHitStyle(clickable)}>
                                <rect x="58" y="2" width={sideSvgWidth - 58} height="44" fill="transparent" style={{ pointerEvents: "all" }} />
                                <circle
                                    className="capability-circle"
                                    cx="80"
                                    cy="24"
                                    r="22"
                                    fill={NODE_BG_COLOR}
                                    stroke={NODE_BORDER_COLOR}
                                    strokeWidth={1.5}
                                    strokeDasharray={disabled ? "5 5" : "none"}
                                    opacity={disabled ? 0.7 : 1}
                                >
                                    <title>{itemName}</title>
                                </circle>

                                <foreignObject
                                    x="68"
                                    y="12"
                                    width="44"
                                    height="44"
                                    fill={NODE_TEXT_COLOR}
                                    style={{ pointerEvents: "none" }}
                                >
                                    <div className="connector-icon">{renderCapabilityIcon(item)}</div>
                                </foreignObject>

                                {/* The same shield the chat agent puts on a gated tool, in the same bottom-right corner — the
                                    only one free here, since the remove button owns the top-right. Keyed on the declared
                                    `requiresApproval` rather than the capability kind, because a registered tool carries it too. */}
                                {isApprovalGated(item) && <ApprovalBadge background={NODE_BG_COLOR} />}

                                {/* HTML for the label so the open-flow button can sit right after text of any width. */}
                                <foreignObject x="110" y="2" width={sideSvgWidth - 110} height="44" style={{ pointerEvents: "none" }}>
                                    <CapabilityLabel>
                                        <span className="capability-label" title={itemName}>
                                            {itemName.length > 20 ? `${itemName.slice(0, 20)}...` : itemName}
                                        </span>
                                        {openFlow && (
                                            <OpenFlowButton
                                                className="open-flow"
                                                data-testid={`durable-agent-open-flow-${sanitizeId(itemName)}`}
                                                title="Open flow"
                                                onClick={(event: React.MouseEvent) => {
                                                    event.stopPropagation();
                                                    openFlow();
                                                }}
                                            >
                                                <Icon
                                                    name="bi-arrow-outward"
                                                    sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: 13, height: 13 }}
                                                    iconSx={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 13, fontSize: 13, lineHeight: 1 }}
                                                />
                                            </OpenFlowButton>
                                        )}
                                    </CapabilityLabel>
                                </foreignObject>
                            </g>

                            <g
                                transform="translate(96, 8)"
                                onClick={onCapabilityDelete(item)}
                                css={css`
                                    cursor: ${readOnly ? "default" : "pointer"};
                                    opacity: 0.75;
                                    &:hover {
                                        opacity: 1;
                                    }
                                `}
                            >
                                <title>Remove</title>
                                <circle cx="0" cy="0" r="7" fill={NODE_BG_COLOR} stroke={NODE_BORDER_COLOR} strokeWidth={1} />
                                <text x="0" y="2.8" textAnchor="middle" fontSize="9" fill={NODE_TEXT_COLOR}>✕</text>
                            </g>

                            <line
                                x1="0"
                                y1="25"
                                x2="57"
                                y2="25"
                                style={{
                                    stroke: NODE_TEXT_COLOR,
                                    strokeWidth: 1.5,
                                    markerEnd: `url(#${model.node.id}-arrow-head-item-${item.kind}-${sanitizeId(itemName)})`,
                                    strokeDasharray: "6 6",
                                }}
                            />
                        </g>
                    );
                })}

                <defs>
                    <marker
                        id={`${model.node.id}-arrow-head`}
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        viewBox="0 0 4 4"
                        orient="auto"
                    >
                        <polygon points="0,4 0,0 4,2" fill={NODE_TEXT_COLOR}></polygon>
                    </marker>

                    <marker
                        id={`${model.node.id}-diamond-start`}
                        markerWidth="8"
                        markerHeight="8"
                        refX="4.5"
                        refY="4"
                        viewBox="0 0 8 8"
                        orient="auto"
                    >
                        <circle
                            cx="4"
                            cy="4"
                            r="3"
                            fill={NODE_BG_COLOR}
                            stroke={NODE_TEXT_COLOR}
                            strokeWidth="1"
                        />
                    </marker>
                    {rightItems.map((item: CapabilityItem, index: number) => (
                        <marker
                            key={`${item.kind}-${item.data.name}-${index}`}
                            id={`${model.node.id}-arrow-head-item-${item.kind}-${sanitizeId(item.data.name)}`}
                            markerWidth="4"
                            markerHeight="4"
                            refX="3"
                            refY="2"
                            viewBox="0 0 4 4"
                            orient="auto"
                        >
                            <polygon points="0,4 0,0 4,2" fill={NODE_TEXT_COLOR}></polygon>
                        </marker>
                    ))}
                </defs>
            </svg>
        </NodeStyles.Node>
    );
}

// sanitize a string for use as an SVG/HTML id attribute
function sanitizeId(name: string): string {
    return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

// sanitize agent instructions and role
// remove leading and trailing quotes
// remove suffix "string `" and prefix "`"
function stripWrappingQuotes(str: string): string {
    // Handle `string \`...\`` template format — backticks are the definitive wrapper, no further stripping needed
    if (str.startsWith('string `') && str.endsWith('`')) {
        return str.slice('string `'.length, -1);
    }
    // Only strip quotes if wrapped in a single matching pair (not multiple like """...""")
    if (
        ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'")))
        && !(str.startsWith('""') || str.startsWith("''"))
    ) {
        return str.slice(1, -1);
    }
    return str;
}

function sanitizeAgentData(data: AgentData): AgentData {
    return {
        ...data,
        role: data.role ? stripWrappingQuotes(data.role) : data.role,
        instructions: data.instructions ? stripWrappingQuotes(data.instructions) : data.instructions,
    };
}
