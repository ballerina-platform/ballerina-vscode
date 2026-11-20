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

// Records real Language Server and webview RPC traffic to JSON fixtures so that
// fast tests can replay them without spawning VSCode or the LS. Entirely gated
// by the BAL_RECORD_FIXTURES env var and must never affect runtime behavior.
//
//   BAL_RECORD_FIXTURES=1 BAL_FIXTURES_DIR=/tmp/fixtures code --extensionDevelopmentPath ...
//
// Output layout: <BAL_FIXTURES_DIR>/<kind>/<method-slug>/<NNNN>.json
// See docs/TEST_GUIDE.md (L2 "Choice 2" and "Foundation") for the capture/curation workflow.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

type Kind = "ls" | "rpc";

const SECRET_KEY_RE = /token|secret|password|passwd|api[_-]?key|apikey|authorization|credential/i;

// Live read of the env flag. Callers on a hot path should cache this once at module load
// (see extended-language-client.ts / RPCLayer.ts) rather than call it per request —
// recording is enabled for the whole process before launch, so it never changes at runtime.
export function isRecording(): boolean {
    const v = process.env.BAL_RECORD_FIXTURES;
    return v === "1" || v === "true";
}

/** Turn an LS/RPC method name into a filesystem-safe directory segment. */
export function methodToSlug(method: string): string {
    return (method || "unknown").replace(/[\\/]/g, ".").replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Deep clone with values of secret-looking keys replaced. Cycles are dropped. */
export function redactSecrets<T>(value: T): T {
    const seen = new WeakSet<object>();
    const walk = (v: any): any => {
        if (v === null || typeof v !== "object") {
            return v;
        }
        if (seen.has(v)) {
            return undefined;
        }
        seen.add(v);
        if (Array.isArray(v)) {
            return v.map(walk);
        }
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
            // Redact the WHOLE value for a secret-looking key regardless of type — an array
            // or object under e.g. `credentials`/`tokens` must not recurse through unredacted.
            out[k] = SECRET_KEY_RE.test(k) ? "***REDACTED***" : walk(val);
        }
        return out;
    };
    return walk(value);
}

// The methods, as the LS and the webview's RPC name them, whose responses carry configurables' values read from
// Config.toml under keys that look like nothing secret (`configurables[].value`): Config.toml is kept out of version
// control, so a fixture must not hold them.
const CONFIGURED_VALUE_METHODS = new Set([
    "flowDesignService/getConnectionConfigurables", "bi-diagram/getConnectionConfigurables"
]);

/** A copy of a response with the configurables' values read from Config.toml masked, for the methods that carry them. */
export function redactConfiguredValues<T>(method: string, response: T): T {
    const configurables = (response as any)?.configurables;
    if (!CONFIGURED_VALUE_METHODS.has(method) || !Array.isArray(configurables)) {
        return response;
    }
    return {
        ...response,
        configurables: configurables.map((item: any) =>
            item && typeof item === "object" && "value" in item ? { ...item, value: "***REDACTED***" } : item),
    };
}

// The methods, as the LS and the webview's RPC name them, that send a connection's form, and those of them whose
// response writes its values to Config.toml.
const CONNECTION_FORM_METHODS = new Set([
    "flowDesignService/getSourceCode", "bi-diagram/getSourceCode",
    ...CONFIGURED_VALUE_METHODS
]);
const SOURCE_CODE_METHODS = new Set(["flowDesignService/getSourceCode", "bi-diagram/getSourceCode"]);
// A connection's own properties, which hold no value read from Config.toml.
const CONNECTION_OWN_KEYS = new Set(["variable", "type", "scope", "checkError"]);

function sendsConnectionForm(method: string, request: any): boolean {
    return CONNECTION_FORM_METHODS.has(method) && request?.flowNode?.codedata?.node === "NEW_CONNECTION";
}

function isConnectionSave(method: string, request: any): boolean {
    return SOURCE_CODE_METHODS.has(method) && sendsConnectionForm(method, request);
}

/**
 * A copy of a request that sends a connection's form (to save it, or preview its configurables) with its arguments'
 * values masked: a form opened on an existing connection holds the values of its configurables, read from
 * Config.toml. Any other request comes back as it is.
 */
export function redactConnectionSaveRequest<T>(method: string, request: T): T {
    const properties = (request as any)?.flowNode?.properties;
    if (!sendsConnectionForm(method, request) || !properties || typeof properties !== "object") {
        return request;
    }
    const masked = Object.fromEntries(Object.entries(properties).map(([key, property]: [string, any]) =>
        [key, CONNECTION_OWN_KEYS.has(key) || !property || typeof property !== "object" || !("value" in property)
            ? property : { ...property, value: "***REDACTED***" }]));
    return { ...request, flowNode: { ...(request as any).flowNode, properties: masked } };
}

/** A copy of a connection's save response with the values it writes to Config.toml masked. */
export function redactConnectionSaveResponse<T>(method: string, request: unknown, response: T): T {
    const textEdits = (response as any)?.textEdits;
    if (!isConnectionSave(method, request) || !textEdits || typeof textEdits !== "object") {
        return response;
    }
    const masked = Object.fromEntries(Object.entries(textEdits).map(([file, edits]: [string, any]) =>
        [file, path.basename(file) === "Config.toml" && Array.isArray(edits)
            ? edits.map((edit: any) => ({ ...edit, newText: "***REDACTED***" })) : edits]));
    return { ...response, textEdits: masked };
}

/** Deep string replacement (e.g. workspace path -> ${WORKSPACE}) for machine-independent fixtures. */
export function rewritePaths<T>(value: T, replacements: Array<[string, string]>): T {
    const rep = (s: string) =>
        replacements.reduce((acc, [from, to]) => (from ? acc.split(from).join(to) : acc), s);
    const walk = (v: any): any => {
        if (typeof v === "string") {
            return rep(v);
        }
        if (v === null || typeof v !== "object") {
            return v;
        }
        if (Array.isArray(v)) {
            return v.map(walk);
        }
        const out: any = {};
        for (const [k, val] of Object.entries(v)) {
            out[k] = walk(val);
        }
        return out;
    };
    return walk(value);
}

function fixturesDir(): string {
    return process.env.BAL_FIXTURES_DIR || path.join(os.tmpdir(), "bal-fixtures");
}

function defaultReplacements(): Array<[string, string]> {
    const reps: Array<[string, string]> = [];
    const ws = process.env.BAL_FIXTURES_WORKSPACE;
    if (ws) {
        reps.push([ws, "${WORKSPACE}"]);
    }
    reps.push([os.homedir(), "${HOME}"]);
    return reps;
}

const seq: Record<string, number> = {};

function nextIndex(dir: string): number {
    if (seq[dir] === undefined) {
        try {
            seq[dir] = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length;
        } catch {
            seq[dir] = 0;
        }
    }
    const n = seq[dir];
    seq[dir] = n + 1;
    return n;
}

export function record(kind: Kind, method: string, request: unknown, response: unknown): void {
    if (!isRecording()) {
        return;
    }
    try {
        const dir = path.join(fixturesDir(), kind, methodToSlug(method));
        fs.mkdirSync(dir, { recursive: true });
        const reps = defaultReplacements();
        const payload = {
            kind,
            method,
            request: rewritePaths(redactSecrets(redactConnectionSaveRequest(method, request)), reps),
            response: rewritePaths(redactSecrets(redactConfiguredValues(method,
                redactConnectionSaveResponse(method, request, response))), reps),
        };
        const file = path.join(dir, `${String(nextIndex(dir)).padStart(4, "0")}.json`);
        fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    } catch {
        // Recording must never affect runtime behavior.
    }
}

export function recordLs(method: string, request: unknown, response: unknown): void {
    record("ls", method, request, response);
}

export function recordRpc(method: string, request: unknown, response: unknown): void {
    record("rpc", method, request, response);
}
