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

// L2 (P0): Form-level diagnostics & rendering (docs/TEST_BACKLOG.md L2-06).
// Renders the whole Form (it owns its react-hook-form) and asserts:
//   - node/form-level diagnostics render at the form level (#1205: shown at top, not
//     buried on the first field)
//   - the form renders its declared fields and a save button.
//
// The save-button *gating* (disabled until required fields are filled, #303/#371) is
// covered as pure logic in formValidationUtils.test.ts (L1). Asserting the enabled
// TRANSITION here needs waitFor, which advances rAF into an editor layout callback
// that throws IndexSizeError under jsdom (a jsdom Range limitation, not a product
// bug) — so the render-level transition is intentionally left to L4/manual.

import React from "react";
import { render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { Form } from "../components/Form";

const requiredString = (value: string): FormField =>
    ({
        key: "name",
        label: "Name",
        type: "STRING",
        value,
        optional: false,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        types: [{ fieldType: "STRING", selected: true }],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    onSubmit: () => {},
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
    nodeInfo: { kind: "" as any },
};

function renderForm(fields: FormField[], extra: Record<string, any> = {}) {
    return render(<Form formFields={fields} {...common} {...extra} />);
}

describe("Form — diagnostics & rendering", () => {
    it("INVARIANT: form-level diagnostics render at the form level", () => {
        const { container } = renderForm([requiredString("ok")], {
            formDiagnostics: [{ message: "Undefined symbol at node scope", severity: "ERROR" }],
        });
        expect(container.textContent).toContain("Undefined symbol at node scope");
    });

    it("renders the declared form fields", () => {
        const { container } = renderForm([requiredString("")]);
        expect(container.textContent).toContain("Name");
    });

    it("renders a save button", () => {
        const { container } = renderForm([requiredString("ok")]);
        const save = Array.from(container.querySelectorAll("vscode-button, button")).some(
            (b) => b.textContent?.trim() === "Save"
        );
        expect(save).toBe(true);
    });
});
