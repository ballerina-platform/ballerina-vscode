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

import { CDModel, LinePosition } from "@wso2/ballerina-core";

// An agent artifact from projectStructure.directoryMap[AGENT] ∪ [AGENT_DEFINITION].
export interface TopologyAgentArtifact {
    name: string;
    path: string;
    startLine: number;
    moduleName?: string;
    isDefinition: boolean;
    // A workflow:DurableAgent declaration (moduleName "workflow"), drawn from CDModel.workflows rather than connections.
    kind?: "durable";
}

export interface TopologyInput {
    model: CDModel;
    agents: TopologyAgentArtifact[];
}

// A tool's connection, shown as a brand chip on the agent card footer.
export interface ToolChip {
    key: string;
    label: string;
    icon?: string;
}

// trigger = runs the agent; event = sends on one of a durable agent's channels; delegation = agent to agent.
export type TopologyEdgeKind = "trigger" | "event" | "delegation";

// The constructs around a handler's agent calls. The overview does not draw them -- an edge is a fact about a
// handler and an agent, while a branch or a loop is a fact about one call site -- so the handler wears them as a
// badge, and names them in the badge's tooltip.
export type HandlerLogic = "branch" | "fork" | "loop";

// Which handler an edge's step belongs to, and where in that handler's walk order it falls -- not shown on the
// canvas, but still needed to know which handler's flow an edge is part of (hover focus) and, when an agent is
// reached by more than one edge, which one ran first (layout straightens a chain under its earliest parent).
export interface HandlerStep {
    triggerId: string;
    order: number;
}

export interface TopologyEdge {
    id: string;
    sourceId: string;
    targetId: string;
    kind: TopologyEdgeKind;
    // Which row of its source's card the edge leaves from, when the source is a service.
    handlerId?: string;
    handlers?: HandlerStep[];
    // The channel an event edge arrives on: its inlet on the durable card.
    channel?: string;
    // A delegation declared with requiresApproval: the hand-off parks on a person, the roles that release it.
    gated?: boolean;
    gatedBy?: string[];
}

export interface TopologyModelProvider {
    label: string;
    type: string;
    icon?: string;
}

export interface TopologyMemoryStore {
    label: string;
    type: string;
}

// A tool the agent can call: a plain function, a function that hands the request to another agent, an MCP toolkit,
// or a durable agent's activity.
export interface TopologyTool {
    name: string;
    kind: "function" | "agent" | "mcp" | "activity";
}

// A durable agent's declared event channel, drawn as an inlet on the card's border.
export interface TopologyChannel {
    name: string;
    request?: string;
    response?: string;
    cardinality?: string;
    // Labels of the handlers that send on this channel, filled once the edges are built.
    senders: string[];
}

// Who a durable agent stops for: a role that decides a human task, or one that releases a gated call.
export interface TopologyRole {
    role: string;
    // True when the role releases a gated activity or hand-off (drawn with the lock).
    gate: boolean;
    decides: string[];
    releases: string[];
}

export interface TopologyAgentNode {
    id: string;
    name: string;
    // "workflow" is a plain @workflow:Workflow function: run like a durable agent, but with none of its fields.
    kind: "agent" | "durable" | "workflow";
    // What the eyebrow says: "AI Agent", the definition's name for a typed agent, "Durable Agent".
    typeName: string;
    role: string;
    toolCount: number;
    functionTools: number;
    agentTools: number;
    mcpTools: number;
    tools: TopologyTool[];
    chips: ToolChip[];
    modelProvider?: TopologyModelProvider;
    memory?: TopologyMemoryStore;
    typed: boolean;
    orphan: boolean;
    filePath: string;
    position: LinePosition;
    moduleName?: string;
    // Durable-agent capabilities; empty and zero on a plain agent.
    channels: TopologyChannel[];
    people: TopologyRole[];
    activities: number;
    gatedActivities: number;
    humanTasks: string[];
    peers: string[];
}

// One handler: a resource, a remote function, or an automation's main. It owns the edges to the agents it runs,
// and it is what a click opens. Drawn as a row inside its service's card, or as the automation's own square.
export interface TopologyHandler {
    id: string;
    // "POST /report" for a resource, the function name for a remote one, "main" for an automation.
    label: string;
    // A resource's method, drawn as the pill Integrator's design diagram uses.
    accessor?: string;
    filePath: string;
    position: LinePosition;
    // The handler's end, so opening it hands the resolver the whole function, as the focus rail does.
    endPosition?: LinePosition;
    // The constructs the handler's calls sit inside: not drawn, but they decide whether it chains or fans.
    logic: HandlerLogic[];
    // Whether this handler's agents are drawn as a chain (order known) or as a fan (order not drawn).
    ordered: boolean;
    // Channels the handler sends events on; the edge into the inlet names them on the canvas, the dump lists them here.
    sends?: string[];
    // True when the handler runs or sends to an agent. An idle handler is still a row, so the card shows the whole service.
    wired: boolean;
}

// What the canvas draws in the entry column: one card per service holding its handlers as rows, and one square
// per automation. Clicking the card opens the service; clicking a row opens that handler.
export interface TopologyEntryNode {
    id: string;
    kind: "service" | "automation";
    // The service's base path or type name; "main" for an automation.
    title: string;
    // "http:Service", "Agent Chat", "automation".
    subtitle: string;
    glyphType: string;
    // The service module's Central icon, for services whose module has no brand glyph of its own.
    icon?: string;
    filePath: string;
    position: LinePosition;
    endPosition?: LinePosition;
    handlers: TopologyHandler[];
}

export type LegendKind = "trigger" | "event" | "delegation" | "gate" | "people";

export interface TopologyGraph {
    agents: TopologyAgentNode[];
    entries: TopologyEntryNode[];
    // Every entry's handlers, flattened: what the entry-points list offers and what hover focus keys on.
    handlers: TopologyHandler[];
    edges: TopologyEdge[];
    wiredNothing: boolean;
    legendKinds: LegendKind[];
}

export interface NodePosition {
    x: number;
    y: number;
}

export interface TopologyLayout {
    agentPositions: Record<string, NodePosition>;
    entryPositions: Record<string, NodePosition>;
    cardHeights: Record<string, number>;
    // Where each edge bends, keyed by edge id: just past its source, or just before the first rank a long edge skips.
    edgeVias: Record<string, NodePosition[]>;
    // Offset across the flow, in steps, for edges that arrive at one node together; wrapped back edges are not counted.
    edgeBows: Record<string, number>;
    // Top to bottom only: the cross position of the lane a row's edge steps out to before it drops.
    edgeLanes: Record<string, number>;
    // How many rows each entry card was laid out with, so the widget draws exactly what the geometry assumed.
    visibleRows: Record<string, number>;
    // Where the drawing starts: past the blank part of the trigger label block.
    left: number;
    width: number;
    height: number;
}

// What lights up when a node is hovered: the node and the handlers' chains that run through it.
export interface TopologyFocus {
    nodes: Set<string>;
    edges: Set<string>;
    // Inlets (`inletFocusId` keys) whose channel receives one of the lit event edges; the rest of a lit card's pills dim.
    inlets: Set<string>;
}

// Horizontal ranks left to right (triggers in the first column); vertical ranks top to bottom.
export type TopologyOrientation = "horizontal" | "vertical";

export interface LayoutOptions {
    // Canvas width at zoom 1; when given, columns spread out to use it (within bounds).
    availableWidth?: number;
    orientation?: TopologyOrientation;
    // How many handler rows each entry card draws, keyed by entry id; the rest are folded away.
    visibleRows?: Record<string, number>;
    // Cards the user unfolded: they draw every row and keep the footer row for "Show fewer".
    unfolded?: Set<string>;
}

export interface AgentSelection {
    path: string;
    startLine: number;
    name: string;
    moduleName?: string;
}

export interface EntrySelection {
    filePath: string;
    position: LinePosition;
    endPosition?: LinePosition;
    label: string;
    handlerCount: number;
}

export interface TriggerSelection {
    filePath: string;
    position: LinePosition;
    endPosition?: LinePosition;
}

