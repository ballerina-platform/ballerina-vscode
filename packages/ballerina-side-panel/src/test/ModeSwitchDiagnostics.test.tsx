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
import { EditorView } from "@codemirror/view";
import type { FormDiagnostics } from "@wso2/ballerina-core";
import type { FormExpressionEditorProps, FormField } from "../components/Form/types";
import { Form } from "../components/Form";

const pathField = (optional: boolean): FormField =>
    ({
        key: "path",
        label: "Path",
        type: "EXPRESSION",
        value: "/tmp",
        optional,
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

describe("Form — switching an invalid expression back to Text", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = async () => {
        await act(async () => {
            jest.advanceTimersByTime(300);
        });
    };

    // Stands in for the LS: any shown expression is an error; showDiagnostics=false clears.
    const fakeDiagnostics = () => jest.fn(async (
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

    const renderAndSwitchToText = async (optional: boolean) => {
        const getExpressionFormDiagnostics = fakeDiagnostics();
        const expressionEditor = {
            completions: [],
            retrieveCompletions: jest.fn(async () => {}),
            getExpressionFormDiagnostics,
        } as unknown as FormExpressionEditorProps;
        const onValidityChange = jest.fn();

        const utils = render(
            <Form
                formFields={[pathField(optional)]}
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
            fireEvent.click(utils.getByTestId("primary-mode"));
        });
        await act(async () => {
            fireEvent.click(utils.getByText("Continue"));
        });
        await settle();
        await settle();
        return { ...utils, getExpressionFormDiagnostics, onValidityChange };
    };

    it("drops the expression diagnostics, re-enabling Save", async () => {
        // Optional, so the emptied field is valid on its own and only stale diagnostics can block Save.
        const { getExpressionFormDiagnostics, onValidityChange, queryByText } = await renderAndSwitchToText(true);

        expect(getExpressionFormDiagnostics).toHaveBeenLastCalledWith(
            false, "", "path", expect.anything(), expect.any(Function), expect.anything(), undefined
        );
        expect(queryByText("missing identifier")).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    it("clears the required error once the emptied field is typed into", async () => {
        const { container, queryByText, onValidityChange } = await renderAndSwitchToText(false);
        expect(queryByText("missing identifier")).toBeNull();
        expect(queryByText("Path is required")).not.toBeNull();

        const editorDom = container.querySelector(".cm-editor") as HTMLElement;
        expect(editorDom).not.toBeNull();
        const view = EditorView.findFromDOM(editorDom)!;
        // jsdom has no layout, so CodeMirror cannot place the cursor and the change listener would
        // throw before reaching the field's onChange. Give it a position; nothing here reads it.
        jest.spyOn(view, "coordsAtPos").mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
        await act(async () => {
            view.dispatch({ changes: { from: 0, insert: "/tmp" }, userEvent: "input.type" });
        });
        await settle();

        expect(queryByText("Path is required")).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });
});
