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
    TopologyEntryNode,
    TopologyHandler,
    TopologyInput,
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

function serviceLabel(service: CDService): string {
    const label = service.displayName || service.absolutePath || service.type || "";
    return label.replace(/\\(.)/g, "$1").trim();
}

interface EntryLabels {
    title: string;
    subtitle: string;
    glyphType: string;
    icon?: string;
}

// The card's own labels, as Integrator's design diagram draws them: the base path over the service's type.
function entryLabelsFor(service: CDService): EntryLabels {
    const modulePrefix = (service.type ?? "").split(":")[0] || "http";
    return {
        title: serviceLabel(service),
        subtitle: modulePrefix === AI_MODULE ? "Agent Chat" : service.type || `${modulePrefix}:Service`,
        glyphType: modulePrefix,
        icon: service.icon || undefined,
    };
}

// A resource is its method and path; a remote function is its name.
function handlerLabelFor(fn: CDFunction | CDResourceFunction, isResource: boolean): { label: string; accessor?: string } {
    if (!isResource) {
        return { label: (fn as CDFunction).name };
    }
    const resourceFn = fn as CDResourceFunction;
    return { label: resourcePath(resourceFn.path), accessor: resourceFn.accessor.toUpperCase() };
}

interface Handler {
    entryId: string;
    node: TopologyHandler;
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

function logicIn(calls: CDAgentCall[]): HandlerLogic[] {
    const found = new Set((calls ?? []).flatMap((call) => (call.groups ?? []).map((group) => logicOf(group.kind))));
    return LOGIC_ORDER.filter((kind) => found.has(kind));
}

// A chain says "then this one runs", so it may only be drawn where that is true of every step: no construct
// around any call, and no agent called twice (a chain would have to revisit a node and would lose a step).
function chainable(handler: Handler): boolean {
    return handler.node.logic.length === 0 && new Set(handler.calls).size === handler.calls.length;
}

function chainPairs(calls: string[]): string[] {
    return calls.slice(1).map((target, index) => `${calls[index]}|${target}`);
}

// Two handlers that run the same pair in opposite orders cannot both be chains: the canvas would draw a cycle
// that does not exist. Neither is more right than the other, so both fall back to a fan.
function resolveOrderConflicts(handlers: Handler[]): void {
    const owners = new Map<string, Handler[]>();
    handlers.forEach((handler) => {
        if (handler.node.ordered) {
            chainPairs(handler.calls).forEach((pair) => owners.set(pair, [...(owners.get(pair) ?? []), handler]));
        }
    });
    owners.forEach((holders, pair) => {
        const [source, target] = pair.split("|");
        const opposed = owners.get(`${target}|${source}`);
        if (opposed) {
            [...holders, ...opposed].forEach((handler) => (handler.node.ordered = false));
        }
    });
}

function edge(sourceId: string, targetId: string, kind: TopologyEdgeKind, step?: HandlerStep): TopologyEdge {
    return { id: `${sourceId}${kind === "delegation" ? "=>" : "->"}${targetId}`, sourceId, targetId, kind, handlers: step ? [step] : undefined };
}

// An edge leaving a service leaves one of its rows: the id names the handler so two rows reaching one agent stay
// two edges, while sourceId names the card the layout places.
function rowEdge(entryId: string, handlerId: string, targetId: string, step?: HandlerStep): TopologyEdge {
    return { id: `${handlerId}->${targetId}`, sourceId: entryId, targetId, kind: "trigger", handlerId, handlers: step ? [step] : undefined };
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
    const { entryId } = handler;
    const triggerId = handler.node.id;
    const steps = [...new Set(handler.calls)];
    const fromRow = (agentId: string, order: number) => rowEdge(entryId, triggerId, agentId, { triggerId, order });
    const drawn = handler.node.ordered
        ? steps.map((agentId, index) => (index === 0 ? fromRow(agentId, 1) : edge(steps[index - 1], agentId, "trigger", { triggerId, order: index + 1 })))
        : steps.map((agentId, index) => fromRow(agentId, index + 1));
    const helped = handler.reached
        .filter((agentId) => !steps.includes(agentId))
        .map((agentId) => rowEdge(entryId, triggerId, agentId));
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
    entryId: string,
    labels: { label: string; accessor?: string },
    filePath: string,
    fn: AgentCallSite,
    uuidToNodeId: Map<string, string>,
    delegated: Set<string>
): Handler | undefined {
    const agentUuids = triggeredAgentUuids(fn, uuidToNodeId, delegated);
    if (agentUuids.length === 0) {
        return undefined;
    }
    const node: TopologyHandler = {
        id: agentNodeId(filePath, fn.location.startLine.line),
        label: labels.label,
        accessor: labels.accessor,
        filePath,
        position: fn.location.startLine,
        endPosition: fn.location.endLine,
        logic: logicIn(fn.agentCalls),
        ordered: false,
    };
    const handler: Handler = {
        entryId,
        node,
        calls: (fn.agentCalls ?? []).map((call) => uuidToNodeId.get(call.connection)).filter((id): id is string => id !== undefined),
        reached: agentUuids.map((uuid) => uuidToNodeId.get(uuid)),
    };
    node.ordered = chainable(handler);
    return handler;
}

// One card per service, holding the handlers that run agents. A service none of whose handlers runs an agent is
// not drawn at all.
function buildServiceEntries(model: CDModel, uuidToNodeId: Map<string, string>): { entries: TopologyEntryNode[]; handlers: Handler[] } {
    const entries: TopologyEntryNode[] = [];
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
        const entryId = `service::${agentNodeId(service.location.filePath, service.location.startLine.line)}`;
        const own = functions
            .map(({ fn, isResource }) => buildHandler(entryId, handlerLabelFor(fn, isResource), service.location.filePath, fn, uuidToNodeId, delegated))
            .filter((handler): handler is Handler => handler !== undefined);
        if (own.length === 0) {
            continue;
        }
        const labels = entryLabelsFor(service);
        entries.push({
            id: entryId,
            kind: "service",
            ...labels,
            filePath: service.location.filePath,
            position: service.location.startLine,
            endPosition: service.location.endLine,
            handlers: own.map((handler) => handler.node),
        });
        handlers.push(...own);
    }
    return { entries, handlers };
}

function buildAutomationEntry(model: CDModel, uuidToNodeId: Map<string, string>): { entry: TopologyEntryNode; handler: Handler } | undefined {
    const automation: CDAutomation | undefined = model.automation;
    if (!automation) {
        return undefined;
    }
    const entryId = `automation::${agentNodeId(automation.location.filePath, automation.location.startLine.line)}`;
    const handler = buildHandler(entryId, { label: "main" }, automation.location.filePath, automation, uuidToNodeId, delegatedAgentUuids(model));
    if (!handler) {
        return undefined;
    }
    return {
        entry: {
            id: entryId,
            kind: "automation",
            title: "main",
            subtitle: "automation",
            glyphType: "automation",
            filePath: automation.location.filePath,
            position: automation.location.startLine,
            endPosition: automation.location.endLine,
            handlers: [handler.node],
        },
        handler,
    };
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

function markReachability(agents: TopologyAgentNode[], entries: TopologyEntryNode[], edges: TopologyEdge[]): void {
    const adjacency = new Map<string, string[]>();
    edges.forEach((edge) => {
        if (!adjacency.has(edge.sourceId)) {
            adjacency.set(edge.sourceId, []);
        }
        adjacency.get(edge.sourceId).push(edge.targetId);
    });
    const reached = new Set<string>();
    const queue = [...entries.map((entry) => entry.id)];
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

function computeLegendKinds(handlers: TopologyHandler[], edges: TopologyEdge[]): LegendKind[] {
    const kinds: LegendKind[] = [];
    if (handlers.length > 0) {
        kinds.push("trigger");
    }
    if (edges.some((link) => link.kind === "delegation")) {
        kinds.push("delegation");
    }
    return kinds;
}

export function buildTopology(input: TopologyInput): TopologyGraph {
    const { model, agents } = input;
    const { nodes: agentNodes, uuidToNodeId } = buildAgentNodes(model, agents);

    const services = buildServiceEntries(model, uuidToNodeId);
    const entries = [...services.entries];
    const built = [...services.handlers];
    const automation = buildAutomationEntry(model, uuidToNodeId);
    if (automation) {
        entries.push(automation.entry);
        built.push(automation.handler);
    }
    resolveOrderConflicts(built);

    const handlers = built.map((handler) => handler.node);
    const delegationEdges = buildDelegationEdges(model, uuidToNodeId);
    const edges = mergeDuplicateEdges([...built.flatMap(handlerEdges), ...delegationEdges]);

    markReachability(agentNodes, entries, edges);

    return {
        agents: agentNodes,
        entries,
        handlers,
        edges,
        wiredNothing: entries.length === 0,
        legendKinds: computeLegendKinds(handlers, edges),
    };
}
