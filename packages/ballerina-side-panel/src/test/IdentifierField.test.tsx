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

// L2: an identifier field shows its client rule's message (e.g. a name already in use,
// wso2/product-integrator#382) once the language-server check comes back clean, instead of
// clearing it and leaving Save disabled with nothing to say why.

import React from "react";
import { act, screen } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { TestRpcContext } from "./rpcHarness";
import { IdentifierField } from "../components/editors/IdentifierField";

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

const getExpressionDiagnostics = jest.fn();
const rpcClient = {
    getBIDiagramRpcClient: () => ({ getExpressionDiagnostics }),
};
const noDiagnostics = { diagnostics: [] as any[] };
const lsError = (message: string) => ({ diagnostics: [{ message, severity: 1 }] });

// Run the 250 ms debounced check and let its response settle.
const settle = () => act(async () => { jest.advanceTimersByTime(250); });

const nameField = (value: string): FormField => ({
    key: "name",
    label: "Field Name",
    type: "IDENTIFIER",
    optional: false,
    editable: true,
    enabled: true,
    documentation: "",
    value,
    types: [{
        fieldType: "IDENTIFIER",
        selected: true,
        validations: [{ rule: "vscode.validate.not.in", args: { values: ["item"] }, message: "A field named '{value}' already exists" }],
    }],
});

function renderName(value: string) {
    return renderWithForm(
        <TestRpcContext.Provider value={{ rpcClient }}>
            <IdentifierField field={nameField(value)} />
        </TestRpcContext.Provider>,
        { defaultValues: { name: value } }
    );
}

describe("IdentifierField client rules", () => {
    beforeEach(() => {
        jest.useFakeTimers();
        getExpressionDiagnostics.mockReset().mockResolvedValue(noDiagnostics);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("shows the rule's message for a name already in use", async () => {
        const { getForm } = renderName("item");
        await settle();
        expect(screen.getByText("A field named 'item' already exists")).toBeInTheDocument();
        expect(getForm().formState.errors.name?.message).toBe("A field named 'item' already exists");
    });

    it("shows no error for a free name", async () => {
        const { getForm } = renderName("author");
        await settle();
        expect(getForm().formState.errors.name).toBeUndefined();
        expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
    });

    it("lets a language-server error win over the client rule", async () => {
        getExpressionDiagnostics.mockResolvedValue(lsError("redeclared symbol 'item'"));
        const { getForm } = renderName("item");
        await settle();
        expect(getForm().formState.errors.name?.type).toBe("identifier_diagnostic");
        expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
    });

    it("keeps the required error once a required name is emptied", async () => {
        const { getForm } = renderName("author");
        await settle();
        act(() => { getForm().setValue("name", "", { shouldValidate: true }); });
        await settle();
        expect(getForm().formState.errors.name?.type).toBe("required");
        expect(getForm().formState.errors.name?.message).toBe("Field Name is required");
    });

    it("ignores a response that arrives after a newer value was checked", async () => {
        let resolveFirst: (value: unknown) => void = () => undefined;
        getExpressionDiagnostics
            .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
            .mockResolvedValue(noDiagnostics);
        const { getForm } = renderName("item");
        await settle();

        act(() => { getForm().setValue("name", "author"); });
        await settle();
        expect(getForm().formState.errors.name).toBeUndefined();

        await act(async () => { resolveFirst(lsError("redeclared symbol 'item'")); });
        expect(getForm().formState.errors.name).toBeUndefined();
    });
});
