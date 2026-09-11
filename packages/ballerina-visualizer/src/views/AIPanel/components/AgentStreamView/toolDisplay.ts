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

/**
 * Tool-step display vocabulary: how each agent tool is named, worded, and
 * iconified in the UI.
 *
 * A leaf module by design — no React, no styled-components, no RPC client — so
 * that its consumers (the transcript rows in StreamEntry, and the chat
 * composer's loading indicator in AIChat) share one wording table, and so the
 * pure mapping can be unit-tested without a DOM. The visualizer package's jsdom
 * environment is currently broken; tests here run under `--env=node`.
 */
export const COMMAND_OUTPUT_TOOLS = new Set(["runBallerinaPackage", "runTests", "getServiceLogs", "stopBallerinaService"]);

// ── Tool icon mapping ─────────────────────────────────────────────────────────

interface ToolIconEntry { loading: string; done?: string; }

const TOOL_ICON_MAP: Record<string, ToolIconEntry> = {
    file_read:                     { loading: "codicon-go-to-file" },
    file_write:                    { loading: "codicon-edit" },
    file_edit:                     { loading: "codicon-edit" },
    file_batch_edit:               { loading: "codicon-edit" },
    Subagent:                      { loading: "codicon-package" },
    task_output:                   { loading: "codicon-clock" },
    kill_task:                     { loading: "codicon-debug-stop" },
    web_search:                    { loading: "codicon-search" },
    web_fetch:                     { loading: "codicon-globe" },
    runTests:                      { loading: "codicon-beaker" },
    runBallerinaPackage:           { loading: "codicon-play" },
    getServiceLogs:                { loading: "codicon-output" },
    stopBallerinaService:          { loading: "codicon-debug-stop" },
    getCompilationErrors:          { loading: "codicon-pulse", done: "codicon-pass-filled" },
    TaskWrite:                     { loading: "codicon-checklist" },
    ConfigCollector:               { loading: "codicon-settings-gear" },
    ConnectorGeneratorTool:        { loading: "codicon-plug" },
    invoke_skill:                  { loading: "codicon-book" },
    migration_source_list:         { loading: "codicon-folder-opened" },
    migration_source_read:         { loading: "codicon-go-to-file" },
    // TODO(auto-memory): temporarily disabled for this release.
    // save_memory:                   { loading: "codicon-bookmark" },
    // delete_memory:                 { loading: "codicon-trash" },
    // consolidate_memories:          { loading: "codicon-sync" },
};
const DEFAULT_TOOL_ICON = "codicon-symbol-property";
const MCP_TOOL_PREFIX = "mcp__";
const MCP_TOOL_ICON = "codicon-plug";

export function getToolIcon(toolName: string | undefined, state: "loading" | "done" = "loading"): string {
    if (toolName && toolName.startsWith(MCP_TOOL_PREFIX)) return MCP_TOOL_ICON;
    const entry = toolName ? TOOL_ICON_MAP[toolName] : undefined;
    if (!entry) return DEFAULT_TOOL_ICON;
    return state === "done" ? (entry.done ?? entry.loading) : entry.loading;
}

export function parseMcpName(toolName: string): { server: string; tool: string } | null {
    if (!toolName.startsWith(MCP_TOOL_PREFIX)) return null;
    const rest = toolName.slice(MCP_TOOL_PREFIX.length);
    const sepIdx = rest.indexOf("__");
    if (sepIdx <= 0) return null;
    return { server: rest.slice(0, sepIdx), tool: rest.slice(sepIdx + 2) };
}

export function getToolResultIcon(toolName: string | undefined, toolOutput: any): string {
    if (toolName === "getCompilationErrors") {
        const count = toolOutput?.diagnostics?.length ?? 0;
        return count > 0 ? "codicon-warning" : "codicon-pass-filled";
    }
    return getToolIcon(toolName, "done");
}

// ── Tool display helpers ───────────────────────────────────────────────────────

/** The Subagent row is labelled from the model's `description`; the type is the fallback. */
function subagentLabel(payload: any): string {
    const desc = typeof payload?.description === "string" ? payload.description.trim() : "";
    if (desc) return desc.charAt(0).toUpperCase() + desc.slice(1);
    return payload?.subagent_type === "LibraryResearcher" ? "Researching libraries" : "Looking up libraries";
}

/** "Librarian" / "Library Researcher" — how the rows name the subagent. */
export function subagentName(payload: any): string {
    return payload?.subagent_type === "LibraryResearcher" ? "Library Researcher" : "Librarian";
}

/**
 * A `tool_result` that is a progress report, not the call's final result (`partial` on the event and
 * on the persisted item). Rows for these keep spinning and the composer indicator keeps its entry.
 */
export function isToolResultInProgress(result: { partial?: boolean } | undefined): boolean {
    return result?.partial === true;
}

export function getFileName(filePath: string | undefined): string {
    if (!filePath) return "file";
    const i = filePath.lastIndexOf("/");
    return i !== -1 ? filePath.substring(i + 1) : filePath;
}

/**
 * How a tool step is worded in the UI. `detail` is a fragment meant to follow
 * `label` — a filename, query, or path. Exported alongside getToolCallDisplay,
 * which the chat composer's loading indicator also consumes.
 */
export interface ToolCallDisplay {
    label: string;
    detail?: string;
}

export function getToolCallDisplay(toolName: string | undefined, toolInput: any): ToolCallDisplay {
    if (toolName) {
        const mcp = parseMcpName(toolName);
        if (mcp) return { label: `Calling ${mcp.server} · ${mcp.tool}...` };
    }
    switch (toolName) {
        case "file_read":    return { label: "Reading",   detail: getFileName(toolInput?.fileName) + "..." };
        case "file_write":   return { label: "Creating",  detail: getFileName(toolInput?.fileName) + "..." };
        case "file_edit":
        case "file_batch_edit": return { label: "Updating", detail: getFileName(toolInput?.fileName) + "..." };
        case "TaskWrite":    return { label: "Planning..." };
        case "Subagent": {
            const who = subagentName(toolInput);
            const bg = toolInput?.run_in_background ? " (background)" : "";
            const verb = toolInput?.resume ? "Following up with" : "Consulting";
            const what = typeof toolInput?.description === "string" && toolInput.description.trim() ? toolInput.description.trim() : "";
            return { label: what ? `${verb} the ${who}${bg} — ${what}...` : `${verb} the ${who}${bg}...` };
        }
        case "task_output": {
            const what = typeof toolInput?.description === "string" && toolInput.description.trim() ? toolInput.description.trim() : "background task";
            return { label: toolInput?.block === false ? `Checking: ${what}...` : `Waiting for: ${what}...` };
        }
        case "kill_task": return { label: "Stopping background task..." };
        case "getCompilationErrors": return { label: "Checking for errors..." };
        case "ConfigCollector": return { label: "Reading config..." };
        case "Clarify": return { label: "Waiting for answers..." };
        case "ConnectorGeneratorTool": return { label: "Generating connector..." };
        case "runTests": return { label: "Running tests..." };
        case "hurlRunnerTool": return { label: "Sending HTTP request..." };
        case "runBallerinaPackage": return { label: `Running ${toolInput?.runType === "service" ? "service" : "program"}...` };
        case "getServiceLogs": return { label: "Fetching logs..." };
        case "stopBallerinaService": return { label: "Stopping service..." };
        case "web_search": return { label: toolInput?.query ? "Searching the web:" : "Searching the web...", detail: toolInput?.query };
        case "web_fetch":  return { label: toolInput?.url ? "Fetching from web:" : "Fetching from web...", detail: toolInput?.url };
        case "invoke_skill": return { label: toolInput?.skillName ? `Loading skill: ${toolInput.skillName}` : "Loading skill..." };
        case "migration_source_list": return { label: toolInput?.directory_path ? "Listing source:" : "Listing source directory...", detail: toolInput?.directory_path };
        case "migration_source_read": return { label: toolInput?.file_path ? "Reading source:" : "Reading source file...", detail: toolInput?.file_path };
        // TODO(auto-memory): temporarily disabled for this release.
        // case "save_memory":          return { label: "Saving to memory..." };
        // case "delete_memory":        return { label: "Removing from memory..." };
        // case "consolidate_memories": return { label: "Consolidating memories..." };
        default: return { label: "Working..." };
    }
}

export function getToolResultDisplay(toolName: string | undefined, toolOutput: any, hint?: string): ToolCallDisplay {
    if (toolName) {
        const mcp = parseMcpName(toolName);
        if (mcp) return { label: `${mcp.server} · ${mcp.tool}` };
    }
    switch (toolName) {
        case "file_read":    return { label: "Read",    detail: getFileName(toolOutput?.fileName) };
        case "file_write":   return { label: toolOutput?.action === "updated" ? "Updated" : "Created", detail: getFileName(toolOutput?.fileName) };
        case "file_edit":
        case "file_batch_edit": return { label: "Updated", detail: getFileName(toolOutput?.fileName) };
        case "TaskWrite":    return { label: "Plan ready" };
        case "Subagent": {
            const what = subagentLabel(toolOutput);
            switch (toolOutput?.status) {
                case "started": return { label: `${subagentName(toolOutput)} running in background — ${what}` };
                case "running": {
                    const progress = typeof toolOutput?.progress === "string" && toolOutput.progress.trim() ? toolOutput.progress.trim() : what;
                    const step = typeof toolOutput?.step === "number" ? ` (step ${toolOutput.step})` : "";
                    return { label: `Consulting the ${subagentName(toolOutput)}${toolOutput?.background ? " (background)" : ""} — ${progress}${step}...` };
                }
                case "aborted": return { label: `${what} — stopped` };
                case "failed": return { label: `${what} — failed` };
                default: {
                    const names: string[] = Array.isArray(toolOutput?.libraries) ? toolOutput.libraries : [];
                    return { label: names.length > 0 ? `${what} — found:` : `${what} — done`, detail: names.length > 0 ? names.join(", ") : undefined };
                }
            }
        }
        case "task_output": {
            const what = typeof toolOutput?.description === "string" && toolOutput.description.trim() ? toolOutput.description.trim() : "Background task";
            switch (toolOutput?.status) {
                case "running": return { label: `${what} — still running` };
                case "not_found": return { label: "Background task not found" };
                case "aborted": return { label: `${what} — stopped` };
                case "failed": return { label: `${what} — failed` };
                default: return { label: `${what} — result received` };
            }
        }
        case "kill_task": return { label: toolOutput?.status === "not_found" ? "Background task not found" : "Background task stopped" };
        case "getCompilationErrors": {
            const count = toolOutput?.diagnostics?.length ?? 0;
            return { label: count > 0 ? `Found ${count} error(s)` : "No issues found" };
        }
        case "ConfigCollector": return { label: "Config loaded" };
        case "Clarify": return { label: toolOutput?.skipped ? "Questions skipped" : "Questions answered" };
        case "ConnectorGeneratorTool": return { label: "Connector ready" };
        case "runTests": return { label: toolOutput?.summary ?? "Tests completed" };
        case "hurlRunnerTool": return { label: "HTTP request completed" };
        case "runBallerinaPackage": {
            const status = toolOutput?.status ?? "completed";
            return { label: status === "started" ? "Service started" : status === "completed" ? "Program completed" : status === "timeout" ? "Program timed out" : "Run failed" };
        }
        case "getServiceLogs": {
            const status = toolOutput?.status ?? "running";
            return { label: status === "exited" ? "Service exited" : status === "not_found" ? "Service not found" : "Logs retrieved" };
        }
        case "stopBallerinaService": {
            const status = toolOutput?.status ?? "stopped";
            return { label: status === "stopped" ? "Service stopped" : status === "already_exited" ? "Service already exited" : "Service not found" };
        }
        case "web_search": return { label: hint ? "Web search:" : "Web search completed", detail: hint };
        case "web_fetch":  return { label: hint ? "Web fetch:" : "Web fetch completed",  detail: hint };
        case "invoke_skill": return { label: toolOutput?.found ? `Using skill: ${toolOutput.skillName}` : `Skill not found: ${toolOutput?.message ?? ""}` };
        case "migration_source_list": return { label: toolOutput?.success ? "Source listed:" : "Failed to list source", detail: toolOutput?.directory_path };
        case "migration_source_read": return { label: toolOutput?.success ? (toolOutput?.file_path ? "Source read:" : "Source read") : "Failed to read source", detail: toolOutput?.file_path };
        // TODO(auto-memory): temporarily disabled for this release.
        // case "save_memory": {
        //     if (toolOutput?.action === 'error') return { label: "Memory save failed" };
        //     const scope = toolOutput?.scope === 'global' ? 'Global' : 'Project';
        //     return { label: `${scope} memory saved`, detail: toolOutput?.name };
        // }
        // case "delete_memory": {
        //     if (toolOutput?.action === 'error') return { label: "Memory removal failed" };
        //     const scope = toolOutput?.scope === 'global' ? 'Global' : 'Project';
        //     return { label: `${scope} memory removed`, detail: toolOutput?.filename };
        // }
        // case "consolidate_memories":
        //     return { label: toolOutput?.action === 'error' ? "Consolidation failed" : "Memories consolidated" };
        default: return { label: "Done" };
    }
}
