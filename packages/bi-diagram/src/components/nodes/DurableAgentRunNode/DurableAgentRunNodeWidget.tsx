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
import { Button, Icon, Item, Menu, MenuItem, getAIModuleIcon, DefaultLlmIcon } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources/icons";
import { AgentData, FlowNode, ToolData } from "../../../utils/types";
import NodeIcon from "../../NodeIcon";
import ConnectorIcon from "../../ConnectorIcon";
import { useDiagramContext } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeMetadata } from "@wso2/ballerina-core";
import ReactMarkdown from "react-markdown";

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
        color: ${LINK_COLOR};
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
    `;

    export const InstructionsPlaceholder = styled(Instructions)`
        opacity: 0.5;
        font-style: italic;
    `;

    export const InstructionsRow = styled.div<{ readOnly: boolean }>`
        flex: 1;
        overflow: hidden;
        align-items: flex-start;
        margin-bottom: 6px;
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

    // Pill indicator shown on the node while a capability form is open: (+ <icon> <label>).
    export const AddingPill = styled.div`
        position: absolute;
        top: -38px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border-radius: 14px;
        background-color: ${NODE_BG_COLOR};
        border: 1px solid ${NODE_BORDER_SELECTED_COLOR};
        color: ${NODE_TEXT_COLOR};
        font-size: 12px;
        font-family: "GilmerMedium";
        white-space: nowrap;
        cursor: pointer;
        z-index: 4;
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
};

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

// The capability add-affordances always sit at the bottom corners: people-facing
// capabilities (human task, data event) bottom-left, the single tool/activity entry
// bottom-right; the model configuration stays top-right. Tools and activities share
// one list — a plain tool is just an activity, plus the project's AI tools and MCP.
const ADD_AFFORDANCES: {
    kind: AddableCapability;
    label: string;
    icon: string;
    anchor: NodeStyles.AffordanceAnchorName;
}[] = [
    { kind: "humanTask", label: "Add Human Task", icon: "bi-user", anchor: "bottomLeftOuter" },
    { kind: "event", label: "Add Data Event", icon: "bi-import", anchor: "bottomLeftInner" },
    { kind: "activity", label: "Add Tool/Activity", icon: "bi-task", anchor: "bottomRightOuter" },
    { kind: "model", label: "Configure Model", icon: "bi-ai-model", anchor: "topRight" },
];

export function DurableAgentRunNodeWidget(props: DurableAgentRunNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, removeBreakpoint, addBreakpoint, agentNode, readOnly, selectedNodeId } =
        useDiagramContext();

    const isSelected = selectedNodeId === model.node.id;

    // Reference mode: the box renders at a run() call site. The agent's configuration is
    // owned by its declaration, so editing affordances are hidden and clicks navigate to
    // the agent's own model instead of opening the configuration form.
    const isAgentReference = agentNode?.durableAgentReference === true;

    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    // While a capability form is open, addingCapability drives the pill indicator on the node.
    const [addingCapability, setAddingCapability] = useState<AddableCapability | null>(null);
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
        // button in the corner, which is the only affordance that says it navigates.
        onNodeClick();
    };

    const onGoToAgentClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        event.stopPropagation();
        agentNode?.onGoToAgent?.(model.node);
        setMenuPos(null);
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

    const onModelEditClick = () => {
        if (readOnly || isAgentReference) {
            return;
        }
        agentNode?.onModelSelect?.(model.node);
        setMenuPos(null);
    };

    const onConfigureAgentClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly || isAgentReference) {
            return;
        }
        event.stopPropagation();
        agentNode?.onConfigureAgent?.(model.node);
        setMenuPos(null);
    };

    const onCapabilityClick = (item: CapabilityItem) => {
        if (readOnly) {
            return;
        }
        if (isAgentReference) {
            agentNode?.onGoToAgent?.(model.node);
            return;
        }
        agentNode?.onEditCapability?.(model.node, { ...item.data, type: item.kind });
    };

    const onCapabilityDelete = (item: CapabilityItem) => (event: React.MouseEvent<SVGGElement>) => {
        if (readOnly || isAgentReference) {
            return;
        }
        event.stopPropagation();
        agentNode?.onDeleteCapability?.(model.node, { ...item.data, type: item.kind });
    };

    // Fires the matching add callback and shows the pill; the diagram remounts the node
    // once the generated statement lands, clearing the pill.
    const onAffordanceClick = (kind: AddableCapability) => (event: React.MouseEvent<HTMLElement>) => {
        if (readOnly || isAgentReference) {
            return;
        }
        event.stopPropagation();
        setAddingCapability(kind);
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

    const menuItems: Item[] = [
        {
            id: "edit",
            label: "Edit",
            onClick: () => onNodeClick(),
        },
        { id: "goToSource", label: "Source", onClick: () => onGoToSource() },
        { id: "delete", label: "Delete", onClick: () => deleteNode() },
    ];

    const disabled = model.node.suggested;
    const isDraft = model.node.metadata?.draft === true;
    const nodeMetadata = model?.node?.metadata?.data as DurableAgentNodeMetadata | undefined;
    // The big agent visualization is rendered only for the synthetic agent-box node
    // (metadata.data.agentBox) or the draft placeholder; the in-chain buildAndRun
    // statement renders as a compact node like the other register statements.
    const isAgentBox = nodeMetadata?.agentBox === true;
    // Agent identifier (the enclosing function name) is the box title; fall back to the label.
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

    // Capability circles rendered on the left side: human tasks and events (arrows point into the box).
    const leftItems: CapabilityItem[] = [
        ...(nodeMetadata?.humanTasks || []).map((humanTask: AgentCapability): CapabilityItem => ({ data: humanTask, kind: "humanTask" })),
        ...(nodeMetadata?.events || []).map((event: AgentCapability): CapabilityItem => ({ data: event, kind: "event" })),
    ];

    // Row 0 is the model circle on the right (and the first left item, if any).
    const numberOfRows = Math.max(leftItems.length, rightItems.length + 1);
    const containerHeight =
        NODE_HEIGHT +
        AGENT_NODE_TOOL_SECTION_GAP +
        AGENT_NODE_TOOL_GAP * 2 +
        (numberOfRows - 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);

    // Vertical offset of a capability row; row 0 aligns with the model circle.
    const rowOffsetY = (row: number) =>
        row === 0 ? 0 : row * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + AGENT_NODE_TOOL_SECTION_GAP;

    const sideSvgWidth = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + 10;

    const renderCapabilityIcon = (item: CapabilityItem) => {
        if (item.kind === "peer") {
            // Delegating runs another durable agent, so it is marked as the agentic workflow it is
            // rather than as a plain tool function.
            return <Icon name="bi-ai-agent" sx={{ fontSize: "24px" }} />;
        }
        if (item.kind === "activity") {
            return <Icon name="bi-task" sx={{ fontSize: "24px" }} />;
        }
        if (item.kind === "humanTask") {
            // The clock badge marks a configured deadline: the task times out and the agent
            // is told, so reviewers can spot time-bound tasks at a glance.
            const hasDeadline = !!(item.data as any)?.values?.timeout;
            return (
                <div style={{ position: "relative", display: "flex" }}>
                    <Icon name="bi-user" sx={{ fontSize: "24px" }} />
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
            return <Icon name="bi-import" sx={{ fontSize: "24px" }} />;
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

    return (
        <NodeStyles.Node data-testid="durable-agent-run-node" readOnly={readOnly}>
            {leftItems.length > 0 && (
                <svg
                    width={sideSvgWidth}
                    height={model.node.viewState?.ch}
                    viewBox={`0 0 300 ${containerHeight}`}
                    style={{ marginRight: "-10px", position: "relative", zIndex: 1 }}
                >
                    {/* circles for human tasks and events — dotted arrows point into the agent box */}
                    {leftItems.map((item: CapabilityItem, index: number) => {
                        const itemName = item.data.name;
                        return (
                            <g key={`${item.kind}-${itemName}-${index}`} transform={`translate(0, ${rowOffsetY(index)})`}>
                                <circle
                                    cx="220"
                                    cy="24"
                                    r="22"
                                    fill={NODE_BG_COLOR}
                                    stroke={NODE_BORDER_COLOR}
                                    strokeWidth={1.5}
                                    strokeDasharray={disabled ? "5 5" : "none"}
                                    opacity={disabled ? 0.7 : 1}
                                    onClick={() => onCapabilityClick(item)}
                                    css={css`
                                        cursor: ${readOnly ? "default" : "pointer"};
                                        transition: stroke 0.4s ease-out;
                                        &:hover {
                                            stroke: ${readOnly ? NODE_BORDER_COLOR : NODE_BORDER_SELECTED_COLOR};
                                        }
                                    `}
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

                                {!isAgentReference && <g
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
                                </g>}

                                <text
                                    x="190"
                                    y="28"
                                    textAnchor="end"
                                    fill={NODE_TEXT_COLOR}
                                    fontSize="14px"
                                    fontFamily="GilmerRegular"
                                    dominantBaseline="middle"
                                >
                                    {itemName.length > 20 ? `${itemName.slice(0, 20)}...` : itemName}
                                    <title>{itemName}</title>
                                </text>

                                <line
                                    x1="243"
                                    y1="25"
                                    x2="300"
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
                            <NodeIcon type={model.node.codedata.node} size={24} />
                        </NodeStyles.Icon>
                        <NodeStyles.Row readOnly={readOnly}>
                            <NodeStyles.Header onClick={handleOnClick}>
                                <NodeStyles.Title>{nodeTitle}</NodeStyles.Title>
                                <NodeStyles.Description>
                                    {model.node.properties?.variable?.value as ReactNode}
                                </NodeStyles.Description>
                            </NodeStyles.Header>
                            <NodeStyles.ActionButtonGroup>
                                {hasError && <DiagnosticsPopUp node={model.node} engine={engine} />}
                                {isAgentReference ? (
                                    <NodeStyles.MenuButton
                                        appearance="icon"
                                        onClick={onGoToAgentClick}
                                        tooltip="Go to Agent"
                                    >
                                        <Icon
                                            name="bi-arrow-outward"
                                            sx={{ width: 16, height: 16 }}
                                            iconSx={{ fontSize: 16 }}
                                        />
                                    </NodeStyles.MenuButton>
                                ) : (
                                    <NodeStyles.MenuButton
                                        buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                        appearance="icon"
                                        onClick={onConfigureAgentClick}
                                        tooltip="Configure Agent Identifier"
                                    >
                                        <Icon name="bi-settings" sx={{ width: 16, height: 16 }} iconSx={{ fontSize: 16 }} />
                                    </NodeStyles.MenuButton>
                                )}
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

                    {
                        sanitizedAgent?.role ? (
                            <NodeStyles.Row readOnly={readOnly} onClick={handleOnClick}>
                                <NodeStyles.Role>
                                    <ReactMarkdown
                                        disallowedElements={['script', 'iframe', 'object', 'embed', 'link', 'style']}
                                        unwrapDisallowed={true}
                                    >
                                        {sanitizedAgent?.role}
                                    </ReactMarkdown>
                                </NodeStyles.Role>
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
                                <NodeStyles.Instructions>
                                    <ReactMarkdown
                                        disallowedElements={['script', 'iframe', 'object', 'embed', 'link', 'style']}
                                        unwrapDisallowed={true}
                                    >
                                        {sanitizedAgent?.instructions}
                                    </ReactMarkdown>
                                </NodeStyles.Instructions>
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

                {/* Capability add-affordances at fixed anchors; the model affordance hides
                    once the declaration has a model. */}
                {!readOnly && !isAgentReference &&
                    ADD_AFFORDANCES
                        .filter((affordance) => affordance.kind !== "model" || !nodeMetadata?.model)
                        .map((affordance) => (
                        <NodeStyles.AffordanceButton
                            key={affordance.kind}
                            data-testid={`durable-agent-affordance-${affordance.kind}`}
                            anchor={affordance.anchor}
                            title={affordance.label}
                            onClick={onAffordanceClick(affordance.kind)}
                        >
                            <Icon name={affordance.icon} sx={{ width: 16, height: 16, fontSize: 16 }} />
                            <NodeStyles.AffordanceBadge>+</NodeStyles.AffordanceBadge>
                        </NodeStyles.AffordanceButton>
                    ))}
                {addingCapability && (
                    <NodeStyles.AddingPill
                        data-testid="durable-agent-adding-pill"
                        title="Dismiss"
                        onClick={(event: React.MouseEvent<HTMLElement>) => {
                            event.stopPropagation();
                            setAddingCapability(null);
                        }}
                    >
                        <span>+</span>
                        <Icon
                            name={ADD_AFFORDANCES.find((a) => a.kind === addingCapability)?.icon || "bi-plus"}
                            sx={{ width: 14, height: 14, fontSize: 14 }}
                        />
                        <span>{ADD_AFFORDANCES.find((a) => a.kind === addingCapability)?.label.replace(/^Add /, "").replace(/^Configure /, "")}</span>
                    </NodeStyles.AddingPill>
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

                {/* circles for tools and activities */}
                {rightItems.map((item: CapabilityItem, index: number) => {
                    const itemName = item.data.name;
                    return (
                        <g
                            key={`${item.kind}-${itemName}-${index}`}
                            transform={`translate(0, ${rowOffsetY(index + 1)})`}
                        >
                            <circle
                                cx="80"
                                cy="24"
                                r="22"
                                fill={NODE_BG_COLOR}
                                stroke={NODE_BORDER_COLOR}
                                strokeWidth={1.5}
                                strokeDasharray={disabled ? "5 5" : "none"}
                                opacity={disabled ? 0.7 : 1}
                                onClick={item.kind === "tool" ? undefined : () => onCapabilityClick(item)}
                                css={css`
                                    cursor: ${readOnly || item.kind === "tool" ? "default" : "pointer"};
                                    transition: stroke 0.4s ease-out;
                                    &:hover {
                                        stroke: ${readOnly || item.kind === "tool" ? NODE_BORDER_COLOR : NODE_BORDER_SELECTED_COLOR};
                                    }
                                `}
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

                            {!isAgentReference && <g
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
                            </g>}

                            <text
                                x="110"
                                y="28"
                                textAnchor="start"
                                fill={NODE_TEXT_COLOR}
                                fontSize="14px"
                                fontFamily="GilmerRegular"
                                dominantBaseline="middle"
                            >
                                {itemName.length > 20 ? `${itemName.slice(0, 20)}...` : itemName}
                                <title>{itemName}</title>
                            </text>

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
