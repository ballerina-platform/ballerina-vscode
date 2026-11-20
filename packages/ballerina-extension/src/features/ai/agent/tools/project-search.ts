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

import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";
import { CopilotEventHandler } from "../../utils/events";
import { isSafeGrepPattern } from "../../utils/libs/docs-fs-tools";
import { MAX_LINE_LENGTH, RecoverableAgentError, VALID_FILE_EXTENSIONS } from "./path-utils";
import { listProjectFiles } from "./project-files";

export const GLOB_TOOL_NAME = "glob";
export const GREP_TOOL_NAME = "grep";

export const MAX_RESULT_LINES = 200;
export const MAX_RESULT_CHARS = 20_000;
export const MAX_GREP_FILE_BYTES = 1024 * 1024;
const MAX_PRINTED_LINE_CHARS = 500;
const MAX_CONTEXT_LINES = 5;
export const GREP_TIME_BUDGET_MS = 3000;

// In a vm so a timeout can stop a pattern that backtracks badly on a long line.
const MATCH_LINES = new vm.Script(`(() => {
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (regex.test(line.length > maxChars ? line.slice(0, maxChars) : line)) {
            hits.push(i);
            if (firstOnly) { break; }
        }
    }
    return hits;
})()`);

export interface SearchResult {
    success: boolean;
    message: string;
}

// For the chat row only; the model gets just `message`.
export interface SearchFacts {
    count?: number;
    unit?: "files" | "lines";
    capped?: boolean;
    aborted?: boolean;
    failed?: boolean;
}

class OutputBuffer {
    readonly lines: string[] = [];
    private chars = 0;
    full = false;

    push(line: string): boolean {
        if (this.lines.length >= MAX_RESULT_LINES || this.chars + line.length + 1 > MAX_RESULT_CHARS) {
            this.full = true;
            return false;
        }
        this.lines.push(line);
        this.chars += line.length + 1;
        return true;
    }
}

function errorResult(error: unknown): SearchResult & SearchFacts {
    if (error instanceof RecoverableAgentError) {
        return { success: false, message: error.message };
    }
    console.error("[ProjectSearch] Unexpected error:", error);
    return { success: false, message: `Search failed: ${error instanceof Error ? error.message : String(error)}`, failed: true };
}

function scopeSuffix(scope?: string): string {
    return scope ? ` in ${scope}` : "";
}

function emptyPatternResult(): SearchResult {
    return { success: false, message: "The pattern is empty. Give a pattern to search for." };
}

export async function globProject(root: string, input: { pattern: string; path?: string }): Promise<SearchResult & SearchFacts> {
    if (!input.pattern?.trim()) {
        return emptyPatternResult();
    }
    try {
        const files = await listProjectFiles(root, { pattern: input.pattern, path: input.path });
        if (files.length === 0) {
            return { success: true, message: `No files match ${input.pattern}${scopeSuffix(input.path)}.`, count: 0 };
        }
        const out = new OutputBuffer();
        for (const file of files) {
            if (!out.push(file)) {
                break;
            }
        }
        if (out.full) {
            console.log(`[GlobTool] Output capped: ${files.length} files matched.`);
            out.lines.push(`[Output capped at ${out.lines.length} of ${files.length} files. Narrow the pattern or path.]`);
        }
        return { success: true, message: out.lines.join("\n"), count: files.length };
    } catch (error) {
        return errorResult(error);
    }
}

export interface GrepInput {
    pattern: string;
    path?: string;
    glob?: string;
    output_mode?: "files_with_matches" | "content";
    context?: number;
    case_insensitive?: boolean;
}

function fileSample(files: string[]): string {
    return `${files.slice(0, 5).join(", ")}${files.length > 5 ? ", …" : ""}`;
}

function printable(line: string): string {
    return line.length > MAX_PRINTED_LINE_CHARS ? `${line.slice(0, MAX_PRINTED_LINE_CHARS)}…` : line;
}

export async function grepProject(root: string, input: GrepInput, abortSignal?: AbortSignal): Promise<SearchResult & SearchFacts> {
    // Models used to ripgrep start a pattern with (?i), which JavaScript rejects.
    const inlineIgnoreCase = input.pattern?.startsWith("(?i)") ?? false;
    const source = inlineIgnoreCase ? input.pattern.slice(4) : input.pattern;
    if (!source?.trim()) {
        return emptyPatternResult();
    }
    if (!isSafeGrepPattern(source)) {
        return {
            success: false,
            message: `Rejected pattern /${input.pattern}/: it is too long or can backtrack badly (a repetition nested in another repetition, a backreference, or a repeated group whose alternatives start with the same character). Simplify it, for example (a+)+ to a+, or (a|ab)+ to a[b]?.`,
        };
    }
    let regex: RegExp;
    try {
        regex = new RegExp(source, input.case_insensitive || inlineIgnoreCase ? "i" : "");
    } catch (error) {
        return { success: false, message: `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}` };
    }

    let files: string[];
    try {
        files = await listProjectFiles(root, { path: input.path, pattern: input.glob, matchBase: true });
    } catch (error) {
        return errorResult(error);
    }

    const contentMode = input.output_mode === "content";
    const context = contentMode ? Math.min(Math.max(Math.trunc(input.context ?? 0), 0), MAX_CONTEXT_LINES) : 0;
    const rootPath = path.resolve(root);
    const out = new OutputBuffer();
    const skipped: string[] = [];
    const unreadable: string[] = [];
    const matchContext = vm.createContext({ regex, maxChars: MAX_LINE_LENGTH, lines: [] as string[], firstOnly: false });
    let matchingMs = 0;
    let timedOutAt = -1;
    let matched = 0;

    for (const file of files) {
        if (abortSignal?.aborted) {
            return { success: false, message: "Search stopped.", aborted: true };
        }
        const fullPath = path.join(rootPath, file);
        let lines: string[];
        try {
            if ((await fs.promises.stat(fullPath)).size > MAX_GREP_FILE_BYTES) {
                skipped.push(file);
                continue;
            }
            lines = (await fs.promises.readFile(fullPath, "utf8")).split(/\r?\n/);
        } catch {
            unreadable.push(file);
            continue;
        }

        const remainingMs = GREP_TIME_BUDGET_MS - matchingMs;
        let hits: number[];
        const started = Date.now();
        try {
            matchContext.lines = lines;
            matchContext.firstOnly = !contentMode;
            hits = MATCH_LINES.runInContext(matchContext, { timeout: Math.max(1, remainingMs) });
        } catch (error) {
            if ((error as { code?: string }).code !== "ERR_SCRIPT_EXECUTION_TIMEOUT") {
                throw error;
            }
            console.log(`[GrepTool] Stopped after ${GREP_TIME_BUDGET_MS} ms.`);
            timedOutAt = files.indexOf(file);
            break;
        } finally {
            matchingMs += Date.now() - started;
            matchContext.lines = [];
        }

        if (!contentMode) {
            if (hits.length > 0) {
                if (!out.push(file)) {
                    break;
                }
                matched++;
            }
            continue;
        }

        const hitSet = new Set(hits);
        let lastPrinted = -1;
        for (const i of hits) {
            if (out.full) {
                break;
            }
            const from = Math.max(0, i - context);
            const to = Math.min(lines.length - 1, i + context);
            if (context > 0 && out.lines.length > 0 && (lastPrinted < 0 || from > lastPrinted + 1)) {
                out.push("--");
            }
            for (let j = Math.max(from, lastPrinted + 1); j <= to; j++) {
                const sep = hitSet.has(j) ? ":" : "-";
                if (!out.push(`${file}${sep}${j + 1}${sep}${printable(lines[j])}`)) {
                    break;
                }
                if (sep === ":") {
                    matched++;
                }
            }
            lastPrinted = Math.max(lastPrinted, to);
        }
        if (out.full) {
            break;
        }
    }

    const notes: string[] = [];
    if (timedOutAt >= 0) {
        notes.push(`[Search stopped after ${timedOutAt} of ${files.length} files: it ran longer than ${GREP_TIME_BUDGET_MS / 1000} seconds, so results are partial. Simplify the pattern (avoid stacked repeats such as .*.* or \\w+\\w+) or narrow path or glob.]`);
    }
    if (out.full) {
        console.log(`[GrepTool] Output capped.`);
        notes.push(`[Output capped at ${out.lines.length} lines. Narrow the pattern, path or glob.]`);
    }
    if (skipped.length > 0) {
        console.log(`[GrepTool] Skipped ${skipped.length} file(s) over ${MAX_GREP_FILE_BYTES} bytes.`);
        notes.push(`[Skipped ${skipped.length} file(s) over 1 MB: ${fileSample(skipped)}. Read them with file_read and offset/limit.]`);
    }
    if (unreadable.length > 0) {
        notes.push(`[Could not read ${unreadable.length} file(s): ${fileSample(unreadable)}.]`);
    }
    const facts: SearchFacts = { count: matched, unit: contentMode ? "lines" : "files", capped: out.full || timedOutAt >= 0 || undefined };
    if (out.lines.length === 0) {
        return { success: true, message: [`No matches for /${input.pattern}/${scopeSuffix(input.path)}.`, ...notes].join("\n"), ...facts };
    }
    return { success: true, message: [...out.lines, ...notes].join("\n"), ...facts };
}

export function createGlobTool(eventHandler: CopilotEventHandler, root: string) {
    return tool({
        description: `Finds project files by name with a glob pattern, for example "**/*.bal" or "pkg1/modules/**/*.bal".
    - Standard glob rules: "*.bal" matches only the top level; use "**/*.bal" for any depth.
    - Returns paths relative to the project root, sorted, at most ${MAX_RESULT_LINES}.
    - Only ${VALID_FILE_EXTENSIONS.join(", ")} files are visible.
    - Hidden files (other than .agents/), Config.toml and the target/ build folder are never listed.`,
        inputSchema: z.object({
            pattern: z.string().describe("Glob pattern, relative to path if given, otherwise to the project root"),
            path: z.string().optional().describe("File or directory to search in, relative to the project root (e.g. \"pkg1\")"),
        }),
        execute: async (input: { pattern: string; path?: string }, options?: { toolCallId?: string }) => {
            const toolCallId = options?.toolCallId;
            eventHandler({ type: "tool_call", toolName: GLOB_TOOL_NAME, toolCallId, toolInput: { pattern: input.pattern, path: input.path } });
            const { success, message, failed, ...facts } = await globProject(root, input);
            eventHandler({ type: "tool_result", toolName: GLOB_TOOL_NAME, toolCallId, failed, toolOutput: { success, pattern: input.pattern, path: input.path, ...facts } });
            return { success, message };
        },
    });
}

export function createGrepTool(eventHandler: CopilotEventHandler, root: string) {
    return tool({
        description: `Searches the content of project files with a regular expression (JavaScript syntax).
    - output_mode "files_with_matches" (default) returns the paths of matching files; "content" returns matching lines as path:line:text, with optional context lines as path-line-text.
    - Narrow the search with path (a file or directory) and glob (a file filter such as "*.bal" or "tests/**"; a filter without "/" matches file names at any depth).
    - Case-sensitive unless case_insensitive is true.
    - Returns at most ${MAX_RESULT_LINES} lines. Only the first ${MAX_LINE_LENGTH} characters of each line are searched, and files over 1 MB are skipped.
    - Patterns that can backtrack badly (nested repetition such as (a+)+, backreferences) are rejected, and a search that runs longer than ${GREP_TIME_BUDGET_MS / 1000} seconds is stopped.
    - Searches the same files glob can list: only ${VALID_FILE_EXTENSIONS.join(", ")} files.`,
        inputSchema: z.object({
            pattern: z.string().describe("Regular expression to search for"),
            path: z.string().optional().describe("File or directory to search in, relative to the project root"),
            glob: z.string().optional().describe("File filter, e.g. \"*.bal\""),
            output_mode: z.enum(["files_with_matches", "content"]).optional().describe("\"files_with_matches\" (default) or \"content\""),
            // Not capped in the schema: a rejected call shows as a failed row, and grepProject clamps it anyway.
            context: z.number().optional().describe(`Lines of context around each match (at most ${MAX_CONTEXT_LINES}), content mode only`),
            case_insensitive: z.boolean().optional().describe("Match case-insensitively"),
        }),
        execute: async (input: GrepInput, options?: { abortSignal?: AbortSignal; toolCallId?: string }) => {
            const toolCallId = options?.toolCallId;
            eventHandler({ type: "tool_call", toolName: GREP_TOOL_NAME, toolCallId, toolInput: { pattern: input.pattern, path: input.path, glob: input.glob } });
            const { success, message, failed, ...facts } = await grepProject(root, input, options?.abortSignal);
            eventHandler({ type: "tool_result", toolName: GREP_TOOL_NAME, toolCallId, failed, toolOutput: { success, pattern: input.pattern, path: input.path, glob: input.glob, ...facts } });
            return { success, message };
        },
    });
}
