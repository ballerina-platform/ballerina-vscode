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

import { AvailableNode, Category, Flow, FlowNode } from "@wso2/ballerina-core";
import { findDurableAgentBox } from "./durableAgentUsages";

// The agent box's capability lists, keyed as the language server puts them in the box metadata.
export type DurableCapabilityList = "tools" | "activities" | "humanTasks" | "events" | "peers";

// A capability add or removal on its way to the source; `settled` once its write is done.
export type DurableEdit = {
    op: "add" | "remove";
    list: DurableCapabilityList;
    name: string;
    preview?: Record<string, unknown>;
    settled?: boolean;
};

type Capability = { name: string; lineRange?: unknown };

const LIST_OF_TYPE: Record<string, DurableCapabilityList> = {
    tool: "tools",
    activity: "activities",
    humanTask: "humanTasks",
    event: "events",
    peer: "peers",
};

export const capabilityListOf = (type: string | undefined): DurableCapabilityList | undefined => LIST_OF_TYPE[type ?? ""];

export const durableCapabilities = (box: FlowNode | undefined, list: DurableCapabilityList): Capability[] =>
    ((box?.metadata?.data as Record<string, unknown> | undefined)?.[list] as Capability[] | undefined) ?? [];

export const durableBoxHas = (flow: Flow | undefined, list: DurableCapabilityList, name: string): boolean =>
    durableCapabilities(findDurableAgentBox(flow), list).some((capability) => capability.name === name);

// Whether the fetched flow shows a settled edit, after which the source can draw it alone.
export const durableEditLanded = (flow: Flow | undefined, edit: DurableEdit): boolean =>
    edit.settled === true && durableBoxHas(flow, edit.list, edit.name) === (edit.op === "add");

// The flow drawn with the edits the source does not show yet: removals hidden, additions shown pending.
export function drawDurableEdits(flow: Flow | undefined, edits: DurableEdit[]): Flow | undefined {
    const box = findDurableAgentBox(flow);
    if (!box || edits.length === 0) {
        return flow;
    }
    const data = { ...(box.metadata?.data as Record<string, unknown>) };
    for (const list of new Set(edits.map((edit) => edit.list))) {
        const listEdits = edits.filter((edit) => edit.list === list);
        const removed = new Set(listEdits.filter((edit) => edit.op === "remove").map((edit) => edit.name));
        const kept = durableCapabilities(box, list).filter((capability) => !removed.has(capability.name));
        const added = listEdits
            .filter((edit) => edit.op === "add" && !kept.some((capability) => capability.name === edit.name))
            .map((edit) => ({ ...edit.preview, name: edit.name, pending: true }));
        data[list] = [...kept, ...added];
    }
    return {
        ...flow,
        nodes: flow.nodes.map((node): FlowNode => (node === box ? { ...node, metadata: { ...node.metadata, data } } as FlowNode : node)),
    };
}

const REGISTERABLE_NODES = new Set(["DURABLE_AGENT_REGISTER_TOOL", "DURABLE_AGENT_ADD_ACTIVITY"]);

// The Add Tool/Activity list leaves out what the agent already has, so a pick cannot register it twice.
export function withoutRegisteredCapabilities(categories: Category[], box: FlowNode | undefined): Category[] {
    const registered = new Set([
        ...durableCapabilities(box, "tools").map((capability) => capability.name),
        ...durableCapabilities(box, "activities").map((capability) =>
            (capability as { values?: Record<string, string> }).values?.activity ?? capability.name),
    ]);
    const keep = (item: Category | AvailableNode) =>
        !("codedata" in item) || !REGISTERABLE_NODES.has(item.codedata.node) || !registered.has(item.codedata.symbol);
    const filter = (category: Category): Category => ({
        ...category,
        items: category.items?.filter(keep).map((item) => ("codedata" in item ? item : filter(item as Category))),
    });
    return categories.map(filter);
}
