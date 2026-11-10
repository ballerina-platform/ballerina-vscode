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
// The expr:// copy each form with unsaved edits checks against, by form id. Kept per form: a form
// opened inside another reports itself clean when it opens and takes its own edits with it when it
// closes, and neither may change what the outer form reports. Kept whatever happens to the copy, too:
// a flow node form opens its copy on first focus, after its first edit may have been reported, and
// closes it as any save through it starts, a "+ New Variable" form's included, which leaves the
// outer form open with its edits.
const dirtyForms = new Map<string, string>();

/** Returns whether no other form is open on the file's package, so its expr:// copy must be opened. */
export function registerFormOpen(filePath: string): boolean {
    const copy = exprCopyOf(filePath);
    const count = openFormCounts.get(copy) ?? 0;
    openFormCounts.set(copy, count + 1);
    return count === 0;
}

/** Returns whether no form is left open on the file's package, so its expr:// copy can be closed. */
export function registerFormClose(filePath: string): boolean {
    const copy = exprCopyOf(filePath);
    const count = openFormCounts.get(copy) ?? 0;
    if (count > 1) {
        openFormCounts.set(copy, count - 1);
        return false;
    }
    openFormCounts.delete(copy);
    return true;
}

/** Tracks a form's unsaved edits, until the form reports them gone. See hasDirtyOpenForm for when they count. */
export function setFormDirtyState(filePath: string, formId: string, isDirty: boolean): void {
    if (isDirty) {
        dirtyForms.set(formId, exprCopyOf(filePath));
    } else {
        dirtyForms.delete(formId);
    }
}

export function hasOpenForm(): boolean {
    return openFormCounts.size > 0;
}

/**
 * Whether a form with unsaved edits is on a package a form is open on (see formDidOpen). Edits on a
 * package with no form open do not count: its forms either never opened an expr:// copy, or closed
 * it as their save started, and a save often navigates.
 */
export function hasDirtyOpenForm(): boolean {
    for (const copy of dirtyForms.values()) {
        if (openFormCounts.has(copy)) {
            return true;
        }
    }
    return false;
}

/** Clears form state when navigating away (e.g., user chose "Discard and Navigate"). */
export function clearFormState(): void {
    openFormCounts.clear();
    dirtyForms.clear();
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
