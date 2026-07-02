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

import React, { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { ApiCallNodeModel } from "./ApiCallNodeModel";
import {
    DRAFT_NODE_BORDER_WIDTH,
    LABEL_HEIGHT,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_ERROR_COLOR,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Item, Menu, MenuItem, ThemeColors } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources";
import { FlowNode } from "../../../utils/types";
import NodeIcon from "../../NodeIcon";
import ConnectorIcon from "../../ConnectorIcon";
import { useDiagramContext } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { getNodeTitle, nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeMetadata } from "@wso2/ballerina-core";

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
        display: flex;
        flex-direction: column;
        justify-content: space-between;
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
                    ? ThemeColors.SECONDARY
                    : props.hovered && !props.disabled && !props.readOnly
                        ? ThemeColors.SECONDARY
                        : ThemeColors.OUTLINE_VARIANT};
        border-radius: 10px;
        background-color: ${(props: NodeStyleProp) =>
            props?.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        cursor: ${(props: NodeStyleProp) => (props.readOnly ? "default" : "pointer")};
    `;

    export const Header = styled.div<{}>`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 2px;
        flex: 1;
        min-width: 0;
        padding: 8px;
    `;

    export const StyledButton = styled(Button)`
        border-radius: 5px;
        position: absolute;
        right: 136px;
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -3px;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
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
        max-width: ${NODE_WIDTH - 80}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "GilmerMedium";
    `;

    export const Description = styled(StyledText)`
        font-size: 12px;
        width: 100%;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        word-break: break-all;
        color: ${NODE_TEXT_COLOR};
        opacity: 0.7;
    `;

    export const Row = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
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

    export const Hr = styled.hr`
        width: 100%;
    `;

    export const Footer = styled(StyledText)`
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    export type PillStyleProp = {
        color: string;
    };
    export const Pill = styled.div<PillStyleProp>`
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        color: ${(props: PillStyleProp) => props.color};
        padding: 2px 4px;
        border-radius: 20px;
        border: 1px solid ${(props: PillStyleProp) => props.color};
        font-size: 12px;
        font-family: monospace;
        svg {
            fill: ${(props: PillStyleProp) => props.color};
            stroke: ${(props: PillStyleProp) => props.color};
            height: 12px;
            width: 12px;
        }
    `;
}

interface ApiCallNodeWidgetProps {
    model: ApiCallNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<ApiCallNodeWidgetProps, "children"> {}

export function ApiCallNodeWidget(props: ApiCallNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, onConnectionSelect, goToSource, onDeleteNode, removeBreakpoint, addBreakpoint, readOnly, selectedNodeId } =
        useDiagramContext();

    const isSelected = selectedNodeId === model.node.id;

    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [isCircleHovered, setIsCircleHovered] = useState(false);
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
    // show dash line if the node is a class call
    const isClassCall = model.node.codedata.node === "KNOWLEDGE_BASE_CALL";
    const connectionProperty = model.node.properties?.connection;
    const processFunctionProperty = (model.node.properties as any)?.processFunction;
    const connectionValue = connectionProperty?.value as string | undefined;
    const fallbackEndpointValue = processFunctionProperty?.value as string | undefined;
    const endpointLabel = connectionValue ?? fallbackEndpointValue ?? "";
    const connectorType = (connectionProperty?.metadata?.data as NodeMetadata | undefined)?.connectorType;

    useEffect(() => {
        if (model.node.suggested) {
            model.setAroundLinksDisabled(model.node.suggested === true);
        }
    }, [model.node.suggested]);

    useEffect(() => {
        model.setSelected(isSelected);
    }, [isSelected]);

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
        setMenuPos(null);
    };

    const onConnectionClick = () => {
        if (readOnly) {
            return;
        }
        if (connectionValue && onConnectionSelect) {
            onConnectionSelect(connectionValue);
        } else {
            onNodeClick();
        }
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

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        const target = menuButtonElement || (event.currentTarget as HTMLElement);
        setMenuPos(getMenuPos(target));
    };

    const handleOnContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        const target = menuButtonElement || event.currentTarget;
        setMenuPos(getMenuPos(target as HTMLElement));
    };

    const handleOnMenuClose = () => {
        setMenuPos(null);
        setIsBoxHovered(false);
    };

    const onAddBreakpoint = () => {
        addBreakpoint && addBreakpoint(model.node);
        setMenuPos(null);
    };

    const onRemoveBreakpoint = () => {
        removeBreakpoint && removeBreakpoint(model.node);
        setMenuPos(null);
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
    const nodeTitle = getNodeTitle(model.node);
    const hasError = nodeHasError(model.node);

    const arrowColor =
        disabled || readOnly ? NODE_TEXT_COLOR : isBoxHovered ? NODE_BORDER_SELECTED_COLOR : NODE_TEXT_COLOR;

    return (
        <NodeStyles.Node readOnly={readOnly}>
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
                        style={{
                            position: "absolute",
                            left: -5,
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            backgroundColor: "red",
                        }}
                    />
                )}
                <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                <NodeStyles.Row>
                    <NodeStyles.Icon onClick={handleOnClick}>
                        <NodeIcon
                            type={model.node.codedata.node}
                            {...(["persist", "Database"].includes((model.node.properties?.connection?.metadata?.data as NodeMetadata)?.connectorType) && {
                                size: 24,
                                isDBConnection: true,
                            })}
                        />
                    </NodeStyles.Icon>
                    <NodeStyles.Row>
                        <NodeStyles.Header onClick={handleOnClick}>
                            <NodeStyles.Title>{nodeTitle}</NodeStyles.Title>
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
                    {/* <NodeStyles.StyledButton appearance="icon" onClick={handleOnMenuClick}>
                        <MoreVertIcon />
                    </NodeStyles.StyledButton> */}
                    {isMenuOpen && menuPos && createPortal(
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
                    )}
                </NodeStyles.Row>
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.Box>

            <svg
                width={NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT}
                height={NODE_HEIGHT + LABEL_HEIGHT}
                viewBox="0 0 130 70"
                onClick={onConnectionClick}
                onMouseEnter={() => !readOnly && setIsCircleHovered(true)}
                onMouseLeave={() => setIsCircleHovered(false)}
            >
                <circle
                    cx="80"
                    cy="24"
                    r="22"
                    fill={NODE_BG_COLOR}
                    stroke={isCircleHovered && !disabled ? NODE_BORDER_SELECTED_COLOR : NODE_BORDER_COLOR}
                    strokeWidth={1.5}
                    strokeDasharray={disabled ? "5 5" : "none"}
                    opacity={disabled ? 0.7 : 1}
                    style={{
                        filter: isCircleHovered && !disabled ? `drop-shadow(0 0 4px ${NODE_BORDER_SELECTED_COLOR})` : 'none',
                        transition: 'filter 0.1s ease',
                    }}
                />
                <text
                    x="80"
                    y="66"
                    textAnchor="middle"
                    fill={NODE_TEXT_COLOR}
                    fontSize="14px"
                    fontFamily="GilmerRegular"
                >
                    {endpointLabel.length > 16 ? `${endpointLabel.slice(0, 16)}...` : endpointLabel}
                </text>
                <foreignObject x="68" y="12" width="24" height="24" fill={NODE_TEXT_COLOR}>
                    <ConnectorIcon
                        url={model.node.metadata.icon}
                        style={{
                            width: 24,
                            height: 24,
                            fontSize: 24,
                            cursor: readOnly ? "default" : "pointer",
                            pointerEvents: readOnly ? "none" : "auto",
                        }}
                        codedata={model.node?.codedata}
                        connectorType={connectorType}
                    />
                </foreignObject>
                <line
                    x1="0"
                    y1="25"
                    x2="57"
                    y2="25"
                    style={{
                        stroke: arrowColor,
                        strokeWidth: 1.5,
                        strokeDasharray: isClassCall ? "5 5" : "none",
                        markerEnd: isClassCall ? "none" : `url(#${model.node.id}-arrow-head)`,
                    }}
                />
                <defs>
                    <marker
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        viewBox="0 0 4 4"
                        orient="auto"
                        id={`${model.node.id}-arrow-head`}
                    >
                        <polygon points="0,4 0,0 4,2" fill={arrowColor}></polygon>
                    </marker>
                </defs>
            </svg>
        </NodeStyles.Node>
    );
}
