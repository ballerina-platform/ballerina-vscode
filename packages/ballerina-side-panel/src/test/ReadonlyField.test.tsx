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
// renders as the editable editors render it, as markdown with the same trailing period, never as
// raw markdown text. Guards product-integrator#2306 (fixtures/fields/issue-2306.json), where the
// "Use Existing Listener" form showed literal backticks in listener argument descriptions.
const readonlyFixtures = loadFixtures<FieldFixture>(__dirname, "fixtures", "fields").filter(
    (f) => f.data.expectedEditor === "ReadonlyField"
);

describe("ReadonlyField description", () => {
    it("has fixtures to run", () => {
        expect(readonlyFixtures.some((f) => f.data.field.documentation)).toBe(true);
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
            expect(description).not.toBeNull();
            const inlineCode = Array.from(documentation.matchAll(/`([^`]+)`/g), (m) => m[1]);
            const renderedCode = Array.from(description!.querySelectorAll("code"), (c) => c.textContent);
            expect(renderedCode).toEqual(inlineCode);
            expect(description!.textContent).not.toContain("`");
            expect(description!.textContent).toBe(formatFieldDocumentation(documentation).replace(/`/g, ""));
        }
    );
});
