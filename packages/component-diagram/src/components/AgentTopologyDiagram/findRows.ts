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

import { focusAround } from "./topologyFocus";
import { TopologyAgentNode, TopologyEntryNode, TopologyFocus, TopologyGraph, TopologyHandler } from "./types";

export type FindGroup = "entry" | "agent";

// A kind chip: every entry kind and agent kind the project has, with how many rows it holds.
export interface FindFacet {
    group: FindGroup;
    kind: string;
    count: number;
}

// One row of the Find list: a wired handler or an agent card, with what the canvas needs to pin or open it.
export interface FindRow {
    id: string;
    group: FindGroup;
    label: string;
    sublabel: string;
    // The attribute that matched when the label did not ("matches tool · githubClient").
    via?: string;
    kind: string;
    // An HTTP-style accessor (GET, POST, …), drawn as a colored pill like the service node's own rows.
    accessor?: string;
    handler?: TopologyHandler;
    entry?: TopologyEntryNode;
    agent?: TopologyAgentNode;
}

const PROTOCOLS = new Set(["http", "https", "grpc", "tcp", "udp", "ftp", "sftp", "smtp", "imap", "mqtt", "nats", "jms", "amqp", "asb"]);

export function entryKind(entry: TopologyEntryNode): string {
    if (entry.kind === "automation") {
        return "Automation";
    }
    if (entry.glyphType === "ai") {
        return "Chat";
    }
    const type = entry.glyphType || "service";
    return PROTOCOLS.has(type) ? type.toUpperCase() : type.charAt(0).toUpperCase() + type.slice(1);
}

export function agentKind(agent: TopologyAgentNode): string {
    if (agent.kind === "durable") {
        return "Durable";
    }
    if (agent.kind === "workflow") {
        return "Workflow";
    }
    return agent.typed ? "Typed" : "AI agent";
}

const includes = (text: string | undefined, query: string) => Boolean(text && text.toLowerCase().includes(query));

// Agents a handler runs or sends to, directly or as a later step of its chain.
function handlerTargets(graph: TopologyGraph, handlerId: string): Set<string> {
    const owned = graph.edges.filter((edge) => edge.handlerId === handlerId || (edge.handlers ?? []).some((step) => step.triggerId === handlerId));
    return new Set(owned.map((edge) => edge.targetId));
}

function entryRow(graph: TopologyGraph, entry: TopologyEntryNode, handler: TopologyHandler, query: string): FindRow | undefined {
    const label = handler.label;
    const searchText = [handler.accessor, label].filter(Boolean).join(" ");
    const sublabel = entry.kind === "service" && handler.label !== entry.title ? `${entry.subtitle} · ${entry.title}` : entry.subtitle;
    const targets = handlerTargets(graph, handler.id);
    let via: string | undefined;
    if (query && !includes(`${searchText} ${sublabel}`, query)) {
        // Node ids are file-and-line based; the person is typing the agent's name.
        const target = graph.agents.find((agent) => targets.has(agent.id) && includes(agent.name, query));
        if (!target) {
            return undefined;
        }
        via = `runs · ${target.name}`;
    }
    return { id: handler.id, group: "entry", label, sublabel, via, kind: entryKind(entry), accessor: handler.accessor, handler, entry };
}

// The first attribute the query hits, named the way the card's popovers name it.
function agentAttributeMatch(agent: TopologyAgentNode, query: string): string | undefined {
    const tool = agent.tools.find((candidate) => includes(candidate.name, query));
    if (tool) {
        return `matches tool · ${tool.name}`;
    }
    if (includes(agent.modelProvider?.label, query) || includes(agent.modelProvider?.type, query)) {
        return `matches model · ${agent.modelProvider?.label}`;
    }
    if (includes(agent.memory?.label, query)) {
        return `matches memory · ${agent.memory?.label}`;
    }
    const channel = agent.channels.find((candidate) => includes(candidate.name, query));
    if (channel) {
        return `matches event · ${channel.name}`;
    }
    const person = agent.people.find((candidate) => includes(candidate.role, query));
    if (person) {
        return `waits for · ${person.role}`;
    }
    const peer = agent.peers.find((candidate) => includes(candidate, query));
    return peer ? `delegates to · ${peer}` : undefined;
}

function agentRow(agent: TopologyAgentNode, query: string): FindRow | undefined {
    let via: string | undefined;
    if (query && !includes(`${agent.name} ${agent.typeName}`, query)) {
        via = agentAttributeMatch(agent, query);
        if (!via) {
            return undefined;
        }
    }
    return { id: agent.id, group: "agent", label: agent.name, sublabel: agent.typeName, via, kind: agentKind(agent), agent };
}

// Label matches first, attribute matches after them, each in the canvas's own order.
const byMatch = (a: FindRow, b: FindRow) => Number(Boolean(a.via)) - Number(Boolean(b.via));

export interface FindRows {
    entries: FindRow[];
    agents: FindRow[];
}

export function buildFindRows(graph: TopologyGraph, query: string, facet?: Pick<FindFacet, "group" | "kind">): FindRows {
    const needle = query.trim().toLowerCase();
    const allowed = (group: FindGroup, kind: string) => !facet || (facet.group === group && facet.kind === kind);
    const entries = graph.entries.flatMap((entry) =>
        allowed("entry", entryKind(entry))
            ? entry.handlers.filter((handler) => handler.wired).map((handler) => entryRow(graph, entry, handler, needle)).filter((row): row is FindRow => Boolean(row))
            : []
    );
    const agents = graph.agents
        .filter((agent) => allowed("agent", agentKind(agent)))
        .map((agent) => agentRow(agent, needle))
        .filter((row): row is FindRow => Boolean(row));
    return { entries: entries.sort(byMatch), agents: agents.sort(byMatch) };
}

// Kinds in the order the canvas meets them, counting wired handlers for entries and cards for agents.
export function buildFindFacets(graph: TopologyGraph): FindFacet[] {
    const facets: FindFacet[] = [];
    const bump = (group: FindGroup, kind: string) => {
        const facet = facets.find((candidate) => candidate.group === group && candidate.kind === kind);
        if (facet) {
            facet.count += 1;
        } else {
            facets.push({ group, kind, count: 1 });
        }
    };
    graph.entries.forEach((entry) => entry.handlers.filter((handler) => handler.wired).forEach(() => bump("entry", entryKind(entry))));
    graph.agents.forEach((agent) => bump("agent", agentKind(agent)));
    return [...facets.filter((facet) => facet.group === "entry"), ...facets.filter((facet) => facet.group === "agent")];
}

// How many things the list could offer: the chip is worth drawing from two.
export function findableCount(graph: TopologyGraph): number {
    return graph.handlers.filter((handler) => handler.wired).length + graph.agents.length;
}

// What a kind chip lights while hovered: every flow of that entry kind, or just the cards of that agent kind.
export function focusKind(graph: TopologyGraph, facet: Pick<FindFacet, "group" | "kind">): TopologyFocus {
    const focus: TopologyFocus = { nodes: new Set(), edges: new Set(), inlets: new Set() };
    if (facet.group === "agent") {
        graph.agents.filter((agent) => agentKind(agent) === facet.kind).forEach((agent) => focus.nodes.add(agent.id));
        return focus;
    }
    graph.entries
        .filter((entry) => entryKind(entry) === facet.kind)
        .flatMap((entry) => entry.handlers.filter((handler) => handler.wired))
        .forEach((handler) => {
            const part = focusAround(graph, handler.id);
            part.nodes.forEach((id) => focus.nodes.add(id));
            part.edges.forEach((id) => focus.edges.add(id));
            part.inlets.forEach((id) => focus.inlets.add(id));
        });
    return focus;
}
