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
 * Host-side tool wording for the ambient status surfaces (status bar, orb).
 *
 * A deliberate leaf module — `path` only, no `vscode`/RPC imports — so the mapping
 * is unit-testable. Importing AgentStatusManager itself pulls in VisualizerWebview
 * and, transitively, an ESM-only LS dependency that Jest cannot parse. Mirrors the
 * visualizer's AgentStreamView/toolDisplay.ts split.
 *
 * These labels are coarser than the panel's on purpose: they are tuned for a ~40
 * char status bar, so the three file-edit tools collapse together and query/URL
 * detail is dropped.
 */

import * as path from 'path';

export function describeToolCall(toolName: string, toolInput?: any): string {
    // The file tools emit `toolInput: { fileName }` (emitFileToolCall in
    // agent/tools/text-editor.ts), while tools that pass their raw Zod input
    // straight through — migration_source_read, the MCP bridge — carry the
    // schema's `file_path`. Read both, or file runs silently fall back to the
    // generic "Editing files" label.
    const rawFile = typeof toolInput?.fileName === 'string'
        ? toolInput.fileName
        : typeof toolInput?.file_path === 'string'
            ? toolInput.file_path
            : undefined;
    const file = rawFile ? path.basename(rawFile) : undefined;
    switch (toolName) {
        case 'file_write':
        case 'file_edit':
        case 'file_batch_edit':
            return file ? `Editing ${file}` : 'Editing files';
        case 'file_read':
            return file ? `Reading ${file}` : 'Reading files';
        case 'getCompilationErrors':
            return 'Checking for errors';
        case 'runTests':
            return 'Running tests';
        case 'runBallerinaPackage':
            return 'Running the integration';
        case 'getServiceLogs':
            return 'Reading service logs';
        case 'stopBallerinaService':
            return 'Stopping a service';
        case 'hurlRunnerTool':
            return 'Testing HTTP endpoints';
        case 'Subagent': {
            const who = subagentName(toolInput?.subagent_type);
            const what = typeof toolInput?.description === 'string' && toolInput.description.trim() ? toolInput.description.trim() : '';
            const verb = toolInput?.resume ? 'Following up with' : 'Consulting';
            const head = toolInput?.run_in_background ? `${verb} the ${who} (background)` : `${verb} the ${who}`;
            return what ? `${head}: ${what}` : head;
        }
        case 'task_output': {
            const what = typeof toolInput?.description === 'string' && toolInput.description.trim()
                ? toolInput.description.trim()
                : 'a background task';
            return toolInput?.block === false ? 'Checking a background task' : `Waiting for ${what}`;
        }
        case 'kill_task':
            return 'Stopping a background task';
        case 'ConnectorGeneratorTool':
            return 'Generating a connector';
        case 'ConfigCollector':
            return 'Managing configuration';
        case 'Clarify':
            return 'Preparing a question';
        case 'TaskWrite':
            return 'Planning tasks';
        case 'web_search':
            return 'Searching the web';
        case 'web_fetch':
            return 'Reading a web page';
        case 'invoke_skill':
            return 'Loading a skill';
        default:
            if (toolName.startsWith('mcp__')) {
                const parts = toolName.split('__');
                return `Using ${parts[2] ?? toolName}`;
            }
            return `Running ${toolName}`;
    }
}

/** "Librarian" / "Library Researcher" — the subagent as the status line names it. */
export function subagentName(subagentType: unknown): string {
    return subagentType === 'LibraryResearcher' ? 'Library Researcher' : 'Librarian';
}

/**
 * Status-line wording for a partial `tool_result` (a progress report, not the call's final result).
 * Returns undefined for a final result, so the status line keeps whatever the last tool call set.
 * Only the Subagent tool sends partial results today; a new tool that does adds its own case here.
 */
export function describeToolResultProgress(result: { toolName: string; toolOutput?: any; partial?: boolean }): string | undefined {
    if (!result.partial) {
        return undefined;
    }
    const { toolOutput } = result;
    if (result.toolName === 'Subagent') {
        const who = subagentName(toolOutput?.subagent_type);
        const what = typeof toolOutput?.description === 'string' && toolOutput.description.trim() ? toolOutput.description.trim() : '';
        if (toolOutput?.status === 'started') {
            return what ? `${who} running in background: ${what}` : `${who} running in background`;
        }
        const progress = typeof toolOutput?.progress === 'string' && toolOutput.progress.trim() ? toolOutput.progress.trim() : what;
        return progress ? `${who}: ${progress}` : `Consulting the ${who}`;
    }
    return describeToolCall(result.toolName, toolOutput);
}
