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
import { Button, Icon, Item, Menu, MenuItem } from "@wso2/ui-toolkit";
import { SendDataNodeModel } from "./SendDataNodeModel";
import { FlowNode } from "../../../utils/types";
import { MoreVertIcon } from "../../../resources";
import NodeIcon from "../../NodeIcon";
import { useDiagramContext } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { getDiffContainerStyles, getDiffTitleStyles, nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import {
    DRAFT_NODE_BORDER_WIDTH,
    HIGHLIGHT_NODE_BORDER_COLOR,
    HIGHLIGHT_NODE_BORDER_WIDTH,
    LABEL_HEIGHT,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BG_HOVER_COLOR,
    NODE_HOVER_GLOW,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";

const ENDPOINT_BOX_SIZE = 44;
const ENDPOINT_BOX_RADIUS = 12;

namespace NodeStyles {
    export const Node = styled.div<{ readOnly: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
    `;

    export type BoxStyleProp = {
        disabled: boolean;
        hovered: boolean;
        hasError: boolean;
        readOnly: boolean;
        isActiveBreakpoint: boolean;
        isSelected?: boolean;
    };

    export const Box = styled.div<BoxStyleProp>`
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        width: ${NODE_WIDTH}px;
        min-height: ${NODE_HEIGHT}px;
        padding: 0 ${NODE_PADDING}px;
        opacity: ${(props: BoxStyleProp) => (props.disabled ? 0.7 : 1)};
        border: ${(props: BoxStyleProp) =>
            props.disabled ? DRAFT_NODE_BORDER_WIDTH : HIGHLIGHT_NODE_BORDER_WIDTH}px;
        border-style: ${(props: BoxStyleProp) => (props.disabled ? "dashed" : "solid")};
        border-color: ${(props: BoxStyleProp) =>
            props.hasError
                ? NODE_BORDER_ERROR_COLOR
                : props.isSelected && !props.disabled
                    ? NODE_BORDER_SELECTED_COLOR
                    : props.hovered && !props.disabled && !props.readOnly
                        ? NODE_BORDER_SELECTED_COLOR
                        : HIGHLIGHT_NODE_BORDER_COLOR};
        border-radius: 10px;
        background-color: ${(props: BoxStyleProp) =>
            props.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : props.hovered && !props.disabled && !props.readOnly ? NODE_BG_HOVER_COLOR : NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        cursor: ${(props: BoxStyleProp) => (props.readOnly ? "default" : "pointer")};
        box-shadow: ${(props: BoxStyleProp) => props.hovered && !props.disabled && !props.readOnly ? NODE_HOVER_GLOW : 'none'};
        transition: box-shadow 0.1s ease, background-color 0.1s ease, border-color 0.1s ease;
    `;

    export const Header = styled.div`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 2px;
        flex: 1;
        min-width: 0;
        padding: 8px;
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

    export const NodeIconWrapper = styled.div`
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
}

interface SendDataNodeWidgetProps {
    model: SendDataNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

function normalizeNodePropertyValue(value?: string): string {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().replace(/^["']|["']$/g, "");
}

function getWorkflowName(value?: string): string {
    const normalizedValue = normalizeNodePropertyValue(value);
    if (!normalizedValue) {
        return "";
    }

    return normalizedValue.split(":").pop()?.split("(")[0]?.trim() ?? normalizedValue;
}

export function SendDataNodeWidget(props: SendDataNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const {
        onNodeSelect,
        onConnectionSelect,
        goToSource,
        onDeleteNode,
        removeBreakpoint,
        addBreakpoint,
        readOnly,
        selectedNodeId,
        openView,
        project,
    } = useDiagramContext();

    const isSelected = selectedNodeId === model.node.id;

    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [isWorkflowHovered, setIsWorkflowHovered] = useState(false);
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

    const dataNameProperty = (model.node.properties as any)?.dataName;
    const workflowProperty = (model.node.properties as any)?.workflow;
    const connectionProperty = model.node.properties?.connection;
    const processFunctionProperty = (model.node.properties as any)?.processFunction;
    const connectionValue = connectionProperty?.value as string | undefined;
    const fallbackWorkflowValue = processFunctionProperty?.value as string | undefined;
    const dataName = normalizeNodePropertyValue(dataNameProperty?.value as string | undefined);
    const workflowName = getWorkflowName(
        (workflowProperty?.value as string | undefined) ?? connectionValue ?? fallbackWorkflowValue
    );
    const nodeTitle = dataName ? `Send to ${dataName}` : "Send Data";
    const canViewWorkflow = Boolean(workflowName);

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

    const onWorkflowClick = async (event?: React.MouseEvent<SVGElement | HTMLDivElement>) => {
        event?.stopPropagation();
        if (readOnly) {
            return;
        }

        if (workflowName) {
            const functionLocation = await project?.getFunctionLocation?.(workflowName);
            if (functionLocation) {
                openView && openView(functionLocation);
                setMenuPos(null);
                return;
            }
        }

        onConnectionClick();
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
    const hasError = nodeHasError(model.node);

    const arrowColor =
        disabled || readOnly ? NODE_TEXT_COLOR : isBoxHovered ? NODE_BORDER_SELECTED_COLOR : NODE_TEXT_COLOR;
    const workflowColor =
        disabled || readOnly
            ? NODE_BORDER_COLOR
            : isSelected || isWorkflowHovered
            ? NODE_BORDER_SELECTED_COLOR
            : NODE_BORDER_COLOR;

    const svgWidth = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;
    const svgHeight = NODE_HEIGHT + LABEL_HEIGHT;
    const boxX = NODE_GAP_X - 2;
    const boxY = 2;
    const boxCenterY = boxY + ENDPOINT_BOX_SIZE / 2;
    const lineEndX = boxX - 6;

    return (
        <NodeStyles.Node readOnly={readOnly}>
            <NodeStyles.Box
                disabled={disabled}
                hovered={isBoxHovered}
                hasError={hasError}
                readOnly={readOnly}
                isActiveBreakpoint={isActiveBreakpoint}
                isSelected={isSelected}
                style={getDiffContainerStyles(model.node)}
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
                    <NodeStyles.NodeIconWrapper onClick={handleOnClick}>
                        <NodeIcon type={model.node.codedata.node} size={24} />
                    </NodeStyles.NodeIconWrapper>
                    <NodeStyles.Row>
                        <NodeStyles.Header onClick={handleOnClick}>
                            <NodeStyles.Title style={getDiffTitleStyles(model.node)}>{nodeTitle}</NodeStyles.Title>
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
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                onClick={onConnectionClick}
                style={{ cursor: readOnly ? "default" : "pointer" }}
            >
                <line
                    x1="0"
                    y1={boxCenterY}
                    x2={lineEndX}
                    y2={boxCenterY}
                    stroke={arrowColor}
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                />
                <rect
                    x={boxX}
                    y={boxY}
                    width={ENDPOINT_BOX_SIZE}
                    height={ENDPOINT_BOX_SIZE}
                    rx={ENDPOINT_BOX_RADIUS}
                    fill={NODE_BG_COLOR}
                    stroke={workflowColor}
                    strokeWidth={1.8}
                    onClick={onWorkflowClick}
                    onMouseEnter={() => !readOnly && setIsWorkflowHovered(true)}
                    onMouseLeave={() => setIsWorkflowHovered(false)}
                    style={{
                        cursor: readOnly || !canViewWorkflow ? "default" : "pointer",
                        filter: isWorkflowHovered && !disabled ? `drop-shadow(0 0 4px ${NODE_BORDER_SELECTED_COLOR})` : 'none',
                        transition: 'filter 0.1s ease',
                    }}
                />
                <foreignObject
                    x={boxX}
                    y={boxY}
                    width={ENDPOINT_BOX_SIZE}
                    height={ENDPOINT_BOX_SIZE}
                    onClick={onWorkflowClick}
                    onMouseEnter={() => !readOnly && setIsWorkflowHovered(true)}
                    onMouseLeave={() => setIsWorkflowHovered(false)}
                >
                    <div
                        style={{
                            width: `${ENDPOINT_BOX_SIZE}px`,
                            height: `${ENDPOINT_BOX_SIZE}px`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: readOnly || !canViewWorkflow ? "default" : "pointer",
                        }}
                    >
                        <Icon
                            name="bi-flowchart"
                            sx={{
                                width: 24,
                                height: 24,
                                fontSize: 24,
                            }}
                        />
                    </div>
                </foreignObject>
                <text
                    x={boxX + ENDPOINT_BOX_SIZE / 2}
                    y={svgHeight - 2}
                    textAnchor="middle"
                    fill={NODE_TEXT_COLOR}
                    fontSize="14px"
                    fontFamily="GilmerRegular"
                    onClick={onWorkflowClick}
                    onMouseEnter={() => !readOnly && setIsWorkflowHovered(true)}
                    onMouseLeave={() => setIsWorkflowHovered(false)}
                    style={{ cursor: readOnly || !canViewWorkflow ? "default" : "pointer" }}
                >
                    {workflowName.length > 16 ? `${workflowName.slice(0, 16)}...` : workflowName}
                </text>
            </svg>
        </NodeStyles.Node>
    );
}
