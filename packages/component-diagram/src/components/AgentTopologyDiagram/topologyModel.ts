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
    HandlerConstruct,
    HandlerLogic,
    HandlerStep,
    LegendKind,
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

// What the canvas draws for one handler: its agents, and whether their order is known well enough to chain them.
interface Handler {
    trigger: TopologyTriggerNode;
    // Agent node ids in source order, repeats kept -- a repeat is what makes a handler unchainable.
    calls: string[];
    // Agents the handler reaches only through a helper, so no call site is known.
    reached: string[];
}

function logicOf(kind: CDAgentCallGroup["kind"]): HandlerLogic {
    if (kind === "fork") {
        return "fork";
    }
    return kind === "while" || kind === "foreach" ? "loop" : "branch";
}

const LOGIC_ORDER: HandlerLogic[] = ["branch", "fork", "loop"];

// The constructs a handler's calls sit inside, in source order. Two branches of one `if` share a group id, so
// they are one construct carrying both conditions.
function constructsIn(calls: CDAgentCall[]): HandlerConstruct[] {
    const byId = new Map<string, HandlerConstruct>();
    (calls ?? []).forEach((call) => (call.groups ?? []).forEach((group) => {
        const existing = byId.get(group.id);
        if (!existing) {
            byId.set(group.id, { logic: logicOf(group.kind), kind: group.kind, id: group.id, labels: group.label ? [group.label] : [] });
        } else if (group.label && !existing.labels.includes(group.label)) {
            existing.labels.push(group.label);
        }
    }));
    return [...byId.values()];
}

function logicIn(constructs: HandlerConstruct[]): HandlerLogic[] {
    const found = new Set(constructs.map((construct) => construct.logic));
    return LOGIC_ORDER.filter((kind) => found.has(kind));
}

// A chain says "then this one runs", so it may only be drawn where that is true of every step: no construct
// around any call, and no agent called twice (a chain would have to revisit a node and would lose a step).
function chainable(handler: Handler): boolean {
    return handler.trigger.logic.length === 0 && new Set(handler.calls).size === handler.calls.length;
}

function chainPairs(calls: string[]): string[] {
    return calls.slice(1).map((target, index) => `${calls[index]}|${target}`);
}

// Two handlers that run the same pair in opposite orders cannot both be chains: the canvas would draw a cycle
// that does not exist. Neither is more right than the other, so both fall back to a fan.
function resolveOrderConflicts(handlers: Handler[]): void {
    const owners = new Map<string, Handler[]>();
    handlers.forEach((handler) => {
        if (handler.trigger.ordered) {
            chainPairs(handler.calls).forEach((pair) => owners.set(pair, [...(owners.get(pair) ?? []), handler]));
        }
    });
    owners.forEach((holders, pair) => {
        const [source, target] = pair.split("|");
        const opposed = owners.get(`${target}|${source}`);
        if (opposed) {
            [...holders, ...opposed].forEach((handler) => (handler.trigger.ordered = false));
        }
    });
}

function edge(sourceId: string, targetId: string, kind: TopologyEdgeKind, step?: HandlerStep): TopologyEdge {
    return { id: `${sourceId}${kind === "delegation" ? "=>" : "->"}${targetId}`, sourceId, targetId, kind, handlers: step ? [step] : undefined };
}

// Handlers that share a step produce the same edge twice; the canvas draws it once, crediting every handler.
function mergeDuplicateEdges(edges: TopologyEdge[]): TopologyEdge[] {
    const byId = new Map<string, TopologyEdge>();
    edges.forEach((link) => {
        const existing = byId.get(link.id);
        if (!existing) {
            byId.set(link.id, link);
            return;
        }
        if (link.handlers) {
            existing.handlers = [...(existing.handlers ?? []), ...link.handlers];
        }
    });
    return [...byId.values()];
}

// An ordered handler is a chain from its trigger; any other handler fans, and its badge says why. Either way an
// edge means one thing only: this entry point runs this agent.
function handlerEdges(handler: Handler): TopologyEdge[] {
    const triggerId = handler.trigger.id;
    const steps = [...new Set(handler.calls)];
    const drawn = handler.trigger.ordered
        ? steps.map((agentId, index) => edge(index === 0 ? triggerId : steps[index - 1], agentId, "trigger", { triggerId, order: index + 1 }))
        : steps.map((agentId, index) => edge(triggerId, agentId, "trigger", { triggerId, order: index + 1 }));
    const helped = handler.reached
        .filter((agentId) => !steps.includes(agentId))
        .map((agentId) => edge(triggerId, agentId, "trigger"));
    return [...drawn, ...helped];
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

interface AgentCallSite {
    location: { startLine: { line: number; offset: number }; endLine?: { line: number; offset: number } };
    connections?: string[];
    agentCalls?: CDAgentCall[];
}

function buildHandler(
    triggerId: string,
    labels: TriggerLabels,
    filePath: string,
    fn: AgentCallSite,
    uuidToNodeId: Map<string, string>,
    delegated: Set<string>
): Handler | undefined {
    const agentUuids = triggeredAgentUuids(fn, uuidToNodeId, delegated);
    if (agentUuids.length === 0) {
        return undefined;
    }
    const constructs = constructsIn(fn.agentCalls);
    const trigger: TopologyTriggerNode = {
        id: triggerId,
        label1: labels.label1,
        label2: labels.label2,
        glyphType: labels.glyphType,
        icon: labels.icon,
        filePath,
        position: fn.location.startLine,
        endPosition: fn.location.endLine,
        logic: logicIn(constructs),
        constructs,
        ordered: false,
    };
    const handler: Handler = {
        trigger,
        calls: (fn.agentCalls ?? []).map((call) => uuidToNodeId.get(call.connection)).filter((id): id is string => id !== undefined),
        reached: agentUuids.map((uuid) => uuidToNodeId.get(uuid)),
    };
    trigger.ordered = chainable(handler);
    return handler;
}

function buildServiceHandlers(model: CDModel, uuidToNodeId: Map<string, string>): Handler[] {
    const handlers: Handler[] = [];
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
            const handler = buildHandler(triggerId, labels, service.location.filePath, fn, uuidToNodeId, delegated);
            if (handler) {
                handlers.push(handler);
            }
        }
    }
    return handlers;
}

function buildAutomationHandler(model: CDModel, uuidToNodeId: Map<string, string>): Handler | undefined {
    const automation: CDAutomation | undefined = model.automation;
    if (!automation) {
        return undefined;
    }
    const triggerId = agentNodeId(automation.location.filePath, automation.location.startLine.line);
    return buildHandler(
        triggerId,
        { label1: "main", label2: "automation", glyphType: "automation" },
        automation.location.filePath,
        automation,
        uuidToNodeId,
        delegatedAgentUuids(model)
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
            edges.push(edge(sourceId, targetId, "delegation"));
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

function computeLegendKinds(triggers: TopologyTriggerNode[], edges: TopologyEdge[]): LegendKind[] {
    const kinds: LegendKind[] = [];
    if (triggers.length > 0) {
        kinds.push("trigger");
    }
    if (edges.some((link) => link.kind === "delegation")) {
        kinds.push("delegation");
    }
    if (triggers.some((trigger) => trigger.logic.length > 0)) {
        kinds.push("logic");
    }
    return kinds;
}

export function buildTopology(input: TopologyInput): TopologyGraph {
    const { model, agents } = input;
    const { nodes: agentNodes, uuidToNodeId } = buildAgentNodes(model, agents);

    const handlers = buildServiceHandlers(model, uuidToNodeId);
    const automation = buildAutomationHandler(model, uuidToNodeId);
    if (automation) {
        handlers.push(automation);
    }
    resolveOrderConflicts(handlers);

    const triggers = handlers.map((handler) => handler.trigger);
    const delegationEdges = buildDelegationEdges(model, uuidToNodeId);
    const edges = mergeDuplicateEdges([...handlers.flatMap(handlerEdges), ...delegationEdges]);

    markReachability(agentNodes, triggers, edges);

    return {
        agents: agentNodes,
        triggers,
        edges,
        wiredNothing: triggers.length === 0,
        legendKinds: computeLegendKinds(triggers, edges),
    };
}
