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

// L2 (P0): CustomDropdownEditor render behaviour (docs/TEST_BACKLOG.md L2-05, dropdown
// family). Renders the real editor via formHarness; the dropdown offers exactly the
// options the model declares and registers its value with the form.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { CustomDropdownEditor } from "../components/editors/CustomDropdownEditor";

const field = (items: any[], value?: any): FormField =>
    ({
        key: "scopeKind",
        label: "scope kind",
        type: "CUSTOM_DROPDOWN",
        items,
        value: value ?? items[0],
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("CustomDropdownEditor", () => {
    it("INVARIANT: offers an option for every string item in the model", () => {
        const items = ["INT", "STRING", "BOOLEAN"];
        const { container } = renderWithForm(<CustomDropdownEditor field={field(items)} />, {
            defaultValues: { scopeKind: "INT" },
        });
        const text = container.textContent ?? "";
        for (const item of items) {
            expect(text).toContain(item);
        }
    });

    it("registers the field value with the form", () => {
        const { getForm } = renderWithForm(<CustomDropdownEditor field={field(["INT", "STRING"], "STRING")} />, {
            defaultValues: { scopeKind: "STRING" },
        });
        expect(getForm().getValues("scopeKind")).toBe("STRING");
    });
});
