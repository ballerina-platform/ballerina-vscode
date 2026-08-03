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
import { PortWidget } from "@projectstorm/react-diagrams-core";
import { CDAutomation, CDService, CDWorkflow, CDWorkflowEvent, CDWorkflowHumanTask } from "@wso2/ballerina-core";
import { Item, Menu, MenuItem, Popover, ImageWithFallback, Icon } from "@wso2/ui-toolkit";
import { useDiagramContext } from "../../../DiagramContext";
import { HttpIcon, TaskIcon } from "../../../../resources";
import { MoreVertIcon } from "../../../../resources/icons/nodes/MoreVertIcon";
import { getEntryNodeFunctionPortName, getWorkflowEventPortName } from "../../../../utils/diagram";
import { PREVIEW_COUNT, SHOW_ALL_THRESHOLD } from "../../../Diagram";
import { VIEW_ALL_RESOURCES_PORT_NAME, BaseNodeWidgetProps, EntryNodeModel } from "../EntryNodeModel";
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
    ViewAllButton,
    ViewAllButtonWrapper,
    FunctionBoxWrapper,
    StyledServiceBox,
    ResourceAccessor,
    EventTypeText,
    RowIconWrapper,
    PlayButtonCircle,
    PlayButtonPortWrapper,
    colors
} from "./styles";

const getNodeTitle = (model: EntryNodeModel) => {
    if (model.type === "workflow") {
        return (model.node as CDWorkflow).symbol || "";
    }
    const serviceOrAutomation = model.node as CDService | CDAutomation;
    if (serviceOrAutomation.displayName) {
        return serviceOrAutomation.displayName;
    }
    if ((model.node as CDService).absolutePath) {
        return (model.node as CDService).absolutePath.replace(/\\/g, "");
    }
    return "";
};

const getNodeDescription = (model: EntryNodeModel) => {
    if (model.type === "automation") {
        return "Automation";
    }
    if (model.type === "workflow") {
        return "Durable Workflow";
    }
    // Service
    if ((model.node as CDService).type) {
        return (model.node as CDService).type.replace(":Listener", ":Service");
    }
    return "Service";
};

function getColorByMethod(method: string) {
    switch (method.toUpperCase()) {
        case "GET":
            return colors.GET;
        case "PUT":
            return colors.PUT;
        case "POST":
            return colors.POST;
        case "DELETE":
            return colors.DELETE;
        case "PATCH":
            return colors.PATCH;
        case "OPTIONS":
            return colors.OPTIONS;
        case "HEAD":
            return colors.HEAD;
        default:
            return '#876036'; // Default color
    }
}

function getCustomEntryNodeIcon(type: string) {
    let typePart = type;
    if (type && type.includes(":")) {
        const typeParts = type.split(":");
        typePart = typeParts.at(0);
    }

    switch (typePart) {
        case "tcp":
            return <Icon name="bi-tcp" />;
        case "kafka":
            return <Icon name="bi-kafka" />;
        case "rabbitmq":
            return <Icon name="bi-rabbitmq" sx={{ color: "#f60" }} />;
        case "nats":
            return <Icon name="bi-nats" />;
        case "mqtt":
            return <Icon name="bi-mqtt" sx={{ color: "#606" }} />;
        case "grpc":
            return <Icon name="bi-grpc" />;
        case "graphql":
            return <Icon name="bi-graphql" sx={{ color: "#e535ab" }} />;
        case "java.jms":
            return <Icon name="bi-java" />;
        case "trigger.github":
            return <Icon name="bi-github" />;
        case "http":
            return <Icon name="bi-globe" />;
        case "mcp":
            return <Icon name="bi-mcp" />;
        case "solace":
            return <Icon name="bi-solace" sx={{ color: "#00C895" }}/>;
        case "ftp":
            return <Icon name="bi-ftp" />;
        case "file":
            return <Icon name="bi-file" />;
        case "mssql":
            return <Icon name="bi-mssql" sx={{ color: "#b61d1c" }}/>;
        case "mysql":
            return <Icon name="bi-mysql" sx={{ color: "#00758F" }}/>;
        case "postgresql":
            return <Icon name="bi-postgresql" sx={{ color: "#336791" }}/>;
        case "trigger.shopify":
        case "shopify":
            return <Icon name="bi-shopify" sx={{ color: "#95BF47" }} />;
        case "trigger.hubspot":
        case "hubspot":
            return <Icon name="bi-hubspot" sx={{ color: "#FF7A59" }} />;
        case "trigger.twilio":
            return <Icon name="bi-twilio" />;
        default:
            return null;
    }
}

function FunctionBox(props: { func: any; model: EntryNodeModel; engine: any; readonly?: boolean }) {
    const { func, model, engine, readonly } = props;
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
            >
                {func.accessor && (
                    <ResourceAccessor color={getColorByMethod(func.accessor)}>
                        {func.accessor}
                    </ResourceAccessor>
                )}
                {func.path && (
                    <Title hovered={isHovered}>
                        {`/${func.path.replace(/\\/g, "")}`}
                    </Title>
                )}
                {func.name && <Title hovered={isHovered}>{func.name}</Title>}
            </StyledServiceBox>
            <PortWidget port={model.getPort(getEntryNodeFunctionPortName(func))!} engine={engine} />
        </FunctionBoxWrapper>
    );
}

function WorkflowEventBox(props: { event: CDWorkflowEvent; model: EntryNodeModel; engine: any }) {
    const { event, model, engine } = props;

    return (
        <FunctionBoxWrapper>
            <PortWidget port={model.getPort(getWorkflowEventPortName(event))!} engine={engine} />
            <StyledServiceBox hovered={false} readonly={true} title={event.type}>
                <RowIconWrapper>
                    <Icon name="bi-import" sx={{ fontSize: 16, width: 16, height: 16 }} />
                </RowIconWrapper>
                <Title hovered={false}>{event.name}</Title>
                <EventTypeText>Data Event</EventTypeText>
            </StyledServiceBox>
        </FunctionBoxWrapper>
    );
}

function WorkflowHumanTaskBox(props: { humanTask: CDWorkflowHumanTask }) {
    const { humanTask } = props;

    return (
        <FunctionBoxWrapper>
            <StyledServiceBox hovered={false} readonly={true}>
                <RowIconWrapper>
                    <Icon name="bi-user" sx={{ fontSize: 16, width: 16, height: 16 }} />
                </RowIconWrapper>
                <Title hovered={false}>{humanTask.name}</Title>
                <EventTypeText>Human Task</EventTypeText>
            </StyledServiceBox>
        </FunctionBoxWrapper>
    );
}

export function GeneralServiceWidget({ model, engine }: BaseNodeWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const { readonly } = useDiagramContext();

    const {
        onServiceSelect,
        onAutomationSelect,
        onWorkflowSelect,
        onDeleteComponent,
        expandedNodes,
        onToggleNodeExpansion
    } = useDiagramContext();

    const isMenuOpen = Boolean(menuAnchorEl);

    const handleOnClick = () => {
        if (model.type === "service") {
            onServiceSelect(model.node as CDService);
        } else if (model.type === "workflow") {
            onWorkflowSelect?.(model.node as CDWorkflow);
        } else {
            onAutomationSelect(model.node as CDAutomation);
        }
    };

    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(handleOnClick);

    const handleToggleExpansion = (event: React.MouseEvent) => {
        event.stopPropagation();
        onToggleNodeExpansion(model.node.uuid);
    };

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

    const serviceFunctions = [];
    if (model.type !== "workflow") {
        if ((model.node as CDService).remoteFunctions?.length > 0) {
            serviceFunctions.push(...(model.node as CDService).remoteFunctions);
        }
        if ((model.node as CDService).resourceFunctions?.length > 0) {
            serviceFunctions.push(...(model.node as CDService).resourceFunctions);
        }
    }

    const isExpanded = expandedNodes.has(model.node.uuid);
    const hasMoreFunctions = serviceFunctions.length > 3;

    let visibleFunctions;
    if (serviceFunctions.length <= SHOW_ALL_THRESHOLD || isExpanded) {
        visibleFunctions = serviceFunctions;
    } else {
        visibleFunctions = serviceFunctions.slice(0, PREVIEW_COUNT);
    }

    const nodeIcon = (() => {
        switch (model.type) {
            case "workflow":
                return <Icon name="bi-flowchart" sx={{ fontSize: 24, width: 24, height: 24 }} />;
            case "automation":
                return <TaskIcon />;
            case "service":
                const serviceType = (model.node as CDService)?.type;
                const customIcon = getCustomEntryNodeIcon(serviceType);
                if (customIcon) {
                    return customIcon;
                }
                return <ImageWithFallback imageUrl={(model.node as CDService).icon} fallbackEl={<HttpIcon />} />;
            default:
                return <HttpIcon />;
        }
    })();

    return (
        <Node>
            {model.type !== "workflow" && <TopPortWidget port={model.getPort("in")!} engine={engine} />}
            <Box hovered={!readonly && isHovered}>
                {model.type === "workflow" && (
                    // Explicit "run workflow" target: workflow:run edges point at this play button
                    <PlayButtonCircle>
                        <Icon isCodicon name="play" sx={{ fontSize: 14, width: 14, height: 14 }} />
                        <PlayButtonPortWrapper>
                            <PortWidget port={model.getPort("in")!} engine={engine} />
                        </PlayButtonPortWrapper>
                    </PlayButtonCircle>
                )}
                <ServiceBox
                    data-testid={`entry-node-${model.type}`}
                    onMouseEnter={() => !readonly && setIsHovered(true)}
                    onMouseLeave={() => !readonly && setIsHovered(false)}
                    onMouseDown={!readonly ? handleMouseDown : undefined}
                    onMouseUp={!readonly ? handleMouseUp : undefined}
                    readonly={readonly}
                >
                    <IconWrapper>{nodeIcon}</IconWrapper>
                    <Header hovered={!readonly && isHovered}>
                        <Title hovered={!readonly && isHovered}>{getNodeTitle(model)}</Title>
                        <Description>{getNodeDescription(model)}</Description>
                    </Header>
                    <MenuButton
                        data-testid={`entry-node-${model.type}-menu`}
                        disabled={readonly}
                        appearance="icon"
                        onClick={!readonly ? handleOnMenuClick : undefined}
                        onMouseDown={!readonly ? handleMenuMouseDown : undefined}
                        onMouseUp={!readonly ? handleMenuMouseUp : undefined}
                    >
                        <MoreVertIcon />
                    </MenuButton>
                </ServiceBox>
                {visibleFunctions.map((serviceFunction) => (
                    <FunctionBox
                        key={getEntryNodeFunctionPortName(serviceFunction)}
                        func={serviceFunction}
                        model={model}
                        engine={engine}
                        readonly={readonly}
                    />
                ))}

                {model.type === "workflow" &&
                    ((model.node as CDWorkflow).events ?? []).map((event) => (
                        <WorkflowEventBox key={getWorkflowEventPortName(event)} event={event} model={model} engine={engine} />
                    ))}

                {model.type === "workflow" &&
                    ((model.node as CDWorkflow).humanTasks ?? []).map((humanTask, index) => (
                        <WorkflowHumanTaskBox key={`${humanTask.name}-${index}`} humanTask={humanTask} />
                    ))}

                {hasMoreFunctions && !isExpanded && (
                    <ViewAllButtonWrapper>
                        <ViewAllButton onClick={handleToggleExpansion}>
                            Show More Resources
                        </ViewAllButton>
                        <PortWidget port={model.getPort(VIEW_ALL_RESOURCES_PORT_NAME)!} engine={engine} />
                    </ViewAllButtonWrapper>
                )}

                {hasMoreFunctions && isExpanded && (
                    <ViewAllButton onClick={handleToggleExpansion}>
                        Show Fewer Resources
                    </ViewAllButton>
                )}
            </Box>
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
        </Node>
    );
}
