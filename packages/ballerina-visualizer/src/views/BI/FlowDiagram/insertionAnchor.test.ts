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

import { Branch, ELineRange, Flow, FlowNode } from "@wso2/ballerina-core";
import { reanchorInsertion } from "./insertionAnchor";

const range = (startLine: number, startOffset: number, endLine: number, endOffset: number): ELineRange => ({
    fileName: "main.bal",
    startLine: { line: startLine, offset: startOffset },
    endLine: { line: endLine, offset: endOffset },
});

const at = (line: number, offset: number): ELineRange => range(line, offset, line, offset);

const node = (kind: string, sourceCode: string, lineRange: ELineRange, branches: Branch[] = []): FlowNode => ({
    id: `${kind}-${lineRange.startLine.line}`,
    codedata: { node: kind, sourceCode, lineRange },
    branches,
} as unknown as FlowNode);

const branch = (label: string, sourceCode: string, lineRange: ELineRange, children: FlowNode[]): Branch => ({
    label,
    codedata: { node: "CONDITIONAL", sourceCode, lineRange },
    children,
} as unknown as Branch);

const flow = (nodes: FlowNode[], fileName = "main.bal"): Flow => ({ fileName, nodes } as unknown as Flow);

// function f() {        line 10
//     int a = 1;        line 11
//     int b = 2;        line 12
//     if a > b {        line 13
//         log(a);       line 14
//     }                 line 15
// }                     line 16
function original(shift = 0, extra: FlowNode[] = []) {
    const s = (line: number) => line + shift;
    const log = node("LOG", "log(a);", range(s(14), 8, s(14), 15));
    const thenBranch = branch("Then", "{\n log(a);\n }", range(s(13), 13, s(15), 5), [log]);
    const ifNode = node("IF", "if a > b {\n log(a);\n }", range(s(13), 4, s(15), 5), [thenBranch]);
    const start = node("EVENT_START", "# Does f.\n@display {}\nfunction f() {...}", range(10, 0, s(16), 1));
    const a = node("VARIABLE", "int a = 1;", range(s(11), 4, s(11), 14));
    const b = node("VARIABLE", "int b = 2;", range(s(12), 4, s(12), 14));
    return { model: flow([start, ...extra, a, b, ifNode]), start, a, b, ifNode, thenBranch, log };
}

describe("reanchorInsertion", () => {
    it("moves an insertion after a node down with a line added above it", () => {
        const before = original();
        const after = original(1);
        const moved = reanchorInsertion(before.model, after.model, before.b, at(12, 14));
        expect(moved?.anchor).toBe(after.b);
        expect(moved?.target).toEqual(at(13, 14));
    });

    it("keeps the insertion point when the change is below it", () => {
        const before = original();
        const after = original();
        after.log.codedata.sourceCode = "log(b);";
        const moved = reanchorInsertion(before.model, after.model, before.a, at(11, 14));
        expect(moved?.target).toEqual(at(11, 14));
    });

    it("follows a node whose line was joined with the one above", () => {
        const before = original();
        const after = original();
        after.b.codedata.lineRange = range(11, 20, 11, 30);
        const moved = reanchorInsertion(before.model, after.model, before.b, at(12, 14));
        expect(moved?.target).toEqual(at(11, 30));
    });

    it("finds the start of a block after an edit inside the function", () => {
        const before = original();
        const after = original(2);
        const moved = reanchorInsertion(before.model, after.model, before.start, at(10, 1));
        expect(moved?.anchor).toBe(after.start);
        expect(moved?.target).toEqual(at(10, 1));
    });

    it("finds a branch whose body changed", () => {
        const before = original();
        const after = original(1);
        after.thenBranch.codedata.sourceCode = "{\n log(a);\n log(b);\n }";
        after.ifNode.codedata.sourceCode = "if a > b {\n log(a);\n log(b);\n }";
        const moved = reanchorInsertion(before.model, after.model, before.thenBranch, at(13, 14));
        expect(moved?.anchor).toBe(after.thenBranch);
        expect(moved?.target).toEqual(at(14, 14));
    });

    it("follows a node inside a branch", () => {
        const before = original();
        const after = original(3);
        const moved = reanchorInsertion(before.model, after.model, before.log, at(14, 15));
        expect(moved?.anchor).toBe(after.log);
        expect(moved?.target).toEqual(at(17, 15));
    });

    it("tells identical statements apart by their order", () => {
        const twin = () => node("VARIABLE", "int b = 2;", range(11, 4, 11, 14));
        const before = original(1, [twin()]);
        const after = original(2, [twin()]);
        after.model.nodes[1].codedata.lineRange = range(12, 4, 12, 14);
        const moved = reanchorInsertion(before.model, after.model, before.b, at(13, 14));
        expect(moved?.anchor).toBe(after.b);
        expect(moved?.target).toEqual(at(14, 14));
    });

    it("gives up when an identical statement is added, since the order no longer identifies the node", () => {
        const before = original();
        const after = original(1, [node("VARIABLE", "int b = 2;", range(11, 4, 11, 14))]);
        expect(reanchorInsertion(before.model, after.model, before.b, at(12, 14))).toBeUndefined();
    });

    it("gives up when the node it follows was edited", () => {
        const before = original();
        const after = original();
        after.b.codedata.sourceCode = "int b = 3;";
        expect(reanchorInsertion(before.model, after.model, before.b, at(12, 14))).toBeUndefined();
    });

    it("gives up when the node it follows was deleted", () => {
        const before = original();
        const after = original();
        after.model.nodes = after.model.nodes.filter((candidate) => candidate !== after.b);
        expect(reanchorInsertion(before.model, after.model, before.b, at(12, 14))).toBeUndefined();
    });

    it("does not take another function's start for this one's", () => {
        const before = original();
        const other = original();
        other.start.codedata.sourceCode = "# Another.\nfunction g() {...}";
        expect(reanchorInsertion(before.model, other.model, before.start, at(10, 1))).toBeUndefined();
    });

    it("does not match a statement in another function that has the same source", () => {
        const before = original();
        const other = original();
        other.start.codedata.sourceCode = "function g() {...}";
        expect(reanchorInsertion(before.model, other.model, before.b, at(12, 14))).toBeUndefined();
    });

    it("gives up when the flow is of another file", () => {
        const before = original();
        const after = original();
        expect(reanchorInsertion(before.model, flow(after.model.nodes, "other.bal"), before.b, at(12, 14)))
            .toBeUndefined();
    });

    it("matches an anchor object from an older copy of the model by its range", () => {
        const before = original();
        const after = original(1);
        const copy = { ...before.b, codedata: { ...before.b.codedata } };
        expect(reanchorInsertion(before.model, after.model, copy, at(12, 14))?.anchor).toBe(after.b);
    });
});
