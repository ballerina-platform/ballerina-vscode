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
// type, notified on every keystroke of the type field). Invariants:
// - nothing the user entered is lost on a type change, however many half-typed types it passes;
// - a list or map value is never read by a mode that did not build it: once its mode is dropped,
//   or its element type changes, it is kept as its expression text;
// - a value opens only in a mode that can edit it, else in the expression mode.
// The editors are stubbed to report the mode they render: the rules live in FieldFactory's mode
// reconciliation, not in any editor.

import React, { useState } from "react";
import { act, screen } from "@testing-library/react";
import type { InputType } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FieldFactory } from "../components/editors/FieldFactory";

jest.mock("../components/editors/EditorFactory", () => ({
    EditorFactory: ({ fieldInputType }: { fieldInputType: InputType }) =>
        <div data-testid="editor" data-mode={fieldInputType.fieldType} />,
}));

const template = (type: string, mode?: InputType["fieldType"]) => ({
    types: [
        ...(mode ? [{ fieldType: mode, ballerinaType: type, selected: false }] : []),
        { fieldType: "EXPRESSION", ballerinaType: type, selected: false },
    ],
});
const list = (type: string, mode?: InputType["fieldType"]): InputType =>
    ({ fieldType: "REPEATABLE_LIST", ballerinaType: `${type}[]`, selected: false, template: template(type, mode) }) as InputType;
const map = (type: string, mode?: InputType["fieldType"]): InputType =>
    ({ fieldType: "REPEATABLE_MAP", ballerinaType: `map<${type}>`, selected: false, template: template(type, mode) }) as InputType;
const NUMBER: InputType = { fieldType: "NUMBER", ballerinaType: "int", selected: false };
const TEXT: InputType = { fieldType: "TEXT", ballerinaType: "string", selected: false };
const EXPRESSION: InputType = { fieldType: "ACTION_OR_EXPRESSION", selected: false };

// The types the declare variable form gives its expression for each type name typed so far
const INT_LIST = [list("int", "NUMBER"), EXPRESSION];
const STRING_LIST = [list("string", "TEXT"), EXPRESSION];
const INT_MAP = [map("int", "NUMBER"), EXPRESSION];
const EXPRESSION_ONLY = [EXPRESSION];

// A list and a map as their editors hold them
const LIST_VALUE = [{ key: "ar-elm-1", value: "1" }, { key: "ar-elm-2", value: "2" }];
const MAP_VALUE = { a: { key: "mp-val-1", value: "1" } };

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
    return {
        ...utils,
        retype: (...steps: InputType[][]) => steps.forEach(types => act(() => retype(types))),
        value: () => utils.getForm().getValues("expression"),
        mode: () => screen.getByTestId("editor").getAttribute("data-mode"),
    };
}

describe("FieldFactory on a type change", () => {
    it("keeps a list while its type is retyped keystroke by keystroke (int[] → nt[] → [] → string[])", () => {
        const { retype, value, mode } = renderRetypable(INT_LIST, LIST_VALUE);
        retype([list("nt"), EXPRESSION], [list("t"), EXPRESSION], EXPRESSION_ONLY, STRING_LIST);
        expect(value()).toBe("[1, 2]");
        expect(mode()).toBe("ACTION_OR_EXPRESSION");
    });

    it("keeps a list when the type field is cleared", () => {
        const { retype, value, mode } = renderRetypable(INT_LIST, LIST_VALUE);
        retype(EXPRESSION_ONLY);
        expect(value()).toBe("[1, 2]");
        expect(mode()).toBe("ACTION_OR_EXPRESSION");
    });

    it.each([
        ["a list, when the type becomes a map", INT_LIST, LIST_VALUE, INT_MAP, "[1, 2]"],
        ["a list, when the type becomes a number", INT_LIST, LIST_VALUE, [NUMBER, EXPRESSION], "[1, 2]"],
        ["a map, when the type becomes a list", INT_MAP, MAP_VALUE, INT_LIST, "{ a: 1}"],
    ])("opens %s as its expression text", (_, before, held, after, text) => {
        const { retype, value, mode } = renderRetypable(before, held);
        retype(after);
        expect(value()).toBe(text);
        expect(mode()).toBe("ACTION_OR_EXPRESSION");
    });

    it.each([
        ["int[] → string[]", INT_LIST, STRING_LIST, LIST_VALUE, "[1, 2]", "REPEATABLE_LIST"],
        ["string[] → int[]", STRING_LIST, INT_LIST, LIST_VALUE, "[1, 2]", "REPEATABLE_LIST"],
        ["map<int> → map<string>", INT_MAP, [map("string", "TEXT"), EXPRESSION], MAP_VALUE, "{ a: 1}", "REPEATABLE_MAP"],
    ])("rebuilds the entries from their text when the element type changes (%s)", (_, before, after, held, text, kept) => {
        const { retype, value, mode } = renderRetypable(before, held);
        retype(after);
        // A string value is read back into entries that open in the expression mode, not the old element's mode
        expect(value()).toBe(text);
        expect(mode()).toBe(kept);
    });

    it("keeps a list as it is while the element type is unchanged (int[] → int[]?)", () => {
        const { retype, value, mode } = renderRetypable(INT_LIST, LIST_VALUE);
        retype([{ ...list("int", "NUMBER"), ballerinaType: "int[]?" }, EXPRESSION]);
        expect(value()).toEqual(LIST_VALUE);
        expect(mode()).toBe("REPEATABLE_LIST");
    });

    it("opens a text value as an expression when the new type's mode cannot edit it (string → int)", () => {
        const { retype, value, mode } = renderRetypable([{ ...TEXT, selected: true }, EXPRESSION], "string `hello`");
        expect(mode()).toBe("TEXT");
        retype([NUMBER, EXPRESSION]);
        expect(value()).toBe("string `hello`");
        expect(mode()).toBe("ACTION_OR_EXPRESSION");
    });

    it("writes a nested list as its own text when a type change drops its mode (int[][] → int)", () => {
        const nested = [{ key: "ar-elm-1", value: LIST_VALUE }, { key: "ar-elm-2", value: [{ key: "ar-elm-3", value: "3" }] }];
        const { retype, value } = renderRetypable([list("int[]"), EXPRESSION], nested);
        retype([NUMBER, EXPRESSION]);
        expect(value()).toBe("[[1, 2], [3]]");
    });

    it("opens an empty value in the new type's own mode (string → int)", () => {
        const { retype, mode } = renderRetypable([{ ...TEXT, selected: true }, EXPRESSION], "");
        retype([NUMBER, EXPRESSION]);
        expect(mode()).toBe("NUMBER");
    });

    it("keeps an expression across a type change", () => {
        const { retype, value } = renderRetypable([NUMBER, EXPRESSION], "check client->get(\"/a\")");
        retype(INT_LIST);
        expect(value()).toBe("check client->get(\"/a\")");
    });
});
