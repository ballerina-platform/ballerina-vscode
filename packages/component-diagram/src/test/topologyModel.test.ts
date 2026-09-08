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
import { TopologyAgentArtifact, TopologyEdge, TopologyInput } from "../components/AgentTopologyDiagram/types";

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
        expect(graph.triggers).toHaveLength(1);
        expect(graph.wiredNothing).toBe(false);

        const delegationEdges = graph.edges.filter((edge) => edge.kind === "delegation");
        expect(delegationEdges.map((edge) => edge.targetId).sort()).toEqual(
            [agentId(AGENTS_BAL, 5), agentId(AGENTS_BAL, 9), agentId(AGENTS_BAL, 13)].sort()
        );

        const orderEdge = graph.edges.find((edge) => edge.kind === "trigger" && edge.targetId === agentId(AGENTS_BAL, 13));
        const shipEdge = graph.edges.find((edge) => edge.kind === "trigger" && edge.targetId === agentId(AGENTS_BAL, 17));
        expect(orderEdge.sourceId).toBe(graph.triggers[0].id);
        const steps = ["orderAgent", "shippingRatesAgent"];
        expect(orderEdge.chips).toEqual([expect.objectContaining({ kind: "sequence", text: "1", steps })]);
        expect(shipEdge.sourceId).toBe(agentId(AGENTS_BAL, 13));
        expect(shipEdge.chips).toEqual([expect.objectContaining({ kind: "sequence", text: "2", steps })]);

        // Nothing triggers or delegates to the supervisor itself -- it only calls out.
        const supervisorNode = graph.agents.find((agent) => agent.name === "supportSupervisorAgent");
        expect(supervisorNode.orphan).toBe(true);
        expect(graph.legendKinds).toEqual(expect.arrayContaining(["trigger", "delegation", "sequence"]));
    });

    it("draws an if/else split as one shared stem marker with a condition chip on each branch", () => {
        const billing = agentConnection("bil", "billingAgent", AGENTS_BAL, 1);
        const technical = agentConnection("tech", "technicalAgent", AGENTS_BAL, 5);
        const route = resourceFn("post", "route", SERVICES_BAL, 1, ["bil", "tech"], [
            { connection: "bil", line: 2, groups: [{ kind: "if", id: "g1", label: 'isBillingQuery(msg)' }] },
            { connection: "tech", line: 4, groups: [{ kind: "if", id: "g1", label: "else" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/route", ["bil", "tech"], [route]);

        const graph = buildTopology({
            model: modelOf([billing, technical], [svc]),
            agents: [artifact("billingAgent", AGENTS_BAL, 1), artifact("technicalAgent", AGENTS_BAL, 5)],
        });

        expect(graph.splits).toHaveLength(1);
        expect(graph.splits[0].kind).toBe("if");
        expect(graph.splits[0].triggerId).toBe(graph.triggers[0].id);
        const stem = graph.edges.find((edge) => edge.kind === "stem");
        expect(stem.sourceId).toBe(graph.triggers[0].id);
        expect(stem.targetId).toBe(graph.splits[0].id);
        const billingEdge = graph.edges.find((edge) => edge.targetId === agentId(AGENTS_BAL, 1));
        expect(billingEdge.sourceId).toBe(graph.splits[0].id);
        const technicalEdge = graph.edges.find((edge) => edge.targetId === agentId(AGENTS_BAL, 5));
        expect(billingEdge.chips).toEqual([{ kind: "condition", text: "isBillingQuery(msg)" }]);
        expect(technicalEdge.chips).toEqual([{ kind: "condition", text: "else" }]);
        // Only one item (the whole if/else chain) in this handler, so no sequence numbers.
        expect(billingEdge.chips.some((chip) => chip.kind === "sequence")).toBe(false);
        expect(graph.legendKinds).toContain("condition");
    });

    it("draws a match with one condition chip per clause", () => {
        const billing = agentConnection("bil", "billingAgent", AGENTS_BAL, 1);
        const technical = agentConnection("tech", "technicalAgent", AGENTS_BAL, 5);
        const classify = resourceFn("post", "classify", SERVICES_BAL, 1, ["bil", "tech"], [
            { connection: "bil", line: 2, groups: [{ kind: "match", id: "g1", label: '"billing"' }] },
            { connection: "tech", line: 4, groups: [{ kind: "match", id: "g1", label: '"technical"' }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/classify", ["bil", "tech"], [classify]);

        const graph = buildTopology({
            model: modelOf([billing, technical], [svc]),
            agents: [artifact("billingAgent", AGENTS_BAL, 1), artifact("technicalAgent", AGENTS_BAL, 5)],
        });

        expect(graph.splits[0].kind).toBe("match");
        const billingEdge = graph.edges.find((edge) => edge.targetId === agentId(AGENTS_BAL, 1));
        expect(billingEdge.sourceId).toBe(graph.splits[0].id);
        expect(billingEdge.chips).toEqual([{ kind: "condition", text: '"billing"' }]);
    });

    it("draws a fork with a stem marker and no text chips on its edges", () => {
        const billing = agentConnection("bil", "billingAgent", AGENTS_BAL, 1);
        const technical = agentConnection("tech", "technicalAgent", AGENTS_BAL, 5);
        const both = resourceFn("post", "both", SERVICES_BAL, 1, ["bil", "tech"], [
            { connection: "bil", line: 2, groups: [{ kind: "fork", id: "g1", label: "billing" }] },
            { connection: "tech", line: 4, groups: [{ kind: "fork", id: "g1", label: "technical" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/parallel", ["bil", "tech"], [both]);

        const graph = buildTopology({
            model: modelOf([billing, technical], [svc]),
            agents: [artifact("billingAgent", AGENTS_BAL, 1), artifact("technicalAgent", AGENTS_BAL, 5)],
        });

        expect(graph.splits[0].kind).toBe("fork");
        const billingEdge = graph.edges.find((edge) => edge.targetId === agentId(AGENTS_BAL, 1));
        expect(billingEdge.chips).toEqual([]);
        expect(graph.legendKinds).toContain("fork");
    });

    it("draws a foreach as a loop split with the loop header under the node, no pill", () => {
        const triage = agentConnection("tri", "triageAgent", AGENTS_BAL, 1);
        const batch = resourceFn("post", "triage", SERVICES_BAL, 1, ["tri"], [
            { connection: "tri", line: 3, groups: [{ kind: "foreach", id: "g1", label: "ticket in payload.tickets" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/tickets", ["tri"], [batch]);

        const graph = buildTopology({ model: modelOf([triage], [svc]), agents: [artifact("triageAgent", AGENTS_BAL, 1)] });

        expect(graph.splits[0]).toMatchObject({ kind: "foreach", header: "ticket in payload.tickets", depth: 1 });
        const edge = graph.edges.find((e) => e.targetId === agentId(AGENTS_BAL, 1));
        expect(edge.sourceId).toBe(graph.splits[0].id);
        expect(edge.chips).toEqual([]);
        expect(graph.legendKinds).toContain("loop");
        expect(graph.legendKinds).not.toContain("condition");
    });

    it("draws a while as a loop split with the condition under the node", () => {
        const review = agentConnection("rev", "reviewAgent", AGENTS_BAL, 1);
        const retry = resourceFn("post", "escalate", SERVICES_BAL, 1, ["rev"], [
            { connection: "rev", line: 4, groups: [{ kind: "while", id: "g1", label: "attempts < 3" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/tickets", ["rev"], [retry]);

        const graph = buildTopology({ model: modelOf([review], [svc]), agents: [artifact("reviewAgent", AGENTS_BAL, 1)] });

        expect(graph.splits[0]).toMatchObject({ kind: "while", header: "attempts < 3" });
        expect(graph.edges.find((e) => e.targetId === agentId(AGENTS_BAL, 1)).chips).toEqual([]);
        expect(graph.legendKinds).toContain("loop");
    });

    it("chains nested constructs: foreach → if → if, with the outer branch on the edge into the inner split", () => {
        const compliance = agentConnection("comp", "complianceAgent", AGENTS_BAL, 1);
        const fraud = agentConnection("fraud", "fraudAgent", AGENTS_BAL, 5);
        const gift = agentConnection("gift", "giftAgent", AGENTS_BAL, 9);
        const loop = { kind: "foreach" as const, id: "L", label: "item in payload.orders" };
        const outer = (label: string) => ({ kind: "if" as const, id: "O", label });
        const inner = (label: string) => ({ kind: "if" as const, id: "I", label });
        const process = resourceFn("post", "process", SERVICES_BAL, 1, ["comp", "fraud", "gift"], [
            { connection: "comp", line: 4, groups: [loop, outer("item.total > 1000"), inner('item.region == "EU"')] },
            { connection: "fraud", line: 7, groups: [loop, outer("item.total > 1000"), inner("else")] },
            { connection: "gift", line: 10, groups: [loop, outer("item.isGift")] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/orders", ["comp", "fraud", "gift"], [process]);

        const graph = buildTopology({
            model: modelOf([compliance, fraud, gift], [svc]),
            agents: [artifact("complianceAgent", AGENTS_BAL, 1), artifact("fraudAgent", AGENTS_BAL, 5), artifact("giftAgent", AGENTS_BAL, 9)],
        });

        const triggerId = graph.triggers[0].id;
        const byId = new Map(graph.splits.map((split) => [split.id, split]));
        expect(byId.get(`${triggerId}::L`)).toMatchObject({ kind: "foreach", parentId: triggerId, depth: 1, header: "item in payload.orders" });
        expect(byId.get(`${triggerId}::O`)).toMatchObject({ kind: "if", parentId: `${triggerId}::L`, depth: 2 });
        expect(byId.get(`${triggerId}::I`)).toMatchObject({ kind: "if", parentId: `${triggerId}::O`, depth: 3 });
        const edge = (source: string, target: string) => graph.edges.find((e) => e.sourceId === source && e.targetId === target);
        expect(edge(triggerId, `${triggerId}::L`).chips).toEqual([]);
        expect(edge(`${triggerId}::L`, `${triggerId}::O`).chips).toEqual([]);
        expect(edge(`${triggerId}::O`, `${triggerId}::I`).chips).toEqual([{ kind: "condition", text: "item.total > 1000" }]);
        expect(edge(`${triggerId}::I`, agentId(AGENTS_BAL, 1)).chips).toEqual([{ kind: "condition", text: 'item.region == "EU"' }]);
        expect(edge(`${triggerId}::I`, agentId(AGENTS_BAL, 5)).chips).toEqual([{ kind: "condition", text: "else" }]);
        expect(edge(`${triggerId}::O`, agentId(AGENTS_BAL, 9)).chips).toEqual([{ kind: "condition", text: "item.isGift" }]);
        expect(graph.edges.filter((e) => e.sourceId === triggerId)).toHaveLength(1);
    });

    it("carries the service module's icon on the trigger for modules without a brand glyph", () => {
        const agent = agentConnection("a", "aiAgent", AGENTS_BAL, 1);
        const fn = resourceFn("post", "message", SERVICES_BAL, 1, ["a"], [{ connection: "a", line: 2 }]);
        const chat = { ...service(SERVICES_BAL, 1, "chat:ChatService", "", ["a"], [fn]), icon: "https://central/ballerinax_googleapis.gchat_1.0.0.png" };

        const graph = buildTopology({ model: modelOf([agent], [chat]), agents: [artifact("aiAgent", AGENTS_BAL, 1)] });

        expect(graph.triggers[0].glyphType).toBe("chat");
        expect(graph.triggers[0].icon).toBe("https://central/ballerinax_googleapis.gchat_1.0.0.png");
    });

    it("chains the steps through a split: the split hangs off the previous step and the next step leaves it", () => {
        const outline = agentConnection("o", "outlineAgent", AGENTS_BAL, 1);
        const rewrite = agentConnection("r", "rewriteAgent", AGENTS_BAL, 5);
        const draft = agentConnection("d", "draftAgent", AGENTS_BAL, 9);
        const polish = agentConnection("p", "polishAgent", AGENTS_BAL, 13);
        const fn = resourceFn("post", "gated", SERVICES_BAL, 1, ["o", "r", "d", "p"], [
            { connection: "o", line: 2, groups: [] },
            { connection: "r", line: 4, groups: [{ kind: "if", id: "g1", label: "!passesGate(outline)" }] },
            { connection: "d", line: 6, groups: [] },
            { connection: "p", line: 7, groups: [] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/content", ["o", "r", "d", "p"], [fn]);
        const graph = buildTopology({
            model: modelOf([outline, rewrite, draft, polish], [svc]),
            agents: [artifact("outlineAgent", AGENTS_BAL, 1), artifact("rewriteAgent", AGENTS_BAL, 5), artifact("draftAgent", AGENTS_BAL, 9), artifact("polishAgent", AGENTS_BAL, 13)],
        });

        const triggerId = graph.triggers[0].id;
        const steps = ["outlineAgent", "If", "draftAgent", "polishAgent"];
        const chip = (edge: TopologyEdge) => edge.chips.find((c) => c.kind === "sequence");
        const edge = (sourceId: string, targetId: string) => graph.edges.find((e) => e.sourceId === sourceId && e.targetId === targetId);
        const splitId = `${triggerId}::g1`;
        expect(chip(edge(triggerId, agentId(AGENTS_BAL, 1)))).toEqual(expect.objectContaining({ kind: "sequence", text: "1", steps }));
        expect(edge(agentId(AGENTS_BAL, 1), splitId).kind).toBe("stem");
        expect(chip(edge(agentId(AGENTS_BAL, 1), splitId))).toEqual(expect.objectContaining({ kind: "sequence", text: "2", steps }));
        expect(edge(splitId, agentId(AGENTS_BAL, 5)).chips).toEqual([{ kind: "condition", text: "!passesGate(outline)" }]);
        expect(chip(edge(splitId, agentId(AGENTS_BAL, 9)))).toEqual(expect.objectContaining({ kind: "sequence", text: "3", steps }));
        expect(chip(edge(agentId(AGENTS_BAL, 9), agentId(AGENTS_BAL, 13)))).toEqual(expect.objectContaining({ kind: "sequence", text: "4", steps }));
        expect(graph.edges.filter((e) => e.sourceId === triggerId)).toHaveLength(1);
        expect(graph.splits[0].parentId).toBe(agentId(AGENTS_BAL, 1));
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
        expect(shared[0].chips.map((chip) => [chip.text, chip.handler])).toEqual([["3", "POST /pipeline"], ["2", "POST /verified"]]);
        expect(shared[0].chips.map((chip) => chip.triggerId)).toEqual(graph.triggers.map((trigger) => trigger.id));
    });

    it("merges two conditions that lead to the same agent into one pill", () => {
        const billing = agentConnection("b", "billingAgent", AGENTS_BAL, 1);
        const general = agentConnection("g", "generalAgent", AGENTS_BAL, 5);
        const fn = resourceFn("post", "ticket", SERVICES_BAL, 1, ["b", "g"], [
            { connection: "b", line: 2, groups: [{ kind: "if", id: "g1", label: 'kind == "refund"' }] },
            { connection: "b", line: 4, groups: [{ kind: "if", id: "g1", label: 'kind == "chargeback"' }] },
            { connection: "g", line: 6, groups: [{ kind: "if", id: "g1", label: "else" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/hub", ["b", "g"], [fn]);
        const graph = buildTopology({ model: modelOf([billing, general], [svc]), agents: [artifact("billingAgent", AGENTS_BAL, 1), artifact("generalAgent", AGENTS_BAL, 5)] });

        const toBilling = graph.edges.find((e) => e.targetId === agentId(AGENTS_BAL, 1));
        expect(toBilling.chips).toEqual([{ kind: "condition", text: 'kind == "refund" | kind == "chargeback"' }]);
    });

    it("hangs a split that follows a plain call off that agent and numbers both steps", () => {
        const first = agentConnection("a", "firstAgent", AGENTS_BAL, 1);
        const second = agentConnection("b", "secondAgent", AGENTS_BAL, 5);
        const fn = resourceFn("post", "run", SERVICES_BAL, 1, ["a", "b"], [
            { connection: "a", line: 2, groups: [] },
            { connection: "b", line: 4, groups: [{ kind: "if", id: "g1", label: "retry" }] },
        ]);
        const svc = service(SERVICES_BAL, 1, "http:Service", "/run", ["a", "b"], [fn]);

        const graph = buildTopology({ model: modelOf([first, second], [svc]), agents: [artifact("firstAgent", AGENTS_BAL, 1), artifact("secondAgent", AGENTS_BAL, 5)] });

        const triggerId = graph.triggers[0].id;
        const steps = ["firstAgent", "If"];
        expect(graph.edges.find((e) => e.sourceId === triggerId && e.targetId === agentId(AGENTS_BAL, 1)).chips).toEqual([expect.objectContaining({ kind: "sequence", text: "1", steps })]);
        expect(graph.edges.find((e) => e.sourceId === agentId(AGENTS_BAL, 1) && e.kind === "stem").chips).toEqual([expect.objectContaining({ kind: "sequence", text: "2", steps })]);
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
        const triggerId = graph.triggers[0].id;
        const splitId = graph.splits[0].id;

        const onBilling = focusAround(graph, agentId(AGENTS_BAL, 1));
        expect([...onBilling.nodes].sort()).toEqual([agentId(AGENTS_BAL, 1), agentId(AGENTS_BAL, 9), splitId, triggerId].sort());
        expect(onBilling.nodes.has(agentId(AGENTS_BAL, 5))).toBe(false);
        expect([...onBilling.edges].sort()).toEqual([`${triggerId}->${splitId}`, `${splitId}->${agentId(AGENTS_BAL, 1)}`, `${agentId(AGENTS_BAL, 1)}=>${agentId(AGENTS_BAL, 9)}`].sort());

        const onTrigger = focusAround(graph, triggerId);
        expect([...onTrigger.nodes].sort()).toEqual([triggerId, splitId, agentId(AGENTS_BAL, 1), agentId(AGENTS_BAL, 5), agentId(AGENTS_BAL, 9)].sort());

        const onSubAgent = focusAround(graph, agentId(AGENTS_BAL, 9));
        expect([...onSubAgent.nodes].sort()).toEqual([agentId(AGENTS_BAL, 9), agentId(AGENTS_BAL, 1), splitId, triggerId].sort());
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

        expect(graph.triggers).toHaveLength(2);
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
        expect(edge.chips).toEqual([]);
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

        expect(graph.triggers).toHaveLength(0);
        expect(graph.agents[0].orphan).toBe(true);
    });

    it("draws the automation as a trigger node", () => {
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

        expect(graph.triggers).toHaveLength(1);
        expect(graph.triggers[0].glyphType).toBe("automation");
        expect(graph.triggers[0].label1).toBe("main");
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
