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

// L2 (P0): MultiSelectEditor render behaviour (docs/TEST_BACKLOG.md L2-05). Renders the
// real editor via formHarness: label renders and the selector offers the model's items.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { MultiSelectEditor } from "../components/editors/MultiSelectEditor";

const field = (items: any[], value: any[] = []): FormField =>
    ({
        key: "roles",
        label: "Roles",
        type: "MULTIPLE_SELECT",
        items,
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("MultiSelectEditor", () => {
    it("renders the field label", () => {
        const { container } = renderWithForm(
            <MultiSelectEditor field={field(["admin", "user"], ["admin"])} label="Attach Another" />,
            { defaultValues: { roles: ["admin"] } }
        );
        expect(container.textContent).toContain("Roles");
    });

    it("INVARIANT: offers the model's items as options", () => {
        const items = ["admin", "user", "guest"];
        const { container } = renderWithForm(<MultiSelectEditor field={field(items, ["admin"])} label="Attach Another" />, {
            defaultValues: { roles: ["admin"] },
        });
        const text = container.textContent ?? "";
        for (const item of items) {
            expect(text).toContain(item);
        }
    });
});
