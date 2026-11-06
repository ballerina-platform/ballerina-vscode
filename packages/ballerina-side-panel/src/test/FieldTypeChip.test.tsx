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

// L2: the field type chip beside a form field's label.
// INVARIANT: every editor that draws a field label shows the field's Ballerina type as a
// chip when the model carries one, and shows no chip when it does not. The chip is always
// rendered, never tied to focus, so toggling a field's input mode can't make it flash
// (wso2/product-integrator#1587).

import React from "react";
import { render } from "@testing-library/react";
import type { InputType } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FieldTypeChip } from "../components/editors/FieldTypeChip";
import { CheckBoxEditor } from "../components/editors/CheckBoxEditor";
import { CustomDropdownEditor } from "../components/editors/CustomDropdownEditor";
import { DropdownChoiceForm } from "../components/editors/DropdownChoiceForm";
import { DropdownEditor } from "../components/editors/DropdownEditor";
import { FormMapEditor } from "../components/editors/FormMapEditor";
import { HeaderSetEditor } from "../components/editors/HeaderSetEditor";
import { MultiSelectEditor } from "../components/editors/MultiSelectEditor";
import { ReadonlyField } from "../components/editors/ReadonlyField";
import { TextAreaEditor } from "../components/editors/TextAreaEditor";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";

const CHIP = "field-type-chip";

const field = (fieldType: string, value: any, ballerinaType?: string, extra: Record<string, any> = {}): FormField =>
    ({
        key: "subject",
        label: "Subject",
        type: fieldType,
        types: [{ fieldType, selected: true, ...(ballerinaType ? { ballerinaType } : {}) }],
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        ...extra,
    } as unknown as FormField);

interface EditorCase {
    name: string;
    ballerinaType: string;
    render: (ballerinaType?: string) => ReturnType<typeof renderWithForm>;
}

const EDITORS: EditorCase[] = [
    {
        name: "DropdownEditor",
        ballerinaType: "string",
        render: (t) => renderWithForm(<DropdownEditor field={field("SINGLE_SELECT", "A", t, { items: ["A", "B"] })} />,
            { defaultValues: { subject: "A" } }),
    },
    {
        name: "CustomDropdownEditor",
        ballerinaType: "string",
        render: (t) => renderWithForm(<CustomDropdownEditor field={field("CUSTOM_DROPDOWN", "A", t, { items: ["A", "B"] })} />,
            { defaultValues: { subject: "A" } }),
    },
    {
        name: "DropdownChoiceForm",
        ballerinaType: "string",
        render: (t) => renderWithForm(<DropdownChoiceForm field={field("DROPDOWN_CHOICE", "A", t, { items: ["A", "B"] })} />,
            { defaultValues: { subject: "A" } }),
    },
    {
        name: "CheckBoxEditor",
        ballerinaType: "boolean",
        render: (t) => renderWithForm(<CheckBoxEditor field={field("FLAG", true, t)} />,
            { defaultValues: { subject: true } }),
    },
    {
        name: "ReadonlyField",
        ballerinaType: "mysql:Client",
        render: (t) => renderWithForm(<ReadonlyField field={field("EXPRESSION", "dbClient", t, { editable: false })} />,
            { defaultValues: { subject: "dbClient" } }),
    },
    {
        name: "TextAreaEditor",
        ballerinaType: "string",
        render: (t) => renderWithForm(<TextAreaEditor field={field("TEXTAREA", "text", t)} inputMode={InputMode.SIMPLE_TEXT} />,
            { defaultValues: { subject: "text" } }),
    },
    {
        name: "MultiSelectEditor",
        ballerinaType: "string[]",
        render: (t) => renderWithForm(<MultiSelectEditor field={field("MULTIPLE_SELECT", ["A"], t, { items: ["A", "B"] })} label="Attach Another" />,
            { defaultValues: { subject: ["A"] } }),
    },
    {
        name: "HeaderSetEditor",
        ballerinaType: "map<string>",
        render: (t) => renderWithForm(<HeaderSetEditor field={field("HEADER_SET", [], t, { items: ["string"] })} />,
            { defaultValues: {} }),
    },
    {
        name: "FormMapEditor",
        ballerinaType: "map<string>",
        render: (t) => renderWithForm(<FormMapEditor field={field("REPEATABLE_PROPERTY", {}, t)} label="Add Another Key-Value Pair" />,
            { defaultValues: {} }),
    },
];

describe("FieldTypeChip", () => {
    it("shows the type without its module prefix and keeps the full type as the tooltip", () => {
        const types = [{ fieldType: "EXPRESSION", selected: true, ballerinaType: "mysql:Client" }] as InputType[];
        const { getByTestId } = render(<FieldTypeChip types={types} />);
        expect(getByTestId(CHIP).textContent).toBe("Client");
        expect(getByTestId(CHIP).getAttribute("title")).toBe("mysql:Client");
    });

    it("prefers the EXPRESSION member's type over the primary member's", () => {
        const types = [
            { fieldType: "TEXT", selected: true, ballerinaType: "string" },
            { fieldType: "EXPRESSION", selected: false, ballerinaType: "string|int" },
        ] as InputType[];
        const { getByTestId } = render(<FieldTypeChip types={types} />);
        expect(getByTestId(CHIP).textContent).toBe("string|int");
    });

    it("renders nothing without a Ballerina type", () => {
        const { queryByTestId } = render(<FieldTypeChip types={[{ fieldType: "TEXT", selected: true }] as InputType[]} />);
        expect(queryByTestId(CHIP)).toBeNull();
    });

    describe.each(EDITORS)("$name", ({ ballerinaType, render: renderEditor }) => {
        it("INVARIANT: shows the field's Ballerina type as a chip", () => {
            const { getByTestId } = renderEditor(ballerinaType);
            expect(getByTestId(CHIP).getAttribute("title")).toBe(ballerinaType);
        });

        it("INVARIANT: shows no chip when the field has no Ballerina type", () => {
            const { queryByTestId } = renderEditor(undefined);
            expect(queryByTestId(CHIP)).toBeNull();
        });
    });
});
