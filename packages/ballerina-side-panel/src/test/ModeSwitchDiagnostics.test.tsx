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
import { debounce } from "lodash";
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

    const renderForm = async (
        field: FormField,
        getExpressionFormDiagnostics: ReturnType<typeof fakeDiagnostics> = fakeDiagnostics()
    ) => {
        const expressionEditor = {
            completions: [],
            retrieveCompletions: jest.fn(async () => {}),
            getExpressionFormDiagnostics,
        } as unknown as FormExpressionEditorProps;
        const onValidityChange = jest.fn();
        let formFields = [field];
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
        // As on a node refresh: the host hands the form freshly built fields.
        const receiveFields = async (fields: FormField[]) => {
            formFields = fields;
            utils.rerender(ui());
            await settle();
        };
        return { ...utils, getExpressionFormDiagnostics, onValidityChange, receiveServerErrors, receiveFields };
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

    const renderAndDropToText = async (optional: boolean | FormField) => {
        const rendered = await renderForm(typeof optional === "boolean" ? pathField(optional) : optional);
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

    // ---- Late fetches, kept values, named rules and field-supplied diagnostics ----

    const isBad = (expression: string) => expression.includes("missing") || /^\s*\//.test(expression) || /^x/.test(expression);

    // Mirrors FlowNodeForm's host handler: one lodash debounce (250 ms) in front of an async LS call.
    const debouncedHost = () => jest.fn(debounce(async (
        showDiagnostics: boolean,
        expression: string,
        key: string,
        _property: unknown,
        setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void
    ) => {
        if (!showDiagnostics) {
            setDiagnosticsInfo({ key, diagnostics: [] });
            return;
        }
        await Promise.resolve();
        setDiagnosticsInfo({
            key,
            diagnostics: isBad(expression)
                ? [{ message: "missing identifier", severity: 1 } as FormDiagnostics["diagnostics"][number]]
                : [],
        });
    }, 250)) as unknown as ReturnType<typeof fakeDiagnostics>;

    // Same as typeInto, but without settling, so a debounced fetch is still pending afterwards.
    const editWithoutSettling = async (container: HTMLElement, change: { from: number; to?: number; insert: string }) => {
        const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
        jest.spyOn(view, "coordsAtPos").mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
        await act(async () => {
            view.dispatch({ changes: change, userEvent: "input.type" });
        });
    };

    const replaceAll = async (container: HTMLElement, text: string) => {
        const view = EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;
        await editWithoutSettling(container, { from: 0, to: view.state.doc.length, insert: text });
        await settle();
    };

    // Dropping the diagnostics does not cancel a fetch still debounced in the host or in flight.
    it("ignores a fetch requested before the switch dropped the value", async () => {
        const { container, getByTestId, getByText, onValidityChange } =
            await renderForm(pathField(true), debouncedHost());
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        // Edit, then switch to Text and confirm before the 250 ms debounce fires.
        await editWithoutSettling(container, { from: 0, insert: "x" });
        await act(async () => {
            fireEvent.click(getByTestId("primary-mode"));
        });
        await act(async () => {
            fireEvent.click(getByText("Continue"));
        });
        await settle();
        await settle();

        // The field is empty and optional; only the late diagnostics of `x/tmp` can block Save.
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    // Text mode does not fetch diagnostics on its own, so the kept value's must be re-checked as it is edited.
    it("re-checks a kept value's diagnostics as it is fixed in Text mode", async () => {
        const { container, getByTestId, onValidityChange } =
            await renderForm(pathField(true, "string `${missing}`"), debouncedHost());
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        await click(getByTestId("primary-mode"));
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        await replaceAll(container, "hello");
        await settle();

        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    // A host that does not rebuild the field on blur: the fresh result is all that describes the value.
    it("lets a fresh result replace the diagnostics a kept value came with", async () => {
        const field = {
            ...pathField(true, "string `${missing}`"),
            diagnostics: [{ message: "undefined symbol", severity: "ERROR" }],
        } as unknown as FormField;
        const { container, getByTestId, onValidityChange } = await renderForm(field, debouncedHost());
        await click(getByTestId("primary-mode"));
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        await replaceAll(container, "hello");
        await settle();

        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    it("keeps the fresh result, not the replaced one, when the host hands back the same field", async () => {
        const field = {
            ...pathField(true, "missing"),
            diagnostics: [{ message: "undefined symbol", severity: "ERROR" }],
        } as unknown as FormField;
        const { container, onValidityChange, receiveFields } = await renderForm(field, debouncedHost());

        await replaceAll(container, "ok");
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
        await receiveFields([field]);
        expect(onValidityChange).toHaveBeenLastCalledWith(true);

        await replaceAll(container, "xyz");
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
        await receiveFields([field]);
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
    });

    // A failed LS call answers with no diagnostics. That is not a verdict on the value, so it must not
    // stand in for the full-node compile that produced the diagnostics a reopened node arrived with.
    it("keeps the diagnostics a field arrived with when the check fails", async () => {
        let lsUp = false;
        const host = jest.fn(debounce(async (
            showDiagnostics: boolean,
            expression: string,
            key: string,
            _property: unknown,
            setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void
        ) => {
            await Promise.resolve();
            if (!lsUp) {
                setDiagnosticsInfo({ key, diagnostics: [], checkFailed: true });
                return;
            }
            setDiagnosticsInfo({
                key,
                diagnostics: showDiagnostics && isBad(expression)
                    ? [{ message: "missing identifier", severity: 1 } as FormDiagnostics["diagnostics"][number]]
                    : [],
            });
        }, 250)) as unknown as ReturnType<typeof fakeDiagnostics>;
        const field = {
            ...pathField(true, "missing"),
            diagnostics: [{ message: "undefined symbol", severity: 1 }],
        } as unknown as FormField;

        // The fetch on mount fails.
        const { container, queryByText, onValidityChange } = await renderForm(field, host);
        expect(host).toHaveBeenCalled();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
        expect(queryByText("undefined symbol")).not.toBeNull();

        // So does the check of an edit: the value is still unverified.
        await replaceAll(container, "missing ");
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
        expect(queryByText("undefined symbol")).not.toBeNull();

        // A check that runs still replaces them.
        lsUp = true;
        await replaceAll(container, "ok");
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    // rules.validate is an object, so react-hook-form names the error after the failing key
    // (`common.validate.max.length#0`, `minItems`), never `validate`.
    it("clears a named validator's error once the value satisfies it", async () => {
        const field = pathField(false);
        // Text mode stores `string `<text>``, so max 12 admits "ab" (11 chars) but not "abcdef".
        field.types.find((t) => t.fieldType === "TEXT")!.validations = [
            { rule: "common.validate.max.length", args: { max: 12 }, severity: "ERROR" },
        ] as FormField["types"][number]["validations"];
        const { container, queryByText, onValidityChange } = await renderAndDropToText(field);
        expect(queryByText("Path is required")).not.toBeNull();

        // required passes, max.length fails → RHF names the error `common.validate.max.length#0`.
        await typeInto(container, "abcdef");
        expect(queryByText("Path is required")).toBeNull();
        expect(queryByText(/at most 12 characters/)).not.toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        await replaceAll(container, "ab"); // every rule passes now
        // The live (client-rule) banner clears; the RHF error, named after the rule, is never re-checked.
        expect(queryByText(/at most 12 characters/)).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    // E.g. a saved node reopened: `isValid` reads formFields[].diagnostics as well as fetched ones.
    it("drops the diagnostics the field came with along with the value", async () => {
        const field = {
            ...pathField(true),
            diagnostics: [{ message: "undefined symbol", severity: "ERROR" }],
        } as unknown as FormField;
        const { onValidityChange } = await renderAndDropToText(field);

        expect(onValidityChange).toHaveBeenLastCalledWith(true);
        // Dropped by the form, not cleared on the host's field object.
        expect(field.diagnostics).toHaveLength(1);
    });

    it("counts the diagnostics a host rebuilds the field with after the drop", async () => {
        const diagnosed = (value: string) => ({
            ...pathField(true, value),
            diagnostics: [{ message: "undefined symbol", severity: "ERROR" }],
        } as unknown as FormField);
        const { onValidityChange, receiveFields } = await renderAndDropToText(diagnosed("/tmp"));
        expect(onValidityChange).toHaveBeenLastCalledWith(true);

        await receiveFields([diagnosed("")]);

        expect(onValidityChange).toHaveBeenLastCalledWith(false);
    });

    it("keeps dropped diagnostics dropped when the host hands back the same field", async () => {
        const field = {
            ...pathField(true),
            diagnostics: [{ message: "undefined symbol", severity: "ERROR" }],
        } as unknown as FormField;
        const { onValidityChange, receiveFields } = await renderAndDropToText(field);
        expect(onValidityChange).toHaveBeenLastCalledWith(true);

        await receiveFields([field]); // a new formFields array, the same field and diagnostics

        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    // The Text and Expression editors are separate instances, so the switch unmounts the one whose
    // live rules flagged the dropped value, and with it that field's entry in the live store.
    it("drops the live rule errors of a value the switch discards", async () => {
        const field = pathField(true);
        field.types.find((t) => t.fieldType === "EXPRESSION")!.validations = [
            { rule: "common.validate.max.length", args: { max: 5 }, severity: "ERROR" },
        ] as FormField["types"][number]["validations"];
        const { container, getByTestId, getByText, queryByText, onValidityChange } = await renderForm(field);

        await typeInto(container, "xx"); // `xx/tmp` is 6 characters
        expect(queryByText(/at most 5 characters/)).not.toBeNull();

        await act(async () => {
            fireEvent.click(getByTestId("primary-mode"));
        });
        await click(getByText("Continue"));

        expect(queryByText(/at most 5 characters/)).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    // Each answer is about the value it was asked for, and answers can come back in any order.
    it("applies only the answer to the latest request when answers arrive out of order", async () => {
        const pending: { expression: string; answer: () => void }[] = [];
        const host = jest.fn((
            showDiagnostics: boolean,
            expression: string,
            key: string,
            _property: unknown,
            setDiagnosticsInfo: (diagnostics: FormDiagnostics) => void
        ) => new Promise<void>((resolve) => {
            pending.push({
                expression,
                answer: () => {
                    setDiagnosticsInfo({
                        key,
                        diagnostics: showDiagnostics && isBad(expression)
                            ? [{ message: "missing identifier", severity: 1 } as FormDiagnostics["diagnostics"][number]]
                            : [],
                    });
                    resolve();
                },
            });
        })) as unknown as ReturnType<typeof fakeDiagnostics>;
        const answer = async (expression: string) => {
            const request = [...pending].reverse().find((item) => item.expression === expression);
            expect(request).toBeDefined();
            await act(async () => request!.answer());
            await settle();
        };

        const { container, queryByText, onValidityChange } = await renderForm(pathField(true, "hello"), host);
        for (const request of pending.splice(0)) {
            await act(async () => request.answer());
        }
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);

        await editWithoutSettling(container, { from: 0, insert: "x" });
        await settle();
        await editWithoutSettling(container, { from: 0, to: 1, insert: "" });
        await settle();

        // The later request, for `hello`, answers first; the one for `xhello` arrives after it.
        await answer("hello");
        await answer("xhello");

        expect(queryByText("missing identifier")).toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });

    it("keeps an emptied field's diagnostics when its active mode is chosen again", async () => {
        // Empty, so only the mode check stands between this click and the clear. An empty value is
        // not fetched on mount, so the diagnostic comes with the field.
        const field = {
            ...pathField(true, ""),
            diagnostics: [{ message: "missing identifier", severity: "ERROR" }],
        } as unknown as FormField;
        const { getByTestId, queryByText, onValidityChange } = await renderForm(field);
        expect(queryByText("missing identifier")).not.toBeNull();

        await click(getByTestId("expression-mode"));

        expect(queryByText("missing identifier")).not.toBeNull();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);
    });
});
