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
 * resolve outside the workspace are dropped: the update builds in, and edits, each member's folder.
 */
export function getWorkspacePackagePaths(root: string): string[] | undefined {
    try {
        const workspaceTable = parse(fs.readFileSync(path.join(root, BALLERINA_TOML), 'utf8')).workspace as
            Record<string, unknown> | undefined;
        const packages = workspaceTable?.packages;
        if (!Array.isArray(packages)) {
            return undefined;
        }
        return packages.filter((member): member is string => typeof member === 'string')
            .map((member) => path.resolve(root, member))
            .filter((member) => {
                const relative = path.relative(root, member);
                return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
            });
    } catch {
        return undefined;
    }
}

/** Every package under `root` (the package itself, or each workspace member) whose lock needs updating. */
export function findOutdatedPackages(root: string): OutdatedPackage[] {
    const members = getWorkspacePackagePaths(root);
    const outdated: OutdatedPackage[] = [];
    for (const packagePath of members ?? [root]) {
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

/** `org/name:version` of every explicit `[[dependency]]` pin in Ballerina.toml. */
export function findPinnedDependencies(text: string): string[] {
    const pins: string[] = [];
    // [[dependency]] tables run up to the next table header (or EOF).
    const tableRegex = /^[ \t]*\[\[dependency\]\][^\n]*\n([\s\S]*?)(?=^[ \t]*\[|(?![\s\S]))/gm;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(text)) !== null) {
        const org = /^[ \t]*org[ \t]*=[ \t]*"([^"]+)"/m.exec(match[1])?.[1];
        const name = /^[ \t]*name[ \t]*=[ \t]*"([^"]+)"/m.exec(match[1])?.[1];
        const version = /^[ \t]*version[ \t]*=[ \t]*"([^"]+)"/m.exec(match[1])?.[1];
        if (org && name && version) {
            pins.push(`${org}/${name}:${version}`);
        }
    }
    return pins;
}

export function readManifestDistribution(projectPath: string): string | undefined {
    try {
        return findManifestDistribution(fs.readFileSync(path.join(projectPath, BALLERINA_TOML), 'utf8'))?.value;
    } catch {
        return undefined;
    }
}

/**
 * The distribution to go back to in order to keep the current lock: the one it was resolved on, else the one
 * Ballerina.toml names. Pre-releases cannot be pulled, so their GA is returned instead.
 */
export function getRollbackDistribution(lockedVersion?: string, manifestDistribution?: string): string | undefined {
    for (const candidate of [lockedVersion, manifestDistribution]) {
        const version = parseDistributionVersion(candidate);
        if (version && isBeforeRequiredDistribution(candidate)) {
            return `${version.major}.${version.minor}.${version.patch}`;
        }
    }
    return undefined;
}

/** Across several packages, the newest of their rollback distributions: the smallest step back that suits all. */
export function pickRollbackDistribution(
    packages: { lockedVersion?: string; manifestDistribution?: string }[]
): string | undefined {
    let newest: string | undefined;
    for (const item of packages) {
        const candidate = getRollbackDistribution(item.lockedVersion, item.manifestDistribution);
        if (candidate && (!newest || compareDistributionVersions(candidate, newest) > 0)) {
            newest = candidate;
        }
    }
    return newest;
}

function compareDistributionVersions(a: string, b: string): number {
    const left = parseDistributionVersion(a);
    const right = parseDistributionVersion(b);
    return (left.major - right.major) || (left.minor - right.minor) || (left.patch - right.patch);
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
