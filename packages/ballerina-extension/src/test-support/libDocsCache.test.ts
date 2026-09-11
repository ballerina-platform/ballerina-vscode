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
 * @jest-environment node
 *
 * The docs cache is what keeps whole libraries out of every model context, so its contract is tested
 * end to end on a real temp directory: render shape, table of contents caps, cache hit/miss/refresh,
 * and the not-found path. The fetch is injected, so no language server is involved.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    buildVersionKey,
    ensureLibraryDocs,
    formatLibraryDocsResult,
    getLibDocsDir,
    libDocsFileName,
    libraryToc,
    renderLibraryMarkdown,
    splitRenderedLibrary,
    TOC_NAME_LIMIT,
} from "../features/ai/utils/libs/lib-docs-cache";
import type { Library } from "../features/ai/utils/libs/library-types";

const FIXTURE = path.join(__dirname, "..", "..", "test", "ai", "unit_tests", "libs", "resources", "sample-libraries.json");
const libraries: Library[] = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const http = libraries.find(l => l.name === "ballerina/http")!;
const withClients = libraries.find(l => (l.clients?.length ?? 0) > 0)!;

describe("libDocsFileName / getLibDocsDir / buildVersionKey", () => {
    it("maps org/name to a flat, safe file name", () => {
        expect(libDocsFileName("ballerinax/aws.s3")).toBe("ballerinax__aws.s3.md");
        expect(libDocsFileName(" Ballerina/HTTP ")).toBe("ballerina__http.md");
        expect(libDocsFileName("../evil/../x")).toBe("..__evil__..__x.md".replace(/\.\./g, ".."));
        expect(libDocsFileName("../evil")).not.toContain("/");
    });

    it("keys the directory by both versions and sanitises the key", () => {
        expect(buildVersionKey("5.14.0", "2201.13.5 (Swan Lake Update 13)")).toBe("5.14.0__2201.13.5_(Swan_Lake_Update_13)");
        expect(buildVersionKey(undefined, undefined)).toBe("ext-unknown__dist-unknown");
        expect(path.basename(getLibDocsDir("a/b c"))).toBe("a_b_c");
    });
});

describe("renderLibraryMarkdown", () => {
    const md = renderLibraryMarkdown(http);

    it("starts with the library title and the import in a fenced block", () => {
        expect(md.startsWith(`# ${http.name}\n`)).toBe(true);
        expect(md).toContain("```ballerina\nimport ballerina/http;\n```");
    });

    it("emits the API sections as markdown headings with fenced ballerina blocks", () => {
        for (const heading of ["## Types", "## Functions", "## Services"]) {
            expect(md).toContain(heading);
        }
        expect(renderLibraryMarkdown(withClients)).toContain("## Clients");
        const fences = md.match(/```ballerina/g) ?? [];
        expect(fences.length).toBeGreaterThanOrEqual(4);
        // No raw section markers survive; they became headings.
        expect(md).not.toContain("// --- Types ---");
        expect(md).not.toContain("// --- Client ---");
        expect(md).not.toContain("// --- Service ---");
    });

    it("puts the README last when present, demoting its own headings", () => {
        const withReadme: Library = { ...http, readme: "## Overview\nLong prose about http.\n### Examples\nMore prose." };
        const rendered = renderLibraryMarkdown(withReadme);
        const readmeAt = rendered.indexOf("## README");
        expect(readmeAt).toBeGreaterThan(rendered.indexOf("## Types"));
        expect(rendered.slice(readmeAt)).toContain("Long prose about http.");
        expect(rendered.slice(readmeAt)).toContain("\n### Overview\n");
        expect(rendered.slice(readmeAt)).toContain("\n#### Examples\n");
        expect(rendered.match(/^## /gm)!.filter(h => h).length).toBe(rendered.match(/^## (Types|Clients|Functions|Services|Annotations|README|Usage instructions)$/gm)!.length);
        expect(rendered).not.toContain("// --- END README ---");
    });

    it("surfaces usage instructions under their own heading before the API", () => {
        const withInstructions: Library = { ...http, instructions: "Always call close() on the client." };
        const rendered = renderLibraryMarkdown(withInstructions);
        const at = rendered.indexOf("## Usage instructions");
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeLessThan(rendered.indexOf("## Types"));
        expect(rendered.slice(at)).toContain("Always call close() on the client.");
    });

    it("splitRenderedLibrary treats nested service markers as body, not sections", () => {
        const parts = splitRenderedLibrary([
            "// ====", "// Library: x/y", "// ====", "import x/y;", "", "// --- Service ---",
            "// --- Service writing guidance ---", "guidance line", "// --- Service (generic) ---", "service body",
        ].join("\n"));
        expect(parts.sections.map(s => s.title)).toEqual(["Services"]);
        expect(parts.sections[0].body).toContain("guidance line");
        expect(parts.sections[0].body).toContain("service body");
    });
});

describe("libraryToc", () => {
    it("lists counts, client function counts and names per category", () => {
        expect(libraryToc(withClients)).toMatch(/^- Clients \(\d+\): .*\(\d+ functions?\)/m);
        const toc = libraryToc(http);
        expect(toc).toMatch(/^- Functions \(1\): authenticateResource/m);
        expect(toc).toMatch(/^- Types \(\d+\): CacheConfig, /m);
        expect(toc).toMatch(/^- Services \(1\): /m);
    });

    it("caps names per category and says how many more there are", () => {
        const many: Library = {
            name: "x/many", description: "", clients: [], typeDefs: [],
            functions: Array.from({ length: TOC_NAME_LIMIT + 7 }, (_, i) => ({ name: `fn${i}`, type: "function", description: "", parameters: [], return: { type: { name: "()" } } } as any)),
        };
        const toc = libraryToc(many);
        expect(toc).toContain(`- Functions (${TOC_NAME_LIMIT + 7}): fn0,`);
        expect(toc).toContain(`fn${TOC_NAME_LIMIT - 1}, … and 7 more`);
        expect(toc).not.toContain(`fn${TOC_NAME_LIMIT},`);
    });

    it("flags usage instructions as binding", () => {
        expect(libraryToc({ ...http, instructions: "x" })).toContain("Usage instructions: present (binding");
        expect(libraryToc({ name: "x/empty", description: "", clients: [], typeDefs: [] })).toBe("- (no API surface rendered)");
    });
});

describe("ensureLibraryDocs", () => {
    let dir: string;
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "lib-docs-test-")); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it("fetches misses, writes one file per library, and reports the path plus a TOC", async () => {
        const fetch = jest.fn(async (names: string[]) => libraries.filter(l => names.includes(l.name)));
        const result = await ensureLibraryDocs(["ballerina/http"], { dir, fetch });
        expect(fetch).toHaveBeenCalledWith(["ballerina/http"]);
        expect(result.notFound).toEqual([]);
        expect(result.found).toHaveLength(1);
        const [entry] = result.found;
        expect(entry.source).toBe("fetched");
        expect(entry.path).toBe(path.join(dir, "ballerina__http.md"));
        expect(fs.existsSync(entry.path)).toBe(true);
        expect(entry.toc).toMatch(/^- Types \(/m);
    });

    it("serves a second call from the cache without fetching, keeping the TOC", async () => {
        const fetch = jest.fn(async (names: string[]) => libraries.filter(l => names.includes(l.name)));
        await ensureLibraryDocs(["ballerina/http"], { dir, fetch });
        const again = await ensureLibraryDocs(["Ballerina/HTTP"], { dir, fetch });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(again.found[0].source).toBe("cached");
        expect(again.found[0].toc).toMatch(/^- Types \(/m);
    });

    it("refetches when refresh is set", async () => {
        const fetch = jest.fn(async (names: string[]) => libraries.filter(l => names.includes(l.name)));
        await ensureLibraryDocs(["ballerina/http"], { dir, fetch });
        const refreshed = await ensureLibraryDocs(["ballerina/http"], { dir, fetch, refresh: true });
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(refreshed.found[0].source).toBe("fetched");
    });

    it("reports names the language server did not return, in the caller's order", async () => {
        const fetch = jest.fn(async (names: string[]) => libraries.filter(l => names.includes(l.name)));
        const result = await ensureLibraryDocs(["ballerinax/nope", "ballerina/http"], { dir, fetch });
        expect(result.notFound).toEqual(["ballerinax/nope"]);
        expect(result.found.map(f => f.name)).toEqual(["ballerina/http"]);
        const text = formatLibraryDocsResult(result);
        expect(text).toContain("ballerinax/nope: not found — check the exact org/name with library_search.");
        expect(text).toContain("ballerina/http -> ");
        expect(text).toContain("Read sections, not whole files.");
    });

    it("dedupes and normalises requested names", async () => {
        const fetch = jest.fn(async (names: string[]) => libraries.filter(l => names.includes(l.name)));
        const result = await ensureLibraryDocs(["ballerina/http", " Ballerina/Http", ""], { dir, fetch });
        expect(fetch).toHaveBeenCalledWith(["ballerina/http"]);
        expect(result.found).toHaveLength(1);
    });
});
