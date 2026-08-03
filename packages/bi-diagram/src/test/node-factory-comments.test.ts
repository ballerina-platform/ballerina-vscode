/**
 * @jest-environment jsdom
 */
/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 */

import { NodeFactoryVisitor } from "../visitors/NodeFactoryVisitor";
import { FlowNode, NodeKind } from "../utils/types";

function makeNode(id: string, kind: NodeKind, sourceCode: string): FlowNode {
    return {
        id,
        metadata: { label: kind, description: sourceCode },
        codedata: { node: kind, sourceCode },
        branches: [],
        returning: false,
        viewState: {
            x: 0,
            y: 0,
            lw: 0,
            rw: 0,
            h: 0,
            clw: 0,
            crw: 0,
            ch: 0,
        },
    };
}

describe("NodeFactoryVisitor comment attachment", () => {
    it("keeps every consecutive comment on the following node", () => {
        const visitor = new NodeFactoryVisitor();
        const start = makeNode("start", "EVENT_START", "start");
        const first = makeNode("comment-1", "COMMENT", "// first");
        const second = makeNode("comment-2", "COMMENT", "// second");
        const statement = makeNode("statement", "EXPRESSION", "doWork();");

        visitor.beginVisitEventStart(start);
        visitor.beginVisitComment(first);
        visitor.beginVisitComment(second);
        visitor.beginVisitNode(statement);

        expect(visitor.getNodeComments().get(statement.id)).toEqual([first, second]);
    });

    it("attaches trailing comments to the preceding visible node", () => {
        const visitor = new NodeFactoryVisitor();
        const start = makeNode("start", "EVENT_START", "start");
        const trailing = makeNode("trailing-comment", "COMMENT", "// trailing");

        visitor.beginVisitEventStart(start);
        visitor.beginVisitComment(trailing);

        expect(visitor.getNodeComments().get(start.id)).toEqual([trailing]);
    });
});
