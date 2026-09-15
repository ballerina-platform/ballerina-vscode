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

jest.mock("@wso2/ballerina-rpc-client", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

// Stub the ui-toolkit AutoComplete: record the props the editor passes and expose its onValueChange so a test can emit the
// clear signal a nullable Combobox sends on blur, without depending on Headless UI internals.
const mockAutoComplete: { props?: any } = {};
jest.mock("@wso2/ui-toolkit", () => {
    const actual = jest.requireActual("@wso2/ui-toolkit");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const react = require("react");
    return {
        __esModule: true,
        ...actual,
        // forwardRef because the real AutoComplete is one and register() passes a ref.
        AutoComplete: react.forwardRef((props: any, ref: any) => {
            mockAutoComplete.props = props;
            return react.createElement("input", {
                ref,
                "data-testid": "autocomplete-input",
                value: props.value ?? "",
                readOnly: true,
            });
        }),
    };
});

import { act } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { AutoCompleteEditor } from "../components/editors/AutoCompleteEditor";

const KEY = "approvalFunction";

const autoCompleteField = (optional: boolean): FormField =>
    ({
        key: KEY,
        label: "Approval Function",
        type: "AUTOCOMPLETE",
        items: ["approveFn", "rejectFn"],
        value: "approveFn",
        optional,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

/** The value a nullable Headless UI Combobox reports when cleared and blurred: getItemKey(null). */
const CLEARED = undefined;

beforeEach(() => {
    mockAutoComplete.props = undefined;
});

describe("AutoCompleteEditor clear-on-blur (#2270)", () => {
    it("INVARIANT: makes the Combobox nullable for an optional field", () => {
        renderWithForm(<AutoCompleteEditor field={autoCompleteField(true)} />, {
            defaultValues: { [KEY]: "approveFn" },
        });
        expect(mockAutoComplete.props.nullable).toBe(true);
    });

    it("INVARIANT: keeps the Combobox non-nullable for a required field", () => {
        renderWithForm(<AutoCompleteEditor field={autoCompleteField(false)} />, {
            defaultValues: { [KEY]: "approveFn" },
        });
        expect(mockAutoComplete.props.nullable).toBe(false);
    });

    it("INVARIANT: an optional field commits empty when cleared", () => {
        const { getForm } = renderWithForm(<AutoCompleteEditor field={autoCompleteField(true)} />, {
            defaultValues: { [KEY]: "approveFn" },
        });

        // Clear the input and blur without selecting a suggestion -> nullable Combobox reports empty.
        act(() => mockAutoComplete.props.onValueChange(CLEARED));

        expect(getForm().getValues(KEY)).toBe("");
    });

    it("INVARIANT: a cleared optional field passes strict null to the Combobox (#2270 saved-form)", () => {
        // Headless UI restores the value on blur unless the Combobox value is strictly null;
        // an empty string is not enough. The editor must translate the cleared "" to null so a
        // previously-saved value can actually be removed.
        renderWithForm(<AutoCompleteEditor field={autoCompleteField(true)} />, {
            defaultValues: { [KEY]: "approveFn" },
        });

        expect(mockAutoComplete.props.value).toBe("approveFn");
        act(() => mockAutoComplete.props.onValueChange(CLEARED));
        expect(mockAutoComplete.props.value).toBeNull();
    });

    it("INVARIANT: a required field restores its prior value on empty blur", () => {
        const { getForm } = renderWithForm(<AutoCompleteEditor field={autoCompleteField(false)} />, {
            defaultValues: { [KEY]: "approveFn" },
        });

        act(() => mockAutoComplete.props.onValueChange(CLEARED));

        expect(getForm().getValues(KEY)).toBe("approveFn");
    });

    it("INVARIANT: a required field with an initially empty value restores its configured fallback on empty blur", () => {
        // An empty form value must be treated as absent, not preserved: blur should restore the
        // field's configured default (getValueForDropdown -> field.value "approveFn").
        const { getForm } = renderWithForm(<AutoCompleteEditor field={autoCompleteField(false)} />, {
            defaultValues: { [KEY]: "" },
        });

        act(() => mockAutoComplete.props.onValueChange(CLEARED));

        expect(getForm().getValues(KEY)).toBe("approveFn");
    });
});
