/**
 * @jest-environment jsdom
 */
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

// Comments render as note chips on another node, never as widgets of their own, so a branch
// whose only children are comments has no renderable content. It used to be treated as
// non-empty, so it got no placeholder and no links — the branch silently vanished from the
// canvas and the connector ran straight past it (e.g. `if true { // Hi }`).
//
// These snapshot the visitor pipeline's OUTPUT GRAPH (nodes + links + the link flags that
// drive rendering) rather than the DOM: the defect was missing links, which a "renders
// without throwing" assertion cannot see. Diagram.semantic.test.tsx already had a
// comment-in-else case and this bug still shipped past it.

import { InitVisitor } from "../visitors/InitVisitor";
import { SizingVisitor } from "../visitors/SizingVisitor";
import { PositionVisitor } from "../visitors/PositionVisitor";
import { NodeFactoryVisitor } from "../visitors/NodeFactoryVisitor";
import { traverseFlow } from "@wso2/ballerina-core";
import { Flow, FlowNode } from "../utils/types";

const viewState = () => ({ x: 0, y: 0, lw: 0, rw: 0, h: 0, clw: 0, crw: 0, ch: 0 });

function node(id: string, kind: string, extra: Record<string, any> = {}): any {
    return {
        id,
        metadata: { label: kind, description: "" },
        codedata: { node: kind },
        branches: [],
        returning: false,
        viewState: viewState(),
        ...extra,
    };
}

const comment = (id: string) => node(id, "COMMENT", { properties: { comment: { value: "Hi" } } });

function branch(label: string, kind: string, children: any[], properties: Record<string, any> = {}) {
    return { label, kind: "BLOCK", codedata: { node: kind }, repeatable: "ONE", properties, children };
}

// A match case's pattern list, as the LS emits it (InitVisitor reads value[0].value).
const patterns = (value: string) => ({ patterns: { value: [{ value }] } });

/**
 * Run the real layout pipeline (the same chain Diagram.tsx drives) and serialize the
 * resulting graph. Non-default link flags are appended so a branch drawn as a dangling
 * "returning" line is distinguishable from a normal one.
 */
function graph(nodes: any[]): string {
    const flow = { fileName: "test.bal", nodes: JSON.parse(JSON.stringify(nodes)), connections: [] } as unknown as Flow;
    traverseFlow(flow, new InitVisitor(flow));
    traverseFlow(flow, new SizingVisitor());
    traverseFlow(flow, new PositionVisitor());
    const factory = new NodeFactoryVisitor();
    traverseFlow(flow, factory);

    const links = factory.getLinks().map((link: any) => {
        const from = link.getSourcePort()?.getNode()?.getID();
        const to = link.getTargetPort()?.getNode()?.getID();
        const flags = [
            link.label ? `label=${link.label}` : "",
            link.brokenLine ? "broken" : "",
            link.showAddButton ? "" : "no-add-button",
        ].filter(Boolean);
        return `  ${from} -> ${to}${flags.length ? `  [${flags.join(", ")}]` : ""}`;
    });

    const comments = [...factory.getNodeComments()].map(
        ([target, notes]: any) => `  ${target} <- ${notes.map((c: any) => c.id).join(", ")}`
    );

    return [
        "nodes:",
        ...factory.getNodes().map((n: any) => `  ${n.getID()}`),
        "links:",
        ...links,
        "comment chips:",
        ...(comments.length ? comments : ["  (none)"]),
    ].join("\n");
}

const start = () => node("start", "EVENT_START");

describe("comment-only branches — layout graph", () => {
    // `if true { // Hi }` — the reported case. Before the fix the Then branch produced no
    // node and no links at all, so only the synthetic dashed Else path reached the endif.
    it("if: comment-only then branch is placeheld and wired", () => {
        const ifNode = node("if1", "IF", {
            branches: [branch("Then", "CONDITIONAL", [comment("c1")])],
        });
        expect(graph([start(), ifNode])).toMatchSnapshot();
    });

    it("match: comment-only case branch is placeheld and wired", () => {
        const matchNode = node("match1", "MATCH", {
            branches: [branch("1", "CONDITIONAL", [comment("c1")], patterns("1"))],
        });
        expect(graph([start(), matchNode])).toMatchSnapshot();
    });

    it("while: comment-only body is placeheld and wired", () => {
        const whileNode = node("while1", "WHILE", {
            branches: [branch("Body", "BODY", [comment("c1")])],
        });
        expect(graph([start(), whileNode])).toMatchSnapshot();
    });

    // The worst case: before the fix the whole body branch was unwired, leaving the error
    // handler with nothing but its trailing link.
    it("error handler: comment-only body is placeheld and wired", () => {
        const errorHandler = node("eh1", "ERROR_HANDLER", {
            branches: [
                branch("Body", "BODY", [comment("c1")]),
                branch("On Failure", "ON_FAILURE", [node("log", "FUNCTION_CALL")]),
            ],
        });
        expect(graph([start(), errorHandler])).toMatchSnapshot();
    });
});

describe("comments alongside real nodes — layout graph", () => {
    // A trailing comment used to be read as the branch's last node, so a `return` looked
    // non-returning: the out-link lost `broken` and wrongly kept its add button.
    it("if: trailing comment does not mask a returning last statement", () => {
        const ifNode = node("if2", "IF", {
            branches: [branch("Then", "CONDITIONAL", [node("ret", "RETURN", { returning: true }), comment("c1")])],
        });
        expect(graph([start(), ifNode])).toMatchSnapshot();
    });

    // Guard against over-correcting: a branch holding a real node is NOT empty, so it must
    // link to that node and gain no placeholder, with the comment still surfacing as a chip.
    it("if: branch with a comment and a real node links to the real node", () => {
        const ifNode = node("if3", "IF", {
            branches: [branch("Then", "CONDITIONAL", [comment("c1"), node("stmt", "EXPRESSION")])],
        });
        expect(graph([start(), ifNode])).toMatchSnapshot();
    });
});

describe("comment-only branches — comment preservation", () => {
    // The branch must not be "fixed" by dropping the comment: it still has to reach the
    // canvas as a note chip.
    it("keeps the comment as a note chip", () => {
        const ifNode = node("if4", "IF", {
            branches: [branch("Then", "CONDITIONAL", [comment("only-comment")])],
        });
        const flow = {
            fileName: "test.bal",
            nodes: JSON.parse(JSON.stringify([start(), ifNode])),
            connections: [],
        } as unknown as Flow;
        traverseFlow(flow, new InitVisitor(flow));
        traverseFlow(flow, new SizingVisitor());
        traverseFlow(flow, new PositionVisitor());
        const factory = new NodeFactoryVisitor();
        traverseFlow(flow, factory);

        const chips = [...factory.getNodeComments().values()].flat() as FlowNode[];
        expect(chips.map((c) => c.id)).toContain("only-comment");
    });
});
