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

// The project files behind the ICP toggle (main.bal imports, Ballerina.toml), kept free of
// vscode imports so they can be unit tested.

import * as fs from 'fs';
import * as path from 'path';
import type { TextEdit } from "@wso2/ballerina-core";
import { hasICPBuildOptions } from "./build-options";

export const ICP_BRIDGE_IMPORT = 'import wso2/icp.runtime.bridge as _;';

export const ICP_IMPORTS = [
    ICP_BRIDGE_IMPORT,
    'import ballerinax/metrics.logs as _;',
];

export function mainBalPathOf(projectPath: string): string {
    return path.join(projectPath, 'main.bal');
}

export function ballerinaTomlPathOf(projectPath: string): string {
    return path.join(projectPath, 'Ballerina.toml');
}

export function configTomlPathOf(projectPath: string): string {
    return path.join(projectPath, 'Config.toml');
}

/**
 * Throws if the toggle could not finish, so it fails before writing anything rather than
 * after the imports are already in main.bal.
 */
export function checkCanToggleICP(projectPath: string, isUnsaved: (filePath: string) => boolean): void {
    if (!fs.existsSync(ballerinaTomlPathOf(projectPath))) {
        throw new Error(`Ballerina.toml not found in ${projectPath}`);
    }
    // The toggle edits these files from what is on disk: an unsaved buffer would misplace the
    // import edits, have its own changes saved with them, or overwrite the toml writes later.
    const toggledFiles = [mainBalPathOf(projectPath), ballerinaTomlPathOf(projectPath), configTomlPathOf(projectPath)];
    for (const filePath of toggledFiles) {
        if (isUnsaved(filePath)) {
            throw new Error(`${filePath} has unsaved changes. Save it and try again.`);
        }
    }
}

// An import counts only on a line of its own, so a commented-out one is not taken as present.
function isImportLine(line: string, importLine: string): boolean {
    return line.trim().startsWith(importLine);
}

function hasImport(content: string, importLine: string): boolean {
    return content.split('\n').some(line => isImportLine(line, importLine));
}

/**
 * ICP is on only when both halves are in place: the bridge import in main.bal and the build
 * options in Ballerina.toml. Checking only the import reports a half-done enable as enabled.
 */
export function isICPEnabledOnDisk(projectPath: string): boolean {
    try {
        const mainBal = fs.readFileSync(mainBalPathOf(projectPath), 'utf-8');
        const manifest = fs.readFileSync(ballerinaTomlPathOf(projectPath), 'utf-8');
        return hasImport(mainBal, ICP_BRIDGE_IMPORT) && hasICPBuildOptions(manifest);
    } catch {
        return false;
    }
}

/**
 * The edits that add the missing ICP imports after the last import of main.bal. A missing
 * main.bal gets an insertion at the start, for the caller to create the file with.
 */
export function buildAddImportsTextEdits(projectPath: string): { [key: string]: TextEdit[] } {
    const mainBalPath = mainBalPathOf(projectPath);
    const content = fs.existsSync(mainBalPath) ? fs.readFileSync(mainBalPath, 'utf-8') : '';
    const lines = content.split('\n');

    const missingImports = ICP_IMPORTS.filter(imp => !hasImport(content, imp));
    if (missingImports.length === 0) {
        return {};
    }

    let insertLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
            insertLine = i + 1;
        }
    }

    const position = { line: insertLine, character: 0 };
    return { [mainBalPath]: [{ range: { start: position, end: position }, newText: missingImports.join('\n') + '\n' }] };
}

export function buildRemoveImportsTextEdits(projectPath: string): { [key: string]: TextEdit[] } {
    const mainBalPath = mainBalPathOf(projectPath);
    if (!fs.existsSync(mainBalPath)) {
        return {};
    }

    const lines = fs.readFileSync(mainBalPath, 'utf-8').split('\n');
    const edits: TextEdit[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (ICP_IMPORTS.some(imp => isImportLine(lines[i], imp))) {
            edits.push({
                range: { start: { line: i, character: 0 }, end: { line: i + 1, character: 0 } },
                newText: '',
            });
        }
    }

    if (edits.length === 0) {
        return {};
    }

    // Reverse line order so removals don't shift the lines of the ones still to apply.
    edits.sort((a, b) => b.range.start.line - a.range.start.line);
    return { [mainBalPath]: edits };
}
