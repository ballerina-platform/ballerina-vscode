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

// L2: a field whose types change under it (the declare variable expression follows the selected
// type) keeps its value only while the mode that built it is still offered. A list or map value
// read by another structured mode is misread (a list becomes a map keyed 0, 1, ...), so a type
// change that drops the value's mode clears it. The editors are stubbed: the rule lives in
// FieldFactory's mode reconciliation, not in any editor.

import React, { useState } from "react";
import { act } from "@testing-library/react";
import type { InputType } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FieldFactory } from "../components/editors/FieldFactory";

jest.mock("../components/editors/EditorFactory", () => ({
    EditorFactory: () => <div data-testid="editor" />,
}));

const template = { types: [{ fieldType: "EXPRESSION", selected: false }] };
const LIST: InputType = { fieldType: "REPEATABLE_LIST", ballerinaType: "int[]", selected: false, template } as InputType;
const MAP: InputType = { fieldType: "REPEATABLE_MAP", ballerinaType: "map<int>", selected: false, template } as InputType;
const NUMBER: InputType = { fieldType: "NUMBER", ballerinaType: "int", selected: false };
const EXPRESSION: InputType = { fieldType: "ACTION_OR_EXPRESSION", selected: false };

const field = (types: InputType[]): FormField => ({
    key: "expression",
    label: "Expression",
    type: "ACTION_OR_EXPRESSION",
    value: "",
    optional: true,
    editable: true,
    enabled: true,
    documentation: "",
    types: types.map(t => ({ ...t })),
} as unknown as FormField);

function renderRetypable(initial: InputType[], value: unknown) {
    let retype: (types: InputType[]) => void = () => undefined;
    const Retypable = () => {
        const [types, setTypes] = useState(initial);
        retype = setTypes;
        return <FieldFactory field={field(types)} openSubPanel={() => undefined} />;
    };
    const utils = renderWithForm(<Retypable />, { defaultValues: { expression: value } });
    return { ...utils, retype: (types: InputType[]) => act(() => retype(types)) };
}

describe("FieldFactory on a type change", () => {
    it.each([
        ["a list, when the type becomes a map", [LIST, EXPRESSION], ["1", "2"], [MAP, EXPRESSION]],
        ["a list, when the type becomes a number", [LIST, EXPRESSION], ["1", "2"], [NUMBER, EXPRESSION]],
        ["a map, when the type becomes a list", [MAP, EXPRESSION], { a: "1" }, [LIST, EXPRESSION]],
    ])("clears %s", (_, before, value, after) => {
        const { getForm, retype } = renderRetypable(before as InputType[], value);
        retype(after as InputType[]);
        expect(getForm().getValues("expression")).toBe("");
    });

    it("keeps a list while the new type still offers the list mode", () => {
        const value = ["1", "2"];
        const { getForm, retype } = renderRetypable([LIST, EXPRESSION], value);
        retype([{ ...LIST, ballerinaType: "float[]" }, EXPRESSION]);
        expect(getForm().getValues("expression")).toEqual(value);
    });

    it("keeps an expression across a type change", () => {
        const { getForm, retype } = renderRetypable([NUMBER, EXPRESSION], "check client->get(\"/a\")");
        retype([LIST, EXPRESSION]);
        expect(getForm().getValues("expression")).toBe("check client->get(\"/a\")");
    });
});
