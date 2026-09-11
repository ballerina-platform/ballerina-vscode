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
/**
 * @jest-environment node
 *
 * The docs primitives are the only file access a subagent has, so two properties matter: they cannot
 * escape the cache directory, and their output is capped so a careless pattern cannot flood the model.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    GREP_MAX_LINES,
    READ_MAX_LINES,
    grepDocs,
    listDocs,
    readDocs,
    resolveDocsPath,
} from "../features/ai/utils/libs/docs-fs-tools";

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-fs-test-"));
    fs.writeFileSync(path.join(dir, "ballerina__http.md"), [
        "# ballerina/http", "", "## Clients", "```ballerina",
        "public client class Client {", "    remote function get(string path) returns json|error;",
        "    remote function post(string path, json payload) returns json|error;", "}", "```",
    ].join("\n"));
    fs.writeFileSync(path.join(dir, "ballerinax__kafka.md"), [
        "# ballerinax/kafka", "", "## Clients", "```ballerina",
        ...Array.from({ length: 150 }, (_, i) => `    remote function produce${i}(string topic) returns error?;`),
        "```",
    ].join("\n"));
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("resolveDocsPath", () => {
    it("accepts a file name and an absolute path inside the cache", () => {
        expect(resolveDocsPath(dir, "ballerina__http.md")).toBe(fs.realpathSync(path.join(dir, "ballerina__http.md")));
        expect(resolveDocsPath(dir, path.join(dir, "ballerina__http.md"))).toBe(fs.realpathSync(path.join(dir, "ballerina__http.md")));
    });

    it("rejects traversal, absolute paths elsewhere, and the directory itself", () => {
        expect(() => resolveDocsPath(dir, "../secrets.txt")).toThrow(/outside the library docs cache/);
        expect(() => resolveDocsPath(dir, "/etc/passwd")).toThrow(/outside the library docs cache/);
        expect(() => resolveDocsPath(dir, ".")).toThrow(/outside the library docs cache/);
    });

    it("rejects a symlink that points outside the cache", () => {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), "docs-fs-outside-"));
        fs.writeFileSync(path.join(outside, "leak.md"), "secret");
        fs.symlinkSync(path.join(outside, "leak.md"), path.join(dir, "leak.md"));
        expect(() => resolveDocsPath(dir, "leak.md")).toThrow(/outside the library docs cache/);
        fs.rmSync(outside, { recursive: true, force: true });
    });
});

describe("grepDocs", () => {
    it("returns file:line:text matches across all files", () => {
        const out = grepDocs(dir, { pattern: "remote function post" });
        expect(out).toBe("ballerina__http.md:7:    remote function post(string path, json payload) returns json|error;");
    });

    it("restricts to one library and adds context lines", () => {
        const out = grepDocs(dir, { pattern: "function get", library: "ballerina/http", context: 1 });
        expect(out.split("\n")).toEqual([
            "ballerina__http.md:5-public client class Client {",
            "ballerina__http.md:6:    remote function get(string path) returns json|error;",
            "ballerina__http.md:7-    remote function post(string path, json payload) returns json|error;",
        ]);
    });

    it("caps matches and says so", () => {
        const out = grepDocs(dir, { pattern: "produce" });
        const lines = out.split("\n");
        expect(lines.filter(l => l.includes(":")).length).toBeLessThanOrEqual(GREP_MAX_LINES + 1);
        expect(lines[lines.length - 1]).toContain(`output capped at ${GREP_MAX_LINES} matching lines`);
        const small = grepDocs(dir, { pattern: "produce", head_limit: 3 });
        expect(small.split("\n")).toHaveLength(4);
    });

    it("explains an empty cache, a missing library, and an invalid pattern", () => {
        expect(grepDocs(dir, { pattern: "x", library: "ballerinax/nope" })).toBe("No cached docs for ballerinax/nope. Call library_docs first.");
        expect(grepDocs(dir, { pattern: "(" })).toMatch(/^Invalid regular expression/);
        expect(grepDocs(dir, { pattern: "zzz-not-there" })).toBe("No matches for /zzz-not-there/.");
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), "docs-fs-empty-"));
        expect(grepDocs(empty, { pattern: "x" })).toBe("The docs cache is empty. Call library_docs first.");
        fs.rmSync(empty, { recursive: true, force: true });
    });
});

describe("readDocs", () => {
    it("reads a numbered line range and tells how to continue", () => {
        const out = readDocs(dir, { path: "ballerinax__kafka.md", offset: 4, limit: 2 });
        expect(out.split("\n")).toEqual([
            "ballerinax__kafka.md lines 4-5 of 155",
            "4\t```ballerina",
            "5\t    remote function produce0(string topic) returns error?;",
            "… 150 more lines. Continue with offset=6.",
        ]);
    });

    it("caps the range and rejects paths outside the cache", () => {
        fs.writeFileSync(path.join(dir, "ballerinax__big.md"), Array.from({ length: READ_MAX_LINES + 50 }, (_, i) => `line ${i + 1}`).join("\n"));
        const out = readDocs(dir, { path: "ballerinax__big.md", limit: 10_000 });
        expect(out).toContain(`lines 1-${READ_MAX_LINES} of ${READ_MAX_LINES + 50}`);
        expect(out).toContain(`Continue with offset=${READ_MAX_LINES + 1}.`);
        expect(readDocs(dir, { path: "ballerinax__kafka.md", limit: 10_000 })).toContain("lines 1-155 of 155");
        expect(readDocs(dir, { path: "../x.md" })).toMatch(/outside the library docs cache/);
        expect(readDocs(dir, { path: "missing.md" })).toBe("File not found: missing.md");
        expect(readDocs(dir, { path: "ballerina__http.md", offset: 999 })).toMatch(/past the end/);
    });
});

describe("listDocs", () => {
    it("lists cached files with sizes", () => {
        const out = listDocs(dir);
        expect(out).toMatch(/^ballerina__http\.md {2}\(\d+ KB\) {2}/m);
        expect(out.split("\n")).toHaveLength(2);
    });
});
