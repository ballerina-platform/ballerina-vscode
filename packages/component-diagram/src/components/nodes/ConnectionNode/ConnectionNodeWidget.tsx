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
import { ConnectionNodeModel } from "./ConnectionNodeModel";
import { NODE_BORDER_WIDTH, CON_NODE_WIDTH, CON_NODE_HEIGHT } from "../../../resources/constants";
import { Button, Icon, Item, Menu, MenuItem, Popover, ThemeColors } from "@wso2/ui-toolkit";
import { useDiagramContext } from "../../DiagramContext";
import { MoreVertIcon } from "../../../resources/icons/nodes/MoreVertIcon";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { useClickWithDragTolerance } from "../../../hooks/useClickWithDragTolerance";

type NodeStyleProp = {
    hovered: boolean;
    inactive?: boolean;
};

const Node = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    height: ${CON_NODE_HEIGHT}px;
    color: ${ThemeColors.ON_SURFACE};
`;

const ClickableArea = styled.div<{ readonly?: boolean }>`
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    gap: 12px;
    width: 100%;
    cursor: ${(props) => props.readonly ? "default" : "pointer"};
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 6px;
`;

const Circle = styled.div<NodeStyleProp>`
    display: flex;
    justify-content: center;
    align-items: center;
    width: ${CON_NODE_HEIGHT}px;
    height: ${CON_NODE_HEIGHT}px;
    border: ${NODE_BORDER_WIDTH}px solid
        ${(props: NodeStyleProp) => (props.hovered ? ThemeColors.HIGHLIGHT : ThemeColors.OUTLINE_VARIANT)};
    border-radius: 50%;
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    aspect-ratio: 1 / 1;
`;

const MenuButton = styled(Button)`
    border-radius: 5px;
`;

const LeftPortWidget = styled(PortWidget)`
    margin-top: -3px;
`;

const RightPortWidget = styled(PortWidget)`
    margin-bottom: -2px;
`;

const StyledText = styled.div`
    font-size: 14px;
`;

const StyledConnectionIcon = styled(ConnectorIcon)`
    width: 24px;
    height: 24px;
    font-size: 24px;
    svg {
        fill: ${ThemeColors.ON_SURFACE};
    }
`;

const Title = styled(StyledText)<NodeStyleProp>`
    max-width: ${CON_NODE_WIDTH - 50}px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: "GilmerMedium";
    color: ${(props: NodeStyleProp) => (props.hovered ? ThemeColors.HIGHLIGHT : ThemeColors.ON_SURFACE)};
    opacity: ${(props: NodeStyleProp) => (props.inactive && !props.hovered ? 0.7 : 1)};
`;

const Description = styled(StyledText)`
    font-size: 12px;
    max-width: ${CON_NODE_WIDTH - CON_NODE_HEIGHT}px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: monospace;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
`;

interface ConnectionNodeWidgetProps {
    model: ConnectionNodeModel;
    engine: DiagramEngine;
}

export interface NodeWidgetProps extends Omit<ConnectionNodeWidgetProps, "children"> {}

export function ConnectionNodeWidget(props: ConnectionNodeWidgetProps) {
    const { model, engine } = props;
    const [isHovered, setIsHovered] = React.useState(false);
    const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const isMenuOpen = Boolean(menuAnchorEl);

    const { onConnectionSelect, onDeleteComponent, readonly } = useDiagramContext();
    // TODO: fix this database icon hack with icon prop from node model
    const databaseNames = [
        "MySQL",
        "PostgreSQL",
        "Oracle",
        "SQL Server",
        "Redis",
        "Derby",
        "SQLite",
        "MongoDB",
        "MariaDB",
    ];
    const hasDatabaseName = databaseNames.some((name) => model.node.symbol?.toLowerCase().includes(name.toLowerCase()));

    const handleOnClick = () => {
        onConnectionSelect(model.node);
    };

    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(handleOnClick);

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        event.stopPropagation();
        setMenuAnchorEl(event.currentTarget);
    };

    const handleOnMenuClose = () => {
        setMenuAnchorEl(null);
    };

    const handleMenuMouseDown = (event: React.MouseEvent) => {
        event.stopPropagation();
    };

    const handleMenuMouseUp = (event: React.MouseEvent) => {
        event.stopPropagation();
    };

    const getNodeTitle = () => {
        return model.node.symbol;
    };

    const getNodeDescription = () => {
        if (model.node?.kind) {
            return model.node.kind;
        }
        return "Connection";
    };

    const menuItems: Item[] = [
        { id: "edit", label: "Edit", onClick: () => handleOnClick() },
        { id: "delete", label: "Delete", onClick: () => onDeleteComponent(model.node, model.getType()) },
    ];

    return (
        <Node>
            <LeftPortWidget port={model.getPort("in")!} engine={engine} />
            <ClickableArea
                data-testid={`connection-node-${model.node.symbol}`}
                onMouseEnter={() => !readonly && setIsHovered(true)}
                onMouseLeave={() => !readonly && setIsHovered(false)}
                onMouseDown={!readonly ? handleMouseDown : undefined}
                onMouseUp={!readonly ? handleMouseUp : undefined}
                readonly={readonly}
            >
                <Circle hovered={isHovered}>
                    <StyledConnectionIcon
                        url={model.node.icon || ""}
                        fallbackIcon={<Icon name="bi-connection" />}
                        connectorType={(model.node as any).metadata?.connectorType}
                    />
                </Circle>
                <Header>
                    <Title hovered={!readonly && isHovered}>{getNodeTitle()}</Title>
                    <Description>{getNodeDescription()}</Description>
                </Header>
                <MenuButton
                    data-testid={`connection-node-${model.node.symbol}-menu`}
                    appearance="icon"
                    onClick={handleOnMenuClick}
                    onMouseDown={handleMenuMouseDown}
                    onMouseUp={handleMenuMouseUp}
                    disabled={readonly}
                >
                    <MoreVertIcon />
                </MenuButton>
            </ClickableArea>
            <Popover
                open={isMenuOpen}
                anchorEl={menuAnchorEl}
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
            <RightPortWidget port={model.getPort("out")!} engine={engine} />
        </Node>
    );
}
