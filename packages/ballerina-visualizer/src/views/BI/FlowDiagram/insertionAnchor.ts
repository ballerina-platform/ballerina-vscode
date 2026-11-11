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

import { Branch, Flow, FlowNode, LinePosition, LineRange } from "@wso2/ballerina-core";

export type InsertionAnchor = FlowNode | Branch;

type Entry = { anchor: InsertionAnchor; key: string };

const normalized = (source?: string) => (source ?? "").replace(/\s+/g, " ").trim();

// Line ranges move with any edit above them; the kind and the source do not. A block's key is its header only,
// so an edit inside the block still finds it.
function entriesOf(nodes: FlowNode[] = [], parentKey = "", out: Entry[] = []): Entry[] {
    for (const node of nodes) {
        const kind = node.codedata?.node;
        const source = node.codedata?.sourceCode ?? "";
        const lines = source.split("\n");
        // A function's start is its signature, past the doc comment and annotations.
        const key = kind === "EVENT_START" ? `${parentKey}${kind}|${normalized(lines.find((line) => !/^\s*[#@]/.test(line)))}`
            : node.branches?.length ? `${parentKey}${kind}|${normalized(lines[0])}`
                : `${parentKey}${kind}|${normalized(source)}`;
        out.push({ anchor: node, key });
        node.branches?.forEach((branch, index) => {
            const branchKey = `${key}>${branch.label}#${index}`;
            out.push({ anchor: branch, key: branchKey });
            entriesOf(branch.children, `${branchKey}/`, out);
        });
    }
    return out;
}

const isBefore = (a: LinePosition, b: LinePosition) => a.line < b.line || (a.line === b.line && a.offset < b.offset);

const sameRange = (a?: LineRange, b?: LineRange) =>
    !!a && !!b && a.startLine.line === b.startLine.line && a.startLine.offset === b.startLine.offset
    && a.endLine.line === b.endLine.line && a.endLine.offset === b.endLine.offset;

// The + inserts after an anchor's end or at its start, so the target moves exactly as that point moved.
function shift(target: LinePosition, from: LineRange, to: LineRange): LinePosition {
    const [was, now] = isBefore(target, from.endLine) ? [from.startLine, to.startLine] : [from.endLine, to.endLine];
    return target.line === was.line
        ? { line: now.line, offset: target.offset + now.offset - was.offset }
        : { line: target.line + now.line - was.line, offset: target.offset };
}

const startKey = (entries: Entry[]) => entries.find((entry) => entry.anchor.codedata?.node === "EVENT_START")?.key;

// The same anchor in the newer flow: same key and the same place among anchors sharing it.
function counterpart(before: Entry[], after: Entry[], anchor: InsertionAnchor, from: LineRange) {
    const own = before.find((entry) => entry.anchor === anchor)
        ?? before.find((entry) => sameRange(entry.anchor.codedata?.lineRange, from));
    // A view that moved to another function shares no insertion point with this one.
    if (!own || startKey(before) !== startKey(after)) {
        return undefined;
    }
    const was = before.filter((entry) => entry.key === own.key);
    const now = after.filter((entry) => entry.key === own.key);
    return was.length === now.length ? now[was.indexOf(own)]?.anchor : undefined;
}

// Undefined when the anchor is gone or cannot be told apart from another, so the caller never guesses.
export function reanchorInsertion(previous: Flow, current: Flow, anchor: InsertionAnchor, target: LineRange):
    { anchor: InsertionAnchor; target: LineRange } | undefined {
    const from = anchor?.codedata?.lineRange;
    if (!previous?.nodes || !current?.nodes || previous.fileName !== current.fileName || !from || !target) {
        return undefined;
    }
    const match = counterpart(entriesOf(previous.nodes), entriesOf(current.nodes), anchor, from);
    const to = match?.codedata?.lineRange;
    if (!to) {
        return undefined;
    }
    return {
        anchor: match,
        target: { ...target, startLine: shift(target.startLine, from, to), endLine: shift(target.endLine, from, to) },
    };
}
