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

// Reference L3 (host-side, node env) test: the fixture recorder that captures
// LS/RPC traffic. See docs/TEST_BACKLOG.md L3-01. Runs with no VSCode spawn.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { methodToSlug, redactSecrets, rewritePaths, isRecording, recordLs } from "./fixtureRecorder";

describe("methodToSlug", () => {
    it("converts slashes to dots", () => {
        expect(methodToSlug("flowDesignService/getFlowModel")).toBe("flowDesignService.getFlowModel");
    });
    it("replaces unsafe characters", () => {
        expect(methodToSlug("a b:c*d")).toBe("a_b_c_d");
    });
    it("falls back to 'unknown' for empty input", () => {
        expect(methodToSlug("")).toBe("unknown");
    });
});

describe("redactSecrets", () => {
    it("redacts secret-looking string keys, keeps others", () => {
        const out = redactSecrets({ token: "abc", apiKey: "k", name: "svc", nested: { password: "p", port: 8080 } });
        expect(out).toEqual({
            token: "***REDACTED***",
            apiKey: "***REDACTED***",
            name: "svc",
            nested: { password: "***REDACTED***", port: 8080 },
        });
    });
    it("handles arrays", () => {
        expect(redactSecrets([{ secret: "x", ok: 1 }])).toEqual([{ secret: "***REDACTED***", ok: 1 }]);
    });
    it("does not throw on cycles", () => {
        const a: any = { name: "x" };
        a.self = a;
        expect(() => redactSecrets(a)).not.toThrow();
    });
    it("INVARIANT: redacts a secret-looking key wholesale regardless of value type", () => {
        // A secret key holding an array or object must be replaced in full, not recursed
        // into — otherwise non-string secret material leaks into recorded fixtures.
        const out = redactSecrets({
            tokens: ["a", "b"],
            credentials: { user: "u", pass: "p" },
            name: "svc",
        });
        expect(out).toEqual({
            tokens: "***REDACTED***",
            credentials: "***REDACTED***",
            name: "svc",
        });
    });
});

describe("rewritePaths", () => {
    it("replaces substrings deeply and leaves non-strings", () => {
        const out = rewritePaths(
            { file: "/home/u/proj/main.bal", n: 5, list: ["/home/u/proj/x"] },
            [["/home/u/proj", "${WORKSPACE}"]]
        );
        expect(out).toEqual({ file: "${WORKSPACE}/main.bal", n: 5, list: ["${WORKSPACE}/x"] });
    });
});

describe("isRecording", () => {
    const prev = process.env.BAL_RECORD_FIXTURES;
    afterEach(() => {
        if (prev === undefined) { delete process.env.BAL_RECORD_FIXTURES; }
        else { process.env.BAL_RECORD_FIXTURES = prev; }
    });
    it("is off by default", () => {
        delete process.env.BAL_RECORD_FIXTURES;
        expect(isRecording()).toBe(false);
    });
    it("is on when set to 1", () => {
        process.env.BAL_RECORD_FIXTURES = "1";
        expect(isRecording()).toBe(true);
    });
});

describe("recordLs (end to end)", () => {
    let dir: string;
    const prevFlag = process.env.BAL_RECORD_FIXTURES;
    const prevDir = process.env.BAL_FIXTURES_DIR;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixrec-"));
        process.env.BAL_RECORD_FIXTURES = "1";
        process.env.BAL_FIXTURES_DIR = dir;
    });
    afterAll(() => {
        if (prevFlag === undefined) { delete process.env.BAL_RECORD_FIXTURES; }
        else { process.env.BAL_RECORD_FIXTURES = prevFlag; }
        if (prevDir === undefined) { delete process.env.BAL_FIXTURES_DIR; }
        else { process.env.BAL_FIXTURES_DIR = prevDir; }
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("writes a redacted fixture file for an LS call", () => {
        recordLs("flowDesignService/getFlowModel", { token: "abc", filePath: "/x/main.bal" }, { ok: true });
        const outDir = path.join(dir, "ls", "flowDesignService.getFlowModel");
        const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json"));
        expect(files.length).toBeGreaterThanOrEqual(1);
        const payload = JSON.parse(fs.readFileSync(path.join(outDir, files[0]), "utf8"));
        expect(payload.method).toBe("flowDesignService/getFlowModel");
        expect(payload.request.token).toBe("***REDACTED***");
        expect(payload.request.filePath).toBe("/x/main.bal");
        expect(payload.response).toEqual({ ok: true });
    });
});
