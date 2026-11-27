/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: { getVisualizerLocation: async () => ({ view: "BI Diagram" }) } }),
}));

import React, { useEffect } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ParamManagerEditor } from "../components/ParamManager/ParamManager";
import { AppliedMark, AssistHostProvider, AssistHostValue, useAssistHost } from "../components/editors/FieldAssist/AssistHost";
import { CHANGED_FIELD } from "../components/editors/FieldAssist/styles";
import { SectionChanges } from "../components/editors/FieldAssist/AssistMark";

const param = (id: number, name: string, hidden = false) => ({
    id, key: name, value: `int ${name}`, icon: "", identifierEditable: true, identifierRange: undefined, hidden, formValues: { type: "int", variable: name },
});

function parametersField(params: ReturnType<typeof param>[]): FormField {
    return {
        key: "parameters",
        label: "Parameters",
        type: "PARAM_MANAGER",
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        value: params,
        types: [{ fieldType: "PARAM_MANAGER", selected: true }],
        paramManagerProps: { paramValues: params, formFields: [], handleParameter: (held: any) => held },
    } as unknown as FormField;
}

const added = (label: string) => ({ label, added: true, before: "", request: "add a and b", revert: jest.fn() } as AppliedMark);

let host: AssistHostValue;

function Applied({ keys }: { keys: string[] }) {
    host = useAssistHost()!;
    useEffect(() => {
        host.setApplied({
            formId: "", request: "add a and b", revert: () => ({}),
            changes: Object.fromEntries(keys.map((key) => [`parameters:${key}`, ["parameters", key]])),
            marks: Object.fromEntries(keys.map((key) => [key, added(key)])),
        });
    }, []);
    return null;
}

function renderParams(params: ReturnType<typeof param>[], keys: string[]) {
    const rendered = renderWithForm(
        <AssistHostProvider>
            <Applied keys={keys} />
            <ParamManagerEditor field={parametersField(params)} />
        </AssistHostProvider>,
        { defaultValues: { parameters: params } }
    );
    const markOf = (name: string) => screen.getByTestId(`${name}-item`).getAttribute(CHANGED_FIELD);
    return { ...rendered, markOf };
}

describe("Copilot marks on parameter rows", () => {
    it("marks only the row Copilot changed", () => {
        const { markOf } = renderParams([param(0, "x"), param(1, "a"), param(2, "b")], ["parameters-2"]);
        expect(markOf("x")).toBeNull();
        expect(markOf("a")).toBeNull();
        expect(markOf("b")).toBe("parameters-2");
    });

    it("counts rows as the review does, without hidden parameters", () => {
        const { markOf } = renderParams([param(0, "self", true), param(1, "a"), param(2, "b")], ["parameters-1"]);
        expect(markOf("a")).toBeNull();
        expect(markOf("b")).toBe("parameters-1");
    });

    it("keeps a mark on its row when a row above it is deleted", () => {
        const { markOf } = renderParams([param(0, "x"), param(1, "a"), param(2, "b")], ["parameters-1", "parameters-2"]);
        act(() => {
            fireEvent.click(screen.getByTestId("x-item").querySelector(".codicon-trash")!);
        });
        expect(markOf("a")).toBe("parameters-0");
        expect(markOf("b")).toBe("parameters-1");
    });

    it("drops the mark of a row the user deletes", () => {
        const { markOf } = renderParams([param(0, "a"), param(1, "b")], ["parameters-0", "parameters-1"]);
        act(() => {
            fireEvent.click(screen.getByTestId("a-item").querySelector(".codicon-trash")!);
        });
        expect(markOf("b")).toBe("parameters-0");
        expect(Object.entries(host.applied!.marks).map(([key, mark]) => [key, mark.label])).toEqual([["parameters-0", "parameters-1"]]);
    });

    it("counts a collapsed section's parameter rows and opens it", () => {
        const onReveal = jest.fn();
        renderWithForm(
            <AssistHostProvider>
                <Applied keys={["parameters-0", "parameters-1"]} />
                <SectionChanges fields={[parametersField([param(0, "a"), param(1, "b")])]} onReveal={onReveal} />
            </AssistHostProvider>
        );
        expect(screen.getByText("2 Changes")).toBeTruthy();
        expect(onReveal).toHaveBeenCalled();
    });
});
