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

import React, { useMemo, useState } from "react";
import { CDFunction, CDResourceFunction, CDService } from "@wso2/ballerina-core";
import { Item, Menu, MenuItem, Popover, Icon } from "@wso2/ui-toolkit";
import { EntryNodeModel } from "../EntryNodeModel";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { useDiagramContext } from "../../../DiagramContext";
import { GQLFuncListType, PREVIEW_COUNT, SHOW_ALL_THRESHOLD } from "../../../Diagram";
import { CollapseButton, FunctionBoxWrapper, GroupContainer, GroupHeader, ViewAllButton, ViewAllButtonWrapper, Node, Box, ServiceBox, Header, Title, Description, IconWrapper, MenuButton, StyledServiceBox, colors } from "./styles";
import { Codicon } from "@wso2/ui-toolkit/lib/components/Codicon/Codicon";
import { getEntryNodeFunctionPortName } from "../../../../utils/diagram";
import { BaseNodeWidgetProps } from "../EntryNodeModel";
import { MoreVertIcon } from "../../../../resources/icons/nodes/MoreVertIcon";
import { useClickWithDragTolerance } from "../../../../hooks/useClickWithDragTolerance";

type GroupKey = "Query" | "Subscription" | "Mutation";

const getNodeTitle = (model: EntryNodeModel) => {
    return (model.node as any)?.serviceName || 
           (model.node as any)?.name || 
           "GraphQL Service";
};

const getNodeDescription = (model: EntryNodeModel) => {
    return (model.node as any)?.description || "";
};

function FunctionBox(props: { func: any; model: EntryNodeModel; engine: any; }) {
    const { func, model, engine } = props;
    const [isHovered, setIsHovered] = useState(false);
    const { onFunctionSelect, readonly } = useDiagramContext();

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
                {func.path && (
                    <Title hovered={isHovered}>
                        {func.path}
                    </Title>
                )}
                {func.name && <Title hovered={isHovered}>{func.name}</Title>}
            </StyledServiceBox>
            <PortWidget port={model.getPort(getEntryNodeFunctionPortName(func))!} engine={engine} />
        </FunctionBoxWrapper>
    );
}

function GraphQLFunctionList(props: {
    group: "Query" | "Subscription" | "Mutation";
    functions: Array<CDFunction | CDResourceFunction>;
    model: EntryNodeModel;
    engine: DiagramEngine;
    collapsed: boolean;
    onToggleCollapse: (group: GroupKey) => void;
}) {
    const { group, functions, model, engine, collapsed, onToggleCollapse } = props;
    const { expandedNodes, onToggleNodeExpansion, readonly } = useDiagramContext();

    const accent = (() => {
        switch (group) {
            case "Query": return colors.GET;
            case "Subscription": return colors.PUT;
            case "Mutation": return colors.POST;
        }
    })();

    const isExpanded = expandedNodes.has(model.node.uuid + group);
    const canToggleItems = functions.length > SHOW_ALL_THRESHOLD;

    let visibleFunctions;
    if (functions.length <= SHOW_ALL_THRESHOLD || isExpanded) {
        visibleFunctions = functions;
    } else {
        visibleFunctions = functions.slice(0, PREVIEW_COUNT);
    }

    const handleToggleExpansion = () => {
        onToggleNodeExpansion(model.node.uuid + group);
    };

    return (
        <FunctionBoxWrapper>
            <GroupContainer accent={accent}>
                <GroupHeader>
                    <CollapseButton
                        appearance="icon"
                        aria-label={collapsed ? `Expand ${group}` : `Collapse ${group}`}
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            !readonly && onToggleCollapse(group);
                        }}
                    >
                        {collapsed ? (
                            <Codicon name="chevron-right" />
                        ) : (
                            <Codicon name="chevron-down" />
                        )}
                    </CollapseButton>
                    {group}
                </GroupHeader>
                {!collapsed && (
                    <>
                        {visibleFunctions.map((fn) => (
                            <FunctionBox
                                key={getEntryNodeFunctionPortName(fn)}
                                func={fn}
                                model={model}
                                engine={engine}
                            />
                        ))}
                        {canToggleItems && !isExpanded && (
                            <ViewAllButtonWrapper>
                                <ViewAllButton onClick={handleToggleExpansion}>
                                    Show More
                                </ViewAllButton>
                                <PortWidget
                                    port={model.getGraphQLGroupPort(group)}
                                    engine={engine}
                                />
                            </ViewAllButtonWrapper>
                        )}
                        {canToggleItems && isExpanded && (
                            <ViewAllButton onClick={handleToggleExpansion}>
                                Show Fewer
                            </ViewAllButton>
                        )}
                    </>
                )}
            </GroupContainer>
            {collapsed &&
                <PortWidget
                    port={ model.getGraphQLGroupPort(group)}
                    engine={engine}
                >
                </PortWidget>}
        </FunctionBoxWrapper>
    );
}

export function GraphQLServiceWidget({ model, engine }: BaseNodeWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    
    const {
        graphQLGroupOpen,
        onServiceSelect,
        onDeleteComponent,
        onToggleGraphQLGroup,
        readonly
    } = useDiagramContext();

    const isMenuOpen = Boolean(menuAnchorEl);

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

    const serviceFunctions = useMemo(() => {
        const functions: Array<CDFunction | CDResourceFunction> = [];
        const service = model.node as CDService;

        if (service.remoteFunctions?.length) {
            functions.push(...service.remoteFunctions);
        }
        if (service.resourceFunctions?.length) {
            functions.push(...service.resourceFunctions);
        }

        return functions;
    }, [model.node]);

    const getGroupLabel = (accessor?: string, name?: string): GroupKey | null => {
        if (accessor === "get") return "Query";
        if (accessor === "subscribe") return "Subscription";
        if (!accessor && name) return "Mutation";
        return null;
    };

    const grouped: GQLFuncListType = useMemo(() => {
        return serviceFunctions.reduce((acc, fn) => {
            const accessor = (fn as CDResourceFunction).accessor;
            const name = (fn as CDFunction).name;
            const group = getGroupLabel(accessor, name);
            if (!group) return acc;
            (acc[group] ||= []).push(fn);
            return acc;
        }, {} as GQLFuncListType);
    }, [serviceFunctions]);

    const orderedGroups: GroupKey[] = ["Query", "Mutation", "Subscription"];

    return (
        <Node>
            {/* PortWidget itself renders a bare, zero-height div - see GeneralWidget.tsx's "in"
                port for the full anchor-alignment rationale. */}
            <PortWidget port={model.getPort("in")!} engine={engine} />
            <Box hovered={!readonly && isHovered}>
                <ServiceBox
                    onMouseEnter={() => !readonly && setIsHovered(true)}
                    onMouseLeave={() => !readonly && setIsHovered(false)}
                    onMouseDown={!readonly ? handleMouseDown : undefined}
                    onMouseUp={!readonly ? handleMouseUp : undefined}
                    readonly={readonly}
                >
                    <IconWrapper><Icon name="bi-graphql" sx={{ color: "#e535ab" }} /></IconWrapper>
                    <Header hovered={!readonly && isHovered}>
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
                {orderedGroups
                    .filter((g) => grouped[g]?.length)
                    .map((group) => (
                        <React.Fragment key={`gql-accordion-${group}`}>
                            <GraphQLFunctionList
                                group={group}
                                functions={grouped[group]}
                                model={model}
                                engine={engine}
                                collapsed={graphQLGroupOpen[model.node.uuid]?.[group] === false}
                                onToggleCollapse={(group) => {
                                    onToggleGraphQLGroup(model.node.uuid, group);
                                }}
                            />
                        </React.Fragment>
                ))}
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
            <PortWidget port={model.getPort("out")!} engine={engine} />
        </Node>
    );
}
