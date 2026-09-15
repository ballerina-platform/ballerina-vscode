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

/**
 * @jest-environment node
 *
 * node, not the package default: jsdom currently fails to load in this tree
 * (jsdom -> http-proxy-agent@5 -> ESM-only @tootallnate/once@3), which takes
 * down every suite in the package before a test runs. These are pure functions,
 * so they need no DOM.
 */

import {
    getFileName,
    getToolCallDisplay,
    getToolIcon,
    getToolResultDisplay,
    getToolResultIcon,
    parseMcpName,
 isToolResultInProgress } from "./toolDisplay";

describe("parseMcpName", () => {
    it("splits a namespaced MCP tool into server and tool", () => {
        expect(parseMcpName("mcp__github__create_issue")).toEqual({ server: "github", tool: "create_issue" });
    });

    it("keeps later separators with the tool name", () => {
        expect(parseMcpName("mcp__github__a__b")).toEqual({ server: "github", tool: "a__b" });
    });

    it("returns null for a non-MCP tool", () => {
        expect(parseMcpName("file_read")).toBeNull();
    });

    it("returns null when the server segment is missing or empty", () => {
        expect(parseMcpName("mcp__")).toBeNull();
        expect(parseMcpName("mcp____create_issue")).toBeNull();
    });
});

describe("getFileName", () => {
    it("takes the last path segment", () => {
        expect(getFileName("modules/orders/main.bal")).toBe("main.bal");
    });

    it("passes through a bare filename", () => {
        expect(getFileName("main.bal")).toBe("main.bal");
    });

    it("falls back to a placeholder when the path is missing", () => {
        expect(getFileName(undefined)).toBe("file");
    });
});

describe("getToolCallDisplay", () => {
    it("names file tools with their filename", () => {
        expect(getToolCallDisplay("file_read", { fileName: "a/main.bal" })).toEqual({
            label: "Reading",
            detail: "main.bal...",
        });
        expect(getToolCallDisplay("file_write", { fileName: "a/main.bal" })).toEqual({
            label: "Creating",
            detail: "main.bal...",
        });
    });

    it("treats single and batch edits the same", () => {
        const single = getToolCallDisplay("file_edit", { fileName: "x.bal" });
        expect(getToolCallDisplay("file_batch_edit", { fileName: "x.bal" })).toEqual(single);
        expect(single.label).toBe("Updating");
    });

    it("routes any MCP tool through the namespaced label, ahead of the switch", () => {
        expect(getToolCallDisplay("mcp__github__create_issue", {})).toEqual({
            label: "Calling github · create_issue...",
        });
    });

    it("degrades to the generic label for an unknown tool", () => {
        expect(getToolCallDisplay("some_future_tool", {})).toEqual({ label: "Working..." });
        expect(getToolCallDisplay(undefined, undefined)).toEqual({ label: "Working..." });
    });

    // These branches change shape based on whether the input carried the field,
    // which is what the composer's loading indicator renders verbatim.
    it("varies web tool wording on whether a query/url is present", () => {
        expect(getToolCallDisplay("web_search", { query: "ballerina http" })).toEqual({
            label: "Searching the web:",
            detail: "ballerina http",
        });
        expect(getToolCallDisplay("web_search", {})).toEqual({
            label: "Searching the web...",
            detail: undefined,
        });
    });

    it("distinguishes a service run from a program run", () => {
        expect(getToolCallDisplay("runBallerinaPackage", { runType: "service" }).label).toBe("Running service...");
        expect(getToolCallDisplay("runBallerinaPackage", {}).label).toBe("Running program...");
    });

    it("survives a malformed input payload rather than throwing", () => {
        expect(() => getToolCallDisplay("file_read", null)).not.toThrow();
        expect(getToolCallDisplay("file_read", null).detail).toBe("file...");
    });
});

describe("getToolResultDisplay", () => {
    it("reports created vs updated from the result action", () => {
        expect(getToolResultDisplay("file_write", { fileName: "m.bal", action: "updated" }).label).toBe("Updated");
        expect(getToolResultDisplay("file_write", { fileName: "m.bal", action: "created" }).label).toBe("Created");
    });

    it("summarises diagnostics by count", () => {
        expect(getToolResultDisplay("getCompilationErrors", { diagnostics: [1, 2] }).label).toBe("Found 2 error(s)");
        expect(getToolResultDisplay("getCompilationErrors", { diagnostics: [] }).label).toBe("No issues found");
    });

    it("degrades to the generic label for an unknown tool", () => {
        expect(getToolResultDisplay("some_future_tool", {})).toEqual({ label: "Done" });
    });
});

describe("tool icons", () => {
    it("uses the done icon only when one is defined for that tool", () => {
        expect(getToolIcon("getCompilationErrors", "loading")).toBe("codicon-pulse");
        expect(getToolIcon("getCompilationErrors", "done")).toBe("codicon-pass-filled");
        // file_read declares no done icon, so it reuses its loading icon.
        expect(getToolIcon("file_read", "done")).toBe(getToolIcon("file_read", "loading"));
    });

    it("gives every MCP tool the plug icon without a per-tool entry", () => {
        expect(getToolIcon("mcp__anything__at_all")).toBe("codicon-plug");
    });

    it("falls back to a default icon for an unknown tool", () => {
        expect(getToolIcon("some_future_tool")).toBe("codicon-symbol-property");
    });

    it("shows a warning icon for diagnostics that found errors", () => {
        expect(getToolResultIcon("getCompilationErrors", { diagnostics: [1] })).toBe("codicon-warning");
        expect(getToolResultIcon("getCompilationErrors", { diagnostics: [] })).toBe("codicon-pass-filled");
    });
});

describe("subagent tool rows", () => {
    it("labels the Subagent call from the description and marks background and resume runs", () => {
        expect(getToolCallDisplay("Subagent", { description: "kafka connector lookup" })).toEqual({ label: "Consulting the Librarian — kafka connector lookup..." });
        expect(getToolCallDisplay("Subagent", { description: "Kafka lookup", run_in_background: true })).toEqual({ label: "Consulting the Librarian (background) — Kafka lookup..." });
        expect(getToolCallDisplay("Subagent", { description: "Kafka lookup", resume: "task-subagent-0123abcd" })).toEqual({ label: "Following up with the Librarian — Kafka lookup..." });
        expect(getToolCallDisplay("Subagent", { subagent_type: "LibraryResearcher" })).toEqual({ label: "Consulting the Library Researcher..." });
        expect(getToolCallDisplay("Subagent", {})).toEqual({ label: "Consulting the Librarian..." });
    });

    it("words each Subagent result status, listing found libraries", () => {
        expect(getToolResultDisplay("Subagent", { description: "Kafka lookup", status: "started", background: true })).toEqual({ label: "Librarian running in background — Kafka lookup" });
        // Heartbeats carry what the subagent just did; the row keeps spinning while the result is partial.
        expect(getToolResultDisplay("Subagent", { description: "Kafka lookup", status: "running", progress: "reading ballerinax/kafka docs", step: 3 }))
            .toEqual({ label: "Consulting the Librarian — reading ballerinax/kafka docs (step 3)..." });
        expect(getToolResultDisplay("Subagent", { subagent_type: "LibraryResearcher", status: "running", background: true, progress: "searching the web", step: 2 }))
            .toEqual({ label: "Consulting the Library Researcher (background) — searching the web (step 2)..." });
        expect(isToolResultInProgress({ partial: true })).toBe(true);
        expect(isToolResultInProgress({})).toBe(false);
        expect(isToolResultInProgress(undefined)).toBe(false);
        expect(getToolResultDisplay("Subagent", { description: "Kafka lookup", status: "completed", libraries: ["ballerinax/kafka"] }))
            .toEqual({ label: "Kafka lookup — found:", detail: "ballerinax/kafka" });
        expect(getToolResultDisplay("Subagent", { description: "Kafka lookup", status: "completed", libraries: [] })).toEqual({ label: "Kafka lookup — done", detail: undefined });
        expect(getToolResultDisplay("Subagent", { description: "Kafka lookup", status: "failed" })).toEqual({ label: "Kafka lookup — failed" });
        expect(getToolResultDisplay("Subagent", { description: "Kafka lookup", status: "aborted" })).toEqual({ label: "Kafka lookup — stopped" });
    });

    it("shows the wait-and-wake row and its outcomes", () => {
        expect(getToolCallDisplay("task_output", { task_id: "t", description: "Kafka lookup" })).toEqual({ label: "Waiting for: Kafka lookup..." });
        expect(getToolCallDisplay("task_output", { task_id: "t", block: false })).toEqual({ label: "Checking: background task..." });
        expect(getToolResultDisplay("task_output", { description: "Kafka lookup", status: "completed" })).toEqual({ label: "Kafka lookup — result received" });
        expect(getToolResultDisplay("task_output", { description: "Kafka lookup", status: "running" })).toEqual({ label: "Kafka lookup — still running" });
        expect(getToolResultDisplay("task_output", { status: "not_found" })).toEqual({ label: "Background task not found" });
        expect(getToolResultDisplay("kill_task", { status: "killed" })).toEqual({ label: "Background task stopped" });
        expect(getToolIcon("task_output")).toBe("codicon-clock");
        expect(getToolIcon("Subagent")).toBe("codicon-package");
    });
});
