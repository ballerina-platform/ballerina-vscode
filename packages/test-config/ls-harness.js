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

// Headless Ballerina Language Server harness for L3 integration + L5 perf tests.
// Spawns a real LS over stdio (no VSCode) and speaks LSP JSON-RPC. See docs/TEST_GUIDE.md.
//
// Lives in @wso2/test-config (the shared test package) rather than inside any one
// consumer so bi-diagram / record-creator / ballerina-extension all depend on a
// stable public import (`@wso2/test-config/ls-harness`) instead of deep relative
// paths into another package's internals. Shipped as plain JS + a .d.ts (matching
// fixtures.js) so ts-jest in every consumer loads it without transforming node_modules.
//
// Uses the distribution's `bal start-language-server`. Resolution order:
//   1. $BAL_LS_CMD               (explicit path to the bal launcher)
//   2. $BALLERINA_HOME/bin/bal
//   3. ~/.ballerina/ballerina-home/bin/bal
// resolveBalCommand() returns null when none exist, so suites can skip cleanly.

"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const isWindows = process.platform === "win32";

function resolveBalCommand() {
    const candidates = [];
    if (process.env.BAL_LS_CMD) {
        candidates.push(process.env.BAL_LS_CMD);
    }
    const balName = isWindows ? "bal.bat" : "bal";
    if (process.env.BALLERINA_HOME) {
        candidates.push(path.join(process.env.BALLERINA_HOME, "bin", balName));
    }
    candidates.push(path.join(os.homedir(), ".ballerina", "ballerina-home", "bin", balName));
    return candidates.find((c) => c && fs.existsSync(c)) ?? null;
}

function pathToFileUri(p) {
    const resolved = path.resolve(p).replace(/\\/g, "/");
    return "file://" + (resolved.startsWith("/") ? "" : "/") + resolved;
}

class LsHarness {
    constructor(balCommand, opts = {}) {
        this.balCommand = balCommand;
        this.buf = Buffer.alloc(0);
        this.nextId = 1;
        this.pending = new Map();
        this.defaultTimeoutMs = opts.timeoutMs ?? 60_000;
    }

    start() {
        this.proc = spawn(this.balCommand, ["start-language-server"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: process.env,
        });
        this.proc.stdout.on("data", (d) => this.onData(d));
        // Drain stderr. It's piped so it can be inspected on failure, but if nothing reads
        // it a chatty LS can fill the ~64KB OS pipe buffer, block on write, and hang the
        // test until timeout (an intermittent CI hang rather than a clear failure).
        this.proc.stderr.on("data", () => {});
        // Surface a failed spawn (bad path, perms) as a normal rejection instead of an
        // unhandled 'error' event that would crash the Jest worker.
        this.proc.on("error", (err) => {
            for (const [, p] of this.pending) {
                p.reject(err);
            }
            this.pending.clear();
        });
        this.proc.on("exit", (code) => {
            for (const [, p] of this.pending) {
                p.reject(new Error(`LS exited (code ${code}) before responding`));
            }
            this.pending.clear();
        });
    }

    onData(chunk) {
        this.buf = Buffer.concat([this.buf, chunk]);
        // Parse as many complete LSP frames as are buffered.
        for (;;) {
            const headerEnd = this.buf.indexOf("\r\n\r\n");
            if (headerEnd < 0) {
                return;
            }
            const header = this.buf.slice(0, headerEnd).toString();
            const m = /Content-Length: (\d+)/i.exec(header);
            if (!m) {
                this.buf = this.buf.slice(headerEnd + 4);
                continue;
            }
            const len = parseInt(m[1], 10);
            const start = headerEnd + 4;
            if (this.buf.length < start + len) {
                return;
            }
            const body = this.buf.slice(start, start + len).toString();
            this.buf = this.buf.slice(start + len);
            this.dispatch(body);
        }
    }

    dispatch(body) {
        let msg;
        try {
            msg = JSON.parse(body);
        } catch {
            return;
        }
        if (msg.method !== undefined && msg.id !== undefined) {
            // Server->client request (e.g. client/registerCapability). Reply so it
            // never blocks the server, but otherwise ignore.
            this.write({ jsonrpc: "2.0", id: msg.id, result: null });
            return;
        }
        if (typeof msg.id === "number" && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) {
                p.reject(new Error(`LS error for id ${msg.id}: ${JSON.stringify(msg.error)}`));
            } else {
                p.resolve(msg.result);
            }
        }
        // Notifications are ignored by this harness.
    }

    write(msg) {
        if (!this.proc) {
            throw new Error("LS not started");
        }
        const s = JSON.stringify(msg);
        this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
    }

    request(method, params, timeoutMs = this.defaultTimeoutMs) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Timeout (${timeoutMs}ms) waiting for '${method}'`));
            }, timeoutMs);
            this.pending.set(id, {
                resolve: (v) => { clearTimeout(timer); resolve(v); },
                reject: (e) => { clearTimeout(timer); reject(e); },
            });
            this.write({ jsonrpc: "2.0", id, method, params });
        });
    }

    notify(method, params) {
        this.write({ jsonrpc: "2.0", method, params });
    }

    async initialize(rootPath) {
        const result = await this.request("initialize", {
            processId: process.pid,
            rootUri: pathToFileUri(rootPath),
            capabilities: {},
            workspaceFolders: [{ uri: pathToFileUri(rootPath), name: "root" }],
        });
        this.notify("initialized", {});
        return result;
    }

    didOpen(filePath, text, languageId = "ballerina") {
        this.notify("textDocument/didOpen", {
            textDocument: { uri: pathToFileUri(filePath), languageId, version: 1, text },
        });
    }

    async shutdown() {
        try {
            await this.request("shutdown", undefined, 10_000);
            this.notify("exit");
        } catch {
            // ignore — we kill below regardless
        }
        this.proc?.kill("SIGKILL");
    }
}

module.exports = { resolveBalCommand, pathToFileUri, LsHarness };
