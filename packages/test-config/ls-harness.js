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
// resolveBalCommand() finds the distribution's `bal` launcher. Resolution order:
//   1. $BAL_LS_CMD               (explicit path to the bal launcher)
//   2. $BALLERINA_HOME/bin/bal
//   3. ~/.ballerina/ballerina-home/bin/bal
// It returns null when none exist. Passing it to LsHarness runs `bal start-language-server`,
// the distribution's LS; that is deprecated for tests, use resolveIntegrationLaunch().
//
// resolveLocalLsCommand() runs the locally built LS jar with `java` directly, on the
// same classpath the extension uses (getServerOptionsUsingJava in
// ballerina-extension/src/utils/server/server.ts). Jar resolution order:
//   1. $BAL_LS_JAR
//   2. packages/ballerina-language-server/build/ballerina-language-server-<version>.jar, with
//      <version> from ballerina-extension/package.json (the jar copyLS ships)
// The distribution comes from `bal home` and the JDK from its dependencies/ directory, as in
// the extension. Returns null when any of these is missing or the JDK is older than Java 25.

"use strict";

const { execFileSync, spawn } = require("child_process");
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

// LS modules that the LS jar already bundles. Keep in sync with excludeJarPatterns in
// ballerina-extension/src/utils/server/server.ts. The globs are turned into regexes the same way
// as findJarsExcludingPatterns does there: unanchored, so a pattern matches anywhere in the name.
const DISTRIBUTION_JAR_EXCLUDES = [
    "architecture-model*", "flow-model*", "graphql-model*", "model-generator*", "sequence-model*",
    "service-model*", "test-manager-service*", "language-server*", "bal-shell-service*",
    "org.eclipse.lsp4j*", "diagram-util*", "openapi-ls-extension*", "sqlite-jdbc*",
].map((pattern) => new RegExp(pattern.replace(/\*/g, ".*")));

// $BAL_LS_JAR, else the jar that the extension's copyLS script puts in the vsix:
// ballerina-language-server-<version>.jar, with the version from ballerina-extension/package.json.
// Throws when $BAL_LS_JAR is set but missing, so a wrong path fails the run instead of skipping it.
function resolveLocalLsJar() {
    const explicitJar = process.env.BAL_LS_JAR;
    if (explicitJar) {
        if (!fs.existsSync(explicitJar)) {
            throw new Error(`BAL_LS_JAR=${explicitJar} does not exist`);
        }
        return explicitJar;
    }
    const { version } = require("../ballerina-extension/package.json");
    const jar = path.join(__dirname, "..", "ballerina-language-server", "build",
        `ballerina-language-server-${version}.jar`);
    return fs.existsSync(jar) ? jar : null;
}

// The LS jar is compiled for this Java release. Keep in sync with REQUIRED_JDK_MAJOR_VERSION in
// ballerina-extension/src/utils/server/server.ts.
const REQUIRED_JDK_MAJOR_VERSION = 25;

function highestJdkDir(depsDir) {
    if (!fs.existsSync(depsDir)) {
        return null;
    }
    const jdks = fs.readdirSync(depsDir).filter((d) => /^jdk-.+-jre$/.test(d))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return jdks.length ? path.join(depsDir, jdks[0]) : null;
}

// Same as getJdkMajorVersion in server.ts: JAVA_VERSION from the JDK's release file, else the
// directory name, e.g. 'jdk-25.0.4+1-jre'.
function jdkMajorVersion(jdkDir) {
    const releaseFile = path.join(jdkDir, "release");
    const fromRelease = fs.existsSync(releaseFile)
        && fs.readFileSync(releaseFile, "utf8").match(/^JAVA_VERSION="?([0-9]+)/m);
    const match = fromRelease || path.basename(jdkDir).match(/^jdk-([0-9]+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// Same lookup as resolveLanguageServerJdkDir in server.ts: the highest jdk-*-jre in the
// dependencies/ directory beside distributions/, else in its parent. Returns null when that JDK is
// older than the LS needs, so the suite skips instead of failing with UnsupportedClassVersionError.
function resolveJava(ballerinaHome) {
    const baseHome = ballerinaHome.includes("distributions")
        ? ballerinaHome.substring(0, ballerinaHome.indexOf("distributions"))
        : ballerinaHome;
    const jdkDir = highestJdkDir(path.join(baseHome, "dependencies"))
        ?? highestJdkDir(path.join(path.dirname(baseHome), "dependencies"));
    if (!jdkDir) {
        return null;
    }
    const major = jdkMajorVersion(jdkDir);
    const java = path.join(jdkDir, "bin", isWindows ? "java.exe" : "java");
    return major >= REQUIRED_JDK_MAJOR_VERSION && fs.existsSync(java) ? java : null;
}

function resolveLocalLsCommand() {
    const jar = resolveLocalLsJar();
    const bal = resolveBalCommand();
    if (!jar || !bal) {
        return null;
    }
    let ballerinaHome;
    try {
        // bal.bat needs a shell on Windows, and cmd splits an unquoted path at spaces.
        const out = execFileSync(isWindows ? `"${bal}"` : bal, ["home"],
            { encoding: "utf8", shell: isWindows, timeout: 30_000 });
        ballerinaHome = out.trim().split(/\r?\n/).pop().trim();
        // server.ts resolves junctions and 8.3 names on Windows before building the classpath.
        if (isWindows) {
            ballerinaHome = fs.realpathSync.native(ballerinaHome);
        }
    } catch {
        return null;
    }
    const java = resolveJava(ballerinaHome);
    if (!java) {
        return null;
    }
    const libDirs = [
        path.join(ballerinaHome, "bre", "lib"),
        path.join(ballerinaHome, "lib", "tools", "lang-server", "lib"),
        path.join(ballerinaHome, "lib", "tools", "debug-adapter", "lib"),
    ];
    const distributionJars = libDirs.filter((dir) => fs.existsSync(dir)).flatMap((dir) =>
        fs.readdirSync(dir)
            .filter((f) => f.endsWith(".jar") && !DISTRIBUTION_JAR_EXCLUDES.some((re) => re.test(f)))
            .map((f) => path.join(dir, f)));
    return {
        command: java,
        args: [
            "-cp", [...distributionJars, jar].join(path.delimiter),
            `-Dballerina.home=${ballerinaHome}`,
            "org.ballerinalang.langserver.launchers.stdio.Main",
        ],
    };
}

function pathToFileUri(p) {
    const resolved = path.resolve(p).replace(/\\/g, "/");
    return "file://" + (resolved.startsWith("/") ? "" : "/") + resolved;
}

class LsHarness {
    // `launch` is a bal launcher path (runs `bal start-language-server`) or a
    // { command, args } spec such as resolveLocalLsCommand() returns.
    constructor(launch, opts = {}) {
        this.launch = typeof launch === "string"
            ? { command: launch, args: ["start-language-server"] }
            : launch;
        this.buf = Buffer.alloc(0);
        this.nextId = 1;
        this.pending = new Map();
        this.notificationWaiters = [];
        this.defaultTimeoutMs = opts.timeoutMs ?? 60_000;
    }

    start() {
        this.proc = spawn(this.launch.command, this.launch.args, {
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
        this.proc.on("error", (err) => this.rejectPending(err));
        // A write after the LS has died emits EPIPE here. Reject the pending requests instead of
        // leaving an unhandled 'error' event that would crash the Jest worker.
        this.proc.stdin.on("error", (err) => this.rejectPending(err));
        this.proc.on("exit", (code) => this.rejectPending(new Error(`LS exited (code ${code}) before responding`)));
        // Reject notification waiters on 'close' rather than 'exit': 'close' fires after stdout
        // has ended, so a notification the LS wrote just before exiting is still dispatched.
        this.proc.on("close", (code) => {
            this.closeCode = code;
            const waiters = this.notificationWaiters;
            this.notificationWaiters = [];
            for (const w of waiters) {
                w.reject(new Error(`LS exited (code ${code}) before sending '${w.method}'`));
            }
        });
    }

    rejectPending(err) {
        for (const [, p] of this.pending) {
            p.reject(err);
        }
        this.pending.clear();
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
        if (msg.method !== undefined) {
            this.notificationWaiters = this.notificationWaiters.filter((w) => {
                if (w.method !== msg.method) {
                    return true;
                }
                w.resolve(msg.params);
                return false;
            });
        }
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

    // Resolves with the params of the next server notification named `method`. Rejects on
    // timeout or when the LS process exits first.
    waitForNotification(method, timeoutMs = this.defaultTimeoutMs) {
        return new Promise((resolve, reject) => {
            // 'close' has already fired, so no waiter registered now would ever be rejected by it.
            if (this.closeCode !== undefined) {
                reject(new Error(`LS exited (code ${this.closeCode}) before sending '${method}'`));
                return;
            }
            const waiter = {
                method,
                resolve: (params) => { clearTimeout(timer); resolve(params); },
                reject: (err) => { clearTimeout(timer); reject(err); },
            };
            const timer = setTimeout(() => {
                this.notificationWaiters = this.notificationWaiters.filter((w) => w !== waiter);
                reject(new Error(`Timeout (${timeoutMs}ms) waiting for notification '${method}'`));
            }, timeoutMs);
            this.notificationWaiters.push(waiter);
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

// The newest modification time of a file under a src/main directory of the LS, skipping build
// output and src/test. Checking out or editing a source file updates its time, so a jar older
// than this was built from other sources.
function newestLsSourceTime(dir) {
    let newest = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const skip = entry.name === "build" || entry.name === ".gradle"
                || (entry.name === "test" && path.basename(dir) === "src");
            if (!skip) {
                newest = Math.max(newest, newestLsSourceTime(full));
            }
        } else if (full.includes(`${path.sep}src${path.sep}main${path.sep}`)) {
            newest = Math.max(newest, fs.statSync(full).mtimeMs);
        }
    }
    return newest;
}

// The LS an integration, capture or perf test runs against: the jar built from this
// repository (resolveLocalLsCommand()). The LS bundled with the installed distribution is
// deprecated for tests: it lags this repository, so a test against it cannot catch a change
// here. Throws when the jar, distribution or JDK is missing, and when the jar in
// packages/ballerina-language-server/build is older than the LS sources, so a test never
// passes without running this checkout's LS. $BAL_LS_JAR skips the age check.
function resolveIntegrationLaunch() {
    const buildHint = "run `./gradlew build pack -x test` in packages/ballerina-language-server";
    const jar = resolveLocalLsJar();
    if (!jar) {
        throw new Error(`[integration] No LS jar was found: ${buildHint}.`);
    }
    if (!process.env.BAL_LS_JAR) {
        const lsDir = path.join(__dirname, "..", "ballerina-language-server");
        if (newestLsSourceTime(lsDir) > fs.statSync(jar).mtimeMs) {
            throw new Error(`[integration] ${jar} is older than the LS sources, so it was not built `
                + `from this checkout: ${buildHint}. To run it anyway, set BAL_LS_JAR to its path.`);
        }
    }
    const launch = resolveLocalLsCommand();
    if (!launch) {
        throw new Error("[integration] The LS jar was found, but the Ballerina distribution or its "
            + "Java 25 JDK is missing.");
    }
    return launch;
}

module.exports = { resolveBalCommand, resolveLocalLsCommand, resolveIntegrationLaunch, pathToFileUri, LsHarness };
