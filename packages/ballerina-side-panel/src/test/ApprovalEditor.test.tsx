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

// L2: ApprovalEditor, the agent-tool "Requires Approval" control. Renders the real editor via
// formHarness and asserts its states: the add button, the add form (inline and as a panel over
// the side panel) with its language-server name check, the attached function with Open / Remove,
// the warnings, and the values it writes to the form.

import React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ApprovalFieldConfig, FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { TestRpcContext } from "./rpcHarness";
import { ApprovalEditor } from "../components/editors/ApprovalEditor";

// The add form reads `useRpcContext` from the @wso2/ballerina-rpc-client barrel (ESM-compiled — jest
// can't load it through the symlink), so redirect it to the harness context the tests wrap it with.
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext };
});

const PARAMS = [
    { type: "string", name: "to" },
    { type: "string", name: "subject" },
];

const NAME_LINE_RANGE = {
    fileName: "test.bal", startLine: { line: 8, offset: 18 }, endLine: { line: 8, offset: 35 },
};

function approvalField(value: boolean, overrides: Partial<ApprovalFieldConfig> = {}): FormField {
    return {
        key: "requiresApproval",
        label: "Requires Approval",
        type: "AGENT_TOOL_APPROVAL",
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "Pause this tool before it runs and wait for human approval.",
        types: [{ fieldType: "AGENT_TOOL_APPROVAL", selected: false }],
        approvalConfig: {
            functionKey: "approvalFunction",
            generateKey: "generateApprovalFunction",
            initialFunction: "",
            presentation: "inline",
            defaultFunctionName: "sendEmailApproval",
            toolName: "sendEmailTool",
            getToolParameters: (values) => values.params ?? PARAMS,
            ...overrides,
        },
    } as FormField;
}

// The language server's identifier check: no diagnostics by default.
function fakeRpcClient(diagnostics: { message: string; severity: number }[] = []) {
    const getExpressionDiagnostics = jest.fn().mockResolvedValue({ diagnostics });
    return { rpcClient: { getBIDiagramRpcClient: () => ({ getExpressionDiagnostics }) }, getExpressionDiagnostics };
}

function renderApproval(
    value: boolean,
    overrides: Partial<ApprovalFieldConfig> = {},
    values: Record<string, any> = {},
    rpc = fakeRpcClient()
) {
    const rendered = renderWithForm(
        <TestRpcContext.Provider value={{ rpcClient: rpc.rpcClient }}>
            <ApprovalEditor field={approvalField(value, overrides)} />
        </TestRpcContext.Provider>,
        { defaultValues: { requiresApproval: value, ...values } }
    );
    return { ...rendered, ...rpc };
}

// The add form checks the name with the language server shortly after it changes; Add waits for it.
async function waitForNameCheck(getExpressionDiagnostics: jest.Mock, calls = 1) {
    await waitFor(() => expect(getExpressionDiagnostics).toHaveBeenCalledTimes(calls));
    await act(async () => undefined);
}

// Unconditionally gated by an attached function only this tool uses, so saving without it deletes it.
const ownFunctionInfo = jest.fn().mockResolvedValue({
    params: PARAMS, usedBy: ["sendEmailTool"], referencedElsewhere: false, nameLineRange: NAME_LINE_RANGE,
});

describe("ApprovalEditor", () => {
    it("shows no approval function controls while the gate is off", () => {
        const { container } = renderApproval(false);
        expect(container.textContent).toContain("Requires Approval");
        expect(container.textContent).not.toContain("Add Approval Function");
    });

    it("offers only an add button when the gate is on and no function is attached", () => {
        const { container } = renderApproval(true);
        expect(container.textContent).toContain("Add Approval Function");
        expect(screen.queryByTestId("approval-function-attached")).toBeNull();
    });

    it("adds a new function inline with the tool's parameters and marks it for generation", async () => {
        const { getForm, getExpressionDiagnostics } = renderApproval(true);
        fireEvent.click(screen.getByText("Add Approval Function"));

        expect(screen.getByText("New Approval Function")).toBeTruthy();
        const rows = screen.getAllByTestId("approval-function-param").map((row) => row.textContent);
        expect(rows).toEqual(["stringto", "stringsubject"]);

        await waitForNameCheck(getExpressionDiagnostics);
        await act(async () => {
            fireEvent.click(screen.getByText("Add"));
        });

        await waitFor(() => expect(screen.getByTestId("approval-function-attached").textContent)
            .toContain("sendEmailApproval"));
        expect(getForm().getValues("approvalFunction")).toBe("sendEmailApproval");
        expect(getForm().getValues("generateApprovalFunction")).toBe(true);
        expect(screen.getByText("Created when you save the tool.")).toBeTruthy();
        // A function that only exists after save can't be opened yet.
        expect(screen.queryByLabelText("Open sendEmailApproval")).toBeNull();
    });

    it("adds once the name check passes when Add is clicked while it's still running", async () => {
        const { getForm, getExpressionDiagnostics } = renderApproval(true);
        fireEvent.click(screen.getByText("Add Approval Function"));
        // Clicked before the language server has answered.
        await act(async () => {
            fireEvent.click(screen.getByText("Add"));
        });
        expect(getExpressionDiagnostics).not.toHaveBeenCalled();

        await waitFor(() => expect(screen.getByTestId("approval-function-attached").textContent)
            .toContain("sendEmailApproval"));
        expect(getExpressionDiagnostics).toHaveBeenCalledTimes(1);
        expect(getForm().getValues("approvalFunction")).toBe("sendEmailApproval");
    });

    it("checks the name as a new module-level function name with the language server", async () => {
        const { getExpressionDiagnostics } = renderApproval(true);
        fireEvent.click(screen.getByText("Add Approval Function"));
        await waitForNameCheck(getExpressionDiagnostics);

        const request = getExpressionDiagnostics.mock.calls[0][0];
        expect(request.filePath).toBe("test.bal");
        expect(request.context.expression).toBe("sendEmailApproval");
        expect(request.context.property.types).toEqual([{ fieldType: "IDENTIFIER", scope: "Global", selected: true }]);
        // No function is attached, so the name must not clash with any existing declaration.
        expect(request.context.property.codedata).toBeUndefined();
    });

    it("keeps the add form open with the language server's error when the name is taken", async () => {
        const { getForm, getExpressionDiagnostics } = renderApproval(true, {}, {},
            fakeRpcClient([{ message: "redeclared symbol 'sendEmailApproval'", severity: 1 }]));
        fireEvent.click(screen.getByText("Add Approval Function"));
        await waitForNameCheck(getExpressionDiagnostics);

        expect(screen.getByText("This function name is already used. Please choose a different name.")).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByText("Add"));
        });
        expect(screen.queryByTestId("approval-function-attached")).toBeNull();
        expect(getForm().getValues("approvalFunction")).toBe("");
    });

    it("rejects a reserved keyword, as other name fields do", async () => {
        // The language server decides what's a keyword; the form shows its error the usual way.
        const { getExpressionDiagnostics } = renderApproval(true, { defaultFunctionName: "check" }, {},
            fakeRpcClient([{ message: "`check` is a reserved keyword", severity: 1 }]));
        fireEvent.click(screen.getByText("Add Approval Function"));
        await waitForNameCheck(getExpressionDiagnostics);

        expect(getExpressionDiagnostics.mock.calls[0][0].context.expression).toBe("check");
        expect(screen.getByText(/cannot be a reserved keyword/)).toBeTruthy();
        await act(async () => {
            fireEvent.click(screen.getByText("Add"));
        });
        expect(screen.queryByTestId("approval-function-attached")).toBeNull();
    });

    it("opens the add form as a panel over the side panel in view presentation", () => {
        renderApproval(true, { presentation: "view" });
        fireEvent.click(screen.getByText("Add Approval Function"));
        expect(document.body.textContent).toContain("Generated from the tool's parameters.");
        expect(screen.queryByText("New Approval Function")).toBeNull();
    });

    it("shows an existing function with Open and Remove", async () => {
        const onOpenFunction = jest.fn();
        const { getForm } = renderApproval(true, { initialFunction: "isHighValue", onOpenFunction });

        await waitFor(() => expect(screen.getByTestId("approval-function-attached").textContent)
            .toContain("isHighValue"));
        fireEvent.click(screen.getByLabelText("Open isHighValue"));
        expect(onOpenFunction).toHaveBeenCalledWith("isHighValue");

        fireEvent.click(screen.getByLabelText("Remove approval function"));
        await waitFor(() => expect(screen.queryByTestId("approval-function-attached")).toBeNull());
        expect(getForm().getValues("approvalFunction")).toBe("");
        expect(screen.getByText("Add Approval Function")).toBeTruthy();
    });

    it("warns that saving deletes the function after Remove, until the same function is added back", async () => {
        const { getForm, getExpressionDiagnostics } = renderApproval(true, {
            initialFunction: "sendEmailApproval", getFunctionInfo: ownFunctionInfo, onOpenFunction: jest.fn(),
        });
        await waitFor(() => expect(screen.getByTestId("approval-function-attached")).toBeTruthy());
        expect(screen.queryByTestId("approval-function-delete-note")).toBeNull();

        fireEvent.click(screen.getByLabelText("Remove approval function"));
        await waitFor(() => expect(screen.getByTestId("approval-function-delete-note").textContent)
            .toContain("Saving will delete sendEmailApproval"));

        // The function still exists until save; the name check treats it as the existing declaration.
        fireEvent.click(screen.getByText("Add Approval Function"));
        await waitForNameCheck(getExpressionDiagnostics);
        const property = getExpressionDiagnostics.mock.calls[0][0].context.property;
        expect(property.value).toBe("sendEmailApproval");
        expect(property.codedata).toEqual({ lineRange: NAME_LINE_RANGE });

        await act(async () => {
            fireEvent.click(screen.getByText("Add"));
        });
        await waitFor(() => expect(screen.getByTestId("approval-function-attached").textContent)
            .toContain("sendEmailApproval"));
        expect(getForm().getValues("approvalFunction")).toBe("sendEmailApproval");
        expect(screen.queryByTestId("approval-function-delete-note")).toBeNull();
        // It's the existing function again, not a new one: nothing to generate, and it can be opened.
        expect(getForm().getValues("generateApprovalFunction")).toBe(false);
        expect(screen.queryByText("Created when you save the tool.")).toBeNull();
        expect(screen.getByLabelText("Open sendEmailApproval")).toBeTruthy();
    });

    it("warns that saving deletes the function when approval is turned off", async () => {
        const { getForm } = renderApproval(true, {
            initialFunction: "sendEmailApproval", getFunctionInfo: ownFunctionInfo,
        }, { approvalFunction: "sendEmailApproval" });
        await waitFor(() => expect(ownFunctionInfo).toHaveBeenCalled());

        act(() => {
            getForm().setValue("requiresApproval", false);
        });
        await waitFor(() => expect(screen.getByTestId("approval-function-delete-note").textContent)
            .toContain("make the function return false"));
    });

    it("doesn't warn about deleting a function that saving keeps", async () => {
        const shared = jest.fn().mockResolvedValue({
            params: PARAMS, usedBy: ["sendEmailTool", "refundTool"], referencedElsewhere: false,
        });
        const { getForm } = renderApproval(true, { initialFunction: "sharedApproval", getFunctionInfo: shared },
            { approvalFunction: "sharedApproval" });
        await waitFor(() => expect(shared).toHaveBeenCalled());

        act(() => {
            getForm().setValue("requiresApproval", false);
        });
        await act(async () => undefined);
        expect(screen.queryByTestId("approval-function-delete-note")).toBeNull();
    });

    it("tells the user an existing function will be updated when the tool's parameters change", async () => {
        const { getForm } = renderApproval(true, { initialFunction: "isHighValue" }, { params: PARAMS });
        await waitFor(() => expect(screen.getByTestId("approval-function-attached")).toBeTruthy());
        expect(screen.queryByTestId("approval-function-sync-note")).toBeNull();

        act(() => {
            getForm().setValue("params", [...PARAMS, { type: "string[]", name: "cc" }]);
        });
        await waitFor(() => expect(screen.getByTestId("approval-function-sync-note").textContent)
            .toContain("isHighValue will be updated to match when you save"));
    });

    it("doesn't report a parameter change for values the form loads after the editor mounts", async () => {
        // Form loads its values with reset() from its own effect, after the editor has mounted.
        const { getForm } = renderApproval(true, {
            initialFunction: "isHighValue",
            getToolParameters: (values) => values.params ?? [],
        });
        await waitFor(() => expect(screen.getByTestId("approval-function-attached")).toBeTruthy());
        act(() => {
            getForm().reset({ requiresApproval: true, approvalFunction: "isHighValue", params: PARAMS });
        });
        await act(async () => undefined);
        expect(screen.queryByTestId("approval-function-sync-note")).toBeNull();

        act(() => {
            getForm().setValue("params", [...PARAMS, { type: "string[]", name: "cc" }]);
        });
        await waitFor(() => expect(screen.getByTestId("approval-function-sync-note").textContent)
            .toContain("isHighValue will be updated to match when you save"));
    });

    it("warns when the attached function was edited out of step with the tool", async () => {
        const getFunctionInfo = jest.fn().mockResolvedValue({
            params: [{ type: "string", name: "to" }], usedBy: ["sendEmailTool"],
        });
        renderApproval(true, { initialFunction: "isHighValue", getFunctionInfo });

        await waitFor(() => expect(screen.getByTestId("approval-function-sync-note").textContent)
            .toContain("isHighValue doesn't match this tool's parameters. Saving the tool will update it to match."));
        expect(getFunctionInfo).toHaveBeenCalledWith("isHighValue");
    });

    it("stays quiet when the attached function matches the tool", async () => {
        const getFunctionInfo = jest.fn().mockResolvedValue({
            params: [{ type: "string", name: "to" }, { type: " string ", name: "subject" }], usedBy: ["sendEmailTool"],
        });
        renderApproval(true, { initialFunction: "isHighValue", getFunctionInfo });
        await waitFor(() => expect(getFunctionInfo).toHaveBeenCalled());
        await act(async () => undefined);
        expect(screen.queryByTestId("approval-function-sync-note")).toBeNull();
    });

    it("says a shared function won't be updated", async () => {
        const getFunctionInfo = jest.fn().mockResolvedValue({
            params: [{ type: "string", name: "to" }], usedBy: ["sendEmailTool", "refundTool"],
        });
        renderApproval(true, { initialFunction: "isHighValue", getFunctionInfo });
        await waitFor(() => expect(screen.getByTestId("approval-function-sync-note").textContent)
            .toContain("saving won't update it because refundTool also uses it"));
    });
});
