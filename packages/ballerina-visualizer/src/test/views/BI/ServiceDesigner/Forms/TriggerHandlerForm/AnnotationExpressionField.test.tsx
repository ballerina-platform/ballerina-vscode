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
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { PropertyModel } from "@wso2/ballerina-core";

const getExpressionDiagnostics = jest.fn();

jest.mock("@wso2/ballerina-core", () => ({ TRIGGER_CHARACTERS: [] as string[] }));
jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({
        rpcClient: { getBIDiagramRpcClient: () => ({ getExpressionDiagnostics }) },
    }),
}));
jest.mock("@wso2/ballerina-side-panel", () => {
    const { createContext } = require("react");
    // One store and one field entry for every render, as the real store keeps them.
    const storeField = { ls: [] as unknown[] };
    const store = { getField: () => storeField };
    return {
        DiagnosticsStoreContext: createContext(undefined),
        FieldFactory: () => <div />,
        Provider: (props: { children?: React.ReactNode }) => <div>{props.children}</div>,
        evaluateClientRules: (): unknown[] => [],
        getPropertyFromFormField: (field: { metadata: unknown; types: unknown }) => ({
            metadata: field.metadata,
            types: field.types,
        }),
        getRecordTypeFields: (): unknown[] => [],
        useDiagnosticsStoreState: () => store,
    };
});
jest.mock("../../../../../../views/BI/HelperPaneNew", () => ({ getHelperPaneNew: (): null => null }));
jest.mock("../../../../../../views/BI/HelperPaneNew/Views/RecordConfigModal", () => ({ ConfigureRecordPage: (): null => null }));
jest.mock("../../../../../../components/Modal", () => (): null => null);
jest.mock("../../../../../../utils/bi", () => ({
    calculateExpressionOffsets: () => ({}),
    convertBalCompletion: (item: unknown) => item,
    removeDuplicateDiagnostics: (diagnostics: unknown) => diagnostics,
    updateLineRange: (lineRange: unknown) => lineRange,
}));

import {
    AnnotationExpressionField,
    AnnotationExpressionFieldHandle,
} from "../../../../../../views/BI/ServiceDesigner/Forms/TriggerHandlerForm/AnnotationExpressionField";

// The field's JSX compiles to React.createElement without importing React.
(globalThis as unknown as { React: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const property: PropertyModel = {
    metadata: { label: "Expression", description: "" },
    types: [{ fieldType: "EXPRESSION", ballerinaType: "anydata|readonly|isolated object {}", selected: true }],
    optional: false,
    editable: true,
};

describe("AnnotationExpressionField", () => {
    let root: Root;
    let container: HTMLDivElement;

    beforeEach(() => {
        getExpressionDiagnostics.mockReset();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("checks the value against the field's expected type when revalidated", async () => {
        getExpressionDiagnostics.mockResolvedValue({ diagnostics: [{ message: "incompatible types", severity: 1 }] });
        const handle = React.createRef<AnnotationExpressionFieldHandle>();
        act(() => {
            root.render(<AnnotationExpressionField ref={handle} value="request" property={property}
                filePath="/project/functions.bal" onChange={jest.fn()} />);
        });

        let diagnostics: Awaited<ReturnType<AnnotationExpressionFieldHandle["revalidate"]>> = [];
        await act(async () => {
            diagnostics = await handle.current.revalidate();
        });

        expect(getExpressionDiagnostics).toHaveBeenCalledTimes(1);
        expect(getExpressionDiagnostics.mock.calls[0][0].context.property.types).toEqual(property.types);
        expect(diagnostics.some((diagnostic) => diagnostic.severity === 1)).toBe(true);
    });
});
