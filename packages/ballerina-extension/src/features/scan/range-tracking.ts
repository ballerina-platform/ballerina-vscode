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

import * as vscode from "vscode";

export interface TextChange {
    range: vscode.Range;
    text: string;
}

/**
 * Maps a range through document changes, or returns undefined when a change touches it. Changes are those of one
 * change event, all against the document before it.
 */
export function trackRange(range: vscode.Range, changes: readonly TextChange[]): vscode.Range | undefined {
    let current = range;
    for (const change of descending(changes)) {
        const changeIsEmpty = compare(change.range.start, change.range.end) === 0;
        if (compare(change.range.start, current.end) < 0 && compare(current.start, change.range.end) < 0) {
            return undefined;
        }
        const start = trackPosition(current.start, change);
        // Text typed right after a range is not part of it.
        const end = compare(current.start, current.end) === 0 ? start
            : changeIsEmpty && compare(change.range.start, current.end) === 0 ? current.end
                : trackPosition(current.end, change);
        if (!start || !end) {
            return undefined;
        }
        current = new vscode.Range(start, end);
    }
    return current;
}

// Later changes first, so each change's range is still valid against the positions mapped so far.
function descending(changes: readonly TextChange[]): TextChange[] {
    return [...changes].sort((a, b) => compare(b.range.start, a.range.start));
}

function compare(a: vscode.Position, b: vscode.Position): number {
    return a.line - b.line || a.character - b.character;
}

function trackPosition(position: vscode.Position, change: TextChange): vscode.Position | undefined {
    const { start, end } = change.range;
    const fromStart = compare(position, start);
    if (fromStart < 0 || (fromStart === 0 && compare(start, end) !== 0)) {
        return position;
    }
    if (compare(position, end) < 0) {
        return undefined;
    }
    const lines = change.text.split(/\r\n|\r|\n/);
    const line = position.line + lines.length - 1 - (end.line - start.line);
    if (position.line !== end.line) {
        return new vscode.Position(line, position.character);
    }
    const lastLineEnd = lines.length === 1 ? start.character + change.text.length : lines[lines.length - 1].length;
    return new vscode.Position(line, lastLineEnd + position.character - end.character);
}
