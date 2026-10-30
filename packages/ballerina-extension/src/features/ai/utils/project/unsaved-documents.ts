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

import { TextDocument, workspace } from 'vscode';
// The core barrel can't be loaded under jest; checkpointUtils imports the same way.
import { isPathInside, isSamePath } from '@wso2/ballerina-core/lib/utils/path-utils';

export const unsavedChangesError = (filePath: string) =>
    `'${filePath}' has unsaved changes in the editor that could not be saved. Ask the user to save or discard them, then retry.`;

function isUnsavedFile(document: TextDocument): boolean {
    return document.uri.scheme === 'file' && document.isDirty;
}

/** `save()` also returns false when the document was saved in the meantime, which is not a failure. */
async function save(document: TextDocument): Promise<boolean> {
    try {
        return (await document.save()) || !document.isDirty;
    } catch {
        return !document.isDirty;
    }
}

/** Returns the paths that are still unsaved. */
export async function saveUnsavedDocuments(root: string): Promise<string[]> {
    const unsaved = workspace.textDocuments.filter(
        (document) => isUnsavedFile(document) && isPathInside(root, document.uri.fsPath)
    );
    const failed: string[] = [];
    for (const document of unsaved) {
        if (!(await save(document))) {
            failed.push(document.uri.fsPath);
        }
    }
    return failed;
}

function findUnsaved(absolutePath: string): TextDocument | undefined {
    return workspace.textDocuments.find(
        (doc) => isUnsavedFile(doc) && isSamePath(doc.uri.fsPath, absolutePath)
    );
}

export function hasUnsavedChanges(absolutePath: string): boolean {
    return findUnsaved(absolutePath) !== undefined;
}

/** Returns false only when the file is open with unsaved changes that could not be saved. */
export async function saveIfUnsaved(absolutePath: string): Promise<boolean> {
    const document = findUnsaved(absolutePath);
    return document ? save(document) : true;
}
