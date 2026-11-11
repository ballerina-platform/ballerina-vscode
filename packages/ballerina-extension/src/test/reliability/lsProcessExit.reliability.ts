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

// Reliability (non-functional, not a PR gate): no language server process may remain after
// its client goes away, whether or not the client sends LSP `exit`
// (wso2/product-integrator#2854). Runs the locally built LS jar (resolveLocalLsCommand), so it
// checks this repo's LS rather than the one bundled with the distribution. Skips when the jar,
// a Ballerina distribution or a Java 25+ JDK in the distribution is missing.
//
// These tests check the process, not the cause: the launcher's System.exit makes both pass
// whatever threads are left. StartServerExitTest in the launcher module checks the exit
// statuses on every PR. This suite also covers what that unit test cannot: that main() passes
// System::exit, and that the real JVM exits, which a hanging shutdown hook would prevent.

import * as fs from "fs";
import * as path from "path";
import { ChildProcess } from "child_process";
import { LsHarness, resolveLocalLsCommand, pathToFileUri } from "@wso2/test-config/ls-harness";

const launch = resolveLocalLsCommand();
const projectRoot = path.join(__dirname, "..", "ls-integration", "fixtures", "hello");
const mainBal = path.join(projectRoot, "main.bal");

// The launcher calls System.exit once stdin closes, so the JVM exits within seconds. Without
// that call it would wait for every non-daemon thread to end, including lsp4j's idle listener
// thread, which ends only after 60 s.
const EXIT_TIMEOUT_MS = 15_000;

if (!launch) {
    // The nightly sets BAL_RELIABILITY_REQUIRED, so a missing jar, distribution or JDK fails the
    // job there instead of passing with no tests run.
    if (process.env.BAL_RELIABILITY_REQUIRED === "true") {
        throw new Error("[reliability] BAL_RELIABILITY_REQUIRED is set, but no local LS jar, "
            + "Ballerina distribution or Java 25+ JDK was found.");
    }
    // eslint-disable-next-line no-console
    console.warn("[reliability] No local LS jar, Ballerina distribution or Java 25+ JDK found; skipping.");
}

const describeReliability = launch ? describe : describe.skip;

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    if (proc.exitCode !== null || proc.signalCode !== null) {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        proc.once("exit", () => {
            clearTimeout(timer);
            resolve(true);
        });
    });
}

// Edits main.bal, which creates ArtifactGenerationDebouncer (confirmed by its publishArtifacts
// notification), and sends an expression editor request, which creates the expression editor
// Debouncer. These are the two schedulers whose threads kept the JVM alive in #2854, so the
// process exits with them running.
async function useDebouncers(ls: LsHarness): Promise<void> {
    await ls.initialize(projectRoot);
    const text = fs.readFileSync(mainBal, "utf8");
    const artifactsPublished = ls.waitForNotification("designModelService/publishArtifacts");
    ls.didOpen(mainBal, text);
    ls.notify("textDocument/didChange", {
        textDocument: { uri: pathToFileUri(mainBal), version: 2 },
        contentChanges: [{ text: text.replace("Hello, World!", "Hello!") }],
    });
    await artifactsPublished;
    // Debouncer.debounce completes this request normally only from the task it ran on its
    // scheduler thread; a superseded or failed task rejects it. So the request resolving, with any
    // result, shows that the scheduler thread started. The result itself is not checked: here it is
    // null, because signature help finds no call at the cursor in this headless setup.
    await ls.request("expressionEditor/signatureHelp", {
        filePath: mainBal,
        context: {
            expression: "io:println(1)",
            offset: 11,
            startLine: { line: 3, offset: 4 },
            property: { types: [{ fieldType: "EXPRESSION" }] },
        },
        signatureHelpContext: { triggerKind: "Invoked", isRetrigger: false },
    });
}

// The process exited by itself: it has an exit status and was not killed by a signal.
function expectExitedOnItsOwn(proc: ChildProcess): void {
    expect(proc.exitCode).not.toBeNull();
    expect(proc.signalCode).toBeNull();
}

describeReliability("Language server process exit (reliability)", () => {
    let ls: LsHarness | undefined;

    afterEach(async () => {
        // Never leave a JVM behind, even when an assertion failed. Wait for it to exit so the
        // next test does not start while this JVM is still running.
        if (ls?.proc && ls.proc.exitCode === null && ls.proc.signalCode === null) {
            ls.proc.kill("SIGKILL");
            await waitForExit(ls.proc, EXIT_TIMEOUT_MS);
        }
        ls = undefined;
    });

    // Assigns `ls` before the first await, so afterEach can kill the process if setup fails.
    function startLs(): LsHarness {
        ls = new LsHarness(launch!);
        ls.start();
        return ls;
    }

    // BallerinaLanguageServer.exit() already called System.exit before #2854 was fixed; this
    // case keeps that path from regressing.
    it("exits after LSP shutdown and exit", async () => {
        const server = startLs();
        await useDebouncers(server);
        await server.request("shutdown");
        server.notify("exit");
        expect(await waitForExit(server.proc!, EXIT_TIMEOUT_MS)).toBe(true);
        // LSP: exit after shutdown ends the server with status 0.
        expect({ code: server.proc!.exitCode, signal: server.proc!.signalCode }).toEqual({ code: 0, signal: null });
    });

    it("exits when the client closes stdin without sending exit", async () => {
        const server = startLs();
        await useDebouncers(server);
        server.proc!.stdin!.end();
        expect(await waitForExit(server.proc!, EXIT_TIMEOUT_MS)).toBe(true);
        // LSP defines no status for stdin closing. The launcher's choice (1) is checked by
        // StartServerExitTest; this suite checks only that the process exits.
        expectExitedOnItsOwn(server.proc!);
    });
});
