/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
/** @jsxImportSource @emotion/react */
import React, { ReactNode, useState } from "react";
import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { Button, Icon, Item, Menu, MenuItem, Popover, ThemeColors, getAIModuleIcon, DefaultLlmIcon } from "@wso2/ui-toolkit";
import { NodeMetadata } from "@wso2/ballerina-core";
import { AgentData, FlowNode, ToolData } from "../../../utils/types";
import { AgentTypeNodeModel } from "./AgentTypeNodeModel";
import {
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    NODE_BORDER_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_WIDTH,
} from "../../../resources/constants";
import { MoreVertIcon } from "../../../resources/icons";
import NodeIcon from "../../NodeIcon";
import ConnectorIcon from "../../ConnectorIcon";
import { useDiagramContext } from "../../DiagramContext";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import ReactMarkdown from "react-markdown";

namespace Styles {
    export const Node = styled.div<{ readOnly: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
    `;

    export type BoxProp = { hovered: boolean; hasError: boolean; readOnly: boolean; isSelected?: boolean };
    export const Box = styled.div<BoxProp>`
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        width: ${NODE_WIDTH}px;
        min-height: ${NODE_HEIGHT}px;
        padding: 0 ${NODE_PADDING}px;
        border: ${NODE_BORDER_WIDTH}px solid
            ${(props: BoxProp) =>
            props.hasError
                ? ThemeColors.ERROR
                : (props.isSelected || (props.hovered && !props.readOnly))
                    ? ThemeColors.SECONDARY
                    : ThemeColors.OUTLINE_VARIANT};
        border-radius: 10px;
        background-color: ${ThemeColors.SURFACE_DIM};
        color: ${ThemeColors.ON_SURFACE};
        transition: border-color 0.4s ease-out;
    `;

    export const Row = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
        z-index: 2;
    `;

    export const Column = styled.div`
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
    `;

    export const Icon = styled.div`
        padding: 4px;
        svg {
            fill: ${ThemeColors.ON_SURFACE};
        }
    `;

    export const Header = styled.div`
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        gap: 2px;
        flex: 1;
        padding: 8px;
        margin-top: 2px;
    `;

    export const Title = styled.div`
        font-size: 14px;
        height: 18px;
        max-width: ${NODE_WIDTH - 80}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "GilmerMedium";
    `;

    export const Description = styled.div`
        font-size: 12px;
        max-width: ${NODE_WIDTH - 80}px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.7;
    `;

    export const ActionButtonGroup = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 2px;
    `;

    export const Divider = styled.div`
        width: 100%;
        border-top: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    `;

    export const DescriptionBlock = styled.div<{ readOnly: boolean }>`
        width: 100%;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 4px 4px 12px;
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        z-index: 2;
    `;

    export const AgentDescription = styled.div`
        font-size: 12px;
        line-height: 1.4;
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.7;
        flex: 1;
        min-height: 0;
        overflow: hidden;

        p {
            margin: 0 0 0.3em 0;
        }
        p:last-child {
            margin-bottom: 0;
        }
    `;

    export const Role = styled.div`
        font-size: 12px;
        line-height: 1.4;
        color: ${ThemeColors.PRIMARY};
        font-family: "GilmerMedium";
        font-weight: bold;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        margin-bottom: 4px;

        p {
            display: inline;
            margin: 0;
        }
    `;

    export const Instructions = styled.div`
        font-size: 12px;
        line-height: 1.4;
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.7;
        flex: 1;
        min-height: 0;
        overflow: hidden;

        p {
            margin: 0 0 0.3em 0;
        }
        p:last-child {
            margin-bottom: 0;
        }
    `;

    export const MenuButton = styled(Button)`
        border-radius: 5px;
    `;

    export const MemoryContainer = styled.div`
        width: 100%;
        border-bottom: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
        padding-bottom: 10px;
        z-index: 2;
    `;

    export const MemoryButton = styled.div<{ readOnly: boolean }>`
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 8px 0;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 4px;
        background-color: transparent;
        color: ${ThemeColors.ON_SURFACE};
        font-size: 14px;
        font-family: "GilmerRegular";
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        &:hover {
            background-color: ${ThemeColors.SURFACE_BRIGHT};
            border-color: ${(props: { readOnly: boolean }) =>
            props.readOnly ? ThemeColors.OUTLINE_VARIANT : ThemeColors.SECONDARY};
        }
    `;

    export const MemoryCard = styled.div<{ readOnly: boolean }>`
        width: 100%;
        padding: 8px 6px 8px 12px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 4px;
        background-color: transparent;
        color: ${ThemeColors.ON_SURFACE};
        cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
        &:hover {
            border-color: ${(props: { readOnly: boolean }) =>
            props.readOnly ? ThemeColors.OUTLINE_VARIANT : ThemeColors.SECONDARY};
        }
    `;

    export const MemoryTitle = styled.div`
        font-size: 14px;
        font-family: "GilmerMedium";
        font-weight: bold;
        margin-bottom: 4px;
    `;

    export const MemoryMeta = styled.div`
        font-size: 12px;
        font-family: monospace;
        color: ${ThemeColors.ON_SURFACE};
        opacity: 0.7;
    `;

    export const IconBox = styled.div`
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        margin-right: 4px;
    `;

    export const PackageBadge = styled.div`
        position: absolute;
        bottom: -7px;
        right: -7px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -3px;
        z-index: 2;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
        z-index: 2;
    `;
}

export interface AgentTypeNodeWidgetProps {
    model: AgentTypeNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export function AgentTypeNodeWidget(props: AgentTypeNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const { onNodeSelect, goToSource, agentNode, readOnly, selectedNodeId } = useDiagramContext();

    const [isHovered, setIsHovered] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    const isMenuOpen = Boolean(anchorEl);

    const [memoryMenuAnchorEl, setMemoryMenuAnchorEl] = useState<HTMLElement | SVGSVGElement>(null);
    const [memoryMenuButtonElement, setMemoryMenuButtonElement] = useState<HTMLElement | null>(null);
    const isMemoryMenuOpen = Boolean(memoryMenuAnchorEl);

    const isSelected = selectedNodeId === model.node.id;
    const hasError = nodeHasError(model.node);
    const nodeMetadata = model.node.metadata?.data as NodeMetadata;
    const showModelCircle = Boolean(nodeMetadata?.modelProviderParam);
    const nodeModelIconUrl = nodeMetadata?.model?.path;
    const showMemory = Boolean(nodeMetadata?.memoryParam);
    const memory = nodeMetadata?.memory;
    const sanitizedAgent = nodeMetadata?.agent ? sanitizeAgentData(nodeMetadata.agent) : undefined;
    const hasPrompt = Boolean(sanitizedAgent?.role && sanitizedAgent?.instructions);
    const description = nodeMetadata?.agentDescription;
    const tools: ToolData[] = nodeMetadata?.tools || [];

    const title = "AI Agent";
    const isPrebuilt = !!model.node.codedata?.org;
    const variableName = model.node.properties?.variable?.value as ReactNode;

    const onNodeClick = () => {
        if (readOnly) {
            return;
        }
        onClick?.(model.node);
        onNodeSelect?.(model.node);
        setAnchorEl(null);
    };

    const onModelEditClick = () => {
        if (readOnly) {
            return;
        }
        agentNode?.onModelSelect?.(model.node);
    };

    const onMemoryClick = (event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (readOnly) {
            return;
        }
        agentNode?.onSelectMemoryManager?.(model.node);
        setMemoryMenuAnchorEl(null);
    };

    const onMemoryDeleteClick = () => {
        if (readOnly) {
            return;
        }
        agentNode?.onDeleteMemoryManager?.(model.node);
        setMemoryMenuAnchorEl(null);
    };

    const handleOnMemoryMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        setMemoryMenuAnchorEl(event.currentTarget);
    };

    const handleMemoryContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setMemoryMenuAnchorEl(memoryMenuButtonElement || event.currentTarget);
    };

    const handleMemoryMenuClose = () => {
        setMemoryMenuAnchorEl(null);
    };

    const memoryMenuItems: Item[] = [
        { id: "edit", label: "Edit", onClick: () => onMemoryClick() },
        { id: "delete", label: "Delete", onClick: () => onMemoryDeleteClick() },
    ];

    const onGoToSource = () => {
        goToSource?.(model.node);
        setAnchorEl(null);
    };

    const onChatWithAgent = () => {
        agentNode?.onChatWithAgent?.(model.node);
        setAnchorEl(null);
    };

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };

    const handleOnContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        setAnchorEl(menuButtonElement || event.currentTarget);
    };

    const menuItems: Item[] = [
        ...(agentNode?.onChatWithAgent ? [{
            id: "chat",
            label: "Chat",
            onClick: () => onChatWithAgent(),
        }] : []),
        { id: "edit", label: "Edit", onClick: () => onNodeClick() },
        { id: "goToSource", label: "Source", onClick: () => onGoToSource() },
    ];

    const svgHeight = model.node.viewState?.ch || NODE_HEIGHT;

    return (
        <Styles.Node data-testid="agent-type-node" readOnly={readOnly}>
            <Styles.Box
                hovered={isHovered}
                hasError={hasError}
                readOnly={readOnly}
                isSelected={isSelected}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={onNodeClick}
                onContextMenu={!readOnly ? handleOnContextMenu : undefined}
                title="Configure Agent"
            >
                <Styles.TopPortWidget port={model.getPort("in")!} engine={engine} />
                <Styles.Column style={{ height: `${model.node.viewState?.ch}px` }}>
                    <Styles.Row>
                        {isPrebuilt ? (
                            <Styles.IconBox onClick={onNodeClick}>
                                <NodeIcon type={model.node.codedata.node} size={24} />
                                <Styles.PackageBadge>
                                    <Icon name="bi-box" iconSx={{ fontSize: "12px" }} sx={{ color: "orange" }} />
                                </Styles.PackageBadge>
                            </Styles.IconBox>
                        ) : (
                            <Styles.Icon onClick={onNodeClick}>
                                <NodeIcon type={model.node.codedata.node} size={24} />
                            </Styles.Icon>
                        )}
                        <Styles.Header onClick={onNodeClick}>
                            <Styles.Title>{title}</Styles.Title>
                            <Styles.Description>{variableName}</Styles.Description>
                        </Styles.Header>
                        <Styles.ActionButtonGroup>
                            {hasError && <DiagnosticsPopUp node={model.node} />}
                            <Styles.MenuButton
                                ref={setMenuButtonElement}
                                buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                appearance="icon"
                                onClick={handleOnMenuClick}
                            >
                                <MoreVertIcon />
                            </Styles.MenuButton>
                        </Styles.ActionButtonGroup>
                        <Popover
                            open={isMenuOpen}
                            anchorEl={anchorEl}
                            handleClose={() => setAnchorEl(null)}
                            sx={{ padding: 0, borderRadius: 0 }}
                        >
                            <Menu>
                                <>
                                    {menuItems.map((item) => (
                                        <MenuItem key={item.id} item={item} />
                                    ))}
                                </>
                            </Menu>
                        </Popover>
                    </Styles.Row>
                    {showMemory && (
                        <Styles.MemoryContainer>
                            {memory ? (
                                <Styles.MemoryCard
                                    readOnly={readOnly}
                                    onClick={onMemoryClick}
                                    title="Configure Memory"
                                    onContextMenu={!readOnly ? handleMemoryContextMenu : undefined}
                                >
                                    <Styles.Row>
                                        <div style={{ flex: 1 }}>
                                            <Styles.MemoryTitle>Memory</Styles.MemoryTitle>
                                            <Styles.MemoryMeta>
                                                {(memory?.type || "MessageWindowChatMemory").replace(/^ai:/, "")}
                                            </Styles.MemoryMeta>
                                        </div>
                                        <Styles.MenuButton
                                            ref={setMemoryMenuButtonElement}
                                            buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                            appearance="icon"
                                            onClick={handleOnMemoryMenuClick}
                                        >
                                            <MoreVertIcon />
                                        </Styles.MenuButton>
                                    </Styles.Row>
                                </Styles.MemoryCard>
                            ) : (
                                <Styles.MemoryButton readOnly={readOnly} onClick={onMemoryClick} title="Add Memory">
                                    <Icon name="bi-plus" sx={{ fontSize: "16px", marginRight: "4px" }} />
                                    Add Memory
                                </Styles.MemoryButton>
                            )}
                            <Popover
                                open={isMemoryMenuOpen}
                                anchorEl={memoryMenuAnchorEl}
                                handleClose={handleMemoryMenuClose}
                                sx={{ padding: 0, borderRadius: 0 }}
                            >
                                <Menu>
                                    <>
                                        {memoryMenuItems.map((item) => (
                                            <MenuItem key={item.id} item={item} />
                                        ))}
                                    </>
                                </Menu>
                            </Popover>
                        </Styles.MemoryContainer>
                    )}
                    {(hasPrompt || description) && (
                        <>
                            {!showMemory && <Styles.Divider />}
                            <Styles.DescriptionBlock readOnly={readOnly} onClick={onNodeClick}>
                                {hasPrompt ? (
                                    <>
                                        <Styles.Role>
                                            <ReactMarkdown
                                                disallowedElements={["script", "iframe", "object", "embed", "link", "style"]}
                                                unwrapDisallowed={true}
                                            >
                                                {sanitizedAgent.role}
                                            </ReactMarkdown>
                                        </Styles.Role>
                                        <Styles.Instructions>
                                            <ReactMarkdown
                                                disallowedElements={["script", "iframe", "object", "embed", "link", "style"]}
                                                unwrapDisallowed={true}
                                            >
                                                {sanitizedAgent.instructions}
                                            </ReactMarkdown>
                                        </Styles.Instructions>
                                    </>
                                ) : (
                                    <Styles.AgentDescription>
                                        <ReactMarkdown
                                            disallowedElements={["script", "iframe", "object", "embed", "link", "style"]}
                                            unwrapDisallowed={true}
                                        >
                                            {description}
                                        </ReactMarkdown>
                                    </Styles.AgentDescription>
                                )}
                            </Styles.DescriptionBlock>
                        </>
                    )}
                </Styles.Column>
                <Styles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </Styles.Box>

            {(showModelCircle || tools.length > 0) && (
                <svg
                    width={NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH + 10}
                    height={svgHeight}
                    viewBox={`0 0 300 ${svgHeight}`}
                    style={{ marginLeft: "-10px", position: "relative", zIndex: 1 }}
                >
                    <defs>
                        <marker
                            id={`${model.node.id}-arrow-head`}
                            markerWidth="4"
                            markerHeight="4"
                            refX="3"
                            refY="2"
                            viewBox="0 0 4 4"
                            orient="auto"
                        >
                            <polygon points="0,4 0,0 4,2" fill={ThemeColors.ON_SURFACE} />
                        </marker>
                        <marker
                            id={`${model.node.id}-diamond-start`}
                            markerWidth="8"
                            markerHeight="8"
                            refX="4.5"
                            refY="4"
                            viewBox="0 0 8 8"
                            orient="auto"
                        >
                            <circle cx="4" cy="4" r="3" fill={ThemeColors.SURFACE_DIM} stroke={ThemeColors.ON_SURFACE} strokeWidth="1" />
                        </marker>
                    </defs>
                    {showModelCircle && (
                        <>
                            <line
                                x1="0"
                                y1="25"
                                x2="57"
                                y2="25"
                                style={{
                                    stroke: ThemeColors.ON_SURFACE,
                                    strokeWidth: 1.5,
                                    markerEnd: `url(#${model.node.id}-arrow-head)`,
                                    markerStart: `url(#${model.node.id}-diamond-start)`,
                                }}
                            />
                            <circle
                                cx="80"
                                cy="24"
                                r="22"
                                fill={ThemeColors.SURFACE_DIM}
                                stroke={ThemeColors.OUTLINE_VARIANT}
                                strokeWidth={1.5}
                                onClick={onModelEditClick}
                                css={css`
                                    cursor: ${readOnly ? "default" : "pointer"};
                                    transition: stroke 0.4s ease-out;
                                    &:hover {
                                        stroke: ${readOnly ? ThemeColors.OUTLINE_VARIANT : ThemeColors.SECONDARY};
                                    }
                                `}
                            >
                                <title>Configure Model Provider</title>
                            </circle>
                            <foreignObject x="68" y="12" width="44" height="44" style={{ pointerEvents: "none" }}>
                                {model.node.properties?.model?.value === "check ai:getDefaultModelProvider()"
                                    ? <Icon name="bi-wso2" sx={{ fontSize: 24, width: 24, height: 24 }} />
                                    : getAIModuleIcon(nodeMetadata?.model?.type) ??
                                    (nodeModelIconUrl ? <img src={nodeModelIconUrl} style={{ width: 24, height: 24 }} /> : <DefaultLlmIcon />)}
                            </foreignObject>
                        </>
                    )}
                    {tools.map((tool: ToolData, index: number) => (
                        <g
                            key={index}
                            transform={`translate(0, ${(index + 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + AGENT_NODE_TOOL_SECTION_GAP})`}
                            style={{ opacity: 0.55, cursor: "not-allowed" }}
                        >
                            <title>This tool is packaged with the agent and cannot be edited</title>
                            <line
                                x1="0"
                                y1="25"
                                x2="57"
                                y2="25"
                                style={{
                                    stroke: ThemeColors.ON_SURFACE,
                                    strokeWidth: 1.5,
                                    strokeDasharray: "6 6",
                                    markerEnd: `url(#${model.node.id}-arrow-head)`,
                                }}
                            />
                            <circle
                                cx="80"
                                cy="24"
                                r="22"
                                fill={ThemeColors.SURFACE_DIM}
                                stroke={ThemeColors.OUTLINE_VARIANT}
                                strokeWidth={1.5}
                            />
                            <foreignObject x="68" y="12" width="44" height="44" style={{ pointerEvents: "none" }}>
                                {tool.type === "Agent" ? (
                                    <Icon name="bi-ai-agent" sx={{ fontSize: "24px" }} />
                                ) : tool.path ? (
                                    <ConnectorIcon
                                        url={tool.path}
                                        style={{ width: 24, height: 24, fontSize: 24 }}
                                        fallbackIcon={<Icon name="bi-function" sx={{ fontSize: "24px" }} />}
                                        codedata={model.node?.codedata}
                                    />
                                ) : (
                                    <Icon name="bi-function" sx={{ fontSize: "24px" }} />
                                )}
                            </foreignObject>
                            <text
                                x="110"
                                y="28"
                                textAnchor="start"
                                fill={ThemeColors.ON_SURFACE}
                                fontSize="14px"
                                fontFamily="GilmerRegular"
                            >
                                {tool.name.length > 20 ? `${tool.name.slice(0, 20)}...` : tool.name}
                            </text>
                        </g>
                    ))}
                </svg>
            )}
        </Styles.Node>
    );
}

// remove leading/trailing quotes and the `string \`...\`` template wrapper
function stripWrappingQuotes(str: string): string {
    if (str.startsWith("string `") && str.endsWith("`")) {
        return str.slice("string `".length, -1);
    }
    if (
        ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'")))
        && !(str.startsWith('""') || str.startsWith("''"))
    ) {
        return str.slice(1, -1);
    }
    return str;
}

function sanitizeAgentData(data: AgentData): AgentData {
    return {
        ...data,
        role: data.role ? stripWrappingQuotes(data.role) : data.role,
        instructions: data.instructions ? stripWrappingQuotes(data.instructions) : data.instructions,
    };
}
