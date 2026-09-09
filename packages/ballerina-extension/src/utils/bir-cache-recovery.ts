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
// condition via the `projectService/corruptBirCache` notification with the affected package's
// coordinates and the running distribution version; here we offer to clear that package's compiled
// BIR cache under cache-<distVersion> and reload.

import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import { commands, window } from "vscode";

export interface CorruptPackage {
    org: string;
    packageName: string;
    version: string;
}

/** The `projectService/corruptBirCache` notification payload sent by the language server. */
export interface CorruptBirCachePayload extends Partial<CorruptPackage> {
    moduleName?: string;
    distVersion?: string;
    projectUri?: string;
    reposPath?: string;
}

interface ClearOptions {
    distVersion?: string;
    homeDir?: string;
    reposDir?: string;
}

// A cache path segment (org / package name / version / dist version) must be a single, simple token.
// This guards against a malformed payload turning into path traversal ("..", "/", …) on disk.
const SAFE_SEGMENT = /^[A-Za-z0-9_.+-]+$/;
function isSafeSegment(segment: unknown): segment is string {
    return typeof segment === "string" && segment !== "." && segment !== ".." && SAFE_SEGMENT.test(segment);
}

/** True when the notification payload names a package safe to turn into cache paths. */
export function isValidPackage(pkg: Partial<CorruptPackage> | null | undefined): pkg is CorruptPackage {
    return !!pkg && isSafeSegment(pkg.org) && isSafeSegment(pkg.packageName) && isSafeSegment(pkg.version);
}

function reposDirFor(options: ClearOptions): string {
    if (options.reposDir) {
        return options.reposDir;
    }
    if (options.homeDir) {
        return path.join(options.homeDir, ".ballerina", "repositories");
    }
    const envHome = process.env.BALLERINA_HOME_DIR;
    const ballerinaHome = envHome && envHome.length > 0 ? envHome : path.join(os.homedir(), ".ballerina");
    return path.join(ballerinaHome, "repositories");
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

export async function resolvePackageCacheDirs(
    reposDir: string,
    pkg: CorruptPackage,
    distVersion?: string
): Promise<string[]> {
    const targets: string[] = [];
    for (const repo of await listSubDirs(reposDir)) {
        const repoDir = path.join(reposDir, repo);
        for (const cacheDir of await listSubDirs(repoDir)) {
            if (!cacheDirMatches(cacheDir, distVersion)) {
                continue;
            }
            const target = path.join(repoDir, cacheDir, pkg.org, pkg.packageName, pkg.version);
            if (isWithin(reposDir, target)) {
                targets.push(target);
            }
        }
    }
    return targets;
}

async function removeIfExists(dir: string, reposDir: string): Promise<boolean> {
    let realReposDir: string;
    let realDir: string;
    try {
        realReposDir = await fs.realpath(reposDir);
        realDir = await fs.realpath(dir);
    } catch {
        return false; // missing target or unresolvable path — nothing safe to remove
    }
    if (!isWithin(realReposDir, realDir)) {
        return false; // target escapes the repositories root via a symlinked component
    }
    await fs.rm(realDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return true;
}

/** Clears the compiled BIR cache for a single package under cache-<distVersion>. Returns removed dirs. */
export async function clearPackageBirCache(pkg: CorruptPackage, options: ClearOptions = {}): Promise<string[]> {
    const reposDir = reposDirFor(options);
    const removed: string[] = [];
    for (const dir of await resolvePackageCacheDirs(reposDir, pkg, options.distVersion)) {
        if (await removeIfExists(dir, reposDir)) {
            removed.push(dir);
        }
    }
    return removed;
}

/** Fallback: clears every repositories/&ast;/cache-<distVersion> dir. */
export async function clearAllBirCaches(options: ClearOptions = {}): Promise<string[]> {
    const reposDir = reposDirFor(options);
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
 * Surfaces the corrupt-BIR condition and, on confirmation, clears the affected package's compiled
 * cache under the active distribution's cache directory (or all packages in that cache when the
 * package can't be identified) and reloads the window.
 */
export async function promptClearCorruptBirCache(payload: CorruptBirCachePayload | null | undefined): Promise<void> {
    if (promptShown) {
        return;
    }
    promptShown = true;
    try {
        const distVersion = isSafeSegment(payload?.distVersion) ? payload.distVersion : undefined;
        // The LS resolves this against $BALLERINA_HOME_DIR; prefer it over the client's home guess.
        const reposDir =
            typeof payload?.reposPath === "string" && payload.reposPath.length > 0 ? payload.reposPath : undefined;
        const target = isValidPackage(payload)
            ? { org: payload.org, packageName: payload.packageName, version: payload.version }
            : null;
        // Prefer the failing module name for display (that is what the user saw fail); fall back to
        // the package coordinate. The clear itself always targets the package cache dir.
        const displayName = isSafeSegment(payload?.moduleName) ? payload.moduleName : target?.packageName;
        const coordinate = target ? `${target.org}/${displayName}:${target.version}` : undefined;
        const action = "Clear cache & reload";
        const message = coordinate
            ? `The cache for module '${coordinate}' is corrupted.`
            : `A module cache is corrupted.`;
        const detail = coordinate
            ? `Until it's cleared, the project may load without its components.\n\n` +
              `Clearing removes this module's compiled cache and reloads the window to recover. ` +
              `If the module's cache can't be located, all module caches for this distribution are cleared.`
            : `Until it's cleared, the project may load without its components.\n\n` +
              `Clearing removes the module cache and reloads the window to recover.`;

        // A modal blocks interaction so the user can't keep working against the broken (empty)
        // project; a dismissible notification could be ignored. Modals add their own Cancel button.
        const choice = await window.showErrorMessage(message, { modal: true, detail }, action);
        if (choice !== action) {
            return;
        }

        try {
            const removed = target
                ? await clearPackageBirCache(target, { distVersion, reposDir })
                : await clearAllBirCaches({ distVersion, reposDir });
            // The targeted clear matched nothing — the corrupt cache is on disk (that is why the LS
            // reported it), but the coordinates did not resolve to it, e.g. a submodule where the LS
            // fell back to the module name instead of the package name. Clear the whole distribution
            // cache so the user still recovers; the prompt above states this broader scope up front.
            if (target && removed.length === 0) {
                await clearAllBirCaches({ distVersion, reposDir });
            }
        } catch (err) {
            // A file lock (e.g. the JVM holding cache handles on Windows) or permission error can
            // leave the cache partially cleared. Surface it instead of reloading into a broken state.
            // Recovery failed, so the project is still broken — make this modal too so it isn't missed.
            const reason = err instanceof Error ? err.message : String(err);
            window.showErrorMessage("Failed to clear the corrupted module cache.", {
                modal: true,
                detail:
                    `${reason}\n\nClose any running Ballerina processes and try again, ` +
                    `or delete the cache manually.`,
            });
            return;
        }

        await commands.executeCommand("workbench.action.reloadWindow");
    } finally {
        // Reset so a later occurrence can prompt again if the window was not reloaded (dismissed/failed).
        promptShown = false;
    }
}
