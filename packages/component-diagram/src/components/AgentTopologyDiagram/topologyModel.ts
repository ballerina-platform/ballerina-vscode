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

import {
    CDAgentCall,
    CDAgentCallGroup,
    CDAutomation,
    CDConnection,
    CDFunction,
    CDModel,
    CDResourceFunction,
    CDService,
} from "@wso2/ballerina-core";
import {
    EdgeChip,
    LegendKind,
    SPLIT_LABEL,
    SplitKind,
    ToolChip,
    TopologyAgentArtifact,
    TopologyAgentNode,
    TopologyMemoryStore,
    TopologyModelProvider,
    TopologyTool,
    TopologyEdge,
    TopologyEdgeKind,
    TopologyGraph,
    TopologyInput,
    TopologySplitNode,
    TopologyTriggerNode,
} from "./types";

const AI_MODULE = "ai";
const AGENT_KIND = "Agent";
const GENERATED_CHAT_SERVICE_FILE = "_agent_chat.bal";

function samePath(a: string, b: string): boolean {
    if (!a || !b) {
        return false;
    }
    return a.replace(/\\/g, "/") === b.replace(/\\/g, "/");
}

function isGeneratedChatService(filePath: string | undefined): boolean {
    return Boolean(filePath?.endsWith(GENERATED_CHAT_SERVICE_FILE));
}

function findAgentConnection(connections: CDConnection[], artifact: TopologyAgentArtifact): CDConnection | undefined {
    const byLocation = connections.find(
        (connection) =>
            samePath(connection.location?.filePath ?? "", artifact.path) &&
            connection.location?.startLine?.line === artifact.startLine
    );
    if (byLocation) {
        return byLocation;
    }
    return connections.find((connection) => connection.symbol === artifact.name);
}

function agentNodeId(filePath: string, startLine: number): string {
    return `${filePath}::${startLine}`;
}

const MODEL_PROVIDER_KIND = "Model Provider";
const DEFAULT_MODEL_PROVIDER_TYPE = "Wso2ModelProvider";
const DEFAULT_MODEL_PROVIDER_LABEL = "Default WSO2 Model Provider";

function buildModelProvider(connection: CDConnection | undefined): TopologyModelProvider | undefined {
    const provider = connection?.modelProvider;
    if (!provider) {
        return undefined;
    }
    const fallback = provider.type === DEFAULT_MODEL_PROVIDER_TYPE ? DEFAULT_MODEL_PROVIDER_LABEL : provider.type;
    return { label: provider.symbol ?? fallback, type: provider.type, icon: provider.icon };
}

function buildMemory(connection: CDConnection | undefined): TopologyMemoryStore | undefined {
    const memory = connection?.memory;
    return memory ? { label: memory.symbol ?? memory.type, type: memory.type } : undefined;
}

const PLAIN_AGENT_TYPE = "Agent";
const PLAIN_AGENT_LABEL = "AI Agent";

function typeLabel(connection: CDConnection | undefined): string {
    const typeName = connection?.typeName;
    return typeName && typeName !== PLAIN_AGENT_TYPE ? typeName : PLAIN_AGENT_LABEL;
}

// An agent's tools are its dependent functions; the design model names the ones that hand off to another agent.
function toolFacts(connection: CDConnection | undefined): Pick<TopologyAgentNode, "toolCount" | "functionTools" | "agentTools" | "tools"> {
    const handoffs = new Set(connection?.agentTools ?? []);
    const tools: TopologyTool[] = (connection?.dependentFunctions ?? []).map((name) => ({ name, kind: handoffs.has(name) ? "agent" : "function" }));
    const agentTools = tools.filter((tool) => tool.kind === "agent").length;
    return { toolCount: tools.length, functionTools: tools.length - agentTools, agentTools, tools };
}

function buildToolChips(connection: CDConnection | undefined, uuidToConnection: Map<string, CDConnection>): ToolChip[] {
    const chips: ToolChip[] = [];
    const seen = new Set<string>();
    for (const uuid of connection?.toolConnections ?? []) {
        const toolConnection = uuidToConnection.get(uuid);
        if (!toolConnection || toolConnection.kind === MODEL_PROVIDER_KIND) {
            continue;
        }
        const key = toolConnection.icon || toolConnection.symbol;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        chips.push({ key, label: toolConnection.symbol, icon: toolConnection.icon });
    }
    return chips;
}

function agentNodeFromArtifact(
    artifact: TopologyAgentArtifact,
    connections: CDConnection[],
    uuidToConnection: Map<string, CDConnection>,
    uuidToNodeId: Map<string, string>
): TopologyAgentNode {
    const connection = findAgentConnection(connections, artifact);
    const id = agentNodeId(artifact.path, artifact.startLine);
    if (connection) {
        uuidToNodeId.set(connection.uuid, id);
    }
    return {
        id,
        name: artifact.name,
        typeName: typeLabel(connection),
        role: connection?.role ?? "",
        ...toolFacts(connection),
        chips: buildToolChips(connection, uuidToConnection),
        modelProvider: buildModelProvider(connection),
        memory: buildMemory(connection),
        typed: artifact.moduleName != null && artifact.moduleName !== AI_MODULE,
        orphan: false,
        filePath: artifact.path,
        position: connection?.location?.startLine ?? { line: artifact.startLine, offset: 0 },
        moduleName: artifact.moduleName,
    };
}

// LSP4J sends the scope enum as its ordinal (GLOBAL = 1); Gson in tests sends the name.
function isModuleLevel(connection: CDConnection): boolean {
    return String(connection.scope) === "GLOBAL" || String(connection.scope) === "1";
}

// A module-level agent the design model sees but the artifact list doesn't (e.g. a non-default-module
// caller's target) still gets a node, keyed by its own location.
function agentNodeFromConnection(
    connection: CDConnection,
    uuidToConnection: Map<string, CDConnection>,
    uuidToNodeId: Map<string, string>
): TopologyAgentNode {
    const id = agentNodeId(connection.location.filePath, connection.location.startLine.line);
    uuidToNodeId.set(connection.uuid, id);
    return {
        id,
        name: connection.symbol,
        typeName: typeLabel(connection),
        role: connection.role ?? "",
        ...toolFacts(connection),
        chips: buildToolChips(connection, uuidToConnection),
        modelProvider: buildModelProvider(connection),
        memory: buildMemory(connection),
        typed: false,
        orphan: false,
        filePath: connection.location.filePath,
        position: connection.location.startLine,
    };
}

function buildAgentNodes(
    model: CDModel,
    agents: TopologyAgentArtifact[]
): { nodes: TopologyAgentNode[]; uuidToNodeId: Map<string, string> } {
    const connections = model.connections ?? [];
    const uuidToConnection = new Map(connections.map((connection) => [connection.uuid, connection]));
    const uuidToNodeId = new Map<string, string>();

    // Cards are agent instances: a definition (class) is not one, and neither is the field it holds inside.
    const nodes = agents
        .filter((artifact) => !artifact.isDefinition)
        .map((artifact) => agentNodeFromArtifact(artifact, connections, uuidToConnection, uuidToNodeId));

    connections
        .filter((connection) => connection.kind === AGENT_KIND && isModuleLevel(connection) && !uuidToNodeId.has(connection.uuid))
        .forEach((connection) => nodes.push(agentNodeFromConnection(connection, uuidToConnection, uuidToNodeId)));

    return { nodes, uuidToNodeId };
}

function resourcePath(path: string): string {
    if (!path || path === ".") {
        return "/";
    }
    return path.startsWith("/") ? path : `/${path}`;
}

interface TriggerLabels {
    label1: string;
    label2: string;
    glyphType: string;
    icon?: string;
}

function serviceLabel(service: CDService): string {
    const label = service.displayName || service.absolutePath || service.type || "";
    return label.replace(/\\(.)/g, "$1").trim();
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
    ai: "AI Chat Service",
    graphql: "GraphQL Service",
    http: "HTTP Service",
    grpc: "gRPC Service",
    tcp: "TCP Service",
    mcp: "MCP Service",
};

function serviceTypeLabel(modulePrefix: string): string {
    return SERVICE_TYPE_LABELS[modulePrefix] ?? `${modulePrefix.charAt(0).toUpperCase()}${modulePrefix.slice(1)} Service`;
}

// A bare base path under a resource label reads as a second path; the service kind disambiguates it.
function serviceSubLabel(service: CDService, modulePrefix: string): string {
    const label = serviceLabel(service);
    return label.startsWith("/") ? `${serviceTypeLabel(modulePrefix)} · ${label}` : label;
}

function triggerLabelsFor(service: CDService, fn: CDFunction | CDResourceFunction, isResource: boolean): TriggerLabels {
    const modulePrefix = (service.type ?? "").split(":")[0] || "http";
    const label2 = serviceSubLabel(service, modulePrefix);
    const icon = service.icon || undefined;
    if (modulePrefix === AI_MODULE) {
        return { label1: "Agent Chat", label2: serviceLabel(service), glyphType: AI_MODULE, icon };
    }
    if (isResource) {
        const resourceFn = fn as CDResourceFunction;
        return { label1: `${resourceFn.accessor.toUpperCase()} ${resourcePath(resourceFn.path)}`, label2, glyphType: modulePrefix, icon };
    }
    return { label1: (fn as CDFunction).name, label2, glyphType: modulePrefix, icon };
}

// One "item" is either a plain sequence step (one agent, no group) or a whole if/match/fork
// construct (one or more branches sharing the same group id, each targeting its own agent).
interface HandlerEdges {
    edges: TopologyEdge[];
    splits: TopologySplitNode[];
}

function isLoop(kind: SplitKind): boolean {
    return kind === "while" || kind === "foreach";
}

// If and match label the edge leaving them with the branch; a loop's header sits under its node instead.
function branchChips(group: CDAgentCallGroup | undefined): EdgeChip[] {
    return group && (group.kind === "if" || group.kind === "match") ? [{ kind: "condition", text: group.label }] : [];
}

function sequenceChip(step: number, steps: string[]): EdgeChip {
    return { kind: "sequence", text: String(step), steps };
}

class HandlerBuilder {
    readonly edges = new Map<string, TopologyEdge>();
    readonly splits = new Map<string, TopologySplitNode>();
    readonly topLevel: string[] = [];

    constructor(private readonly triggerId: string, private readonly names: Map<string, string>) {}

    // Walks the call's enclosing constructs, outermost first, creating a split per construct and the
    // edges between them; the last edge reaches the agent.
    addCall(agentId: string, groups: CDAgentCallGroup[]): void {
        let parentId = this.triggerId;
        groups.forEach((group, index) => {
            const splitId = `${this.triggerId}::${group.id}`;
            if (!this.splits.has(splitId)) {
                this.splits.set(splitId, {
                    id: splitId,
                    kind: group.kind,
                    triggerId: this.triggerId,
                    parentId,
                    depth: index + 1,
                    header: isLoop(group.kind) ? group.label : undefined,
                });
            }
            this.addEdge(parentId, splitId, "stem", branchChips(groups[index - 1]));
            parentId = splitId;
        });
        this.addEdge(parentId, agentId, "trigger", branchChips(groups[groups.length - 1]));
    }

    private addEdge(sourceId: string, targetId: string, kind: TopologyEdgeKind, chips: EdgeChip[]): void {
        const id = `${sourceId}->${targetId}`;
        const existing = this.edges.get(id);
        if (!existing) {
            this.edges.set(id, { id, sourceId, targetId, kind, chips });
        } else {
            chips.filter((chip) => !existing.chips.some((c) => c.text === chip.text)).forEach((chip) => existing.chips.push(chip));
        }
        if (sourceId === this.triggerId && !this.topLevel.includes(targetId)) {
            this.topLevel.push(targetId);
        }
    }

    // Two or more things directly under the trigger run in order: number the edges to them.
    numberTopLevel(): void {
        if (this.topLevel.length < 2) {
            return;
        }
        const steps = this.topLevel.map((id) => this.names.get(id) ?? SPLIT_LABEL[this.splits.get(id).kind]);
        this.topLevel.forEach((targetId, index) => {
            this.edges.get(`${this.triggerId}->${targetId}`).chips.unshift(sequenceChip(index + 1, steps));
        });
    }
}

// A handler that only runs agents one after another is drawn as a chain: trigger → first → second …
function buildSequenceChain(triggerId: string, agentIds: string[], names: Map<string, string>): TopologyEdge[] {
    const steps = agentIds.map((id) => names.get(id));
    return agentIds.map((agentId, index) => {
        const sourceId = index === 0 ? triggerId : agentIds[index - 1];
        return { id: `${sourceId}->${agentId}`, sourceId, targetId: agentId, kind: "trigger" as const, chips: [sequenceChip(index + 1, steps)] };
    });
}

interface ResolvedCall {
    agentId: string;
    groups: CDAgentCallGroup[];
}

function buildHandlerEdges(
    triggerId: string,
    agentIds: string[],
    agentCalls: CDAgentCall[] | undefined,
    uuidToNodeId: Map<string, string>,
    names: Map<string, string>
): HandlerEdges {
    const calls = (agentCalls ?? [])
        .map((call) => ({ agentId: uuidToNodeId.get(call.connection), groups: call.groups ?? [] }))
        .filter((call): call is ResolvedCall => call.agentId !== undefined);
    if (calls.length === 0) {
        const edges = agentIds.map((agentId) => ({ id: `${triggerId}->${agentId}`, sourceId: triggerId, targetId: agentId, kind: "trigger" as const, chips: [] }));
        return { edges, splits: [] };
    }
    const distinctAgents = [...new Set(calls.map((call) => call.agentId))];
    if (distinctAgents.length >= 2 && calls.every((call) => call.groups.length === 0)) {
        return { edges: buildSequenceChain(triggerId, distinctAgents, names), splits: [] };
    }
    const builder = new HandlerBuilder(triggerId, names);
    calls.forEach((call) => builder.addCall(call.agentId, call.groups));
    builder.numberTopLevel();
    return { edges: [...builder.edges.values()], splits: [...builder.splits.values()] };
}

function collectAgentUuids(fn: { connections?: string[] }, uuidToNodeId: Map<string, string>): string[] {
    return (fn.connections ?? []).filter((uuid) => uuidToNodeId.has(uuid));
}

function directAgentUuids(fn: AgentCallSite, uuidToNodeId: Map<string, string>, delegated: Set<string>): string[] {
    const called = (fn.agentCalls ?? []).map((call) => call.connection).filter((uuid) => uuidToNodeId.has(uuid));
    if (called.length > 0) {
        return [...new Set(called)];
    }
    return collectAgentUuids(fn, uuidToNodeId).filter((uuid) => !delegated.has(uuid));
}

function delegatedAgentUuids(model: CDModel): Set<string> {
    const delegated = new Set<string>();
    for (const connection of model.connections ?? []) {
        if (connection.kind === AGENT_KIND) {
            (connection.delegatesTo ?? []).forEach((uuid) => delegated.add(uuid));
        }
    }
    return delegated;
}

interface AgentIndex {
    uuidToNodeId: Map<string, string>;
    names: Map<string, string>;
}

interface AgentCallSite {
    location: { startLine: { line: number; offset: number } };
    connections?: string[];
    agentCalls?: CDAgentCall[];
}

function buildTriggerFromFunction(
    triggerId: string,
    labels: TriggerLabels,
    filePath: string,
    fn: AgentCallSite,
    uuidToNodeId: Map<string, string>,
    names: Map<string, string>,
    delegated: Set<string>,
    edges: TopologyEdge[],
    splits: TopologySplitNode[]
): TopologyTriggerNode | undefined {
    const agentUuids = directAgentUuids(fn, uuidToNodeId, delegated);
    if (agentUuids.length === 0) {
        return undefined;
    }
    const agentIds = agentUuids.map((uuid) => uuidToNodeId.get(uuid));
    const handler = buildHandlerEdges(triggerId, agentIds, fn.agentCalls, uuidToNodeId, names);
    edges.push(...handler.edges);
    splits.push(...handler.splits);
    return {
        id: triggerId,
        label1: labels.label1,
        label2: labels.label2,
        glyphType: labels.glyphType,
        icon: labels.icon,
        filePath,
        position: fn.location.startLine,
    };
}

function buildServiceTriggers(model: CDModel, index: AgentIndex, edges: TopologyEdge[], splits: TopologySplitNode[]): TopologyTriggerNode[] {
    const { uuidToNodeId, names } = index;
    const triggers: TopologyTriggerNode[] = [];
    const delegated = delegatedAgentUuids(model);
    for (const service of model.services ?? []) {
        if (isGeneratedChatService(service.location?.filePath)) {
            continue;
        }
        const functions: Array<{ fn: CDFunction | CDResourceFunction; isResource: boolean }> = [
            ...(service.resourceFunctions ?? []).map((fn) => ({ fn, isResource: true as const })),
            ...(service.remoteFunctions ?? []).map((fn) => ({ fn, isResource: false as const })),
        ];
        for (const { fn, isResource } of functions) {
            const triggerId = agentNodeId(service.location.filePath, fn.location.startLine.line);
            const labels = triggerLabelsFor(service, fn, isResource);
            const trigger = buildTriggerFromFunction(triggerId, labels, service.location.filePath, fn, uuidToNodeId, names, delegated, edges, splits);
            if (trigger) {
                triggers.push(trigger);
            }
        }
    }
    return triggers;
}

function buildAutomationTrigger(model: CDModel, index: AgentIndex, edges: TopologyEdge[], splits: TopologySplitNode[]): TopologyTriggerNode | undefined {
    const automation: CDAutomation | undefined = model.automation;
    if (!automation) {
        return undefined;
    }
    const triggerId = agentNodeId(automation.location.filePath, automation.location.startLine.line);
    return buildTriggerFromFunction(
        triggerId,
        { label1: "main", label2: "automation", glyphType: "automation" },
        automation.location.filePath,
        automation,
        index.uuidToNodeId,
        index.names,
        delegatedAgentUuids(model),
        edges,
        splits
    );
}

function buildDelegationEdges(model: CDModel, uuidToNodeId: Map<string, string>): TopologyEdge[] {
    const edges: TopologyEdge[] = [];
    for (const connection of model.connections ?? []) {
        if (connection.kind !== AGENT_KIND) {
            continue;
        }
        const sourceId = uuidToNodeId.get(connection.uuid);
        if (!sourceId) {
            continue;
        }
        const delegateUuids = new Set([...(connection.delegatesTo ?? []), ...(connection.dependentConnection ?? [])]);
        for (const uuid of delegateUuids) {
            const targetId = uuidToNodeId.get(uuid);
            if (!targetId || targetId === sourceId) {
                continue;
            }
            edges.push({ id: `${sourceId}=>${targetId}`, sourceId, targetId, kind: "delegation", chips: [] });
        }
    }
    return edges;
}

function markReachability(agents: TopologyAgentNode[], triggers: TopologyTriggerNode[], edges: TopologyEdge[]): void {
    const adjacency = new Map<string, string[]>();
    edges.forEach((edge) => {
        if (!adjacency.has(edge.sourceId)) {
            adjacency.set(edge.sourceId, []);
        }
        adjacency.get(edge.sourceId).push(edge.targetId);
    });
    const reached = new Set<string>();
    const queue = [...triggers.map((trigger) => trigger.id)];
    while (queue.length > 0) {
        const nodeId = queue.shift();
        if (reached.has(nodeId)) {
            continue;
        }
        reached.add(nodeId);
        (adjacency.get(nodeId) ?? []).forEach((next) => queue.push(next));
    }
    agents.forEach((agent) => {
        agent.orphan = !reached.has(agent.id);
    });
}

// Edges into the same node would share their final run; spread them across it, at most one step each way.
function spreadParallelEdges(edges: TopologyEdge[]): void {
    const groups = new Map<string, TopologyEdge[]>();
    edges.forEach((edge) => groups.set(edge.targetId, [...(groups.get(edge.targetId) ?? []), edge]));
    groups.forEach((group) => {
        const scale = Math.min(1, 2 / Math.max(1, group.length - 1));
        group.forEach((edge, index) => (edge.bow = (index - (group.length - 1) / 2) * scale));
    });
}

function computeLegendKinds(triggers: TopologyTriggerNode[], splits: TopologySplitNode[], edges: TopologyEdge[]): LegendKind[] {
    const kinds: LegendKind[] = [];
    if (triggers.length > 0) {
        kinds.push("trigger");
    }
    if (edges.some((edge) => edge.kind === "delegation")) {
        kinds.push("delegation");
    }
    if (edges.some((edge) => edge.chips.some((chip) => chip.kind === "sequence"))) {
        kinds.push("sequence");
    }
    if (splits.some((split) => split.kind === "if" || split.kind === "match")) {
        kinds.push("condition");
    }
    if (splits.some((split) => split.kind === "fork")) {
        kinds.push("fork");
    }
    if (splits.some((split) => split.kind === "while" || split.kind === "foreach")) {
        kinds.push("loop");
    }
    return kinds;
}

export function buildTopology(input: TopologyInput): TopologyGraph {
    const { model, agents } = input;
    const { nodes: agentNodes, uuidToNodeId } = buildAgentNodes(model, agents);

    const triggerEdges: TopologyEdge[] = [];
    const splits: TopologySplitNode[] = [];
    const index: AgentIndex = { uuidToNodeId, names: new Map(agentNodes.map((node) => [node.id, node.name])) };
    const triggers = buildServiceTriggers(model, index, triggerEdges, splits);
    const automationTrigger = buildAutomationTrigger(model, index, triggerEdges, splits);
    if (automationTrigger) {
        triggers.push(automationTrigger);
    }
    const delegationEdges = buildDelegationEdges(model, uuidToNodeId);
    const edges = [...triggerEdges, ...delegationEdges];
    spreadParallelEdges(edges);

    markReachability(agentNodes, triggers, edges);

    return {
        agents: agentNodes,
        triggers,
        splits,
        edges,
        wiredNothing: triggers.length === 0,
        legendKinds: computeLegendKinds(triggers, splits, edges),
    };
}
