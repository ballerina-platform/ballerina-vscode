// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).

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

// Import-light on purpose: unit tests load this without the language-server chain.

import * as path from "path";
import { URI } from "vscode-uri";
import type { BallerinaProjectComponents, ComponentInfo, ComponentSummary, ModuleSummary, PackageSummary } from "@wso2/ballerina-core";

export interface CollectedBalFile {
    relPath: string;
    lineCount: number;
}

export function toPosixRelPath(basePath: string, targetPath: string): string {
    return path.relative(basePath, targetPath).split(path.sep).join("/");
}

const CODEBASE_MAP_INTRO =
    "This is a map of the codebase — file paths, line counts, and top-level declarations only; " +
    "file bodies are not included. Use `file_read` to read a file before editing it.";

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function formatCodebaseMap(files: CollectedBalFile[], declarations?: Map<string, string[]>): string {
    const fileLines = files.map(file => {
        const decls = declarations?.get(file.relPath);
        const declText = decls && decls.length > 0 ? decls.join("; ") : undefined;
        const escapedPath = escapeXmlText(file.relPath);
        return declText
            ? `<file path="${escapedPath}" lines="${file.lineCount}">${escapeXmlText(declText)}</file>`
            : `<file path="${escapedPath}" lines="${file.lineCount}"/>`;
    });
    return [`<codebase_map>`, CODEBASE_MAP_INTRO, ...fileLines, `</codebase_map>`].join("\n");
}

const DECLARATION_CATEGORIES: Array<[keyof ComponentSummary, string]> = [
    ["services", "service"],
    ["functions", "function"],
    ["records", "record"],
    ["objects", "object"],
    ["classes", "class"],
    ["types", "type"],
    ["constants", "const"],
    ["enums", "enum"],
    ["listeners", "listener"],
    ["moduleVariables", "var"],
    ["configurableVariables", "configurable"],
    ["automations", "automation"],
    ["naturalFunctions", "natural function"],
];

function resolvePackageRoot(pkg: PackageSummary, fallback: string): string {
    if (!pkg.filePath) {
        return fallback;
    }
    try {
        return URI.parse(pkg.filePath).fsPath;
    } catch {
        return fallback;
    }
}

// A single-file package reports the .bal itself as filePath; component paths are not relative to it.
function resolveDeclarationAbsPath(pkg: PackageSummary, module: ModuleSummary, info: ComponentInfo, packagePath: string): string {
    const pkgRoot = resolvePackageRoot(pkg, packagePath);
    if (pkg.filePath?.endsWith(".bal")) {
        return pkgRoot;
    }
    const moduleDir = module.name ? path.join(pkgRoot, "modules", module.name) : pkgRoot;
    return path.join(moduleDir, info.filePath);
}

export function groupDeclarationsByFile(components: BallerinaProjectComponents, packagePath: string): Map<string, string[]> {
    const declarations = new Map<string, string[]>();

    const addDeclaration = (pkg: PackageSummary, module: ModuleSummary, info: ComponentInfo, label: string) => {
        if (!info.filePath) {
            return;
        }
        const absPath = resolveDeclarationAbsPath(pkg, module, info, packagePath);
        const relPath = toPosixRelPath(packagePath, absPath);
        const entry = `${label} ${info.name}`;
        const existing = declarations.get(relPath);
        if (existing) {
            existing.push(entry);
        } else {
            declarations.set(relPath, [entry]);
        }
    };

    for (const pkg of components.packages ?? []) {
        for (const module of pkg.modules ?? []) {
            for (const [key, label] of DECLARATION_CATEGORIES) {
                const items = module[key] as ComponentInfo[] | undefined;
                items?.forEach(item => addDeclaration(pkg, module, item, label));
            }
        }
    }

    return declarations;
}

const SOURCE_INVENTORY_MARKER = "SOURCE INVENTORY";

// Only Stage 1 emits the inventory marker; other transcripts yield undefined.
export function extractPreviousStageWorkPlan(transcript: string): string | undefined {
    const lines = transcript.split("\n");
    const markerIndex = lines.findIndex(line => line.includes(SOURCE_INVENTORY_MARKER));
    if (markerIndex === -1) {
        return undefined;
    }
    const sliced = lines.slice(markerIndex);
    const staleFenceIndex = sliced.findIndex(line => line.trim() === "```");
    if (staleFenceIndex !== -1) {
        sliced.splice(staleFenceIndex, 1);
    }
    return sliced.join("\n").trim();
}
