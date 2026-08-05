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
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { AgentNodeModel } from "./AgentNodeModel";
import {
    AGENT_NODE_ADD_TOOL_BUTTON_WIDTH,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    DRAFT_NODE_BORDER_WIDTH,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    NODE_BORDER_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Icon, Item, Menu, MenuItem, Popover, ThemeColors, getAIModuleIcon, DefaultLlmIcon } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources/icons";
import { AgentData, FlowNode, ToolData } from "../../../utils/types";
import NodeIcon, { CHART_COLORS, getAIColor, isDarkTheme, ThemeListener } from "../../NodeIcon";
import ConnectorIcon from "../../ConnectorIcon";
import { useDiagramContext, useTraceAnimation } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { css, keyframes } from "@emotion/react";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeMetadata } from "@wso2/ballerina-core";
import ReactMarkdown from "react-markdown";

const getSyncPulseAnimation = (color: string) => keyframes`
    0% { filter: drop-shadow(0 0 2px color-mix(in srgb, ${color} 30%, transparent)); }
    100% { filter: drop-shadow(0 0 8px color-mix(in srgb, ${color} 60%, transparent)) drop-shadow(0 0 12px color-mix(in srgb, ${color} 30%, transparent)); }
`;

const getBoxSyncPulseAnimation = (color: string) => keyframes`
    0% { box-shadow: 0 0 3px color-mix(in srgb, ${color} 20%, transparent); }
    100% { box-shadow: 0 0 10px color-mix(in srgb, ${color} 50%, transparent), 0 0 20px color-mix(in srgb, ${color} 20%, transparent); }
`;

const flowDashAnimation = keyframes`
    to { stroke-dashoffset: -12; }
`;

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
                ? ThemeColors.ERROR
                : props.isSelected && !props.disabled
                    ? ThemeColors.SECONDARY
                    : props.hovered && !props.disabled && !props.readOnly
                        ? ThemeColors.SECONDARY
                        : ThemeColors.OUTLINE_VARIANT};
        border-radius: 10px;
        background-color: ${(props: NodeStyleProp) =>
            props?.isActiveBreakpoint ? ThemeColors.DEBUGGER_BREAKPOINT_BACKGROUND : ThemeColors.SURFACE_DIM};
        color: ${ThemeColors.ON_SURFACE};
        transition: border-color 0.4s ease-out;
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

    export const StyledButton = styled(Button)`
        border-radius: 5px;
        position: absolute;
        right: 136px;
    `;

    export const FullWidthButton = styled(Button)`
        width: 100%;
        ::part(vscode-button) {
            width: 100%;
        }
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
            fill: ${ThemeColors.ON_SURFACE};
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
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.7;
        margin-top: -2px;
    `;

    const MarkdownContent = styled.div`
        font-size: 12px;
        line-height: 1.4;
        width: 100%;

        p { margin: 0 0 0.3em 0; padding: 0; }
        p:last-child { margin-bottom: 0; }
        h1, h2, h3, h4, h5, h6 { margin: 0.4em 0 0.2em 0; padding: 0; font-weight: 600; }
        h1:first-child, h2:first-child, h3:first-child, h4:first-child, h5:first-child, h6:first-child { margin-top: 0; }
        h1, h2, h3, h4, h5, h6 { font-size: 12px; }
        ul, ol { margin: 0.3em 0; padding-left: 1.2em; }
        ul:first-child, ol:first-child { margin-top: 0; }
        ul:last-child, ol:last-child { margin-bottom: 0; }
        li { margin: 0 0 0.1em 0; }
        li:last-child { margin-bottom: 0; }
        code { background-color: rgba(127, 127, 127, 0.1); padding: 1px 3px; border-radius: 2px; font-size: 11px; }
        pre { margin: 0.3em 0; padding: 4px; background-color: rgba(127, 127, 127, 0.1); border-radius: 2px; overflow-x: auto; }
        pre:first-child { margin-top: 0; }
        pre:last-child { margin-bottom: 0; }
        pre code { background-color: transparent; padding: 0; }
        blockquote { margin: 0.3em 0; padding-left: 8px; border-left: 2px solid ${ThemeColors.OUTLINE_VARIANT}; }
        blockquote:first-child { margin-top: 0; }
        blockquote:last-child { margin-bottom: 0; }
        strong { font-weight: 600; }
        em { font-style: italic; }
        a { color: ${ThemeColors.PRIMARY}; text-decoration: none; }
        a:hover { text-decoration: underline; }
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

        p { display: inline; margin: 0; }
    `;

    export const RolePlaceholder = styled(Role)`
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.5;
        font-style: italic;
    `;

    export const Instructions = styled(MarkdownContent)`
        color: ${ThemeColors.ON_SURFACE};
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

    export const ErrorIcon = styled.div`
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: ${ThemeColors.ERROR};
    `;

    export const Hr = styled.hr`
        width: 100%;
    `;

    export const Footer = styled(StyledText)`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export const MemoryButton = styled.div<{ readOnly: boolean }>`
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        margin: 8px 0;
        padding: 8px 0;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 4px;
        background-color: transparent;
        color: ${ThemeColors.ON_SURFACE};
        font-size: 14px;
        font-family: "GilmerRegular";
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        &:hover {
            background-color: ${ThemeColors.SURFACE_BRIGHT};
            border-color: ${(props: { readOnly: boolean }) =>
            props.readOnly ? ThemeColors.OUTLINE_VARIANT : ThemeColors.SECONDARY};
        }
    `;

    export const MemoryCard = styled.div<{ readOnly: boolean }>`
        width: 100%;
        padding: 8px 6px 8px 12px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 4px;
        background-color: transparent;
        color: ${ThemeColors.ON_SURFACE};
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        &:hover {
            border-color: ${(props: { readOnly: boolean }) =>
            props.readOnly ? ThemeColors.OUTLINE_VARIANT : ThemeColors.SECONDARY};
        }
    `;

    export const MemoryContainer = styled.div`
        width: 100%;
        border-bottom: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
        padding-bottom: 8px;
        z-index: 2;
    `;

    export const MemoryTitle = styled.div`
        font-size: 14px;
        font-family: "GilmerMedium";
        font-weight: bold;
        margin-bottom: 4px;
    `;

    export const MemoryMeta = styled.div`
        font-size: 12px;
        font-family: monospace;
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.7;
    `;

    export const AgentIdBadge = styled.div`
        margin-left: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        cursor: default;
        position: relative;
        overflow: visible;
        z-index: 10;

        &:hover {
            opacity: 0.8;
        }
    `;

    export const AgentIdTooltip = styled.div`
        position: absolute;
        left: 50%;
        top: calc(100% + 8px);
        transform: translateX(-50%);
        padding: 6px 10px;
        background: ${ThemeColors.SURFACE_DIM};
        color: ${ThemeColors.ON_SURFACE};
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 6px;
        font-size: 11px;
        font-family: "GilmerRegular";
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        pointer-events: none;
        z-index: 1000;

        &::before {
            content: "";
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 5px solid transparent;
            border-bottom-color: ${ThemeColors.OUTLINE_VARIANT};
        }
    `;
}

interface AgentNodeWidgetProps {
    model: AgentNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export function AgentNodeWidget(props: AgentNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, removeBreakpoint, addBreakpoint, agentNode, readOnly, selectedNodeId, entrypointContext } = useDiagramContext();
    const traceAnimation = useTraceAnimation();

    const isSelected = selectedNodeId === model.node.id;

    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [agentIdHovered, setAgentIdHovered] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [toolAnchorEl, setToolAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [selectedTool, setSelectedTool] = useState<ToolData | null>(null);
    const [memoryMenuAnchorEl, setMemoryMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    const [memoryMenuButtonElement, setMemoryMenuButtonElement] = useState<HTMLElement | null>(null);
    const isMenuOpen = Boolean(anchorEl);
    const isToolMenuOpen = Boolean(toolAnchorEl);
    const isMemoryMenuOpen = Boolean(memoryMenuAnchorEl);
    const hasBreakpoint = model.hasBreakpoint();
    const isActiveBreakpoint = model.isActiveBreakpoint();
    const [aiColor, setAiColor] = useState<string>(() => getAIColor());
    const [isDarkMode, setIsDarkMode] = useState<boolean>(() => isDarkTheme());
    const cyanColor = isDarkMode ? CHART_COLORS.BRIGHT_CYAN : CHART_COLORS.CYAN;
    const syncPulseAnimation = getSyncPulseAnimation(cyanColor);
    const boxSyncPulseAnimation = getBoxSyncPulseAnimation(cyanColor);

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
        } else {
            onNodeClick();
        }
    };

    const onNodeClick = () => {
        onClick && onClick(model.node);
        onNodeSelect && onNodeSelect(model.node);
        setAnchorEl(null);
    };

    const onModelEditClick = () => {
        if (readOnly) {
            return;
        }
        agentNode?.onModelSelect && agentNode.onModelSelect(model.node);
        setAnchorEl(null);
    };

    const onMemoryManagerClick = (event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (readOnly) {
            return;
        }
        agentNode?.onSelectMemoryManager && agentNode.onSelectMemoryManager(model.node);
        setMemoryMenuAnchorEl(null);
    };

    const onMemoryManagerDeleteClick = () => {
        if (readOnly) {
            return;
        }
        agentNode?.onDeleteMemoryManager && agentNode.onDeleteMemoryManager(model.node);
        setMemoryMenuAnchorEl(null);
    };

    const onToolClick = (tool: ToolData) => {
        if (readOnly) {
            return;
        }
        const toolType = tool.type ?? "";
        if (toolType === "MCP Server") {
            agentNode?.onSelectMcpToolkit && agentNode.onSelectMcpToolkit(tool, model.node);
            setAnchorEl(null);
        } else {
            agentNode?.onSelectTool && agentNode.onSelectTool(tool, model.node);
            setAnchorEl(null);
        }
    };

    const onAddToolClick = () => {
        if (readOnly) {
            return;
        }
        agentNode?.onAddTool && agentNode.onAddTool(model.node);
        setAnchorEl(null);
    };

    const onGoToSource = () => {
        goToSource && goToSource(model.node);
        setAnchorEl(null);
    };

    const deleteNode = () => {
        onDeleteNode && onDeleteNode(model.node);
        setAnchorEl(null);
    };

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };

    const handleOnContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        setAnchorEl(menuButtonElement || event.currentTarget);
    };

    const handleOnMenuClose = () => {
        setAnchorEl(null);
        setIsBoxHovered(false);
    };

    const handleToolMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>, tool: ToolData) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        setToolAnchorEl(event.currentTarget);
        setSelectedTool(tool);
    };

    const handleToolMenuClose = () => {
        setToolAnchorEl(null);
        setSelectedTool(null);
    };

    const onImplementTool = (tool: ToolData) => {
        if (readOnly) {
            return;
        }
        agentNode?.goToTool && agentNode.goToTool(tool, model.node);
        handleToolMenuClose();
    };

    const onDeleteTool = (tool: ToolData) => {
        agentNode?.onDeleteTool && agentNode.onDeleteTool(tool, model.node);
        handleToolMenuClose();
    };

    const onAddBreakpoint = () => {
        addBreakpoint && addBreakpoint(model.node);
        setAnchorEl(null);
    };

    const onRemoveBreakpoint = () => {
        removeBreakpoint && removeBreakpoint(model.node);
        setAnchorEl(null);
    };

    const handleOnMemoryMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        setMemoryMenuAnchorEl(event.currentTarget);
    };

    const handleMemoryContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setMemoryMenuAnchorEl(memoryMenuButtonElement || event.currentTarget);
    };

    const handleMemoryMenuClose = () => {
        setMemoryMenuAnchorEl(null);
    };

    const handleThemeChange = () => {
        const dark = isDarkTheme();
        setIsDarkMode(dark);
        setAiColor(getAIColor());
    };

    const onChatWithAgent = () => {
        agentNode?.onChatWithAgent?.(model.node);
        setAnchorEl(null);
    };

    const menuItems: Item[] = [
        ...(agentNode?.onChatWithAgent ? [{
            id: "chat",
            label: "Chat",
            onClick: () => onChatWithAgent(),
        }] : []),
        {
            id: "edit",
            label: "Edit",
            onClick: () => onNodeClick(),
        },
        { id: "goToSource", label: "Source", onClick: () => onGoToSource() },
        { id: "delete", label: "Delete", onClick: () => deleteNode() },
    ];

    const toolMenuItems = (tool: ToolData): Item[] => [
        {
            id: "edit",
            label: "Edit",
            onClick: () => onToolClick(tool),
        },
        {
            id: "view",
            label: "View",
            onClick: () => onImplementTool(tool),
        },
        {
            id: "delete",
            label: "Delete",
            onClick: () => onDeleteTool(tool),
        },
    ];

    const memoryMenuItems: Item[] = [
        {
            id: "edit",
            label: "Edit",
            onClick: () => onMemoryManagerClick(),
        },
        { id: "delete", label: "Delete", onClick: () => onMemoryManagerDeleteClick() },
    ];

    const disabled = model.node.suggested;
    const nodeTitle = "AI Agent";
    const hasError = nodeHasError(model.node);
    const nodeMetadata = model?.node.metadata.data as NodeMetadata;
    const nodeModelIconUrl = nodeMetadata?.model?.path;
    const tools = nodeMetadata?.tools || [];

    const sanitizedAgent = nodeMetadata?.agent ? sanitizeAgentData(nodeMetadata.agent) : undefined;
    const nodeToolNames = tools.map((t: ToolData) => t.name).sort();
    const nodeRole = sanitizedAgent?.role || '';
    const nodeInstructions = sanitizedAgent?.instructions || '';

    const isTraceMatch = traceAnimation && (() => {
        if (entrypointContext) {
            const traceService = traceAnimation.entrypointServiceName ?? '';
            const traceFunction = traceAnimation.entrypointFunctionName ?? '';
            const ctxService = entrypointContext.serviceName ?? '';
            const ctxFunction = entrypointContext.functionName ?? '';
            if (traceService !== ctxService || traceFunction !== ctxFunction) {
                return false;
            }
        }

        const sysInstr = traceAnimation.systemInstructions;
        if (sysInstr) {
            const extractedRole = sysInstr.match(/(?:^|\n)#\s*Role[ \t]*\r?\n([\s\S]*?)(?=\r?\n#\s*Instructions|$)/i)?.[1]?.trim();
            const extractedInstructions = sysInstr.match(/(?:^|\n)#\s*Instructions[ \t]*\r?\n([\s\S]*?)(?=\r?\n#\s*Instructions for Tool Validation Failure Handling|$)/i)?.[1]?.trim();

            const roleMatch = nodeRole != null && extractedRole === nodeRole.trim();
            const cleanedInstructions = extractedInstructions
                ?.replace(/\n#\s*Instructions for Tool Validation Failure Handling[^\n]*\n[\s\S]*$/, '')
                ?.trim();
            const instrMatch = nodeInstructions != null && cleanedInstructions === nodeInstructions.trim();

            if (nodeRole != null && nodeInstructions != null) {
                return roleMatch && instrMatch;
            }
        }
        const hasToolOverlap =
            traceAnimation.activeAgentToolNames.some(t => nodeToolNames.includes(t)) ||
            traceAnimation.entries.some(e =>
                e.type === 'execute_tool' && e.toolName && nodeToolNames.includes(e.toolName)
            );
        if (hasToolOverlap) return true;
        return false;
    })();
    const matchedEntries = isTraceMatch ? traceAnimation.entries : [];

    const chatEntry = matchedEntries.find(e => e.type === 'chat');
    const toolEntries = matchedEntries.filter(e => e.type === 'execute_tool');

    const activeToolNames = toolEntries.filter(e => e.phase === 'active').map(e => e.toolName);
    const isAnyToolActive = activeToolNames.length > 0;

    const isModelActive = chatEntry?.phase === 'active' && !isAnyToolActive;

    const isAgentNodeActive = isModelActive || isAnyToolActive;

    let containerHeight =
        NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + AGENT_NODE_ADD_TOOL_BUTTON_WIDTH + AGENT_NODE_TOOL_GAP * 2;
    if (tools.length > 0) {
        containerHeight += tools.length * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
    }

    return (
        <NodeStyles.Node data-testid="agent-node" readOnly={readOnly}>
            <NodeStyles.Box
                disabled={disabled}
                hovered={isBoxHovered}
                hasError={hasError}
                readOnly={readOnly}
                isActiveBreakpoint={isActiveBreakpoint}
                isSelected={isSelected}
                onMouseEnter={() => setIsBoxHovered(true)}
                onMouseLeave={() => setIsBoxHovered(false)}
                onClick={!readOnly ? handleOnClick : undefined}
                onContextMenu={!readOnly ? handleOnContextMenu : undefined}
                title="Configure Agent"
            >
                {/* Overlay for Agent Box pulsing transition */}
                <div
                    css={css`
                        position: absolute;
                        top: -1px; left: -1px; right: -1px; bottom: -1px;
                        border-radius: 10px;
                        border: 2px solid ${aiColor};
                        opacity: ${isAgentNodeActive ? 1 : 0};
                        transition: opacity 0.4s ease-out;
                        animation: ${boxSyncPulseAnimation} 1.5s ease-in-out infinite alternate;
                        pointer-events: none;
                        z-index: 1;
                    `}
                />

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
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", lineHeight: 1, maxWidth: `${NODE_WIDTH - 80}px` }}>
                                    <NodeStyles.Title>{nodeTitle}</NodeStyles.Title>
                                    {model.node.properties?.credential?.value && (
                                        <NodeStyles.AgentIdBadge
                                            title=""
                                            onMouseEnter={() => setAgentIdHovered(true)}
                                            onMouseLeave={() => setAgentIdHovered(false)}
                                        >
                                            <Icon name="workspace-trusted" isCodicon={true} iconSx={{ fontSize: "14px" }} sx={{ color: "#0e8a6e" }} />
                                            {agentIdHovered && (
                                                <NodeStyles.AgentIdTooltip>
                                                    Agent ID Enabled
                                                </NodeStyles.AgentIdTooltip>
                                            )}
                                        </NodeStyles.AgentIdBadge>
                                    )}
                                </div>
                                <NodeStyles.Description>
                                    {model.node.properties.variable?.value as ReactNode}
                                </NodeStyles.Description>
                            </NodeStyles.Header>
                            <NodeStyles.ActionButtonGroup>
                                {hasError && <DiagnosticsPopUp node={model.node} />}
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
                        <Popover
                            open={isMenuOpen}
                            anchorEl={anchorEl}
                            handleClose={handleOnMenuClose}
                            sx={{
                                padding: 0,
                                borderRadius: 0,
                            }}
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
                        </Popover>
                    </NodeStyles.Row>

                    <NodeStyles.MemoryContainer>
                        <NodeStyles.Row readOnly={readOnly}>
                            {nodeMetadata?.memory ? (
                                <NodeStyles.MemoryCard
                                    readOnly={readOnly}
                                    onClick={onMemoryManagerClick}
                                    title="Configure Memory"
                                    onContextMenu={!readOnly ? handleMemoryContextMenu : undefined}
                                >
                                    <NodeStyles.Row readOnly={readOnly}>
                                        <div style={{ flex: 1 }}>
                                            <NodeStyles.MemoryTitle>Memory</NodeStyles.MemoryTitle>
                                            <NodeStyles.MemoryMeta>
                                                {(nodeMetadata?.memory?.type || "MessageWindowChatMemory").replace(/^ai:/, "")}
                                            </NodeStyles.MemoryMeta>
                                        </div>
                                        <NodeStyles.MenuButton
                                            ref={setMemoryMenuButtonElement}
                                            buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                            appearance="icon"
                                            onClick={handleOnMemoryMenuClick}
                                        >
                                            <MoreVertIcon />
                                        </NodeStyles.MenuButton>
                                    </NodeStyles.Row>
                                </NodeStyles.MemoryCard>
                            ) : (
                                <NodeStyles.MemoryButton readOnly={readOnly} onClick={onMemoryManagerClick} title="Add Memory">
                                    <Icon name="bi-plus" sx={{ fontSize: "16px", marginRight: "4px" }} />
                                    Add Memory
                                </NodeStyles.MemoryButton>
                            )}
                        </NodeStyles.Row>
                        <Popover
                            open={isMemoryMenuOpen}
                            anchorEl={memoryMenuAnchorEl}
                            handleClose={handleMemoryMenuClose}
                            sx={{
                                padding: 0,
                                borderRadius: 0,
                            }}
                        >
                            <Menu>
                                <>
                                    {memoryMenuItems.map((item) => (
                                        <MenuItem key={item.id} item={item} />
                                    ))}
                                </>
                            </Menu>
                        </Popover>
                    </NodeStyles.MemoryContainer>

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
            </NodeStyles.Box>

            <svg
                width={NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + 10}
                height={model.node.viewState?.ch}
                viewBox={`0 0 300 ${containerHeight}`}
                style={{ marginLeft: "-10px", position: "relative", zIndex: 1 }}
            >
                {/* ai agent model circle */}
                <g>
                    <circle
                        cx="80"
                        cy="24"
                        r="22"
                        fill={ThemeColors.SURFACE_DIM}
                        stroke={ThemeColors.OUTLINE_VARIANT}
                        strokeWidth={1.5}
                        strokeDasharray={disabled ? "5 5" : "none"}
                        opacity={disabled ? 0.7 : 1}
                        onClick={onModelEditClick}
                        css={css`
                            cursor: ${readOnly ? "default" : "pointer"};
                            transition: stroke 0.4s ease-out;
                            &:hover {
                                stroke: ${readOnly ? ThemeColors.OUTLINE_VARIANT : ThemeColors.SECONDARY};
                            }
                        `}
                    >
                        <title>{"Configure Model Provider"}</title>
                    </circle>
                    <circle
                        cx="80"
                        cy="24"
                        r="22"
                        fill="none"
                        stroke={aiColor}
                        strokeWidth={2.5}
                        css={css`
                            pointer-events: none;
                            opacity: ${isModelActive ? 1 : 0};
                            transition: opacity 0.4s ease-out;
                            transform-origin: 80px 24px;
                            transform: scale(1.03);
                            animation: ${syncPulseAnimation} 1.5s ease-in-out infinite alternate;
                        `}
                    />

                    <foreignObject
                        x="68"
                        y="12"
                        width="44"
                        height="44"
                        fill={ThemeColors.ON_SURFACE}
                        style={{ pointerEvents: "none" }}
                    >
                        {model.node.properties?.model?.value === "check ai:getDefaultModelProvider()"
                            ? <Icon name="bi-wso2" sx={{ fontSize: 24, width: 24, height: 24 }} />
                            : getAIModuleIcon(nodeMetadata?.model?.type) ?? (nodeModelIconUrl ? <img src={nodeModelIconUrl} style={{ width: 24, height: 24 }} /> : <DefaultLlmIcon />)}
                    </foreignObject>

                    {/* Base Line */}
                    <line
                        x1="0"
                        y1="25"
                        x2="57"
                        y2="25"
                        style={{
                            stroke: ThemeColors.ON_SURFACE,
                            strokeWidth: 1.5,
                            markerEnd: `url(#${model.node.id}-arrow-head)`,
                            markerStart: `url(#${model.node.id}-diamond-start)`,
                            opacity: isModelActive ? 0 : 1,
                            transition: "stroke 0.4s ease-out, opacity 0.4s ease-out",
                        }}
                    />
                    {/* Pulsing Overlay Line */}
                    <line
                        x1="0"
                        y1="25"
                        x2="57"
                        y2="25"
                        style={{
                            stroke: aiColor,
                            strokeWidth: 2.5,
                            markerEnd: `url(#${model.node.id}-arrow-head-active)`,
                            strokeDasharray: "6 6",
                        }}
                        css={css`
                            pointer-events: none;
                            opacity: ${isModelActive ? 1 : 0};
                            transition: opacity 0.4s ease-out;
                            animation: ${flowDashAnimation} 1s linear infinite;
                        `}
                    />
                </g>

                {/* circles for tools */}
                {tools.map((tool: ToolData, index: number) => {
                    const isToolActive = activeToolNames.includes(tool.name);
                    return (
                        <g
                            key={index}
                            transform={`translate(0, ${(index + 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + AGENT_NODE_TOOL_SECTION_GAP
                                })`}
                            onClick={() => tool.type == "MCP Server" ? onToolClick(tool) : onImplementTool(tool)}
                            onContextMenu={(e) => {
                                if (!readOnly) {
                                    e.preventDefault();
                                    handleToolMenuClick(e as any, tool);
                                }
                            }}
                            css={css`
                            cursor: ${readOnly ? "default" : "pointer"};
                            &:hover circle:first-of-type {
                                stroke: ${ThemeColors.SECONDARY};
                            }
                            &:hover foreignObject .connector-icon path {
                                fill: ${ThemeColors.SECONDARY};
                            }
                            &:hover text {
                                fill: ${ThemeColors.SECONDARY};
                            }
                            &:hover .tool-tooltip {
                                opacity: 1;
                                visibility: visible;
                            }
                            &:hover .tool-menu-button {
                                opacity: 1;
                                visibility: visible;
                            }
                        `}
                        >
                            {/* Base Tool Circle */}
                            <circle
                                cx="80"
                                cy="24"
                                r="22"
                                fill={ThemeColors.SURFACE_DIM}
                                stroke={ThemeColors.OUTLINE_VARIANT}
                                strokeWidth={1.5}
                                strokeDasharray={disabled ? "5 5" : "none"}
                                opacity={disabled ? 0.7 : 1}
                                css={css`
                                    transition: stroke 0.4s ease-out;
                                `}
                            />
                            {/* Pulsing Overlay Tool Circle */}
                            <circle
                                cx="80"
                                cy="24"
                                r="22"
                                fill="none"
                                stroke={aiColor}
                                strokeWidth={2.5}
                                css={css`
                                    pointer-events: none;
                                    opacity: ${isToolActive ? 1 : 0};
                                    transition: opacity 0.4s ease-out;
                                    transform-origin: 80px 24px;
                                    transform: scale(1.03);
                                    animation: ${syncPulseAnimation} 1.5s ease-in-out infinite alternate;
                                `}
                            />

                            <foreignObject
                                x="68"
                                y="12"
                                width="44"
                                height="44"
                                fill={ThemeColors.ON_SURFACE}
                                style={{ pointerEvents: "none" }}
                            >
                                <div className="connector-icon">
                                    {tool.type === "Agent" ? (
                                        <Icon name="bi-ai-agent" sx={{ fontSize: "24px" }} />
                                    ) : tool.path ? (
                                        <ConnectorIcon
                                            url={tool.path}
                                            style={{ width: 24, height: 24, fontSize: 24 }}
                                            fallbackIcon={<Icon name="bi-function" sx={{ fontSize: "24px" }} />}
                                            codedata={model.node?.codedata}
                                        />
                                    ) : (
                                        <Icon name="bi-function" sx={{ fontSize: "24px" }} />
                                    )}
                                </div>
                            </foreignObject>

                            <text
                                x="110"
                                y="28"
                                textAnchor="start"
                                fill={isToolActive ? aiColor : ThemeColors.ON_SURFACE}
                                fontSize="14px"
                                fontFamily="GilmerRegular"
                                dominantBaseline="middle"
                                style={{ transition: "fill 0.4s ease-out" }}
                            >
                                {tool.name.length > 20 ? `${tool.name.slice(0, 20)}...` : tool.name}
                                <title>{tool.name}</title>
                            </text>

                            {/* Tool menu button */}
                            {!readOnly && (
                                <>
                                    {/* Transparent overlay for hover detection */}
                                    <foreignObject
                                        x="60"
                                        y="0"
                                        width="220"
                                        height="48"
                                        css={css`
                                        pointer-events: all;
                                        &:hover + .tool-menu-button {
                                            opacity: 1;
                                            visibility: visible;
                                        }
                                    `}
                                    >
                                        <div style={{ width: "100%", height: "100%" }} />
                                    </foreignObject>
                                    <foreignObject
                                        x={tool.name.length > 20 ? 240 : 110 + tool.name.length * 7}
                                        y="14"
                                        width="24"
                                        height="24"
                                        className="tool-menu-button"
                                        css={css`
                                        opacity: 0;
                                        visibility: hidden;
                                        transition: opacity 0.2s ease-in-out;
                                        pointer-events: all;
                                        &:hover {
                                            opacity: 1;
                                            visibility: visible;
                                        }
                                    `}
                                    >
                                        <NodeStyles.MenuButton
                                            appearance="icon"
                                            onClick={(e) => handleToolMenuClick(e, tool)}
                                            css={css`
                                            padding: 2px;
                                            height: 24px;
                                            width: 24px;
                                            min-width: 24px;
                                        `}
                                        >
                                            <MoreVertIcon />
                                        </NodeStyles.MenuButton>
                                    </foreignObject>
                                </>
                            )}

                            {/* Base Tool Line */}
                            <line
                                x1="0"
                                y1="25"
                                x2="57"
                                y2="25"
                                style={{
                                    stroke: ThemeColors.ON_SURFACE,
                                    strokeWidth: 1.5,
                                    markerEnd: `url(#${model.node.id}-arrow-head-tool-${sanitizeId(tool.name)})`,
                                    strokeDasharray: "6 6",
                                    opacity: isToolActive ? 0 : 1,
                                    transition: "stroke 0.4s ease-out, opacity 0.4s ease-out",
                                }}
                            />
                            {/* Pulsing Overlay Tool Line */}
                            <line
                                x1="0"
                                y1="25"
                                x2="57"
                                y2="25"
                                style={{
                                    stroke: aiColor,
                                    strokeWidth: 2.5,
                                    markerEnd: `url(#${model.node.id}-arrow-head-tool-${sanitizeId(tool.name)}-active)`,
                                    strokeDasharray: "6 6",
                                }}
                                css={css`
                                    pointer-events: none;
                                    opacity: ${isToolActive ? 1 : 0};
                                    transition: opacity 0.4s ease-out;
                                    animation: ${flowDashAnimation} 1s linear infinite;
                                `}
                            />

                            {/* Tool tooltip */}
                            <foreignObject
                                x="110"
                                y="-10"
                                width="150"
                                height="30"
                                className="tool-tooltip"
                                style={{ pointerEvents: "none" }}
                            >
                                <div
                                    css={css`
                                    background-color: ${ThemeColors.SURFACE_BRIGHT};
                                    color: ${ThemeColors.ON_SURFACE};
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    font-size: 12px;
                                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                                    opacity: 0;
                                    visibility: hidden;
                                    transition: opacity 0.2s ease-in-out;
                                    pointer-events: none;
                                    white-space: nowrap;
                                    font-family: "GilmerRegular";
                                `}
                                >
                                    Click to view {tool.name}
                                </div>
                            </foreignObject>
                        </g>
                    );
                })}

                {/* Tool Menu Popover */}
                <Popover
                    open={isToolMenuOpen}
                    anchorEl={toolAnchorEl}
                    handleClose={handleToolMenuClose}
                    sx={{
                        padding: 0,
                        borderRadius: 0,
                    }}
                >
                    <Menu>
                        {selectedTool &&
                            toolMenuItems(selectedTool).map((item) => <MenuItem key={item.id} item={item} />)}
                    </Menu>
                </Popover>

                {/* Add "Add new tool" button below all tools — hidden in read-only mode */}
                {!readOnly && <g
                    transform={`translate(-11, ${tools.length > 0
                        ? (tools.length + 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + AGENT_NODE_TOOL_SECTION_GAP
                        : NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP
                        })`}
                    onClick={onAddToolClick}
                    style={{ cursor: "pointer" }}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        css={css`
                            cursor: ${readOnly ? "not-allowed" : "pointer"};
                            &:hover path:last-of-type {
                                fill: ${ThemeColors.SECONDARY};
                            }
                            &:hover + .custom-tooltip {
                                opacity: 1;
                                visibility: visible;
                            }
                        `}
                    >
                        <title>Add New Tool / MCP Server</title>
                        <path
                            fill={ThemeColors.SURFACE_BRIGHT}
                            d="M12 0C5 0 0 5 0 12s5 12 12 12 12-5 12-12S19 0 12 0z"
                        />
                        <path
                            fill={ThemeColors.ON_SURFACE}
                            d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8m4-9h-3V8a1 1 0 0 0-2 0v3H8a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0v-3h3a1 1 0 0 0 0-2"
                        />
                    </svg>

                    {/* Custom tooltip */}
                    <foreignObject x="25" y="-10" width="100" height="30" style={{ pointerEvents: "none" }}>
                        <div
                            className="custom-tooltip"
                            css={css`
                                background-color: ${ThemeColors.SURFACE_BRIGHT};
                                color: ${ThemeColors.ON_SURFACE};
                                padding: 4px 8px;
                                border-radius: 4px;
                                font-size: 12px;
                                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                                opacity: 0;
                                visibility: hidden;
                                transition: opacity 0.2s ease-in-out;
                                pointer-events: none;
                                white-space: nowrap;
                                font-family: "GilmerRegular";
                            `}
                        >
                            Add New Tool / MCP Server
                        </div>
                    </foreignObject>
                </g>}

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
                        <polygon points="0,4 0,0 4,2" fill={ThemeColors.ON_SURFACE}></polygon>
                    </marker>

                    <marker
                        id={`${model.node.id}-arrow-head-active`}
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        viewBox="0 0 4 4"
                        orient="auto"
                    >
                        <polygon points="0,4 0,0 4,2" fill={aiColor}></polygon>
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
                            fill={ThemeColors.SURFACE_DIM}
                            stroke={ThemeColors.ON_SURFACE}
                            strokeWidth="1"
                        />
                    </marker>
                    {tools.map((tool: ToolData) => (
                        <React.Fragment key={tool.name}>
                            <marker
                                id={`${model.node.id}-arrow-head-tool-${sanitizeId(tool.name)}`}
                                markerWidth="4"
                                markerHeight="4"
                                refX="3"
                                refY="2"
                                viewBox="0 0 4 4"
                                orient="auto"
                            >
                                <polygon points="0,4 0,0 4,2" fill={ThemeColors.ON_SURFACE}></polygon>
                            </marker>

                            <marker
                                id={`${model.node.id}-arrow-head-tool-${sanitizeId(tool.name)}-active`}
                                markerWidth="4"
                                markerHeight="4"
                                refX="3"
                                refY="2"
                                viewBox="0 0 4 4"
                                orient="auto"
                            >
                                <polygon points="0,4 0,0 4,2" fill={aiColor}></polygon>
                            </marker>
                        </React.Fragment>
                    ))}
                </defs>
            </svg>
            <ThemeListener onThemeChange={handleThemeChange} />
        </NodeStyles.Node>
    );
}

function sanitizeId(name: string): string {
    return name.replace(/[^A-Za-z0-9_-]/g, "_");
}

function stripWrappingQuotes(str: string): string {
    if (str.startsWith('string `') && str.endsWith('`')) {
        return str.slice('string `'.length, -1);
    }
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
