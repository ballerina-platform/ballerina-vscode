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

import { moveInFlow, outermost, removeAllFromFlow, resolveAnchor, targetAfter } from "../components/NodeDrag/flowMoves";
import { Branch, Flow, FlowNode } from "../utils/types";

const range = (line: number, start: number, endLine: number, end: number) => ({
    fileName: "main.bal",
    startLine: { line, offset: start },
    endLine: { line: endLine, offset: end },
});

const statement = (id: string, line: number, start = 4, end = 20): FlowNode =>
    ({
        id,
        metadata: { label: id, description: "" },
        codedata: { node: "VARIABLE", lineRange: range(line, start, line, end) },
        branches: [],
        returning: false,
    }) as FlowNode;

const branch = (label: string, node: string, line: number, endLine: number, children: FlowNode[]): Branch =>
    ({ label, kind: "block", codedata: { node, lineRange: range(line, 7, endLine, 5) }, repeatable: "ONE", properties: {}, children }) as Branch;

const errorHandler = (id: string, body: FlowNode[], onFail: FlowNode[]): FlowNode =>
    ({
        id,
        metadata: { label: "Error Handler", description: "" },
        codedata: { node: "ERROR_HANDLER", lineRange: range(5, 4, 11, 5) },
        branches: [branch("Body", "BODY", 5, 8, body), branch("On Failure", "ON_FAILURE", 8, 11, onFail)],
        returning: false,
    }) as FlowNode;

const flow = (nodes: FlowNode[]): Flow => ({ fileName: "main.bal", nodes, connections: [] }) as Flow;
const ids = (nodes: FlowNode[] | undefined) => (nodes ?? []).map((node) => node.id);

describe("flowMoves", () => {
    it("keeps both of two statements that share a line", () => {
        const a = statement("a", 3, 4, 14);
        const b = statement("b", 3, 15, 25);
        expect(ids(outermost([b, a]))).toEqual(["a", "b"]);
    });

    it("drops a statement nested in another selected block", () => {
        const inner = statement("inner", 6, 8, 20);
        const handler = errorHandler("eh", [inner], []);
        expect(ids(outermost([inner, handler]))).toEqual(["eh"]);
    });

    it("keeps an error handler's body when deleting it, but not when lifting it", () => {
        const inner = statement("inner", 6, 8, 20);
        const after = statement("after", 12);
        const source = flow([errorHandler("eh", [inner], [statement("log", 9, 8, 30)]), after]);
        expect(ids(removeAllFromFlow(source, [source.nodes[0]], true)?.nodes)).toEqual(["inner", "after"]);
        expect(ids(removeAllFromFlow(source, [source.nodes[0]])?.nodes)).toEqual(["after"]);
    });

    it("drops into an on-fail branch through the diagram's start pill", () => {
        const moved = statement("moved", 2);
        const source = flow([moved, errorHandler("eh", [], [statement("log", 9, 8, 30)])]);
        const pill = {
            id: "eh-startNode-ON_FAILURE",
            metadata: { label: "On Error", description: "" },
            codedata: { node: "EVENT_START", lineRange: source.nodes[1].branches[1].codedata.lineRange },
            branches: [],
            returning: false,
        } as FlowNode;
        const next = moveInFlow(source, [moved], pill);
        expect(ids(next?.nodes)).toEqual(["eh"]);
        expect(ids(next?.nodes[0].branches[1].children)).toEqual(["moved", "log"]);
        expect(resolveAnchor(source, source, pill)).toBe(source.nodes[1].branches[1]);
    });

    it("adds an else when dropped on the if's dashed else lane", () => {
        const moved = statement("moved", 9);
        const ifNode = {
            id: "if",
            metadata: { label: "If", description: "" },
            codedata: { node: "IF", lineRange: range(2, 4, 4, 5) },
            branches: [branch("Then", "CONDITIONAL", 2, 4, [statement("then", 3, 8, 20)])],
            returning: false,
        } as FlowNode;
        const source = flow([ifNode, moved]);
        const lane = {
            ...branch("Else", "ELSE", 2, 4, [{ id: "if-Else", metadata: { label: "", description: "", draft: true }, codedata: { node: "EMPTY" } } as FlowNode]),
            codedata: { node: "ELSE", lineRange: ifNode.codedata.lineRange },
        } as Branch;
        const next = moveInFlow(source, [moved], lane);
        expect(ids(next?.nodes)).toEqual(["if"]);
        expect(next?.nodes[0].branches.map((b) => b.label)).toEqual(["Then", "Else"]);
        expect(ids(next?.nodes[0].branches[1].children)).toEqual(["moved"]);
        expect(targetAfter(lane)).toEqual(ifNode.codedata.lineRange.endLine);
    });
});
