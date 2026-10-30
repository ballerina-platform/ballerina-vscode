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

// L2: the GraphQL type editor's non-null toggle. The field shows its type without the `?`, and a `!` toggle stands
// for GraphQL's non-null in its place: a Ballerina `T` is GraphQL's `T!`, and `T?` its nullable `T`.

import React from "react";
import { fireEvent } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ActionTypeEditor } from "../components/editors/ActionTypeEditor";

// The toolkit's expression editor does not instantiate under jsdom: a plain input stands in for it, passing the text
// and the end adornment through as the real one does.
jest.mock("@wso2/ui-toolkit", () => {
    const actual = jest.requireActual("@wso2/ui-toolkit");
    const React = jest.requireActual("react");
    return {
        ...actual,
        FormExpressionEditor: React.forwardRef((props: any, _ref: any) => (
            <div>
                <input
                    data-testid="type-input"
                    value={props.value}
                    onChange={(e: any) => props.onChange(e.target.value, e.target.value.length)}
                    onBlur={props.onBlur}
                />
                {props.endAdornment}
            </div>
        )),
    };
});

const expressionEditor = {
    types: [],
    referenceTypes: [],
    retrieveVisibleTypes: jest.fn(),
    getTypeHelper: jest.fn(),
};

const graphqlField = (value: string): FormField =>
    ({
        key: "returnType",
        label: "Field Type",
        type: "ACTION_TYPE",
        value,
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        types: [{ fieldType: "ACTION_TYPE", selected: true }],
    } as unknown as FormField);

const renderEditor = (value: string) =>
    renderWithForm(<ActionTypeEditor field={graphqlField(value)} />, {
        defaultValues: { returnType: value },
        context: { expressionEditor },
    });

const type = (input: HTMLElement, text: string) => fireEvent.change(input, { target: { value: text } });

describe("ActionTypeEditor non-null toggle", () => {
    it.each([
        ["Profile", "Profile", true],
        ["Profile?", "Profile", false],
        ["Profile[]?", "Profile[]", false],
        ["stream<Profile?>", "stream<Profile>", false],
    ])("shows %s as %s with non-null %s", (value, shown, nonNull) => {
        const { getByTestId } = renderEditor(value);
        expect(getByTestId("type-input")).toHaveValue(shown);
        expect(getByTestId("syntax-toggle-non-null")).toHaveAttribute("aria-pressed", String(nonNull));
    });

    it("starts a new type nullable, as GraphQL types are", () => {
        const { getByTestId, getForm } = renderEditor("");
        expect(getByTestId("syntax-toggle-non-null")).toHaveAttribute("aria-pressed", "false");
        type(getByTestId("type-input"), "Profile");
        expect(getForm().getValues("returnType")).toBe("Profile?");
    });

    it("keeps a non-null choice made before a type is typed", () => {
        const { getByTestId, getForm } = renderEditor("");
        fireEvent.click(getByTestId("syntax-toggle-non-null"));
        type(getByTestId("type-input"), "Profile");
        expect(getForm().getValues("returnType")).toBe("Profile");
    });

    it.each([
        ["Profile", "Profile?"],
        ["Profile?", "Profile"],
        ["stream<Profile>", "stream<Profile?>"],
        ["A|B", "(A|B)?"],
    ])("toggling %s writes %s", (value, expected) => {
        const { getByTestId, getForm } = renderEditor(value);
        fireEvent.click(getByTestId("syntax-toggle-non-null"));
        expect(getForm().getValues("returnType")).toBe(expected);
    });

    it("takes over a `?` typed at the end", () => {
        const { getByTestId, getForm } = renderEditor("Profile");
        type(getByTestId("type-input"), "Order?");
        expect(getForm().getValues("returnType")).toBe("Order?");
        expect(getByTestId("type-input")).toHaveValue("Order");
        expect(getByTestId("syntax-toggle-non-null")).toHaveAttribute("aria-pressed", "false");
    });

    it("keeps the text as typed while the user is typing", () => {
        const { getByTestId, getForm } = renderEditor("");
        type(getByTestId("type-input"), "int|");
        expect(getByTestId("type-input")).toHaveValue("int|");
        expect(getForm().getValues("returnType")).toBe("int?");
    });
});
