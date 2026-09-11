// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * Progress wording for a running subagent — a leaf module (no SDK, no VS Code) so it is unit-testable.
 *
 * A Librarian run is a black box of 20–70 s from the user's side: the Subagent row spins with the
 * model's five-word description and nothing else moves. The runner reports each finished step through
 * `onProgress`, and the Subagent tool re-emits it as a `tool_result` with `status: "running"` on the same
 * tool call, so the row (and the status bar) can say what the subagent is doing right now.
 */

export interface SubagentStepCall {
    toolName: string;
    input?: unknown;
}

export interface SubagentProgress {
    /** 1-based step number. */
    step: number;
    /** Short, present-tense activity, no trailing punctuation: "reading ballerinax/kafka docs". */
    activity: string;
}

const MAX_NAMES = 2;

function str(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function libraryFromDocsPath(p: string | undefined): string | undefined {
    if (!p) { return undefined; }
    const base = p.split(/[\\/]/).pop() ?? p;
    const m = /^([a-z0-9._-]+)__([a-z0-9._-]+)\.md$/i.exec(base);
    return m ? `${m[1]}/${m[2]}` : undefined;
}

function joinNames(names: string[]): string {
    const shown = names.slice(0, MAX_NAMES);
    const more = names.length - shown.length;
    return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

/** One phrase per tool call; the caller joins them. */
export function describeSubagentToolCall(call: SubagentStepCall): string {
    const input = (call.input ?? {}) as Record<string, unknown>;
    switch (call.toolName) {
        case "library_search": {
            const raw = input.keywords;
            const words = Array.isArray(raw) ? raw.map(String) : str(raw) ? [String(raw)] : [];
            return words.length > 0 ? `searching Central for ${joinNames(words)}` : "searching Central";
        }
        case "library_docs": {
            const libs = Array.isArray(input.libraries) ? input.libraries.map(String) : [];
            return libs.length > 0 ? `rendering docs for ${joinNames(libs)}` : "rendering library docs";
        }
        case "docs_grep": {
            const lib = str(input.library);
            return lib ? `searching ${lib} docs` : "searching the docs";
        }
        case "docs_read": {
            const lib = libraryFromDocsPath(str(input.path));
            return lib ? `reading ${lib} docs` : "reading the docs";
        }
        case "docs_list":
            return "listing cached docs";
        case "web_search":
            return "searching the web";
        case "web_fetch":
            return "fetching a web page";
        default:
            return `running ${call.toolName}`;
    }
}

/**
 * The activity for one finished step. Several calls in one step (the model greps and reads in
 * parallel) collapse to distinct phrases joined with ", "; a step with no tool calls is the report.
 */
export function describeSubagentStep(calls: SubagentStepCall[], step: number): SubagentProgress {
    if (calls.length === 0) {
        return { step, activity: "writing the report" };
    }
    const phrases = [...new Set(calls.map(describeSubagentToolCall))];
    return { step, activity: phrases.join(", ") };
}
