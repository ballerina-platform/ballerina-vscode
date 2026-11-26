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
import { act, render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { Form, FormHandle } from "../components/Form";
import { UnsavedChangesContext } from "../context";

const flagField = (value: string): FormField =>
    ({
        key: "enabled",
        label: "Enabled",
        type: "FLAG",
        value,
        optional: true,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType: "FLAG", selected: true }],
    } as unknown as FormField);

const nameField = (value: string): FormField =>
    ({
        key: "name",
        label: "Result",
        type: "IDENTIFIER",
        value,
        optional: false,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType: "IDENTIFIER", selected: true }],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    onSubmit: () => {},
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
};

describe("Form — unsaved changes", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = async () => {
        await act(async () => {
            jest.advanceTimersByTime(300);
        });
    };

    it("stays dirty when the host refreshes the fields with the edited value", async () => {
        const report = jest.fn();
        const changes = { report, confirmDiscard: (action: () => void) => action() };
        const ref = React.createRef<FormHandle>();
        const renderForm = (value: string) => (
            <UnsavedChangesContext.Provider value={changes}>
                <Form ref={ref} formFields={[nameField(value)]} {...common} />
            </UnsavedChangesContext.Provider>
        );
        const { rerender } = render(renderForm("original"));
        await settle();

        act(() => ref.current.setFieldValue("name", "edited"));
        await settle();
        expect(report).toHaveBeenLastCalledWith(expect.any(String), true);

        rerender(renderForm("edited"));
        await settle();
        expect(report).toHaveBeenLastCalledWith(expect.any(String), true);
    });

    // The flag editor turns "true" into true on load; that must not count once the user undoes an edit elsewhere.
    it("is clean again after an edit is undone, even when an editor normalized a value on load", async () => {
        const report = jest.fn();
        const changes = { report, confirmDiscard: (action: () => void) => action() };
        const ref = React.createRef<FormHandle>();
        render(
            <UnsavedChangesContext.Provider value={changes}>
                <Form ref={ref} formFields={[nameField("original"), flagField("true")]} {...common} />
            </UnsavedChangesContext.Provider>
        );
        await settle();

        act(() => ref.current.setFieldValue("name", "edited"));
        await settle();
        expect(report).toHaveBeenLastCalledWith(expect.any(String), true);

        act(() => ref.current.setFieldValue("name", "original"));
        await settle();
        expect(report).toHaveBeenLastCalledWith(expect.any(String), false);
    });
});
