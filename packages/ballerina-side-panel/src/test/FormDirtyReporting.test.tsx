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

// L2: a form tells the extension whether it has unsaved edits under an id of its own, so that a form
// opened inside another on the same file (issue-1770: the helper pane's "+ New Variable") neither
// clears the outer form's edits by reporting itself clean as it opens, nor leaves its own behind:
// a form that goes with edits reports itself clean as it goes.

import React from "react";
import { act, render } from "@testing-library/react";
import type { FormDirtyDidChangeParams } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { TestRpcContext } from "./rpcHarness";
import { Form } from "../components/Form";
import { useFormDirtyReporting } from "../components/Form/useFormDirtyReporting";

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

const AUTOMATION = "/workspace/integration/automation.bal";
const CONNECTIONS = "/workspace/integration/connections.bal";

// A client whose every call resolves to nothing, except the dirty reports it records.
function fakeRpcClient(reports: FormDirtyDidChangeParams[]): unknown {
    const anyCall = (): Promise<undefined> => Promise.resolve(undefined);
    const biDiagram = new Proxy({}, {
        get: (_target, name) => name === "formDirtyDidChange"
            ? (params: FormDirtyDidChangeParams) => { reports.push(params); }
            : anyCall,
    });
    return new Proxy({}, { get: (_target, name) => name === "getBIDiagramRpcClient" ? () => biDiagram : anyCall });
}

function Reporter({ fileName, isDirty }: { fileName?: string; isDirty: boolean }): null {
    useFormDirtyReporting(fileName, isDirty);
    return null;
}

function renderReporters(reports: FormDirtyDidChangeParams[], reporters: Array<{ fileName?: string; isDirty: boolean }>) {
    const client = fakeRpcClient(reports);
    const ui = (list: typeof reporters) => (
        <TestRpcContext.Provider value={{ rpcClient: client }}>
            {list.map((props, index) => <Reporter key={index} {...props} />)}
        </TestRpcContext.Provider>
    );
    const result = render(ui(reporters));
    return { rerender: (list: typeof reporters) => result.rerender(ui(list)), unmount: result.unmount };
}

describe("useFormDirtyReporting", () => {
    it("reports each form clean as it opens, under an id of its own", () => {
        const reports: FormDirtyDidChangeParams[] = [];
        renderReporters(reports, [{ fileName: AUTOMATION, isDirty: false }, { fileName: AUTOMATION, isDirty: false }]);
        expect(reports.map(({ filePath, isDirty }) => ({ filePath, isDirty }))).toEqual([
            { filePath: AUTOMATION, isDirty: false },
            { filePath: AUTOMATION, isDirty: false },
        ]);
        expect(reports[0].formId).toBeTruthy();
        expect(reports[1].formId).not.toBe(reports[0].formId);
    });

    it("reports its edits and their undoing under the same id", () => {
        const reports: FormDirtyDidChangeParams[] = [];
        const { rerender } = renderReporters(reports, [{ fileName: AUTOMATION, isDirty: false }]);
        rerender([{ fileName: AUTOMATION, isDirty: true }]);
        rerender([{ fileName: AUTOMATION, isDirty: false }]);
        expect(new Set(reports.map(({ formId }) => formId)).size).toBe(1);
        expect(reports.map(({ isDirty }) => isDirty)).toEqual([false, true, false, false]);
    });

    it("reports itself clean as it closes with edits, and nothing more as it closes without", () => {
        const reports: FormDirtyDidChangeParams[] = [];
        const { rerender, unmount } = renderReporters(reports, [
            { fileName: AUTOMATION, isDirty: true },
            { fileName: AUTOMATION, isDirty: false },
        ]);
        const [edited] = reports.map(({ formId }) => formId);
        reports.length = 0;

        rerender([{ fileName: AUTOMATION, isDirty: true }]);
        expect(reports).toEqual([]);
        unmount();
        expect(reports).toEqual([{ filePath: AUTOMATION, formId: edited, isDirty: false }]);
    });

    it("moves its edits along when the form moves to another file", () => {
        const reports: FormDirtyDidChangeParams[] = [];
        const { rerender } = renderReporters(reports, [{ fileName: AUTOMATION, isDirty: true }]);
        const [{ formId }] = reports;
        rerender([{ fileName: CONNECTIONS, isDirty: true }]);
        expect(reports).toEqual([
            { filePath: AUTOMATION, formId, isDirty: true },
            { filePath: AUTOMATION, formId, isDirty: false },
            { filePath: CONNECTIONS, formId, isDirty: true },
        ]);
    });

    it("reports nothing for a form on no file", () => {
        const reports: FormDirtyDidChangeParams[] = [];
        const { unmount } = renderReporters(reports, [{ isDirty: true }]);
        unmount();
        expect(reports).toEqual([]);
    });
});

describe("Form", () => {
    const field = {
        key: "name",
        label: "Name",
        type: "STRING",
        value: "",
        optional: false,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType: "STRING", selected: true }],
    } as unknown as FormField;
    const formProps = {
        formFields: [field],
        submitText: "Save",
        onSubmit: () => {},
        targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
        fileName: AUTOMATION,
        nodeInfo: { kind: "" as any },
    };

    // Timers stay frozen: an editor's requestAnimationFrame layout callback throws IndexSizeError
    // under jsdom, and the reports this checks are sent from effects, not timers.
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("reports under an id of its own when another form is open on the same file", async () => {
        const reports: FormDirtyDidChangeParams[] = [];
        await act(async () => {
            render(
                <TestRpcContext.Provider value={{ rpcClient: fakeRpcClient(reports) }}>
                    <Form {...formProps} />
                    <Form {...formProps} />
                </TestRpcContext.Provider>
            );
        });
        const formIds = new Set(reports.map(({ formId }) => formId));
        expect(formIds.size).toBe(2);
        expect(reports.every(({ filePath, isDirty }) => filePath === AUTOMATION && !isDirty)).toBe(true);
    });
});
