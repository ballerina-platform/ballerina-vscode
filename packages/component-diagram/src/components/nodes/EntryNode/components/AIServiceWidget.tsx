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
import { CDService } from "@wso2/ballerina-core";
import { Item, Menu, MenuItem, Popover, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { useDiagramContext } from "../../../DiagramContext";
import { MoreVertIcon } from "../../../../resources/icons/nodes/MoreVertIcon";
import { getEntryNodeFunctionPortName } from "../../../../utils/diagram";
import { BaseNodeWidgetProps, EntryNodeModel } from "../EntryNodeModel";
import { useClickWithDragTolerance } from "../../../../hooks/useClickWithDragTolerance";
import {
    Node,
    Box,
    ServiceBox,
    Header,
    Title,
    Description,
    IconWrapper,
    MenuButton,
    TopPortWidget,
    BottomPortWidget
} from "./styles";

type NodeStyleProp = { hovered: boolean };

const DashedBox = styled.div<NodeStyleProp>`
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 8px;
    width: 100%;
    border: 2.5px dashed
        ${(props: NodeStyleProp) => (props.hovered ? ThemeColors.HIGHLIGHT : ThemeColors.OUTLINE_VARIANT)};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    padding: 8px;
`;

const IconWithBadge = styled.div`
    position: relative;
    padding: 4px;
    max-width: 32px;
    svg {
        fill: ${ThemeColors.ON_SURFACE};
    }
    > div:first-child {
        width: 24px;
        height: 24px;
        font-size: 24px;
    }
`;

const BeakerBadge = styled.span`
    position: absolute;
    bottom: -2px;
    right: -8px;
    font-size: 8px;
    color: var(--vscode-editorWarning-foreground, #cca700);
`;

const isTestService = (model: EntryNodeModel): boolean => {
    const filePath = (model.node as CDService)?.location?.filePath || '';
    return filePath.endsWith('_agent_chat.bal');
};

// Utility functions specific to AI Service
const getNodeTitle = (model: EntryNodeModel) => {
    const serviceName = (model.node as any)?.serviceName ||
        (model.node as any)?.name ||
        "AI Agent Service";
    return serviceName.replace(/^\//, '');
};

const getNodeDescription = (model: EntryNodeModel) => {
    if ((model.node as CDService).absolutePath) {
        return (model.node as CDService).absolutePath.replace(/\\/g, "");
    }
    return (model.node as any)?.serviceName ||
        (model.node as any)?.name ||
        "";
};

export function AIServiceWidget({ model, engine }: BaseNodeWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);

    const { onFunctionSelect, onDeleteComponent, readonly } = useDiagramContext();
    const isMenuOpen = Boolean(menuAnchorEl);

    // ai:Listener entry point is fixed to `post chat`.
    const chatResource = (model.node as CDService).resourceFunctions?.find(
        (r) => r.accessor === "post" && r.path === "chat"
    );

    const handleOnClick = () => {
        if (chatResource) {
            onFunctionSelect(chatResource);
        }
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

    const menuItems: Item[] = [
        { id: "edit", label: "Edit", onClick: () => handleOnClick() },
        { id: "delete", label: "Delete", onClick: () => onDeleteComponent(model.node) },
    ];

    const isTest = isTestService(model);
    const BoxComponent = isTest ? DashedBox : Box;

    return (
        <Node>
            <TopPortWidget port={model.getPort("in")!} engine={engine} />
            <BoxComponent hovered={isHovered}>
                <ServiceBox
                    onMouseEnter={() => !readonly && setIsHovered(true)}
                    onMouseLeave={() => !readonly && setIsHovered(false)}
                    onMouseDown={!readonly ? handleMouseDown : undefined}
                    onMouseUp={!readonly ? handleMouseUp : undefined}
                    readonly={readonly}
                >
                    {isTest ? (
                        <IconWithBadge>
                            <Icon name="bi-ai-agent" />
                            <BeakerBadge className="codicon codicon-beaker" />
                        </IconWithBadge>
                    ) : (
                        <IconWrapper><Icon name="bi-ai-agent" /></IconWrapper>
                    )}
                    <Header hovered={isHovered} inactive={readonly}>
                        <Title hovered={isHovered}>{getNodeTitle(model)}</Title>
                        <Description>{getNodeDescription(model)}</Description>
                    </Header>
                    <MenuButton
                        appearance="icon"
                        onClick={!readonly ? handleOnMenuClick : undefined}
                        onMouseDown={!readonly ? handleMenuMouseDown : undefined}
                        onMouseUp={!readonly ? handleMenuMouseUp : undefined}
                        disabled={readonly}
                    >
                        <MoreVertIcon />
                    </MenuButton>
                </ServiceBox>
            </BoxComponent>

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

            <BottomPortWidget port={model.getPort("out")!} engine={engine} />
            {chatResource && (
                <BottomPortWidget
                    port={model.getPort(getEntryNodeFunctionPortName(chatResource))!}
                    engine={engine}
                />
            )}
        </Node>
    );
}
