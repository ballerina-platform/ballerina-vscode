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

// A corrupt/incompatible cached BIR makes projects load empty. The LS reports the
// condition via the `projectService/corruptBirCache` notification with the affected module's
// coordinates and the running distribution version; here we offer to clear that module's compiled
// BIR cache under cache-<distVersion> and reload.

import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { commands, window } from "vscode";

export interface CorruptModule {
    org: string;
    name: string;
    version: string;
}

/** The `projectService/corruptBirCache` notification payload sent by the language server. */
export interface CorruptBirCachePayload extends Partial<CorruptModule> {
    distVersion?: string;
    projectUri?: string;
}

interface ClearOptions {
    distVersion?: string;
    homeDir?: string;
}

// A cache path segment (org / package name / version / dist version) must be a single, simple token.
// This guards against a malformed payload turning into path traversal ("..", "/", …) on disk.
const SAFE_SEGMENT = /^[A-Za-z0-9_.+-]+$/;
function isSafeSegment(segment: unknown): segment is string {
    return typeof segment === "string" && segment !== "." && segment !== ".." && SAFE_SEGMENT.test(segment);
}

/** True when the notification payload names a module safe to turn into cache paths. */
export function isValidModule(module: Partial<CorruptModule> | null | undefined): module is CorruptModule {
    return !!module && isSafeSegment(module.org) && isSafeSegment(module.name) && isSafeSegment(module.version);
}

function reposDirFor(homeDir: string): string {
    return path.join(homeDir, ".ballerina", "repositories");
}

function isWithin(parent: string, child: string): boolean {
    const rel = path.relative(parent, child);
    return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function cacheDirMatches(cacheDir: string, distVersion?: string): boolean {
    if (!cacheDir.startsWith("cache-")) {
        return false;
    }
    return !distVersion || cacheDir === `cache-${distVersion}`;
}

async function listSubDirs(dir: string): Promise<string[]> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
        return [];
    }
}

export async function resolveModuleCacheDirs(
    reposDir: string,
    module: CorruptModule,
    distVersion?: string
): Promise<string[]> {
    const targets: string[] = [];
    for (const repo of await listSubDirs(reposDir)) {
        const repoDir = path.join(reposDir, repo);
        for (const cacheDir of await listSubDirs(repoDir)) {
            if (!cacheDirMatches(cacheDir, distVersion)) {
                continue;
            }
            const target = path.join(repoDir, cacheDir, module.org, module.name, module.version);
            if (isWithin(reposDir, target)) {
                targets.push(target);
            }
        }
    }
    return targets;
}

async function removeIfExists(dir: string, reposDir: string): Promise<boolean> {
    if (!isWithin(reposDir, dir)) {
        return false;
    }
    try {
        await fs.stat(dir);
    } catch {
        return false; // nothing to remove
    }
    await fs.rm(dir, { recursive: true, force: true });
    return true;
}

/** Clears the compiled BIR cache for a single module under cache-<distVersion>. Returns removed dirs. */
export async function clearModuleBirCache(module: CorruptModule, options: ClearOptions = {}): Promise<string[]> {
    const reposDir = reposDirFor(options.homeDir ?? os.homedir());
    const removed: string[] = [];
    for (const dir of await resolveModuleCacheDirs(reposDir, module, options.distVersion)) {
        if (await removeIfExists(dir, reposDir)) {
            removed.push(dir);
        }
    }
    return removed;
}

/** Fallback: clears every repositories/&ast;/cache-<distVersion> dir. */
export async function clearAllBirCaches(options: ClearOptions = {}): Promise<string[]> {
    const reposDir = reposDirFor(options.homeDir ?? os.homedir());
    const removed: string[] = [];
    for (const repo of await listSubDirs(reposDir)) {
        const repoDir = path.join(reposDir, repo);
        for (const cacheDir of await listSubDirs(repoDir)) {
            if (!cacheDirMatches(cacheDir, options.distVersion)) {
                continue;
            }
            const target = path.join(repoDir, cacheDir);
            if (await removeIfExists(target, reposDir)) {
                removed.push(target);
            }
        }
    }
    return removed;
}

let promptShown = false; // don't stack a prompt per repeated notification

/**
 * Surfaces the corrupt-BIR condition and, on confirmation, clears the affected module's compiled
 * cache under the active distribution's cache directory (or all modules in that cache when the
 * module can't be identified) and reloads the window.
 */
export async function promptClearCorruptBirCache(payload: CorruptBirCachePayload | null | undefined): Promise<void> {
    if (promptShown) {
        return;
    }
    promptShown = true;
    try {
        const distVersion = isSafeSegment(payload?.distVersion) ? payload.distVersion : undefined;
        const target = isValidModule(payload)
            ? { org: payload.org, name: payload.name, version: payload.version }
            : null;
        const coordinate = target ? `${target.org}/${target.name}:${target.version}` : undefined;
        const action = "Clear cache & reload";
        const prompt = coordinate
            ? `The cache for module '${coordinate}' is corrupted, so the project may appear empty. ` +
              `Clear the cache for this module and reload?`
            : `A module cache is corrupted, so the project may appear empty. ` +
              `Clear the module cache and reload?`;

        const choice = await window.showErrorMessage(prompt, action);
        if (choice !== action) {
            return;
        }

        const removed = target
            ? await clearModuleBirCache(target, { distVersion })
            : await clearAllBirCaches({ distVersion });
        // If the targeted clear matched nothing (unexpected layout), fall back to clearing the whole
        // distribution cache so the user still recovers rather than reloading into the same state.
        if (target && removed.length === 0) {
            await clearAllBirCaches({ distVersion });
        }

        await commands.executeCommand("workbench.action.reloadWindow");
    } finally {
        // Reset so a later occurrence can prompt again if the window was not reloaded (dismissed/failed).
        promptShown = false;
    }
}
