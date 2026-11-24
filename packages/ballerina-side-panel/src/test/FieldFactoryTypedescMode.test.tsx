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

// L2: FieldFactory on a typedesc argument. The language server sends every typedesc argument two input types — the
// type editor (marked with the typedesc) and the expression mode — and selects the one that fits the value. The field
// has to open on the selected one, offer the other through the mode switcher, and keep the selection on the field's
// input types in step with the switch, since that selection is what the form sends back.

import React from "react";
import { act, screen } from "@testing-library/react";
import { InputType } from "@wso2/ballerina-core";
import { renderWithForm } from "./formHarness";
import { useModeSwitcherContext } from "../components/editors/ModeSwitcherContext";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import type { FormField } from "../components/Form/types";

// Stand in for the editor FieldFactory picks: report which input type it was given, and expose the switcher.
let switcher: ReturnType<typeof useModeSwitcherContext>;
jest.mock("../components/editors/EditorFactory", () => ({
    __esModule: true,
    EditorFactory: ({ fieldInputType }: { fieldInputType: InputType }) => {
        switcher = useModeSwitcherContext();
        return <div data-testid="editor" data-field-type={fieldInputType.fieldType} />;
    },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FieldFactory } = require("../components/editors/FieldFactory");

const CONSTRAINT = "record {|anydata...;|}";
const TYPEDESC = `typedesc<${CONSTRAINT}>`;

const typedescField = (value: string, selected: "TYPE" | "EXPRESSION"): FormField => ({
    key: "targetType",
    label: "Target Type",
    type: "TYPE",
    optional: false,
    editable: true,
    documentation: "",
    value,
    enabled: true,
    types: [
        { fieldType: "TYPE", ballerinaType: CONSTRAINT, typedesc: TYPEDESC, selected: selected === "TYPE" },
        { fieldType: "EXPRESSION", ballerinaType: TYPEDESC, selected: selected === "EXPRESSION" },
    ],
} as FormField);

const renderTypedescField = (field: FormField) =>
    renderWithForm(<FieldFactory field={field} />, { defaultValues: { [field.key]: field.value } });

const renderedFieldType = () => screen.getByTestId("editor").getAttribute("data-field-type");
const selectedFieldTypes = (field: FormField) => field.types.filter((t) => t.selected).map((t) => t.fieldType);

describe("FieldFactory on a typedesc argument", () => {
    it("opens a type value in the type editor, with the expression mode on the switcher", () => {
        const field = typedescField("Person", "TYPE");
        renderTypedescField(field);

        expect(renderedFieldType()).toBe("TYPE");
        expect(switcher.isModeSwitcherEnabled).toBe(true);
        expect(switcher.inputMode).toBe(InputMode.TYPE);
        expect(switcher.types.map((t) => t.fieldType)).toEqual(["TYPE", "EXPRESSION"]);
        expect(selectedFieldTypes(field)).toEqual(["TYPE"]);
    });

    // A typedesc variable or `typeof x` is not a type: the LS selects the expression mode, and the field opens there.
    it.each(["td", "typeof x"])("opens %s in the expression mode", (value) => {
        const field = typedescField(value, "EXPRESSION");
        renderTypedescField(field);

        expect(renderedFieldType()).toBe("EXPRESSION");
        expect(switcher.inputMode).toBe(InputMode.EXP);
        expect(selectedFieldTypes(field)).toEqual(["EXPRESSION"]);
    });

    it("moves the editor and the selection when the mode is switched both ways", () => {
        const field = typedescField("Person", "TYPE");
        renderTypedescField(field);

        act(() => switcher.onModeChange(InputMode.EXP));
        expect(renderedFieldType()).toBe("EXPRESSION");
        expect(selectedFieldTypes(field)).toEqual(["EXPRESSION"]);

        act(() => switcher.onModeChange(InputMode.TYPE));
        expect(renderedFieldType()).toBe("TYPE");
        expect(selectedFieldTypes(field)).toEqual(["TYPE"]);
    });

    it("keeps the typedesc mark on the type editor it renders", () => {
        renderTypedescField(typedescField("Person", "TYPE"));
        expect(switcher.types[0].typedesc).toBe(TYPEDESC);
        expect(switcher.types[0].ballerinaType).toBe(CONSTRAINT);
    });
});
