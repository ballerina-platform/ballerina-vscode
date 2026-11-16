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

// The core barrel pulls in an ESM-only dependency jest cannot load; the helper only needs the keyword list.
jest.mock("@wso2/ballerina-core", () => ({ keywords: ["string", "error", "client"] }));

import { mcpServerVariableName } from "./serverName";

const NONE = new Set<string>();

// Names the public servers give themselves, through serverInfo or their OAuth resource_name.
describe("mcpServerVariableName", () => {
    it.each([
        ["DeepWiki", "deepWiki"],
        ["tavily-mcp", "tavilyMcp"],
        ["GitHub MCP Server", "gitHubMcpServer"],
        ["Notion MCP (Beta)", "notionMcp"],
        ["MCP", "mcp"],
        ["3D Tools", "_3dTools"],
        ["string", "stringMcp"],
    ])("names %p as %p", (serverName, expected) => {
        expect(mcpServerVariableName(serverName, NONE)).toBe(expected);
    });

    it.each([undefined, "", "  ", "(beta)", "--"])("yields nothing for %p", (serverName) => {
        expect(mcpServerVariableName(serverName, NONE)).toBeUndefined();
    });

    it("keeps clear of names already declared", () => {
        expect(mcpServerVariableName("DeepWiki", new Set(["deepWiki", "deepWiki1"]))).toBe("deepWiki2");
    });

    it("always yields a Ballerina identifier", () => {
        for (const serverName of ["Ünïcode Server", "a.b/c", "x__y", "Señor MCP", "1"]) {
            const name = mcpServerVariableName(serverName, NONE);
            if (name !== undefined) {
                expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
            }
        }
    });
});
