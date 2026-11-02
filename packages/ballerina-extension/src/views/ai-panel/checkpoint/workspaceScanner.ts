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
import { ScannedFile } from './types';
import { inChunks } from './backends/captureSupport';

export async function scanWorkspace(root: vscode.Uri, ignorePatterns: string[]): Promise<ScannedFile[]> {
    const include = new vscode.RelativePattern(root, '**/*');
    const exclude = ignorePatterns.length > 0
        ? new vscode.RelativePattern(root, `{${ignorePatterns.join(',')}}`)
        : null;
    const uris = await vscode.workspace.findFiles(include, exclude);
    const files: ScannedFile[] = [];
    for (const chunk of inChunks(uris)) {
        files.push(...await Promise.all(chunk.map(uri => statFile(root, uri))));
    }
    return files;
}

async function statFile(root: vscode.Uri, uri: vscode.Uri): Promise<ScannedFile> {
    const relativePath = path.relative(root.fsPath, uri.fsPath).split(path.sep).join('/');
    // A file that cannot be stat'd is still listed: dropping it would let a restore delete it.
    try {
        const stats = await fs.promises.stat(uri.fsPath);
        return { path: relativePath, uri, size: stats.size, mtimeMs: stats.mtimeMs };
    } catch {
        return { path: relativePath, uri, size: 0, mtimeMs: 0 };
    }
}
