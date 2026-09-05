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
import { PortWidget } from "@projectstorm/react-diagrams-core";
import { AI_CHAT_RESOURCE_NAME, AI_DECISION_RESOURCE_NAME, CDResourceFunction, CDService } from "@wso2/ballerina-core";
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
    BottomPortWidget,
    FunctionBoxWrapper,
    StyledServiceBox,
    RowIconWrapper,
    EventTypeText
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

// A single subordinate capability row, used for `chat` and for `decision`. Neither is rendered as a
// resource with a method badge: both are fixed, code-generated surface (see AiChatServiceBuilder),
// not something the user designs from scratch the way an HTTP resource is, so they read as
// capabilities of the agent rather than peer endpoints.
function AgentCapabilityBox(props: {
    func: CDResourceFunction;
    model: EntryNodeModel;
    engine: any;
    readonly?: boolean;
    icon: string;
    label: string;
    tag: string;
    title: string;
}) {
    const { func, model, engine, readonly, icon, label, tag, title } = props;
    const [isHovered, setIsHovered] = useState(false);
    const { onFunctionSelect } = useDiagramContext();

    const handleOnClick = () => {
        onFunctionSelect(func);
    };

    return (
        <FunctionBoxWrapper>
            <StyledServiceBox
                hovered={isHovered}
                onClick={() => !readonly ? handleOnClick() : undefined}
                onMouseEnter={() => !readonly && setIsHovered(true)}
                onMouseLeave={() => !readonly && setIsHovered(false)}
                readonly={readonly}
                title={title}
            >
                <RowIconWrapper>
                    <Icon name={icon} sx={{ fontSize: 16, width: 16, height: 16 }} />
                </RowIconWrapper>
                <Title hovered={isHovered}>{label}</Title>
                <EventTypeText>{tag}</EventTypeText>
            </StyledServiceBox>
            <PortWidget port={model.getPort(getEntryNodeFunctionPortName(func))!} engine={engine} />
        </FunctionBoxWrapper>
    );
}

export function AIServiceWidget({ model, engine }: BaseNodeWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);

    const { onServiceSelect, onDeleteComponent, readonly } = useDiagramContext();
    const isMenuOpen = Boolean(menuAnchorEl);

    const serviceFunctions = [];
    if ((model.node as CDService).remoteFunctions?.length > 0) {
        serviceFunctions.push(...(model.node as CDService).remoteFunctions);
    }
    if ((model.node as CDService).resourceFunctions?.length > 0) {
        serviceFunctions.push(...(model.node as CDService).resourceFunctions);
    }

    const resourceFunctions = (model.node as CDService).resourceFunctions ?? [];
    // Resolve by path rather than array position — `serviceFunctions[0]` only happened to be
    // `chat` because of incidental ordering upstream; matching the generated name is correct
    // regardless of how many resources the service ends up with.
    const chatFunction = resourceFunctions.find(fn => fn.path === AI_CHAT_RESOURCE_NAME) ?? serviceFunctions[0];
    const decisionFunction = resourceFunctions.find(fn => fn.path === AI_DECISION_RESOURCE_NAME);

    // The outer box always opens the service's resource listing, exactly as a REST service node
    // does. Deliberately independent of whether HITL is wired: a node whose click target silently
    // changed once a `decision` resource appeared would be unpredictable.
    const handleOnClick = () => {
        onServiceSelect(model.node as CDService);
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
                {chatFunction && (
                    <AgentCapabilityBox
                        func={chatFunction}
                        model={model}
                        engine={engine}
                        readonly={readonly}
                        icon="bi-chat"
                        label="Agent Chat"
                        tag="Chat"
                        title="Handles a single conversational turn with the agent"
                    />
                )}
                {decisionFunction && (
                    <AgentCapabilityBox
                        func={decisionFunction}
                        model={model}
                        engine={engine}
                        readonly={readonly}
                        icon="user-fill"
                        label="Human Decision"
                        tag="Decision"
                        title="Resumes a paused run once a human approves or rejects a pending tool call"
                    />
                )}
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
            {/* Every resource now has a visible row carrying its own inline PortWidget, so there is
                no anonymous chat port here — registering the same port twice would conflict. */}
        </Node>
    );
}
