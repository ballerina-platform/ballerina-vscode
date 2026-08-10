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

/** Shown when a candidate integration/library name collides with an existing
 *  folder or component title in the target project. */
export const NAME_EXISTS_MESSAGE = "An integration or library with this name already exists in the project";

/** Upper bound on the indexed-name probe (e.g. "Untitled", "Untitled_2", ...). */
export const MAX_DEFAULT_DIRECTORY_ATTEMPTS = 50;

/**
 * Folder names and component titles already in use at/under a target location —
 * gathered once (typically via a `getProjectComponentNames`-style call) and then
 * used both to resolve a collision-free default name/folder and to flag live
 * collisions as the user types. Both sets are pre-lowercased/trimmed so callers can
 * compare with a plain `.has(...)`.
 */
export interface TakenNames {
    folders: Set<string>;
    titles: Set<string>;
}

/** A fresh, empty `TakenNames` — safe default before the real listing resolves. */
export function emptyTakenNames(): TakenNames {
    return { folders: new Set(), titles: new Set() };
}

/** Builds a {@link TakenNames} from a raw `{ folders, titles }` listing (e.g. the
 *  `getProjectComponentNames` RPC response), lowercasing/trimming for comparison. */
export function toTakenNames(raw: { folders?: string[]; titles?: string[] } | null | undefined): TakenNames {
    return {
        folders: new Set((raw?.folders ?? []).map((f) => f.toLowerCase())),
        titles: new Set((raw?.titles ?? []).map((t) => t.trim().toLowerCase())),
    };
}

/**
 * Resolves the first available "<baseName>", "<baseName>_2", "<baseName>_3", ...
 * candidate whose sanitized directory name doesn't collide with `taken.folders` and
 * whose display name doesn't collide with `taken.titles`, up to
 * {@link MAX_DEFAULT_DIRECTORY_ATTEMPTS} attempts. Falls back to the un-indexed base
 * name if every attempt collides (should not happen in practice).
 *
 * Purely client-side/synchronous — the caller resolves `taken` with a single
 * upfront listing call (if any) rather than probing per candidate.
 */
export function resolveDefaultNameAndDirectory(
    baseName: string,
    taken: TakenNames,
    sanitize: (name: string) => string
): { name: string; directoryName: string } {
    for (let attempt = 0; attempt < MAX_DEFAULT_DIRECTORY_ATTEMPTS; attempt++) {
        const name = attempt === 0 ? baseName : `${baseName}_${attempt + 1}`;
        const directoryName = sanitize(name);
        if (!taken.folders.has(directoryName.toLowerCase()) && !taken.titles.has(name.trim().toLowerCase())) {
            return { name, directoryName };
        }
    }
    return { name: baseName, directoryName: sanitize(baseName) };
}

/**
 * Returns {@link NAME_EXISTS_MESSAGE} when `value` collides with an existing
 * integration/library in the target project (by sanitized folder name or by
 * title), else null.
 */
export function checkNameCollision(
    value: string,
    taken: TakenNames,
    sanitize: (name: string) => string
): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const folder = sanitize(trimmed);
    if (taken.folders.has(folder.toLowerCase()) || taken.titles.has(trimmed.toLowerCase())) {
        return NAME_EXISTS_MESSAGE;
    }
    return null;
}
