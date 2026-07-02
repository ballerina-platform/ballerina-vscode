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

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { IfNodeModel } from "./IfNodeModel";
import {
    IF_NODE_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_HEIGHT,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Item, Menu, MenuItem, ThemeColors } from "@wso2/ui-toolkit";
import { FlowNode } from "../../../utils/types";
import { useDiagramContext } from "../../DiagramContext";
import { MoreVertIcon } from "../../../resources";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import NodeIcon from "../../NodeIcon";
import { NodeNoteChip } from "../../NodeNoteChip";

export namespace NodeStyles {
    export type NodeStyleProp = {
        disabled: boolean;
        hovered: boolean;
        readOnly: boolean;
    };
    export const Node = styled.div<NodeStyleProp>`
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        color: ${NODE_TEXT_COLOR};
        cursor: ${(props: NodeStyleProp) => (props.readOnly ? "default" : "pointer")};
    `;

    export const Header = styled.div<{}>`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        width: 100%;
        padding: 8px;
    `;

    export const StyledButton = styled(Button)`
        border-radius: 5px;
        position: absolute;
        top: -6px;
        left: 46px;
    `;

    export const NoteChipWrapper = styled.div`
        position: absolute;
        top: -14px;
        right: -50px;
    `;

    export const ErrorIcon = styled.div`
        position: absolute;
        bottom: -6px;
        left: 48px;
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
        max-width: ${NODE_WIDTH - 50}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "GilmerMedium";
        color: ${NODE_TEXT_COLOR};
    `;

    export const Description = styled(StyledText)`
        font-size: 12px;
        max-width: ${NODE_WIDTH - 50}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
        opacity: 0.7;
    `;

    export const Row = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    `;

    export const Column = styled.div`
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
    `;

    export const Hr = styled.hr`
        width: 100%;
    `;
}

interface IfNodeWidgetProps {
    model: IfNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<IfNodeWidgetProps, "children"> {}

export function IfNodeWidget(props: IfNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, addBreakpoint, removeBreakpoint, readOnly, selectedNodeId, nodeComments } =
        useDiagramContext();

    const noteComment = nodeComments?.get(model.node.id);

    const isSelected = selectedNodeId === model.node.id;

    const [isHovered, setIsHovered] = useState(false);
    const [isNoteActive, setIsNoteActive] = useState(false);
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

    return (
        <NodeStyles.Node
            disabled={disabled}
            hovered={isHovered}
            readOnly={readOnly}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsNoteActive(false); }}
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
                            filter: (isHovered || isNoteActive) && !disabled && !readOnly ? `drop-shadow(0 0 3px ${NODE_BORDER_SELECTED_COLOR})` : 'none',
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
                                isActiveBreakpoint
                                    ? NODE_BG_BREAKPOINT_COLOR
                                    : NODE_BG_COLOR
                            }
                            stroke={
                                hasError
                                    ? NODE_BORDER_ERROR_COLOR
                                    : isSelected && !disabled
                                        ? ThemeColors.SECONDARY
                                        : (isHovered || isNoteActive) && !disabled && !readOnly
                                            ? ThemeColors.SECONDARY
                                            : ThemeColors.OUTLINE_VARIANT
                            }
                            strokeWidth={NODE_BORDER_WIDTH}
                            strokeDasharray={disabled ? "5 5" : "none"}
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
                    <NodeStyles.Title>{model.node.metadata.label || model.node.codedata.node}</NodeStyles.Title>
                    {/* <NodeStyles.Description>
                        {model.node.branches.at(0).properties.condition.value}
                    </NodeStyles.Description> */}
                </NodeStyles.Header>
                {hasError && (
                    <NodeStyles.ErrorIcon>
                        <DiagnosticsPopUp node={model.node} engine={engine} />
                    </NodeStyles.ErrorIcon>
                )}
                {noteComment && (
                    <NodeStyles.NoteChipWrapper>
                        <NodeNoteChip commentNode={noteComment} engine={engine} onOpen={() => setIsNoteActive(true)} onClose={() => { setIsNoteActive(false); setIsHovered(false); }} />
                    </NodeStyles.NoteChipWrapper>
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
