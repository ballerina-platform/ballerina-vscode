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

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getBallerinaPackages } from '../../utils/config';

// New evalsets go to tests/resources/evalsets, but a copied one still loads from anywhere in the package.
export const EVALSET_GLOB = '**/*.evalset.json';
export const EVALSET_EXCLUDE = '**/target/**';

export async function ensureEvalsetsDirectory(): Promise<string | undefined> {
    // Check if workspace is open
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        throw new Error('Please open a workspace first');
    }

    // Discover all Ballerina packages across workspace folders
    const allPackages: string[] = [];
    for (const folder of vscode.workspace.workspaceFolders) {
        const packages = await getBallerinaPackages(folder.uri);
        allPackages.push(...packages);
    }

    let projectRoot: string;
    if (allPackages.length === 0) {
        throw new Error('No Ballerina packages found in workspace');
    } else if (allPackages.length === 1) {
        projectRoot = allPackages[0];
    } else {
        const selected = await vscode.window.showQuickPick(
            allPackages.map(pkg => ({
                label: path.basename(pkg),
                description: vscode.workspace.asRelativePath(pkg),
                packagePath: pkg
            })),
            { placeHolder: 'Select a project to create the evalset in' }
        );

        if (!selected) {
            return undefined;
        }

        projectRoot = selected.packagePath;
    }

    const testsDir = path.join(projectRoot, 'tests');
    const testsDirUri = vscode.Uri.file(testsDir);
    try {
        await vscode.workspace.fs.createDirectory(testsDirUri);
    } catch (e) {
        // Directory might exist, ignore
    }

    const resourcesDir = path.join(testsDir, 'resources');
    const resourcesDirUri = vscode.Uri.file(resourcesDir);
    try {
        await vscode.workspace.fs.createDirectory(resourcesDirUri);
    } catch (e) {
        // Directory might exist, ignore
    }

    const evalsetsDir = path.join(resourcesDir, 'evalsets');
    const evalsetsDirUri = vscode.Uri.file(evalsetsDir);
    try {
        await vscode.workspace.fs.createDirectory(evalsetsDirUri);
    } catch (e) {
        // Directory might exist, ignore
    }

    return evalsetsDir;
}

export function validateEvalsetName(name: string, evalsetsDir: string): string | null {
    if (!name || name.trim().length === 0) {
        return 'Evalset name cannot be empty';
    }
    if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
        return 'Name can only contain letters, numbers, hyphens, and underscores';
    }
    if (name.length > 100) {
        return 'Name is too long (max 100 characters)';
    }
    const filePath = path.join(evalsetsDir, `${name}.evalset.json`);
    if (fs.existsSync(filePath)) {
        return 'An evalset with this name already exists';
    }
    return null; // Valid
}

export function validateThreadName(name: string): string | null {
    if (!name || name.trim().length === 0) {
        return 'Thread name cannot be empty';
    }
    if (name.length > 100) {
        return 'Thread name is too long (max 100 characters)';
    }
    return null; // Valid
}

export async function findExistingEvalsets(evalsetsDir: string): Promise<Array<{
    label: string;
    description: string;
    filePath: string;
}>> {
    const packageRoot = path.resolve(evalsetsDir, '..', '..', '..');
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(packageRoot, EVALSET_GLOB), EVALSET_EXCLUDE);

    return files.map(uri => ({
        label: path.basename(uri.fsPath, '.evalset.json'),
        description: uri.fsPath,
        filePath: uri.fsPath
    }));
}
