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

export type TopologyEdgeKind = "trigger" | "delegation";

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

// A tool the agent can call: a plain function, or a function that hands the request to another agent.
export interface TopologyTool {
    name: string;
    kind: "function" | "agent" | "mcp";
}

export interface TopologyAgentNode {
    id: string;
    name: string;
    // What the eyebrow says: "AI Agent", or the definition's name for a typed agent.
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

export type LegendKind = "trigger" | "delegation";

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
}

// Horizontal ranks left to right (triggers in the first column); vertical ranks top to bottom.
export type TopologyOrientation = "horizontal" | "vertical";

export interface LayoutOptions {
    // Canvas width at zoom 1; when given, columns spread out to use it (within bounds).
    availableWidth?: number;
    orientation?: TopologyOrientation;
    // How many handler rows each entry card draws, keyed by entry id; the rest are folded away.
    visibleRows?: Record<string, number>;
}

export interface AgentSelection {
    path: string;
    startLine: number;
    name: string;
    moduleName?: string;
}

export interface TriggerSelection {
    filePath: string;
    position: LinePosition;
    endPosition?: LinePosition;
}

