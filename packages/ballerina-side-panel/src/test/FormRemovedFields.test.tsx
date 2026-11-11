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

// When a field leaves the form, the form drops its state and re-checks validity. Re-checking the whole form there
// marked fields not filled in yet as required, and before the first submit typing never cleared that error: the
// Generate form's Expected Type stayed "required" with a type in it (wso2/product-integrator#2810).

import React from "react";
import { act, render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { Form } from "../components/Form";

const field = (key: string, label: string, fieldType: string, value: string, optional = false): FormField =>
    ({
        key,
        label,
        type: fieldType,
        value,
        optional,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType, selected: true }],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    onSubmit: () => {},
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
};

describe("Form — a field leaving the form", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = async () => {
        await act(async () => {
            jest.advanceTimersByTime(300);
        });
    };

    it("does not mark a field not filled in yet as required", async () => {
        const name = field("name", "Result", "IDENTIFIER", "");
        const extra = field("extra", "Extra", "IDENTIFIER", "x", true);
        const { container, rerender } = render(<Form formFields={[name, extra]} {...common} />);
        await settle();
        expect(container.textContent).not.toContain("Result is required");

        rerender(<Form formFields={[name]} {...common} />);
        await settle();
        await settle();
        expect(container.textContent).not.toContain("Result is required");
    });

    it("stops a removed field's error from blocking the form", async () => {
        const onValidityChange = jest.fn();
        const path = field("path", "Resource Path", "RESOURCE_PATH", "/bad");
        const name = field("name", "Result", "IDENTIFIER", "ok");
        const { rerender } = render(<Form formFields={[path, name]} {...common} onValidityChange={onValidityChange} />);
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        rerender(<Form formFields={[name]} {...common} onValidityChange={onValidityChange} />);
        await settle();
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });
});
