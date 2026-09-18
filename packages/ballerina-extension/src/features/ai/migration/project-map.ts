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

import * as fs from "fs";
import * as path from "path";
import { URI } from "vscode-uri";
import { BallerinaProjectComponents } from "@wso2/ballerina-core";
import { extension } from "../../../BalExtensionContext";
import { CollectedBalFile, formatCodebaseMap, extractPreviousStageWorkPlan, groupDeclarationsByFile, toPosixRelPath } from "./project-map-format";

export { formatCodebaseMap, extractPreviousStageWorkPlan, CollectedBalFile };

const SKIPPED_DIR_NAMES = new Set(["target", "generated"]);

export function collectBalFiles(packagePath: string): CollectedBalFile[] {
    const files: CollectedBalFile[] = [];

    const walk = (dir: string) => {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIPPED_DIR_NAMES.has(entry.name)) {
                    walk(fullPath);
                }
            } else if (entry.isFile() && (entry.name.endsWith(".bal") || entry.name === "Ballerina.toml")) {
                files.push({
                    relPath: toPosixRelPath(packagePath, fullPath),
                    lineCount: countLines(fullPath),
                });
            }
        }
    };

    walk(packagePath);
    return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function countLines(filePath: string): number {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        return content.length === 0 ? 0 : content.split("\n").length;
    } catch {
        return 0;
    }
}

export async function buildMigrationCodebaseMap(packagePath: string): Promise<string> {
    const files = collectBalFiles(packagePath);
    let declarations: Map<string, string[]> | undefined;

    try {
        const components = await extension.ballerinaExtInstance?.langClient?.getBallerinaProjectComponents({
            documentIdentifiers: [{ uri: URI.file(packagePath).toString() }],
        });
        if (components && Array.isArray((components as BallerinaProjectComponents).packages)) {
            declarations = groupDeclarationsByFile(components as BallerinaProjectComponents, packagePath);
        } else {
            console.warn("[MigrationCodebaseMap] Language server does not support getBallerinaProjectComponents — falling back to paths and line counts only.");
        }
    } catch (err) {
        console.warn("[MigrationCodebaseMap] Failed to fetch project components from the language server — falling back to paths and line counts only.", err);
    }

    return formatCodebaseMap(files, declarations);
}
