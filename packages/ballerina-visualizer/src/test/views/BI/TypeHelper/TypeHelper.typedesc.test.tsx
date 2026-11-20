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

// L2: the type helper on a typedesc argument. A typedesc value has to be a type's name, so the helper asks the language
// server for the nameable types only (typedescValue), offers no operator (each one builds a type descriptor, which
// is no name), and keeps only the current module's types that belong to the typedesc's constraint. Every other type
// field keeps the full list and the operators.

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
// Capture what the helper hands the type helper UI.
let helperProps: any;
jest.mock("@wso2/type-editor", () => ({
    TypeHelperComponent: (props: any): null => {
        helperProps = props;
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
        filterTypes: (types: any[]) => types,
        filterOperators: (operators: any[]) => operators,
        getTypeBrowserTypes: (categories: any[]) => categories,
        getFilteredTypesByKind: (categories: any[], kinds: string[]) => categories
            .filter((c) => kinds.includes(c.metadata.label === "Current Integration" ? "CURRENT" : "IMPORTED"))
            .map((c) => ({ category: c.metadata.label, items: names(c).map((name) => ({ name })) })),
    };
});
jest.mock("../../../../views/BI/TypeEditor/constants", () => ({
    TYPE_HELPER_OPERATORS: [{ name: "Convert type to array" }, { name: "Add union type" }],
}));
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

describe("type helper on a typedesc argument", () => {
    let container: HTMLDivElement;
    let root: Root;
    let getVisibleTypes: jest.Mock<Promise<VisibleTypeItem[]>, [VisibleTypesRequest]>;

    const render = (types: InputType[]) => {
        const rpcClient = {
            getBIDiagramRpcClient: () => ({
                getVisibleTypes,
                search: jest.fn().mockResolvedValue({ categories: SEARCH_CATEGORIES }),
                addFunction: jest.fn(),
            }),
        };
        act(() => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    {getTypeHelper({
                        fieldKey: "targetType",
                        types,
                        typeBrowserRef: { current: null },
                        filePath: "main.bal",
                        exprRef: { current: null },
                        targetLineRange: { startLine: { line: 3, offset: 4 }, endLine: { line: 3, offset: 4 } },
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

    const search = async (isType: boolean) => {
        act(() => helperProps.onSearchTypeHelper("", isType));
        await act(async () => { jest.advanceTimersByTime(200); });
    };
    const workspaceTypeNames = () => helperProps.workspaceTypes.flatMap((c: any) => c.items.map((i: any) => i.name));

    beforeEach(() => {
        jest.useFakeTimers();
        helperProps = undefined;
        getVisibleTypes = jest.fn().mockResolvedValue(VISIBLE_TYPES);
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    });

    it("asks for the nameable types of the constraint", async () => {
        render(TYPEDESC_FIELD);
        await search(true);

        expect(getVisibleTypes).toHaveBeenCalledTimes(1);
        expect(getVisibleTypes.mock.calls[0][0]).toEqual(expect.objectContaining({
            typeConstraint: CONSTRAINT,
            typedescValue: true,
        }));
    });

    it("keeps only the current module's types the constraint allows", async () => {
        render(TYPEDESC_FIELD);
        await search(true);

        expect(workspaceTypeNames()).toEqual(["Tagged"]);
    });

    it("offers no operator, even after an operator search", async () => {
        render(TYPEDESC_FIELD);
        await search(false);

        expect(helperProps.operators).toEqual([]);
    });

    it("leaves a node's own type with every type and the operators", async () => {
        render(NODE_TYPE_FIELD);
        await search(true);
        await search(false);

        expect(getVisibleTypes.mock.calls[0][0]).not.toHaveProperty("typedescValue");
        expect(getVisibleTypes.mock.calls[0][0]).not.toHaveProperty("typeConstraint");
        expect(workspaceTypeNames()).toEqual(["Tagged", "Status"]);
        expect(helperProps.operators.map((o: any) => o.name)).toEqual(["Convert type to array", "Add union type"]);
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

        render(TYPEDESC_FIELD);
        await search(true);
        render(otherTypedescField);
        await search(true);
        await act(async () => { resolveFirst(VISIBLE_TYPES); });

        expect(getVisibleTypes.mock.calls.map(([request]) => request.typeConstraint))
            .toEqual([CONSTRAINT, OTHER_CONSTRAINT]);
        expect(workspaceTypeNames()).toEqual(["Status"]);
    });
});
