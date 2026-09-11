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
 * Library documentation on disk.
 *
 * Renders a `Library` (the language server's JSON) into one markdown file per library, cached under
 * `~/.ballerina/copilot/lib-docs/<versionKey>/`, and returns a table of contents instead of the content.
 * This is what keeps a 35K-token library out of every model context: the librarian subagent greps and
 * reads sections of these files, and nothing else ever inlines a whole library again.
 *
 * Rendering wraps the existing `toSyntaxString` renderer (one library per document, so its per-document
 * module-prefix allocation stays intact) and post-processes on the `// --- Section ---` markers it emits.
 * The fetch is injected so the module stays a pure leaf for tests.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Library, Client, TypeDefinition } from "./library-types";
import { toSyntaxString } from "./to-syntax-string";
import { writeAtomic } from "../atomic-write";

export const LIB_DOCS_ROOT = path.join(os.homedir(), ".ballerina", "copilot", "lib-docs");

/** Names shown per category in the table of contents before "… and N more". */
export const TOC_NAME_LIMIT = 40;

export type LibDocsFetcher = (libNames: string[]) => Promise<Library[]>;

export interface LibDocsEntry {
    name: string;
    path: string;
    source: "cached" | "fetched";
    toc: string;
}

export interface LibDocsResult {
    found: LibDocsEntry[];
    notFound: string[];
}

export interface EnsureLibraryDocsOptions {
    /** Directory holding the rendered files (already version-keyed). */
    dir: string;
    fetch: LibDocsFetcher;
    /** Re-render even when a cached file exists. */
    refresh?: boolean;
}

/** `ballerinax/aws.s3` → `ballerinax__aws.s3.md`. Anything outside the org/name alphabet is dropped. */
export function libDocsFileName(libName: string): string {
    const safe = libName.trim().toLowerCase().replace(/\//g, "__").replace(/[^a-z0-9._-]/g, "");
    return `${safe}.md`;
}

/** Version-keyed cache directory; both the extension and the distribution shape the library JSON. */
export function getLibDocsDir(versionKey: string): string {
    const safeKey = versionKey.replace(/[^A-Za-z0-9._-]/g, "_") || "unknown";
    return path.join(LIB_DOCS_ROOT, safeKey);
}

export function buildVersionKey(extensionVersion: string | undefined, distributionVersion: string | undefined): string {
    const ext = (extensionVersion || "ext-unknown").trim();
    const dist = (distributionVersion || "dist-unknown").trim().replace(/\s+/g, "_");
    return `${ext}__${dist}`;
}

// ── Rendering ──────────────────────────────────────────────────────────────────

const TOP_LEVEL_SECTIONS: Record<string, string> = {
    "// --- Types ---": "Types",
    "// --- Client ---": "Clients",
    "// --- Functions ---": "Functions",
    "// --- Service ---": "Services",
    "// --- Annotations ---": "Annotations",
};
const README_START = "// --- README ---";
const README_END = "// --- END README ---";

interface RenderedSections {
    importLine: string;
    instructions: string;
    readme: string;
    sections: { title: string; body: string }[];
}

/** Splits `toSyntaxString` output for one library on its section markers. */
export function splitRenderedLibrary(rendered: string): RenderedSections {
    const lines = rendered.split("\n");
    let i = 0;
    // Header block: `// ====`, `// Library: …`, optional `// <description>`, `// ====`.
    while (i < lines.length && lines[i].startsWith("//")) { i++; }
    let importLine = "";
    if (i < lines.length && lines[i].startsWith("import ")) {
        importLine = lines[i];
        i++;
    }

    const instructions: string[] = [];
    const readme: string[] = [];
    const sections: { title: string; body: string[] }[] = [];
    let current: string[] | null = instructions;
    let inReadme = false;

    for (; i < lines.length; i++) {
        const line = lines[i];
        if (inReadme) {
            if (line === README_END) { inReadme = false; current = null; continue; }
            readme.push(line);
            continue;
        }
        if (line === README_START) { inReadme = true; continue; }
        const title = TOP_LEVEL_SECTIONS[line];
        if (title) {
            const section = { title, body: [] as string[] };
            sections.push(section);
            current = section.body;
            continue;
        }
        if (current) { current.push(line); }
    }

    return {
        importLine,
        instructions: instructions.join("\n").trim(),
        readme: readme.join("\n").trim(),
        sections: sections.map(s => ({ title: s.title, body: s.body.join("\n").trim() })),
    };
}

const fence = (code: string): string => `\`\`\`ballerina\n${code}\n\`\`\``;

/**
 * Markdown shape shared with the bi-agent-harness renderer: title, description, import, then
 * `## Usage instructions`, the API sections, and `## README` last (it is prose, and the longest part).
 * `// Special Agent Note` markers survive verbatim inside the fenced blocks; the librarian follows them.
 */
export function renderLibraryMarkdown(lib: Library): string {
    const parts = splitRenderedLibrary(toSyntaxString([lib]));
    const out: string[] = [`# ${lib.name}`, ""];
    if (lib.description?.trim()) { out.push(lib.description.trim(), ""); }
    if (parts.importLine) { out.push(fence(parts.importLine), ""); }
    if (parts.instructions) { out.push("## Usage instructions", "", parts.instructions, ""); }
    for (const section of parts.sections) {
        if (!section.body) { continue; }
        out.push(`## ${section.title}`, "", fence(section.body), "");
    }
    // The README is markdown of its own; demote its headings so the file's section structure stays flat
    // and `## ` stays a reliable anchor for grep.
    if (parts.readme) { out.push("## README", "", parts.readme.replace(/^(#{1,5}) /gm, "#$1 "), ""); }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ── Table of contents ──────────────────────────────────────────────────────────

function typeDefName(t: TypeDefinition): string {
    return (t as { name?: string }).name ?? "<unnamed>";
}

function nameList(names: string[]): string {
    if (names.length === 0) { return ""; }
    const shown = names.slice(0, TOC_NAME_LIMIT);
    const more = names.length - shown.length;
    return `: ${shown.join(", ")}${more > 0 ? `, … and ${more} more` : ""}`;
}

function clientLine(client: Client): string {
    const count = client.functions?.length ?? 0;
    return `${client.name} (${count} function${count === 1 ? "" : "s"})`;
}

/** Counts plus up to TOC_NAME_LIMIT names per category, so a reader knows what to grep for. */
export function libraryToc(lib: Library): string {
    const lines: string[] = [];
    const clients = lib.clients ?? [];
    if (clients.length > 0) {
        lines.push(`- Clients (${clients.length}): ${clients.slice(0, TOC_NAME_LIMIT).map(clientLine).join(", ")}${clients.length > TOC_NAME_LIMIT ? `, … and ${clients.length - TOC_NAME_LIMIT} more` : ""}`);
    }
    const functions = lib.functions ?? [];
    if (functions.length > 0) {
        lines.push(`- Functions (${functions.length})${nameList(functions.map(f => f.name))}`);
    }
    const types = lib.typeDefs ?? [];
    if (types.length > 0) {
        lines.push(`- Types (${types.length})${nameList(types.map(typeDefName))}`);
    }
    const services = lib.services ?? [];
    if (services.length > 0) {
        lines.push(`- Services (${services.length})${nameList(services.map(s => s.name ?? `${s.type} service on ${s.listener?.name ?? "listener"}`))}`);
    }
    const annotations = lib.annotations ?? [];
    if (annotations.length > 0) {
        lines.push(`- Annotations (${annotations.length})${nameList(annotations.map(a => `@${a.name}`))}`);
    }
    if (lib.instructions?.trim()) { lines.push("- Usage instructions: present (binding — read them)"); }
    if (lib.readme?.trim()) { lines.push("- README: present"); }
    return lines.length > 0 ? lines.join("\n") : "- (no API surface rendered)";
}

// ── Cache ──────────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}

/** Renders in progress, keyed by directory and library, so concurrent callers share one fetch. */
const inFlightFetches = new Map<string, Promise<unknown>>();

function inFlightKey(dir: string, name: string): string {
    return `${dir}|${name}`;
}

/**
 * Renders the named libraries to the cache directory, fetching only the misses (or everything when
 * `refresh` is set). Never returns content: each entry carries the path and a table of contents.
 */
export async function ensureLibraryDocs(names: string[], opts: EnsureLibraryDocsOptions): Promise<LibDocsResult> {
    const wanted = [...new Set(names.map(normalizeName).filter(Boolean))];
    fs.mkdirSync(opts.dir, { recursive: true });

    const found: LibDocsEntry[] = [];
    const misses: string[] = [];
    for (const name of wanted) {
        const file = path.join(opts.dir, libDocsFileName(name));
        if (!opts.refresh && fs.existsSync(file)) {
            const tocFile = tocPath(file);
            const toc = fs.existsSync(tocFile) ? fs.readFileSync(tocFile, "utf8") : "- (table of contents unavailable; grep the file)";
            found.push({ name, path: file, source: "cached", toc });
        } else {
            misses.push(name);
        }
    }

    if (misses.length > 0) {
        // Parallel subagents often need the same library at the same moment (two connectors that both bind
        // through ballerina/data.csv). A miss already being fetched by another caller is awaited, not
        // fetched again; each render is one package compilation in the language server.
        const awaiting: Promise<unknown>[] = [];
        const toFetch = new Set<string>();
        for (const name of misses) {
            const pending = inFlightFetches.get(inFlightKey(opts.dir, name));
            if (pending) { awaiting.push(pending); } else { toFetch.add(name); }
        }
        // The TOCs this call renders, kept in memory so they are not read back from disk below.
        const rendered = new Map<string, string>();
        if (toFetch.size > 0) {
            const names = [...toFetch];
            const batch = opts.fetch(names).then(fetched => {
                const byName = new Map(fetched.map(lib => [normalizeName(lib.name), lib]));
                for (const name of names) {
                    const lib = byName.get(name);
                    if (!lib) { continue; }
                    const file = path.join(opts.dir, libDocsFileName(name));
                    const toc = libraryToc(lib);
                    writeAtomic(file, renderLibraryMarkdown(lib));
                    writeAtomic(tocPath(file), toc);
                    rendered.set(name, toc);
                }
            });
            for (const name of names) {
                const key = inFlightKey(opts.dir, name);
                inFlightFetches.set(key, batch);
                batch.then(() => inFlightFetches.delete(key), () => inFlightFetches.delete(key));
            }
            awaiting.push(batch);
        }
        await Promise.all(awaiting);
        for (const name of misses) {
            const file = path.join(opts.dir, libDocsFileName(name));
            const ownToc = rendered.get(name);
            if (ownToc !== undefined) {
                found.push({ name, path: file, source: "fetched", toc: ownToc });
                continue;
            }
            if (!fs.existsSync(file)) { continue; }
            const tocFile = tocPath(file);
            const toc = fs.existsSync(tocFile) ? fs.readFileSync(tocFile, "utf8") : "- (table of contents unavailable; grep the file)";
            found.push({ name, path: file, source: "cached", toc });
        }
    }

    const foundNames = new Set(found.map(f => f.name));
    // Keep the caller's order so the report lists libraries the way they were asked for.
    found.sort((a, b) => wanted.indexOf(a.name) - wanted.indexOf(b.name));
    return { found, notFound: wanted.filter(n => !foundNames.has(n)) };
}

/** Sidecar holding the table of contents so a cache hit never re-parses the markdown. */
function tocPath(docFile: string): string {
    return docFile.replace(/\.md$/, ".toc.txt");
}

/** The text the `library_docs` tool returns to the librarian. */
export function formatLibraryDocsResult(result: LibDocsResult): string {
    const lines: string[] = [];
    for (const entry of result.found) {
        lines.push(`${entry.name} -> ${entry.path} (${entry.source})`, entry.toc, "");
    }
    for (const name of result.notFound) {
        lines.push(`${name}: not found — check the exact org/name with library_search.`, "");
    }
    if (result.found.length > 0) {
        lines.push("Grep or read the files for the API details you need (signatures are in ```ballerina blocks). Read sections, not whole files.");
    }
    return lines.join("\n").trim();
}
