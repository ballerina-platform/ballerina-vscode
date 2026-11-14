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

// Expression diagnostics belong to the value they were produced for. Text mode never re-fetches
// diagnostics, so a mode switch that drops an incompatible value (Expression `/tmp` → Text) must
// also drop them, or a stale `missing identifier` keeps Save disabled. A switch that keeps the value
// must keep them, or an invalid value saves. wso2/product-integrator#625.

import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import type { FormDiagnostics, ValidationResult } from "@wso2/ballerina-core";
import type { FormExpressionEditorProps, FormField } from "../components/Form/types";
import { Form } from "../components/Form";

type Mode = "TEXT" | "EXPRESSION";

const pathField = (optional: boolean, value = "/tmp", mode: Mode = "EXPRESSION"): FormField =>
    ({
        key: "path",
        label: "Path",
        type: "EXPRESSION",
        value,
        optional,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [
            { fieldType: "TEXT", selected: mode === "TEXT" },
            { fieldType: "EXPRESSION", selected: mode === "EXPRESSION" },
        ],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    onSubmit: () => {},
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
};

describe("Form — diagnostics across an input-mode switch", () => {
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

    // Only (showDiagnostics, expression, key) are under test; the rest is Form plumbing.
    const requests = (mock: ReturnType<typeof fakeDiagnostics>) =>
        mock.mock.calls.map(([show, expression, key]) => [show, expression, key]);

    const renderForm = async (field: FormField) => {
        const getExpressionFormDiagnostics = fakeDiagnostics();
        const expressionEditor = {
            completions: [],
            retrieveCompletions: jest.fn(async () => {}),
            getExpressionFormDiagnostics,
        } as unknown as FormExpressionEditorProps;
        const onValidityChange = jest.fn();
        const formFields = [field];
        const ui = (errors?: ValidationResult[]) => (
            <Form
                formFields={formFields}
                {...common}
                expressionEditor={expressionEditor}
                onValidityChange={onValidityChange}
                serverValidationErrors={errors}
            />
        );

        const utils = render(ui());
        await settle();
        // As after a save: the server's verdict reaches a form that is already up.
        const receiveServerErrors = async (errors: ValidationResult[]) => {
            utils.rerender(ui(errors));
            await settle();
        };
        return { ...utils, getExpressionFormDiagnostics, onValidityChange, receiveServerErrors };
    };

    const click = async (element: HTMLElement) => {
        await act(async () => {
            fireEvent.click(element);
        });
        await settle();
        await settle();
    };

    const typeInto = async (container: HTMLElement, text: string) => {
        const editorDom = container.querySelector(".cm-editor") as HTMLElement;
        expect(editorDom).not.toBeNull();
        const view = EditorView.findFromDOM(editorDom)!;
        // jsdom has no layout, so CodeMirror cannot place the cursor and the change listener would
        // throw before reaching the field's onChange. Give it a position; nothing here reads it.
        jest.spyOn(view, "coordsAtPos").mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
        await act(async () => {
            view.dispatch({ changes: { from: 0, insert: text }, userEvent: "input.type" });
        });
        await settle();
    };

    const renderAndDropToText = async (optional: boolean) => {
        const rendered = await renderForm(pathField(optional));
        expect(requests(rendered.getExpressionFormDiagnostics)).toContainEqual([true, "/tmp", "path"]);
        expect(rendered.onValidityChange).toHaveBeenLastCalledWith(false);

        // `/tmp` is not a string literal, so Text asks before discarding it.
        await act(async () => {
            fireEvent.click(rendered.getByTestId("primary-mode"));
        });
        await click(rendered.getByText("Continue"));
        return rendered;
    };

    it("drops the diagnostics of a value the switch discards, re-enabling Save", async () => {
        // Optional, so the emptied field is valid on its own and only stale diagnostics can block Save.
        const { getExpressionFormDiagnostics, onValidityChange, queryByText } = await renderAndDropToText(true);

        expect(queryByText("missing identifier")).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
        // Cleared directly, not through the host's form-wide debounce, which would cancel a fetch
        // pending for another field.
        expect(requests(getExpressionFormDiagnostics)).not.toContainEqual([false, "", "path"]);
    });

    it("keeps the diagnostics of a value the switch keeps, so it cannot be saved", async () => {
        // A string template is valid Text, so the switch keeps it, and Text never re-checks it.
        const { getByTestId, onValidityChange } = await renderForm(pathField(true, "string `${missing}`"));
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        await click(getByTestId("primary-mode"));

        expect(onValidityChange).toHaveBeenLastCalledWith(false);
    });

    it("keeps the diagnostics when the active mode is chosen again", async () => {
        const { getByTestId, getExpressionFormDiagnostics, onValidityChange } = await renderForm(pathField(true));
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
        const fetches = getExpressionFormDiagnostics.mock.calls.length;

        await click(getByTestId("expression-mode"));

        expect(onValidityChange).toHaveBeenLastCalledWith(false);
        expect(getExpressionFormDiagnostics.mock.calls.length).toBe(fetches);
    });

    it("validates a value switched into Expression mode", async () => {
        const { getByTestId, getExpressionFormDiagnostics, onValidityChange } =
            await renderForm(pathField(true, "\"/tmp\"", "TEXT"));
        const fetchedFor = () => requests(getExpressionFormDiagnostics)
            .filter(([show, , key]) => show && key === "path")
            .map(([, expression]) => expression);
        expect(fetchedFor()).toEqual([]);
        expect(onValidityChange).toHaveBeenLastCalledWith(true);

        await click(getByTestId("expression-mode"));

        // The kept value, now the expression `string `/tmp``, is checked once the editor mounts.
        expect(fetchedFor()).toEqual([expect.stringContaining("/tmp")]);
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
    });

    it("clears the required error once the emptied field is typed into", async () => {
        const { container, queryByText, onValidityChange } = await renderAndDropToText(false);
        expect(queryByText("missing identifier")).toBeNull();
        expect(queryByText("Path is required")).not.toBeNull();

        await typeInto(container, "/tmp");

        expect(queryByText("Path is required")).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    it("leaves a server validation error for the server to clear", async () => {
        const serverError = {
            propertyPath: "path",
            rule: "ls.path",
            message: "Directory does not exist",
            severity: "ERROR",
        } as ValidationResult;
        const { container, queryByText, receiveServerErrors } = await renderForm(pathField(true, "", "TEXT"));
        await receiveServerErrors([serverError]);
        expect(queryByText("Directory does not exist")).not.toBeNull();

        await typeInto(container, "/data");

        expect(queryByText("Directory does not exist")).not.toBeNull();
    });
});
