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
 * The Librarian's tools: library search and docs rendering against the language server, plus the
 * read-only primitives over the docs cache. None of them emits UI events — the subagent shows as one
 * row in the transcript — and none returns rendered documentation; `library_docs` returns paths and a
 * table of contents, and the model greps and reads sections.
 */

import { tool } from "ai";
import { z } from "zod";
import { CopilotSearchLibrariesBySearchResponse } from "@wso2/ballerina-core";
import { langClient } from "../../../activator";
import { extension } from "../../../../../BalExtensionContext";
import { getMaximizedSelectedLibs } from "../../../utils/libs/function-registry";
import {
    buildVersionKey,
    ensureLibraryDocs,
    formatLibraryDocsResult,
    getLibDocsDir,
} from "../../../utils/libs/lib-docs-cache";
import { grepDocs, GREP_MAX_CONTEXT, GREP_MAX_LINES, listDocs, readDocs, READ_MAX_LINES } from "../../../utils/libs/docs-fs-tools";

export const LIBRARY_SEARCH_TOOL_NAME = "library_search";
export const LIBRARY_DOCS_TOOL_NAME = "library_docs";
export const DOCS_GREP_TOOL_NAME = "docs_grep";
export const DOCS_READ_TOOL_NAME = "docs_read";
export const DOCS_LIST_TOOL_NAME = "docs_list";

const MAX_SEARCH_KEYWORDS = 10;
const MAX_DOCS_PER_CALL = 5;
const SEARCH_TIMEOUT_MS = 60_000;
/** Large connectors compile a package in the language server; the harness settled on three minutes. */
const DOCS_FETCH_TIMEOUT_MS = 180_000;

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
        promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
    });
}

/** Both versions shape the library JSON, so both key the cache. Missing values fall back to "unknown". */
export function currentDocsDir(): string {
    const ext = extension.ballerinaExtInstance;
    let extVersion: string | undefined;
    try { extVersion = ext?.getVersion?.(); } catch { extVersion = undefined; }
    return getLibDocsDir(buildVersionKey(extVersion, ext?.ballerinaVersion));
}

/** Accepts a plain keyword, a comma/space list, or a JSON array serialised as a string (all seen in traces). */
export function parseKeywordString(raw: string): string[] {
    const text = raw.trim();
    if (text.startsWith("[")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) { return parsed.map(String); }
        } catch { /* fall through to the plain split */ }
    }
    return text.split(/[\s,]+/);
}

export function formatSearchResults(response: CopilotSearchLibrariesBySearchResponse): string {
    const libs = response.libraries ?? [];
    if (libs.length === 0) {
        return "No libraries matched. Try different, more distinctive keywords (the service or technology name), one search per system.";
    }
    return libs.map(lib => `${lib.name} — ${(lib.description ?? "").split("\n")[0].trim()}`).join("\n");
}

export function createLibrarianTools() {
    const docsDir = currentDocsDir();

    return {
        [LIBRARY_SEARCH_TOOL_NAME]: tool({
            description: `Search Ballerina Central for libraries by keyword. Keywords are OR-ed and ranked, so use 1-3 distinctive words (the service, product or technology name — "Kafka", "Salesforce", "Stripe"); never generic words like "integration", "client", "data", "message". Run one search per external system. Include "trigger" only when the brief needs to LISTEN for events. Returns "org/name — description" lines.`,
            inputSchema: z.object({
                // A bare string is accepted too: the model's first call is often `{"keywords": "xlsx"}`, and a
                // schema rejection there costs a whole round trip (seen in the headless traces).
                keywords: z.union([z.array(z.string()).min(1).max(MAX_SEARCH_KEYWORDS), z.string()]).describe("1-10 distinctive keywords (an array, or one keyword as a string)."),
            }),
            execute: async ({ keywords }) => {
                const list = Array.isArray(keywords) ? keywords : parseKeywordString(keywords);
                const cleaned = [...new Set(list.map(k => k.trim()).filter(Boolean))].slice(0, MAX_SEARCH_KEYWORDS);
                if (cleaned.length === 0) { return "No keywords given."; }
                try {
                    const response = await withTimeout(
                        langClient.getCopilotLibrariesBySearch({ keywords: cleaned }),
                        SEARCH_TIMEOUT_MS,
                        "library_search"
                    );
                    return formatSearchResults(response);
                } catch (error) {
                    return `library_search failed: ${error instanceof Error ? error.message : String(error)}. This is an internal failure, not evidence that no library exists — retry once, then report the gap.`;
                }
            },
        }),

        [LIBRARY_DOCS_TOOL_NAME]: tool({
            description: `Render the full API documentation of 1-${MAX_DOCS_PER_CALL} libraries (exact "org/name") to markdown files on disk and return each file's path plus a table of contents (clients with function counts, functions, types, services, annotations). Cached per Ballerina distribution, so repeat calls are instant. Never returns the content: follow up with ${DOCS_GREP_TOOL_NAME} / ${DOCS_READ_TOOL_NAME} on the paths.`,
            inputSchema: z.object({
                libraries: z.array(z.string()).min(1).max(MAX_DOCS_PER_CALL).describe(`Exact library names as "org/name", at most ${MAX_DOCS_PER_CALL}.`),
                refresh: z.boolean().optional().describe("Re-render even if cached. Only when a cached file looks stale or corrupt."),
            }),
            execute: async ({ libraries, refresh }) => {
                try {
                    const result = await ensureLibraryDocs(libraries, {
                        dir: docsDir,
                        refresh,
                        fetch: (names) => withTimeout(getMaximizedSelectedLibs(names), DOCS_FETCH_TIMEOUT_MS, "library_docs fetch"),
                    });
                    return formatLibraryDocsResult(result);
                } catch (error) {
                    return `library_docs failed for (${libraries.join(", ")}): ${error instanceof Error ? error.message : String(error)}. This is an internal failure, not evidence the libraries are missing — retry once, then report the gap instead of inventing API details.`;
                }
            },
        }),

        [DOCS_GREP_TOOL_NAME]: tool({
            description: `Regular-expression search over the cached library docs (all files, or one library). Returns "file:line:text" lines, capped at ${GREP_MAX_LINES} matches and 500 characters per line. Use it to find a client, function, type, annotation or phrase before reading the section around it.`,
            inputSchema: z.object({
                pattern: z.string().describe("JavaScript regular expression, case-insensitive unless case_sensitive is set."),
                library: z.string().optional().describe('Restrict to one library, as "org/name".'),
                context: z.number().int().min(0).max(GREP_MAX_CONTEXT).optional().describe(`Lines of context around each match (0-${GREP_MAX_CONTEXT}).`),
                head_limit: z.number().int().min(1).max(GREP_MAX_LINES).optional().describe(`Maximum matching lines to return (default and cap ${GREP_MAX_LINES}).`),
                case_sensitive: z.boolean().optional(),
            }),
            execute: async (input) => grepDocs(docsDir, input),
        }),

        [DOCS_READ_TOOL_NAME]: tool({
            description: `Read a line range of a cached docs file (path from ${LIBRARY_DOCS_TOOL_NAME} or ${DOCS_GREP_TOOL_NAME}). At most ${READ_MAX_LINES} lines per call; read the section you need around a grep hit, never a whole file.`,
            inputSchema: z.object({
                path: z.string().describe("Absolute path returned by library_docs, or the file name within the cache."),
                offset: z.number().int().min(1).optional().describe("1-based first line (default 1)."),
                limit: z.number().int().min(1).max(READ_MAX_LINES).optional().describe(`Lines to read (default and cap ${READ_MAX_LINES}).`),
            }),
            execute: async (input) => readDocs(docsDir, input),
        }),

        [DOCS_LIST_TOOL_NAME]: tool({
            description: "List the library docs files already in the cache, with sizes.",
            inputSchema: z.object({}),
            execute: async () => listDocs(docsDir),
        }),
    };
}
