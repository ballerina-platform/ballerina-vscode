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

// Expression diagnostics belong to the value in the mode that produced them. Text mode never
// re-fetches diagnostics, so switching Expression → Text (which clears an incompatible value) must
// also drop them — otherwise a stale `missing identifier` from `/tmp` keeps Save disabled.
// wso2/product-integrator#625.

import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import type { FormDiagnostics } from "@wso2/ballerina-core";
import type { FormExpressionEditorProps, FormField } from "../components/Form/types";
import { Form } from "../components/Form";

const pathField = (): FormField =>
    ({
        key: "path",
        label: "Path",
        type: "EXPRESSION",
        value: "/tmp",
        // Optional, so the emptied field is valid on its own and only stale diagnostics can block Save.
        optional: true,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [
            { fieldType: "TEXT", selected: false },
            { fieldType: "EXPRESSION", selected: true },
        ],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    onSubmit: () => {},
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
};

describe("Form — switching input mode drops the previous mode's diagnostics", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = async () => {
        await act(async () => {
            jest.advanceTimersByTime(300);
        });
    };

    it("re-enables Save after switching an invalid expression back to Text", async () => {
        // Stands in for the LS: any shown expression is an error; showDiagnostics=false clears.
        const getExpressionFormDiagnostics = jest.fn(async (
            showDiagnostics: boolean,
            _expression: string,
            key: string,
            _property: unknown,
            setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void
        ) => {
            setDiagnosticsInfo({
                key,
                diagnostics: showDiagnostics
                    ? [{ message: "missing identifier", severity: 1 } as FormDiagnostics["diagnostics"][number]]
                    : [],
            });
        });
        const expressionEditor = {
            completions: [],
            getExpressionFormDiagnostics,
        } as unknown as FormExpressionEditorProps;
        const onValidityChange = jest.fn();

        const { getByTestId, getByText, queryByText } = render(
            <Form
                formFields={[pathField()]}
                {...common}
                expressionEditor={expressionEditor}
                onValidityChange={onValidityChange}
            />
        );
        await settle();
        expect(getExpressionFormDiagnostics).toHaveBeenCalledWith(
            true, "/tmp", "path", expect.anything(), expect.any(Function), expect.anything(), undefined
        );
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        // `/tmp` is not a string literal, so Text asks before discarding it.
        await act(async () => {
            fireEvent.click(getByTestId("primary-mode"));
        });
        await act(async () => {
            fireEvent.click(getByText("Continue"));
        });
        await settle();
        await settle();

        expect(getExpressionFormDiagnostics).toHaveBeenLastCalledWith(
            false, "", "path", expect.anything(), expect.any(Function), expect.anything(), undefined
        );
        expect(queryByText("missing identifier")).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });
});
