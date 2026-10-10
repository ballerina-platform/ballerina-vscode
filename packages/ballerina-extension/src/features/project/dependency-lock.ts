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

// Pure Dependencies.toml / Ballerina.toml reading, kept free of `vscode` so it can be unit tested.

import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@iarna/toml';

/**
 * The first distribution on Java 25. The language server needs it (see the JDK check in core/extension.ts),
 * and a Dependencies.toml resolved by anything older locks package versions that predate the Java 25 fixes.
 */
export const REQUIRED_BALLERINA_VERSION = '2201.14.0';

export const BALLERINA_TOML = 'Ballerina.toml';
export const DEPENDENCIES_TOML = 'Dependencies.toml';

interface DistributionVersion {
    major: number;
    minor: number;
    patch: number;
}

export type LockAssessment =
    | { kind: 'no-lock' }
    | { kind: 'current'; lockedVersion: string }
    | { kind: 'outdated'; lockedVersion?: string }
    | { kind: 'unknown' };

/** Accepts `2201.14.0`, `2201.14.0-alpha` and `Ballerina 2201.14.0 (Swan Lake Update 14)`. */
export function parseDistributionVersion(value: string | undefined): DistributionVersion | undefined {
    const match = value?.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        return undefined;
    }
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** Numeric only: a 2201.14.0 pre-release already runs on Java 25. Unparseable versions are never "before". */
export function isBeforeRequiredDistribution(value: string | undefined): boolean {
    const current = parseDistributionVersion(value);
    const required = parseDistributionVersion(REQUIRED_BALLERINA_VERSION);
    if (!current) {
        return false;
    }
    if (current.major !== required.major) {
        return current.major < required.major;
    }
    if (current.minor !== required.minor) {
        return current.minor < required.minor;
    }
    return current.patch < required.patch;
}

/** Negative, zero or positive as `a` is older than, the same as, or newer than `b`; `undefined` if either is unreadable. */
export function compareDistributionVersions(a: string | undefined, b: string | undefined): number | undefined {
    const left = parseDistributionVersion(a);
    const right = parseDistributionVersion(b);
    if (!left || !right) {
        return undefined;
    }
    return (left.major - right.major) || (left.minor - right.minor) || (left.patch - right.patch);
}

/** Only a runtime that is itself on the required distribution can re-resolve a lock onto it. */
export function isRuntimeOnRequiredDistribution(runtimeVersion: string | undefined): boolean {
    return !!parseDistributionVersion(runtimeVersion) && !isBeforeRequiredDistribution(runtimeVersion);
}

export function assessDependencyLockText(text: string): LockAssessment {
    let lockedVersion: unknown;
    try {
        const ballerina = parse(text).ballerina as Record<string, unknown> | undefined;
        lockedVersion = ballerina?.['distribution-version'];
    } catch {
        return { kind: 'unknown' };
    }
    if (lockedVersion === undefined) {
        return { kind: 'outdated' }; // v1 lock files predate the field
    }
    if (typeof lockedVersion !== 'string' || !parseDistributionVersion(lockedVersion)) {
        return { kind: 'unknown' };
    }
    return isBeforeRequiredDistribution(lockedVersion)
        ? { kind: 'outdated', lockedVersion }
        : { kind: 'current', lockedVersion };
}

export function assessDependencyLock(projectPath: string): LockAssessment {
    let text: string;
    try {
        text = fs.readFileSync(path.join(projectPath, DEPENDENCIES_TOML), 'utf8');
    } catch (error) {
        return (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? { kind: 'no-lock' } : { kind: 'unknown' };
    }
    return assessDependencyLockText(text);
}

export interface OutdatedPackage {
    path: string;
    /** Relative to the workspace root, or the folder name of a lone package. */
    name: string;
    lockedVersion?: string;
}

/**
 * Absolute member paths when `root` is a workspace (each member keeps its own Dependencies.toml). Members that
 * resolve outside the workspace, including through a symlink, are dropped: the update builds in, and edits, each
 * member's folder.
 */
export function getWorkspacePackagePaths(root: string): string[] | undefined {
    try {
        const workspaceTable = parse(fs.readFileSync(path.join(root, BALLERINA_TOML), 'utf8')).workspace as
            Record<string, unknown> | undefined;
        const packages = workspaceTable?.packages;
        if (!Array.isArray(packages)) {
            return undefined;
        }
        const realRoot = realPath(root);
        return packages.filter((member): member is string => typeof member === 'string')
            .map((member) => path.resolve(root, member))
            .filter((member) => {
                const relative = path.relative(realRoot, realPath(member));
                const escapes = relative === '..' || relative.startsWith(`..${path.sep}`);
                return !!relative && !escapes && !path.isAbsolute(relative); // `..shared` is a member folder, not an escape
            });
    } catch {
        return undefined;
    }
}

/**
 * Where the path really points. For a path that doesn't exist yet, its nearest existing parent is resolved and the
 * rest appended, so it compares against a resolved root (for example `/var` -> `/private/var` on macOS).
 */
function realPath(target: string): string {
    const missing: string[] = [];
    let current = path.resolve(target);
    while (true) {
        try {
            return path.join(fs.realpathSync.native(current), ...missing);
        } catch {
            const parent = path.dirname(current);
            if (parent === current) {
                return path.resolve(target);
            }
            missing.unshift(path.basename(current));
            current = parent;
        }
    }
}

/** `[build-options] sticky = true` in a manifest, or `false` when it can't be read. */
function declaresSticky(manifestDir: string): boolean {
    try {
        const buildOptions = parse(fs.readFileSync(path.join(manifestDir, BALLERINA_TOML), 'utf8'))['build-options'] as
            Record<string, unknown> | undefined;
        return buildOptions?.sticky === true;
    } catch {
        return false;
    }
}

/**
 * Every package under `root` (the package itself, or each workspace member) whose lock needs updating. Only sticky
 * packages qualify: a non-sticky build re-resolves a lock from an older distribution by itself.
 */
export function findOutdatedPackages(root: string): OutdatedPackage[] {
    const members = getWorkspacePackagePaths(root);
    const workspaceSticky = !!members && declaresSticky(root);
    const outdated: OutdatedPackage[] = [];
    for (const packagePath of members ?? [root]) {
        if (!workspaceSticky && !declaresSticky(packagePath)) {
            continue;
        }
        const assessment = assessDependencyLock(packagePath);
        if (assessment.kind === 'outdated') {
            outdated.push({
                path: packagePath,
                name: members ? path.relative(root, packagePath) : path.basename(packagePath),
                lockedVersion: assessment.lockedVersion
            });
        }
    }
    return outdated;
}

/** Offsets of the `distribution` value inside Ballerina.toml's `[package]` table, if it declares one. */
export function findManifestDistribution(text: string): { start: number; end: number; value: string } | undefined {
    const header = /^[ \t]*\[package\][ \t]*(#.*)?$/m.exec(text);
    if (!header) {
        return undefined;
    }
    const bodyStart = header.index + header[0].length;
    const nextTable = /^[ \t]*\[/m.exec(text.slice(bodyStart));
    const body = text.slice(bodyStart, nextTable ? bodyStart + nextTable.index : text.length);
    const field = /^[ \t]*distribution[ \t]*=[ \t]*"([^"]*)"/m.exec(body);
    if (!field) {
        return undefined;
    }
    const start = bodyStart + field.index + field[0].lastIndexOf(`"${field[1]}"`) + 1;
    return { start, end: start + field[1].length, value: field[1] };
}

/** The package root enclosing `filePath` (a file or a directory), or `undefined` outside a package. */
export function findPackageRoot(filePath: string): string | undefined {
    let current = path.resolve(filePath);
    while (true) {
        if (fs.existsSync(path.join(current, BALLERINA_TOML))) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}
