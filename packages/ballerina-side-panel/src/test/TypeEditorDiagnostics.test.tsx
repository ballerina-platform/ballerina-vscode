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

// L2: a TYPE field checks its value through the host's form diagnostics when the host opts in
// (function forms, wso2/product-integrator#320). An invalid type shows the error and keeps Save
// disabled; a valid one leaves Save enabled; without the opt-in no check is made.

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Diagnostic, LineRange } from "@wso2/ballerina-core";
import type { FormExpressionEditorProps, FormField } from "../components/Form/types";
import { Form } from "../components/Form";
import type { CompletionItem } from "@wso2/ui-toolkit";
import { TestRpcContext } from "./rpcHarness";

const RANGE: LineRange = { fileName: "functions.bal", startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } };

const returnTypeField: FormField = {
    key: "type",
    label: "Return Type",
    type: "TYPE",
    value: "",
    optional: true,
    editable: true,
    enabled: true,
    documentation: "",
    types: [{ fieldType: "TYPE", selected: true }],
};

// The Form calls many rpc methods on mount; those this test does not care about resolve to nothing.
const stub = <T extends object>(known: T, fallback: () => unknown): T =>
    new Proxy(known, {
        get: (target, key) => (key in target || key === "then" ? (target as any)[key] : fallback()),
    });

function renderTypeField(initialDiagnostics: Diagnostic[], checkTypeDiagnostics: boolean) {
    let diagnostics = initialDiagnostics;
    const rpcClient = stub(
        { getVisualizerLocation: async () => ({ view: "BI Diagram" }) },
        () => () => stub({}, () => jest.fn(async () => undefined))
    );
    const getExpressionFormDiagnostics = jest.fn(async (_show: boolean, _expr: string, key: string, _prop: unknown,
        setDiagnosticsInfo: (d: { key: string; diagnostics: Diagnostic[] }) => void) => {
        setDiagnosticsInfo({ key, diagnostics });
    });
    const expressionEditor: FormExpressionEditorProps = {
        types: [] as CompletionItem[],
        referenceTypes: [] as CompletionItem[],
        retrieveVisibleTypes: jest.fn(async () => {}),
        getTypeHelper: () => null,
        getHelperPane: () => null,
        rpcManager: { getExpressionTokens: async () => [] },
        helperPaneOrigin: "vertical",
        helperPaneHeight: "default",
        getExpressionFormDiagnostics,
        checkTypeDiagnostics,
    };
    const ui = (formFields: FormField[]) => (
        <TestRpcContext.Provider value={{ rpcClient }}>
            <Form
                formFields={formFields}
                submitText="Create"
                onSubmit={() => {}}
                targetLineRange={RANGE}
                fileName="functions.bal"
                expressionEditor={expressionEditor}
            />
        </TestRpcContext.Provider>
    );
    const utils = render(ui([returnTypeField]));
    return {
        ...utils,
        getExpressionFormDiagnostics,
        // The LS now knows the type, e.g. after it was created from the field.
        defineType: () => { diagnostics = []; },
        // The host replaces the field when a type is created from it.
        replaceField: () => utils.rerender(ui([{ ...returnTypeField }])),
    };
}

// The toolkit's text area is a web component; the editor reads the value it holds on `input`.
const typeInto = async (container: HTMLElement, value: string) => {
    const textArea = container.querySelector("vscode-text-area") as HTMLElement & { value: string };
    textArea.value = value;
    await act(async () => {
        fireEvent.input(textArea);
    });
};

const createButton = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("vscode-button")).find((b) => b.textContent?.includes("Create"))!;

const UNDEFINED_TYPE: Diagnostic = {
    message: "undefined type 'Foo'",
    severity: 1,
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
};

describe("TypeEditor type diagnostics", () => {
    beforeEach(() => {
        // The editor restores the cursor in an animation frame, which jsdom cannot do.
        jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("shows an undefined type and keeps Save disabled", async () => {
        const { container, getExpressionFormDiagnostics } = renderTypeField([UNDEFINED_TYPE], true);

        await typeInto(container, "Foo");

        await waitFor(() => expect(screen.getByText("undefined type 'Foo'")).toBeTruthy());
        expect(getExpressionFormDiagnostics.mock.calls[0].slice(0, 3)).toEqual([true, "Foo", "type"]);
        expect(createButton(container).hasAttribute("disabled")).toBe(true);
    });

    it("leaves Save enabled for a type the LS accepts", async () => {
        const { container, getExpressionFormDiagnostics } = renderTypeField([], true);

        await typeInto(container, "string");

        await waitFor(() => expect(getExpressionFormDiagnostics).toHaveBeenCalled());
        await waitFor(() => expect(createButton(container).hasAttribute("disabled")).toBe(false));
    });

    it("checks the type again when the host replaces the field after creating it", async () => {
        const { container, defineType, replaceField } = renderTypeField([UNDEFINED_TYPE], true);
        await typeInto(container, "Foo");
        await waitFor(() => expect(screen.getByText("undefined type 'Foo'")).toBeTruthy());

        defineType();
        await act(async () => {
            replaceField();
        });

        await waitFor(() => expect(screen.queryByText("undefined type 'Foo'")).toBeNull());
        expect(createButton(container).hasAttribute("disabled")).toBe(false);
    });

    it("checks the type again when the created type is passed back under the same name", async () => {
        const { container, defineType } = renderTypeField([UNDEFINED_TYPE], true);
        await typeInto(container, "Foo");
        await waitFor(() => expect(screen.getByText("undefined type 'Foo'")).toBeTruthy());

        defineType();
        await typeInto(container, "Foo");

        await waitFor(() => expect(screen.queryByText("undefined type 'Foo'")).toBeNull());
        expect(createButton(container).hasAttribute("disabled")).toBe(false);
    });

    it("does not check the type unless the host opts in", async () => {
        const { container, getExpressionFormDiagnostics } = renderTypeField([UNDEFINED_TYPE], false);

        await typeInto(container, "Foo");

        await waitFor(() => expect(createButton(container).hasAttribute("disabled")).toBe(false));
        expect(getExpressionFormDiagnostics).not.toHaveBeenCalled();
        expect(screen.queryByText("undefined type 'Foo'")).toBeNull();
    });
});
