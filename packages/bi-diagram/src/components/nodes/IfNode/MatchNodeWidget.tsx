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
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { IfNodeModel } from "./IfNodeModel";
import {
    IF_NODE_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BG_HOVER_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_HEIGHT,
} from "../../../resources/constants";
import { Item, Menu, MenuItem, ThemeColors } from "@wso2/ui-toolkit";
import { FlowNode } from "../../../utils/types";
import { useDiagramContext } from "../../DiagramContext";
import { MoreVertIcon } from "../../../resources";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { getDiffColors, getDiffStrokeDasharray, getDiffTitleStyles, nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeStyles } from "./IfNodeWidget";
import NodeIcon from "../../NodeIcon";

interface MatchNodeWidgetProps {
    model: IfNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<MatchNodeWidgetProps, "children"> {}

export function MatchNodeWidget(props: MatchNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, addBreakpoint, removeBreakpoint, readOnly, selectedNodeId } = useDiagramContext();

    const isSelected = selectedNodeId === model.node.id;

    const [isHovered, setIsHovered] = useState(false);
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
        } else {
            onNodeClick();
        }
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
        setIsHovered(false);
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
    const hasError = nodeHasError(model.node);
    const diffColors = getDiffColors(model.node);
    const condition = (
        model.node.properties.condition?.value ||
        model.node.properties.matchTarget?.value ||
        ""
    ).toString();

    return (
        <NodeStyles.Node
            disabled={disabled}
            hovered={isHovered}
            readOnly={readOnly}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onContextMenu={!readOnly ? handleOnContextMenu : undefined}
        >
            <NodeStyles.Row>
                <NodeStyles.Column onClick={handleOnClick}>
                    {hasBreakpoint && (
                        <div
                            style={{
                                position: "absolute",
                                left: -5,
                                width: 15,
                                height: 15,
                                top: 22,
                                borderRadius: "50%",
                                backgroundColor: "red",
                            }}
                        />
                    )}
                    <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                    <svg
                        width={IF_NODE_WIDTH}
                        height={IF_NODE_WIDTH}
                        viewBox="0 0 70 70"
                        style={{
                            filter: isHovered && !disabled && !readOnly ? `drop-shadow(0 0 3px ${NODE_BORDER_SELECTED_COLOR})` : 'none',
                            transition: 'filter 0.1s ease',
                        }}
                    >
                        <rect
                            x="12.5"
                            y="4"
                            width={NODE_HEIGHT}
                            height={NODE_HEIGHT}
                            rx="5"
                            ry="5"
                            fill={
                                diffColors
                                    ? diffColors.background
                                    : isActiveBreakpoint
                                    ? NODE_BG_BREAKPOINT_COLOR
                                    : isHovered && !disabled && !readOnly
                                    ? NODE_BG_HOVER_COLOR
                                    : NODE_BG_COLOR
                            }
                            stroke={
                                diffColors
                                    ? diffColors.border
                                    : hasError
                                    ? NODE_BORDER_ERROR_COLOR
                                    : isSelected && !disabled
                                        ? ThemeColors.SECONDARY
                                        : isHovered && !disabled && !readOnly
                                            ? ThemeColors.SECONDARY
                                            : ThemeColors.OUTLINE_VARIANT
                            }
                            strokeWidth={NODE_BORDER_WIDTH}
                            strokeDasharray={disabled ? "5 5" : getDiffStrokeDasharray(model.node)}
                            opacity={disabled ? 0.7 : 1}
                            transform="rotate(45 28 28)"
                        />
                        <foreignObject x="22" y="18" width="26" height="26" viewBox="0 0 16 16">
                            <NodeIcon type={model.node.codedata.node} size={24} />
                        </foreignObject>
                    </svg>
                    <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
                </NodeStyles.Column>
                <NodeStyles.Header onClick={handleOnClick}>
                    <NodeStyles.Title style={getDiffTitleStyles(model.node)}>{model.node.metadata.label || model.node.codedata.node}</NodeStyles.Title>
                    <NodeStyles.Description>{condition}</NodeStyles.Description>
                </NodeStyles.Header>
                {hasError && (
                    <NodeStyles.ErrorIcon>
                        <DiagnosticsPopUp node={model.node} engine={engine} />
                    </NodeStyles.ErrorIcon>
                )}
                <NodeStyles.StyledButton
                    ref={setMenuButtonElement}
                    buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                    appearance="icon"
                    onClick={handleOnMenuClick}
                >
                    <MoreVertIcon />
                </NodeStyles.StyledButton>
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
        </NodeStyles.Node>
    );
}
