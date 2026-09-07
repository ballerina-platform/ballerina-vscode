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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { Icon, ThemeColors, getAIModuleIcon } from "@wso2/ui-toolkit";
import { NodeIcon } from "@wso2/bi-diagram";
import { resolveBrandIconFromUrl } from "@wso2/ballerina-core";
import { AgentCardNodeModel } from "./AgentCardNodeModel";
import { AGENT_CARD_MIN_HEIGHT, AGENT_CARD_WIDTH, FOCUS_FADE_MS, NODE_BORDER_WIDTH } from "../../../resources/constants";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";
import { CardPopover, PopoverRow } from "../../AgentTopologyDiagram/CardPopover";
import { useClickWithDragTolerance } from "../../../hooks/useClickWithDragTolerance";
import { ToolChip, TopologyAgentNode, TopologyModelProvider, TopologyTool } from "../../AgentTopologyDiagram/types";

const WARNING_COLOR = "var(--vscode-editorWarning-foreground, #cca700)";
const CIRCLE_SIZE = 22;
const GLYPH_SIZE = 14;
const RAIL_WIDTH = 56;
const MAX_CONNECTION_CHIPS = 3;
const MAX_POPOVER_TOOLS = 8;

// The instance diagram hangs the model and memory off the node's right edge; the card gives them a rail.
const Card = styled.div<{ hovered: boolean; orphan: boolean; receded: boolean; readonly?: boolean }>`
    display: grid;
    grid-template-columns: 1fr ${RAIL_WIDTH}px;
    gap: 12px;
    width: ${AGENT_CARD_WIDTH}px;
    min-height: ${AGENT_CARD_MIN_HEIGHT}px;
    box-sizing: border-box;
    padding: 14px 10px 12px 16px;
    border-radius: 10px;
    border-width: ${NODE_BORDER_WIDTH}px;
    border-style: ${(props) => (props.orphan ? "dashed" : "solid")};
    border-color: ${(props) => (props.hovered ? ThemeColors.SECONDARY : props.orphan ? WARNING_COLOR : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    cursor: ${(props) => (props.readonly ? "default" : "pointer")};
    position: relative;
    opacity: ${(props) => (props.receded ? 0.55 : 1)};
    transition: border-color 0.2s ease-out, opacity ${FOCUS_FADE_MS}ms ease;

    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 2px;
    }
`;

// The card's min height is what the layout assumes, so ports land where the edges expect them.
const Body = styled.div`
    min-width: 0;
    display: flex;
    flex-direction: column;
`;

const HeaderRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
`;

const HeaderText = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
`;

const Eyebrow = styled.div`
    font-family: "GilmerRegular";
    font-size: 11px;
    line-height: 14px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Name = styled.div`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
    font-weight: 500;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ToolsLine = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    padding-top: 12px;
    min-width: 0;
    height: ${CIRCLE_SIZE}px;
    box-sizing: content-box;
    font-family: "GilmerRegular";
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const Tools = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const Kinds = styled.div`
    display: flex;
    gap: 4px;
`;

const Count = styled.span`
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
`;

const Connections = styled.div`
    display: flex;
    gap: 4px;
    margin-left: auto;
`;

// The instance diagram draws the model, memory and every tool as a circle; the card keeps the shape.
const Circle = styled.span<{ dashed?: boolean }>`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: ${CIRCLE_SIZE}px;
    height: ${CIRCLE_SIZE}px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1.5px ${(props) => (props.dashed ? "dashed" : "solid")} ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    color: ${(props) => (props.dashed ? ThemeColors.ON_SURFACE_VARIANT : ThemeColors.ON_SURFACE)};
    font-size: 12px;
    overflow: hidden;

    svg,
    img {
        width: ${GLYPH_SIZE}px;
        height: ${GLYPH_SIZE}px;
        object-fit: contain;
    }
`;

const FunctionGlyph = styled.span`
    font-family: var(--vscode-editor-font-family, monospace);
    font-style: italic;
    font-weight: 500;
    line-height: 1;
`;

const Chip = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: ${CIRCLE_SIZE}px;
    height: ${CIRCLE_SIZE}px;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: "GilmerMedium";
    font-size: 10px;
    overflow: hidden;

    img {
        width: ${GLYPH_SIZE}px;
        height: ${GLYPH_SIZE}px;
        object-fit: contain;
    }
`;

const Rail = styled.div`
    display: grid;
    align-content: start;
    gap: 10px;
    padding-left: 10px;
    border-left: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const Slot = styled.div`
    display: grid;
    justify-items: center;
    gap: 4px;
    min-width: 0;
`;

const Caption = styled.span`
    font-family: "GilmerRegular";
    font-size: 10px;
    line-height: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const OrphanFooter = styled.div`
    margin-top: 10px;
    font-size: 11px;
    color: ${WARNING_COLOR};
    font-family: "GilmerRegular";

    u {
        cursor: pointer;
        outline: none;
    }
    u:focus-visible {
        outline: 1px solid ${WARNING_COLOR};
        outline-offset: 2px;
    }
`;

const OpenHint = styled.div`
    position: absolute;
    top: 10px;
    right: 12px;
    font-size: 11px;
    color: ${ThemeColors.SECONDARY};
`;

const LeftPortWidget = styled(PortWidget)`
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
`;

const RightPortWidget = styled(PortWidget)`
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
`;

const TopPortWidget = styled(PortWidget)`
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
`;

const BottomPortWidget = styled(PortWidget)`
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
`;

// Brand mark for the known providers (WSO2, OpenAI, Anthropic, ...), the model glyph for the rest.
function modelGlyph(provider: TopologyModelProvider): React.ReactNode {
    return getAIModuleIcon(provider.type, GLYPH_SIZE) ?? <NodeIcon type="MODEL_PROVIDER" size={GLYPH_SIZE} />;
}

function chipGlyph(chip: ToolChip): React.ReactNode {
    const url = chip.icon ?? "";
    const iconSx = { width: GLYPH_SIZE, height: GLYPH_SIZE, fontSize: GLYPH_SIZE };
    if (url.includes("ballerina_http_")) {
        return <Icon name="bi-globe" sx={iconSx} iconSx={{ fontSize: GLYPH_SIZE }} />;
    }
    if (url.includes("mcp")) {
        return <Icon name="bi-mcp" sx={iconSx} iconSx={{ fontSize: GLYPH_SIZE }} />;
    }
    const brand = resolveBrandIconFromUrl(url);
    if (brand) {
        const color = brand.color ? { color: brand.color } : {};
        return <Icon name={brand.glyph} sx={{ ...iconSx, ...color }} iconSx={{ fontSize: GLYPH_SIZE, ...color }} />;
    }
    if (url) {
        return <img src={url} alt="" />;
    }
    return <Icon name="bi-connection" sx={iconSx} iconSx={{ fontSize: GLYPH_SIZE }} />;
}

function toolLabel(count: number): string {
    return count === 0 ? "No tools" : count === 1 ? "1 tool" : `${count} tools`;
}

function memoryGlyph(): React.ReactNode {
    return <Icon name="bi-memory" sx={{ width: GLYPH_SIZE, height: GLYPH_SIZE, fontSize: GLYPH_SIZE }} iconSx={{ fontSize: GLYPH_SIZE }} />;
}

function toolGlyph(tool: TopologyTool): React.ReactNode {
    return tool.kind === "agent" ? <NodeIcon type="AGENT" size={GLYPH_SIZE} color={ThemeColors.ON_SURFACE} /> : <FunctionGlyph>ƒ</FunctionGlyph>;
}

function toolRows(tools: TopologyTool[]): PopoverRow[] {
    const rows = tools.slice(0, MAX_POPOVER_TOOLS).map((tool) => ({ key: tool.name, glyph: <Circle>{toolGlyph(tool)}</Circle>, label: tool.name }));
    const rest = tools.length - rows.length;
    return rest > 0 ? [...rows, { key: "more", label: `+${rest} more`, muted: true }] : rows;
}

function connectionRows(chips: ToolChip[]): PopoverRow[] {
    return chips.map((chip) => ({ key: chip.key, glyph: <Chip>{chipGlyph(chip)}</Chip>, label: chip.label }));
}

// Tool kinds present, as the instance diagram draws them: ƒ for a function, the robot for an agent used as a tool.
function ToolKinds({ node }: { node: TopologyAgentNode }) {
    if (node.toolCount === 0) {
        return null;
    }
    return (
        <Kinds>
            {node.functionTools > 0 && (
                <Circle>
                    <FunctionGlyph>ƒ</FunctionGlyph>
                </Circle>
            )}
            {node.agentTools > 0 && (
                <Circle>
                    <NodeIcon type="AGENT" size={GLYPH_SIZE} color={ThemeColors.ON_SURFACE} />
                </Circle>
            )}
        </Kinds>
    );
}

type HoverHandlers = Pick<React.HTMLAttributes<HTMLDivElement>, "onMouseEnter" | "onMouseLeave">;

function ConnectionChips({ chips, ...hover }: { chips: ToolChip[] } & HoverHandlers) {
    if (chips.length === 0) {
        return null;
    }
    const shown = chips.slice(0, MAX_CONNECTION_CHIPS);
    const rest = chips.length - shown.length;
    return (
        <Connections {...hover}>
            {shown.map((chip) => <Chip key={chip.key}>{chipGlyph(chip)}</Chip>)}
            {rest > 0 && <Chip>+{rest}</Chip>}
        </Connections>
    );
}

interface AgentCardNodeWidgetProps {
    model: AgentCardNodeModel;
    engine: DiagramEngine;
}

type ShowPopover = (rows: PopoverRow[]) => React.MouseEventHandler<HTMLElement>;

// Model is always drawn: an agent cannot run without one. Memory is optional, so an absent one is not shown.
function RailSlots({ node, show, hide }: { node: TopologyAgentNode; show: ShowPopover; hide: () => void }) {
    const modelRows: PopoverRow[] = node.modelProvider
        ? [{ key: "model", glyph: <Circle>{modelGlyph(node.modelProvider)}</Circle>, label: node.modelProvider.label }]
        : [{ key: "model", glyph: <Circle dashed />, label: "No model provider found", muted: true }];
    const memoryRows: PopoverRow[] = node.memory ? [{ key: "memory", glyph: <Circle>{memoryGlyph()}</Circle>, label: node.memory.label }] : [];
    return (
        <Rail>
            <Slot onMouseEnter={show(modelRows)} onMouseLeave={hide}>
                <Caption>Model</Caption>
                {modelRows[0].glyph}
            </Slot>
            {memoryRows.length > 0 && (
                <Slot onMouseEnter={show(memoryRows)} onMouseLeave={hide}>
                    <Caption>Memory</Caption>
                    {memoryRows[0].glyph}
                </Slot>
            )}
        </Rail>
    );
}

export function AgentCardNodeWidget(props: AgentCardNodeWidgetProps) {
    const { model, engine } = props;
    const { onAgentSelect, onAddTrigger, readonly, orientation, focus, setHovered } = useTopologyContext();
    const vertical = orientation === "vertical";
    const InPort = vertical ? TopPortWidget : LeftPortWidget;
    const OutPort = vertical ? BottomPortWidget : RightPortWidget;
    const [isHovered, setIsHovered] = useState(false);
    const [popover, setPopover] = useState<{ anchor: DOMRect; rows: PopoverRow[] }>();
    const node = model.node;
    const show = (rows: PopoverRow[]) => (event: React.MouseEvent<HTMLElement>) =>
        setPopover({ anchor: event.currentTarget.getBoundingClientRect(), rows });
    const hide = () => setPopover(undefined);

    const selection = () => ({
        path: node.filePath,
        startLine: node.position.line,
        name: node.name,
        moduleName: node.moduleName,
    });
    const handleClick = () => onAgentSelect(selection());
    const handleAddTrigger = (event: React.SyntheticEvent) => {
        event.stopPropagation();
        (onAddTrigger ?? onAgentSelect)(selection());
    };

    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(handleClick);

    return (
        <Card
            hovered={isHovered}
            orphan={node.orphan}
            receded={focus !== undefined && !focus.nodes.has(model.getID())}
            readonly={readonly}
            tabIndex={0}
            onMouseEnter={() => {
                setHovered?.(model.getID());
                if (!readonly) {
                    setIsHovered(true);
                }
            }}
            onMouseLeave={() => {
                setHovered?.(undefined);
                if (!readonly) {
                    setIsHovered(false);
                }
            }}
            onMouseDown={!readonly ? handleMouseDown : undefined}
            onMouseUp={!readonly ? handleMouseUp : undefined}
            onKeyDown={(event) => {
                if (!readonly && (event.key === "Enter" || event.key === " ")) {
                    handleClick();
                }
            }}
        >
            <InPort port={model.getPort("in")!} engine={engine} />
            <OutPort port={model.getPort("out")!} engine={engine} />
            {isHovered && !readonly && <OpenHint>Open ↗</OpenHint>}
            <Body>
                <HeaderRow>
                    <NodeIcon type="AGENT" size={24} />
                    <HeaderText title={node.name}>
                        <Eyebrow>{node.typeName}</Eyebrow>
                        <Name>{node.name}</Name>
                    </HeaderText>
                </HeaderRow>
                <ToolsLine>
                    <Tools onMouseEnter={node.tools.length ? show(toolRows(node.tools)) : undefined} onMouseLeave={hide}>
                        <ToolKinds node={node} />
                        <Count>{toolLabel(node.toolCount)}</Count>
                    </Tools>
                    <ConnectionChips chips={node.chips} onMouseEnter={show(connectionRows(node.chips))} onMouseLeave={hide} />
                </ToolsLine>
                {node.orphan && (
                    <OrphanFooter>
                        No trigger yet ·{" "}
                        <u
                            role="button"
                            tabIndex={readonly ? -1 : 0}
                            onMouseDown={(event) => event.stopPropagation()}
                            onMouseUp={(event) => event.stopPropagation()}
                            onClick={readonly ? undefined : handleAddTrigger}
                            onKeyDown={(event) => !readonly && (event.key === "Enter" || event.key === " ") && handleAddTrigger(event)}
                        >
                            Add Trigger
                        </u>
                    </OrphanFooter>
                )}
            </Body>
            <RailSlots node={node} show={show} hide={hide} />
            {popover && <CardPopover rows={popover.rows} anchor={popover.anchor} zoom={engine.getModel().getZoomLevel() / 100} />}
        </Card>
    );
}
