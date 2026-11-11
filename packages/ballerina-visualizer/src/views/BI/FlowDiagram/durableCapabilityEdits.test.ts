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

import { Category, Flow, FlowNode } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-rpc-client", () => ({ useRpcContext: jest.fn() }));

import { drawDurableEdits, DurableEdit, durableEditLanded, withoutRegisteredCapabilities } from "./durableCapabilityEdits";

const box = (data: Record<string, unknown>): FlowNode => ({
    id: "box",
    codedata: { node: "DURABLE_AGENT_RUN" },
    metadata: { label: "agent", data: { agentBox: true, ...data } },
} as unknown as FlowNode);

const flowOf = (data: Record<string, unknown>): Flow => ({ fileName: "agents.bal", nodes: [box(data)] } as unknown as Flow);

const listed = (flow: Flow | undefined, list: string) =>
    ((flow?.nodes[0].metadata.data as Record<string, { name: string; pending?: boolean }[]>)[list] ?? [])
        .map((capability) => capability.name + (capability.pending ? " (pending)" : ""));

describe("durable capability edits", () => {
    it("hides removals and shows additions pending until the source has them", () => {
        const flow = flowOf({ tools: [{ name: "getTool" }, { name: "sharedTool" }], humanTasks: [] });
        const edits: DurableEdit[] = [
            { op: "remove", list: "tools", name: "getTool" },
            { op: "add", list: "humanTasks", name: "approveRequest" },
        ];
        const drawn = drawDurableEdits(flow, edits);
        expect(listed(drawn, "tools")).toEqual(["sharedTool"]);
        expect(listed(drawn, "humanTasks")).toEqual(["approveRequest (pending)"]);
        expect(listed(flow, "tools")).toEqual(["getTool", "sharedTool"]);
    });

    it("draws no pending copy once the source has the capability", () => {
        const flow = flowOf({ tools: [{ name: "sharedTool" }] });
        expect(listed(drawDurableEdits(flow, [{ op: "add", list: "tools", name: "sharedTool" }]), "tools")).toEqual(["sharedTool"]);
    });

    it("lets a settled edit go once a fetched flow shows it", () => {
        const add: DurableEdit = { op: "add", list: "events", name: "orderUpdate", settled: true };
        const remove: DurableEdit = { op: "remove", list: "tools", name: "getTool", settled: true };
        expect(durableEditLanded(flowOf({ events: [{ name: "orderUpdate" }] }), add)).toBe(true);
        expect(durableEditLanded(flowOf({ events: [] }), add)).toBe(false);
        expect(durableEditLanded(flowOf({ tools: [] }), remove)).toBe(true);
        expect(durableEditLanded(flowOf({ tools: [] }), { ...remove, settled: false })).toBe(false);
    });

    it("leaves tools and activities the agent already has out of the Add Tool/Activity list", () => {
        const item = (node: string, symbol: string) => ({ metadata: { label: symbol }, codedata: { node, symbol } });
        const categories = [{
            metadata: { label: "Tools" },
            items: [
                item("DURABLE_AGENT_REGISTER_TOOL", "sharedTool"),
                item("DURABLE_AGENT_REGISTER_TOOL", "otherTool"),
                { metadata: { label: "Current Integration" }, items: [item("DURABLE_AGENT_ADD_ACTIVITY", "charge"), item("MCP_TOOL_KIT", "sharedTool")] },
            ],
        }] as unknown as Category[];
        const agent = box({ tools: [{ name: "sharedTool" }], activities: [{ name: "pay", values: { activity: "charge" } }] });
        const labels = (items: Category["items"]): string[] => items.flatMap((entry) =>
            "codedata" in entry ? [entry.metadata.label] : labels((entry as Category).items));
        expect(labels(withoutRegisteredCapabilities(categories, agent)[0].items)).toEqual(["otherTool", "sharedTool"]);
    });
});
