/**
 * @jest-environment node
 */
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

import type { Flow, FlowNode } from "@wso2/ballerina-core";
import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";

jest.mock("@wso2/ballerina-core", () =>
    new Proxy(
        { EVENT_TYPE: {}, MACHINE_VIEW: {}, TRIGGER_CHARACTERS: [], __esModule: true },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : {}) }
    )
);
jest.mock("../../../constants", () => ({ BALLERINA: "ballerina" }));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("@wso2/ballerina-side-panel", () => ({}));
jest.mock("../../../utils/bi", () => ({ convertNodePropertyToFormField: jest.fn() }));
jest.mock("./toolForm", () => ({ OAUTH_GROUP: "oauth" }));

import { debouncedUndoRedoManager } from "../../../utils/debouncedUndoRedo";
import {
    drawnFlowKey,
    drawsDeletingTool,
    hideDeletingTools,
    saveAgentDeclaration,
    saveToolOnAgent,
    serializeAgentToolsEdit,
    withCurrentAgentTools,
} from "./utils";

const agent = (tools: string, line = 3): FlowNode => ({
    codedata: { node: "AGENT", lineRange: { fileName: "agents.bal", startLine: { line, offset: 0 }, endLine: { line: line + 2, offset: 2 } } },
    properties: { variable: { value: "aiAgent" }, tools: { value: tools } },
} as unknown as FlowNode);

// An rpc client whose module nodes are the agent as currently "in the source", and which records the agents written.
function fakeSource(initialTools: string) {
    let current = agent(initialTools, 10);
    const written: string[] = [];
    const rpcClient = {
        getBIDiagramRpcClient: () => ({
            getModuleNodes: async () => ({ flowModel: { connections: [] as FlowNode[], variables: [current] } }),
            getSourceCode: async ({ flowNode }: { flowNode: FlowNode }) => {
                await new Promise((r) => setTimeout(r, 5));
                written.push(String(flowNode.properties.tools.value));
                current = flowNode;
                return {};
            },
        }),
        getVisualizerRpcClient: () => ({ joinProjectPath: async () => ({ filePath: "/p/agents.bal" }) }),
    } as unknown as BallerinaRpcClient;
    return { rpcClient, written, current: () => current };
}

describe("agent tool-list edits", () => {
    it("serializes edits so they never interleave", async () => {
        const order: string[] = [];
        const edit = (name: string, ms: number) => serializeAgentToolsEdit(async () => {
            order.push(`start ${name}`);
            await new Promise((r) => setTimeout(r, ms));
            order.push(`end ${name}`);
            return name;
        });
        const results = await Promise.all([edit("a", 20), edit("b", 1), edit("c", 5)]);
        expect(results).toEqual(["a", "b", "c"]);
        expect(order).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    });

    it("keeps running later edits after one fails", async () => {
        const failed = serializeAgentToolsEdit(async () => { throw new Error("boom"); });
        const next = serializeAgentToolsEdit(async () => "ok");
        await expect(failed).rejects.toThrow("boom");
        await expect(next).resolves.toBe("ok");
    });

    it("reads the tool list and position the agent has in the source now", async () => {
        const source = fakeSource("[getTool]");
        const { node, current } = await withCurrentAgentTools(agent("[]", 3), source.rpcClient);
        expect(current).toBe(true);
        expect(node.properties.tools.value).toBe("[getTool]");
        expect(node.codedata.lineRange.startLine.line).toBe(10);
    });

    it("reads the agent from module nodes the caller already has, without another request", async () => {
        const getModuleNodes = jest.fn();
        const rpcClient = { getBIDiagramRpcClient: () => ({ getModuleNodes }) } as unknown as BallerinaRpcClient;
        const moduleNodes = { connections: [], variables: [agent("[getTool]", 10)] } as unknown as Flow;
        const { node, current } = await withCurrentAgentTools(agent("[]", 3), rpcClient, moduleNodes);
        expect(getModuleNodes).not.toHaveBeenCalled();
        expect(current).toBe(true);
        expect(node.properties.tools.value).toBe("[getTool]");
    });

    it("reads a local agent's current tools from the function that declares it", async () => {
        const local = { ...agent("[t1, t2]", 7), properties: { variable: { value: "localAgent" }, tools: { value: "[t2]" } } };
        const rpcClient = {
            getBIDiagramRpcClient: () => ({
                getModuleNodes: async () => ({ flowModel: { connections: [], variables: [] } }),
                getEnclosedFunction: async () => ({ startLine: { line: 2, offset: 0 }, endLine: { line: 9, offset: 1 } }),
                getFlowModel: async () => ({ flowModel: { nodes: [{ codedata: { node: "EVENT_START" } }, local] } }),
            }),
            getVisualizerRpcClient: () => ({ joinProjectPath: async () => ({ filePath: "/p/agents.bal" }) }),
        } as unknown as BallerinaRpcClient;
        const stale = { ...agent("[t1, t2]", 7), properties: { variable: { value: "localAgent" }, tools: { value: "[t1, t2]" } } };
        const { node, current } = await withCurrentAgentTools(stale as unknown as FlowNode, rpcClient);
        expect(current).toBe(true);
        expect(node.properties.tools.value).toBe("[t2]");
    });

    it("keeps both tools when two saves start from the same stale panel copy", async () => {
        const source = fakeSource("[]");
        const stalePanelCopy = agent("[]");
        await Promise.all([
            saveToolOnAgent(stalePanelCopy, "utcNowTool", source.rpcClient),
            saveToolOnAgent(stalePanelCopy, "tool", source.rpcClient),
        ]);
        expect(source.written).toEqual(["[utcNowTool]", "[utcNowTool, tool]"]);
        expect(source.current().properties.tools.value).toBe("[utcNowTool, tool]");
    });
});

describe("drawing an agent without the tools being deleted", () => {
    const rendered = (id: string, tools: string[], agentName = id): FlowNode => ({
        id,
        codedata: { node: "AGENT" },
        properties: { variable: { value: agentName } },
        metadata: { label: id, data: { agentInfo: { tools: tools.map((name) => ({ name })) } } },
        branches: [],
    } as unknown as FlowNode);
    const toolNames = (node: FlowNode) =>
        ((node.metadata.data as { agentInfo: { tools: { name: string }[] } }).agentInfo.tools).map((tool) => tool.name);
    const flowOf = (...nodes: unknown[]) => ({ fileName: "agents.bal", connections: [], nodes } as unknown as Flow);

    it("drops them from the agent listed under connections too", () => {
        const flow = { ...flowOf(rendered("a", ["t1", "t2"])), connections: [rendered("a", ["t1", "t2"])] } as unknown as Flow;
        expect(hideDeletingTools(flow, [{ nodeId: "a", name: "t1" }]).connections.map(toolNames)).toEqual([["t2"]]);
    });

    it("drops only those tools, only from that agent node", () => {
        const flow = flowOf(rendered("a", ["t1", "t2", "t3"]), rendered("b", ["t2"]));
        const result = hideDeletingTools(flow, [{ nodeId: "a", name: "t2" }, { nodeId: "a", name: "t3" }]);
        expect(result.nodes.map(toolNames)).toEqual([["t1"], ["t2"]]);
        expect(flow.nodes.map(toolNames)).toEqual([["t1", "t2", "t3"], ["t2"]]);
    });

    it("still finds the agent by name when a refresh gave its node another id", () => {
        const flow = flowOf(rendered("new-id", ["t1", "t2"], "aiAgent"));
        const result = hideDeletingTools(flow, [{ nodeId: "old-id", agentName: "aiAgent", name: "t1" }]);
        expect(toolNames(result.nodes[0])).toEqual(["t2"]);
    });

    it("finds an agent node nested in a branch", () => {
        const flow = flowOf({ id: "if", codedata: { node: "IF" }, branches: [{ label: "Then", children: [rendered("a", ["t1"])] }] });
        const result = hideDeletingTools(flow, [{ nodeId: "a", name: "t1" }]);
        expect(toolNames(result.nodes[0].branches[0].children[0])).toEqual([]);
    });

    it("leaves the flow as drawn when nothing is being deleted there", () => {
        const flow = flowOf(rendered("a", ["t1"]));
        expect(hideDeletingTools(flow, [])).toBe(flow);
        expect(hideDeletingTools(flow, [{ nodeId: "a", name: "missing" }]).nodes[0]).toBe(flow.nodes[0]);
        expect(hideDeletingTools(flow, [{ nodeId: "other", name: "t1" }]).nodes[0]).toBe(flow.nodes[0]);
    });

    it("tells whether a fetched flow still draws the tool", () => {
        const entry = { nodeId: "a", agentName: "aiAgent", name: "t1" };
        expect(drawsDeletingTool(flowOf(rendered("a", ["t1"], "aiAgent")), entry)).toBe(true);
        expect(drawsDeletingTool(flowOf(rendered("a", ["t2"], "aiAgent")), entry)).toBe(false);
        expect(drawsDeletingTool(undefined, entry)).toBe(false);
    });
});

describe("saving an agent declaration edited from an older copy", () => {
    const declaration = (tools: string, prompt: string): FlowNode => ({
        codedata: { node: "AGENT", lineRange: { fileName: "agents.bal", startLine: { line: 3, offset: 0 }, endLine: { line: 5, offset: 2 } } },
        properties: { variable: { value: "aiAgent" }, tools: { value: tools }, systemPrompt: { value: prompt } },
    } as unknown as FlowNode);

    it("keeps the tools the agent has now, so a deleted tool does not come back", async () => {
        const source = fakeSource("[t1]");
        const panelCopy = declaration("[t1, t2]", "old");
        const edited = declaration("[t1, t2]", "new");
        const written = await saveAgentDeclaration(edited, panelCopy, source.rpcClient, async (node) => node);
        expect(written.properties.tools.value).toBe("[t1]");
        expect(written.properties.systemPrompt.value).toBe("new");
    });

    it("keeps the tools this edit set itself", async () => {
        const source = fakeSource("[t1]");
        const written = await saveAgentDeclaration(
            declaration("[t1, t9]", "new"), declaration("[t1]", "old"), source.rpcClient, async (node) => node);
        expect(written.properties.tools.value).toBe("[t1, t9]");
    });

    it("waits for queued tool edits before reading the agent", async () => {
        const source = fakeSource("[t1, t2]");
        const order: string[] = [];
        const removal = serializeAgentToolsEdit(async () => {
            await new Promise((r) => setTimeout(r, 10));
            await source.rpcClient.getBIDiagramRpcClient().getSourceCode({ flowNode: declaration("[t1]", "old") } as never);
            order.push("tool removed");
        });
        const save = saveAgentDeclaration(declaration("[t1, t2]", "new"), undefined, source.rpcClient, async (node) => {
            order.push("agent saved");
            return node;
        });
        const [, written] = await Promise.all([removal, save]);
        expect(order).toEqual(["tool removed", "agent saved"]);
        expect(written.properties.tools.value).toBe("[t1]");
    });

    it("lets an undo pressed during a queued tool edit apply after it", async () => {
        const order: string[] = [];
        const rpcClient = {
            getVisualizerRpcClient: () => ({
                undoRedoState: async () => ({ canUndo: true, undoCount: 1 }),
                undo: async () => { order.push("undo"); },
            }),
        } as unknown as BallerinaRpcClient;
        const removal = serializeAgentToolsEdit(async () => {
            await new Promise((r) => setTimeout(r, 10));
            order.push("tool removed");
        });
        await Promise.all([removal, debouncedUndoRedoManager.debouncedUndo(rpcClient)]);
        expect(order).toEqual(["tool removed", "undo"]);
    });

    it("keeps the canvas key when only the declaration's tool text changed", () => {
        const flow = (tools: string, drawn: string[]) => ({
            nodes: [{
                id: "a", codedata: { node: "AGENT", sourceCode: `final ai:Agent aiAgent = check new (tools = ${tools});` },
                properties: { tools: { value: tools } },
                metadata: { data: { agentInfo: { tools: drawn.map((name) => ({ name })) } } },
            }],
        } as unknown as Flow);
        expect(drawnFlowKey(flow("[t1, t2]", ["t2"]))).toBe(drawnFlowKey(flow("[t2]", ["t2"])));
        expect(drawnFlowKey(flow("[t2]", ["t2"]))).not.toBe(drawnFlowKey(flow("[t2]", ["t2", "t3"])));
    });
});
