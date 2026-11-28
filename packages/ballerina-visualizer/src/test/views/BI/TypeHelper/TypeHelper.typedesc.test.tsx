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

// L2: the type picker on a typedesc argument. A typedesc value has to be a type's name, so the picker asks the language
// server for the nameable types only (typedescValue) and keeps only the current module's types that belong to the
// typedesc's constraint. Every other type field keeps the full list.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { Category, InputType, VisibleTypeItem, VisibleTypesRequest } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () => ({
    functionKinds: { CURRENT: "CURRENT", IMPORTED: "IMPORTED", AVAILABLE: "AVAILABLE" },
    getPrimaryInputType: (types: InputType[]) => types?.[0],
}));
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../rpcHarness");
    return { useRpcContext: h.useRpcContext };
});
jest.mock("@wso2/type-editor", () => ({}));
// Capture what the helper hands the picker.
let pickerProps: any;
jest.mock("../../../../views/BI/TypeHelper/TypePicker", () => ({
    TypePicker: (props: any): null => {
        pickerProps = props;
        return null;
    },
}));
// The real conversions pull utils/bi; these keep the shape the assertions read: a category per label, with the
// names of its types.
jest.mock("../../../../views/BI/TypeEditor/utils", () => {
    const names = (category: any): string[] => category.items.flatMap((item: any) =>
        "codedata" in item ? [item.metadata.label] : names(item));
    return {
        getTypes: (types: any[]) => [{ category: "Basic", items: types.map((t) => ({ name: t.label })) }],
        getTypeBrowserTypes: (categories: any[]) => categories,
        getFilteredTypesByKind: (categories: any[], kinds: string[]) => categories
            .filter((c) => kinds.includes(c.metadata.label === "Current Integration" ? "CURRENT" : "IMPORTED"))
            .map((c) => ({ category: c.metadata.label, items: names(c).map((name) => ({ name })) })),
    };
});
jest.mock("../../../../components/Loader", () => ({ LoadingRing: (): null => null }));
jest.mock("../../../../constants", () => ({ TypeHelperContext: { GRAPHQL_FIELD_TYPE: "gql-field", GRAPHQL_INPUT_TYPE: "gql-input" } }));
jest.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) }));
jest.mock("@wso2/ui-toolkit", () => ({ Overlay: (): null => null, ThemeColors: new Proxy({}, { get: () => "#000" }) }));

import { TestRpcContext } from "../../../rpcHarness";
import { getTypeHelper } from "../../../../views/BI/TypeHelper";

(globalThis as unknown as { React: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONSTRAINT = "record {|anydata...;|}";
const TYPEDESC = `typedesc<${CONSTRAINT}>`;

// The input types the language server gives a typedesc argument, and a node's own type for comparison.
const TYPEDESC_FIELD: InputType[] = [
    { fieldType: "TYPE", ballerinaType: CONSTRAINT, typedesc: TYPEDESC, selected: true },
    { fieldType: "EXPRESSION", ballerinaType: TYPEDESC, selected: false },
];
const NODE_TYPE_FIELD: InputType[] = [{ fieldType: "TYPE", selected: true }];

const visibleType = (label: string, detail: string): VisibleTypeItem => ({
    label, insertText: label, kind: 22, labelDetails: { detail, description: "" },
});
const typeNode = (label: string) => ({
    metadata: { label, description: "" },
    codedata: { symbol: label, data: { moduleRelation: "CURRENT_MODULE" } },
    enabled: true,
});

// The LS answers the typedesc request with the nameable types belonging to the constraint: Tagged, not the
// current module's Status enum.
const VISIBLE_TYPES = [visibleType("Tagged", "User-Defined"), visibleType("json", "Behaviour-Types")];
const SEARCH_CATEGORIES: Category[] = [
    { metadata: { label: "Current Integration", description: "" }, items: [typeNode("Tagged"), typeNode("Status")] } as Category,
];

describe("type picker on a typedesc argument", () => {
    let container: HTMLDivElement;
    let root: Root;
    let getVisibleTypes: jest.Mock<Promise<VisibleTypeItem[]>, [VisibleTypesRequest]>;

    const render = async (types: InputType[], inFile = true) => {
        const rpcClient = {
            getBIDiagramRpcClient: () => ({
                getVisibleTypes,
                search: jest.fn().mockResolvedValue({ categories: SEARCH_CATEGORIES }),
                addFunction: jest.fn(),
            }),
        };
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    {getTypeHelper({
                        fieldKey: "targetType",
                        types,
                        typeBrowserRef: { current: null },
                        filePath: "main.bal",
                        exprRef: { current: null },
                        targetLineRange: inFile ? { startLine: { line: 3, offset: 4 }, endLine: { line: 3, offset: 4 } } : undefined,
                        currentType: "",
                        currentCursorPosition: 0,
                        helperPaneHeight: "default",
                        typeHelperState: true,
                        onChange: jest.fn(),
                        changeTypeHelperState: jest.fn(),
                        updateImports: jest.fn(),
                    })}
                </TestRpcContext.Provider>
            );
        });
    };

    const projectTypeNames = () => pickerProps.sections
        .find((section: any) => section.title === "This Integration")
        .options.map((option: any) => option.item.name);

    beforeEach(() => {
        pickerProps = undefined;
        getVisibleTypes = jest.fn().mockResolvedValue(VISIBLE_TYPES);
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("opens in a form that has no place in the file yet, reading the module-level types", async () => {
        await render(TYPEDESC_FIELD, false);

        expect(getVisibleTypes.mock.calls[0][0].position).toEqual({ line: 0, offset: 0 });
        expect(projectTypeNames().length).toBeGreaterThan(0);
    });

    it("asks for the nameable types of the constraint", async () => {
        await render(TYPEDESC_FIELD);

        expect(getVisibleTypes).toHaveBeenCalledTimes(1);
        expect(getVisibleTypes.mock.calls[0][0]).toEqual(expect.objectContaining({
            typeConstraint: CONSTRAINT,
            typedescValue: true,
        }));
    });

    it("keeps only the current module's types the constraint allows", async () => {
        await render(TYPEDESC_FIELD);

        expect(projectTypeNames()).toEqual(["Tagged"]);
    });

    it("leaves a node's own type with every type", async () => {
        await render(NODE_TYPE_FIELD);

        expect(getVisibleTypes.mock.calls[0][0]).not.toHaveProperty("typedescValue");
        expect(getVisibleTypes.mock.calls[0][0]).not.toHaveProperty("typeConstraint");
        expect(projectTypeNames()).toEqual(["Tagged", "Status"]);
    });

    // The field's constraint changes while the first constraint's types are still on their way: the late response
    // was asked for another constraint, so the module's types are narrowed by the second response alone.
    it("narrows by the current constraint when an earlier constraint's types arrive late", async () => {
        const OTHER_CONSTRAINT = "anydata";
        const otherTypedescField: InputType[] = [
            { fieldType: "TYPE", ballerinaType: OTHER_CONSTRAINT, typedesc: `typedesc<${OTHER_CONSTRAINT}>`, selected: true },
            { fieldType: "EXPRESSION", ballerinaType: `typedesc<${OTHER_CONSTRAINT}>`, selected: false },
        ];
        let resolveFirst: (types: VisibleTypeItem[]) => void = () => undefined;
        const firstResponse = new Promise<VisibleTypeItem[]>((resolve) => { resolveFirst = resolve; });
        getVisibleTypes.mockImplementation((request) => request.typeConstraint === CONSTRAINT
            ? firstResponse
            : Promise.resolve([visibleType("Status", "User-Defined")]));

        await render(TYPEDESC_FIELD);
        await render(otherTypedescField);
        await act(async () => { resolveFirst(VISIBLE_TYPES); });

        expect(getVisibleTypes.mock.calls.map(([request]) => request.typeConstraint))
            .toEqual([CONSTRAINT, OTHER_CONSTRAINT]);
        expect(projectTypeNames()).toEqual(["Status"]);
    });
});
