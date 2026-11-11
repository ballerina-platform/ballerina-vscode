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

// Bad agent input the agent can fix and retry — returned to it, not shown to the user.
export class RecoverableAgentError extends Error {
    constructor(message: string, readonly code: string) {
        super(message);
        this.name = new.target.name;
    }
}

export class PathValidationError extends RecoverableAgentError {
    constructor(message: string) {
        super(message, "INVALID_PATH");
    }
}

export const VALID_FILE_EXTENSIONS = [
    '.bal', '.toml', '.md', '.sql', ".yaml", ".yml", ".json", ".graphql", ".txt"
];

export const RESTRICTED_READ_FILES = ['Config.toml'];

export const MAX_LINE_LENGTH = 2000;

/**
 * Safely resolve a relative path against a base directory, ensuring the
 * result remains contained within the base. Throws on absolute paths, null
 * bytes, or `..` segments that escape the base — these can only come from
 * untrusted agent input and indicate an attempt to leave the project root.
 */
export function resolveContained(basePath: string, relativePath: string): string {
    if (path.isAbsolute(relativePath) || relativePath.includes("\0")) {
        throw new PathValidationError(
            `Invalid path "${relativePath}": must be a relative path within the project`
        );
    }
    const baseResolved = path.resolve(basePath);
    const resolved = path.resolve(baseResolved, relativePath);
    const rel = path.relative(baseResolved, resolved);
    if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
        throw new PathValidationError(
            `Invalid path "${relativePath}": escapes the project root`
        );
    }
    return resolved;
}

/**
 * Detect whether the temp project at `tempPath` is a Ballerina workspace
 * (multi-package). Workspace roots have a Ballerina.toml without a [package]
 * section (typically with a [workspace] section listing packages instead).
 * A single-package project has [package] in its root Ballerina.toml.
 */
export function isWorkspaceTempProject(tempPath: string): boolean {
    const rootToml = path.join(tempPath, "Ballerina.toml");
    if (!fs.existsSync(rootToml)) {
        // No root Ballerina.toml → packages must live in subdirectories
        return true;
    }
    try {
        const content = fs.readFileSync(rootToml, "utf8");
        return !/^\s*\[package\]/m.test(content);
    } catch {
        return false;
    }
}

/**
 * Resolve the package base path from agent input. Validates `packagePath`
 * against directory traversal and ensures workspace projects always supply
 * one so callers never silently fall back to the workspace root.
 *
 * Throws with an actionable message if the input is missing-but-required,
 * escapes the project, or names a directory that does not exist. Callers
 * should catch these and surface them as tool errors to the agent.
 */
export function resolvePackageBasePath(tempPath: string, packagePath?: string): string {
    if (packagePath) {
        const resolved = resolveContained(tempPath, packagePath);
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            throw new PathValidationError(
                `Invalid packagePath: directory "${packagePath}" does not exist in the project`
            );
        }
        return resolved;
    }

    if (isWorkspaceTempProject(tempPath)) {
        throw new PathValidationError(
            "packagePath is required for workspace projects. " +
            "Pass the relative package path (e.g., \"pkg1\") so the operation targets the correct package."
        );
    }
    return tempPath;
}
