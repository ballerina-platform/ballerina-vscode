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

// L2 (P0): ChoiceForm behaviour (docs/TEST_BACKLOG.md L2-05, choice branch).
// A CHOICE field offers a set of mutually-exclusive options (each revealing its own
// sub-fields). Renders the real editor via formHarness and asserts the invariant that
// the selector offers exactly the choices the model declares (#327/#1516 class:
// options come from the model, nothing dropped).

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ChoiceForm } from "../components/editors/ChoiceForm";

const choiceField = (labels: string[], enabledIndex = 0): FormField =>
    ({
        key: "payload",
        label: "Payload type",
        type: "CHOICE",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        choices: labels.map((label, i) => ({
            enabled: i === enabledIndex,
            metadata: { label, description: "" },
            properties: {},
        })),
    } as unknown as FormField);

function renderChoice(field: FormField) {
    return renderWithForm(<ChoiceForm field={field} recordTypeFields={[]} />, { defaultValues: {} });
}

describe("ChoiceForm", () => {
    it("INVARIANT: offers an option for every choice declared in the model", () => {
        const labels = ["JSON", "XML", "Raw text"];
        const { container } = renderChoice(choiceField(labels));
        const text = container.textContent ?? "";
        for (const label of labels) {
            expect(text).toContain(label);
        }
    });

    it.each([
        ["two choices", ["JSON", "XML"]],
        ["single choice", ["JSON"]],
    ])("renders without throwing (%s)", (_desc, labels) => {
        const { container } = renderChoice(choiceField(labels as string[]));
        expect(container.textContent).toContain("JSON");
    });
});
