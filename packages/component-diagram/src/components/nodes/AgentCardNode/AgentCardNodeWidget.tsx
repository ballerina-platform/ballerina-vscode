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
import { css } from "@emotion/react";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { Icon, ThemeColors, getAIModuleIcon } from "@wso2/ui-toolkit";
import { DurableAgentIcon, NodeIcon } from "@wso2/bi-diagram";
import { resolveBrandIconFromUrl } from "@wso2/ballerina-core";
import { AgentCardNodeModel, inletPortName } from "./AgentCardNodeModel";
import {
    AGENT_CARD_MIN_HEIGHT,
    AGENT_CARD_WIDTH,
    DURABLE_RUN_PORT_OFFSET,
    ENTRY_ROW_HEIGHT,
    EVENT_COLOR,
    FOCUS_FADE_MS,
    INLET_VISIBLE_MAX,
    NODE_BG_HOVER_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_WIDTH,
    WORKFLOW_ROW_CAP,
    WORKFLOW_TASKS_GAP,
    NODE_HOVER_GLOW,
    WARNING_COLOR,
} from "../../../resources/constants";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";
import { CardPopover, PopoverRow } from "../../AgentTopologyDiagram/CardPopover";
import { useOpenableNode } from "../../AgentTopologyDiagram/useOpenableNode";
import { inletCrossOffset, inletSlot } from "../../AgentTopologyDiagram/topologyLayout";
import { inletFocusId } from "../../AgentTopologyDiagram/topologyFocus";
import { roleLabel } from "../../AgentTopologyDiagram/roleLabel";
import { ToolChip, TopologyAgentNode, TopologyChannel, TopologyModelProvider, TopologyRole, TopologyTool } from "../../AgentTopologyDiagram/types";

const CIRCLE_SIZE = 22;
const INLET_HEIGHT = 16;
const GLYPH_SIZE = 14;
const RAIL_WIDTH = 56;
const MAX_CONNECTION_CHIPS = 3;
const MAX_POPOVER_TOOLS = 8;

const HIGH_CONTRAST_HOVER_OUTLINE = css`
    outline: 1px dashed var(--vscode-contrastActiveBorder);
    outline-offset: 2px;
`;

const Card = styled.div<{ hovered: boolean; receded: boolean; readonly?: boolean; railless?: boolean }>`
    display: grid;
    grid-template-columns: ${(props) => (props.railless ? "1fr" : `1fr ${RAIL_WIDTH}px`)};
    gap: 12px;
    width: ${AGENT_CARD_WIDTH}px;
    min-height: ${AGENT_CARD_MIN_HEIGHT}px;
    box-sizing: border-box;
    padding: ${(props) => (props.railless ? "14px 16px 12px" : "14px 10px 12px 16px")};
    border-radius: 10px;
    border-width: ${NODE_BORDER_WIDTH}px;
    border-style: solid;
    border-color: ${(props) => (props.hovered ? ThemeColors.HIGHLIGHT : NODE_BORDER_COLOR)};
    ${(props) => (props.hovered ? HIGH_CONTRAST_HOVER_OUTLINE : "")}
    background-color: ${(props) => (props.hovered ? NODE_BG_HOVER_COLOR : ThemeColors.SURFACE_DIM)};
    box-shadow: ${(props) => (props.hovered ? NODE_HOVER_GLOW : "none")};
    color: ${ThemeColors.ON_SURFACE};
    cursor: ${(props) => (props.readonly ? "default" : "pointer")};
    position: relative;
    opacity: ${(props) => (props.receded ? 0.3 : 1)};
    transition: border-color 0.2s ease-out, background-color 0.2s ease-out, box-shadow 0.2s ease-out, opacity ${FOCUS_FADE_MS}ms ease;

    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 2px;
    }
`;

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

const Tasks = styled.div`
    display: flex;
    flex-direction: column;
    margin-top: ${WORKFLOW_TASKS_GAP}px;
`;

const TaskRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    height: ${ENTRY_ROW_HEIGHT}px;
    min-width: 0;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: "GilmerRegular";
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const TaskRowLabel = styled.span`
    min-width: 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12.5px;
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

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

const Capability = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 3px;
    position: relative;
`;

const GateDot = styled.span`
    position: absolute;
    left: ${CIRCLE_SIZE - 7}px;
    top: ${CIRCLE_SIZE - 7}px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${WARNING_COLOR};
    border: 1.5px solid ${ThemeColors.SURFACE_DIM};
    box-sizing: content-box;
`;

const Inlet = styled.div<{ offset: number; vertical: boolean; dimmed: boolean }>`
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: ${INLET_HEIGHT}px;
    box-sizing: border-box;
    padding: 0 6px 0 5px;
    border-radius: ${INLET_HEIGHT / 2}px;
    border: 1px solid ${EVENT_COLOR};
    background-color: ${ThemeColors.SURFACE};
    color: ${EVENT_COLOR};
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 9.5px;
    white-space: nowrap;
    opacity: ${(props) => (props.dimmed ? 0.3 : 1)};
    transition: opacity ${FOCUS_FADE_MS}ms ease;
    ${(props) =>
        props.vertical
            ? `top: 0; left: ${props.offset}px; transform: translate(-50%, calc(-100% + 7px));`
            : `left: 0; top: ${props.offset}px; transform: translate(calc(-100% + 7px), -50%);`}
`;

const InletPortWidget = styled(PortWidget)<{ vertical: boolean }>`
    position: absolute;
    ${(props) => (props.vertical ? "top: -6px; left: 50%; transform: translateX(-50%);" : "left: -6px; top: 50%; transform: translateY(-50%);")}
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

const LeftPortWidget = styled(PortWidget)<{ at?: string }>`
    position: absolute;
    left: -6px;
    top: ${(props) => props.at ?? "50%"};
    transform: translateY(-50%);
`;

const RightPortWidget = styled(PortWidget)`
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
`;

const TopPortWidget = styled(PortWidget)<{ at?: string }>`
    position: absolute;
    top: -6px;
    left: ${(props) => props.at ?? "50%"};
    transform: translateX(-50%);
`;

const BottomPortWidget = styled(PortWidget)`
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
`;

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

function mcpGlyph(): React.ReactNode {
    return <Icon name="bi-mcp" sx={{ width: GLYPH_SIZE, height: GLYPH_SIZE, fontSize: GLYPH_SIZE }} iconSx={{ fontSize: GLYPH_SIZE }} />;
}

function toolGlyph(tool: TopologyTool): React.ReactNode {
    if (tool.kind === "agent") {
        return <NodeIcon type="AGENT" size={GLYPH_SIZE} color={ThemeColors.ON_SURFACE} />;
    }
    if (tool.kind === "activity") {
        return <NodeIcon type="ACTIVITY_CALL" size={GLYPH_SIZE} color={ThemeColors.ON_SURFACE} />;
    }
    return tool.kind === "mcp" ? mcpGlyph() : <FunctionGlyph>ƒ</FunctionGlyph>;
}

function stopPrefix(people: TopologyRole[], name: string, verb: "decides" | "releases"): string | undefined {
    const who = people.filter((person) => person[verb].includes(name)).map((person) => roleLabel(person.role));
    return who.length ? `${who.join(", ")} ${verb}` : undefined;
}

const CARDINALITY_WORDS: Record<string, string> = { MULTI_EVENT: "re-arms after every answer", SINGLE_EVENT: "consumed once per run" };

function channelRows(channel: TopologyChannel): PopoverRow[] {
    const rows: PopoverRow[] = [{ key: "request", prefix: "Request", label: channel.request ?? "anydata" }];
    if (channel.response) {
        rows.push({ key: "response", prefix: "Response", label: channel.response });
    }
    if (channel.cardinality) {
        rows.push({ key: "cardinality", label: CARDINALITY_WORDS[channel.cardinality] ?? channel.cardinality, muted: true });
    }
    const senders = channel.senders.map((sender) => ({ key: `sent-${sender}`, prefix: "Sent by", label: sender }));
    return [...rows, ...(senders.length ? senders : [{ key: "no-sender", label: "No sender yet", muted: true }])];
}

function toolRows(tools: TopologyTool[], people: TopologyRole[] = []): PopoverRow[] {
    const rows = tools
        .slice(0, MAX_POPOVER_TOOLS)
        .map((tool) => ({ key: tool.name, glyph: <Circle>{toolGlyph(tool)}</Circle>, prefix: stopPrefix(people, tool.name, "releases"), label: tool.name }));
    const rest = tools.length - rows.length;
    return rest > 0 ? [...rows, { key: "more", label: `+${rest} more`, muted: true }] : rows;
}

function connectionRows(chips: ToolChip[]): PopoverRow[] {
    return chips.map((chip) => ({ key: chip.key, glyph: <Chip>{chipGlyph(chip)}</Chip>, label: chip.label }));
}

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
            {node.mcpTools > 0 && <Circle>{mcpGlyph()}</Circle>}
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

interface CapabilityProps {
    node: TopologyAgentNode;
    show: ShowPopover;
    hide: () => void;
}

type CapabilityGlyph = "ACTIVITY_CALL" | "HUMAN_TASK" | "WAIT_DATA" | "AGENT_RUN";

function capabilityGlyph(type: CapabilityGlyph): React.ReactNode {
    return <NodeIcon type={type} size={GLYPH_SIZE} color={ThemeColors.ON_SURFACE} />;
}

function namedRows(type: CapabilityGlyph, names: string[], prefix: (name: string) => string | undefined = () => undefined): PopoverRow[] {
    return names.map((name, index) => ({ key: `${index}-${name}`, glyph: <Circle>{capabilityGlyph(type)}</Circle>, prefix: prefix(name), label: name }));
}

function Capabilities({ node, show, hide }: CapabilityProps) {
    const people = node.people;
    const items: Array<{ key: string; count: number; glyph: CapabilityGlyph; rows: PopoverRow[]; gated?: boolean }> = [
        { key: "activities", count: node.activities, glyph: "ACTIVITY_CALL", rows: toolRows(node.tools, people), gated: node.gatedActivities > 0 },
        { key: "people", count: node.humanTasks.length, glyph: "HUMAN_TASK", rows: namedRows("HUMAN_TASK", node.humanTasks, (name) => stopPrefix(people, name, "decides")) },
        { key: "channels", count: node.channels.length, glyph: "WAIT_DATA", rows: namedRows("WAIT_DATA", node.channels.map((channel) => channel.name)) },
        { key: "peers", count: node.peers.length, glyph: "AGENT_RUN", rows: namedRows("AGENT_RUN", node.peers, (name) => stopPrefix(people, name, "releases")) },
    ];
    const present = items.filter((item) => item.count > 0);
    return (
        <Tools>
            {present.map((item) => (
                <Capability key={item.key} onMouseEnter={item.rows.length ? show(item.rows) : undefined} onMouseLeave={hide}>
                    <Circle>{capabilityGlyph(item.glyph)}</Circle>
                    {item.gated && <GateDot />}
                    <Count>{item.count}</Count>
                </Capability>
            ))}
            {present.length === 0 && <Count>No capabilities</Count>}
        </Tools>
    );
}

function ToolsSummary({ node, show, hide }: CapabilityProps) {
    if (node.kind === "workflow") {
        return null;
    }
    if (node.kind === "durable") {
        return <Capabilities node={node} show={show} hide={hide} />;
    }
    return (
        <Tools onMouseEnter={node.tools.length ? show(toolRows(node.tools)) : undefined} onMouseLeave={hide}>
            <ToolKinds node={node} />
            <Count>{toolLabel(node.toolCount)}</Count>
        </Tools>
    );
}

function WorkflowTasks({ node, show, hide }: CapabilityProps) {
    const tasks = node.humanTasks;
    const shown = tasks.slice(0, WORKFLOW_ROW_CAP);
    const folded = tasks.slice(WORKFLOW_ROW_CAP);
    return (
        <Tasks>
            {shown.map((name) => (
                <TaskRow key={name}>
                    <Circle>{capabilityGlyph("HUMAN_TASK")}</Circle>
                    <TaskRowLabel>{name}</TaskRowLabel>
                </TaskRow>
            ))}
            {folded.length > 0 && (
                <TaskRow onMouseEnter={show(namedRows("HUMAN_TASK", folded))} onMouseLeave={hide}>
                    <Circle>{capabilityGlyph("HUMAN_TASK")}</Circle>+{folded.length} more
                </TaskRow>
            )}
        </Tasks>
    );
}

interface InletsProps {
    node: TopologyAgentNode;
    model: AgentCardNodeModel;
    engine: DiagramEngine;
    vertical: boolean;
    onInlet: (channel: string | undefined, rows: PopoverRow[]) => React.MouseEventHandler<HTMLElement>;
    offInlet: () => void;
}

function Inlets({ node, model, engine, vertical, onInlet, offInlet }: InletsProps) {
    const { focus } = useTopologyContext();
    const channels = node.channels;
    const inletDimmed = (owned: TopologyChannel[]): boolean =>
        focus !== undefined && focus.nodes.has(model.getID()) && !owned.some((channel) => focus.inlets.has(inletFocusId(model.getID(), channel.name)));
    const shown = channels.slice(0, INLET_VISIBLE_MAX);
    const folded = channels.slice(INLET_VISIBLE_MAX);
    const port = (channel: TopologyChannel) => (
        <InletPortWidget key={channel.name} port={model.getPort(inletPortName(channel.name))!} engine={engine} vertical={vertical} />
    );
    const at = (index: number) => inletCrossOffset(index, channels.length, vertical);
    return (
        <>
            {shown.map((channel, index) => (
                <Inlet key={channel.name} offset={at(index)} vertical={vertical} dimmed={inletDimmed([channel])} onMouseEnter={onInlet(channel.name, channelRows(channel))} onMouseLeave={offInlet}>
                    {port(channel)}
                    <NodeIcon type="WAIT_DATA" size={10} color={EVENT_COLOR} />
                    {channel.name}
                </Inlet>
            ))}
            {folded.length > 0 && (
                <Inlet
                    offset={at(inletSlot(INLET_VISIBLE_MAX))}
                    vertical={vertical}
                    dimmed={inletDimmed(folded)}
                    onMouseEnter={onInlet(undefined, namedRows("WAIT_DATA", folded.map((channel) => channel.name)))}
                    onMouseLeave={offInlet}
                >
                    {folded.map(port)}+{folded.length}
                </Inlet>
            )}
        </>
    );
}

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
    const [popover, setPopover] = useState<{ anchor: DOMRect; rows: PopoverRow[] }>();
    const node = model.node;
    const show = (rows: PopoverRow[]) => (event: React.MouseEvent<HTMLElement>) =>
        setPopover({ anchor: event.currentTarget.getBoundingClientRect(), rows });
    const hide = () => setPopover(undefined);
    const durable = node.kind !== "agent";
    const isWorkflow = node.kind === "workflow";

    const onInlet = (channel: string | undefined, rows: PopoverRow[]) => (event: React.MouseEvent<HTMLElement>) => {
        show(rows)(event);
        setCardHovered(false);
        setHovered?.(channel ? inletFocusId(model.getID(), channel) : undefined);
    };
    const offInlet = () => {
        hide();
        setCardHovered(!readonly);
        setHovered?.(model.getID());
    };

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

    const { hovered, setHovered: setCardHovered, handlers } = useOpenableNode(handleClick, {
        readonly,
        onHoverChange: (isHovered) => setHovered?.(isHovered ? model.getID() : undefined),
    });

    return (
        <Card
            hovered={hovered}
            receded={focus !== undefined && !focus.nodes.has(model.getID())}
            readonly={readonly}
            railless={isWorkflow}
            {...handlers}
        >
            <InPort port={model.getPort("in")!} engine={engine} at={durable ? `${DURABLE_RUN_PORT_OFFSET}px` : undefined} />
            <OutPort port={model.getPort("out")!} engine={engine} />
            {durable && <Inlets node={node} model={model} engine={engine} vertical={vertical} onInlet={onInlet} offInlet={offInlet} />}
            <Body>
                <HeaderRow>
                    {isWorkflow ? <NodeIcon type="WORKFLOW_RUN" size={24} /> : durable ? <DurableAgentIcon size={24} /> : <NodeIcon type="AGENT" size={24} />}
                    <HeaderText title={node.name}>
                        <Eyebrow>{node.typeName}</Eyebrow>
                        <Name>{node.name}</Name>
                    </HeaderText>
                </HeaderRow>
                {isWorkflow && <WorkflowTasks node={node} show={show} hide={hide} />}
                <ToolsLine>
                    <ToolsSummary node={node} show={show} hide={hide} />
                    <ConnectionChips chips={node.chips} onMouseEnter={show(connectionRows(node.chips))} onMouseLeave={hide} />
                </ToolsLine>
                {node.orphan && (
                    <OrphanFooter>
                        {isWorkflow ? (
                            "No trigger yet"
                        ) : (
                            <>
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
                            </>
                        )}
                    </OrphanFooter>
                )}
            </Body>
            {!isWorkflow && <RailSlots node={node} show={show} hide={hide} />}
            {popover && <CardPopover rows={popover.rows} anchor={popover.anchor} zoom={engine.getModel().getZoomLevel() / 100} />}
        </Card>
    );
}
