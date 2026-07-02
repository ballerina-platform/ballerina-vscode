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

import React, { ReactNode, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import {
    DRAFT_NODE_BORDER_WIDTH,
    HIGHLIGHT_NODE_BORDER_COLOR,
    HIGHLIGHT_NODE_BORDER_WIDTH,
    NODE_BG_BREAKPOINT_COLOR,
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_ERROR_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_ERROR_COLOR,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { Button, Icon, Item, Menu, MenuItem, Tooltip } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources";
import NodeIcon from "../../NodeIcon";
import { useDiagramContext } from "../../DiagramContext";
import { BaseNodeModel } from "./BaseNodeModel";
import { ELineRange, FlowNode } from "@wso2/ballerina-core";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { getNodeTitle, isWorkflowNode, nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { NodeNoteChip } from "../../NodeNoteChip";

export namespace NodeStyles {
    export type NodeStyleProp = {
        disabled: boolean;
        hovered: boolean;
        hasError: boolean;
        readOnly: boolean;
        isActiveBreakpoint?: boolean;
        isSelected?: boolean;
        isWorkflowNode?: boolean;
    };
    export const Node = styled.div<NodeStyleProp>`
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        width: ${NODE_WIDTH}px;
        min-height: ${NODE_HEIGHT}px;
        padding: 0 ${NODE_PADDING}px;
        background-color: ${(props: NodeStyleProp) =>
            props?.isActiveBreakpoint ? NODE_BG_BREAKPOINT_COLOR : NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        opacity: ${(props: NodeStyleProp) => (props.disabled ? 0.7 : 1)};
        border: ${(props: NodeStyleProp) =>
            props.disabled
                ? DRAFT_NODE_BORDER_WIDTH
                : props.isWorkflowNode
                    ? HIGHLIGHT_NODE_BORDER_WIDTH
                    : NODE_BORDER_WIDTH}px;
        border-style: ${(props: NodeStyleProp) => (props.disabled ? "dashed" : "solid")};
        border-color: ${(props: NodeStyleProp) =>
            props.hasError
                ? NODE_BORDER_ERROR_COLOR
                : props.isSelected && !props.disabled
                    ? NODE_BORDER_SELECTED_COLOR
                    : props.hovered && !props.disabled && !props.readOnly
                        ? NODE_BORDER_SELECTED_COLOR
                        : props.isWorkflowNode
                            ? HIGHLIGHT_NODE_BORDER_COLOR
                            : NODE_BORDER_COLOR};
        border-radius: 10px;
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

    export const ActionButtonGroup = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;
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
        flex-shrink: 0;
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
        white-space: normal;
        font-size: 12px;
        line-height: 14px;
        max-height: 28px;
    `;

    export const Row = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
    `;

    export const Hr = styled.hr`
        width: 100%;
    `;

    export const Footer = styled(StyledText)`
        display: flex;
        align-items: center;
        gap: 8px;
    `;
}

export interface BaseNodeWidgetProps {
    model: BaseNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<BaseNodeWidgetProps, "children"> { }

export function BaseNodeWidget(props: BaseNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const {
        onNodeSelect,
        goToSource,
        openView,
        onDeleteNode,
        removeBreakpoint,
        addBreakpoint,
        readOnly,
        selectedNodeId,
        project,
        nodeComments,
    } = useDiagramContext();

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

    // Re-anchor the menu whenever the canvas is panned or zoomed
    useEffect(() => {
        if (!isMenuOpen || !menuButtonElement) return;
        const handle = engine.getModel().registerListener({
            offsetUpdated: () => setMenuPos(getMenuPos(menuButtonElement)),
            zoomUpdated: () => setMenuPos(getMenuPos(menuButtonElement)),
        });
        return () => handle.deregister();
    }, [isMenuOpen, menuButtonElement]);

    // Close on click-outside (don't block propagation — canvas keeps receiving events)
    useEffect(() => {
        if (!isMenuOpen) return;
        const handleClickOutside = () => setMenuPos(null);
        // Delay so the opening click itself doesn't immediately close the menu
        const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isMenuOpen]);

    const hasBreakpoint = model.hasBreakpoint();
    const isActiveBreakpoint = model.isActiveBreakpoint();
    const functionViewRange = model.node.properties?.view?.value as ELineRange | undefined;
    const hasViewRange = Boolean(functionViewRange);
    const processFunctionValue = (model.node.properties as any)?.processFunction?.value as string | undefined;
    const workflowStartFunctionName =
        typeof processFunctionValue === "string"
            ? processFunctionValue
                .trim()
                .replace(/^["']|["']$/g, "")
                .split(":")
                .pop()
                ?.split("(")[0]
                ?.trim()
            : undefined;
    const canViewProjectFunction =
        hasViewRange &&
        model.node.codedata.node === "FUNCTION_CALL" &&
        model.node.codedata.org === project?.org &&
        Boolean(model.node.properties?.view?.value);
    const canViewWorkflowRunFunction = model.node.codedata.node === "WORKFLOW_RUN" && Boolean(workflowStartFunctionName);
    const canViewFunction = canViewProjectFunction || canViewWorkflowRunFunction;
    const canOpenDataMapper =
        model.node.codedata.node === "DATA_MAPPER_CALL" && Boolean(model.node.properties?.view?.value);

    const handleOnClick = async (event: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly) {
            return;
        }
        if (event.metaKey) {
            // Handle action when cmd key is pressed
            if (model.node.codedata.node === "DATA_MAPPER_CALL") {
                openDataMapper();
            } else if (canViewFunction) {
                viewFunction();
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

    const handleOnViewFunctionClick = () => {
        if (readOnly) {
            return;
        }
        viewFunction();
    };

    const handleOnOpenDataMapperClick = () => {
        if (readOnly) {
            return;
        }
        openDataMapper();
    };

    const openDataMapper = async () => {
        if (!model.node.properties?.view?.value) {
            return;
        }
        const { fileName, startLine, endLine } = model.node.properties.view.value as ELineRange;
        const response = await project?.getProjectPath?.({ segments: [fileName], codeData: model.node.codedata });
        openView &&
            openView({
                documentUri: response.filePath,
                position: {
                    startLine: startLine.line,
                    startColumn: startLine.offset,
                    endLine: endLine.line,
                    endColumn: endLine.offset,
                },
                projectPath: response.projectPath,
            });
    };

    const viewFunction = async () => {
        if (canViewProjectFunction && functionViewRange) {
            const { fileName, startLine, endLine } = functionViewRange;
            const response = await project?.getProjectPath?.({ segments: [fileName], codeData: model.node.codedata });
            openView &&
                openView({
                    documentUri: response.filePath,
                    position: {
                        startLine: startLine.line,
                        startColumn: startLine.offset,
                        endLine: endLine.line,
                        endColumn: endLine.offset,
                    },
                    projectPath: response.projectPath,
                });
            return;
        }

        if (canViewWorkflowRunFunction && workflowStartFunctionName) {
            const functionLocation = await project?.getFunctionLocation?.(workflowStartFunctionName);
            if (functionLocation) {
                openView && openView(functionLocation);
            }
        }
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

    if (model.node.codedata.node === "DATA_MAPPER_CALL") {
        menuItems.splice(1, 0, {
            id: "openDataMapper",
            label: "View",
            onClick: () => {
                openDataMapper();
            },
        });
    }

    if (canViewFunction) {
        menuItems.splice(1, 0, {
            id: "viewFunction",
            label: "View",
            onClick: () => {
                viewFunction();
            },
        });
    }

    const nodeTitle = getNodeTitle(model.node);

    const hasFullAssignment = model.node.properties?.variable?.value && model.node.properties?.expression?.value;

    let nodeDescription = hasFullAssignment
        ? `${model.node.properties.variable?.value} = ${model.node.properties?.expression?.value}`
        : model.node.properties?.variable?.value || model.node.properties?.expression?.value;

    // HACK: add descriptions for log nodes
    if (
        model.node.codedata?.org === "ballerina" &&
        model.node.codedata?.module === "log" &&
        model.node.properties?.msg?.value
    ) {
        nodeDescription = model.node.properties.msg.value;
    }

    const hasError = nodeHasError(model.node);
    const isWorkflowStyledNode = isWorkflowNode(model.node);

    return (
        <NodeStyles.Node
            hovered={isHovered || isNoteActive}
            disabled={model.node.suggested}
            hasError={hasError}
            readOnly={readOnly}
            isActiveBreakpoint={isActiveBreakpoint}
            isSelected={isSelected}
            isWorkflowNode={isWorkflowStyledNode}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => { setIsHovered(false); setIsNoteActive(false); }}
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
                    }}
                />
            )}
            <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
            <NodeStyles.Row>
                <NodeStyles.Icon onClick={handleOnClick}>
                    <NodeIcon type={model.node.codedata.node} size={24} />
                    {/* {model.node.properties.variable?.value && (
                        <NodeStyles.Description>{model.node.properties.variable.value}</NodeStyles.Description>
                    )} */}
                </NodeStyles.Icon>
                <NodeStyles.Row style={{ flex: 1, minWidth: 0, width: "auto" }}>
                    <NodeStyles.Header onClick={handleOnClick}>
                        <NodeStyles.Title>{nodeTitle}</NodeStyles.Title>
                        <NodeStyles.Description>{nodeDescription as ReactNode}</NodeStyles.Description>
                    </NodeStyles.Header>
                    <NodeStyles.ActionButtonGroup>
                        {noteComment && <NodeNoteChip commentNode={noteComment} engine={engine} onOpen={() => setIsNoteActive(true)} onClose={() => { setIsNoteActive(false); setIsHovered(false); }} />}
                        {hasError && <DiagnosticsPopUp node={model.node} engine={engine} />}
                        {canViewFunction && (
                            <Tooltip content="View function flow">
                                <NodeStyles.MenuButton
                                    buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                    appearance="icon"
                                    onClick={handleOnViewFunctionClick}
                                >
                                    <Icon
                                        name="bi-open-in"
                                        sx={{ width: 16, height: 16 }}
                                        iconSx={{ fontSize: 16 }}
                                    />
                                </NodeStyles.MenuButton>
                            </Tooltip>
                        )}
                        {canOpenDataMapper && (
                            <Tooltip content="View data mapper">
                                <NodeStyles.MenuButton
                                    buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                    appearance="icon"
                                    onClick={handleOnOpenDataMapperClick}
                                >
                                    <Icon
                                        name="bi-function-flow"
                                        sx={{ width: 16, height: 16 }}
                                        iconSx={{ fontSize: 16 }}
                                    />
                                </NodeStyles.MenuButton>
                            </Tooltip>
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
        </NodeStyles.Node>
    );
}
