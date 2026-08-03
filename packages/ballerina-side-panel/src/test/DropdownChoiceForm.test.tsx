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

// L2 (P0): DropdownChoiceForm render behaviour (docs/TEST_BACKLOG.md L2-05, choice
// branch). A dropdown that selects among options and reveals the selection's fields.
// INVARIANT: the selector offers the model's items; the selected value registers.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { DropdownChoiceForm } from "../components/editors/DropdownChoiceForm";

const field = (items: string[], value?: string): FormField =>
    ({
        key: "kind",
        label: "kind",
        type: "SINGLE_SELECT",
        items,
        value: value ?? items[0],
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        dynamicFormFields: {},
    } as unknown as FormField);

describe("DropdownChoiceForm", () => {
    it("INVARIANT: offers an option for every item in the model", () => {
        const items = ["HTTP", "TCP", "File"];
        const { container } = renderWithForm(<DropdownChoiceForm field={field(items)} />, {
            defaultValues: { kind: "HTTP" },
        });
        const text = container.textContent ?? "";
        for (const item of items) {
            expect(text).toContain(item);
        }
    });

    it("registers the selected value with the form", () => {
        const { getForm } = renderWithForm(<DropdownChoiceForm field={field(["HTTP", "TCP"], "TCP")} />, {
            defaultValues: { kind: "TCP" },
        });
        expect(getForm().getValues("kind")).toBe("TCP");
    });
});
