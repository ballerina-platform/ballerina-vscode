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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createGlobTool, createGrepTool, globProject, GREP_TIME_BUDGET_MS, grepProject, MAX_GREP_FILE_BYTES, MAX_RESULT_LINES } from "../features/ai/agent/tools/project-search";

let root: string;

function write(rel: string, content: string): void {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "project-search-"));
    write("main.bal", "import ballerina/http;\n\nservice / on new http:Listener(9090) {\n    resource function get orders() returns Order[] {\n        return [];\n    }\n}\n");
    write("modules/db/db.bal", "public isolated function getOrders() returns Order[]|error {\n    return [];\n}\n");
    write("tests/main_test.bal", "@test:Config\nfunction testOrders() {\n}\n");
    write("Config.toml", "orderToken = \"resource function get orders\"\n");
    write(".env", "TOKEN=resource function get orders\n");
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("grep", () => {
    it("returns matching files by default", async () => {
        const result = await grepProject(root, { pattern: "orders?\\(" });
        expect(result).toEqual({ success: true, message: "main.bal", count: 1, unit: "files" });
    });

    it("returns matching lines with line numbers in content mode", async () => {
        const result = await grepProject(root, { pattern: "Order\\[\\]", output_mode: "content" });
        expect(result.message.split("\n")).toEqual([
            "main.bal:4:    resource function get orders() returns Order[] {",
            "modules/db/db.bal:1:public isolated function getOrders() returns Order[]|error {",
        ]);
    });

    it("prints context lines and separates groups", async () => {
        const result = await grepProject(root, { pattern: "return \\[\\]", output_mode: "content", context: 1 });
        expect(result.message.split("\n")).toEqual([
            "main.bal-4-    resource function get orders() returns Order[] {",
            "main.bal:5:        return [];",
            "main.bal-6-    }",
            "--",
            "modules/db/db.bal-1-public isolated function getOrders() returns Order[]|error {",
            "modules/db/db.bal:2:    return [];",
            "modules/db/db.bal-3-}",
        ]);
    });

    it("marks a match as a match even when it was printed as context first", async () => {
        write("c.bal", "a1\nb2\nc3");
        const result = await grepProject(root, { pattern: "[ab][12]", path: "c.bal", output_mode: "content", context: 1 });
        expect(result.message.split("\n")).toEqual(["c.bal:1:a1", "c.bal:2:b2", "c.bal-3-c3"]);
    });

    it("never searches Config.toml or hidden files", async () => {
        const result = await grepProject(root, { pattern: "resource function get orders", output_mode: "content" });
        expect(result.message).not.toMatch(/Config\.toml|\.env/);
        expect((await grepProject(root, { pattern: "TOKEN", glob: "**" })).message).toMatch(/^No matches/);
        expect((await grepProject(root, { pattern: "orderToken", path: "Config.toml" })).success).toBe(false);
    });

    it("treats a glob filter without a slash as any depth", async () => {
        const result = await grepProject(root, { pattern: "Orders", glob: "*.bal", case_insensitive: true });
        expect(result.message.split("\n")).toEqual(["main.bal", "modules/db/db.bal", "tests/main_test.bal"]);
        expect((await grepProject(root, { pattern: "Orders", glob: "tests/*.bal" })).message).toBe("tests/main_test.bal");
    });

    it("narrows to a path", async () => {
        expect((await grepProject(root, { pattern: "return", path: "modules" })).message).toBe("modules/db/db.bal");
    });

    it("says no matches only when there are none", async () => {
        expect(await grepProject(root, { pattern: "kafka" })).toEqual({ success: true, message: "No matches for /kafka/.", count: 0, unit: "files" });
        const invalid = await grepProject(root, { pattern: "(" });
        expect(invalid.success).toBe(false);
        expect(invalid.message).toMatch(/Invalid regular expression/);
        const unsafe = await grepProject(root, { pattern: "(a+)+" });
        expect(unsafe.success).toBe(false);
        expect(unsafe.message).toMatch(/^Rejected pattern/);
        expect((await grepProject(root, { pattern: "x", path: "missing" })).success).toBe(false);
    });

    it("searches only the first 2,000 characters of a very long line", async () => {
        write("resources/spec.json", `${"a".repeat(100_000)}NEEDLE`);
        const started = Date.now();
        const result = await grepProject(root, { pattern: ".*NEEDLE", glob: "*.json" });
        expect(Date.now() - started).toBeLessThan(1000);
        expect(result.message).toMatch(/^No matches/);
    });

    it("stops a pattern that runs away on a long line and keeps what it found", async () => {
        write("resources/data.json", "a".repeat(2000));
        const started = Date.now();
        const result = await grepProject(root, { pattern: "\\w+\\w+\\w+@|isolated" });
        expect(Date.now() - started).toBeLessThan(GREP_TIME_BUDGET_MS + 2000);
        expect(result.message.split("\n")).toEqual([
            "modules/db/db.bal",
            "[Search stopped after 2 of 4 files: it ran longer than 3 seconds, so results are partial. Simplify the pattern (avoid stacked repeats such as .*.* or \\w+\\w+) or narrow path or glob.]",
        ]);
    }, 15_000);

    it("skips files over 1 MB and says so", async () => {
        write("resources/big.json", "x".repeat(MAX_GREP_FILE_BYTES + 1));
        const result = await grepProject(root, { pattern: "x", glob: "*.json" });
        expect(result.message).toContain("Skipped 1 file(s) over 1 MB: resources/big.json");
    });

    it("caps the output and says so", async () => {
        write("many.bal", Array.from({ length: 500 }, (_, i) => `int v${i} = ${i};`).join("\n"));
        const lines = (await grepProject(root, { pattern: "int v", output_mode: "content" })).message.split("\n");
        expect(lines).toHaveLength(MAX_RESULT_LINES + 1);
        expect(lines[lines.length - 1]).toMatch(/^\[Output capped at 200 lines/);
        expect(await grepProject(root, { pattern: "int v", output_mode: "content" })).toMatchObject({ count: MAX_RESULT_LINES, unit: "lines", capped: true });
    });

    it("rejects an empty pattern", async () => {
        expect(await grepProject(root, { pattern: "  " })).toEqual({ success: false, message: "The pattern is empty. Give a pattern to search for." });
        expect((await grepProject(root, { pattern: "(?i)" })).success).toBe(false);
    });

    it("reads a leading (?i) as case-insensitive", async () => {
        expect((await grepProject(root, { pattern: "(?i)ORDERS?\\(" })).message.split("\n")).toEqual(["main.bal", "modules/db/db.bal", "tests/main_test.bal"]);
        expect((await grepProject(root, { pattern: "ORDERS?\\(" })).message).toMatch(/^No matches/);
    });

    it("counts matching lines in content mode, not context lines", async () => {
        expect(await grepProject(root, { pattern: "return \\[\\]", output_mode: "content", context: 1 })).toMatchObject({ count: 2, unit: "lines" });
        expect((await grepProject(root, { pattern: "return \\[\\]", output_mode: "content" })).capped).toBeUndefined();
    });

    it("takes a context above the cap instead of rejecting the call", async () => {
        const grep = createGrepTool(() => undefined, root) as any;
        expect(grep.inputSchema.safeParse({ pattern: "x", context: 6 }).success).toBe(true);
        write("long.bal", Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n"));
        expect((await grepProject(root, { pattern: "^line 10$", path: "long.bal", output_mode: "content", context: 6 })).message.split("\n")).toHaveLength(11);
    });

    it("marks an unexpected error as failed and pairs its events with the call", async () => {
        const files = require("../features/ai/agent/tools/project-files");
        const spy = jest.spyOn(files, "listProjectFiles").mockRejectedValue(new Error("EMFILE"));
        try {
            const events: any[] = [];
            const grep = createGrepTool((event: any) => events.push(event), root) as any;
            expect(await grep.execute({ pattern: "x" }, { toolCallId: "call-1" })).toEqual({ success: false, message: "Search failed: EMFILE" });
            expect(events.map((e) => [e.type, e.toolCallId, e.failed])).toEqual([["tool_call", "call-1", undefined], ["tool_result", "call-1", true]]);
        } finally {
            spy.mockRestore();
        }
        const glob = createGlobTool(() => undefined, root) as any;
        expect(glob.description).toContain("Only .bal, .toml");
        expect(createGrepTool(() => undefined, root).description).toContain("only .bal, .toml");
    });

    it("gives the model only the message and the chat row the counts", async () => {
        const events: any[] = [];
        const grep = createGrepTool((event: any) => events.push(event), root) as any;
        expect(await grep.execute({ pattern: "return", path: "modules" }, {})).toEqual({ success: true, message: "modules/db/db.bal" });
        expect(events.at(-1).toolOutput).toEqual({ success: true, pattern: "return", path: "modules", glob: undefined, count: 1, unit: "files" });
    });

    it("reports a file it cannot read and keeps searching the rest", async () => {
        const realReadFile = fs.promises.readFile;
        const spy = jest.spyOn(fs.promises, "readFile").mockImplementation(((file: fs.PathLike, ...rest: unknown[]) =>
            String(file).endsWith("main.bal")
                ? Promise.reject(new Error("EACCES"))
                : (realReadFile as (...args: unknown[]) => Promise<string>)(file, ...rest)) as typeof fs.promises.readFile);
        try {
            const result = await grepProject(root, { pattern: "return" });
            expect(result.message.split("\n")).toEqual(["modules/db/db.bal", "[Could not read 1 file(s): main.bal.]"]);
        } finally {
            spy.mockRestore();
        }
    });

    it("stops when aborted", async () => {
        const controller = new AbortController();
        controller.abort();
        expect(await grepProject(root, { pattern: "return" }, controller.signal)).toEqual({ success: false, message: "Search stopped.", aborted: true });
    });
});

describe("glob", () => {
    it("lists files with standard glob rules", async () => {
        expect((await globProject(root, { pattern: "**/*.bal" })).message.split("\n")).toEqual([
            "main.bal", "modules/db/db.bal", "tests/main_test.bal",
        ]);
        expect((await globProject(root, { pattern: "*.bal" })).message).toBe("main.bal");
        expect(await globProject(root, { pattern: "*.toml" })).toEqual({ success: true, message: "No files match *.toml.", count: 0 });
    });

    it("caps the output and says so", async () => {
        for (let i = 0; i < 250; i++) {
            write(`gen/f${String(i).padStart(3, "0")}.bal`, "");
        }
        const lines = (await globProject(root, { pattern: "gen/*.bal" })).message.split("\n");
        expect(lines).toHaveLength(MAX_RESULT_LINES + 1);
        expect(lines[lines.length - 1]).toBe("[Output capped at 200 of 250 files. Narrow the pattern or path.]");
        expect(await globProject(root, { pattern: "gen/*.bal" })).toMatchObject({ count: 250 });
    });

    it("rejects an empty pattern", async () => {
        expect((await globProject(root, { pattern: "" })).success).toBe(false);
    });

    it("returns an error for a path outside the project", async () => {
        const result = await globProject(root, { pattern: "*", path: "../" });
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Invalid path/);
    });
});
