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

// A mode switch refreshes diagnostics in the background; only Save holds the button while it validates.

import React from "react";
import { act, fireEvent, render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";

jest.mock(
    "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/components/ChipExpressionEditor",
    () => ({ __esModule: true, ChipExpressionEditorComponent: (): null => null })
);
jest.mock(
    "../components/editors/MultiModeExpressionEditor/TextExpressionEditor/TextModeEditor",
    () => ({ __esModule: true, default: (): null => null })
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Form } = require("../components/Form");

const promptField = {
    key: "instructions",
    label: "Instructions",
    type: "PROMPT",
    value: "string `Be brief.`",
    optional: false,
    editable: true,
    enabled: true,
    hidden: false,
    documentation: "",
    types: [
        { fieldType: "PROMPT", ballerinaType: "string", selected: false },
        { fieldType: "EXPRESSION", ballerinaType: "string", selected: true },
    ],
} as unknown as FormField;

const saveButtonText = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("vscode-button, button"))
        .map((b) => b.textContent?.trim())
        .find((text) => text === "Save" || text === "Validating...");

describe("validation on a mode switch", () => {
    it("refreshes diagnostics without holding the save button", async () => {
        const onFormValidation = jest.fn(() => new Promise<boolean>(() => undefined));
        const { container, getByTestId } = render(
            <Form
                formFields={[promptField]}
                submitText="Save"
                onSubmit={() => undefined}
                onFormValidation={onFormValidation}
                targetLineRange={{ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } }}
                fileName="x.bal"
                nodeInfo={{ kind: "" as any }}
            />
        );

        await act(async () => {
            fireEvent.click(getByTestId("primary-mode"));
        });

        expect(onFormValidation).toHaveBeenCalled();
        expect(saveButtonText(container)).toBe("Save");
    });
});
