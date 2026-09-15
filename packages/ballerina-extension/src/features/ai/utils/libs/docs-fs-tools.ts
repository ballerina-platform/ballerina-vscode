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
export const GREP_MAX_PATTERN_CHARS = 200;

/**
 * Rejects a pattern whose matching can blow up on a single line (ReDoS). A repetition nested inside
 * another repetition (`(a+)+`) is exponential; a backreference makes the engine backtrack too; and a
 * quantified group whose alternatives share a first character (`(a|aa)+`) is ambiguous, which the
 * star-height check misses. All three are checked structurally rather than by timing, because the block
 * would happen synchronously on the extension host before `GREP_MAX_LINES` caps the output. Sequential
 * quantifiers (`a+b+`) and alternatives with distinct first characters (`(a|b)+`) are linear and stay
 * allowed. First characters are compared case-insensitively, since matching is case-insensitive unless
 * the caller asks otherwise and `(a|A)+` is ambiguous either way.
 */
export function isSafeGrepPattern(pattern: string): boolean {
    if (pattern.length > GREP_MAX_PATTERN_CHARS) { return false; }
    if (/\\[1-9]/.test(pattern)) { return false; }

    /**
     * Possible first characters of one alternative: a set of literals, or `null` when it can match empty
     * or start with something we cannot enumerate (`.`, `\d`, a nested group). `null` overlaps with
     * everything, so an unparsed construct is treated as ambiguous rather than trusted.
     */
    type FirstChars = Set<string> | null;

    interface GroupFrame {
        /** Whether a quantifier sits anywhere in this group's body (star-height check). */
        bodyHasQuantifier: boolean;
        /** Whether a nested group in this body had ambiguous alternatives. */
        nestedAmbiguity: boolean;
        /** First characters of the alternatives closed so far. */
        branchFirsts: FirstChars[];
        /** First characters of the alternative being scanned; undefined until its first token is read. */
        currentFirst?: FirstChars;
    }

    const isShorthandClass = (esc: string): boolean => /[dDwWsSbB]/.test(esc);

    /** Reads the character class at `start` (a `[`): its literals, or null when it is negated or holds a shorthand class. */
    const readCharClass = (start: number): { first: FirstChars; end: number } => {
        let i = start + 1;
        const negated = pattern[i] === "^";
        if (negated) { i++; }
        const chars = new Set<string>();
        let enumerable = !negated;
        for (; i < pattern.length && pattern[i] !== "]"; i++) {
            const c = pattern[i];
            if (c === "\\") {
                const esc = pattern[i + 1] ?? "";
                if (esc !== "" && !isShorthandClass(esc)) { chars.add(esc.toLowerCase()); } else { enumerable = false; }
                i++;
                continue;
            }
            const rangeEnd = pattern[i + 1] === "-" && pattern[i + 2] !== undefined && pattern[i + 2] !== "]"
                ? pattern[i + 2]
                : undefined;
            if (rangeEnd !== undefined) {
                const from = c.toLowerCase().charCodeAt(0);
                const to = rangeEnd.toLowerCase().charCodeAt(0);
                if (to >= from && to - from <= 128) {
                    for (let x = from; x <= to; x++) { chars.add(String.fromCharCode(x)); }
                } else {
                    enumerable = false;
                }
                i += 2;
                continue;
            }
            chars.add(c.toLowerCase());
        }
        return { first: enumerable ? chars : null, end: i };
    };

    const overlaps = (a: FirstChars, b: FirstChars): boolean => {
        if (a === null || b === null) { return true; }
        for (const ch of a) { if (b.has(ch)) { return true; } }
        return false;
    };

    const unionFirst = (branches: FirstChars[]): FirstChars => {
        const all = new Set<string>();
        for (const branch of branches) {
            if (branch === null) { return null; }
            for (const ch of branch) { all.add(ch); }
        }
        return all;
    };

    /** A quantified group that can be skipped leaves the alternative's first character open. */
    const canMatchEmpty = (quantifier: string, fromIndex: number): boolean => {
        if (quantifier === "*" || quantifier === "?") { return true; }
        const bound = /^\{(\d+)/.exec(pattern.slice(fromIndex));
        return quantifier === "{" && (!bound || Number(bound[1]) === 0);
    };

    const frames: GroupFrame[] = [{ bodyHasQuantifier: false, nestedAmbiguity: false, branchFirsts: [] }];

    /** Ends the alternative being scanned and records its first characters (null when it is empty). */
    const closeBranch = (frame: GroupFrame): void => {
        frame.branchFirsts.push(frame.currentFirst === undefined ? null : frame.currentFirst);
        frame.currentFirst = undefined;
    };

    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        const frame = frames[frames.length - 1];
        if (c === "\\") {
            const esc = pattern[i + 1] ?? "";
            if (frame.currentFirst === undefined) {
                // `\b` and `\B` are zero-width, so the alternative is still looking for its first character.
                if (esc !== "b" && esc !== "B") {
                    frame.currentFirst = isShorthandClass(esc) || esc === "" ? null : new Set([esc.toLowerCase()]);
                }
            }
            i++;
            continue;
        }
        if (c === "[") {
            const cls = readCharClass(i);
            if (frame.currentFirst === undefined) { frame.currentFirst = cls.first; }
            i = cls.end;
            continue;
        }
        if (c === "(") {
            frames.push({ bodyHasQuantifier: false, nestedAmbiguity: false, branchFirsts: [] });
            // The group's own first characters reach this frame when it closes.
            // Skip the modifier in `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, `(?<name>` so its `?` is not
            // mistaken for a quantifier.
            if (pattern[i + 1] === "?") { i++; }
            continue;
        }
        if (c === "|") { closeBranch(frame); continue; }
        if (c === ")") {
            closeBranch(frame);
            const closed = frames.pop() as GroupFrame;
            const quantifier = pattern[i + 1] ?? "";
            const quantified = /[*+{]/.test(quantifier);
            const ambiguous = closed.nestedAmbiguity
                || closed.branchFirsts.some((branch, idx) =>
                    closed.branchFirsts.slice(idx + 1).some(other => overlaps(branch, other)));
            if (quantified && closed.bodyHasQuantifier) { return false; }
            if (quantified && ambiguous) { return false; }
            const parent = frames[frames.length - 1];
            parent.nestedAmbiguity = parent.nestedAmbiguity || ambiguous;
            if (closed.bodyHasQuantifier) { parent.bodyHasQuantifier = true; }
            if (parent.currentFirst === undefined) {
                parent.currentFirst = quantified && canMatchEmpty(quantifier, i + 1)
                    ? null
                    : unionFirst(closed.branchFirsts);
            }
            continue;
        }
        if (c === "*" || c === "+" || c === "?") {
            // `*?`, `+?`, `??` are the lazy forms of one quantifier, not two.
            const prev = pattern[i - 1];
            if (c === "?" && (prev === "*" || prev === "+" || prev === "?")) { continue; }
            frame.bodyHasQuantifier = true;
            if (frame.currentFirst === undefined) { frame.currentFirst = null; }
            continue;
        }
        if (c === "{") {
            const bound = /^\{\d+(?:,\d*)?\}/.exec(pattern.slice(i));
            if (bound) {
                frame.bodyHasQuantifier = true;
                i += bound[0].length - 1;
            }
            if (frame.currentFirst === undefined) { frame.currentFirst = null; }
            continue;
        }
        if (c === "^" || c === "$" || c === ".") {
            // `^` and `$` are zero-width; `.` matches anything, so its first character is unknown.
            if (c === "." && frame.currentFirst === undefined) { frame.currentFirst = null; }
            continue;
        }
        if (frame.currentFirst === undefined) { frame.currentFirst = new Set([c.toLowerCase()]); }
    }
    return true;
}

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
    if (!isSafeGrepPattern(input.pattern)) {
        return `Rejected pattern /${input.pattern}/: it can backtrack catastrophically (a repetition nested in another repetition, a backreference, or a quantified group whose alternatives share a first character). Simplify it — for example, replace (a+)+ with a+, or (a|aa)+ with a+.`;
    }
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
