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

// Host-side (node env) L1 test of the fixture recorder that captures
// LS/RPC traffic. See docs/TEST_GUIDE.md ("Foundation"). Runs with no VSCode spawn.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { methodToSlug, redactSecrets, rewritePaths, isRecording, recordLs, recordRpc } from "../utils/fixtureRecorder";

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

    it("masks the configurables' values a connection's preview reads from Config.toml", () => {
        const response = {
            configurables: [{ name: "sfToken", value: "\"s3cret\"", existing: true }, { name: "sfUrl" }],
        };
        recordLs("flowDesignService/getConnectionConfigurables", { filePath: "/x/main.bal" }, response);
        const outDir = path.join(dir, "ls", "flowDesignService.getConnectionConfigurables");
        const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json"));
        const payload = JSON.parse(fs.readFileSync(path.join(outDir, files[0]), "utf8"));
        expect(payload.response.configurables).toEqual([
            { name: "sfToken", value: "***REDACTED***", existing: true }, { name: "sfUrl" },
        ]);
        // The response the webview gets keeps the value.
        expect(response.configurables[0].value).toBe("\"s3cret\"");
    });

    it("masks a connection save's argument values and the values it writes to Config.toml", () => {
        const request = {
            filePath: "/x/connections.bal",
            flowNode: {
                codedata: { node: "NEW_CONNECTION" },
                properties: {
                    variable: { value: "sfSales" },
                    config: { value: "{token: \"s3cret\"}", codedata: { kind: "REQUIRED" } },
                },
            },
        };
        const response = {
            textEdits: {
                "/x/Config.toml": [{ range: {}, newText: "sfToken = \"s3cret\"\n" }],
                "/x/connections.bal": [{ range: {}, newText: "final sf:Client sfSales = check new ({token: sfToken});" }],
            },
        };
        recordLs("flowDesignService/getSourceCode", request, response);
        const outDir = path.join(dir, "ls", "flowDesignService.getSourceCode");
        const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json"));
        const payload = JSON.parse(fs.readFileSync(path.join(outDir, files[0]), "utf8"));
        expect(payload.request.flowNode.properties.variable.value).toBe("sfSales");
        expect(payload.request.flowNode.properties.config.value).toBe("***REDACTED***");
        expect(payload.response.textEdits["/x/Config.toml"][0].newText).toBe("***REDACTED***");
        expect(payload.response.textEdits["/x/connections.bal"][0].newText).toContain("sfToken");
        // What the language server and the webview get is unchanged.
        expect(request.flowNode.properties.config.value).toBe("{token: \"s3cret\"}");
        expect(response.textEdits["/x/Config.toml"][0].newText).toContain("s3cret");
    });

    it.each([
        ["the language server's", "flowDesignService", "ls", recordLs],
        ["the webview's RPC", "bi-diagram", "rpc", recordRpc],
    ] as const)("masks a connection's values in %s save, preview request and preview response",
        (_via, prefix, kind, recordCall) => {
        const flowNode = {
            codedata: { node: "NEW_CONNECTION" },
            properties: { variable: { value: "sfSales" }, config: { value: "{token: \"s3cret\"}" } },
        };
        recordCall(`${prefix}/getSourceCode`, { flowNode }, { artifacts: [] });
        recordCall(`${prefix}/getConnectionConfigurables`, { flowNode },
            { configurables: [{ name: "sfToken", value: "\"s3cret\"" }] });
        for (const method of ["getSourceCode", "getConnectionConfigurables"]) {
            const outDir = path.join(dir, kind, `${prefix}.${method}`);
            const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).sort();
            const payload = JSON.parse(fs.readFileSync(path.join(outDir, files[files.length - 1]), "utf8"));
            expect(JSON.stringify(payload)).not.toContain("s3cret");
            expect(payload.request.flowNode.properties.variable.value).toBe("sfSales");
        }
        expect(flowNode.properties.config.value).toBe("{token: \"s3cret\"}");
    });
});
