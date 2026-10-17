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

import type { FlowNode } from "@wso2/ballerina-core";
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

import { saveToolOnAgent, serializeAgentToolsEdit, withCurrentAgentTools } from "./utils";

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
            getModuleNodes: async () => ({ flowModel: { connections: [], variables: [current] } }),
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
