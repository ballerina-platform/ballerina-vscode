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
import { fireEvent, render, screen } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";

jest.mock(
    "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/components/ChipExpressionEditor",
    () => ({ __esModule: true, ChipExpressionEditorComponent: (): null => null })
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FieldActionLink, FieldTypePill } = require("../components/editors/ExpressionEditor");

const promptField = (overrides: Partial<FormField> = {}) =>
    ({ key: "instructions", label: "Instructions", type: "PROMPT", ...overrides } as FormField);

describe("FieldActionLink", () => {
    it("opens the prompt editor from a prompt field", () => {
        const onOpenPromptEditor = jest.fn();
        render(<FieldActionLink field={promptField()} onOpenPromptEditor={onOpenPromptEditor} />);

        fireEvent.click(screen.getByText("Open in Prompt Editor"));
        expect(onOpenPromptEditor).toHaveBeenCalled();
    });

    it("prefers the field's own action", () => {
        const actionCallback = jest.fn();
        const onOpenPromptEditor = jest.fn();
        render(
            <FieldActionLink
                field={promptField({ actionCallback, actionLabel: "Edit Variable" })}
                onOpenPromptEditor={onOpenPromptEditor}
            />
        );

        fireEvent.click(screen.getByText("Edit Variable"));
        expect(actionCallback).toHaveBeenCalled();
        expect(onOpenPromptEditor).not.toHaveBeenCalled();
    });

    it("renders nothing outside prompt mode without an action", () => {
        const { container } = render(<FieldActionLink field={promptField()} />);
        expect(container.innerHTML).toBe("");
    });
});

describe("FieldTypePill", () => {
    const types = [{ fieldType: "PROMPT", ballerinaType: "string" }, { fieldType: "EXPRESSION", ballerinaType: "string", selected: true }];

    it("shows the expected type in expression mode", () => {
        render(<FieldTypePill types={types} inputMode={InputMode.EXP} focused={true} />);
        expect(screen.getByTitle("string")).toBeDefined();
    });

    it("stays out of the other modes", () => {
        const { container } = render(<FieldTypePill types={types} inputMode={InputMode.PROMPT} focused={true} />);
        expect(container.innerHTML).toBe("");
    });
});
