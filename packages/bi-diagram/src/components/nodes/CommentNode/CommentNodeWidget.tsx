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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { CommentNodeModel } from "./CommentNodeModel";
import {
    COMMENT_NODE_CIRCLE_WIDTH,
    COMMENT_NODE_GAP,
    COMMENT_NODE_WIDTH,
    DRAFT_NODE_BORDER_WIDTH,
    LINK_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_SELECTED_COLOR,
    NODE_BORDER_WIDTH,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
    PANEL_BG_COLOR,
} from "../../../resources/constants";
import { Button, Item, Menu, MenuItem, Popover, Tooltip } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources";
import { getDiffContainerStyles, getDiffTitleStyles } from "../../../utils/node";
import { FlowNode } from "../../../utils/types";
import { useDiagramContext } from "../../DiagramContext";

export namespace NodeStyles {
    export type NodeStyleProp = {
        disabled: boolean;
        hovered: boolean;
        isSelected?: boolean;
        readOnly?: boolean;
    };
    export const Node = styled.div`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: ${COMMENT_NODE_WIDTH}px;
        height: ${NODE_HEIGHT}px;
    `;

    export const Card = styled.div<NodeStyleProp>`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: ${COMMENT_NODE_WIDTH - COMMENT_NODE_GAP}px;
        height: ${NODE_HEIGHT}px;
        padding: 0 ${NODE_PADDING}px;
        background-color: ${PANEL_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        border: ${NODE_BORDER_WIDTH}px solid;
        border-color: ${(props: NodeStyleProp) =>
            props.isSelected && !props.disabled
                ? NODE_BORDER_SELECTED_COLOR
                : props.hovered && !props.disabled && !props.readOnly
                ? NODE_BORDER_SELECTED_COLOR
                : PANEL_BG_COLOR};
        border-radius: 10px;
        cursor: pointer;
    `;

    export const Circle = styled.div<NodeStyleProp>`
        width: ${COMMENT_NODE_CIRCLE_WIDTH}px;
        height: ${COMMENT_NODE_CIRCLE_WIDTH}px;
        border-radius: 50%;
        border: ${NODE_BORDER_WIDTH}px solid;
        border-color: ${(props: NodeStyleProp) =>
            props.isSelected && !props.disabled
                ? NODE_BORDER_SELECTED_COLOR
                : props.hovered && !props.disabled && !props.readOnly
                ? NODE_BORDER_SELECTED_COLOR
                : LINK_COLOR};
        background-color: ${(props: NodeStyleProp) =>
            props.isSelected && !props.disabled
                ? NODE_BORDER_SELECTED_COLOR
                : props.hovered && !props.disabled && !props.readOnly
                ? NODE_BORDER_SELECTED_COLOR
                : LINK_COLOR};
        display: flex;
        justify-content: center;
        align-items: flex-end;
    `;

    export const Header = styled.div<{}>`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 2px;
        width: 100%;
        padding: 8px;
    `;

    export const StyledButton = styled(Button)`
        border-radius: 5px;
        position: absolute;
        right: 6px;
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

    export const Title = styled(StyledText)`
        max-width: ${NODE_WIDTH - 50}px;
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
}

interface CommentNodeWidgetProps {
    model: CommentNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<CommentNodeWidgetProps, "children"> {}

export function CommentNodeWidget(props: CommentNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, onDeleteNode, readOnly, selectedNodeId } = useDiagramContext();

    const isSelected = selectedNodeId === model.node.id;

    const [isHovered, setIsHovered] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const isMenuOpen = Boolean(anchorEl);

    const handleOnClick = (event: React.MouseEvent<HTMLDivElement>) => {
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

    const onGoToSource = () => {
        goToSource && goToSource(model.node);
        setAnchorEl(null);
    };

    const deleteNode = () => {
        onDeleteNode && onDeleteNode(model.node);
        setAnchorEl(null);
    };

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleOnMenuClose = () => {
        setAnchorEl(null);
        setIsHovered(false);
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

    return (
        <NodeStyles.Node onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <NodeStyles.Circle
                hovered={isHovered}
                disabled={model.node.suggested}
                isSelected={isSelected}
                readOnly={readOnly}
            >
                <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </NodeStyles.Circle>
            <NodeStyles.Card
                hovered={isHovered}
                disabled={model.node.suggested}
                isSelected={isSelected}
                readOnly={readOnly}
                style={getDiffContainerStyles(model.node)}
            >
                <NodeStyles.Row>
                    <NodeStyles.Header onClick={handleOnClick}>
                        <Tooltip
                            content={model.node.metadata.description}
                            sx={{ maxWidth: COMMENT_NODE_WIDTH, textWrap: "wrap" }}
                        >
                            <NodeStyles.Description style={getDiffTitleStyles(model.node)}>{model.node.metadata.description || "..."}</NodeStyles.Description>
                        </Tooltip>
                    </NodeStyles.Header>
                    <NodeStyles.StyledButton disabled={readOnly} appearance="icon" onClick={handleOnMenuClick}>
                        <MoreVertIcon />
                    </NodeStyles.StyledButton>
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
                            {menuItems.map((item) => (
                                <MenuItem key={item.id} item={item} />
                            ))}
                        </Menu>
                    </Popover>
                </NodeStyles.Row>
            </NodeStyles.Card>
        </NodeStyles.Node>
    );
}
