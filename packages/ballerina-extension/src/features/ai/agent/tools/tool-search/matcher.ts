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

/*
 * Matches a tool_search query against the deferred-tool catalog. Pure: no vscode, no SDK.
 *
 * Query forms:
 * - `select:a,b,c`  Exact names, case-insensitive, in the order given. Unknown names are skipped
 *                   and the result is not capped by maxResults.
 * - `notebook jupyter`  Keywords. Each tool is scored by term hits in its name (split on `_`, `-`
 *                   and camelCase, so `mcp__github__create_issue` yields mcp/github/create/issue),
 *                   weighted above hits in its description. Tools scoring above zero are returned
 *                   best first, ties by name, capped at maxResults.
 * - `+slack send`   A `+term` is required: a tool must contain every `+term` in its name or
 *                   description. All terms, required or not, then rank the survivors.
 * - A query equal to a tool's full name returns that tool first, then any other keyword matches.
 */

export interface SearchableTool {
    name: string;
    description: string;
}

const SELECT_PREFIX = "select:";

// Per-term weights. A name hit always outranks a description hit.
const NAME_PART_EXACT = 10;
const NAME_PARTIAL = 5;
const DESCRIPTION_WORD = 2;
const DESCRIPTION_PARTIAL = 1;

/** Splits text into lowercase words on non-alphanumerics and camelCase boundaries. */
function words(text: string): string[] {
    return text
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

interface IndexedTool {
    name: string;
    lowerName: string;
    nameParts: string[];
    lowerDescription: string;
    descriptionWords: Set<string>;
}

function scoreTerm(term: string, tool: IndexedTool): number {
    let score = 0;
    if (tool.nameParts.includes(term)) {
        score += NAME_PART_EXACT;
    } else if (tool.lowerName.includes(term)) {
        score += NAME_PARTIAL;
    }
    if (tool.descriptionWords.has(term)) {
        score += DESCRIPTION_WORD;
    } else if (tool.lowerDescription.includes(term)) {
        score += DESCRIPTION_PARTIAL;
    }
    return score;
}

function index(tool: SearchableTool): IndexedTool {
    const description = tool.description ?? "";
    return {
        name: tool.name,
        lowerName: tool.name.toLowerCase(),
        nameParts: words(tool.name),
        lowerDescription: description.toLowerCase(),
        descriptionWords: new Set(words(description)),
    };
}

function selectByName(list: string, catalog: readonly SearchableTool[]): string[] {
    const byLowerName = new Map(catalog.map(t => [t.name.toLowerCase(), t.name]));
    const result: string[] = [];
    for (const raw of list.split(",")) {
        const name = byLowerName.get(raw.trim().toLowerCase());
        if (name && !result.includes(name)) {
            result.push(name);
        }
    }
    return result;
}

/** Returns the names of the catalog tools that match `query`, best first. See the header for the forms. */
export function searchTools(query: string, catalog: readonly SearchableTool[], maxResults: number): string[] {
    const trimmed = (query ?? "").trim();
    if (!trimmed) {
        return [];
    }
    if (trimmed.toLowerCase().startsWith(SELECT_PREFIX)) {
        return selectByName(trimmed.slice(SELECT_PREFIX.length), catalog);
    }

    const limit = Math.max(1, Math.floor(maxResults) || 1);
    const exact = catalog.find(t => t.name.toLowerCase() === trimmed.toLowerCase());

    const required: string[] = [];
    const terms: string[] = [];
    for (const token of trimmed.toLowerCase().split(/\s+/)) {
        if (token.startsWith("+")) {
            const term = token.slice(1);
            if (term) {
                required.push(term);
                terms.push(term);
            }
        } else {
            terms.push(token);
        }
    }

    const ranked = catalog
        .map(index)
        .filter(t => required.every(term => t.lowerName.includes(term) || t.lowerDescription.includes(term)))
        .map(t => ({ name: t.name, score: terms.reduce((sum, term) => sum + scoreTerm(term, t), 0) }))
        .filter(t => t.score > 0)
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .map(t => t.name);

    const ordered = exact ? [exact.name, ...ranked.filter(name => name !== exact.name)] : ranked;
    return ordered.slice(0, limit);
}
