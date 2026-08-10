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

// L2 (P0): CheckBoxConditionalEditor conditional-field toggle (docs/TEST_BACKLOG.md
// L2-05, conditional branch). A boolean flag whose checked/unchecked state reveals a
// different set of sub-fields. Renders the real editor via formHarness and asserts the
// INVARIANT that the checked-state sub-fields appear only when the flag is enabled.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { CheckBoxConditionalEditor } from "../components/editors/CheckBoxConditionalEditor";

const conditionalField = (value: boolean): FormField =>
    ({
        key: "useAuth",
        label: "Use authentication",
        type: "FLAG",
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        choices: [
            {
                metadata: { label: "On" },
                properties: {
                    token: {
                        metadata: { label: "Auth token", description: "" },
                        types: [{ fieldType: "EXPRESSION", selected: true }],
                        value: "",
                        optional: false,
                        editable: true,
                    },
                },
            },
            { metadata: { label: "Off" }, properties: {} },
        ],
    } as unknown as FormField);

function renderConditional(value: boolean) {
    return renderWithForm(<CheckBoxConditionalEditor field={conditionalField(value)} />, {
        defaultValues: { useAuth: value },
    });
}

describe("CheckBoxConditionalEditor", () => {
    it("renders the field label and a checkbox", () => {
        const { container } = renderConditional(false);
        expect(container.textContent).toContain("Use authentication");
        expect(container.querySelectorAll("vscode-checkbox, input[type=checkbox]").length).toBeGreaterThan(0);
    });

    it("INVARIANT: checked-state sub-fields render only when the flag is enabled", () => {
        const off = renderConditional(false);
        expect(off.container.textContent).not.toContain("Auth token");

        const on = renderConditional(true);
        expect(on.container.textContent).toContain("Auth token");
    });
});
