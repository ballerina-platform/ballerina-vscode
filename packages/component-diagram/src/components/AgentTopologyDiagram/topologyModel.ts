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
function toolFacts(connection: CDConnection | undefined): Pick<TopologyAgentNode, "toolCount" | "functionTools" | "agentTools" | "mcpTools" | "tools"> {
    const handoffs = new Set(Object.keys(connection?.agentTools ?? {}));
    const tools: TopologyTool[] = [
        ...(connection?.dependentFunctions ?? []).map((name): TopologyTool => ({ name, kind: handoffs.has(name) ? "agent" : "function" })),
        ...(connection?.mcpToolKits ?? []).map((name): TopologyTool => ({ name, kind: "mcp" })),
    ];
    const count = (kind: TopologyTool["kind"]): number => tools.filter((tool) => tool.kind === kind).length;
    return { toolCount: tools.length, functionTools: count("function"), agentTools: count("agent"), mcpTools: count("mcp"), tools };
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
function branchChips(group: CDAgentCallGroup): EdgeChip[] {
    return (group.kind === "if" || group.kind === "match") ? [{ kind: "condition", text: group.label }] : [];
}

function sequenceChip(text: string, steps: string[]): EdgeChip {
    return { kind: "sequence", text, steps };
}

// Two conditions that lead to the same agent share one pill; two handlers that run the same step keep both numbers.
function mergeChip(edge: TopologyEdge, chip: EdgeChip): void {
    if (chip.kind === "sequence") {
        if (!edge.chips.some((existing) => existing.kind === "sequence" && existing.text === chip.text && existing.triggerId === chip.triggerId)) {
            edge.chips.push(chip);
        }
        return;
    }
    const pill = edge.chips.find((existing) => existing.kind === "condition");
    if (!pill) {
        edge.chips.push(chip);
    } else if (!pill.text.split(" | ").includes(chip.text)) {
        pill.text = `${pill.text} | ${chip.text}`;
    }
}

// Handlers that share a step produce the same edge twice; the canvas draws it once with every handler's chips.
function mergeDuplicateEdges(edges: TopologyEdge[]): TopologyEdge[] {
    const byId = new Map<string, TopologyEdge>();
    edges.forEach((edge) => {
        const existing = byId.get(edge.id);
        if (!existing) {
            byId.set(edge.id, edge);
            return;
        }
        edge.chips.forEach((chip) => mergeChip(existing, chip));
    });
    return [...byId.values()];
}

// One construct body, or the handler itself: its steps chain one after the other from its entry.
interface Body {
    entry: string;
    branch: EdgeChip[];
    steps: string[];
    entryEdge: Map<string, string>;
    lastStep?: string;
}

// The handler's steps, chained within each body: a plain call hangs off the body's previous step (agent
// or split), a construct's split does too and opens a body of its own, and the call after a split leaves
// the split as its continuation. Each step's incoming edge carries its number when its body has two or more.
class HandlerBuilder {
    readonly edges = new Map<string, TopologyEdge>();
    readonly splits = new Map<string, TopologySplitNode>();
    private readonly bodies = new Map<string, Body>();

    constructor(private readonly triggerId: string, private readonly names: Map<string, string>) {
        this.bodies.set("", { entry: triggerId, branch: [], steps: [], entryEdge: new Map() });
    }

    // Walks the call's enclosing constructs, outermost first: each split is a step of the body around it,
    // the agent a step of the innermost body.
    addCall(agentId: string, groups: CDAgentCallGroup[]): void {
        let body = this.bodies.get("");
        let key = "";
        groups.forEach((group) => {
            const split = this.splitFor(group, body);
            this.addStep(body, split.id, "stem");
            key = `${key}/${group.id}:${group.label}`;
            body = this.bodyFor(key, split.id, branchChips(group));
        });
        this.addStep(body, agentId, "trigger");
    }

    private bodyFor(key: string, entry: string, branch: EdgeChip[]): Body {
        if (!this.bodies.has(key)) {
            this.bodies.set(key, { entry, branch, steps: [], entryEdge: new Map() });
        }
        return this.bodies.get(key);
    }

    private splitFor(group: CDAgentCallGroup, body: Body): TopologySplitNode {
        const id = `${this.triggerId}::${group.id}`;
        if (!this.splits.has(id)) {
            const parentId = body.lastStep ?? body.entry;
            const parent = this.splits.get(parentId);
            this.splits.set(id, {
                id,
                kind: group.kind,
                triggerId: this.triggerId,
                parentId,
                depth: parent ? parent.depth + 1 : 1,
                header: isLoop(group.kind) ? group.label : undefined,
            });
        }
        return this.splits.get(id);
    }

    // The edge leaving the body's own split carries its branch; a step already in the body is not drawn again.
    // A step after a loop leaves the loop's box: an exit edge, kept apart from the loop's own body edge into the same agent.
    private addStep(body: Body, id: string, kind: TopologyEdgeKind): void {
        if (body.steps.includes(id)) {
            return;
        }
        const sourceId = body.lastStep ?? body.entry;
        const exits = body.lastStep !== undefined && this.isLoopSplit(body.lastStep);
        const edge = this.addEdge(sourceId, id, exits ? "exit" : kind, sourceId === body.entry ? body.branch : []);
        body.steps.push(id);
        body.entryEdge.set(id, edge.id);
        body.lastStep = id;
    }

    private isLoopSplit(id: string): boolean {
        const split = this.splits.get(id);
        return split !== undefined && isLoop(split.kind);
    }

    private addEdge(sourceId: string, targetId: string, kind: TopologyEdgeKind, chips: EdgeChip[]): TopologyEdge {
        const id = kind === "exit" ? `${sourceId}->>${targetId}` : `${sourceId}->${targetId}`;
        const existing = this.edges.get(id);
        if (!existing) {
            const edge = { id, sourceId, targetId, kind, chips };
            this.edges.set(id, edge);
            return edge;
        }
        chips.forEach((chip) => mergeChip(existing, chip));
        return existing;
    }

    // A body with two or more steps runs them in order: number the edge into each one. Bodies come outermost
    // first, so the steps inside a numbered split carry its number ahead of their own (2.1, 2.2).
    numberSteps(): void {
        const numberOf = new Map<string, string>();
        this.bodies.forEach((body) => {
            if (body.steps.length < 2) {
                return;
            }
            const prefix = numberOf.has(body.entry) ? `${numberOf.get(body.entry)}.` : "";
            const steps = body.steps.map((id) => this.names.get(id) ?? SPLIT_LABEL[this.splits.get(id).kind]);
            body.steps.forEach((id, index) => {
                numberOf.set(id, `${prefix}${index + 1}`);
                this.edges.get(body.entryEdge.get(id)).chips.unshift(sequenceChip(numberOf.get(id), steps));
            });
        });
    }

    // A loop's members are the steps of its body and, through the splits among them, of every body nested inside.
    collectLoopMembers(): void {
        const bodiesUnder = new Map<string, Body[]>();
        this.bodies.forEach((body) => bodiesUnder.set(body.entry, [...(bodiesUnder.get(body.entry) ?? []), body]));
        const under = (id: string): string[] =>
            (bodiesUnder.get(id) ?? []).flatMap((body) => body.steps.flatMap((step) => [step, ...(this.splits.has(step) ? under(step) : [])]));
        this.splits.forEach((split) => {
            if (isLoop(split.kind)) {
                split.members = [...new Set(under(split.id))];
            }
        });
    }
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
    const builder = new HandlerBuilder(triggerId, names);
    calls.forEach((call) => builder.addCall(call.agentId, call.groups));
    builder.numberSteps();
    builder.collectLoopMembers();
    // An agent reached only through a helper runs at an unknown point: a plain edge from the trigger, no number.
    const stepped = new Set([...builder.edges.values()].map((edge) => edge.targetId));
    const helped = agentIds
        .filter((agentId) => !stepped.has(agentId))
        .map((agentId) => ({ id: `${triggerId}->${agentId}`, sourceId: triggerId, targetId: agentId, kind: "trigger" as const, chips: [] }));
    return { edges: [...builder.edges.values(), ...helped], splits: [...builder.splits.values()] };
}

function collectAgentUuids(fn: { connections?: string[] }, uuidToNodeId: Map<string, string>): string[] {
    return (fn.connections ?? []).filter((uuid) => uuidToNodeId.has(uuid));
}

// The agents a handler runs: its direct calls first, then those it reaches only through helper functions. An agent
// reached through another agent's tool is delegation, not a trigger, so the fold's delegates are left out.
function triggeredAgentUuids(fn: AgentCallSite, uuidToNodeId: Map<string, string>, delegated: Set<string>): string[] {
    const called = (fn.agentCalls ?? []).map((call) => call.connection).filter((uuid) => uuidToNodeId.has(uuid));
    const reached = collectAgentUuids(fn, uuidToNodeId).filter((uuid) => !delegated.has(uuid));
    return [...new Set([...called, ...reached])];
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
    location: { startLine: { line: number; offset: number }; endLine?: { line: number; offset: number } };
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
    const agentUuids = triggeredAgentUuids(fn, uuidToNodeId, delegated);
    if (agentUuids.length === 0) {
        return undefined;
    }
    const agentIds = agentUuids.map((uuid) => uuidToNodeId.get(uuid));
    const handler = buildHandlerEdges(triggerId, agentIds, fn.agentCalls, uuidToNodeId, names);
    handler.edges.forEach((edge) => edge.chips.filter((chip) => chip.kind === "sequence").forEach((chip) => Object.assign(chip, { triggerId, handler: labels.label1 })));
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
        endPosition: fn.location.endLine,
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
            if (!targetId) {
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
    const edges = mergeDuplicateEdges([...triggerEdges, ...delegationEdges]);

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
