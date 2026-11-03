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

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Type } from "@wso2/ballerina-core";
import { RequestContextBadge } from "../components/entity-relationship/EntityNode/EntityHead/RequestContextBadge";
import { structureOf } from "../Diagram";

describe("RequestContextBadge", () => {
    it("reads Context and says what it means", () => {
        render(<RequestContextBadge onOpen={jest.fn()} />);
        const badge = screen.getByTestId("request-context-badge");
        expect(badge).toHaveTextContent(/^Context$/);
        expect(badge).toHaveAccessibleName("Request context. Open Request Context");
    });

    it("opens the editor on click without the click reaching the node", () => {
        const onOpen = jest.fn();
        const onNodeClick = jest.fn();
        render(
            <div onClick={onNodeClick}>
                <RequestContextBadge onOpen={onOpen} />
            </div>
        );
        fireEvent.click(screen.getByTestId("request-context-badge"));
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(onNodeClick).not.toHaveBeenCalled();
    });
});

describe("diagram structure", () => {
    const type = (name: string, line: number, fields: string[], node = "RECORD"): Type => ({
        name,
        editable: true,
        metadata: { label: name, description: "" },
        properties: {},
        codedata: { node, lineRange: { fileName: "main.bal", startLine: { line, offset: 0 },
            endLine: { line: line + 3, offset: 1 } } },
        includes: [],
        members: fields.map((field) => ({ kind: "FIELD", name: field, type: "string", refs: [] })),
        allowAdditionalFields: false,
    } as unknown as Type);

    it("is unchanged when an edit only moves types in source, so the diagram refreshes in place", () => {
        const before = structureOf([type("Book", 10, ["title"])], type("/graphql", 20, ["book"]));
        const after = structureOf([type("Book", 14, ["title"])], type("/graphql", 24, ["book"]));
        expect(after).toBe(before);
    });

    it.each([
        ["a field is added", [type("Book", 10, ["title", "author"])], type("/graphql", 20, ["book"])],
        ["a type is added", [type("Book", 10, ["title"]), type("Author", 30, ["name"])], type("/graphql", 20, ["book"])],
        ["a type changes kind", [type("Book", 10, ["title"], "CLASS")], type("/graphql", 20, ["book"])],
        ["an operation is added", [type("Book", 10, ["title"])], type("/graphql", 20, ["book", "books"])],
    ])("changes when %s, so the diagram is redrawn", (_case, typeModel: Type[], rootService: Type) => {
        const before = structureOf([type("Book", 10, ["title"])], type("/graphql", 20, ["book"]));
        expect(structureOf(typeModel, rootService)).not.toBe(before);
    });
});
