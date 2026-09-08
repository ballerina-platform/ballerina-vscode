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

export type TopologyEdgeKind = "trigger" | "delegation" | "stem";

export type SplitKind = "if" | "match" | "fork" | "while" | "foreach";

export const SPLIT_LABEL: Record<SplitKind, string> = { if: "If", match: "Match", fork: "Fork", while: "While", foreach: "Foreach" };

export interface EdgeChip {
    kind: "sequence" | "condition";
    text: string;
    // Every step of the handler in order, so a sequence chip can list them.
    steps?: string[];
    // The handler a sequence number belongs to: its trigger node and its label ("POST /verified").
    triggerId?: string;
    handler?: string;
}

export interface TopologyEdge {
    id: string;
    sourceId: string;
    targetId: string;
    kind: TopologyEdgeKind;
    chips: EdgeChip[];
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
    kind: "function" | "agent";
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

export interface TopologyTriggerNode {
    id: string;
    label1: string;
    label2: string;
    glyphType: string;
    // The service module's Central icon, for triggers whose module has no brand glyph of its own.
    icon?: string;
    filePath: string;
    position: LinePosition;
    // The handler's end, so opening the trigger hands the resolver the whole function, as the focus rail does.
    endPosition?: LinePosition;
}

// Where a handler's edges fan out: the if/match diamond, the fork square or the loop square between
// the trigger and its agents. Nested constructs chain: the parent is the trigger or another split.
export interface TopologySplitNode {
    id: string;
    kind: SplitKind;
    triggerId: string;
    parentId: string;
    depth: number;
    // Loop header shown under the node ("ticket in payload.tickets", "attempts < 3").
    header?: string;
}

export type LegendKind = "trigger" | "delegation" | "sequence" | "condition" | "fork" | "loop";

export interface TopologyGraph {
    agents: TopologyAgentNode[];
    triggers: TopologyTriggerNode[];
    splits: TopologySplitNode[];
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
    triggerPositions: Record<string, NodePosition>;
    splitPositions: Record<string, NodePosition>;
    cardHeights: Record<string, number>;
    // Where each edge bends, keyed by edge id: just past its source, or just before the first rank a long edge skips.
    edgeVias: Record<string, NodePosition[]>;
    // Offset across the flow, in steps, for edges that arrive at one node together; wrapped back edges are not counted.
    edgeBows: Record<string, number>;
    // Where the drawing starts: past the blank part of the trigger label block.
    left: number;
    width: number;
    height: number;
}

// What lights up when a node is hovered: the node, everything one hop away, and the split chains between them.
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
