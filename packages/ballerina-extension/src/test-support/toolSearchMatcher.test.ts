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

import { searchTools, SearchableTool } from "../features/ai/agent/tools/tool-search/matcher";

const CATALOG: SearchableTool[] = [
    { name: "mcp__github__create_issue", description: "Create a new issue in a GitHub repository." },
    { name: "mcp__github__list_pulls", description: "List pull requests in a repository." },
    { name: "mcp__slack__send_message", description: "Send a message to a Slack channel." },
    { name: "mcp__slack__list_channels", description: "List the channels in the workspace." },
    { name: "mcp__mail__send_email", description: "Send an email. Can notify a Slack user by mail." },
    { name: "web_fetch", description: "Fetch a URL and return its content." },
    { name: "notebookEdit", description: "Edit a Jupyter notebook cell." },
];

describe("searchTools", () => {
    describe("select: form", () => {
        it("returns exact names in the order given", () => {
            expect(searchTools("select:web_fetch,mcp__github__create_issue", CATALOG, 5))
                .toEqual(["web_fetch", "mcp__github__create_issue"]);
        });

        it("trims names, matches case-insensitively and returns canonical names", () => {
            expect(searchTools("SELECT: Web_Fetch , NOTEBOOKEDIT", CATALOG, 5))
                .toEqual(["web_fetch", "notebookEdit"]);
        });

        it("skips unknown and duplicate names", () => {
            expect(searchTools("select:nope,web_fetch,web_fetch,", CATALOG, 5)).toEqual(["web_fetch"]);
        });

        it("is not capped by maxResults", () => {
            expect(searchTools("select:web_fetch,notebookEdit,mcp__slack__send_message", CATALOG, 1)).toHaveLength(3);
        });

        it("returns [] for an empty list", () => {
            expect(searchTools("select:", CATALOG, 5)).toEqual([]);
        });
    });

    describe("keyword form", () => {
        it("ranks a name hit above a description hit", () => {
            // "slack" is a name part of both slack tools (send_message also has it in its description)
            // and appears only in the mail tool's description.
            const result = searchTools("slack", CATALOG, 5);
            expect(result).toEqual(["mcp__slack__send_message", "mcp__slack__list_channels", "mcp__mail__send_email"]);
        });

        it("splits names on underscores and camelCase", () => {
            expect(searchTools("notebook jupyter", CATALOG, 5)[0]).toBe("notebookEdit");
            expect(searchTools("issue", CATALOG, 5)).toEqual(["mcp__github__create_issue"]);
        });

        it("sums scores across terms", () => {
            expect(searchTools("github pulls", CATALOG, 5)[0]).toBe("mcp__github__list_pulls");
        });

        it("breaks ties by name and caps results at maxResults", () => {
            // Every mcp__ tool scores the same for "mcp".
            expect(searchTools("mcp", CATALOG, 3))
                .toEqual(["mcp__github__create_issue", "mcp__github__list_pulls", "mcp__mail__send_email"]);
        });

        it("returns [] when nothing matches", () => {
            expect(searchTools("kubernetes", CATALOG, 5)).toEqual([]);
        });
    });

    describe("+required terms", () => {
        it("keeps only tools containing every required term and ranks by the rest", () => {
            // Both slack tools and the mail tool (description) contain "slack"; "send" ranks them.
            const result = searchTools("+slack send", CATALOG, 5);
            expect(result[0]).toBe("mcp__slack__send_message");
            expect(result).not.toContain("web_fetch");
            expect(result).toContain("mcp__slack__list_channels");
            expect(result).toContain("mcp__mail__send_email");
        });

        it("drops tools missing a required term even when other terms match", () => {
            expect(searchTools("+github send", CATALOG, 5)).toEqual(["mcp__github__create_issue", "mcp__github__list_pulls"]);
        });

        it("ignores a bare +", () => {
            expect(searchTools("+ web", CATALOG, 5)).toEqual(["web_fetch"]);
        });
    });

    it("returns an exact full-name query first", () => {
        const result = searchTools("mcp__slack__send_message", CATALOG, 5);
        expect(result[0]).toBe("mcp__slack__send_message");
    });

    it("matches an exact full name case-insensitively", () => {
        expect(searchTools("WEB_FETCH", CATALOG, 5)[0]).toBe("web_fetch");
    });

    it("returns [] for an empty or blank query", () => {
        expect(searchTools("", CATALOG, 5)).toEqual([]);
        expect(searchTools("   ", CATALOG, 5)).toEqual([]);
    });
});
