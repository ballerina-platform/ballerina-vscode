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

import { CDAgentCall, CDAutomation, CDConnection, CDModel, CDResourceFunction, CDService } from "@wso2/ballerina-core";
import { buildTopology } from "../components/AgentTopologyDiagram/topologyModel";
import { focusAround } from "../components/AgentTopologyDiagram/topologyFocus";
import { TopologyAgentArtifact, TopologyInput } from "../components/AgentTopologyDiagram/types";

const AGENTS_BAL = "/proj/agents.bal";
const SERVICES_BAL = "/proj/services.bal";
const CHAT_BAL = "/proj/_agent_chat.bal";
const MAIN_BAL = "/proj/main.bal";

const range = (line: number) => ({ startLine: { line, offset: 0 }, endLine: { line: line + 1, offset: 1 } });

const agentId = (path: string, line: number) => `${path}::${line}`;

function agentConnection(uuid: string, symbol: string, filePath: string, line: number, extra: Partial<CDConnection> = {}): CDConnection {
    return {
        symbol,
        location: { filePath, ...range(line) },
        scope: "GLOBAL",
        kind: "Agent",
        uuid,
        enableFlowModel: false,
        sortText: `${filePath}${line}`,
        ...extra,
    };
}

function connection(uuid: string, symbol: string, filePath: string, line: number, kind = "Connection"): CDConnection {
    return {
        symbol,
        location: { filePath, ...range(line) },
        scope: "GLOBAL",
        kind,
        uuid,
        enableFlowModel: true,
        sortText: `${filePath}${line}`,
    };
}

function artifact(name: string, path: string, startLine: number, extra: Partial<TopologyAgentArtifact> = {}): TopologyAgentArtifact {
    return { name, path, startLine, isDefinition: false, moduleName: "ai", ...extra };
}

function resourceFn(accessor: string, path: string, filePath: string, line: number, connections: string[], agentCalls?: CDAgentCall[]): CDResourceFunction {
    return { accessor, path, location: { filePath, ...range(line) }, connections, agentCalls };
}

function service(filePath: string, line: number, type: string, absolutePath: string, connections: string[], resourceFunctions: CDResourceFunction[]): CDService {
    return {
        location: { filePath, ...range(line) },
        attachedListeners: [],
        connections,
        functions: [],
        remoteFunctions: [],
        resourceFunctions,
        absolutePath,
        type,
        icon: "",
        uuid: `${filePath}${line}-svc`,
        enableFlowModel: true,
        sortText: `${filePath}${line}`,
    };
}

function modelOf(connections: CDConnection[], services: CDService[], automation?: CDAutomation): CDModel {
    return { connections, listeners: [], services, automation };
}

describe("buildTopology", () => {
    it("builds the Help Desk shape: supervisor delegates to three specialists; quotes handler runs order then shippingRates in sequence", () => {
        const supervisor = agentConnection("sup", "supportSupervisorAgent", AGENTS_BAL, 1, {
            role: "Supervisor",
            delegatesTo: ["bil", "tech", "ord"],
        });
        const billing = agentConnection("bil", "billingAgent", AGENTS_BAL, 5, { role: "Billing" });
        const technical = agentConnection("tech", "technicalSupportAgent", AGENTS_BAL, 9, { role: "Technical" });
        const order = agentConnection("ord", "orderAgent", AGENTS_BAL, 13, { role: "Order" });
        const shipping = agentConnection("ship", "shippingRatesAgent", AGENTS_BAL, 17, { role: "Shipping" });

        const quotes = resourceFn("post", "quotes", SERVICES_BAL, 3, ["ord", "ship"], [
            { connection: "ord", line: 4 },
            { connection: "ship", line: 5 },
        ]);
        const helpDesk = service(SERVICES_BAL, 1, "http:Service", "/shipping-api", ["ord", "ship"], [quotes]);

        const input: TopologyInput = {
            model: modelOf([supervisor, billing, technical, order, shipping], [helpDesk]),
            agents: [
                artifact("supportSupervisorAgent", AGENTS_BAL, 1),
                artifact("billingAgent", AGENTS_BAL, 5),
                artifact("technicalSupportAgent", AGENTS_BAL, 9),
                artifact("orderAgent", AGENTS_BAL, 13),
                artifact("shippingRatesAgent", AGENTS_BAL, 17),
            ],
        };

        const graph = buildTopology(input);

        expect(graph.agents).toHaveLength(5);
        expect(graph.handlers).toHaveLength(1);
        expect(graph.wiredNothing).toBe(false);

        const delegationEdges = graph.edges.filter((edge) => edge.kind === "delegation");
        expect(delegationEdges.map((edge) => edge.targetId).sort()).toEqual(
            [agentId(AGENTS_BAL, 5), agentId(AGENTS_BAL, 9), agentId(AGENTS_BAL, 13)].sort()
        );

        const orderEdge = graph.edges.find((edge) => edge.kind === "trigger" && edge.targetId === agentId(AGENTS_BAL, 13));
        const shipEdge = graph.edges.find((edge) => edge.kind === "trigger" && edge.targetId === agentId(AGENTS_BAL, 17));
        expect(orderEdge.sourceId).toBe(graph.entries[0].id);
        expect(orderEdge.handlers).toEqual([{ triggerId: graph.handlers[0].id, order: 1 }]);
        expect(shipEdge.sourceId).toBe(agentId(AGENTS_BAL, 13));
        expect(shipEdge.handlers).toEqual([{ triggerId: graph.handlers[0].id, order: 2 }]);

        // Nothing triggers or delegates to the supervisor itself -- it only calls out.
        const supervisorNode = graph.agents.find((agent) => agent.name === "supportSupervisorAgent");
        expect(supervisorNode.orphan).toBe(true);
        expect(graph.legendKinds).toEqual(expect.arrayContaining(["trigger", "delegation"]));
    });

    it("groups a service's handlers into one card, in source order, and sources their edges from their own rows", () => {
        const first = agentConnection("f", "firstAgent", AGENTS_BAL, 1);
        const second = agentConnection("s", "secondAgent", AGENTS_BAL, 5);
        const report = resourceFn("post", "report", SERVICES_BAL, 1, ["f"], [{ connection: "f", line: 2 }]);
        const archive = resourceFn("post", "archive", SERVICES_BAL, 9, ["s"], [{ connection: "s", line: 10 }]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/board", ["f", "s"], [report, archive]);
        const graph = buildTopology({
            model: modelOf([first, second], [svc]),
            agents: [artifact("firstAgent", AGENTS_BAL, 1), artifact("secondAgent", AGENTS_BAL, 5)],
        });

        expect(graph.entries).toHaveLength(1);
        expect(graph.entries[0]).toMatchObject({ kind: "service", title: "/board", subtitle: "http:Service" });
        expect(graph.entries[0].handlers.map((handler) => [handler.accessor, handler.label])).toEqual([
            ["POST", "/report"],
            ["POST", "/archive"],
        ]);
        expect(graph.edges.map((edge) => [edge.sourceId, edge.handlerId, edge.targetId])).toEqual([
            [graph.entries[0].id, graph.handlers[0].id, agentId(AGENTS_BAL, 1)],
            [graph.entries[0].id, graph.handlers[1].id, agentId(AGENTS_BAL, 5)],
        ]);
    });

    // Two rows reaching one agent are two edges, so hovering either row lights only its own.
    it("keeps a service's two handlers apart when they run the same agent", () => {
        const shared = agentConnection("sh", "sharedAgent", AGENTS_BAL, 1);
        const one = resourceFn("post", "one", SERVICES_BAL, 1, ["sh"], [{ connection: "sh", line: 2 }]);
        const two = resourceFn("post", "two", SERVICES_BAL, 9, ["sh"], [{ connection: "sh", line: 10 }]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/pair", ["sh"], [one, two]);
        const graph = buildTopology({
            model: modelOf([shared], [svc]),
            agents: [artifact("sharedAgent", AGENTS_BAL, 1)],
        });

        expect(graph.entries[0].handlers).toHaveLength(2);
        expect(graph.edges).toHaveLength(2);
        expect(new Set(graph.edges.map((edge) => edge.handlerId)).size).toBe(2);
    });

    it("chains a handler whose calls are a straight line, and marks it ordered", () => {
        const research = agentConnection("r", "researchAgent", AGENTS_BAL, 1);
        const writer = agentConnection("w", "writerAgent", AGENTS_BAL, 5);
        const draft = resourceFn("post", "draft", SERVICES_BAL, 1, ["r", "w"], [
            { connection: "r", line: 2 },
            { connection: "w", line: 3 },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/content", ["r", "w"], [draft]);
        const graph = buildTopology({
            model: modelOf([research, writer], [svc]),
            agents: [artifact("researchAgent", AGENTS_BAL, 1), artifact("writerAgent", AGENTS_BAL, 5)],
        });

        const triggerId = graph.entries[0].id;
        expect(graph.handlers[0]).toMatchObject({ ordered: true, logic: [] });
        expect(graph.edges.map((edge) => [edge.sourceId, edge.targetId])).toEqual([
            [triggerId, agentId(AGENTS_BAL, 1)],
            [agentId(AGENTS_BAL, 1), agentId(AGENTS_BAL, 5)],
        ]);
    });

    it("fans a handler whose calls sit inside constructs, and records what it does not draw", () => {
        const refund = agentConnection("ref", "refundAgent", AGENTS_BAL, 1);
        const notify = agentConnection("not", "notifyAgent", AGENTS_BAL, 5);
        const process = resourceFn("post", "process", SERVICES_BAL, 1, ["ref", "not"], [
            { connection: "ref", line: 3, groups: [{ kind: "foreach", id: "L", label: "item in items" }, { kind: "fork", id: "F", label: "w1" }] },
            { connection: "not", line: 6, groups: [{ kind: "foreach", id: "L", label: "item in items" }, { kind: "match", id: "M", label: "_" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/returns", ["ref", "not"], [process]);
        const graph = buildTopology({
            model: modelOf([refund, notify], [svc]),
            agents: [artifact("refundAgent", AGENTS_BAL, 1), artifact("notifyAgent", AGENTS_BAL, 5)],
        });

        const triggerId = graph.entries[0].id;
        expect(graph.handlers[0]).toMatchObject({ ordered: false, logic: ["branch", "fork", "loop"] });
        expect(graph.edges.map((edge) => edge.sourceId)).toEqual([triggerId, triggerId]);
    });

    // A chain would have to come back to the same card and would lose a step, so the whole handler fans.
    it("fans a handler that calls one agent twice, even with no construct around the calls", () => {
        const notify = agentConnection("not", "notifyAgent", AGENTS_BAL, 1);
        const refund = agentConnection("ref", "refundAgent", AGENTS_BAL, 5);
        const twice = resourceFn("post", "twice", SERVICES_BAL, 1, ["not", "ref"], [
            { connection: "not", line: 2 },
            { connection: "ref", line: 3 },
            { connection: "not", line: 4 },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/returns", ["not", "ref"], [twice]);
        const graph = buildTopology({
            model: modelOf([notify, refund], [svc]),
            agents: [artifact("notifyAgent", AGENTS_BAL, 1), artifact("refundAgent", AGENTS_BAL, 5)],
        });

        const triggerId = graph.entries[0].id;
        expect(graph.handlers[0]).toMatchObject({ ordered: false, logic: [] });
        expect(graph.edges.map((edge) => [edge.sourceId, edge.targetId])).toEqual([
            [triggerId, agentId(AGENTS_BAL, 1)],
            [triggerId, agentId(AGENTS_BAL, 5)],
        ]);
    });

    // One graph cannot hold X → Y and Y → X without drawing a cycle that does not exist.
    it("fans both handlers when two of them order the same pair the opposite way round", () => {
        const first = agentConnection("x", "xAgent", AGENTS_BAL, 1);
        const second = agentConnection("y", "yAgent", AGENTS_BAL, 5);
        const forward = resourceFn("post", "forward", SERVICES_BAL, 1, ["x", "y"], [
            { connection: "x", line: 2 },
            { connection: "y", line: 3 },
        ]);
        const backward = resourceFn("post", "backward", SERVICES_BAL, 9, ["x", "y"], [
            { connection: "y", line: 10 },
            { connection: "x", line: 11 },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/pair", ["x", "y"], [forward, backward]);
        const graph = buildTopology({
            model: modelOf([first, second], [svc]),
            agents: [artifact("xAgent", AGENTS_BAL, 1), artifact("yAgent", AGENTS_BAL, 5)],
        });

        expect(graph.handlers.map((handler) => handler.ordered)).toEqual([false, false]);
        expect(graph.edges.every((edge) => graph.entries.some((entry) => entry.id === edge.sourceId))).toBe(true);
    });

    it("carries the service module's icon on the trigger for modules without a brand glyph", () => {
        const agent = agentConnection("a", "aiAgent", AGENTS_BAL, 1);
        const fn = resourceFn("post", "message", SERVICES_BAL, 1, ["a"], [{ connection: "a", line: 2 }]);
        const chat = { ...service(SERVICES_BAL, 1, "chat:ChatService", "", ["a"], [fn]), icon: "https://central/ballerinax_googleapis.gchat_1.0.0.png" };

        const graph = buildTopology({ model: modelOf([agent], [chat]), agents: [artifact("aiAgent", AGENTS_BAL, 1)] });

        expect(graph.entries[0].glyphType).toBe("chat");
        expect(graph.entries[0].icon).toBe("https://central/ballerinax_googleapis.gchat_1.0.0.png");
    });

    it("draws an agent that hands off to itself with a self-delegation edge", () => {
        const loop = agentConnection("l", "loopAgent", AGENTS_BAL, 1, { delegatesTo: ["l"] });
        const graph = buildTopology({ model: modelOf([loop], []), agents: [artifact("loopAgent", AGENTS_BAL, 1)] });

        const self = agentId(AGENTS_BAL, 1);
        expect(graph.edges).toEqual([expect.objectContaining({ id: `${self}=>${self}`, sourceId: self, targetId: self, kind: "delegation" })]);
        expect(graph.agents[0].orphan).toBe(true);
    });

    it("draws an agent a handler reaches only through a helper as a plain edge beside its direct calls (helper_chains shape)", () => {
        const editor = agentConnection("e", "editorAgent", AGENTS_BAL, 1);
        const writer = agentConnection("w", "writerAgent", AGENTS_BAL, 5);
        const review = resourceFn("post", "review", SERVICES_BAL, 1, ["e", "w"], [{ connection: "e", line: 2 }]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/articles", ["e", "w"], [review]);
        const graph = buildTopology({ model: modelOf([editor, writer], [svc]), agents: [artifact("editorAgent", AGENTS_BAL, 1), artifact("writerAgent", AGENTS_BAL, 5)] });

        const triggerId = graph.entries[0].id;
        expect(graph.edges.map((e) => [e.sourceId, e.targetId])).toEqual([
            [triggerId, agentId(AGENTS_BAL, 1)],
            [triggerId, agentId(AGENTS_BAL, 5)],
        ]);
    });

    it("keeps an agent reached only through another agent's tool off the trigger even when the handler has direct calls", () => {
        const ceo = agentConnection("c", "ceoAgent", AGENTS_BAL, 1, { delegatesTo: ["m"] });
        const manager = agentConnection("m", "managerAgent", AGENTS_BAL, 5);
        const chat = resourceFn("post", "chat", SERVICES_BAL, 1, ["c", "m"], [{ connection: "c", line: 2 }]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/org", ["c", "m"], [chat]);
        const graph = buildTopology({ model: modelOf([ceo, manager], [svc]), agents: [artifact("ceoAgent", AGENTS_BAL, 1), artifact("managerAgent", AGENTS_BAL, 5)] });

        expect(graph.edges.filter((e) => e.kind === "trigger").map((e) => e.targetId)).toEqual([agentId(AGENTS_BAL, 1)]);
        expect(graph.agents.find((a) => a.name === "managerAgent").orphan).toBe(false);
    });

    it("counts MCP toolkits as tools of their own kind (mcp_agent shape)", () => {
        const supplier = agentConnection("s", "supplierAgent", AGENTS_BAL, 1, { mcpToolKits: ["inventoryTools", "http://localhost:9603/mcp"] });
        const graph = buildTopology({ model: modelOf([supplier], []), agents: [artifact("supplierAgent", AGENTS_BAL, 1)] });

        expect(graph.agents[0]).toMatchObject({ toolCount: 2, functionTools: 0, agentTools: 0, mcpTools: 2 });
        expect(graph.agents[0].tools).toEqual([
            { name: "inventoryTools", kind: "mcp" },
            { name: "http://localhost:9603/mcp", kind: "mcp" },
        ]);
    });

    it("draws a step two handlers share once, with both handlers' numbers", () => {
        const draft = agentConnection("d", "draftAgent", AGENTS_BAL, 1);
        const check = agentConnection("c", "factCheckAgent", AGENTS_BAL, 5);
        const outline = agentConnection("o", "outlineAgent", AGENTS_BAL, 9);
        const pipeline = resourceFn("post", "pipeline", SERVICES_BAL, 1, ["o", "d", "c"], [
            { connection: "o", line: 2 },
            { connection: "d", line: 3 },
            { connection: "c", line: 4 },
        ]);
        const verified = resourceFn("post", "verified", SERVICES_BAL, 6, ["d", "c"], [
            { connection: "d", line: 7 },
            { connection: "c", line: 8 },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/content", ["o", "d", "c"], [pipeline, verified]);
        const graph = buildTopology({ model: modelOf([draft, check, outline], [svc]), agents: [artifact("draftAgent", AGENTS_BAL, 1), artifact("factCheckAgent", AGENTS_BAL, 5), artifact("outlineAgent", AGENTS_BAL, 9)] });

        const shared = graph.edges.filter((e) => e.sourceId === agentId(AGENTS_BAL, 1) && e.targetId === agentId(AGENTS_BAL, 5));
        expect(shared).toHaveLength(1);
        expect(shared[0].handlers.map((step) => step.order).sort()).toEqual([2, 3]);
        expect(shared[0].handlers.map((step) => step.triggerId).sort()).toEqual(graph.handlers.map((handler) => handler.id).sort());
    });

    it("draws typed-agent instances but neither their definition nor the field inside it", () => {
        const DEFS_BAL = "/proj/agent_definitions.bal";
        const field = agentConnection("fld", "agent", DEFS_BAL, 6, { scope: 0 as unknown as string });
        const team = agentConnection("team", "teamCalendarAgent", AGENTS_BAL, 2, { scope: 1 as unknown as string });
        const personal = agentConnection("pers", "personalCalendarAgent", AGENTS_BAL, 3);
        const chat = service(MAIN_BAL, 1, "ai:Service", "/calendar", ["team"], [resourceFn("post", "chat", MAIN_BAL, 2, ["team"], [{ connection: "team", line: 3 }])]);

        const graph = buildTopology({
            model: modelOf([field, team, personal], [chat]),
            agents: [
                artifact("teamCalendarAgent", AGENTS_BAL, 2, { moduleName: "typed_agents" }),
                artifact("personalCalendarAgent", AGENTS_BAL, 3, { moduleName: "typed_agents" }),
                artifact("CalendarAssistant", DEFS_BAL, 4, { isDefinition: true, moduleName: "typed_agents" }),
            ],
        });

        expect(graph.agents.map((agent) => agent.name).sort()).toEqual(["personalCalendarAgent", "teamCalendarAgent"]);
        expect(graph.agents.every((agent) => agent.typed)).toBe(true);
        expect(graph.edges.find((edge) => edge.targetId === agentId(AGENTS_BAL, 2))).toBeDefined();
    });

    it("carries the agent's model provider and keeps it out of the tool chips", () => {
        const provider = agentConnection("mdl", "deskModel", AGENTS_BAL, 1, { kind: "Model Provider", icon: "https://x/ballerina_ai_1.13.0.png?wso2_icon" });
        const named = agentConnection("a", "namedAgent", AGENTS_BAL, 3, {
            modelProvider: { symbol: "deskModel", type: "Wso2ModelProvider", icon: "https://x/ballerina_ai_1.13.0.png?wso2_icon" },
            toolConnections: ["mdl"],
        });
        const inline = agentConnection("b", "inlineAgent", AGENTS_BAL, 7, { modelProvider: { type: "Wso2ModelProvider" } });
        const openAi = agentConnection("c", "openAiAgent", AGENTS_BAL, 11, { modelProvider: { symbol: "gpt", type: "OpenAiProvider", icon: "https://x/openai.png" } });

        const graph = buildTopology({
            model: modelOf([provider, named, inline, openAi], []),
            agents: [artifact("namedAgent", AGENTS_BAL, 3), artifact("inlineAgent", AGENTS_BAL, 7), artifact("openAiAgent", AGENTS_BAL, 11)],
        });

        const byName = new Map(graph.agents.map((agent) => [agent.name, agent]));
        expect(byName.get("namedAgent").modelProvider).toEqual({ label: "deskModel", type: "Wso2ModelProvider", icon: "https://x/ballerina_ai_1.13.0.png?wso2_icon" });
        expect(byName.get("namedAgent").chips).toEqual([]);
        expect(byName.get("inlineAgent").modelProvider).toEqual({ label: "Default WSO2 Model Provider", type: "Wso2ModelProvider", icon: undefined });
        expect(byName.get("openAiAgent").modelProvider.label).toBe("gpt");
        expect(graph.agents.map((agent) => agent.name)).not.toContain("deskModel");
    });

    it("carries the memory store, the agent's type label and the tool kinds", () => {
        const named = agentConnection("a", "namedAgent", AGENTS_BAL, 3, {
            memory: { symbol: "chatMemory", type: "MessageWindowChatMemory" },
            dependentFunctions: ["lookupOrder", "initiateReturn", "shippingRatesAgentTool"],
            delegatesTo: ["ship"],
            agentTools: { shippingRatesAgentTool: "ship" },
        });
        const inline = agentConnection("b", "inlineAgent", AGENTS_BAL, 7, { memory: { type: "MessageWindowChatMemory" }, typeName: "Agent" });
        const typed = agentConnection("c", "calendar", AGENTS_BAL, 11, { typeName: "CalendarAssistant" });

        const graph = buildTopology({
            model: modelOf([named, inline, typed], []),
            agents: [artifact("namedAgent", AGENTS_BAL, 3), artifact("inlineAgent", AGENTS_BAL, 7), artifact("calendar", AGENTS_BAL, 11, { moduleName: "typed_agents" })],
        });

        const byName = new Map(graph.agents.map((agent) => [agent.name, agent]));
        expect(byName.get("namedAgent")).toMatchObject({ memory: { label: "chatMemory", type: "MessageWindowChatMemory" }, toolCount: 3, functionTools: 2, agentTools: 1, typeName: "AI Agent" });
        expect(byName.get("namedAgent").tools).toEqual([
            { name: "lookupOrder", kind: "function" },
            { name: "initiateReturn", kind: "function" },
            { name: "shippingRatesAgentTool", kind: "agent" },
        ]);
        expect(byName.get("inlineAgent")).toMatchObject({ memory: { label: "MessageWindowChatMemory", type: "MessageWindowChatMemory" }, typeName: "AI Agent", toolCount: 0 });
        expect(byName.get("calendar").typeName).toBe("CalendarAssistant");
    });

    it("focuses the whole flow through a node: upstream to its triggers, downstream to the leaves", () => {
        const billing = agentConnection("bil", "billingAgent", AGENTS_BAL, 1, { delegatesTo: ["aud"] });
        const technical = agentConnection("tech", "technicalAgent", AGENTS_BAL, 5);
        const audit = agentConnection("aud", "auditAgent", AGENTS_BAL, 9);
        const route = resourceFn("post", "route", SERVICES_BAL, 1, ["bil", "tech"], [
            { connection: "bil", line: 2, groups: [{ kind: "if", id: "g1", label: "billing" }] },
            { connection: "tech", line: 4, groups: [{ kind: "if", id: "g1", label: "else" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/route", ["bil", "tech"], [route]);
        const graph = buildTopology({
            model: modelOf([billing, technical, audit], [svc]),
            agents: [artifact("billingAgent", AGENTS_BAL, 1), artifact("technicalAgent", AGENTS_BAL, 5), artifact("auditAgent", AGENTS_BAL, 9)],
        });
        const triggerId = graph.entries[0].id;
        const handlerId = graph.handlers[0].id;

        const onBilling = focusAround(graph, agentId(AGENTS_BAL, 1));
        expect([...onBilling.nodes].sort()).toEqual([agentId(AGENTS_BAL, 1), agentId(AGENTS_BAL, 9), triggerId, handlerId].sort());
        expect(onBilling.nodes.has(agentId(AGENTS_BAL, 5))).toBe(false);
        expect([...onBilling.edges].sort()).toEqual([`${handlerId}->${agentId(AGENTS_BAL, 1)}`, `${agentId(AGENTS_BAL, 1)}=>${agentId(AGENTS_BAL, 9)}`].sort());

        const onTrigger = focusAround(graph, triggerId);
        expect([...onTrigger.nodes].sort()).toEqual([triggerId, handlerId, agentId(AGENTS_BAL, 1), agentId(AGENTS_BAL, 5), agentId(AGENTS_BAL, 9)].sort());

        const onSubAgent = focusAround(graph, agentId(AGENTS_BAL, 9));
        expect([...onSubAgent.nodes].sort()).toEqual([agentId(AGENTS_BAL, 9), agentId(AGENTS_BAL, 1), triggerId, handlerId].sort());
        expect(onSubAgent.nodes.has(agentId(AGENTS_BAL, 5))).toBe(false);
    });

    it("marks an agent reachable from nothing as orphan", () => {
        const orphan = agentConnection("orph", "orphanAgent", AGENTS_BAL, 1);
        const graph = buildTopology({
            model: modelOf([orphan], []),
            agents: [artifact("orphanAgent", AGENTS_BAL, 1)],
        });
        expect(graph.agents[0].orphan).toBe(true);
        expect(graph.wiredNothing).toBe(true);
    });

    it("draws two trigger edges into one agent when two triggers run it", () => {
        const agent = agentConnection("a1", "chatAgent", AGENTS_BAL, 1);
        const fn1 = resourceFn("post", "chatA", SERVICES_BAL, 1, ["a1"]);
        const fn2 = resourceFn("post", "chatB", SERVICES_BAL, 5, ["a1"]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/chat", ["a1"], [fn1, fn2]);

        const graph = buildTopology({
            model: modelOf([agent], [svc]),
            agents: [artifact("chatAgent", AGENTS_BAL, 1)],
        });

        expect(graph.handlers).toHaveLength(2);
        expect(graph.edges.filter((edge) => edge.kind === "trigger" && edge.targetId === agentId(AGENTS_BAL, 1))).toHaveLength(2);
        expect(graph.agents[0].orphan).toBe(false);
    });

    it("does not orphan an agent that is both triggered directly and reached via delegation", () => {
        const supervisor = agentConnection("sup", "supervisorAgent", AGENTS_BAL, 1, { delegatesTo: ["spec"] });
        const specialist = agentConnection("spec", "specialistAgent", AGENTS_BAL, 5);
        const fn = resourceFn("post", "chat", SERVICES_BAL, 1, ["sup", "spec"]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/chat", ["sup", "spec"], [fn]);

        const graph = buildTopology({
            model: modelOf([supervisor, specialist], [svc]),
            agents: [artifact("supervisorAgent", AGENTS_BAL, 1), artifact("specialistAgent", AGENTS_BAL, 5)],
        });

        expect(graph.agents.find((agent) => agent.name === "specialistAgent").orphan).toBe(false);
    });

    it("keeps both a sequence step and a delegation between the same two agents", () => {
        const order = agentConnection("ord", "orderAgent", AGENTS_BAL, 1, { delegatesTo: ["ship"] });
        const shipping = agentConnection("ship", "shippingRatesAgent", AGENTS_BAL, 5);
        const quotes = resourceFn("post", "quotes", SERVICES_BAL, 3, ["ord", "ship"], [
            { connection: "ord", line: 4 },
            { connection: "ship", line: 5 },
        ]);
        const input: TopologyInput = {
            model: modelOf([order, shipping], [service(SERVICES_BAL, 1, "http:Service", "/shipping-api", ["ord", "ship"], [quotes])]),
            agents: [artifact("orderAgent", AGENTS_BAL, 1), artifact("shippingRatesAgent", AGENTS_BAL, 5)],
        };

        const graph = buildTopology(input);

        const between = graph.edges.filter((edge) => edge.sourceId === agentId(AGENTS_BAL, 1) && edge.targetId === agentId(AGENTS_BAL, 5));
        expect(between.map((edge) => edge.kind).sort()).toEqual(["delegation", "trigger"]);
    });

    it("draws a plain edge with no chips when the function has connections but no agentCalls", () => {
        const agent = agentConnection("a1", "chatAgent", AGENTS_BAL, 1);
        const fn = resourceFn("post", "chat", SERVICES_BAL, 1, ["a1"]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/chat", ["a1"], [fn]);

        const graph = buildTopology({
            model: modelOf([agent], [svc]),
            agents: [artifact("chatAgent", AGENTS_BAL, 1)],
        });

        const edge = graph.edges.find((candidate) => candidate.kind === "trigger");
        expect(edge.handlers).toBeUndefined();
    });

    it("ignores a non-agent uuid inside agentCalls", () => {
        const agent = agentConnection("a1", "chatAgent", AGENTS_BAL, 1);
        const httpClient = connection("http1", "apiClient", SERVICES_BAL, 1);
        const fn = resourceFn("post", "chat", SERVICES_BAL, 3, ["a1", "http1"], [
            { connection: "a1", line: 4 },
            { connection: "http1", line: 5 },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/chat", ["a1", "http1"], [fn]);

        const graph = buildTopology({
            model: modelOf([agent, httpClient], [svc]),
            agents: [artifact("chatAgent", AGENTS_BAL, 1)],
        });

        expect(graph.edges.filter((edge) => edge.kind === "trigger")).toHaveLength(1);
    });

    it("skips a service whose location is a generated _agent_chat.bal file", () => {
        const agent = agentConnection("a1", "chatAgent", AGENTS_BAL, 1);
        const fn = resourceFn("post", "chat", CHAT_BAL, 1, ["a1"]);
        const svc = service(CHAT_BAL, 1, "ai:Service", "/agent-chat", ["a1"], [fn]);

        const graph = buildTopology({
            model: modelOf([agent], [svc]),
            agents: [artifact("chatAgent", AGENTS_BAL, 1)],
        });

        expect(graph.entries).toHaveLength(0);
        expect(graph.agents[0].orphan).toBe(true);
    });

    it("draws the automation as its own entry card", () => {
        const agent = agentConnection("a1", "chatAgent", AGENTS_BAL, 1);
        const automation: CDAutomation = {
            name: "automation",
            displayName: "main",
            location: { filePath: MAIN_BAL, ...range(1) },
            connections: ["a1"],
            uuid: "auto1",
        };

        const graph = buildTopology({
            model: modelOf([agent], [], automation),
            agents: [artifact("chatAgent", AGENTS_BAL, 1)],
        });

        expect(graph.handlers).toHaveLength(1);
        expect(graph.entries[0]).toMatchObject({ kind: "automation", glyphType: "automation", title: "main", subtitle: "automation" });
        // An automation has no rows to draw, so its edge leaves the card's own port.
        expect(graph.edges[0].sourceId).toBe(graph.entries[0].id);
    });

    it("does not hang or crash on a delegation cycle with no trigger reaching it", () => {
        const a = agentConnection("a", "agentA", AGENTS_BAL, 1, { delegatesTo: ["b"] });
        const b = agentConnection("b", "agentB", AGENTS_BAL, 5, { delegatesTo: ["a"] });

        const graph = buildTopology({
            model: modelOf([a, b], []),
            agents: [artifact("agentA", AGENTS_BAL, 1), artifact("agentB", AGENTS_BAL, 5)],
        });

        expect(graph.agents.every((agent) => agent.orphan)).toBe(true);
    });
});
