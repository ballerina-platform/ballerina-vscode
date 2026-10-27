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

const rpcClient = {
    getBIDiagramRpcClient: () => ({ getExpressionDiagnostics: jest.fn().mockResolvedValue({ diagnostics: [] }) }),
};

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
    it("shows the rule's message for a name already in use", async () => {
        const { getForm } = renderName("item");
        expect(await screen.findByText("A field named 'item' already exists")).toBeInTheDocument();
        expect(getForm().formState.errors.name?.message).toBe("A field named 'item' already exists");
    });

    it("shows no error for a free name", async () => {
        const { getForm } = renderName("author");
        // Let the 250 ms debounced check settle.
        await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
        expect(getForm().formState.errors.name).toBeUndefined();
        expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
    });
});
