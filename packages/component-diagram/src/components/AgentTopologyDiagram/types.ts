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

export interface TopologyAgentArtifact {
    name: string;
    path: string;
    startLine: number;
    moduleName?: string;
    isDefinition: boolean;
    kind?: "durable";
}

export interface TopologyInput {
    model: CDModel;
    agents: TopologyAgentArtifact[];
}

export interface ToolChip {
    key: string;
    label: string;
    icon?: string;
}

export type TopologyEdgeKind = "trigger" | "event" | "delegation";

export type HandlerLogic = "branch" | "fork" | "loop";

export interface HandlerStep {
    triggerId: string;
    order: number;
}

export interface TopologyEdge {
    id: string;
    sourceId: string;
    targetId: string;
    kind: TopologyEdgeKind;
    handlerId?: string;
    handlers?: HandlerStep[];
    channel?: string;
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

export interface TopologyTool {
    name: string;
    kind: "function" | "agent" | "mcp" | "activity";
}

export interface TopologyChannel {
    name: string;
    request?: string;
    response?: string;
    cardinality?: string;
    senders: string[];
}

export interface TopologyRole {
    role: string;
    gate: boolean;
    decides: string[];
    releases: string[];
}

export interface TopologyAgentNode {
    id: string;
    name: string;
    kind: "agent" | "durable" | "workflow";
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
    channels: TopologyChannel[];
    people: TopologyRole[];
    activities: number;
    gatedActivities: number;
    humanTasks: string[];
    peers: string[];
}

export interface TopologyHandler {
    id: string;
    label: string;
    accessor?: string;
    filePath: string;
    position: LinePosition;
    endPosition?: LinePosition;
    logic: HandlerLogic[];
    ordered: boolean;
    sends?: string[];
    wired: boolean;
}

export interface TopologyEntryNode {
    id: string;
    kind: "service" | "automation";
    title: string;
    subtitle: string;
    glyphType: string;
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
    edgeVias: Record<string, NodePosition[]>;
    edgeBows: Record<string, number>;
    edgeLanes: Record<string, number>;
    visibleRows: Record<string, number>;
    left: number;
    width: number;
    height: number;
}

export interface TopologyFocus {
    nodes: Set<string>;
    edges: Set<string>;
    inlets: Set<string>;
}

export type TopologyOrientation = "horizontal" | "vertical";

export interface LayoutOptions {
    availableWidth?: number;
    orientation?: TopologyOrientation;
    visibleRows?: Record<string, number>;
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

