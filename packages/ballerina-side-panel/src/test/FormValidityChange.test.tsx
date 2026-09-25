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

// onValidityChange must report "valid" again once a PathEditor error is fixed. react-hook-form
// mutates `errors` in place, so an effect keyed on `errors` never re-ran after clearErrors and hosts
// that gate their own Save on it (e.g. the trigger handler form via ArtifactForm) stayed disabled.

import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { Form } from "../components/Form";

const resourcePath = (value: string): FormField =>
    ({
        key: "name",
        label: "Resource Path",
        type: "RESOURCE_PATH",
        value,
        optional: false,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType: "RESOURCE_PATH", selected: true }],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    onSubmit: () => {},
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
};

describe("Form — onValidityChange", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = async () => {
        await act(async () => {
            jest.advanceTimersByTime(300);
        });
    };

    it("reports valid again once a path error is fixed", async () => {
        const onValidityChange = jest.fn();
        const { container } = render(
            <Form formFields={[resourcePath("/bad")]} {...common} onValidityChange={onValidityChange} />
        );
        await settle();
        expect(onValidityChange).toHaveBeenLastCalledWith(false);

        const textField = container.querySelector("vscode-text-field") as HTMLInputElement;
        expect(textField).not.toBeNull();
        Object.defineProperty(textField, "value", { value: "chat", writable: true, configurable: true });
        await act(async () => {
            fireEvent.input(textField);
            fireEvent.keyUp(textField);
        });
        await settle();
        await settle();
        expect(container.textContent).not.toContain("path cannot start with a slash");
        expect(onValidityChange).toHaveBeenLastCalledWith(true);
    });
});
