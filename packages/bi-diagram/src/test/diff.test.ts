/**
 * @jest-environment node
 */
/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { mergeFlowModelsForDiff, stampDiffState, DIFF_HUNK_NODE } from "../utils/diff";
import { Branch, Flow, FlowNode, NodeKind } from "../utils/types";

let idCounter = 0;

interface NodeIdentity {
    symbol?: string;
    module?: string;
    org?: string;
    varName?: string;
}

function makeNode(kind: NodeKind, sourceCode: string, branches?: Branch[], identity?: NodeIdentity): FlowNode {
    idCounter += 1;
    return {
        id: `node-${idCounter}`,
        metadata: { label: kind, description: "" },
        codedata: { node: kind, sourceCode, symbol: identity?.symbol, module: identity?.module, org: identity?.org },
        properties: identity?.varName ? ({ variable: { value: identity.varName } } as any) : undefined,
        branches: branches ?? [],
        returning: kind === "RETURN",
    };
}

function makeBranch(label: string, children: FlowNode[], kind: NodeKind = "CONDITIONAL"): Branch {
    return {
        label,
        kind: "block",
        codedata: { node: kind },
        repeatable: "ONE",
        properties: {},
        children,
    };
}

function makeFlow(nodes: FlowNode[]): Flow {
    return { fileName: "main.bal", nodes };
}

function kinds(nodes: FlowNode[]): string[] {
    return nodes.map((n) => n.codedata.node as string);
}

function hunkBranchLabels(hunk: FlowNode): string[] {
    return hunk.branches.map((b) => b.label);
}

describe("mergeFlowModelsForDiff", () => {
    beforeEach(() => {
        idCounter = 0;
    });

    it("returns identical flow unchanged with no hunks", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return 1;")]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return 1;")]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "RETURN"]);
        expect(merged.nodes.every((n) => n.diffState === undefined)).toBe(true);
    });

    it("wraps a pure insertion in a hunk with only an added branch", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return x;")]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("FUNCTION_CALL", "io:println(x);"),
            makeNode("RETURN", "return x;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", DIFF_HUNK_NODE, "RETURN"]);
        const hunk = merged.nodes[1];
        expect(hunkBranchLabels(hunk)).toEqual(["Added"]);
        expect(hunk.branches[0].children[0].diffState).toBe("added");
        expect(hunk.branches[0].children[0].codedata.sourceCode).toBe("io:println(x);");
    });

    it("wraps a pure deletion in a hunk with only a removed branch", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("FUNCTION_CALL", "log(x);"),
            makeNode("RETURN", "return x;"),
        ]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return x;")]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", DIFF_HUNK_NODE, "RETURN"]);
        const hunk = merged.nodes[1];
        expect(hunkBranchLabels(hunk)).toEqual(["Removed"]);
        expect(hunk.branches[0].children[0].diffState).toBe("removed");
        expect(hunk.branches[0].children[0].codedata.sourceCode).toBe("log(x);");
    });

    it("pairs a statement replaced by a different call into a removed+added hunk", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("VARIABLE", "string s = orderValue.status;"),
            makeNode("FUNCTION_CALL", "logOrderStatusRetrieved(s);", undefined, { symbol: "logOrderStatusRetrieved" }),
            makeNode("RETURN", "return s;"),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("VARIABLE", "string s = orderValue.status;"),
            makeNode("FUNCTION_CALL", "io:println(s);", undefined, { symbol: "println", module: "io", org: "ballerina" }),
            makeNode("RETURN", "return s;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "VARIABLE", DIFF_HUNK_NODE, "RETURN"]);
        const hunk = merged.nodes[2];
        // dash-free id: `<id>-lastNode`/`<id>-StartContainer` custom ids are parsed by
        // reverseCustomNodeId (splits on "-"), e.g. for rendering the End node after a hunk
        expect(hunk.id).not.toContain("-");
        expect(hunkBranchLabels(hunk)).toEqual(["Removed", "Added"]);
        expect(hunk.branches[0].children[0].codedata.sourceCode).toBe("logOrderStatusRetrieved(s);");
        expect(hunk.branches[0].children[0].diffState).toBe("removed");
        expect(hunk.branches[1].children[0].codedata.sourceCode).toBe("io:println(s);");
        expect(hunk.branches[1].children[0].diffState).toBe("added");
    });

    it("re-keys old and new nodes that have the same LS line-range id", () => {
        const oldCall = makeNode("IF", "if oldCondition {\n  nestedOld();\n}", [
            makeBranch("Body", [makeNode("FUNCTION_CALL", "nestedOld();")]),
        ]);
        const newCall = makeNode("WHILE", "while newCondition {\n  nestedNew();\n}", [
            makeBranch("Body", [makeNode("FUNCTION_CALL", "nestedNew();")]),
        ]);
        oldCall.id = "same-line-range-id";
        newCall.id = "same-line-range-id";
        oldCall.branches[0].children[0].id = "same-nested-id";
        newCall.branches[0].children[0].id = "same-nested-id";
        oldCall.branches[0].children[0].viewState = { startNodeId: "same-line-range-id" } as any;
        newCall.branches[0].children[0].viewState = { startNodeId: "same-line-range-id" } as any;

        const merged = mergeFlowModelsForDiff(
            makeFlow([makeNode("EVENT_START", "start"), oldCall]),
            makeFlow([makeNode("EVENT_START", "start"), newCall])
        );

        const hunk = merged.nodes[1];
        const removed = hunk.branches[0].children[0];
        const added = hunk.branches[1].children[0];
        expect(removed.id).not.toBe(added.id);
        expect(removed.branches[0].children[0].id).not.toBe(added.branches[0].children[0].id);
        expect(removed.branches[0].children[0].viewState?.startNodeId).toBe(removed.id);
        expect(added.branches[0].children[0].viewState?.startNodeId).toBe(added.id);
        expect([removed.id, added.id]).not.toContain("same-line-range-id");
    });

    it("marks a call to the same function with changed content as one modified node", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("FUNCTION_CALL", `io:println("hello");`, undefined, { symbol: "println", module: "io" }),
            makeNode("RETURN", "return x;"),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("FUNCTION_CALL", `io:println("hello world");`, undefined, { symbol: "println", module: "io" }),
            makeNode("RETURN", "return x;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "FUNCTION_CALL", "RETURN"]);
        expect(merged.nodes[1].diffState).toBe("modified");
        expect(merged.nodes[1].codedata.sourceCode).toBe(`io:println("hello world");`);
        expect(merged.nodes[1].diffPreviousText).toBe(`io:println("hello");`);
        expect(merged.nodes[2].diffState).toBeUndefined();
    });

    it("marks a variable assigned a different value as one modified node", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("VARIABLE", "int total = 5;", undefined, { varName: "total" }),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("VARIABLE", "int total = 10;", undefined, { varName: "total" }),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "VARIABLE"]);
        expect(merged.nodes[1].diffState).toBe("modified");
        expect(merged.nodes[1].diffPreviousText).toBe("int total = 5;");
    });

    it("treats a variable replaced by a differently-named one as a removed+added hunk", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("VARIABLE", "int total = 5;", undefined, { varName: "total" }),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("VARIABLE", `string name = "x";`, undefined, { varName: "name" }),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", DIFF_HUNK_NODE]);
        expect(hunkBranchLabels(merged.nodes[1])).toEqual(["Removed", "Added"]);
    });

    it("marks a one-for-one edit of an identity-less node (RETURN) as modified", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return a;")]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return a + b;")]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "RETURN"]);
        expect(merged.nodes[1].diffState).toBe("modified");
        expect(merged.nodes[1].diffPreviousText).toBe("return a;");
    });

    it("ignores whitespace-only differences", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return  x ;")]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return x;")]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "RETURN"]);
    });

    it("preserves semantic whitespace inside string and template literals", () => {
        const stringDiff = mergeFlowModelsForDiff(makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("RETURN", 'return "a b";'),
        ]), makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("RETURN", 'return "ab";'),
        ]));
        const templateDiff = mergeFlowModelsForDiff(makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("EXPRESSION", "string value = string `line one\n// literal content`;"),
        ]), makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("EXPRESSION", "string value = string `line one\n// changed literal content`;"),
        ]));

        expect(stringDiff.nodes[1].diffState).toBe("modified");
        expect(stringDiff.nodes[1].diffPreviousText).toBe('return "a b";');
        expect(templateDiff.nodes[1].diffState).toBe("modified");
    });

    it("finds a container body brace after braces inside literals", () => {
        const oldIf = makeNode("IF", 'if value == "{" && enabled {\n  run();\n}', [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "run();", undefined, { symbol: "run" })]),
        ]);
        const newIf = makeNode("IF", 'if value == "{" && ready {\n  run();\n}', [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "run();", undefined, { symbol: "run" })]),
        ]);

        const merged = mergeFlowModelsForDiff(
            makeFlow([makeNode("EVENT_START", "start"), oldIf]),
            makeFlow([makeNode("EVENT_START", "start"), newIf])
        );

        expect(merged.nodes[1].diffState).toBe("modified");
        expect(merged.nodes[1].diffPreviousText).toBe('if value == "{" && enabled');
    });

    it("recurses into a container whose header is unchanged", () => {
        const oldIf = makeNode("IF", "if x > 5 {\n  log(x);\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "log(x);", undefined, { symbol: "log" })]),
        ]);
        const newIf = makeNode("IF", "if x > 5 {\n  io:println(x);\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "io:println(x);", undefined, { symbol: "println", module: "io" })]),
        ]);
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), oldIf]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), newIf]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "IF"]);
        const ifNode = merged.nodes[1];
        expect(ifNode.diffState).toBeUndefined();
        expect(kinds(ifNode.branches[0].children)).toEqual([DIFF_HUNK_NODE]);
        const hunk = ifNode.branches[0].children[0];
        expect(hunkBranchLabels(hunk)).toEqual(["Removed", "Added"]);
    });

    it("marks a container with a changed header as modified and still recurses into its body", () => {
        const oldIf = makeNode("IF", "if x > 5 {\n  log(x);\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "log(x);", undefined, { symbol: "log" })]),
        ]);
        const newIf = makeNode("IF", "if x > 10 {\n  log(x);\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "log(x);", undefined, { symbol: "log" })]),
        ]);
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), oldIf]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), newIf]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "IF"]);
        const ifNode = merged.nodes[1];
        expect(ifNode.diffState).toBe("modified");
        // the old header (not the whole body) is carried for the hover card
        expect(ifNode.diffPreviousText).toBe("if x > 5");
        // unchanged body is left alone — no hunks, no stamps
        expect(kinds(ifNode.branches[0].children)).toEqual(["FUNCTION_CALL"]);
        expect(ifNode.branches[0].children[0].diffState).toBeUndefined();
    });

    it("replaces a container by a different kind of node as a removed+added hunk", () => {
        const oldIf = makeNode("IF", "if x > 5 {\n  log(x);\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "log(x);", undefined, { symbol: "log" })]),
        ]);
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), oldIf]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("WHILE", "while x > 5 {\n  log(x);\n}", [
                makeBranch("Body", [makeNode("FUNCTION_CALL", "log(x);", undefined, { symbol: "log" })]),
            ]),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", DIFF_HUNK_NODE]);
        const hunk = merged.nodes[1];
        expect(hunkBranchLabels(hunk)).toEqual(["Removed", "Added"]);
        expect(hunk.branches[0].children[0].codedata.node).toBe("IF");
        expect(hunk.branches[0].children[0].diffState).toBe("removed");
        // nested children are stamped too
        expect(hunk.branches[0].children[0].branches[0].children[0].diffState).toBe("removed");
        expect(hunk.branches[1].children[0].diffState).toBe("added");
    });

    it("keeps a branch removed in the new version and stamps its children", () => {
        const oldIf = makeNode("IF", "if x {\n  a();\n} else {\n  b();\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "a();")]),
            makeBranch("Else", [makeNode("FUNCTION_CALL", "b();")], "ELSE"),
        ]);
        const newIf = makeNode("IF", "if x {\n  a();\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "a();")]),
        ]);
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), oldIf]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), newIf]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        const ifNode = merged.nodes[1];
        expect(ifNode.codedata.node).toBe("IF");
        expect(ifNode.branches.map((b) => b.label)).toEqual(["Then", "Else"]);
        expect(ifNode.branches[1].children[0].diffState).toBe("removed");
    });

    it("stamps an added branch's children in the new version", () => {
        const oldIf = makeNode("IF", "if x {\n  a();\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "a();")]),
        ]);
        const newIf = makeNode("IF", "if x {\n  a();\n} else {\n  b();\n}", [
            makeBranch("Then", [makeNode("FUNCTION_CALL", "a();")]),
            makeBranch("Else", [makeNode("FUNCTION_CALL", "b();")], "ELSE"),
        ]);
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), oldIf]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), newIf]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        const ifNode = merged.nodes[1];
        expect(ifNode.branches[1].label).toBe("Else");
        expect(ifNode.branches[1].children[0].diffState).toBe("added");
    });

    it("stamps an edited note (comment) without hunking the following statement", () => {
        // Statement sourceCode from the LS includes the leading comment line,
        // so both the COMMENT node and the following statement differ textually.
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// old note"),
            makeNode("FUNCTION_CALL", "// old note\nsyncEmailHeadings(firstRun);"),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// new note"),
            makeNode("FUNCTION_CALL", "// new note\nsyncEmailHeadings(firstRun);"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "COMMENT", "FUNCTION_CALL"]);
        // the statement itself is unchanged — no hunk, no stamp
        expect(merged.nodes[2].diffState).toBeUndefined();
        // the edited note keeps the new text and carries the old one for the chip
        expect(merged.nodes[1].codedata.sourceCode).toBe("// new note");
        expect(merged.nodes[1].diffState).toBe("modified");
        expect(merged.nodes[1].diffPreviousText).toBe("// old note");
    });

    it("leaves an unchanged note unstamped", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// same note"),
            makeNode("RETURN", "return x;"),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// same note"),
            makeNode("RETURN", "return x;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "COMMENT", "RETURN"]);
        expect(merged.nodes.every((n) => n.diffState === undefined)).toBe(true);
    });

    it("marks an inserted note as added and leaves the existing note unchanged", () => {
        // A note inserted above an existing one must not mispair: because every comment
        // once shared a single match key, the LCS could pair the inserted note with the
        // existing one (marking the insert "modified" and the original "added").
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// keep this"),
            makeNode("RETURN", "return x;"),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// brand new"),
            makeNode("COMMENT", "// keep this"),
            makeNode("RETURN", "return x;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "COMMENT", "COMMENT", "RETURN"]);
        // the inserted note is added...
        expect(merged.nodes[1].codedata.sourceCode).toBe("// brand new");
        expect(merged.nodes[1].diffState).toBe("added");
        // ...and the existing note is untouched (not shown as modified/added)
        expect(merged.nodes[2].codedata.sourceCode).toBe("// keep this");
        expect(merged.nodes[2].diffState).toBeUndefined();
        expect(merged.nodes[3].diffState).toBeUndefined();
    });

    it("emits an added-only comment inline as added, without a hunk", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return x;")]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// explain the return"),
            makeNode("RETURN", "return x;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "COMMENT", "RETURN"]);
        expect(merged.nodes[1].diffState).toBe("added");
        expect(merged.nodes[2].diffState).toBeUndefined();
    });

    it("keeps a removed-only comment inline as removed, without a hunk", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// obsolete note"),
            makeNode("RETURN", "return x;"),
        ]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("RETURN", "return x;")]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "COMMENT", "RETURN"]);
        expect(merged.nodes[1].diffState).toBe("removed");
        expect(merged.nodes[1].codedata.sourceCode).toBe("// obsolete note");
        expect(merged.nodes[2].diffState).toBeUndefined();
    });

    it("keeps a comment inside a hunk lane when it accompanies changed code", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("FUNCTION_CALL", "log(x);", undefined, { symbol: "log" }),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("COMMENT", "// print instead of log"),
            makeNode("FUNCTION_CALL", "io:println(x);", undefined, { symbol: "println", module: "io" }),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", DIFF_HUNK_NODE]);
        const hunk = merged.nodes[1];
        expect(hunkBranchLabels(hunk)).toEqual(["Removed", "Added"]);
        expect(kinds(hunk.branches[1].children)).toEqual(["COMMENT", "FUNCTION_CALL"]);
        expect(hunk.branches[1].children.every((n) => n.diffState === "added")).toBe(true);
    });

    it("pairs EVENT_START and marks a changed function signature as modified", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "get resource()"), makeNode("RETURN", "return x;")]);
        const newFlow = makeFlow([makeNode("EVENT_START", "get resource(int y)"), makeNode("RETURN", "return x;")]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", "RETURN"]);
        expect(merged.nodes[0].codedata.sourceCode).toBe("get resource(int y)");
        expect(merged.nodes[0].diffState).toBe("modified");
        expect(merged.nodes[0].diffPreviousText).toBe("get resource()");
    });

    it("does not mark EVENT_START modified when only its embedded function body changes", () => {
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "function onError() {\n    log:printError(\"old\");\n}"),
            makeNode("FUNCTION_CALL", "log:printError(\"old\");", undefined, { symbol: "printError", module: "log" }),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "function onError() {\n    log:printError(\"new\");\n}"),
            makeNode("FUNCTION_CALL", "log:printError(\"new\");", undefined, { symbol: "printError", module: "log" }),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(merged.nodes[0].diffState).toBeUndefined();
        expect(merged.nodes[1].diffState).toBe("modified");
    });

    it("uses a bounded coarse diff for very large node lists", () => {
        const oldMiddle = Array.from({ length: 500 }, (_, index) =>
            makeNode("FUNCTION_CALL", `old${index}();`, undefined, { symbol: `old${index}` })
        );
        const newMiddle = Array.from({ length: 500 }, (_, index) =>
            makeNode("FUNCTION_CALL", `new${index}();`, undefined, { symbol: `new${index}` })
        );
        const oldFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            ...oldMiddle,
            makeNode("RETURN", "return result;"),
        ]);
        const newFlow = makeFlow([
            makeNode("EVENT_START", "start"),
            ...newMiddle,
            makeNode("RETURN", "return result;"),
        ]);

        const merged = mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(kinds(merged.nodes)).toEqual(["EVENT_START", DIFF_HUNK_NODE, "RETURN"]);
        expect(merged.nodes[1].branches[0].children).toHaveLength(500);
        expect(merged.nodes[1].branches[1].children).toHaveLength(500);
    });

    it("does not mutate its inputs", () => {
        const oldFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("FUNCTION_CALL", "log(x);")]);
        const newFlow = makeFlow([makeNode("EVENT_START", "start"), makeNode("FUNCTION_CALL", "io:println(x);")]);

        mergeFlowModelsForDiff(oldFlow, newFlow);

        expect(oldFlow.nodes[1].diffState).toBeUndefined();
        expect(newFlow.nodes[1].diffState).toBeUndefined();
    });
});

describe("stampDiffState", () => {
    it("stamps all nodes recursively without mutating the input", () => {
        const flow = makeFlow([
            makeNode("EVENT_START", "start"),
            makeNode("IF", "if x {\n  a();\n}", [makeBranch("Then", [makeNode("FUNCTION_CALL", "a();")])]),
        ]);

        const stamped = stampDiffState(flow, "added");

        expect(stamped.nodes[0].diffState).toBe("added");
        expect(stamped.nodes[1].diffState).toBe("added");
        expect(stamped.nodes[1].branches[0].children[0].diffState).toBe("added");
        expect(flow.nodes[0].diffState).toBeUndefined();
    });
});
