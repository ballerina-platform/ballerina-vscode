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

import { buildFindFacets, buildFindRows, entryKind, findableCount, focusKind } from "../components/AgentTopologyDiagram/findRows";
import { TopologyAgentNode, TopologyEdge, TopologyEntryNode, TopologyGraph } from "../components/AgentTopologyDiagram/types";

function agent(id: string, extra: Partial<TopologyAgentNode> = {}): TopologyAgentNode {
    return {
        id, name: id, kind: "agent", typeName: "AI Agent", role: "", toolCount: 0, functionTools: 0, agentTools: 0, mcpTools: 0, tools: [], chips: [],
        typed: false, orphan: false, filePath: "/proj/agents.bal", position: { line: 1, offset: 0 },
        channels: [], people: [], activities: 0, gatedActivities: 0, humanTasks: [], peers: [],
        ...extra,
    };
}

function entry(id: string, handlers: { id: string; label: string; accessor?: string; wired?: boolean }[], extra: Partial<TopologyEntryNode> = {}): TopologyEntryNode {
    return {
        id, kind: "service", title: `/${id}`, subtitle: "http:Service", glyphType: "http", filePath: "/proj/services.bal", position: { line: 1, offset: 0 },
        handlers: handlers.map((handler) => ({
            id: handler.id, label: handler.label, accessor: handler.accessor ?? "POST", filePath: "/proj/services.bal", position: { line: 1, offset: 0 },
            logic: [], ordered: false, wired: handler.wired ?? true,
        })),
        ...extra,
    };
}

function runs(entryId: string, handlerId: string, targetId: string, step?: number): TopologyEdge {
    return { id: `${handlerId}->${targetId}`, sourceId: entryId, targetId, kind: "trigger", handlerId, handlers: step ? [{ triggerId: handlerId, order: step }] : undefined };
}

function delegates(sourceId: string, targetId: string): TopologyEdge {
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, kind: "delegation" };
}

// /ops: GET /status runs triage; POST /incidents runs the commander, who delegates to triage and comms.
// /releases: POST /hotfix runs review ① → deploy ②. main runs cost. audit is an orphan on Anthropic.
const graph: TopologyGraph = (() => {
    const agents = [
        agent("commander", { tools: [{ name: "slackClient", kind: "function" }], peers: ["triage", "comms"] }),
        agent("triage", { tools: [{ name: "pagerduty", kind: "function" }] }),
        agent("comms", { tools: [{ name: "slackClient", kind: "function" }, { name: "gmailClient", kind: "function" }] }),
        agent("review", { tools: [{ name: "githubClient", kind: "function" }] }),
        agent("deploy", { kind: "durable", typeName: "Durable Agent", channels: [{ name: "approvals", senders: [] }], people: [{ role: "Release manager", gate: true, decides: [], releases: ["deploy"] }] }),
        agent("cost"),
        agent("audit", { orphan: true, modelProvider: { label: "Anthropic", type: "anthropic" } }),
    ];
    const entries = [
        entry("ops", [{ id: "status", label: "/status", accessor: "GET" }, { id: "incidents", label: "/incidents" }, { id: "list", label: "/list", accessor: "GET", wired: false }]),
        entry("releases", [{ id: "hotfix", label: "/hotfix" }]),
        entry("main", [{ id: "main", label: "main" }], { kind: "automation", title: "main", subtitle: "automation", glyphType: "automation" }),
    ];
    const edges = [
        runs("ops", "status", "triage"),
        runs("ops", "incidents", "commander"),
        delegates("commander", "triage"),
        delegates("commander", "comms"),
        runs("releases", "hotfix", "review", 1),
        { id: "review->deploy", sourceId: "review", targetId: "deploy", kind: "trigger" as const, handlers: [{ triggerId: "hotfix", order: 2 }] },
        runs("main", "main", "cost"),
    ];
    return { agents, entries, handlers: entries.flatMap((candidate) => candidate.handlers), edges, wiredNothing: false, legendKinds: [] };
})();

describe("buildFindRows", () => {
    it("lists the wired handlers and every agent, in the canvas's order", () => {
        const rows = buildFindRows(graph, "");
        expect(rows.entries.map((row) => row.label)).toEqual(["/status", "/incidents", "/hotfix", "main"]);
        expect(rows.entries.map((row) => row.accessor)).toEqual(["GET", "POST", "POST", "POST"]);
        expect(rows.agents.map((row) => row.label)).toEqual(["commander", "triage", "comms", "review", "deploy", "cost", "audit"]);
        expect(rows.entries[0].sublabel).toBe("http:Service · /ops");
        expect(rows.entries[3].sublabel).toBe("automation");
    });

    it("still matches a handler by its accessor even though it renders as a separate pill", () => {
        const rows = buildFindRows(graph, "get");
        expect(rows.entries.map((row) => row.label)).toEqual(["/status"]);
    });

    it("matches labels first and explains an attribute match on the second line", () => {
        const rows = buildFindRows(graph, "slack");
        expect(rows.entries).toEqual([]);
        expect(rows.agents.map((row) => [row.label, row.via])).toEqual([["commander", "matches tool · slackClient"], ["comms", "matches tool · slackClient"]]);

        const byModel = buildFindRows(graph, "anthropic");
        expect(byModel.agents.map((row) => row.via)).toEqual(["matches model · Anthropic"]);

        const byRole = buildFindRows(graph, "release manager");
        expect(byRole.agents.map((row) => [row.label, row.via])).toEqual([["deploy", "waits for · Release manager"]]);
    });

    it("finds a handler by an agent it runs and sorts label matches ahead of attribute matches", () => {
        const rows = buildFindRows(graph, "tria");
        expect(rows.entries.map((row) => [row.label, row.via])).toEqual([["/status", "runs · triage"]]);
        expect(rows.agents.map((row) => [row.label, row.via])).toEqual([["triage", undefined], ["commander", "delegates to · triage"]]);
    });

    it("narrows to one kind with a facet", () => {
        expect(buildFindRows(graph, "", { group: "entry", kind: "Automation" }).entries.map((row) => row.label)).toEqual(["main"]);
        expect(buildFindRows(graph, "", { group: "entry", kind: "Automation" }).agents).toEqual([]);
        expect(buildFindRows(graph, "", { group: "agent", kind: "Durable" }).agents.map((row) => row.label)).toEqual(["deploy"]);
    });

    it("returns nothing for a query that hits neither a label nor an attribute", () => {
        const rows = buildFindRows(graph, "zebra");
        expect(rows.entries).toEqual([]);
        expect(rows.agents).toEqual([]);
    });
});

describe("buildFindFacets", () => {
    it("names the kinds the project has, entries before agents, counting wired handlers and cards", () => {
        expect(buildFindFacets(graph)).toEqual([
            { group: "entry", kind: "HTTP", count: 3 },
            { group: "entry", kind: "Automation", count: 1 },
            { group: "agent", kind: "AI agent", count: 6 },
            { group: "agent", kind: "Durable", count: 1 },
        ]);
    });

    it("labels chat services and unknown modules", () => {
        expect(entryKind(entry("chat", [], { glyphType: "ai", subtitle: "Agent Chat" }))).toBe("Chat");
        expect(entryKind(entry("orders", [], { glyphType: "kafka", subtitle: "kafka:Listener" }))).toBe("Kafka");
        expect(entryKind(entry("rpc", [], { glyphType: "grpc" }))).toBe("GRPC");
    });
});

describe("focusKind", () => {
    it("lights every flow of an entry kind, and only the cards of an agent kind", () => {
        const automation = focusKind(graph, { group: "entry", kind: "Automation" });
        expect([...automation.edges]).toEqual(["main->cost"]);
        expect(automation.nodes.has("cost")).toBe(true);
        expect(automation.nodes.has("triage")).toBe(false);

        const durable = focusKind(graph, { group: "agent", kind: "Durable" });
        expect([...durable.nodes]).toEqual(["deploy"]);
        expect(durable.edges.size).toBe(0);
    });
});

describe("findableCount", () => {
    it("counts wired handlers and agents", () => {
        expect(findableCount(graph)).toBe(4 + 7);
    });
});
