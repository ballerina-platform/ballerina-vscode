/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
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
import { act } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { useFormContext } from "../context";
import { TestRpcContext } from "./rpcHarness";
import { NodeReferenceSelectEditor } from "../components/editors/MultiModeExpressionEditor/NodeReferenceSelectEditor/NodeReferenceSelectEditor";

jest.mock("@wso2/ballerina-rpc-client", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

const pickerField = (codedata: Record<string, unknown>): FormField =>
    ({
        key: "model",
        label: "Model",
        type: "EXPRESSION",
        value: "",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        codedata: { searchNodesKind: "MODEL_PROVIDER", ...codedata },
        types: [{ fieldType: "EXPRESSION", selected: true }],
    } as unknown as FormField);

const rpcClient = (nodes: unknown[]) => ({
    getBIDiagramRpcClient: () => ({ searchNodes: () => Promise.resolve({ output: nodes }) }),
});

// A picker fills an empty field with a default; that is where the field starts, so closing the form must not ask.
describe("NodeReferenceSelectEditor default pick", () => {
    // Stands in for the expression editor: a registered field whose changes are edits.
    const Picker = ({ field }: { field: FormField }) => {
        const { form } = useFormContext();
        form.register("model");
        return <NodeReferenceSelectEditor value="" field={field} onChange={(value) => form.setValue("model", value, { shouldDirty: true })} />;
    };

    const renderPicker = (field: FormField, nodes: unknown[]) =>
        renderWithForm(
            <TestRpcContext.Provider value={{ rpcClient: rpcClient(nodes) }}>
                <Picker field={field} />
            </TestRpcContext.Provider>,
            { defaultValues: { model: "" } }
        );

    it("keeps the field clean after picking the static default", async () => {
        const { getForm } = renderPicker(pickerField({ staticItems: [{ id: "a", label: "a", value: "defaultModel" }] }), []);
        await act(async () => {});
        expect(getForm().getValues("model")).toBe("defaultModel");
        expect(getForm().getFieldState("model").isDirty).toBe(false);
    });

    it("keeps the field clean after picking the first search result", async () => {
        const node = { properties: { variable: { value: "openAiModel" } }, codedata: {}, metadata: {} };
        const { getForm } = renderPicker(pickerField({}), [node]);
        await act(async () => {});
        expect(getForm().getValues("model")).toBe("openAiModel");
        expect(getForm().getFieldState("model").isDirty).toBe(false);
    });
});
