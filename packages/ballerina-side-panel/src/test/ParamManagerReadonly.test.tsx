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

// L2: when a parameters list is read-only. The language server sends `editable: false` on every
// function's parameters list, so that flag must not lock the list; only `readonlyParameters` does
// (set for an agent tool's approval function, whose parameters follow the tool).

// ParamManager asks the host which view it is in (GraphQL changes its labels); a plain BI view is enough here.
jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: { getVisualizerLocation: async () => ({ view: "BI Diagram" }) } }),
}));

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ParamManagerEditor } from "../components/ParamManager/ParamManager";

const PARAM = {
    id: 0,
    key: "to",
    value: "string to",
    icon: "",
    identifierEditable: true,
    formValues: { type: "string", variable: "to" },
};

function parametersField(overrides: Partial<FormField>): FormField {
    return {
        key: "parameters",
        label: "Parameters",
        type: "REPEATABLE_PROPERTY",
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        value: [PARAM],
        types: [{ fieldType: "REPEATABLE_PROPERTY", selected: true }],
        paramManagerProps: { paramValues: [PARAM], formFields: [], handleParameter: (param: any) => param },
        ...overrides,
    } as unknown as FormField;
}

function editIcons(container: HTMLElement) {
    return container.querySelectorAll(".codicon-edit, .codicon-trash").length;
}

describe("ParamManagerEditor read-only", () => {
    it("keeps edit and delete for a function's parameters even though the LS sends editable: false", () => {
        const { container } = renderWithForm(<ParamManagerEditor field={parametersField({ editable: false })} />, {
            defaultValues: { parameters: [PARAM] },
        });
        expect(container.textContent).toContain("to");
        expect(editIcons(container)).toBe(2);
    });

    it("hides edit and delete when the parameters are explicitly read-only", () => {
        const { container } = renderWithForm(
            <ParamManagerEditor field={parametersField({ readonlyParameters: true })} />,
            { defaultValues: { parameters: [PARAM] } }
        );
        expect(container.textContent).toContain("to");
        expect(editIcons(container)).toBe(0);
    });
});
