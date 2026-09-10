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

import { CDAgentCall, CDFunction, CDModel, CDResourceFunction, CDService } from "@wso2/ballerina-core";
import { LayoutOptions, NodePosition, SPLIT_LABEL, TopologyAgentNode, TopologyGraph, TopologyLayout, TopologySplitNode } from "./types";

function at(position: NodePosition | undefined): string {
    return position ? `@${Math.round(position.x)},${Math.round(position.y)}` : "@?";
}

function pad(text: string, width: number): string {
    return text.length >= width ? text : text + " ".repeat(width - text.length);
}

// Which column (or row, when vertical) a node sits in, counted along the flow axis.
function lanesAlongFlow(positions: NodePosition[], vertical: boolean): number[] {
    return [...new Set(positions.map((position) => (vertical ? position.y : position.x)))].sort((a, b) => a - b);
}

function toolKinds(agent: TopologyAgentNode): string {
    const kinds = [agent.agentTools ? `${agent.agentTools} agent` : "", agent.mcpTools ? `${agent.mcpTools} mcp` : ""].filter(Boolean);
    return kinds.length ? ` (${kinds.join(", ")})` : "";
}

function agentLines(graph: TopologyGraph, layout: TopologyLayout, id: (nodeId: string) => string, vertical: boolean): string[] {
    const lanes = lanesAlongFlow(Object.values(layout.agentPositions), vertical);
    return graph.agents.map((agent) => {
        const position = layout.agentPositions[agent.id];
        const lane = lanes.indexOf(vertical ? position.y : position.x) + 1;
        const facts = [
            `${vertical ? "row" : "col"} ${lane}`,
            at(position),
            `h${layout.cardHeights[agent.id]}`,
            `tools ${agent.toolCount}${toolKinds(agent)}`,
            `chips ${agent.chips.length ? agent.chips.map((chip) => chip.label).join(",") : "-"}`,
            `model ${agent.modelProvider ? agent.modelProvider.label : "-"}`,
            `memory ${agent.memory ? agent.memory.label : "-"}`,
            agent.orphan ? "ORPHAN" : "",
        ].filter(Boolean);
        return `  ${pad(id(agent.id), 4)} ${pad(agent.name, 34)} ${agent.typeName.padEnd(12)} ${facts.join("  ")}`;
    });
}

function triggerLines(graph: TopologyGraph, layout: TopologyLayout, id: (nodeId: string) => string): string[] {
    return graph.triggers.map((trigger) => {
        const file = trigger.filePath.split("/").pop();
        return `  ${pad(id(trigger.id), 4)} ${pad(trigger.label1, 26)} ${pad(trigger.label2, 34)} ${at(layout.triggerPositions[trigger.id])}  ${file}:${trigger.position.line + 1}`;
    });
}

function boxText(split: TopologySplitNode, layout: TopologyLayout, id: (nodeId: string) => string): string {
    if (!split.members) {
        return "";
    }
    const box = layout.loopBoxes[split.id];
    const members = split.members.map(id).join(",");
    return box ? `  BOX ${at(box)} ${Math.round(box.width)}×${Math.round(box.height)} holds ${members}` : `  UNBOXED holds ${members}`;
}

function splitLines(graph: TopologyGraph, layout: TopologyLayout, id: (nodeId: string) => string): string[] {
    return graph.splits.map((split) =>
        `  ${pad(id(split.id), 4)} ${pad(SPLIT_LABEL[split.kind], 8)} under ${pad(id(split.parentId), 4)} depth ${split.depth}  ${at(layout.splitPositions[split.id])}${split.header ? `  header «${split.header}»` : ""}${boxText(split, layout, id)}`
    );
}

function edgeLines(graph: TopologyGraph, layout: TopologyLayout, id: (nodeId: string) => string, vertical: boolean): string[] {
    const main = (position: NodePosition): number => (vertical ? position.y : position.x);
    return graph.edges.map((edge) => {
        const vias = layout.edgeVias[edge.id] ?? [];
        const bow = layout.edgeBows[edge.id] ?? 0;
        const shape = vias.length >= 2 && main(vias[0]) > main(vias[vias.length - 1]) ? "WRAPS" : "DETOURS";
        const start = layout.edgeStarts[edge.id];
        const geometry = [
            start ? `from ${at(start).slice(1)}` : "",
            vias.length >= 2 ? `${shape} via ${vias.map((via) => at(via).slice(1)).join(" ")}` : vias.length ? `bend ${at(vias[0]).slice(1)}` : "",
            bow ? `bow ${bow > 0 ? "+" : ""}${bow}` : "",
        ].filter(Boolean);
        const chips = edge.chips.map((chip) => `«${chip.text}»`).join(" ");
        const handlers = (edge.handlers ?? []).map((step) => `${step.order}·${id(step.triggerId)}`).join(",");
        return `  ${pad(id(edge.sourceId), 4)} → ${pad(id(edge.targetId), 4)} ${pad(edge.kind, 10)} ${pad(chips, 20)} ${pad(handlers, 14)} ${geometry.join("  ")}`.trimEnd();
    });
}

function callText(call: CDAgentCall, names: Map<string, string>): string {
    const groups = (call.groups ?? []).map((group) => `${group.kind}:${group.label}`).join(" > ");
    return `${names.get(call.connection) ?? call.connection.slice(0, 8)}${groups ? `{${groups}}` : ""}`;
}

function handlerText(label: string, fn: { connections?: string[]; agentCalls?: CDAgentCall[] }, names: Map<string, string>): string | undefined {
    const agents = (fn.connections ?? []).filter((uuid) => names.has(uuid));
    if (agents.length === 0) {
        return undefined;
    }
    const calls = fn.agentCalls ?? [];
    const body = calls.length ? calls.map((call) => callText(call, names)).join(", ") : `(no direct calls) reaches ${agents.map((uuid) => names.get(uuid)).join(", ")}`;
    return `  ${pad(label, 40)} → ${body}`;
}

function serviceHandlers(service: CDService, names: Map<string, string>): string[] {
    const base = (service.absolutePath || service.displayName || service.type || "").trim();
    const resources = (service.resourceFunctions ?? []).map((fn: CDResourceFunction) =>
        handlerText(`${fn.accessor.toUpperCase()} ${base}/${fn.path}`.replace("//", "/"), fn, names));
    const remotes = (service.remoteFunctions ?? []).map((fn: CDFunction) => handlerText(`${fn.name} (${base || service.type})`, fn, names));
    return [...resources, ...remotes].filter((line): line is string => Boolean(line));
}

// The design model's side of the story: which handler calls which agents, in what constructs.
function handlerLines(model: CDModel): string[] {
    const names = new Map((model.connections ?? []).filter((connection) => connection.kind === "Agent").map((connection) => [connection.uuid, connection.symbol]));
    const lines = (model.services ?? []).flatMap((service) => serviceHandlers(service, names));
    const main = model.automation ? handlerText("main()", model.automation, names) : undefined;
    return main ? [...lines, main] : lines;
}

// A plain-text picture of the whole canvas: nodes with positions, every edge with its chips and geometry,
// and the handlers the design model reported. Printed to the webview console so a diagram can be pasted
// into a conversation instead of screenshotted.
export function describeTopology(model: CDModel, graph: TopologyGraph, layout: TopologyLayout, options: LayoutOptions): string {
    const vertical = options.orientation === "vertical";
    const shortIds = new Map<string, string>();
    graph.triggers.forEach((trigger, index) => shortIds.set(trigger.id, `T${index + 1}`));
    graph.agents.forEach((agent, index) => shortIds.set(agent.id, `A${index + 1}`));
    graph.splits.forEach((split, index) => shortIds.set(split.id, `S${index + 1}`));
    const id = (nodeId: string): string => shortIds.get(nodeId) ?? nodeId;
    return [
        `>>> agent overview · ${vertical ? "vertical" : "horizontal"} · canvas ${options.availableWidth ?? "?"}px · drawn ${Math.round(layout.width)}×${Math.round(layout.height)} (left ${Math.round(layout.left)}) · legend ${graph.legendKinds.join(", ") || "-"}${graph.wiredNothing ? " · NOTHING WIRED" : ""}`,
        `TRIGGERS (${graph.triggers.length})`,
        ...triggerLines(graph, layout, id),
        `AGENTS (${graph.agents.length})`,
        ...agentLines(graph, layout, id, vertical),
        `SPLITS (${graph.splits.length})`,
        ...splitLines(graph, layout, id),
        `EDGES (${graph.edges.length})  source → target  kind  chips  steps (order·trigger)  geometry`,
        ...edgeLines(graph, layout, id, vertical),
        "HANDLERS (design model: direct agent calls in source order, {construct:label} for the enclosing constructs)",
        ...handlerLines(model),
    ].join("\n");
}
