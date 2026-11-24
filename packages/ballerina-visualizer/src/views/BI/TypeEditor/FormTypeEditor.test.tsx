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

import React from "react";
import { Root, createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { Type } from "@wso2/ballerina-core";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The core barrel loads an ESM-only dependency jest can't parse.
jest.mock("@wso2/ballerina-core", () => ({
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/form-property-utils"),
    ...jest.requireActual("@wso2/ballerina-core/lib/utils/text-array"),
    Protocol: { CDC: "cdc" },
    functionKinds: { CURRENT: "CURRENT", IMPORTED: "IMPORTED" },
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    // One client, as the provider gives; a new one per render re-runs the editor's location effect forever.
    const rpcClient = {
        getVisualizerLocation: () => Promise.resolve({ metadata: { recordFilePath: "/project/types.bal" } }),
        getBIDiagramRpcClient: () => ({ getEndOfFile: () => Promise.resolve({ line: 0, offset: 0 }) }),
    };
    return { useRpcContext: () => ({ rpcClient }) };
});

jest.mock("@wso2/ballerina-side-panel", () => ({
    FormAssist: ({ intro }: { intro: { hint: string; starters: string[] } }) => <p>{intro.hint} {intro.starters.join(", ")}</p>,
}));

jest.mock("@wso2/type-editor", () => ({ TypeEditor: (): null => null, ContextTypeEditor: (): null => null }));
jest.mock("@wso2/ui-toolkit", () => ({ Overlay: (): null => null, ThemeColors: {} }));
jest.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) }));
jest.mock("../../../components/Loader", () => ({ LoadingRing: (): null => null }));
jest.mock("../../../constants", () => ({ TypeHelperContext: {} }));
jest.mock("./constants", () => ({ TYPE_HELPER_OPERATORS: [] as unknown[] }));
jest.mock("./utils", () => ({}));
jest.mock("../Forms/form-utils", () => ({ assistFormInForm: jest.fn() }));

import { FormTypeEditor } from "./index";

const ORDER = {
    name: "Order", editable: true, metadata: { label: "", description: "" }, properties: {},
    codedata: { node: "RECORD" }, members: [], allowAdditionalFields: false,
} as unknown as Type;

describe("FormTypeEditor Copilot", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const renderEditor = async (type: Type | undefined) => {
        await act(async () => {
            root.render(
                <FormTypeEditor
                    type={type}
                    newType={false}
                    newTypeValue="ZzProbe"
                    onTypeChange={jest.fn()}
                    onTypeCreate={jest.fn()}
                    onSaveType={jest.fn()}
                    getNewTypeCreateForm={jest.fn()}
                    refetchTypes={false}
                    isPopupTypeForm={true}
                />
            );
        });
    };

    it("offers the new-type Copilot when a form's Type field opens it without a type", async () => {
        await renderEditor(undefined);
        expect(container.textContent).toContain("Describe the type you need.");
    });

    it("keeps a saved type's Copilot to its contents", async () => {
        await renderEditor(ORDER);
        expect(container.textContent).toContain("Describe the change.");
        expect(container.textContent).toContain("Make every field optional");
    });
});
