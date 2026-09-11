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
 * Read-only file primitives scoped to the library docs cache.
 *
 * Node implementations (a JavaScript regex over a handful of markdown files), so no ripgrep dependency.
 * Every path is resolved and must stay inside the cache directory; anything else is rejected before any
 * file system access. Output is capped the way the MI Copilot caps its grep so a careless pattern cannot
 * flood the subagent's context.
 */

import * as fs from "fs";
import * as path from "path";
import { libDocsFileName } from "./lib-docs-cache";

export const GREP_MAX_LINES = 100;
export const GREP_MAX_LINE_CHARS = 500;
export const GREP_MAX_CONTEXT = 5;
export const READ_MAX_LINES = 500;

export interface DocsGrepInput {
    pattern: string;
    /** `org/name` to restrict the search to one library's file. */
    library?: string;
    /** Lines of context around each match, 0–GREP_MAX_CONTEXT. */
    context?: number;
    head_limit?: number;
    case_sensitive?: boolean;
}

export interface DocsReadInput {
    path: string;
    /** 1-based first line. */
    offset?: number;
    limit?: number;
}

/**
 * Resolves `p` (absolute, or relative to `dir`) and rejects anything that escapes `dir`.
 * Symlinks are resolved too, so a planted link cannot point outside the cache.
 */
export function resolveDocsPath(dir: string, p: string): string {
    const root = fs.existsSync(dir) ? fs.realpathSync(dir) : path.resolve(dir);
    const candidate = path.isAbsolute(p) ? path.resolve(p) : path.resolve(root, p);
    const real = fs.existsSync(candidate) ? fs.realpathSync(candidate) : candidate;
    const rel = path.relative(root, real);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new Error(`Path is outside the library docs cache: ${p}`);
    }
    return real;
}

function listDocFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) { return []; }
    return fs.readdirSync(dir)
        .filter(f => f.endsWith(".md"))
        .sort()
        .map(f => path.join(dir, f));
}

function truncateLine(line: string): string {
    return line.length > GREP_MAX_LINE_CHARS ? `${line.slice(0, GREP_MAX_LINE_CHARS)}…` : line;
}

export function grepDocs(dir: string, input: DocsGrepInput): string {
    let regex: RegExp;
    try {
        regex = new RegExp(input.pattern, input.case_sensitive ? "" : "i");
    } catch (error) {
        return `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`;
    }
    const limit = Math.min(Math.max(input.head_limit ?? GREP_MAX_LINES, 1), GREP_MAX_LINES);
    const context = Math.min(Math.max(input.context ?? 0, 0), GREP_MAX_CONTEXT);

    let files: string[];
    if (input.library) {
        const file = path.join(dir, libDocsFileName(input.library));
        if (!fs.existsSync(file)) {
            return `No cached docs for ${input.library}. Call library_docs first.`;
        }
        files = [file];
    } else {
        files = listDocFiles(dir);
        if (files.length === 0) { return "The docs cache is empty. Call library_docs first."; }
    }

    const out: string[] = [];
    let matches = 0;
    let truncated = false;
    for (const file of files) {
        if (truncated) { break; }
        const lines = fs.readFileSync(file, "utf8").split("\n");
        const label = path.basename(file);
        let lastPrinted = -1;
        for (let i = 0; i < lines.length; i++) {
            if (!regex.test(lines[i])) { continue; }
            matches++;
            if (matches > limit) { truncated = true; break; }
            const from = Math.max(0, i - context);
            const to = Math.min(lines.length - 1, i + context);
            if (context > 0 && lastPrinted >= 0 && from > lastPrinted + 1) { out.push("--"); }
            for (let j = Math.max(from, lastPrinted + 1); j <= to; j++) {
                const marker = j === i ? ":" : "-";
                out.push(`${label}:${j + 1}${marker}${truncateLine(lines[j])}`);
            }
            lastPrinted = Math.max(lastPrinted, to);
        }
    }

    if (matches === 0) {
        return `No matches for /${input.pattern}/${input.library ? ` in ${input.library}` : ""}.`;
    }
    if (truncated) {
        out.push(`… output capped at ${limit} matching lines. Narrow the pattern or set library.`);
    }
    return out.join("\n");
}

export function readDocs(dir: string, input: DocsReadInput): string {
    let file: string;
    try {
        file = resolveDocsPath(dir, input.path);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    if (!fs.existsSync(file)) { return `File not found: ${input.path}`; }
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const offset = Math.max(1, input.offset ?? 1);
    const limit = Math.min(Math.max(input.limit ?? READ_MAX_LINES, 1), READ_MAX_LINES);
    const start = offset - 1;
    if (start >= lines.length) {
        return `Offset ${offset} is past the end of the file (${lines.length} lines).`;
    }
    const end = Math.min(lines.length, start + limit);
    const body = lines.slice(start, end).map((l, idx) => `${start + idx + 1}\t${truncateLine(l)}`).join("\n");
    const tail = end < lines.length
        ? `\n… ${lines.length - end} more lines. Continue with offset=${end + 1}.`
        : "";
    return `${path.basename(file)} lines ${offset}-${end} of ${lines.length}\n${body}${tail}`;
}

export function listDocs(dir: string): string {
    const files = listDocFiles(dir);
    if (files.length === 0) { return "The docs cache is empty. Call library_docs first."; }
    return files.map(f => {
        const size = fs.statSync(f).size;
        return `${path.basename(f)}  (${Math.round(size / 1024)} KB)  ${f}`;
    }).join("\n");
}
