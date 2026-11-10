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

import { normalizeProjectPath } from '@wso2/ballerina-core';
import { findPackageRoot } from '../../features/project/dependency-lock';

// How many open forms check their expressions against each expr:// copy. The language server copies
// a whole package when a form on any of its files opens, and drops that copy when a form on any of its
// files closes. A form can open another on the same package (a flow node form's "+ New Variable" on
// its own file, its "+ New Function" on functions.bal), so the copy is shared, and has to outlive the
// inner form.
const openFormCounts = new Map<string, number>();
// The expr:// copy each file with unsaved edits checks against, by file. Edits are taken from any file
// on an open package, so they go with the package: as its first form opens and its last one closes.
const dirtyFiles = new Map<string, string>();

/** Returns whether no other form is open on the file's package, so its expr:// copy must be opened. */
export function registerFormOpen(filePath: string): boolean {
    const copy = exprCopyOf(filePath);
    const count = openFormCounts.get(copy) ?? 0;
    openFormCounts.set(copy, count + 1);
    if (count === 0) {
        clearDirtyFiles(copy);
    }
    dirtyFiles.delete(filePath);
    return count === 0;
}

/** Returns whether no form is left open on the file's package, so its expr:// copy can be closed. */
export function registerFormClose(filePath: string): boolean {
    dirtyFiles.delete(filePath);
    const copy = exprCopyOf(filePath);
    const count = openFormCounts.get(copy) ?? 0;
    if (count > 1) {
        openFormCounts.set(copy, count - 1);
        return false;
    }
    openFormCounts.delete(copy);
    clearDirtyFiles(copy);
    return true;
}

/** Tracks dirty state for a form on an already-open package (see formDidOpen). Ignored if the package is not open. */
export function setFormDirtyState(filePath: string, isDirty: boolean): void {
    if (!isDirty) {
        dirtyFiles.delete(filePath);
        return;
    }
    const copy = exprCopyOf(filePath);
    if (openFormCounts.has(copy)) {
        dirtyFiles.set(filePath, copy);
    }
}

export function hasOpenForm(): boolean {
    return openFormCounts.size > 0;
}

export function hasDirtyOpenForm(): boolean {
    return dirtyFiles.size > 0;
}

/** Clears form state when navigating away (e.g., user chose "Discard and Navigate"). */
export function clearFormState(): void {
    openFormCounts.clear();
    dirtyFiles.clear();
}

// The language server keeps one expr:// copy per package, and one per file outside a package. Forms
// get their file paths from different sources (the flow model, VS Code's fsPath), which can spell one
// package differently, so the path is normalized.
//
// In a workspace the language server copies every package when a form opens on one, and drops only
// that form's package when it closes. Packages are still counted apart here: counting the workspace
// as one copy would leave open the copies of packages whose forms have all closed. A form opening on
// a second package therefore copies the first one again, which loses nothing: every request against
// a copy carries the text it checks.
function exprCopyOf(filePath: string): string {
    return normalizeProjectPath(findPackageRoot(filePath) ?? filePath);
}

function clearDirtyFiles(copy: string): void {
    for (const [filePath, dirtyCopy] of dirtyFiles) {
        if (dirtyCopy === copy) {
            dirtyFiles.delete(filePath);
        }
    }
}
