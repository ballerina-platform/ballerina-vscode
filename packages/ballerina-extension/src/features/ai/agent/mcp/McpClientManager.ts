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

import * as vscode from "vscode";
import { BUILT_IN_MCP_SERVERS } from "./builtIns";
import { McpOAuthProvider, SignInCancelled, signInOnNextConnect, takeInteractiveSignIn } from "./oauth";
import { loadMcpConfig, McpLoadErrors } from "./configLoader";
import {
    McpConnectionStatus,
    McpHttpServerConfig,
    McpScope,
    McpServerConfig,
    McpServerStatus,
    McpToolSummary,
    McpTransportType,
    NormalisedMcpServerConfig,
} from "./types";

// The MCP SDK ships its public API via package `exports` (ESM `dist/esm/...`
// and CJS `dist/cjs/...`). TypeScript's classic `moduleResolution: "node"`
// in this workspace doesn't consult `exports`, so we can't type-resolve
// `@modelcontextprotocol/sdk/client/index.js` directly. Webpack and Node
// honour `exports` at runtime, so a plain `require()` resolves to the
// CJS variant. We type the surface we touch locally — enough for safety
// without forcing a tsconfig change for the whole extension.
interface McpToolRaw {
    name: string;
    description?: string;
    inputSchema?: unknown;
}
interface McpClient {
    connect(transport: unknown, options?: unknown): Promise<void>;
    listTools(params?: unknown): Promise<{ tools: McpToolRaw[] }>;
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
    close(): Promise<void>;
}
type McpClientCtor = new (info: { name: string; version: string }) => McpClient;
type StdioCtor = new (params: { command: string; args?: string[]; env?: Record<string, string> }) => unknown;
interface StreamableHttpTransport {
    finishAuth(authorizationCode: string): Promise<void>;
}
type StreamableHttpCtor = new (url: URL, opts?: { requestInit?: { headers?: Record<string, string> }; authProvider?: McpOAuthProvider }) => StreamableHttpTransport;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client: McpClientImpl } = require("@modelcontextprotocol/sdk/client/index.js") as { Client: McpClientCtor };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js") as { StdioClientTransport: StdioCtor };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js") as { StreamableHTTPClientTransport: StreamableHttpCtor };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UnauthorizedError } = require("@modelcontextprotocol/sdk/client/auth.js") as { UnauthorizedError: new (...args: unknown[]) => Error };

const CLIENT_NAME = "wso2-integrator-copilot";
const CLIENT_VERSION = "1.0.0";

const CONNECT_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}

interface McpToolDescriptor {
    name: string;
    description?: string;
    inputSchema: unknown;
}

export interface ConnectedServer {
    scope: McpScope;
    name: string;
    config: McpServerConfig;
    transport: McpTransportType;
    client: McpClient;
    tools: McpToolDescriptor[];
}

interface ServerState {
    scope: McpScope;
    name: string;
    config: McpServerConfig;
    transport: McpTransportType;
    status: McpConnectionStatus;
    error?: string;
    tools: McpToolDescriptor[];
    client?: McpClient;
}

/** Override store is keyed by `${scope}:${name}` so user and workspace servers can share a name. */
export type EnabledOverrideStore = {
    get(scopedKey: string): boolean | undefined;
    set(scopedKey: string, enabled: boolean): Promise<void>;
    delete(scopedKey: string): Promise<void>;
    keys(): string[];
};

function transportOf(cfg: McpServerConfig): McpTransportType {
    if (cfg.type === "stdio" || ("command" in cfg && cfg.command)) {
        return "stdio";
    }
    return "http";
}

function configKey(cfg: McpServerConfig): string {
    return JSON.stringify(cfg);
}

/**
 * Convert the internal McpServerConfig (which has optional `type` and an
 * internal `disabled` flag) into the DTO shape: `type` required, `disabled`
 * stripped. The DTO is what the Edit dialog round-trips through.
 */
function normaliseConfigForDto(cfg: McpServerConfig, transport: McpTransportType): NormalisedMcpServerConfig {
    if (transport === "stdio") {
        const stdio = cfg as { command?: string; args?: string[]; env?: Record<string, string> };
        return {
            type: "stdio",
            command: stdio.command ?? "",
            ...(stdio.args ? { args: stdio.args } : {}),
            ...(stdio.env ? { env: stdio.env } : {}),
        };
    }
    const http = cfg as McpHttpServerConfig;
    return {
        type: "http",
        url: http.url ?? "",
        ...(http.headers ? { headers: http.headers } : {}),
        ...(http.headersFromEnv ? { headersFromEnv: http.headersFromEnv } : {}),
        ...(http.oauth ? { oauth: http.oauth } : {}),
    };
}

function keyOf(scope: McpScope, name: string): string {
    return `${scope}:${name}`;
}

/**
 * Manages MCP client connections for the Copilot agent.
 *
 * Two scopes — `user` and `workspace` — are loaded independently from
 * `~/.ballerina/copilot/mcp.json` and `~/.ballerina/copilot/workspaces/<hash>/mcp.json`.
 * The same name can live in both scopes and they're treated as independent
 * servers internally. For the agent-facing tool registry (built by
 * {@link ./toolBridge}) workspace-scope servers shadow user-scope ones with
 * the same name to avoid duplicate `mcp__name__tool` entries.
 *
 * Lifecycle:
 *  - {@link refresh} re-reads both files, opens new clients, closes removed
 *    or disabled ones.
 *  - {@link listServers} returns a per-server snapshot (with `shadowed`).
 *  - {@link dispose} closes all clients; safe to call multiple times.
 *
 * A broken server (bad command, unreachable URL, schema-mismatched tool) is
 * recorded with status `failed` and an error message; it never throws out of
 * `refresh` so the agent can keep going with the remaining servers.
 */
export class McpClientManager {
    private servers = new Map<string, ServerState>();
    private enabledOverrides: EnabledOverrideStore;
    private workspacePath: string | undefined;
    private workspaceTrusted: boolean;
    private lastErrors: McpLoadErrors = {};
    private refreshing?: Promise<void>;
    private disposed = false;
    // Kept across reconnects so a PKCE verifier survives until the browser redirect comes back.
    private oauthProviders = new Map<string, McpOAuthProvider>();
    // A reconnect mid-sign-in would replace the PKCE verifier the browser redirect is waiting to redeem.
    private signingIn = new Set<string>();
    /** Called when a server connects outside refresh(), e.g. after an OAuth sign-in. */
    onDidChange?: () => void;

    constructor(enabledOverrides: EnabledOverrideStore, workspacePath?: string, workspaceTrusted: boolean = true) {
        this.enabledOverrides = enabledOverrides;
        this.workspacePath = workspacePath;
        this.workspaceTrusted = workspaceTrusted;
    }

    /** Workspace-scope is available iff we have a workspace path AND VS Code trusts it. */
    hasWorkspace(): boolean {
        return !!this.workspacePath && this.workspaceTrusted;
    }

    /** Called by the activator when VS Code's workspace trust is granted mid-session. */
    async setWorkspaceTrusted(trusted: boolean): Promise<void> {
        if (this.workspaceTrusted === trusted) {
            return;
        }
        this.workspaceTrusted = trusted;
        await this.refresh();
    }

    async refresh(): Promise<void> {
        if (this.disposed) {
            return;
        }
        if (this.refreshing) {
            return this.refreshing;
        }
        this.refreshing = this.doRefresh().finally(() => {
            this.refreshing = undefined;
        });
        return this.refreshing;
    }

    /** Latest parse / read errors per scope from the most recent refresh. */
    getLoadErrors(): McpLoadErrors {
        return { ...this.lastErrors };
    }

    /**
     * Synthesize entries for every shipped built-in MCP server, so they flow
     * through the same connect/disconnect path as on-disk entries.
     */
    private builtInEntries(): { scope: McpScope; name: string; config: McpServerConfig }[] {
        return BUILT_IN_MCP_SERVERS.map(b => ({
            scope: "builtin" as McpScope,
            name: b.id,
            config: b.defaultConfig,
        }));
    }

    private async doRefresh(): Promise<void> {
        const { entries: diskEntries, errors } = loadMcpConfig(this.workspacePath, this.workspaceTrusted);
        // A same-named user/workspace server overrides a built-in — they'd otherwise collide on the mcp__<name>__ namespace.
        const diskNames = new Set(diskEntries.map(e => e.name));
        const builtIns = this.builtInEntries().filter(b => !diskNames.has(b.name));
        const entries = [...diskEntries, ...builtIns];
        this.lastErrors = errors;
        const desiredKeys = new Set(entries.map(e => keyOf(e.scope, e.name)));

        // Only delete on disappear or config change. On a just-disabled toggle
        // we disconnect but keep the Map entry so its insertion order survives.
        for (const [key, state] of [...this.servers.entries()]) {
            const desired = entries.find(e => keyOf(e.scope, e.name) === key);
            if (!desired) {
                await this.disconnect(state);
                this.servers.delete(key);
                this.oauthProviders.delete(key);
                continue;
            }
            const enabled = this.isServerEnabled(desired.scope, desired.name, desired.config);
            const configChanged = configKey(desired.config) !== configKey(state.config);
            if (configChanged) {
                await this.disconnect(state);
                this.servers.delete(key);
                this.oauthProviders.delete(key);
                continue;
            }
            if (!enabled && state.status !== "disconnected") {
                await this.disconnect(state);
            }
        }

        // Open clients for newly-enabled or newly-added servers.
        const opens: Promise<void>[] = [];
        for (const entry of entries) {
            const key = keyOf(entry.scope, entry.name);
            const enabled = this.isServerEnabled(entry.scope, entry.name, entry.config);
            if (!enabled) {
                this.servers.set(key, {
                    scope: entry.scope,
                    name: entry.name,
                    config: entry.config,
                    transport: transportOf(entry.config),
                    status: "disconnected",
                    tools: [],
                });
                continue;
            }
            // Skip only if already connected or a connect is in flight. Existing
            // `disconnected`/`failed` states fall through so re-enabling actually
            // reconnects instead of leaving the server in its prior status.
            const existing = this.servers.get(key);
            if (existing && (existing.status === "connected" || existing.status === "connecting" || this.signingIn.has(key))) {
                continue;
            }
            const state: ServerState = {
                scope: entry.scope,
                name: entry.name,
                config: entry.config,
                transport: transportOf(entry.config),
                status: "connecting",
                tools: [],
            };
            this.servers.set(key, state);
            opens.push(this.connect(state));
        }

        // Defensive: drop any stale entries no longer in `desiredKeys`.
        for (const key of [...this.servers.keys()]) {
            if (!desiredKeys.has(key)) {
                this.servers.delete(key);
            }
        }

        await Promise.allSettled(opens);
    }

    private isServerEnabled(scope: McpScope, name: string, cfg: McpServerConfig): boolean {
        const override = this.enabledOverrides.get(keyOf(scope, name));
        if (override !== undefined) {
            return override;
        }
        // Built-ins fall back to the per-entry `autoEnable` flag (default off).
        // The user can still toggle them; their override persists in the store.
        if (scope === "builtin") {
            const def = BUILT_IN_MCP_SERVERS.find(b => b.id === name);
            return def?.autoEnable === true;
        }
        return cfg.disabled !== true;
    }

    async deleteServerOverride(scope: McpScope, name: string): Promise<void> {
        await this.enabledOverrides.delete(keyOf(scope, name));
    }

    /** Drop any server-scoped override keys that no longer have a matching entry in the config files. */
    async pruneOrphanOverrides(): Promise<void> {
        const { entries } = loadMcpConfig(this.workspacePath, this.workspaceTrusted);
        const liveKeys = new Set([
            ...entries.map(e => keyOf(e.scope, e.name)),
            ...this.builtInEntries().map(e => keyOf(e.scope, e.name)),
        ]);
        for (const key of this.enabledOverrides.keys()) {
            if (!liveKeys.has(key)) {
                await this.enabledOverrides.delete(key);
            }
        }
    }

    private async connect(state: ServerState): Promise<void> {
        let client: McpClient | undefined;
        try {
            client = new McpClientImpl({ name: CLIENT_NAME, version: CLIENT_VERSION });
            const transport = this.buildTransport(state);
            await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect to '${state.scope}:${state.name}'`)
                .catch((err) => this.handleUnauthorized(state, transport as StreamableHttpTransport, err));
            const { tools } = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, `list tools for '${state.scope}:${state.name}'`);
            // Disposed mid-connect: close the client instead of leaking it.
            if (this.disposed) {
                await client.close().catch(() => { /* ignore */ });
                return;
            }
            const filtered: McpToolDescriptor[] = [];
            for (const t of tools) {
                if (!t || typeof t.name !== "string" || !t.name) {
                    continue;
                }
                if (!t.inputSchema || typeof t.inputSchema !== "object") {
                    console.warn(`[mcp] Skipping tool '${state.scope}:${state.name}/${t.name}': missing/invalid inputSchema`);
                    continue;
                }
                filtered.push({
                    name: t.name,
                    description: typeof t.description === "string" ? t.description : undefined,
                    inputSchema: t.inputSchema,
                });
            }
            state.client = client;
            state.tools = filtered;
            state.status = "connected";
            state.error = undefined;
        } catch (err: any) {
            // Close a half-open client so a timed-out stdio child / socket doesn't leak.
            if (client) {
                client.close().catch(() => { /* ignore */ });
            }
            const signingIn = this.signingIn.has(keyOf(state.scope, state.name));
            state.status = signingIn ? "connecting" : "failed";
            state.error = signingIn ? undefined : err?.message ?? String(err);
            state.client = undefined;
            state.tools = [];
            console.warn(`[mcp] Failed to connect to '${state.scope}:${state.name}':`, state.error);
        }
    }

    // A 401 leaves a pending authorization URL; sign-in finishes on the same transport, then reconnects.
    private handleUnauthorized(state: ServerState, transport: StreamableHttpTransport, err: unknown): never {
        const key = keyOf(state.scope, state.name);
        const provider = this.oauthProviders.get(key);
        if (!(err instanceof UnauthorizedError) || !provider?.authorizationUrl) {
            throw err;
        }
        // Background reconnects stay quiet; the MCP page offers Sign In on the row instead.
        if (takeInteractiveSignIn((state.config as McpHttpServerConfig).url)) {
            void this.promptSignIn(state, provider, transport);
        }
        throw new Error("Sign-in required.");
    }

    /** Starts a browser sign-in for a server that is waiting for one. */
    async signIn(scope: McpScope, name: string): Promise<void> {
        const state = this.servers.get(keyOf(scope, name));
        if (!state || state.status === "connected" || this.signingIn.has(keyOf(scope, name))) {
            return;
        }
        signInOnNextConnect((state.config as McpHttpServerConfig).url);
        state.status = "connecting";
        state.error = undefined;
        await this.connect(state);
    }

    private async promptSignIn(state: ServerState, provider: McpOAuthProvider, transport: StreamableHttpTransport): Promise<void> {
        const key = keyOf(state.scope, state.name);
        this.signingIn.add(key);
        try {
            await transport.finishAuth(await provider.signIn(state.name));
            provider.authorizationUrl = undefined;
            await this.connect(state);
            this.onDidChange?.();
        } catch (err: any) {
            state.status = "failed";
            state.error = "Sign-in required.";
            this.onDidChange?.();
            if (!(err instanceof SignInCancelled)) {
                vscode.window.showErrorMessage(`Couldn't sign in to MCP server '${state.name}'. ${err?.message ?? err} Use Sign In on the MCP Servers page to try again.`);
            }
        } finally {
            this.signingIn.delete(key);
        }
    }

    private buildTransport(state: ServerState): unknown {
        const cfg = state.config;
        const t = transportOf(cfg);
        if (t === "stdio") {
            if (!("command" in cfg) || !cfg.command) {
                throw new Error("stdio MCP server config requires 'command'");
            }
            const env: Record<string, string> = {};
            for (const [k, v] of Object.entries(process.env)) {
                if (typeof v === "string") {
                    env[k] = v;
                }
            }
            if (cfg.env) {
                Object.assign(env, cfg.env);
            }
            return new StdioClientTransport({
                command: cfg.command,
                args: cfg.args ?? [],
                env,
            });
        }
        if (!("url" in cfg) || !cfg.url) {
            throw new Error("http MCP server config requires 'url'");
        }
        const url = new URL(cfg.url);
        const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
        // Resolve env-var-backed headers at connect time so secrets stay out of mcp.json.
        for (const [name, envVar] of Object.entries(cfg.headersFromEnv ?? {})) {
            const value = process.env[envVar];
            if (typeof value === "string" && value) {
                headers[name] = value;
            } else {
                console.warn(`[mcp] Header '${name}' references unset env var '${envVar}'`);
            }
        }
        return new StreamableHTTPClientTransport(url, {
            requestInit: { headers },
            authProvider: cfg.oauth ? this.oauthProviderFor(state, cfg.url, cfg.oauth) : undefined,
        });
    }

    private oauthProviderFor(state: ServerState, url: string, oauth: NonNullable<McpHttpServerConfig["oauth"]>): McpOAuthProvider {
        const key = keyOf(state.scope, state.name);
        let provider = this.oauthProviders.get(key);
        if (!provider) {
            provider = new McpOAuthProvider(url, oauth);
            this.oauthProviders.set(key, provider);
        }
        return provider;
    }

    private async disconnect(state: ServerState): Promise<void> {
        if (!state.client) {
            return;
        }
        try {
            await state.client.close();
        } catch (err) {
            console.warn(`[mcp] Error closing client '${state.scope}:${state.name}':`, err);
        } finally {
            state.client = undefined;
        }
    }

    private workspaceNames(): Set<string> {
        const out = new Set<string>();
        for (const s of this.servers.values()) {
            if (s.scope === "workspace") {
                out.add(s.name);
            }
        }
        return out;
    }

    /** Snapshot of all known servers. User-scope rows that share a name with a workspace-scope server get `shadowed: true`. */
    listServers(): McpServerStatus[] {
        const wsNames = this.workspaceNames();
        const out: McpServerStatus[] = [];
        for (const state of this.servers.values()) {
            const shadowed = state.scope === "user" && wsNames.has(state.name);
            out.push({
                name: state.name,
                scope: state.scope,
                transport: state.transport,
                enabled: this.isServerEnabled(state.scope, state.name, state.config),
                status: state.status,
                error: state.error,
                signInRequired: state.status === "failed" && !!this.oauthProviders.get(keyOf(state.scope, state.name))?.authorizationUrl,
                tools: state.tools.map<McpToolSummary>(t => ({ name: t.name, description: t.description })),
                config: normaliseConfigForDto(state.config, state.transport),
                shadowed,
            });
        }
        return out;
    }

    /**
     * Connected servers for the bridge. When a name collides across scopes,
     * the workspace-scope server wins and the user-scope one is excluded.
     */
    getConnectedTools(): ConnectedServer[] {
        const wsNames = this.workspaceNames();
        const out: ConnectedServer[] = [];
        for (const state of this.servers.values()) {
            if (state.status !== "connected" || !state.client) {
                continue;
            }
            if (state.scope === "user" && wsNames.has(state.name)) {
                continue; // shadowed by workspace
            }
            out.push({
                scope: state.scope,
                name: state.name,
                config: state.config,
                transport: state.transport,
                client: state.client,
                tools: state.tools,
            });
        }
        return out;
    }

    /** Invoke a tool on a specific server (scope + name disambiguates collisions). */
    async callTool(scope: McpScope, serverName: string, toolName: string, args: unknown): Promise<unknown> {
        const state = this.servers.get(keyOf(scope, serverName));
        if (!state || state.status !== "connected" || !state.client) {
            throw new Error(`MCP server '${scope}:${serverName}' is not connected`);
        }
        return state.client.callTool({
            name: toolName,
            arguments: (args as Record<string, unknown>) ?? {},
        });
    }

    async setEnabled(scope: McpScope, name: string, enabled: boolean): Promise<void> {
        await this.enabledOverrides.set(keyOf(scope, name), enabled);
        await this.refresh();
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        const closes: Promise<void>[] = [];
        for (const state of this.servers.values()) {
            closes.push(this.disconnect(state));
        }
        await Promise.allSettled(closes);
        this.servers.clear();
    }
}

let singleton: McpClientManager | undefined;

export function initMcpClientManager(overrides: EnabledOverrideStore, workspacePath?: string, workspaceTrusted: boolean = true): McpClientManager {
    if (!singleton) {
        singleton = new McpClientManager(overrides, workspacePath, workspaceTrusted);
    }
    return singleton;
}

export function getMcpClientManager(): McpClientManager | undefined {
    return singleton;
}

/** Refresh the active manager so mid-session mcp.json edits take effect. No-op if MCP is off; errors are logged, never thrown. */
export async function refreshMcpClientManager(): Promise<void> {
    if (!singleton) {
        return;
    }
    try {
        await singleton.refresh();
    } catch (err) {
        console.warn('[mcp] refresh failed:', err);
    }
}

export async function disposeMcpClientManager(): Promise<void> {
    if (singleton) {
        await singleton.dispose();
        singleton = undefined;
    }
}
