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
    CDActivity,
    CDAgentCall,
    CDAgentCallGroup,
    CDAutomation,
    CDConnection,
    CDFunction,
    CDModel,
    CDResourceFunction,
    CDService,
    CDWorkflow,
    toIconDescriptor,
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
    TopologyRole,
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
const DURABLE_AGENT_KIND = "DURABLE_AGENT";
const DURABLE_AGENT_LABEL = "Durable Agent";
const WORKFLOW_LABEL = "Workflow";
const GENERATED_CHAT_SERVICE_FILE = "_agent_chat.bal";

type Capabilities = Pick<TopologyAgentNode, "channels" | "people" | "activities" | "gatedActivities" | "humanTasks" | "peers">;
const NO_CAPABILITIES: Capabilities = { channels: [], people: [], activities: 0, gatedActivities: 0, humanTasks: [], peers: [] };

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

type ToolFacts = Pick<TopologyAgentNode, "toolCount" | "functionTools" | "agentTools" | "mcpTools" | "tools">;

function toolCounts(tools: TopologyTool[]): ToolFacts {
    const count = (kind: TopologyTool["kind"]): number => tools.filter((tool) => tool.kind === kind).length;
    return { toolCount: tools.length, functionTools: count("function"), agentTools: count("agent"), mcpTools: count("mcp"), tools };
}

// An agent's tools are its dependent functions; the design model names the ones that hand off to another agent.
function toolFacts(connection: CDConnection | undefined): ToolFacts {
    const handoffs = new Set(Object.keys(connection?.agentTools ?? {}));
    return toolCounts([
        ...(connection?.dependentFunctions ?? []).map((name): TopologyTool => ({ name, kind: handoffs.has(name) ? "agent" : "function" })),
        ...(connection?.mcpToolKits ?? []).map((name): TopologyTool => ({ name, kind: "mcp" })),
    ]);
}

function buildToolChips(toolConnections: string[] | undefined, uuidToConnection: Map<string, CDConnection>): ToolChip[] {
    const chips: ToolChip[] = [];
    const seen = new Set<string>();
    for (const uuid of toolConnections ?? []) {
        const toolConnection = uuidToConnection.get(uuid);
        if (!toolConnection || toolConnection.kind === MODEL_PROVIDER_KIND || seen.has(uuid)) {
            continue;
        }
        seen.add(uuid);
        chips.push({ key: uuid, label: toolConnection.symbol, icon: toolConnection.icon });
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
        kind: "agent",
        typeName: typeLabel(connection),
        role: connection?.role ?? "",
        ...toolFacts(connection),
        chips: buildToolChips(connection?.toolConnections, uuidToConnection),
        modelProvider: buildModelProvider(connection),
        memory: buildMemory(connection),
        typed: artifact.moduleName != null && artifact.moduleName !== AI_MODULE,
        orphan: false,
        filePath: artifact.path,
        position: connection?.location?.startLine ?? { line: artifact.startLine, offset: 0 },
        moduleName: artifact.moduleName,
        ...NO_CAPABILITIES,
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
        kind: "agent",
        typeName: typeLabel(connection),
        role: connection.role ?? "",
        ...toolFacts(connection),
        chips: buildToolChips(connection.toolConnections, uuidToConnection),
        modelProvider: buildModelProvider(connection),
        memory: buildMemory(connection),
        typed: false,
        orphan: false,
        filePath: connection.location.filePath,
        position: connection.location.startLine,
        ...NO_CAPABILITIES,
    };
}

function isDurableWorkflow(workflow: CDWorkflow): boolean {
    return workflow.kind === DURABLE_AGENT_KIND;
}

function findDurableWorkflow(workflows: CDWorkflow[], artifact: TopologyAgentArtifact): CDWorkflow | undefined {
    const byLocation = workflows.find(
        (workflow) =>
            samePath(workflow.location?.filePath ?? "", artifact.path) && workflow.location?.startLine?.line === artifact.startLine
    );
    return byLocation ?? workflows.find((workflow) => workflow.symbol === artifact.name);
}

// Activities join the tool list so the same popover lists everything the agent can call.
function durableToolFacts(workflow: CDWorkflow | undefined): ToolFacts {
    const handoffs = new Set(Object.keys(workflow?.agentTools ?? {}));
    return toolCounts([
        ...(workflow?.tools ?? []).map((name): TopologyTool => ({ name, kind: handoffs.has(name) ? "agent" : "function" })),
        ...(workflow?.mcpToolKits ?? []).map((name): TopologyTool => ({ name, kind: "mcp" })),
        ...(workflow?.activityDecls ?? []).map((decl): TopologyTool => ({ name: decl.name, kind: "activity" })),
    ]);
}

// A durable agent's model is one of its direct connections; the connection itself is the provider, and its own
// typeName (not a nested modelProvider field, which only an agent connection carries) is the provider's class.
function durableModelProvider(workflow: CDWorkflow | undefined, uuidToConnection: Map<string, CDConnection>): TopologyModelProvider | undefined {
    const provider = (workflow?.connections ?? []).map((uuid) => uuidToConnection.get(uuid)).find((connection) => connection?.kind === MODEL_PROVIDER_KIND);
    return provider ? { label: provider.symbol, type: provider.typeName ?? "", icon: provider.icon } : undefined;
}

// One chip per role: a human task's role decides; a gated activity's or peer's role releases, and a gate wins.
function durablePeople(workflow: CDWorkflow | undefined): TopologyRole[] {
    const roles = new Map<string, TopologyRole>();
    const add = (role: string, target: string, gate: boolean): void => {
        const entry = roles.get(role) ?? { role, gate: false, decides: [], releases: [] };
        (gate ? entry.releases : entry.decides).push(target);
        entry.gate = entry.gate || gate;
        roles.set(role, entry);
    };
    (workflow?.humanTasks ?? []).forEach((task) => (task.userRoles ?? []).forEach((role) => add(role, task.name, false)));
    (workflow?.activityDecls ?? []).filter((decl) => decl.requiresApproval).forEach((decl) => (decl.userRoles ?? []).forEach((role) => add(role, decl.name, true)));
    (workflow?.peers ?? []).filter((peer) => peer.requiresApproval).forEach((peer) => (peer.userRoles ?? []).forEach((role) => add(role, peer.name ?? "peer", true)));
    return [...roles.values()];
}

function durableCapabilities(workflow: CDWorkflow | undefined): Capabilities {
    const decls = workflow?.activityDecls ?? [];
    return {
        channels: (workflow?.events ?? []).map((event) => ({ name: event.name, request: event.type, senders: [] })),
        people: durablePeople(workflow),
        activities: decls.length || (workflow?.activities?.length ?? 0),
        gatedActivities: decls.filter((decl) => decl.requiresApproval).length,
        humanTasks: (workflow?.humanTasks ?? []).map((task) => task.name),
        peers: (workflow?.peers ?? []).map((peer) => peer.name ?? "peer"),
    };
}

// An artifact (from projectStructure's AGENT directory) is always a durable agent; without one, a plain
// @workflow:Workflow function and a durable agent the artifact list missed both fall back to workflow.kind.
function workflowKindLabel(isDurable: boolean): Pick<TopologyAgentNode, "kind" | "typeName"> {
    return isDurable ? { kind: "durable", typeName: DURABLE_AGENT_LABEL } : { kind: "workflow", typeName: WORKFLOW_LABEL };
}

// A plain workflow has no `toolConnections` (durable-agent only): its chips are its own direct connections plus
// its activities' connections, the same set Integrator's diagram draws as derived workflow -> connection edges.
function workflowConnectionUuids(workflow: CDWorkflow | undefined, activities: CDActivity[]): string[] {
    const activityUuids = new Set(workflow?.activities ?? []);
    const viaActivities = activities.filter((activity) => activityUuids.has(activity.uuid)).flatMap((activity) => activity.connections ?? []);
    return [...(workflow?.connections ?? []), ...viaActivities];
}

// The node id is the declaration's (file, line), never the uuid: uuids change on every design-model request.
function durableAgentNode(
    workflow: CDWorkflow | undefined,
    artifact: TopologyAgentArtifact | undefined,
    uuidToConnection: Map<string, CDConnection>,
    uuidToNodeId: Map<string, string>,
    activities: CDActivity[]
): TopologyAgentNode {
    const filePath = artifact?.path ?? workflow.location.filePath;
    const line = artifact?.startLine ?? workflow.location.startLine.line;
    const id = agentNodeId(filePath, line);
    if (workflow) {
        uuidToNodeId.set(workflow.uuid, id);
    }
    const isDurable = artifact !== undefined || workflow?.kind === DURABLE_AGENT_KIND;
    const chipConnections = isDurable ? workflow?.toolConnections : workflowConnectionUuids(workflow, activities);
    return {
        id,
        name: artifact?.name ?? workflow.symbol,
        ...workflowKindLabel(isDurable),
        role: workflow?.role ?? "",
        ...durableToolFacts(workflow),
        chips: buildToolChips(chipConnections, uuidToConnection),
        modelProvider: durableModelProvider(workflow, uuidToConnection),
        typed: false,
        orphan: false,
        filePath,
        position: workflow?.location?.startLine ?? { line, offset: 0 },
        moduleName: artifact?.moduleName ?? "workflow",
        ...durableCapabilities(workflow),
    };
}

// Every module-level workflow, durable agent or plain @workflow:Workflow function alike: both are run
// through `.run()`, so both need a node id before the handlers that call them are wired up.
function buildWorkflowNodes(
    model: CDModel,
    artifacts: TopologyAgentArtifact[],
    uuidToConnection: Map<string, CDConnection>,
    uuidToNodeId: Map<string, string>
): TopologyAgentNode[] {
    const workflows = model.workflows ?? [];
    const activities = model.activities ?? [];
    const nodes = artifacts.map((artifact) => durableAgentNode(findDurableWorkflow(workflows, artifact), artifact, uuidToConnection, uuidToNodeId, activities));
    workflows
        .filter((workflow) => !uuidToNodeId.has(workflow.uuid))
        .forEach((workflow) => nodes.push(durableAgentNode(workflow, undefined, uuidToConnection, uuidToNodeId, activities)));
    return nodes;
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
        .filter((artifact) => !artifact.isDefinition && artifact.kind !== "durable")
        .map((artifact) => agentNodeFromArtifact(artifact, connections, uuidToConnection, uuidToNodeId));

    connections
        .filter((connection) => connection.kind === AGENT_KIND && isModuleLevel(connection) && !uuidToNodeId.has(connection.uuid))
        .forEach((connection) => nodes.push(agentNodeFromConnection(connection, uuidToConnection, uuidToNodeId)));

    nodes.push(...buildWorkflowNodes(model, agents.filter((artifact) => artifact.kind === "durable"), uuidToConnection, uuidToNodeId));

    return { nodes, uuidToNodeId };
}

function resourcePath(path: string): string {
    if (!path || path === ".") {
        return "/";
    }
    const unescaped = path.replace(/\\/g, "");
    return unescaped.startsWith("/") ? unescaped : `/${unescaped}`;
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
        icon: toIconDescriptor(service.icon)?.url,
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

// One sendData call: the durable agent's node and the channel it is sent on.
interface Sent {
    agentId: string;
    channel: string;
}

interface Handler {
    entryId: string;
    node: TopologyHandler;
    // Each agent's first call in source order: the spine a chain follows. Repeats are not drawn.
    spine: string[];
    // Agents the handler reaches only through a helper, so no call site is known.
    reached: string[];
    sends: Sent[];
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

// A branch or fork around a spine call makes "B runs after A" untrue; a loop or a repeat only adds runs.
function underAlternative(call: CDAgentCall): boolean {
    return (call.groups ?? []).some((group) => logicOf(group.kind) !== "loop");
}

function spineOf(calls: CDAgentCall[], uuidToNodeId: Map<string, string>): CDAgentCall[] {
    const seen = new Set<string>();
    return (calls ?? []).filter((call) => {
        const id = uuidToNodeId.get(call.connection);
        if (id === undefined || seen.has(id)) {
            return false;
        }
        seen.add(id);
        return true;
    });
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
            chainPairs(handler.spine).forEach((pair) => owners.set(pair, [...(owners.get(pair) ?? []), handler]));
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

// The channel is part of the id, so a send never merges with the same row's run edge into the same card.
function eventEdge(entryId: string, handlerId: string, sent: Sent): TopologyEdge {
    return { id: `${handlerId}~>${sent.agentId}#${sent.channel}`, sourceId: entryId, targetId: sent.agentId, kind: "event", handlerId, channel: sent.channel };
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
        existing.gated = existing.gated || link.gated;
    });
    return [...byId.values()];
}

// An ordered handler is a chain from its trigger; any other handler fans, and its badge says why. Either way an
// edge means one thing only: this entry point runs this agent.
function handlerEdges(handler: Handler): TopologyEdge[] {
    const { entryId } = handler;
    const triggerId = handler.node.id;
    const steps = handler.spine;
    const fromRow = (agentId: string, order: number) => rowEdge(entryId, triggerId, agentId, { triggerId, order });
    const drawn = handler.node.ordered
        ? steps.map((agentId, index) => (index === 0 ? fromRow(agentId, 1) : edge(steps[index - 1], agentId, "trigger", { triggerId, order: index + 1 })))
        : steps.map((agentId, index) => fromRow(agentId, index + 1));
    const helped = handler.reached
        .filter((agentId) => !steps.includes(agentId))
        .map((agentId) => rowEdge(entryId, triggerId, agentId));
    const sent = handler.sends.map((send) => eventEdge(entryId, triggerId, send));
    return [...drawn, ...helped, ...sent];
}

// A durable agent is run through `.run`, which the design model files under the handler's workflows.
function collectAgentUuids(fn: { connections?: string[]; workflows?: string[] }, uuidToNodeId: Map<string, string>): string[] {
    return [...(fn.connections ?? []), ...(fn.workflows ?? [])].filter((uuid) => uuidToNodeId.has(uuid));
}

// The agents a handler runs: its direct calls first, then those it reaches only through helper functions. An agent
// reached through another agent's tool is delegation, not a trigger, so the fold's delegates are left out.
function triggeredAgentUuids(fn: AgentCallSite, uuidToNodeId: Map<string, string>, delegated: Set<string>): string[] {
    const called = (fn.agentCalls ?? []).map((call) => call.connection).filter((uuid) => uuidToNodeId.has(uuid));
    const reached = collectAgentUuids(fn, uuidToNodeId).filter((uuid) => !delegated.has(uuid));
    return [...new Set([...called, ...reached])];
}

function sentChannels(fn: AgentCallSite, uuidToNodeId: Map<string, string>): Sent[] {
    return Object.entries(fn.workflowSendData ?? {}).flatMap(([uuid, channels]) => {
        const agentId = uuidToNodeId.get(uuid);
        return agentId ? channels.map((channel) => ({ agentId, channel })) : [];
    });
}

function durableWorkflows(model: CDModel): CDWorkflow[] {
    return (model.workflows ?? []).filter(isDurableWorkflow);
}

function delegatedAgentUuids(model: CDModel): Set<string> {
    const delegated = new Set<string>();
    for (const connection of model.connections ?? []) {
        if (connection.kind === AGENT_KIND) {
            (connection.delegatesTo ?? []).forEach((uuid) => delegated.add(uuid));
        }
    }
    durableWorkflows(model).forEach((workflow) => (workflow.delegatesTo ?? []).forEach((uuid) => delegated.add(uuid)));
    return delegated;
}

interface AgentCallSite {
    location: { startLine: { line: number; offset: number }; endLine?: { line: number; offset: number } };
    connections?: string[];
    agentCalls?: CDAgentCall[];
    workflows?: string[];
    workflowSendData?: Record<string, string[]>;
}

function buildHandler(
    entryId: string,
    labels: { label: string; accessor?: string },
    filePath: string,
    fn: AgentCallSite,
    uuidToNodeId: Map<string, string>,
    delegated: Set<string>
): Handler {
    const agentUuids = triggeredAgentUuids(fn, uuidToNodeId, delegated);
    const sends = sentChannels(fn, uuidToNodeId);
    const spine = spineOf(fn.agentCalls, uuidToNodeId);
    const node: TopologyHandler = {
        id: agentNodeId(filePath, fn.location.startLine.line),
        label: labels.label,
        accessor: labels.accessor,
        filePath,
        position: fn.location.startLine,
        endPosition: fn.location.endLine,
        logic: logicIn(fn.agentCalls),
        ordered: !spine.some(underAlternative),
        sends: sends.length ? [...new Set(sends.map((send) => send.channel))] : undefined,
        wired: agentUuids.length > 0 || sends.length > 0,
    };
    return {
        entryId,
        node,
        spine: spine.map((call) => uuidToNodeId.get(call.connection) as string),
        reached: agentUuids.map((uuid) => uuidToNodeId.get(uuid)),
        sends,
    };
}

// One card per service with every handler as a row, the ones that run agents first, so the card shows the whole
// service and not only the part the agents use.
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
        const built = functions.map(({ fn, isResource }) => buildHandler(entryId, handlerLabelFor(fn, isResource), service.location.filePath, fn, uuidToNodeId, delegated));
        const own = [...built.filter((handler) => handler.node.wired), ...built.filter((handler) => !handler.node.wired)];
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
    return [...edges, ...durableDelegationEdges(model, uuidToNodeId)];
}

// A durable agent delegates through its peers and its agent tools; a peer declared with requiresApproval is gated.
function durableDelegationEdges(model: CDModel, uuidToNodeId: Map<string, string>): TopologyEdge[] {
    const edges: TopologyEdge[] = [];
    for (const workflow of durableWorkflows(model)) {
        const sourceId = uuidToNodeId.get(workflow.uuid);
        if (!sourceId) {
            continue;
        }
        const peers = workflow.peers ?? [];
        const gatedBy = new Map(peers.filter((peer) => peer.requiresApproval).map((peer) => [peer.agentUuid, peer.userRoles ?? []]));
        for (const uuid of new Set([...(workflow.delegatesTo ?? []), ...peers.map((peer) => peer.agentUuid)])) {
            const targetId = uuidToNodeId.get(uuid);
            if (targetId) {
                edges.push({ ...edge(sourceId, targetId, "delegation"), gated: gatedBy.has(uuid) || undefined, gatedBy: gatedBy.get(uuid) });
            }
        }
    }
    return edges;
}

// An event does not start an instance, so a durable agent nothing runs stays an orphan even with senders.
function markReachability(agents: TopologyAgentNode[], entries: TopologyEntryNode[], edges: TopologyEdge[]): void {
    const adjacency = new Map<string, string[]>();
    edges.filter((edge) => edge.kind !== "event").forEach((edge) => {
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

function computeLegendKinds(agents: TopologyAgentNode[], edges: TopologyEdge[]): LegendKind[] {
    const kinds: LegendKind[] = [];
    if (edges.some((link) => link.kind === "trigger")) {
        kinds.push("trigger");
    }
    if (edges.some((link) => link.kind === "event")) {
        kinds.push("event");
    }
    if (edges.some((link) => link.kind === "delegation")) {
        kinds.push("delegation");
    }
    if (edges.some((link) => link.kind === "delegation" && link.gated)) {
        kinds.push("gate");
    }
    if (agents.some((agent) => agent.gatedActivities > 0)) {
        kinds.push("people");
    }
    return kinds;
}

// Each inlet names the rows that send on it, for its popover.
function fillChannelSenders(agents: TopologyAgentNode[], handlers: TopologyHandler[], edges: TopologyEdge[]): void {
    const labels = new Map(handlers.map((handler) => [handler.id, [handler.accessor, handler.label].filter(Boolean).join(" ")]));
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    edges.filter((link) => link.kind === "event").forEach((link) => {
        const channel = byId.get(link.targetId)?.channels.find((candidate) => candidate.name === link.channel);
        const label = labels.get(link.handlerId ?? "");
        if (channel && label && !channel.senders.includes(label)) {
            channel.senders.push(label);
        }
    });
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

    const delegationEdges = buildDelegationEdges(model, uuidToNodeId);
    const graph = canonical(agentNodes, entries, mergeDuplicateEdges([...built.flatMap(handlerEdges), ...delegationEdges]));

    markReachability(graph.agents, graph.entries, graph.edges);
    fillChannelSenders(graph.agents, graph.handlers, graph.edges);

    return {
        ...graph,
        wiredNothing: !graph.edges.some((link) => link.kind === "trigger"),
        legendKinds: computeLegendKinds(graph.agents, graph.edges),
    };
}

type Declared = Pick<TopologyAgentNode, "filePath" | "position">;

function declarationOrder(a: Declared, b: Declared): number {
    return a.filePath.localeCompare(b.filePath) || a.position.line - b.position.line;
}

// The design model lists everything in uuid order, and uuids change on every request, so a reload could swap
// cards and cross edges. The graph follows the source instead: nodes by declaration, edges by the row they
// leave (a handler's own calls keep their call order) or, for a delegation, by the agent they reach.
function canonical(agents: TopologyAgentNode[], entries: TopologyEntryNode[], edges: TopologyEdge[]): Pick<TopologyGraph, "agents" | "entries" | "handlers" | "edges"> {
    const sortedAgents = [...agents].sort(declarationOrder);
    const sortedEntries = [...entries].sort(declarationOrder);
    const handlers = sortedEntries.flatMap((entry) => entry.handlers);
    const nodeOrder = new Map([...sortedEntries, ...sortedAgents].map((node, index) => [node.id, index]));
    const rowOrder = new Map(handlers.map((handler, index) => [handler.id, index]));
    const key = (edge: TopologyEdge): [number, number] => [
        nodeOrder.get(edge.sourceId) ?? 0,
        edge.handlerId ? rowOrder.get(edge.handlerId) ?? 0 : nodeOrder.get(edge.targetId) ?? 0,
    ];
    const sortedEdges = [...edges].sort((a, b) => {
        const [aNode, aRow] = key(a);
        const [bNode, bRow] = key(b);
        return aNode - bNode || aRow - bRow;
    });
    return { agents: sortedAgents, entries: sortedEntries, handlers, edges: sortedEdges };
}
