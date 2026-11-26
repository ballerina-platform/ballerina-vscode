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

/**
 * L2 tests for the add, delete and error banner flows of the repeatable list (FormArrayEditorWrapper) and map
 * (FormMapEditorWrapper) editors. The real wrappers and editors render inside a real form. Each row is a nested
 * Form with a code editor inside, so it is replaced with a placeholder and the tests cover the editors' own
 * logic: the value they write to the form, the validation they request and the messages they show.
 */

import React from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import type { FormDiagnostics } from "@wso2/ballerina-core";
import type { FormExpressionEditorProps, FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FormArrayEditorWrapper } from "../components/editors/FormArrayEditorWrapper";
import { FormMapEditorWrapper } from "../components/editors/FormMapEditorNewWrapper";

// The props each row's Form was last rendered with, so a test can act as that Form.
const mockRowProps: any[] = [];

jest.mock("../components/Form", () => {
    const RowForm = (props: any) => {
        mockRowProps.push(props);
        return <div data-testid="row-form" />;
    };
    return { __esModule: true, Form: RowForm, default: RowForm, FormRow: "div", FormButtonContainer: "div" };
});

const repeatableField = (overrides: Partial<FormField> & { fieldType: "REPEATABLE_LIST" | "REPEATABLE_MAP" }): FormField => {
    const { fieldType, ...rest } = overrides;
    return {
        key: "items",
        label: "Items",
        type: fieldType,
        value: "",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        types: [{ fieldType, selected: true, template: { types: [{ fieldType: "EXPRESSION", selected: true }] } } as any],
        ...rest,
    } as unknown as FormField;
};

function renderArray(field: FormField, defaultValue: unknown = "", expressionEditor?: FormExpressionEditorProps) {
    const handleFormValidation = jest.fn().mockResolvedValue(true);
    const utils = renderWithForm(
        <FormArrayEditorWrapper
            field={field}
            fieldInputType={field.types[0]}
            openSubPanel={() => {}}
            handleFormValidation={handleFormValidation}
        />,
        { defaultValues: { items: defaultValue }, context: { expressionEditor } }
    );
    return { ...utils, handleFormValidation };
}

function renderMap(field: FormField, defaultValue: unknown = "", expressionEditor?: FormExpressionEditorProps) {
    const handleFormValidation = jest.fn().mockResolvedValue(true);
    const utils = renderWithForm(
        <FormMapEditorWrapper
            field={field}
            fieldInputType={field.types[0]}
            openSubPanel={() => {}}
            handleFormValidation={handleFormValidation}
        />,
        { defaultValues: { items: defaultValue }, context: { expressionEditor } }
    );
    return { ...utils, handleFormValidation };
}

const deleteFirstRow = (container: HTMLElement) => {
    const closeIcon = container.querySelector(".codicon-close");
    expect(closeIcon).not.toBeNull();
    fireEvent.click(closeIcon!);
};

describe("FormArrayEditor add and delete flows", () => {
    it("adds an element to the form value and requests a forced validation", () => {
        const { getForm, handleFormValidation } = renderArray(repeatableField({ fieldType: "REPEATABLE_LIST" }));

        fireEvent.click(screen.getByText("Initialize Array"));

        expect(screen.getAllByTestId("row-form")).toHaveLength(1);
        expect(getForm().getValues("items")).toHaveLength(1);
        expect(handleFormValidation).toHaveBeenCalledWith(undefined, true);
    });

    it("clears the value when the last element is deleted and requests a forced validation", () => {
        const { container, getForm, handleFormValidation } = renderArray(repeatableField({ fieldType: "REPEATABLE_LIST" }));
        fireEvent.click(screen.getByText("Initialize Array"));
        handleFormValidation.mockClear();

        deleteFirstRow(container);

        expect(screen.queryAllByTestId("row-form")).toHaveLength(0);
        expect(getForm().getValues("items")).toBe("");
        expect(handleFormValidation).toHaveBeenCalledWith(undefined, true);
    });

    it("keeps the remaining elements when one of several is deleted", () => {
        const { container, getForm } = renderArray(
            repeatableField({ fieldType: "REPEATABLE_LIST" }),
            ["a", "b"]
        );
        expect(screen.getAllByTestId("row-form")).toHaveLength(2);

        deleteFirstRow(container);

        expect(screen.getAllByTestId("row-form")).toHaveLength(1);
        expect(getForm().getValues("items").map((element: any) => element.value)).toEqual(["b"]);
    });
});

describe("FormMapEditorNew add and delete flows", () => {
    it("adds an empty row without requesting redundant validation", () => {
        const { getForm, handleFormValidation } = renderMap(repeatableField({ fieldType: "REPEATABLE_MAP" }));

        fireEvent.click(screen.getByText("Initialize Map"));

        expect(screen.getAllByTestId("row-form")).toHaveLength(1);
        expect(getForm().getValues("items")).toBe("");
        expect(handleFormValidation).not.toHaveBeenCalled();
    });

    it("clears the value when the last entry is deleted and requests a forced validation", () => {
        const { container, getForm, handleFormValidation } = renderMap(
            repeatableField({ fieldType: "REPEATABLE_MAP" }),
            { host: { key: "mp-val-1", value: "localhost" } }
        );
        expect(screen.getAllByTestId("row-form")).toHaveLength(1);

        deleteFirstRow(container);

        expect(screen.queryAllByTestId("row-form")).toHaveLength(0);
        expect(getForm().getValues("items")).toBe("");
        expect(handleFormValidation).toHaveBeenCalledWith(undefined, true);
    });
});

describe("repeatable editor error banner", () => {
    it("shows each language server message once when the form error repeats the field diagnostics", () => {
        const field = repeatableField({
            fieldType: "REPEATABLE_LIST",
            diagnostics: [
                { message: "first problem", severity: "ERROR" },
                { message: "second problem", severity: "ERROR" },
            ] as any,
        });
        const { container, getForm } = renderArray(field);

        act(() => {
            getForm().setError("items", { type: "expression_diagnostic", message: "first problem\nsecond problem" });
        });

        const text = container.textContent ?? "";
        expect(text.split("first problem")).toHaveLength(2);
        expect(text.split("second problem")).toHaveLength(2);
    });

    it("shows the required marker for a required list", () => {
        const { container } = renderArray(repeatableField({ fieldType: "REPEATABLE_LIST" }));
        expect(container.textContent).toContain("*");
    });

    it("does not show the required marker for an optional map", () => {
        const { container } = renderMap(repeatableField({ fieldType: "REPEATABLE_MAP", optional: true }));
        expect(container.textContent).not.toContain("*");
    });
});

// Each element's Form owns its diagnostics and drops a result requested before it cleared the field.
// The list and map editors keep a copy of them on the element; that copy has to follow the Form.
describe("repeatable editor element diagnostics", () => {
    const missingIdentifier = [{ message: "missing identifier", severity: 1 }] as FormDiagnostics["diagnostics"];

    // Stands in for the LS: every element value is an error.
    const host = () => ({
        getExpressionFormDiagnostics: jest.fn(async (
            _show: boolean,
            _expression: string,
            key: string,
            _property: unknown,
            setDiagnosticsInfo: (diagnostics: FormDiagnostics) => boolean | void
        ) => {
            setDiagnosticsInfo({ key, diagnostics: missingIdentifier });
        }),
    }) as unknown as FormExpressionEditorProps;

    // The element's diagnostics as its row Form last received them.
    const lastRow = () => mockRowProps[mockRowProps.length - 1];
    const elementField = (): FormField => lastRow().formFields.find((field: FormField) => !field.key.startsWith("mp-key-"));

    // Acts as the row Form: requests diagnostics, answering whether it applied the result.
    const fetchAsRow = async (formApplies: boolean) => {
        const { expressionEditor } = lastRow();
        await act(async () => {
            await expressionEditor.getExpressionFormDiagnostics(true, "/tmp", elementField().key, {}, () => formApplies);
        });
    };

    const cases = [
        { name: "list", render: (editor: FormExpressionEditorProps) =>
            renderArray(repeatableField({ fieldType: "REPEATABLE_LIST" }), ["a"], editor) },
        { name: "map", render: (editor: FormExpressionEditorProps) =>
            renderMap(repeatableField({ fieldType: "REPEATABLE_MAP" }), { host: { key: "mp-val-1", value: "a" } }, editor) },
    ];

    beforeEach(() => {
        mockRowProps.length = 0;
    });

    it.each(cases)("$name: keeps a result only when the element's form keeps it", async ({ render }) => {
        render(host());

        await fetchAsRow(false);
        expect(elementField().diagnostics ?? []).toHaveLength(0);

        await fetchAsRow(true);
        expect(elementField().diagnostics).toHaveLength(1);
    });

    it.each(cases)("$name: drops the element's diagnostics when its form drops them", async ({ render }) => {
        render(host());
        await fetchAsRow(true);
        expect(elementField().diagnostics).toHaveLength(1);

        act(() => {
            lastRow().expressionEditor.onFieldDiagnosticsCleared(elementField().key);
        });

        expect(elementField().diagnostics).toHaveLength(0);
    });

    // The element validation asks the host itself, so a drop must stop its answer too.
    it.each(cases)("$name: ignores an element validation answer that lands after the drop", async ({ render }) => {
        const answers: (() => void)[] = [];
        render({
            getExpressionFormDiagnostics: jest.fn(async (
                _show: boolean,
                _expression: string,
                key: string,
                _property: unknown,
                setDiagnosticsInfo: (diagnostics: FormDiagnostics) => boolean | void
            ) => {
                answers.push(() => setDiagnosticsInfo({ key, diagnostics: missingIdentifier }));
            }),
        } as unknown as FormExpressionEditorProps);
        const key = elementField().key;

        await act(async () => {
            await lastRow().onFormValidation({ [key]: "/tmp" });
        });
        act(() => {
            lastRow().expressionEditor.onFieldDiagnosticsCleared(key);
        });
        act(() => {
            answers.forEach((answer) => answer());
        });

        expect(elementField().diagnostics).toHaveLength(0);
    });
});

// A row's Form also reports the values it opened with; only a reported edit makes the field dirty.
describe("repeatable editor dirty state", () => {
    const lastRow = () => mockRowProps[mockRowProps.length - 1];
    const elementKey = (): string =>
        lastRow().formFields.find((field: FormField) => !field.key.startsWith("mp-key-")).key;

    const cases = [
        { name: "list", render: () => renderArray(repeatableField({ fieldType: "REPEATABLE_LIST" }), ["a"]) },
        { name: "map", render: () =>
            renderMap(repeatableField({ fieldType: "REPEATABLE_MAP" }), { host: { key: "mp-val-1", value: "a" } }) },
    ];

    beforeEach(() => {
        mockRowProps.length = 0;
    });

    it.each(cases)("$name: stays clean when a row reports the value it opened with", ({ render }) => {
        const { getForm } = render();
        act(() => lastRow().onChange(elementKey(), "a", {}, false));
        expect(getForm().getFieldState("items").isDirty).toBe(false);
    });

    it.each(cases)("$name: turns dirty when a row reports an edit", ({ render }) => {
        const { getForm } = render();
        act(() => lastRow().onChange(elementKey(), "b", {}, true));
        expect(getForm().getFieldState("items").isDirty).toBe(true);
    });
});
