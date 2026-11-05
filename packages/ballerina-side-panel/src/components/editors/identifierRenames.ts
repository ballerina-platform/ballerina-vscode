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

import { createContext } from "react";
import { LinePosition, LineRange } from "@wso2/ballerina-core";
import { FormField } from "../Form/types";

/** A rename applied to the source: the identifier at `line`:`offset` changed length by `delta`. */
export interface AppliedRename {
    fileName?: string;
    line: number;
    offset: number;
    delta: number;
}

const shiftPosition = (position: LinePosition, rename: AppliedRename): LinePosition =>
    position && position.line === rename.line && position.offset > rename.offset
        ? { ...position, offset: position.offset + rename.delta }
        : position;

/**
 * Moves a range through renames applied after it was read, in the order they were applied. A rename
 * changes only the length of its own line, so it shifts what follows it on that line and nothing
 * else: renaming a function moves its parameters, renaming a parameter moves the ones after it.
 */
export function shiftRangeForRenames(range: LineRange, renames: AppliedRename[]): LineRange {
    return renames.reduce((current, rename) => {
        if (current.fileName && rename.fileName && current.fileName !== rename.fileName) {
            return current;
        }
        const startLine = shiftPosition(current.startLine, rename);
        const endLine = shiftPosition(current.endLine, rename);
        return startLine === current.startLine && endLine === current.endLine
            ? current
            : { ...current, startLine, endLine };
    }, range);
}

/**
 * The in-place renames (IdentifierEditor) a form has applied. The ranges its fields carry are read
 * once, when the form is given them, and go stale as renames move the source underneath; so a rename
 * at such a range would land on the wrong column and the LS would rename nothing. Each range is
 * tracked from when the form first sees it, and only the renames applied after that move it: a range
 * the form is given again keeps its place, while a freshly read one starts from the source as it is.
 */
export class IdentifierRenameLog {
    private readonly renames: AppliedRename[] = [];
    private readonly trackedFrom = new WeakMap<object, number>();

    /** Starts tracking a range read from the current source; a range already tracked is left as is. */
    track(range: LineRange | undefined) {
        if (range && typeof range === "object" && !this.trackedFrom.has(range)) {
            this.trackedFrom.set(range, this.renames.length);
        }
    }

    /** Tracks the ranges of a form's fields, including those of the parameters they hold. */
    trackFields(fields: FormField[] | undefined) {
        for (const field of fields ?? []) {
            this.track(field?.lineRange);
            for (const param of field?.paramManagerProps?.paramValues ?? []) {
                this.track(param?.identifierRange);
            }
        }
    }

    record(rename: AppliedRename) {
        this.renames.push(rename);
    }

    /** Where a tracked range is now. An untracked range is returned unchanged. */
    current(range: LineRange | undefined): LineRange | undefined {
        const from = range ? this.trackedFrom.get(range) : undefined;
        return from === undefined ? range : shiftRangeForRenames(range, this.renames.slice(from));
    }
}

/** The form's rename log. A nested form (a parameter's editor) shares its parent's. */
export const IdentifierRenameContext = createContext<IdentifierRenameLog | undefined>(undefined);
