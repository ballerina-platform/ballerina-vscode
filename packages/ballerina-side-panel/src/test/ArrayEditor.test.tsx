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

// L2 (P0): array editor render safety (docs/TEST_BACKLOG.md L2-02).
// Renders the REAL FormArrayEditorWrapper via formHarness. Several reported bugs are
// array-typed params that crash or render nothing (#1280/#319/#1491-class); these
// invariants assert an array-typed field renders — for both empty and populated
// values — with its label and an add-item affordance, and never throws.
// (Item-level add/remove interaction needs the ModeSwitcher/sub-form harness and is
// tracked separately.)

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FormArrayEditorWrapper } from "../components/editors/FormArrayEditorWrapper";

const arrayField = (value: any[]): FormField =>
    ({
        key: "items",
        label: "Items",
        type: "REPEATABLE_LIST",
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        types: [{ fieldType: "REPEATABLE_LIST", template: { types: [{ fieldType: "EXPRESSION" }] } } as any],
    } as unknown as FormField);

function renderArray(value: any[]) {
    return renderWithForm(
        <FormArrayEditorWrapper
            field={arrayField(value)}
            fieldInputType={{ fieldType: "REPEATABLE_LIST" } as any}
            openSubPanel={() => {}}
        />,
        { defaultValues: { items: value } }
    );
}

describe("FormArrayEditorWrapper (array editor)", () => {
    it.each([
        ["empty", []],
        ["populated", ["alpha", "beta"]],
    ])("INVARIANT: renders an array-typed field (%s) without throwing, with its label", (_desc, value) => {
        const { container } = renderArray(value as any[]);
        expect(container.textContent).toContain("Items");
    });

    it("renders an add-item affordance", () => {
        const { container } = renderArray([]);
        // S.AddNewButton renders a Codicon name="add" → <i class="... codicon-add ...">
        expect(container.querySelector('[class*="codicon-add"], [class*="add"]')).toBeInTheDocument();
    });
});
