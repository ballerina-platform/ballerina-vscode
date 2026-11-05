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

import { facetOf, groupRows, summarizeGroup } from "./rowGroups";
import { StreamItem } from "./types";

const read = (fileName: string): StreamItem => ({ kind: "tool_result", toolName: "file_read", toolOutput: { success: true, fileName } });
const reading = (fileName: string): StreamItem => ({ kind: "tool_call", toolName: "file_read", toolInput: { fileName } });
const grep = (pattern: string): StreamItem => ({ kind: "tool_result", toolName: "grep", toolOutput: { success: true, pattern, count: 2, unit: "files" } });
const glob = (pattern: string): StreamItem => ({ kind: "tool_result", toolName: "glob", toolOutput: { success: true, pattern, count: 3 } });
const edited = (fileName: string): StreamItem => ({ kind: "tool_result", toolName: "file_edit", toolOutput: { success: true, fileName } });
const written = (fileName: string, action: string): StreamItem => ({ kind: "tool_result", toolName: "file_write", toolOutput: { success: true, action, fileName } });
const text = (value: string): StreamItem => ({ kind: "text", text: value });

const rows = (...items: StreamItem[]) => items.map((item, idx) => ({ item, idx }));
const shape = (items: StreamItem[]) => groupRows(rows(...items)).map((u) => (u.kind === "row" ? "row" : `${u.group}×${u.rows.length}`));

describe("groupRows", () => {
    it("groups consecutive reads, finds and searches as one Explore group", () => {
        expect(shape([glob("**/*.bal"), grep("order"), read("agent/main.bal"), read("mcp/main.bal")])).toEqual(["explore×4"]);
    });

    it("leaves a single row as a plain row", () => {
        expect(shape([read("main.bal")])).toEqual(["row"]);
        expect(shape([read("main.bal"), text("Now the edit."), edited("main.bal")])).toEqual(["row", "row", "row"]);
    });

    it("ends a group at any other row, keeping the order", () => {
        expect(shape([read("a.bal"), read("b.bal"), text("x"), read("c.bal"), read("d.bal")])).toEqual(["explore×2", "row", "explore×2"]);
        expect(shape([read("a.bal"), read("b.bal"), edited("a.bal"), edited("b.bal")])).toEqual(["explore×2", "update×2"]);
    });

    it("never folds a failed row into a group", () => {
        const failed: StreamItem = { kind: "tool_result", toolName: "file_read", failed: true, toolOutput: { success: false, error: "boom" } };
        const refused: StreamItem = { kind: "tool_result", toolName: "file_write", toolOutput: { success: false, fileName: "main.bal" } };
        expect(shape([read("a.bal"), failed, read("b.bal")])).toEqual(["row", "row", "row"]);
        expect(shape([written("a.bal", "created"), refused, written("b.bal", "created")])).toEqual(["row", "row", "row"]);
    });

    it("puts a write in Update or Create from its result, and an open write in Create", () => {
        expect(facetOf(written("a.bal", "updated"))?.group).toBe("update");
        expect(facetOf(written("a.bal", "created"))?.group).toBe("create");
        expect(facetOf({ kind: "tool_call", toolName: "file_write", toolInput: { fileName: "a.bal" } })?.group).toBe("create");
        expect(shape([edited("a.bal"), written("b.bal", "updated")])).toEqual(["update×2"]);
    });

    it("does not group other tools", () => {
        const check: StreamItem = { kind: "tool_result", toolName: "getCompilationErrors", toolOutput: {} };
        expect(shape([check, check])).toEqual(["row", "row"]);
    });
});

describe("summarizeGroup", () => {
    it("counts files read once each and every search", () => {
        expect(summarizeGroup("explore", [glob("**/*.bal"), grep("order"), read("a/main.bal"), read("a/main.bal"), read("b/main.bal")], false))
            .toEqual({ label: "Explored", meta: "2 files read, 2 searches", running: false });
        expect(summarizeGroup("explore", [read("a.bal"), read("b.bal")], false).meta).toBe("2 files read");
        expect(summarizeGroup("explore", [grep("x")], false).meta).toBe("1 search");
    });

    it("puts the count in the label for updates and creates", () => {
        expect(summarizeGroup("update", [edited("a.bal"), edited("b.bal"), edited("a.bal")], false)).toEqual({ label: "Updated 2 files", running: false });
        expect(summarizeGroup("create", [written("a.bal", "created"), written("b.bal", "created")], false).label).toBe("Created 2 files");
    });

    it("shows the latest running call while the turn is live", () => {
        expect(summarizeGroup("explore", [read("agent/main.bal"), grep("x"), reading("mcp/config.bal")], true)).toEqual({
            label: "Exploring", detail: "Reading config.bal in mcp...", meta: "1 file read, 1 search", running: true,
        });
        expect(summarizeGroup("update", [edited("a.bal"), { kind: "tool_call", toolName: "file_edit", toolInput: { fileName: "mcp/main.bal" } }], true))
            .toEqual({ label: "Updating", detail: "main.bal in mcp...", meta: undefined, running: true });
    });

    it("stays in the present tense between calls while it is the turn's latest step", () => {
        expect(summarizeGroup("explore", [glob("**/*.bal"), grep("order")], true, true))
            .toEqual({ label: "Exploring", meta: "2 searches", running: true });
        expect(summarizeGroup("update", [edited("a.bal"), edited("b.bal")], true, true)).toEqual({ label: "Updating 2 files", running: true });
        expect(summarizeGroup("explore", [glob("**/*.bal"), grep("order")], true, false).label).toBe("Explored");
        expect(summarizeGroup("explore", [glob("**/*.bal"), grep("order")], false, true).label).toBe("Explored");
    });

    it("reads as done once the turn stops, counting only finished calls", () => {
        expect(summarizeGroup("explore", [read("a.bal"), read("b.bal"), reading("c.bal")], false))
            .toEqual({ label: "Explored", meta: "2 files read", running: false });
    });
});
