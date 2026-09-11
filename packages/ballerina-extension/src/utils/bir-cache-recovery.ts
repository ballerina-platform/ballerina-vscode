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
import { PRODUCT_INTEGRATOR_ISSUES_URL } from "@wso2/ballerina-core";
import { openExternalUrl } from "./runCommand";

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
    // Full failure stack trace, prefilled into the "Send Report" GitHub issue for diagnosis.
    stackTrace?: string;
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

/** Yields the absolute path of every `repositories/&ast;/cache-<distVersion>` dir under reposDir. */
async function* eachCacheDir(reposDir: string, distVersion?: string): AsyncGenerator<string> {
    for (const repo of await listSubDirs(reposDir)) {
        const repoDir = path.join(reposDir, repo);
        for (const cacheDir of await listSubDirs(repoDir)) {
            if (cacheDirMatches(cacheDir, distVersion)) {
                yield path.join(repoDir, cacheDir);
            }
        }
    }
}

export async function resolvePackageCacheDirs(
    reposDir: string,
    pkg: CorruptPackage,
    distVersion?: string
): Promise<string[]> {
    const targets: string[] = [];
    for await (const cacheDir of eachCacheDir(reposDir, distVersion)) {
        const target = path.join(cacheDir, pkg.org, pkg.packageName, pkg.version);
        if (isWithin(reposDir, target)) {
            targets.push(target);
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
    for await (const cacheDir of eachCacheDir(reposDir, options.distVersion)) {
        if (await removeIfExists(cacheDir, reposDir)) {
            removed.push(cacheDir);
        }
    }
    return removed;
}

let promptShown = false; // don't stack a prompt per repeated notification

// Keep the prefilled body comfortably under the practical GitHub issue URL length limit (~8k chars
// once percent-encoded). The stack trace is the only unbounded field, so it is the one we cap.
const MAX_STACKTRACE_CHARS = 4000;

/**
 * Builds a prefilled GitHub "new issue" URL for the corrupt-BIR condition, seeding the title and body
 * with the module coordinate, distribution version, OS, and (truncated) stack trace so a report is
 * one click away. Exported for unit testing.
 */
export function buildCorruptBirIssueUrl(
    payload: CorruptBirCachePayload | null | undefined,
    coordinate?: string
): string {
    const title = coordinate ? `Corrupt BIR cache: ${coordinate}` : "Corrupt BIR cache";
    let stackTrace = typeof payload?.stackTrace === "string" ? payload.stackTrace.trim() : "";
    if (stackTrace.length > MAX_STACKTRACE_CHARS) {
        stackTrace = `${stackTrace.slice(0, MAX_STACKTRACE_CHARS)}\n… (truncated)`;
    }
    const body =
        `**Module:** ${coordinate ?? "(unknown)"}\n` +
        `**Distribution:** ${payload?.distVersion ?? "(unknown)"}\n` +
        `**OS:** ${os.platform()} ${os.release()}\n\n` +
        `**Description**\nA corrupted BIR cache was detected. _Add any extra context here._\n\n` +
        `**Stack trace**\n` +
        (stackTrace ? "```\n" + stackTrace + "\n```" : "_Not available._");
    const query = `title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    return `${PRODUCT_INTEGRATOR_ISSUES_URL}/new?${query}`;
}

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
        const clearAction = "Clear cache & reload";
        const reportAction = "Report an Issue";
        const message = coordinate
            ? `The cache for module '${coordinate}' is corrupted.\n` +
              `The project will stay unresponsive until this is resolved.\n` +
              `Clearing removes the module's cache (or all module caches for this distribution if it ` +
              `can't be located) and reloads the window to recover.`
            : `A module cache is corrupted.\n` +
              `The project will stay unresponsive until this is resolved.\n` +
              `Clearing removes the module cache and reloads the window to recover.`;

        // VS Code dismisses a notification whenever an action button is clicked; there is no way to
        // keep it open. So "Report an Issue" just opens the prefilled issue and lets it close.
        const choice = await window.showErrorMessage(message, clearAction, reportAction);
        if (choice === reportAction) {
            openExternalUrl(buildCorruptBirIssueUrl(payload, coordinate));
            return;
        }
        if (choice !== clearAction) {
            return; // Dismissed
        }
        // proceed to clear + reload

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
            const reason = err instanceof Error ? err.message : String(err);
            window.showErrorMessage(
                `Failed to clear the corrupted module cache: ${reason}. ` +
                    `Close any running Ballerina processes and try again, or delete the cache manually.`
            );
            return;
        }

        await commands.executeCommand("workbench.action.reloadWindow");
    } finally {
        // Reset so a later occurrence can prompt again if the window was not reloaded (dismissed/failed).
        promptShown = false;
    }
}
