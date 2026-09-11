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
import React, { useState } from "react";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { AgentCallNodeModel } from "./AgentCallNodeModel";
import {
    AGENT_NODE_USAGE_GAP,
    DRAFT_NODE_BORDER_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BG_COLOR,
    NODE_BG_HOVER_COLOR,
    NODE_HOVER_GLOW,
    NODE_BORDER_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Icon, Item, Menu, MenuItem, Popover, ThemeColors } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources/icons";
import { FlowNode, ToolData } from "../../../utils/types";
import NodeIcon, { ThemeListener } from "../../NodeIcon";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { getDiffContainerStyles, getDiffTitleStyles, getResultVariableName, nodeHasError } from "../../../utils/node";
import { css } from "@emotion/react";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeMetadata } from "@wso2/ballerina-core";
import { sanitizeAgentData, toolEntryMatchesTools } from "../agentNodeUtils";
import { useAgentNodeController } from "../AgentWidget/useAgentNodeController";
import { AgentReferenceRow } from "../AgentWidget/AgentReferenceRow";

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
        gap: ${AGENT_NODE_USAGE_GAP}px;
        width: 100%;
        padding-bottom: 12px;
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

interface AgentCallNodeWidgetProps {
    model: AgentCallNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export function AgentCallNodeWidget(props: AgentCallNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const controller = useAgentNodeController(model);
    const { onNodeSelect, goToSource, goToAgent, onDeleteNode, removeBreakpoint, addBreakpoint, agentNode, readOnly,
        entrypointContext } = controller.context;
    const { traceAnimation, isSelected, isBoxHovered, setIsBoxHovered, agentIdHovered, setAgentIdHovered, anchorEl,
        setAnchorEl, menuButtonElement, setMenuButtonElement, isMenuOpen, aiColor,
        boxSyncPulseAnimation, hasBreakpoint, isActiveBreakpoint, handleThemeChange } = controller;

    const agentVarName = typeof model.node.properties?.connection?.value === "string"
        ? (model.node.properties.connection.value as string).trim() : "";
    const canViewAgent = Boolean(goToAgent) && agentVarName.length > 0;
    const [isOpenAgentHovered, setIsOpenAgentHovered] = useState(false);

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

    const handleOpenAgent = (event: React.SyntheticEvent) => {
        event.stopPropagation();
        goToAgent?.(model.node);
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

    const onChatWithAgent = () => {
        agentNode?.onChatWithAgent?.(model.node);
        setAnchorEl(null);
    };

    const onViewAgent = () => {
        goToAgent?.(model.node);
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
        ...(canViewAgent ? [{
            id: "viewAgent",
            label: "Open Agent",
            onClick: () => onViewAgent(),
        }] : []),
    ];

    const disabled = model.node.suggested;
    const hasError = nodeHasError(model.node);
    const nodeMetadata = model?.node.metadata.data as NodeMetadata;
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
            traceAnimation.entries.some(e => e.type === 'execute_tool' && toolEntryMatchesTools(e, tools));
        if (hasToolOverlap) return true;
        // Nothing available → no match without explicit evidence
        return false;
    })();
    const chatEntry = isTraceMatch ? traceAnimation.entries.find(e => e.type === 'chat') : undefined;
    const toolEntries = (isTraceMatch ? traceAnimation.entries : [])
        .filter(e => e.type === 'execute_tool' && toolEntryMatchesTools(e, tools));
    const activeToolNames = toolEntries.filter(e => e.phase === 'active').map(e => e.toolName);
    const isAnyToolActive = activeToolNames.length > 0;

    // Model is active ONLY if it's chatting AND no tools are currently executing
    const isModelActive = chatEntry?.phase === 'active' && !isAnyToolActive;

    // Agent box pulses when either model or any tool is actively executing
    const isAgentNodeActive = isModelActive || isAnyToolActive;

    return (
        <NodeStyles.Node data-testid="agent-call-node" readOnly={readOnly}>
            <NodeStyles.Box
                disabled={disabled}
                hovered={isBoxHovered && !isOpenAgentHovered}
                hasError={hasError}
                readOnly={readOnly}
                isActiveBreakpoint={isActiveBreakpoint}
                isSelected={isSelected}
                style={getDiffContainerStyles(model.node)}
                onMouseEnter={() => setIsBoxHovered(true)}
                onMouseLeave={() => setIsBoxHovered(false)}
                onClick={!readOnly ? handleOnClick : undefined}
                onContextMenu={!readOnly ? handleOnContextMenu : undefined}
                title="Configure Run"
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
                <NodeStyles.Column>
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
                                    <NodeStyles.Title style={getDiffTitleStyles(model.node)}>agent : run</NodeStyles.Title>
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
                        {isMenuOpen && (
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
                        )}
                    </NodeStyles.Row>

                    <AgentReferenceRow
                        label={agentVarName}
                        clickable={canViewAgent}
                        onOpen={handleOpenAgent}
                        onButtonHoverChange={setIsOpenAgentHovered}
                    />
                </NodeStyles.Column>
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.Box>
            <ThemeListener onThemeChange={handleThemeChange} />
        </NodeStyles.Node>
    );
}
