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
import { Button, Icon, Item, Menu, MenuItem, Tooltip } from "@wso2/ui-toolkit";
import { FlowNode } from "../../../utils/types";
import { MoreVertIcon } from "../../../resources";
import { useDiagramContext } from "../../DiagramContext";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { WaitDataNodeModel } from "./WaitDataNodeModel";
import {
    HIGHLIGHT_NODE_BORDER_COLOR,
    HIGHLIGHT_NODE_BORDER_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_TEXT_COLOR,
    WAIT_DATA_ARROW_WIDTH,
    WAIT_DATA_CIRCLE_SIZE,
    WAIT_DATA_DETAILS_GAP,
    WAIT_DATA_DETAILS_WIDTH,
} from "../../../resources/constants";

const EXTERNAL_DOT_RADIUS = 4;
const EXTERNAL_DOT_STROKE = 2.5;

export namespace NodeStyles {
    export type NodeStyleProp = {
        hovered: boolean;
        hasError: boolean;
        readOnly: boolean;
        isSelected?: boolean;
        isActiveBreakpoint?: boolean;
    };

    export const Node = styled.div<{ readOnly: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: center;
        color: ${NODE_TEXT_COLOR};
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
    `;

    export const CircleColumn = styled.div`
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
        position: relative;
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -3px;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
    `;

    export const Circle = styled.div<NodeStyleProp>`
        display: flex;
        align-items: center;
        justify-content: center;
        width: ${WAIT_DATA_CIRCLE_SIZE}px;
        height: ${WAIT_DATA_CIRCLE_SIZE}px;
        border-radius: 50%;
        border: 2px solid
            ${(props: NodeStyleProp) =>
                props.hasError
                    ? NODE_BORDER_ERROR_COLOR
                    : props.isSelected && !props.readOnly
                    ? NODE_BORDER_SELECTED_COLOR
                    : props.hovered && !props.readOnly
                    ? NODE_BORDER_SELECTED_COLOR
                    : HIGHLIGHT_NODE_BORDER_COLOR};
        border-width: ${HIGHLIGHT_NODE_BORDER_WIDTH}px;
        background-color: ${(props: NodeStyleProp) =>
            props.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : NODE_BG_COLOR};
    `;

    export const Details = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 8px;
        max-width: ${WAIT_DATA_DETAILS_WIDTH}px;
        height: ${WAIT_DATA_CIRCLE_SIZE}px;
        margin-left: ${WAIT_DATA_DETAILS_GAP}px;
        min-width: 0;
    `;

    export const TextGroup = styled.div`
        min-width: 0;
        flex: 1;
        max-width: 140px;
    `;

    export const Title = styled.div`
        font-size: 14px;
        font-family: "GilmerMedium";
        line-height: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    export const Subtitle = styled.div`
        font-size: 12px;
        line-height: 14px;
        font-family: monospace;
        opacity: 0.7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    `;

    export const ActionButtonGroup = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
    `;

    export const MenuButton = styled(Button)`
        border-radius: 5px;
    `;
}

interface WaitDataNodeWidgetProps {
    model: WaitDataNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

function normalizeNodePropertyValue(value?: string): string {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().replace(/^["']|["']$/g, "");
}

function getWaitDataInfo(node: FlowNode): { title: string; subtitle: string } {
    // New format: dataWaits repeatable property
    const dataWaits = (node.properties as any)?.dataWaits?.value;
    if (dataWaits && typeof dataWaits === "object") {
        const entries = Object.values(dataWaits as Record<string, any>);
        const dataNames = entries
            .map((entry: any) => normalizeNodePropertyValue(entry?.value?.dataName?.value as string | undefined))
            .filter(Boolean) as string[];
        const varNames = entries
            .map((entry: any) => normalizeNodePropertyValue(entry?.value?.variable?.value as string | undefined))
            .filter(Boolean) as string[];
        if (dataNames.length > 0) {
            return {
                title: `Wait for ${dataNames.join(" & ")}`,
                subtitle: varNames.join(", "),
            };
        }
    }

    // Fallback: direct dataName property (old format)
    const directDataName = normalizeNodePropertyValue((node.properties as any)?.dataName?.value as string | undefined);
    if (directDataName) {
        return {
            title: `Wait for ${directDataName}`,
            subtitle: normalizeNodePropertyValue((node.properties as any)?.variable?.value as string | undefined),
        };
    }

    // Fallback: futures property (older format)
    const futuresValue = (node.properties as any)?.futures?.value;
    if (futuresValue && typeof futuresValue === "object") {
        const firstFuture = Object.values(futuresValue as Record<string, any>).find((f) => f?.value);
        const futureValue = normalizeNodePropertyValue(firstFuture?.value as string | undefined);
        if (futureValue) {
            return {
                title: `Wait for ${futureValue.split(".").pop()?.trim() ?? futureValue}`,
                subtitle: "",
            };
        }
    }

    return { title: node.metadata.label || "Wait Data", subtitle: "" };
}

export function WaitDataNodeWidget(props: WaitDataNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, removeBreakpoint, addBreakpoint, readOnly, selectedNodeId } =
        useDiagramContext();

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

    const isSelected = selectedNodeId === model.node.id;
    const hasBreakpoint = model.hasBreakpoint();
    const isActiveBreakpoint = model.isActiveBreakpoint();
    const hasError = nodeHasError(model.node);
    const { title: nodeTitle, subtitle: nodeSubtitle } = getWaitDataInfo(model.node);

    // Compute layout positions for the external arrow SVG
    const circleRadius = WAIT_DATA_CIRCLE_SIZE / 2;
    const svgWidth = model.node.viewState?.lw ? model.node.viewState.lw - circleRadius : WAIT_DATA_ARROW_WIDTH;
    const svgHeight = WAIT_DATA_CIRCLE_SIZE;
    const svgMidY = svgHeight / 2;
    const dotCx = EXTERNAL_DOT_RADIUS + EXTERNAL_DOT_STROKE;
    const lineX1 = dotCx + EXTERNAL_DOT_RADIUS + 4;
    const arrowColor = isHovered && !readOnly ? NODE_BORDER_SELECTED_COLOR : NODE_TEXT_COLOR;

    const selectNode = () => {
        onClick && onClick(model.node);
        onNodeSelect && onNodeSelect(model.node);
        setMenuPos(null);
    };

    const handleOnClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly) {
            return;
        }
        if (event.metaKey) {
            goToSource && goToSource(model.node);
            return;
        }
        selectNode();
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

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        event.stopPropagation();
        if (readOnly) {
            return;
        }
        const target = menuButtonElement || (event.currentTarget as HTMLElement);
        setMenuPos(getMenuPos(target));
    };

    const handleOnContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (readOnly) {
            return;
        }
        const target = menuButtonElement || event.currentTarget;
        setMenuPos(getMenuPos(target as HTMLElement));
    };

    const handleOnMenuClose = () => {
        setMenuPos(null);
        setIsHovered(false);
    };

    const menuItems: Item[] = [
        {
            id: "edit",
            label: "Edit",
            onClick: () => selectNode(),
        },
        {
            id: "goToSource",
            label: "Source",
            onClick: () => {
                goToSource && goToSource(model.node);
                setMenuPos(null);
            },
        },
        { id: "delete", label: "Delete", onClick: () => deleteNode() },
    ];

    return (
        <NodeStyles.Node
            readOnly={readOnly}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onContextMenu={!readOnly ? handleOnContextMenu : undefined}
        >
            {/* Left: External input dot + dashed arrow (SVG) */}
            <svg
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ flexShrink: 0 }}
            >
                <circle
                    cx={dotCx}
                    cy={svgMidY}
                    r={EXTERNAL_DOT_RADIUS}
                    fill="none"
                    stroke={arrowColor}
                    strokeWidth={EXTERNAL_DOT_STROKE}
                />
                <line
                    x1={lineX1}
                    y1={svgMidY}
                    x2={svgWidth}
                    y2={svgMidY}
                    stroke={arrowColor}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    markerEnd={`url(#${model.node.id}-wait-arrow)`}
                />
                <defs>
                    <marker
                        id={`${model.node.id}-wait-arrow`}
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        viewBox="0 0 4 4"
                        orient="auto"
                    >
                        <polygon points="0,4 0,0 4,2" fill={arrowColor} />
                    </marker>
                </defs>
            </svg>

            {/* Center: Circle with ports above and below */}
            <NodeStyles.CircleColumn>
                <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                {hasBreakpoint && (
                    <div
                        style={{
                            position: "absolute",
                            left: -10,
                            top: 0,
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: "red",
                        }}
                    />
                )}
                <Tooltip content={nodeTitle}>
                    <NodeStyles.Circle
                        hovered={isHovered}
                        hasError={hasError}
                        readOnly={readOnly}
                        isSelected={isSelected}
                        isActiveBreakpoint={isActiveBreakpoint}
                        onClick={handleOnClick}
                    >
                        <Icon name="bi-wait" sx={{ fontSize: 32, width: 32, height: 32, color: NODE_TEXT_COLOR }} />
                    </NodeStyles.Circle>
                </Tooltip>
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.CircleColumn>

            {/* Right: Title, subtitle, and action buttons */}
            <NodeStyles.Details onClick={handleOnClick}>
                <NodeStyles.TextGroup>
                    <NodeStyles.Title>{nodeTitle}</NodeStyles.Title>
                    <NodeStyles.Subtitle>{nodeSubtitle}</NodeStyles.Subtitle>
                </NodeStyles.TextGroup>
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
            </NodeStyles.Details>

            {/* Context menu */}
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
        </NodeStyles.Node>
    );
}
