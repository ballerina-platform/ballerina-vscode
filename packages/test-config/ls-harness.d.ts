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

// Type surface for ls-harness.js — the shared headless Ballerina LS harness.

/**
 * Resolve the `bal` launcher used for `bal start-language-server`.
 * Returns null when no distribution is found, so suites can skip cleanly.
 */
export declare function resolveBalCommand(): string | null;

/** A process to spawn as the language server. */
export interface LsLaunchSpec {
    command: string;
    args: string[];
}

/**
 * Resolve a `java` launch of a locally built LS jar ($BAL_LS_JAR, else
 * ballerina-language-server/build/ballerina-language-server-<version>.jar, with the version from
 * ballerina-extension/package.json) on the extension's classpath for the `bal home`
 * distribution. Returns null when the jar or distribution is missing, or the distribution's
 * JDK is missing or older than Java 25. Throws when $BAL_LS_JAR is set but does not exist.
 */
export declare function resolveLocalLsCommand(): LsLaunchSpec | null;

/** Convert a filesystem path to a `file://` URI the LS understands. */
export declare function pathToFileUri(p: string): string;

/** Speaks LSP JSON-RPC to a real, headless Ballerina Language Server over stdio. */
export declare class LsHarness {
    /** The spawned language server process; set by `start()`. */
    proc?: import("child_process").ChildProcess;
    /** `launch` is a bal launcher path (runs `bal start-language-server`) or a launch spec. */
    constructor(launch: string | LsLaunchSpec, opts?: { timeoutMs?: number });
    /** Spawn the language server and begin reading frames. */
    start(): void;
    /** Send a request and resolve with its result (rejects on error/timeout/exit). */
    request<T = any>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
    /** Resolve with the params of the next server notification named `method` (rejects on timeout or LS exit). */
    waitForNotification<T = any>(method: string, timeoutMs?: number): Promise<T>;
    /** Send a notification (no response expected). */
    notify(method: string, params?: unknown): void;
    /** Run the LSP `initialize`/`initialized` handshake rooted at `rootPath`. */
    initialize(rootPath: string): Promise<any>;
    /** Send `textDocument/didOpen` for a file. */
    didOpen(filePath: string, text: string, languageId?: string): void;
    /** Best-effort `shutdown`/`exit`, then SIGKILL the process. */
    shutdown(): Promise<void>;
}
