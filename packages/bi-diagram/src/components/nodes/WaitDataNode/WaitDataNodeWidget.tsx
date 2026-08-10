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
import {
    getAgentDataEventName,
    isReceiveEventNode,
    getDiffContainerStyles,
    getDiffTitleStyles,
    nodeHasError,
} from "../../../utils/node";
import { WaitDataNodeModel } from "./WaitDataNodeModel";
import {
    HIGHLIGHT_NODE_BORDER_COLOR,
    HIGHLIGHT_NODE_BORDER_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BG_HOVER_COLOR,
    NODE_HOVER_GLOW,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    LABEL_HEIGHT,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
    WAIT_DATA_ARROW_WIDTH,
    WAIT_DATA_CIRCLE_SIZE,
    WAIT_DATA_DETAILS_GAP,
    WAIT_DATA_DETAILS_WIDTH,
} from "../../../resources/constants";

const EXTERNAL_DOT_RADIUS = 4;
const SOURCE_BOX_SIZE = 44;
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
        justify-content: flex-start;
        gap: 8px;
        width: ${NODE_WIDTH}px;
        min-height: ${NODE_HEIGHT}px;
        padding: 0 ${NODE_PADDING}px;
        /* The body of a wait is a box like a send's: the two are halves of one exchange. */
        border-radius: 10px;
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
            props.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : props.hovered && !props.readOnly ? NODE_BG_HOVER_COLOR : NODE_BG_COLOR};
        box-shadow: ${(props: NodeStyleProp) => props.hovered && !props.readOnly ? NODE_HOVER_GLOW : 'none'};
        transition: box-shadow 0.1s ease, background-color 0.1s ease, border-color 0.1s ease;
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
        align-self: center;
        max-width: ${NODE_WIDTH - 110}px;
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
        /* Pinned to the top-right of the box, as on every other node. */
        align-self: flex-start;
        margin-left: auto;
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
    // A durable agent's wait names the channel it is waiting on. The call itself carries only the
    // correlation token, so the channel comes from metadata — the language server recovers it from
    // the sendData that issued the token.
    const agentDataEvent = getAgentDataEventName(node);
    if (agentDataEvent) {
        return {
            title: `Wait for ${agentDataEvent}`,
            subtitle: normalizeNodePropertyValue((node.properties as any)?.variable?.value as string | undefined),
        };
    }

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
    // The counterpart of the send node's target: who the awaited event comes from.
    const sourceName = (model.node.metadata?.data as { agentName?: string } | undefined)?.agentName;

    // Compute layout positions for the external arrow SVG
    const circleRadius = WAIT_DATA_CIRCLE_SIZE / 2;
    // The body has to land on the node's centre line, so the space before it is exactly the left
    // width minus half the body. Deriving it any other way leaves the body off-centre and the
    // links bending to reach it.
    const svgWidth = model.node.viewState?.lw
        ? Math.max(model.node.viewState.lw - NODE_WIDTH / 2, SOURCE_BOX_SIZE + NODE_GAP_X)
        : SOURCE_BOX_SIZE + NODE_GAP_X;
    const svgHeight = NODE_HEIGHT + LABEL_HEIGHT;
    const svgMidY = (NODE_HEIGHT + LABEL_HEIGHT) / 2;
    // The source sits at the far left, and the arrow runs from it into the body.
    const sourceBoxY = svgMidY - SOURCE_BOX_SIZE / 2;
    const lineX1 = SOURCE_BOX_SIZE;
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
                <rect
                    x={0}
                    y={sourceBoxY}
                    width={SOURCE_BOX_SIZE}
                    height={SOURCE_BOX_SIZE}
                    rx={12}
                    fill={NODE_BG_COLOR}
                    stroke={arrowColor}
                    strokeWidth={1.5}
                />
                <foreignObject x={0} y={sourceBoxY} width={SOURCE_BOX_SIZE} height={SOURCE_BOX_SIZE}>
                    <div
                        style={{
                            width: `${SOURCE_BOX_SIZE}px`,
                            height: `${SOURCE_BOX_SIZE}px`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Icon name={sourceName ? "bi-ai-agent" : "bi-import"} sx={{ width: 24, height: 24, fontSize: 24 }} />
                    </div>
                </foreignObject>
                {sourceName && (
                    <text
                        x={0}
                        y={svgHeight - 2}
                        textAnchor="start"
                        fill={NODE_TEXT_COLOR}
                        fontSize="14px"
                        fontFamily="GilmerRegular"
                    >
                        {sourceName}
                    </text>
                )}
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
                        style={getDiffContainerStyles(model.node)}
                        onClick={handleOnClick}
                    >
                        <Icon
                            // Receiving a declared event is the same act whether a workflow or an
                            // agent does it, so it carries the agent box's receive-event icon. The
                            // timer is kept for the waits that are only waits — a child workflow's
                            // result, or an agent's answer to a turn.
                            name={isReceiveEventNode(model.node) ? "bi-import" : "bi-wait"}
                            sx={{ fontSize: 24, width: 24, height: 24, color: NODE_TEXT_COLOR }}
                        />
                        <NodeStyles.TextGroup>
                            <NodeStyles.Title style={getDiffTitleStyles(model.node)}>{nodeTitle}</NodeStyles.Title>
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
                    </NodeStyles.Circle>
                </Tooltip>
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.CircleColumn>

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
