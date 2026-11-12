// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { createToolSearchTool, toToolSearchModelOutput, TOOL_SEARCH_TOOL_NAME } from "../features/ai/agent/tools/tool-search";

const CATALOG = [
    { name: "mcp__github__create_issue", description: "Create a GitHub issue." },
    { name: "web_fetch", description: "Fetch a URL." },
];

describe("tool_search model output", () => {
    // The API rejects a tool_result that mixes tool references with any other content.
    it("emits only one tool reference per loaded tool", () => {
        expect(toToolSearchModelOutput({ loaded: ["web_fetch", "mcp__github__create_issue"], message: "Loaded web_fetch, mcp__github__create_issue." }))
            .toEqual({
                type: "content",
                value: [
                    { type: "custom", providerOptions: { anthropic: { type: "tool-reference", toolName: "web_fetch" } } },
                    { type: "custom", providerOptions: { anthropic: { type: "tool-reference", toolName: "mcp__github__create_issue" } } },
                ],
            });
    });

    it("emits the message as text when nothing was loaded", () => {
        expect(toToolSearchModelOutput({ loaded: [], message: "No deferred tools matched \"x\"." })).toEqual({
            type: "content",
            value: [{ type: "text", text: "No deferred tools matched \"x\"." }],
        });
    });
});

describe("createToolSearchTool", () => {
    it("loads matches, emits tool_call and tool_result, and wires toModelOutput", async () => {
        const events: any[] = [];
        const searchTool = createToolSearchTool(() => CATALOG, e => events.push(e));

        const result = await searchTool.execute!({ query: "select:web_fetch" }, { toolCallId: "c1", messages: [] });
        expect(result).toEqual({ loaded: ["web_fetch"], message: "Loaded web_fetch." });
        expect(events.map(e => [e.type, e.toolName, e.toolCallId])).toEqual([
            ["tool_call", TOOL_SEARCH_TOOL_NAME, "c1"],
            ["tool_result", TOOL_SEARCH_TOOL_NAME, "c1"],
        ]);

        const modelOutput = await searchTool.toModelOutput!({ toolCallId: "c1", input: { query: "select:web_fetch" }, output: result as any });
        expect(modelOutput).toEqual(toToolSearchModelOutput(result as any));
    });

    it("reports when nothing matches", async () => {
        const searchTool = createToolSearchTool(() => CATALOG, () => undefined);
        const result = await searchTool.execute!({ query: "kubernetes" }, { toolCallId: "c2", messages: [] });
        expect(result).toEqual({ loaded: [], message: "No deferred tools matched \"kubernetes\"." });
    });
});
