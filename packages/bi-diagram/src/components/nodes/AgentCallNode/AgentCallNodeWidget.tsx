/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { AgentCallNodeModel } from "./AgentCallNodeModel";
import {
    AGENT_CALL_TOOL_SECTION_GAP,
    AGENT_NODE_TOOL_GAP,
    CANVAS_BG_COLOR,
    DRAFT_NODE_BORDER_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BORDER_ERROR_COLOR,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    LINK_COLOR,
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_ERROR_COLOR,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Icon, Item, Menu, MenuItem, Popover, ThemeColors, Tooltip, getAIModuleIcon, DefaultLlmIcon } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources/icons";
import { FlowNode, ToolData } from "../../../utils/types";
import NodeIcon, { CHART_COLORS, getAIColor, isDarkTheme, ThemeListener } from "../../NodeIcon";
import ConnectorIcon from "../../ConnectorIcon";
import { useDiagramContext, useTraceAnimation } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { css } from "@emotion/react";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeMetadata } from "@wso2/ballerina-core";
import ReactMarkdown from "react-markdown";

import { flowDashAnimation, getBoxSyncPulseAnimation, getSyncPulseAnimation, sanitizeAgentData, sanitizeId } from "../agentNodeUtils";

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
            props?.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
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

        p { display: inline; margin: 0; }
    `;

    export const Instructions = styled(MarkdownContent)`
        color: ${NODE_TEXT_COLOR};
        opacity: 0.7;
        overflow: hidden;
        height: 100%;
        max-height: calc(100% - 5px);
        padding: 0 4px 4px;
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
        color: ${NODE_ERROR_COLOR};
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
        border: 1px solid ${NODE_BORDER_COLOR};
        border-radius: 4px;
        background-color: transparent;
        color: ${NODE_TEXT_COLOR};
        font-size: 14px;
        font-family: "GilmerRegular";
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        &:hover {
            background-color: ${CANVAS_BG_COLOR};
            border-color: ${(props: { readOnly: boolean }) =>
            props.readOnly ? NODE_BORDER_COLOR : NODE_BORDER_SELECTED_COLOR};
        }
    `;

    export const MemoryCard = styled.div<{ readOnly: boolean }>`
        width: 100%;
        padding: 8px 6px 8px 12px;
        border: 1px solid ${NODE_BORDER_COLOR};
        border-radius: 4px;
        background-color: transparent;
        color: ${NODE_TEXT_COLOR};
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        &:hover {
            border-color: ${(props: { readOnly: boolean }) =>
            props.readOnly ? NODE_BORDER_COLOR : NODE_BORDER_SELECTED_COLOR};
        }
    `;

    export const MemoryContainer = styled.div`
        width: 100%;
        border-bottom: 1px dashed ${NODE_BORDER_COLOR};
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
        color: ${NODE_TEXT_COLOR};
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

const TitleArrow = styled.span`
    font-size: 11px;
    opacity: 0.6;
    margin: 0 4px;
    vertical-align: 1px;
`;

const AgentName = styled.div`
    flex: 1;
    min-width: 0;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
    font-family: monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const AgentRow = styled.div<{ clickable: boolean }>`
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px 0;
    padding: 6px 6px 6px 10px;
    border-radius: 6px;
    cursor: ${(props: { clickable: boolean }) => (props.clickable ? "pointer" : "default")};
    transition: background-color 0.15s ease;

    &::before {
        content: "";
        position: absolute;
        top: -8px;
        left: 0;
        right: 0;
        border-top: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    }

    &:hover {
        background-color: ${(props: { clickable: boolean }) => (props.clickable ? "rgba(0, 0, 0, 0.18)" : "transparent")};
    }

    &:hover [data-agent-name] {
        opacity: ${(props: { clickable: boolean }) => (props.clickable ? 1 : 0.7)};
    }
`;

export const ViewAgentButton = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE};
    color: ${ThemeColors.ON_SURFACE};
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    opacity: 0.8;
    transition: opacity 0.15s ease, background-color 0.15s ease;
    &:hover {
        opacity: 1;
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const AGENT_CALL_AGENT_ROW_HEIGHT = 38;

const NODE_TITLE = (
    <>
        AI Agent<TitleArrow>:</TitleArrow>Run
    </>
);

interface AgentCallNodeWidgetProps {
    model: AgentCallNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<AgentCallNodeWidgetProps, "children"> { }

export function AgentCallNodeWidget(props: AgentCallNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, goToAgent, onDeleteNode, removeBreakpoint, addBreakpoint, agentNode, readOnly, selectedNodeId, entrypointContext } = useDiagramContext();
    const traceAnimation = useTraceAnimation();

    const isSelected = selectedNodeId === model.node.id;

    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [toolMenuPos, setToolMenuPos] = useState<{ top: number; left: number } | null>(null);
    const [agentIdHovered, setAgentIdHovered] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    const isMenuOpen = Boolean(anchorEl);
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
            if (canViewAgent) {
                goToAgent?.(model.node);
            } else {
                onGoToSource();
            }
        } else {
            onNodeClick();
        }
    };

    const onNodeClick = () => {
        onClick && onClick(model.node);
        onNodeSelect && onNodeSelect(model.node);
        setAnchorEl(null);
    };

    const handleViewAgentClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        event.stopPropagation();
        if (!goToAgent) return;
        goToAgent(model.node);
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

    const onAddBreakpoint = () => {
        addBreakpoint && addBreakpoint(model.node);
        setAnchorEl(null);
    };

    const onRemoveBreakpoint = () => {
        removeBreakpoint && removeBreakpoint(model.node);
        setAnchorEl(null);
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

    const disabled = model.node.suggested;
    const hasError = nodeHasError(model.node);
    const nodeMetadata = model?.node.metadata.data as NodeMetadata;
    const agentVarName = typeof model.node.properties?.connection?.value === "string"
        ? (model.node.properties.connection.value as string).trim() : "";
    const canViewAgent = Boolean(goToAgent) && agentVarName.length > 0;
    const agentInfo = nodeMetadata?.agentInfo;
    const modelProvider = agentInfo?.modelProvider?.presentation;
    const nodeModelIconUrl = modelProvider?.path;
    const tools = agentInfo?.tools || [];

    const sanitizedAgent = agentInfo?.systemPrompt ? sanitizeAgentData(agentInfo.systemPrompt) : undefined;
    const nodeToolNames = tools.map((t: ToolData) => t.name).sort();
    const nodeRole = sanitizedAgent?.role || '';
    const nodeInstructions = sanitizedAgent?.instructions || '';

    const entrypointMatches = traceAnimation && (() => {
        if (entrypointContext) {
            const traceService = traceAnimation.entrypointServiceName ?? '';
            const traceFunction = traceAnimation.entrypointFunctionName ?? '';
            const ctxService = entrypointContext.serviceName ?? '';
            const ctxFunction = entrypointContext.functionName ?? '';
            if (traceService !== ctxService || traceFunction !== ctxFunction) {
                return false;
            }
        }
        return true;
    })();

    const isTraceMatch = entrypointMatches && (() => {
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
        // No system instructions → fall back to tool intersection
        const hasToolOverlap =
            traceAnimation.activeAgentToolNames.some(t => nodeToolNames.includes(t)) ||
            traceAnimation.entries.some(e =>
                e.type === 'execute_tool' && e.toolName && nodeToolNames.includes(e.toolName)
            );
        if (hasToolOverlap) return true;
        // Nothing available → no match without explicit evidence
        return false;
    })();
    const chatEntry = isTraceMatch ? traceAnimation.entries.find(e => e.type === 'chat') : undefined;
    const toolEntries = (entrypointMatches ? traceAnimation.entries : [])
        .filter(e => e.type === 'execute_tool' && e.toolName && nodeToolNames.includes(e.toolName));
    const activeToolNames = toolEntries.filter(e => e.phase === 'active').map(e => e.toolName);
    const isAnyToolActive = activeToolNames.length > 0;

    // Model is active ONLY if it's chatting AND no tools are currently executing
    const isModelActive = chatEntry?.phase === 'active' && !isAnyToolActive;

    // Agent box pulses when either model or any tool is actively executing
    const isAgentNodeActive = isModelActive || isAnyToolActive;

    let containerHeight = NODE_HEIGHT + AGENT_CALL_TOOL_SECTION_GAP + AGENT_NODE_TOOL_GAP * 2 + AGENT_CALL_AGENT_ROW_HEIGHT;
    if (tools.length > 0) {
        containerHeight += tools.length * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
    }

    return (
        <NodeStyles.Node data-testid="agent-call-node" readOnly={readOnly}>
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
                        <NodeStyles.IconBox onClick={handleOnClick}>
                            <NodeIcon type={model.node.codedata.node} size={24} />
                            <NodeStyles.RunBadge>
                                <Icon name="bi-play" iconSx={{ fontSize: "20px" }} sx={{ color: "var(--vscode-charts-green)", display: "flex", justifyContent: "center", alignItems: "center" }} />
                            </NodeStyles.RunBadge>
                        </NodeStyles.IconBox>
                        <NodeStyles.Row readOnly={readOnly}>
                            <NodeStyles.Header onClick={handleOnClick}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", lineHeight: 1, maxWidth: `${NODE_WIDTH - 80}px` }}>
                                    <NodeStyles.Title>{NODE_TITLE}</NodeStyles.Title>
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

                    <div style={{ width: "100%", opacity: 0.55, borderTop: `1px dashed ${ThemeColors.OUTLINE_VARIANT}`, flex: 1, overflow: "hidden", padding: "8px 2px" }}>
                        {sanitizedAgent?.role && sanitizedAgent?.instructions ? (
                            <>
                                <NodeStyles.Row readOnly={readOnly} onClick={handleOnClick} style={{ marginBottom: 6 }}>
                                    <NodeStyles.Role>
                                        <ReactMarkdown
                                            disallowedElements={['script', 'iframe', 'object', 'embed', 'link', 'style']}
                                            unwrapDisallowed={true}
                                        >
                                            {sanitizedAgent?.role}
                                        </ReactMarkdown>
                                    </NodeStyles.Role>
                                </NodeStyles.Row>

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
                            </>
                        ) : agentInfo?.description ? (
                            <NodeStyles.InstructionsRow readOnly={readOnly} onClick={handleOnClick}>
                                <NodeStyles.Instructions>
                                    <ReactMarkdown
                                        disallowedElements={['script', 'iframe', 'object', 'embed', 'link', 'style']}
                                        unwrapDisallowed={true}
                                    >
                                        {agentInfo.description}
                                    </ReactMarkdown>
                                </NodeStyles.Instructions>
                            </NodeStyles.InstructionsRow>
                        ) : null}
                    </div>

                    {agentVarName && (
                        <AgentRow
                            clickable={canViewAgent}
                            onClick={canViewAgent ? handleViewAgentClick : undefined}
                        >
                            <AgentName data-agent-name>{agentVarName}</AgentName>
                            {canViewAgent && (
                                <Tooltip content="View agent">
                                    <NodeStyles.MenuButton
                                        appearance="icon"
                                        onClick={handleViewAgentClick}
                                    >
                                        <Icon name="bi-function-flow" sx={{ width: 16, height: 16 }} iconSx={{ fontSize: 16 }} />
                                    </NodeStyles.MenuButton>
                                </Tooltip>
                            )}
                        </AgentRow>
                    )}
                </NodeStyles.Column>
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.Box>

            <svg
                width={NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + 10}
                height={model.node.viewState?.ch}
                viewBox={`0 0 300 ${containerHeight}`}
                style={{ marginLeft: "-10px", position: "relative", zIndex: 1, cursor: "default" }}
            >
                {/* ai agent model circle */}
                <g style={{ opacity: isModelActive ? 1 : 0.55, transition: "opacity 0.4s ease-out" }}>
                    <circle
                        cx="80"
                        cy="24"
                        r="22"
                        fill={NODE_BG_COLOR}
                        stroke={NODE_BORDER_COLOR}
                        strokeWidth={1.5}
                        strokeDasharray={disabled ? "5 5" : "none"}
                        opacity={disabled ? 0.7 : 1}
                        style={{ cursor: "default" }}
                    >
                        <title>{"Model Provider"}</title>
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
                        fill={NODE_TEXT_COLOR}
                        style={{ pointerEvents: "none" }}
                    >
                        {model.node.properties?.model?.value === "check ai:getDefaultModelProvider()"
                            || modelProvider?.name === "check ai:getDefaultModelProvider()"
                            ? <Icon name="bi-wso2" sx={{ fontSize: 24, width: 24, height: 24 }} />
                            : getAIModuleIcon(modelProvider?.type) ?? (nodeModelIconUrl ? <img src={nodeModelIconUrl} style={{ width: 24, height: 24 }} /> : <DefaultLlmIcon />)}
                    </foreignObject>

                    {/* Base Line */}
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
                            transform={`translate(0, ${(index + 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + AGENT_CALL_TOOL_SECTION_GAP + AGENT_CALL_AGENT_ROW_HEIGHT})`}
                            style={{ cursor: "default", opacity: isToolActive ? 1 : 0.55, transition: "opacity 0.4s ease-out" }}
                        >
                            {/* Base Tool Circle */}
                            <circle
                                cx="80"
                                cy="24"
                                r="22"
                                fill={NODE_BG_COLOR}
                                stroke={NODE_BORDER_COLOR}
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
                                fill={NODE_TEXT_COLOR}
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
                                fill={isToolActive ? aiColor : NODE_TEXT_COLOR}
                                fontSize="14px"
                                fontFamily="GilmerRegular"
                                dominantBaseline="middle"
                                style={{ transition: "fill 0.4s ease-out" }}
                            >
                                {tool.name.length > 20 ? `${tool.name.slice(0, 20)}...` : tool.name}
                                <title>{tool.name}</title>
                            </text>


                            {/* Base Tool Line */}
                            <line
                                x1="0"
                                y1="25"
                                x2="57"
                                y2="25"
                                style={{
                                    stroke: NODE_TEXT_COLOR,
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
                            fill={NODE_BG_COLOR}
                            stroke={NODE_TEXT_COLOR}
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
                                <polygon points="0,4 0,0 4,2" fill={NODE_TEXT_COLOR}></polygon>
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
