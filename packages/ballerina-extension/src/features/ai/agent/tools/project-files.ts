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

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { PathValidationError, RESTRICTED_READ_FILES, VALID_FILE_EXTENSIONS, resolveContained } from "./path-utils";

const IGNORED_DIR_NAMES = new Set(["target"]);
const IGNORED_DIR_GLOBS = ["**/target/**"];
// .agents/ holds project skills; other dot paths (.env, .git, MCP configs) can hold secrets.
const ALLOWED_DOT_DIR = ".agents";

export function toPosixRelative(p: string): string {
    return path.posix.normalize(p.replace(/\\/g, "/")).replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

function isBlockedDirSegment(segment: string, index: number): boolean {
    // Lower-cased: on macOS and Windows "Target/" is the same folder as "target/".
    if (IGNORED_DIR_NAMES.has(segment.toLowerCase())) {
        return true;
    }
    return segment.startsWith(".") && !(index === 0 && segment === ALLOWED_DOT_DIR);
}

export function isAllowedProjectPath(relPath: string): boolean {
    if (!relPath || relPath.includes("\0")) {
        return false;
    }
    const posix = toPosixRelative(relPath);
    const segments = posix.split("/");
    if (segments.some(segment => segment === "" || segment === "." || segment === "..")) {
        return false;
    }
    const fileName = segments[segments.length - 1].toLowerCase();
    if (fileName.startsWith(".") || !VALID_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
        return false;
    }
    if (RESTRICTED_READ_FILES.some(restricted => restricted.toLowerCase() === fileName)) {
        return false;
    }
    return !segments.slice(0, -1).some(isBlockedDirSegment);
}

// Native realpath on both sides: the JS one keeps the typed case on macOS, which breaks isInside.
function realRoot(root: string): string {
    try {
        return fs.realpathSync.native(root);
    } catch {
        return path.resolve(root);
    }
}

function isInside(rootReal: string, candidate: string): boolean {
    const rel = path.relative(rootReal, candidate);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function entryExists(p: string): boolean {
    try {
        fs.lstatSync(p);
        return true;
    } catch {
        return false;
    }
}

export function isReadableProjectFile(root: string, relPath: string): boolean {
    if (!isAllowedProjectPath(relPath)) {
        return false;
    }
    const rootReal = realRoot(root);
    const target = path.resolve(rootReal, toPosixRelative(relPath));
    if (!isInside(rootReal, target)) {
        return false;
    }
    try {
        // lstat, not existsSync: a dangling symlink must count as present, or a write would follow it out.
        if (!entryExists(target)) {
            if (!entryExists(rootReal)) {
                return true;
            }
            // A new file: check where it really lands (cfg -> .wso2 must not plant .wso2/mcp.json).
            let parent = path.dirname(target);
            while (!entryExists(parent)) {
                parent = path.dirname(parent);
            }
            const realTarget = path.join(fs.realpathSync.native(parent), path.relative(parent, target));
            return isInside(rootReal, realTarget) && isAllowedProjectPath(path.relative(rootReal, realTarget));
        }
        const real = fs.realpathSync.native(target);
        // The name rule applies to the link target too (alias.bal -> Config.toml).
        return isInside(rootReal, real) && isAllowedProjectPath(path.relative(rootReal, real));
    } catch {
        return false;
    }
}

export interface ListProjectFilesOptions {
    path?: string;
    pattern?: string;
    /** Match a pattern without a slash against file names at any depth. */
    matchBase?: boolean;
}

function assertRelativeInput(value: string, label: string): void {
    if (path.isAbsolute(value) || /^[a-zA-Z]:/.test(value) || value.includes("..") || value.includes("\0")) {
        throw new PathValidationError(`Invalid ${label} "${value}": use a path relative to the project root, without "..".`);
    }
}

export async function listProjectFiles(root: string, options: ListProjectFilesOptions = {}): Promise<string[]> {
    if (options.path !== undefined) {
        assertRelativeInput(options.path, "path");
    }
    if (options.pattern !== undefined) {
        assertRelativeInput(options.pattern, "pattern");
    }
    const rootReal = realRoot(root);
    const scope = options.path ? toPosixRelative(options.path).replace(/\/+$/, "") : "";
    const base = scope && scope !== "." ? resolveContained(rootReal, scope) : rootReal;
    const notPermitted = () => new PathValidationError(`"${options.path}" cannot be searched: the agent is not permitted to read it.`);
    const scopeSegments = scope && scope !== "." ? scope.split("/") : [];
    // Before the stat, so a blocked path gets the same answer whether it exists or not.
    if (scopeSegments.some(isBlockedDirSegment)) {
        throw notPermitted();
    }

    let stat: fs.Stats;
    try {
        stat = await fs.promises.stat(base);
    } catch {
        throw new PathValidationError(`Path "${options.path}" does not exist in the project.`);
    }
    if (stat.isFile()) {
        if (!isReadableProjectFile(rootReal, scope)) {
            throw notPermitted();
        }
        return [scope];
    }

    const matches = await glob(options.pattern || "**/*", {
        cwd: base,
        nodir: true,
        dot: false,
        posix: true,
        windowsPathsNoEscape: true,
        matchBase: options.matchBase,
        follow: false,
        ignore: IGNORED_DIR_GLOBS,
    });

    const candidates = matches
        .map(match => path.resolve(base, match))
        // Brace expansion can turn a relative-looking pattern into an absolute one.
        .filter(absolute => isInside(rootReal, absolute))
        .map(absolute => toPosixRelative(path.relative(rootReal, absolute)))
        .filter(isAllowedProjectPath);
    const readable = await Promise.all(candidates.map(rel => resolvesInsideRoot(rootReal, rel)));
    return candidates.filter((_, index) => readable[index]).sort();
}

async function resolvesInsideRoot(rootReal: string, rel: string): Promise<boolean> {
    try {
        const real = await fs.promises.realpath(path.resolve(rootReal, rel));
        return isInside(rootReal, real) && isAllowedProjectPath(path.relative(rootReal, real));
    } catch {
        return false;
    }
}
