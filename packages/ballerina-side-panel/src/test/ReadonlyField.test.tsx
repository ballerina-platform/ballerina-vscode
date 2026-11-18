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

// L2 (P0): ReadonlyField render behaviour (docs/TEST_BACKLOG.md L2-05). Renders the real
// editor via formHarness: shows the label and the (non-editable) value.

import React from "react";
import { screen } from "@testing-library/react";
import { loadFixtures } from "@wso2/test-config/fixtures";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ReadonlyField } from "../components/editors/ReadonlyField";
import { formatFieldDocumentation } from "../components/editors/FieldDescription";

interface FieldFixture {
    expectedEditor: string;
    // The description as it renders: its text (whitespace collapsed) and the text of each <code>.
    expectedDescription?: { text: string; code: string[] };
    field: FormField;
}

const field = (value: any): FormField =>
    ({
        key: "connection",
        label: "connection",
        type: "IDENTIFIER",
        value,
        optional: false,
        editable: false,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("ReadonlyField", () => {
    it("renders the label and the value", () => {
        const { container } = renderWithForm(<ReadonlyField field={field("mysqlClient")} />, {
            defaultValues: { connection: "mysqlClient" },
        });
        const text = container.textContent ?? "";
        expect(text).toContain("Connection"); // label is capitalized
        expect(text).toContain("mysqlClient");
    });

    it("coerces a non-string value to text without crashing", () => {
        const { container } = renderWithForm(<ReadonlyField field={field(42)} />, {
            defaultValues: { connection: 42 },
        });
        expect(container.textContent).toContain("42");
    });
});

// Invariant over every field fixture that EditorFactory routes to ReadonlyField: the description
// renders as markdown, as ExpressionEditor renders it, never as raw markdown text. Each fixture with
// documentation states the rendered text and code it expects. Guards product-integrator#2306
// (fixtures/fields/issue-2306.json), where the "Use Existing Listener" form showed literal backticks
// in listener argument descriptions.
const readonlyFixtures = loadFixtures<FieldFixture>(__dirname, "fixtures", "fields").filter(
    (f) => f.data.expectedEditor === "ReadonlyField"
);

const collapse = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

describe("ReadonlyField description", () => {
    it("has fixtures to run", () => {
        expect(readonlyFixtures.some((f) => f.data.expectedDescription)).toBe(true);
    });

    it.each(readonlyFixtures.map((f) => [f.name, f.data] as [string, FieldFixture]))(
        "%s -> renders the description as markdown",
        (_name, fx) => {
            const { key, documentation } = fx.field;
            renderWithForm(<ReadonlyField field={fx.field} />, { defaultValues: { [key]: fx.field.value } });
            const description = screen.queryByTestId(`readonly-field-${key}-description`);

            if (!documentation) {
                expect(description).toBeNull();
                return;
            }
            const expected = fx.expectedDescription;
            expect(expected).toBeDefined();
            expect(description).not.toBeNull();
            expect(collapse(description!.textContent)).toBe(expected!.text);
            expect(Array.from(description!.querySelectorAll("code"), (c) => collapse(c.textContent))).toEqual(
                expected!.code
            );
        }
    );
});

describe("formatFieldDocumentation", () => {
    it.each([
        ["adds a missing period", "Port to bind", "Port to bind."],
        ["keeps an existing period", "Port to bind.", "Port to bind."],
        ["drops trailing whitespace before adding the period", "Port to bind \n", "Port to bind."],
        ["keeps a question mark", "Use TLS?", "Use TLS?"],
        ["keeps an exclamation mark", "Required!", "Required!"],
        ["keeps a colon", "For example:", "For example:"],
        ["leaves a closing code fence intact", "For example:\n```bal\nx\n```\n", "For example:\n```bal\nx\n```"],
        ["leaves a closing tilde fence intact", "Run:\n~~~\nx\n~~~", "Run:\n~~~\nx\n~~~"],
        ["returns empty text for whitespace", " \n ", ""],
        ["returns empty text for no documentation", undefined, ""],
    ])("%s", (_case, documentation, expected) => {
        expect(formatFieldDocumentation(documentation)).toBe(expected);
    });
});
