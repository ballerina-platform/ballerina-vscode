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

jest.mock("@wso2/ballerina-side-panel", () => ({ useAssistSource: jest.fn() }));

import { McpAssistState, applyMcp, describeMcp } from "../../../../views/BI/AIChatAgent/Mcp/mcpAssist";

const state = (overrides: Partial<McpAssistState> = {}): McpAssistState => ({
    requiresAuth: false,
    setRequiresAuth: jest.fn(),
    includeContext: false,
    setIncludeContext: jest.fn(),
    toolsInclude: "all",
    setToolsInclude: jest.fn(),
    tools: [],
    selected: new Set(),
    setSelected: jest.fn(),
    pickLater: jest.fn(),
    ...overrides,
});

describe("MCP form parts for the form Copilot", () => {
    it("sets the toggles it is given and leaves the others", () => {
        const mcp = state();
        applyMcp(mcp, { values: { requiresAuth: "true", toolsInclude: "selected" } });
        expect(mcp.setRequiresAuth).toHaveBeenCalledWith(true);
        expect(mcp.setToolsInclude).toHaveBeenCalledWith("selected");
        expect(mcp.setIncludeContext).not.toHaveBeenCalled();
    });

    it("keeps tools named before the list loads, to pick when it arrives", () => {
        const mcp = state();
        applyMcp(mcp, { values: { toolsInclude: "selected" }, groups: { selectedTools: [{ tool: "search_hotels" }, { tool: "get_forecast" }] } });
        expect(mcp.pickLater).toHaveBeenCalledWith(["search_hotels", "get_forecast"]);
        expect(mcp.setSelected).not.toHaveBeenCalled();
    });

    it("picks only tools the server has once the list is loaded", () => {
        const mcp = state({ toolsInclude: "selected", tools: ["search", "book"], selected: new Set(["search", "book"]) });
        expect(describeMcp(mcp).groups[0].rows).toEqual([{ tool: "search" }, { tool: "book" }]);
        applyMcp(mcp, { groups: { selectedTools: [{ tool: "book" }, { tool: "cancel" }] } });
        expect(mcp.setSelected).toHaveBeenCalledWith(new Set(["book"]));
    });
});
