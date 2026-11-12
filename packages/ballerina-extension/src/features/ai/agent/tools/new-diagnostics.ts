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
 * The compiler errors a file edit newly surfaced, as the `<new-diagnostics>` block appended to the
 * edit's tool result (pure).
 *
 * Every error in the edited file's package is diffed against what this run already delivered, so
 * only new ones reach the model: an edit to one file also surfaces the other files it broke, and an
 * unchanged error is never repeated. Editing a file forgets its delivered errors, so one that was
 * fixed and then reintroduced shows up again.
 *
 * Caps: 10 errors per file, 30 in total, 4,000 characters; the delivered set keeps the 500 most
 * recently touched files.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { DIAGNOSTIC_HINTS } from "./diagnostic-hints";

export const MAX_PER_FILE = 10;
export const MAX_TOTAL = 30;
export const MAX_CHARS = 4000;
const MAX_TRACKED_FILES = 500;

/** The fields of an LSP diagnostic this module reads. */
export interface RawDiagnostic {
    range: { start: { line: number; character: number }; end?: { line: number; character: number } };
    severity?: number;
    code?: string | number | null;
    message: string;
}

/** A file's diagnostics as the language server returns them, keyed by document URI. */
export interface FileDiagnostics {
    uri: string;
    diagnostics: RawDiagnostic[];
}

/** Files whose edits can change what the package compiles to. */
export function affectsCompilation(filePath: string): boolean {
    return filePath.endsWith(".bal") || path.basename(filePath) === "Ballerina.toml";
}

/**
 * The nearest directory holding a Ballerina.toml, from the file's own directory up to `root`
 * inclusive; undefined when the file is outside `root` or in no package. Synchronous and bounded by
 * `root`, unlike `findBallerinaPackageRoot` in utils/file-utils.ts, which also needs vscode.
 */
export function findPackageRoot(absoluteFile: string, root: string): string | undefined {
    const boundary = path.resolve(root);
    let dir = path.dirname(path.resolve(absoluteFile));
    while (dir === boundary || dir.startsWith(boundary + path.sep)) {
        if (fs.existsSync(path.join(dir, "Ballerina.toml"))) {
            return dir;
        }
        if (dir === boundary) {
            break;
        }
        dir = path.dirname(dir);
    }
    return undefined;
}

/**
 * The tracker's key for a file path. VS Code's `Uri.file` lowercases a Windows drive letter, so the
 * language server's URIs say `c:` where the edited path may say `C:`; both sides lowercase it.
 */
export function pathKey(filePath: string): string {
    return path.resolve(filePath).replace(/^[A-Z]:/, drive => drive.toLowerCase());
}

/** The tracker's key for a `file:` URI, or the URI itself when it is not one. */
export function fileKey(uri: string): string {
    if (uri.startsWith("file:")) {
        try {
            return pathKey(fileURLToPath(uri));
        } catch {
            // Malformed; key it verbatim.
        }
    }
    return uri;
}

/** Errors only: the same filter the diagnostics tool applies. */
function isError(d: RawDiagnostic): boolean {
    return (d.severity ?? 1) === 1;
}

/** Content identity of one diagnostic, stable across repeated compilations. */
function fingerprintDiagnostic(d: RawDiagnostic): string {
    return JSON.stringify({ m: d.message, r: d.range, c: d.code ?? null });
}

/**
 * Delivered fingerprints per file, bounded by file count. Insertion order is recency: touching a
 * file moves it to the back.
 */
export class DeliveredTracker {
    private files = new Map<string, Set<string>>();

    constructor(private readonly maxFiles = MAX_TRACKED_FILES) {}

    /** Forget a file, called when it is edited, so its errors can show again. */
    clear(key: string): void {
        this.files.delete(key);
    }

    /**
     * The errors in `all` not delivered yet, per file key. Afterwards each reported file remembers
     * exactly its current errors, and every other file under `packageRoot` (the package `all` covers)
     * remembers none, so an error that was fixed and later comes back is shown again, in any file.
     */
    takeNew(all: FileDiagnostics[], packageRoot: string): Map<string, RawDiagnostic[]> {
        const delta = new Map<string, RawDiagnostic[]>();
        const reported = new Set<string>();
        for (const { uri, diagnostics } of all) {
            const errors = diagnostics.filter(isError);
            if (errors.length === 0) {
                continue;
            }
            const key = fileKey(uri);
            const fingerprints = errors.map(fingerprintDiagnostic);
            const seen = this.files.get(key);
            const fresh = errors.filter((_, i) => !seen?.has(fingerprints[i]));
            if (fresh.length > 0) {
                delta.set(key, fresh);
            }
            reported.add(key);
            this.remember(key, fingerprints);
        }
        const scope = pathKey(packageRoot) + path.sep;
        for (const key of [...this.files.keys()]) {
            if (key.startsWith(scope) && !reported.has(key)) {
                this.files.delete(key);
            }
        }
        return delta;
    }

    private remember(key: string, fingerprints: string[]): void {
        this.files.delete(key);
        this.files.set(key, new Set(fingerprints));
        while (this.files.size > this.maxFiles) {
            const oldest = this.files.keys().next().value;
            if (oldest === undefined) {
                break;
            }
            this.files.delete(oldest);
        }
    }
}

function formatEntry(d: RawDiagnostic): string {
    const line = d.range.start.line + 1;
    const column = d.range.start.character + 1;
    const code = String(d.code ?? "");
    const hint = code ? DIAGNOSTIC_HINTS[code] : undefined;
    return `  ✘ [Line ${line}:${column}] ${d.message}${code ? ` [${code}]` : ""}${hint ? `\n    Hint: ${hint}` : ""}`;
}

/**
 * The `<new-diagnostics>` block for a delta, or undefined when it is empty. Files appear with paths
 * relative to `displayRoot`, sorted by path.
 */
export function formatNewDiagnostics(delta: Map<string, RawDiagnostic[]>, displayRoot: string): string | undefined {
    if (delta.size === 0) {
        return undefined;
    }
    const sections = [...delta.entries()]
        .map(([key, list]) => [path.isAbsolute(key) ? path.relative(displayRoot, key) || key : key, list] as const)
        .sort(([a], [b]) => a.localeCompare(b));

    const parts: string[] = [];
    let total = 0;
    let included = 0;
    for (const [file, list] of sections) {
        total += list.length;
        const kept = list.slice(0, Math.min(MAX_PER_FILE, MAX_TOTAL - included));
        if (kept.length > 0) {
            included += kept.length;
            parts.push(`${file}:\n${kept.map(formatEntry).join("\n")}`);
        }
    }
    const omitted = total - included;
    if (omitted > 0) {
        parts.push(`… ${omitted} more`);
    }

    let body = parts.join("\n\n");
    if (body.length > MAX_CHARS) {
        body = `${body.slice(0, MAX_CHARS)}…[truncated]`;
    }
    return `<new-diagnostics>The following new diagnostic issues were detected:\n\n${body}\n</new-diagnostics>`;
}
