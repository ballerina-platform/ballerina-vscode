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

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { extension } from "../../BalExtensionContext";

const AMCTL_VERSION = "v1.0.0";
// A failed refresh against a stopped server is a network error, not a sign-out.
const UNREACHABLE = /connection refused|no such host|dial tcp|i\/o timeout/i;
const AUTH_ERRORS = new Set(["AUTH_TOKEN_EXPIRED", "AUTH_REFRESH_FAILED", "NO_INSTANCE", "NO_ORG", "UNAUTHORIZED"]);

export class AgentManagerApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
}

interface Envelope<T> {
    instance?: string;
    data?: T;
    error?: { status?: number; code?: string; message?: string };
}

// amctl refreshes its rotating refresh token without a lock, so parallel processes would sign each other out.
let queue: Promise<unknown> = Promise.resolve();

function amctlPath(): string {
    const binary = process.platform === "win32" ? "amctl.exe" : "amctl";
    const bundled = path.join(extension.context.extensionPath, "resources", "amctl", AMCTL_VERSION, process.platform, process.arch, binary);
    return fs.existsSync(bundled) ? bundled : binary;
}

function spawnAmctl(args: string[], input?: string, cancel?: vscode.CancellationToken, cwd = os.homedir()): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = cp.spawn(amctlPath(), args, { cwd, env: { ...process.env, NO_COLOR: "1" } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        const cancelListener = cancel?.onCancellationRequested(() => child.kill());
        child.on("error", (error: NodeJS.ErrnoException) => reject(error.code === "ENOENT"
            ? new Error("The Agent Manager CLI (amctl) isn't installed. Install it from the Agent Manager release page and try again.")
            : error));
        child.on("close", (code) => {
            cancelListener?.dispose();
            resolve({ code: code ?? 1, stdout, stderr });
        });
        child.stdin.end(input ?? "");
    });
}

function runAmctl(args: string[], input?: string, cwd?: string): Promise<RunResult> {
    const run = queue.then(() => spawnAmctl(args, input, undefined, cwd));
    queue = run.catch(() => undefined);
    return run;
}

function parseEnvelope<T>(result: RunResult): Envelope<T> {
    try {
        return JSON.parse(result.stdout);
    } catch {
        throw new Error(result.stderr.trim() || `amctl exited with code ${result.code}.`);
    }
}

function envelopeError(error: NonNullable<Envelope<unknown>["error"]>): AgentManagerApiError {
    const message = error.message ?? error.code ?? "amctl failed.";
    if (UNREACHABLE.test(message)) {
        return new AgentManagerApiError(503, message);
    }
    return new AgentManagerApiError(AUTH_ERRORS.has(error.code ?? "") ? 401 : error.status || 500, message);
}

/** `cwd` decides which directory link amctl reads. */
export async function amctlEnvelope<T>(args: string[], options: { cancel?: vscode.CancellationToken; cwd?: string } = {}): Promise<Envelope<T>> {
    const result = options.cancel
        ? await spawnAmctl([...args, "--json"], undefined, options.cancel)
        : await runAmctl([...args, "--json"], undefined, options.cwd);
    const envelope = parseEnvelope<T>(result);
    if (envelope.error) {
        throw envelopeError(envelope.error);
    }
    return envelope;
}

export async function amctlJson<T>(args: string[], cwd?: string): Promise<T> {
    return (await amctlEnvelope<T>(args, { cwd })).data as T;
}

/** Calls the Agent Manager REST API through `amctl api`, which owns the token. */
export async function amctlApi<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const args = ["api", "-X", method, apiPath, "--json"];
    if (body !== undefined) {
        args.push("--input", "-", "-H", "Content-Type: application/json");
    }
    const result = await runAmctl(args, body === undefined ? undefined : JSON.stringify(body));
    if (result.code === 0) {
        return (result.stdout.trim() ? JSON.parse(result.stdout) : undefined) as T;
    }
    const status = Number(/HTTP (\d{3})/.exec(result.stderr)?.[1]);
    if (!status) {
        const envelope = parseEnvelope<T>(result);
        throw envelope.error ? envelopeError(envelope.error) : new Error(result.stderr.trim());
    }
    let message = result.stdout.trim();
    try {
        message = JSON.parse(message).message ?? message;
    } catch { /* plain-text error body */ }
    throw new AgentManagerApiError(status, `${method} ${apiPath} failed (${status}): ${message}`);
}
