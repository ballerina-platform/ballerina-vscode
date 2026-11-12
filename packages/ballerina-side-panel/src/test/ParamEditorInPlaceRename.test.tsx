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

// L2: in-place renames through the real Form, ParamManager and nested ParamEditor form.
//   - the nested parameter form shares the outer form's rename log, so a parameter renamed after
//     the function is renamed where it is now
//   - Cancel on the parameter editor keeps a rename the LS already applied to the source

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LineRange } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { Form } from "../components/Form";
import { TestRpcContext } from "./rpcHarness";

// `function transformPerson(Person person) returns Employee => ...` on line 4.
const range = (offset: number, name: string): LineRange => ({
    fileName: "data_mappings.bal",
    startLine: { line: 4, offset },
    endLine: { line: 4, offset: offset + name.length },
});

const identifierField = (key: string, value: string, lineRange?: LineRange): FormField => ({
    key,
    label: key,
    type: "IDENTIFIER",
    value,
    optional: false,
    editable: false,
    enabled: true,
    documentation: "",
    lineRange,
    types: [{ fieldType: "IDENTIFIER", selected: true }],
});

const PERSON = {
    id: 0,
    key: "person",
    value: "Person person",
    icon: "",
    identifierEditable: false,
    identifierRange: range(32, "person"),
    formValues: { type: "Person", variable: "person" },
};

const parametersField = (): FormField => ({
    key: "parameters",
    label: "Inputs",
    type: "PARAM_MANAGER",
    optional: true,
    editable: true,
    enabled: true,
    documentation: "",
    value: [PERSON],
    types: [{ fieldType: "PARAM_MANAGER", selected: true }],
    paramManagerProps: {
        paramValues: [PERSON],
        formFields: [identifierField("variable", "")],
        handleParameter: (param: any) => ({
            ...param,
            key: param.formValues.variable,
            value: `${param.formValues.type} ${param.formValues.variable}`,
        }),
    },
} as unknown as FormField);

// The toolkit renders web components, so the edited name is typed through `input`, which is what
// its TextField listens to. The rename's own Save is the first one after its input.
const renameTo = async (fieldKey: string, newName: string) => {
    let row = document.querySelector(`vscode-text-field#${fieldKey}`)?.parentElement;
    while (row && !row.querySelector('[title="Rename"]')) {
        row = row.parentElement;
    }
    fireEvent.click(row!.querySelector('[title="Rename"]')!);
    const input = await waitFor(() => {
        const editing = document.querySelector(`vscode-text-field#${fieldKey}:not([readonly])`);
        expect(editing).not.toBeNull();
        return editing!;
    });
    (input as HTMLInputElement).value = newName;
    fireEvent.input(input);
    const save = screen.getAllByText("Save")
        .find((el) => input.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)!;
    await act(async () => {
        fireEvent.click(save);
    });
    await waitFor(() => expect(document.querySelector(`vscode-text-field#${fieldKey}:not([readonly])`)).toBeNull());
};

// The Form calls many rpc methods on mount (dirty state, diagnostics, ...); those this test does
// not care about resolve to nothing.
const stub = <T extends object>(known: T, fallback: () => unknown): T =>
    new Proxy(known, {
        get: (target, key) => (key in target || key === "then" ? (target as any)[key] : fallback()),
    });

function renderForm() {
    const renameIdentifier = jest.fn(async () => true);
    const biDiagram = stub({ renameIdentifier }, () => jest.fn(async () => undefined));
    const rpcClient = stub(
        {
            getBIDiagramRpcClient: () => biDiagram,
            getVisualizerLocation: async () => ({ view: "BI Diagram" }),
        },
        () => () => stub({}, () => jest.fn(async () => undefined))
    );
    const utils = render(
        <TestRpcContext.Provider value={{ rpcClient }}>
            <Form
                formFields={[identifierField("functionName", "transformPerson", range(9, "transformPerson")), parametersField()]}
                submitText="Done"
                onSubmit={() => {}}
                targetLineRange={range(0, "")}
                fileName="data_mappings.bal"
            />
        </TestRpcContext.Provider>
    );
    return { ...utils, renameIdentifier };
}

const openParameter = async (container: HTMLElement) => {
    await act(async () => {
        fireEvent.click(container.querySelector(".codicon-edit")!);
    });
    await waitFor(() => expect(document.querySelector("vscode-text-field#variable")).not.toBeNull());
};

describe("ParamEditor in-place renames", () => {
    it("renames a parameter where the function's rename left it", async () => {
        const { container, renameIdentifier } = renderForm();

        await renameTo("functionName", "toEmp");
        await openParameter(container);
        await renameTo("variable", "p");

        const positions = (renameIdentifier.mock.calls as unknown as [{ position: unknown; newName: string }][])
            .map(([request]) => [request.newName, request.position]);
        expect(positions).toEqual([
            ["toEmp", { line: 4, character: 9 }],
            ["p", { line: 4, character: 22 }],
        ]);
    });

    it("keeps an applied rename when the parameter edit is cancelled", async () => {
        const { container } = renderForm();

        await openParameter(container);
        await renameTo("variable", "p");
        await act(async () => {
            fireEvent.click(screen.getByText("Cancel"));
        });

        await waitFor(() => expect(document.querySelector("vscode-text-field#variable")).toBeNull());
        expect(screen.getByTitle("p")).toBeTruthy();
        expect(screen.queryByTitle("person")).toBeNull();
    });
});
