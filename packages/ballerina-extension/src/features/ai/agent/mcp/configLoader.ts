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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { McpConfigFile, McpScope, McpServerConfig } from "./types";

const COPILOT_ROOT = path.join(os.homedir(), ".ballerina", "copilot");
export const USER_MCP_CONFIG_PATH = path.join(COPILOT_ROOT, "mcp.json");
/** Bare-name `.mcp.json` matches Claude Code / Cline convention for tool-agnostic config. This is the
 *  one project-scope file the UI writes to — every other project-scope path is read-only. */
export const PROJECT_MCP_FILENAME = ".mcp.json";
/** Extra project-scope locations, read-only and merged into the same "workspace" scope as
 *  `.mcp.json`. Append future locations here — nothing else needs to change to support one. */
export const ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS: readonly string[] = [
    path.join(".wso2", "mcp.json"),
];

export const EMPTY_CONFIG: McpConfigFile = { mcpServers: {} };

/**
 * Project-scope MCP config lives in the user's workspace tree (versioned with
 * the repo), at `<workspacePath>/.mcp.json`. Standard adopted from Claude Code.
 * This is the sole read+write target — the UI's add/edit/delete and "edit raw
 * JSON" affordances always resolve here regardless of what else is being read.
 */
export function workspaceMcpConfigPath(workspacePath: string): string {
    return path.join(path.resolve(workspacePath), PROJECT_MCP_FILENAME);
}

/** Absolute paths for `ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS`, resolved against a workspace. */
export function workspaceAdditionalMcpConfigPaths(workspacePath: string): string[] {
    const root = path.resolve(workspacePath);
    return ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS.map(relative => path.join(root, relative));
}

/** Presence of the primary file or any additional one — the implicit opt-in signal for MCP tool support. */
export function hasProjectMcpConfig(workspacePath?: string): boolean {
    if (!workspacePath) {
        return false;
    }
    try {
        const paths = [workspaceMcpConfigPath(workspacePath), ...workspaceAdditionalMcpConfigPaths(workspacePath)];
        return paths.some(p => fs.existsSync(p));
    } catch {
        return false;
    }
}

/** Returns the on-disk path for the given scope. Throws if scope=workspace without a workspace path. */
export function configFilePath(scope: McpScope, workspacePath?: string): string {
    if (scope === "user") {
        return USER_MCP_CONFIG_PATH;
    }
    if (!workspacePath) {
        throw new Error("Workspace path is required for workspace-scope config.");
    }
    return workspaceMcpConfigPath(workspacePath);
}

interface ReadResult {
    file: McpConfigFile;
    error?: string;
}

function readConfigFile(filePath: string): ReadResult {
    try {
        if (!fs.existsSync(filePath)) {
            return { file: EMPTY_CONFIG };
        }
        const raw = fs.readFileSync(filePath, "utf8");
        if (!raw.trim()) {
            return { file: EMPTY_CONFIG };
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (parseErr: any) {
            const msg = parseErr?.message ?? String(parseErr);
            console.warn(`[mcp] Invalid JSON at ${filePath}:`, msg);
            return { file: EMPTY_CONFIG, error: `Invalid JSON: ${msg}` };
        }
        if (!parsed || typeof parsed !== "object" || !(parsed as any).mcpServers || typeof (parsed as any).mcpServers !== "object" || Array.isArray((parsed as any).mcpServers)) {
            const msg = "Missing or non-object 'mcpServers' key.";
            console.warn(`[mcp] Ignoring invalid config at ${filePath}: ${msg}`);
            return { file: EMPTY_CONFIG, error: msg };
        }
        return { file: parsed as McpConfigFile };
    } catch (err: any) {
        const msg = err?.message ?? String(err);
        console.warn(`[mcp] Failed to read config at ${filePath}:`, msg);
        return { file: EMPTY_CONFIG, error: msg };
    }
}

function inferTransport(cfg: McpServerConfig): McpServerConfig {
    if (cfg.type) {
        return cfg;
    }
    if ("command" in cfg && cfg.command) {
        return { ...cfg, type: "stdio" };
    }
    if ("url" in cfg && cfg.url) {
        return { ...cfg, type: "http" };
    }
    return cfg;
}

function normaliseEntries(scope: McpScope, file: McpConfigFile): Array<{ name: string; config: McpServerConfig; scope: McpScope }> {
    const servers = file.mcpServers ?? {};
    const out: Array<{ name: string; config: McpServerConfig; scope: McpScope }> = [];
    for (const [name, cfg] of Object.entries(servers)) {
        if (!cfg || typeof cfg !== "object") {
            console.warn(`[mcp] Ignoring server '${name}' (${scope}): entry is not an object`);
            continue;
        }
        const normalized = inferTransport(cfg);
        // Explicit type is authoritative: require the field it implies.
        if (normalized.type === "stdio") {
            if (!("command" in normalized) || !normalized.command) {
                console.warn(`[mcp] Ignoring server '${name}' (${scope}): stdio servers require 'command'`);
                continue;
            }
        } else if (normalized.type === "http") {
            if (!("url" in normalized) || !normalized.url) {
                console.warn(`[mcp] Ignoring server '${name}' (${scope}): http servers require 'url'`);
                continue;
            }
        } else {
            console.warn(`[mcp] Ignoring server '${name}' (${scope}): must specify 'command' (stdio) or 'url' (http)`);
            continue;
        }
        out.push({ name, config: normalized, scope });
    }
    return out;
}

/**
 * Reads the user-global mcp.json plus, when both a workspace path is provided
 * and `allowWorkspace` is true, every project-scope file — `.mcp.json` plus each
 * of `ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS` — merged into one "workspace" scope.
 * Returns a flat list tagged with scope. The two top-level scopes are independent:
 * `{user, foo}` and `{workspace, foo}` can coexist.
 *
 * Within "workspace", earlier files win: `.mcp.json` is read first and always
 * keeps its entries; each additional path is then folded in, in list order,
 * dropping any name already claimed by a file read before it — so every scope
 * keeps exactly one entry per name no matter how many project-scope files exist.
 *
 * `allowWorkspace` is the workspace-trust gate — callers pass `false` for
 * untrusted workspaces so arbitrary `command` entries in a cloned project file
 * don't auto-spawn processes.
 */
export interface McpLoadErrors {
    user?: string;
    workspace?: string;
}

export interface McpLoadResult {
    entries: Array<{ name: string; config: McpServerConfig; scope: McpScope }>;
    errors: McpLoadErrors;
}

export function loadMcpConfig(workspacePath?: string, allowWorkspace: boolean = true): McpLoadResult {
    const entries: Array<{ name: string; config: McpServerConfig; scope: McpScope }> = [];
    const errors: McpLoadErrors = {};

    const userRead = readConfigFile(USER_MCP_CONFIG_PATH);
    if (userRead.error) {
        errors.user = userRead.error;
    }
    entries.push(...normaliseEntries("user", userRead.file));

    if (workspacePath && allowWorkspace) {
        const projectPaths = [workspaceMcpConfigPath(workspacePath), ...workspaceAdditionalMcpConfigPaths(workspacePath)];
        const workspaceErrors: string[] = [];
        const claimedNames = new Set<string>();

        for (const filePath of projectPaths) {
            const read = readConfigFile(filePath);
            if (read.error) {
                workspaceErrors.push(`${filePath}: ${read.error}`);
            }
            const fresh = normaliseEntries("workspace", read.file).filter(e => !claimedNames.has(e.name));
            fresh.forEach(e => claimedNames.add(e.name));
            entries.push(...fresh);
        }
        if (workspaceErrors.length) {
            errors.workspace = workspaceErrors.join("; ");
        }
    }
    return { entries, errors };
}

export function ensureMcpConfigFileExists(scope: McpScope = "user", workspacePath?: string): string {
    const filePath = configFilePath(scope, workspacePath);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({ mcpServers: {} }, null, 2), "utf8");
    }
    return filePath;
}

/**
 * Atomically adds a new server entry to the chosen scope's mcp.json.
 *
 * Throws if a server with the same name already exists in that scope.
 * Reads the file fresh before mutating, so external edits made while a form
 * was open are preserved.
 */
export function writeMcpServer(name: string, config: McpServerConfig, scope: McpScope = "user", workspacePath?: string): void {
    const filePath = ensureMcpConfigFileExists(scope, workspacePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: McpConfigFile = raw.trim() ? JSON.parse(raw) : { mcpServers: {} };
    const servers = parsed.mcpServers ?? {};
    if (Object.prototype.hasOwnProperty.call(servers, name)) {
        throw new Error(`Server '${name}' already exists in ${scope} mcp.json.`);
    }
    servers[name] = config;
    parsed.mcpServers = servers;
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), "utf8");
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        throw err;
    }
}

/**
 * Atomically replaces an existing server entry in the chosen scope's mcp.json.
 * Throws if no entry with `name` exists.
 */
export function updateMcpServer(name: string, config: McpServerConfig, scope: McpScope = "user", workspacePath?: string): void {
    const filePath = configFilePath(scope, workspacePath);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Server '${name}' not found — no ${scope} mcp.json exists.`);
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: McpConfigFile = raw.trim() ? JSON.parse(raw) : { mcpServers: {} };
    const servers = parsed.mcpServers ?? {};
    if (!Object.prototype.hasOwnProperty.call(servers, name)) {
        throw new Error(`Server '${name}' not found in ${scope} mcp.json.`);
    }
    servers[name] = config;
    parsed.mcpServers = servers;
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), "utf8");
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        throw err;
    }
}

/**
 * Atomically removes a server entry from the chosen scope's mcp.json.
 * No-op if the file or entry doesn't exist.
 */
export function deleteMcpServer(name: string, scope: McpScope = "user", workspacePath?: string): void {
    const filePath = configFilePath(scope, workspacePath);
    if (!fs.existsSync(filePath)) {
        return;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed: McpConfigFile = raw.trim() ? JSON.parse(raw) : { mcpServers: {} };
    const servers = parsed.mcpServers ?? {};
    if (!Object.prototype.hasOwnProperty.call(servers, name)) {
        return;
    }
    delete servers[name];
    parsed.mcpServers = servers;
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    try {
        fs.writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), "utf8");
        fs.renameSync(tmpPath, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        throw err;
    }
}

/** Relative glob for every project-scope file — the primary plus each additional path. */
function projectMcpRelativePatterns(): string[] {
    return [PROJECT_MCP_FILENAME, ...ADDITIONAL_PROJECT_MCP_RELATIVE_PATHS];
}

/**
 * Subscribes to every config file's change/create/delete events. Returns a single disposer.
 * This is the one watcher over MCP config — callers use the same `onChange` for both
 * "does MCP need to be enabled/disabled" and "refresh an already-running manager", since
 * a single file event can mean either depending on current state.
 *
 * - **User-global file** (`~/.ballerina/copilot/mcp.json`) lives outside any
 *   workspace, so the editor's `createFileSystemWatcher` can't see it. We use
 *   `fs.watchFile` polling — reliable across atomic-save (rename) patterns
 *   that `fs.watch` would miss.
 * - **Project-tree files** (`<workspace>/.mcp.json` and each additional path)
 *   live inside the open workspace, so each gets its own editor OS-event-based
 *   watcher — no polling.
 */
export function watchMcpConfig(workspacePath: string | undefined, onChange: () => void): () => void {
    if (!fs.existsSync(COPILOT_ROOT)) {
        try { fs.mkdirSync(COPILOT_ROOT, { recursive: true }); } catch { /* ignore */ }
    }
    const listener = () => onChange();

    fs.watchFile(USER_MCP_CONFIG_PATH, { interval: 3000 }, listener);
    const disposers: Array<() => void> = [
        () => { try { fs.unwatchFile(USER_MCP_CONFIG_PATH, listener); } catch { /* ignore */ } },
    ];

    if (workspacePath) {
        for (const relative of projectMcpRelativePatterns()) {
            const filePath = path.join(path.resolve(workspacePath), relative);
            try {
                const pattern = new vscode.RelativePattern(vscode.Uri.file(workspacePath), relative);
                const watcher = vscode.workspace.createFileSystemWatcher(pattern);
                watcher.onDidChange(listener);
                watcher.onDidCreate(listener);
                watcher.onDidDelete(listener);
                disposers.push(() => watcher.dispose());
            } catch (err) {
                console.warn(`[mcp] Failed to set up workspace '${relative}' watcher, falling back to polling:`, err);
                fs.watchFile(filePath, { interval: 3000 }, listener);
                disposers.push(() => { try { fs.unwatchFile(filePath, listener); } catch { /* ignore */ } });
            }
        }
    }

    return () => {
        for (const d of disposers) { d(); }
    };
}
