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

// L2 (P0): FormMapEditor (REPEATABLE_MAP) record-map behaviour (docs/TEST_BACKLOG.md
// L2-03). A map/record value must render one editable row PER entry — the #146 class
// bug is a nested record collapsing into a single field. Renders the real editor via
// formHarness and asserts the row structure grows with the model's entry count.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FormMapEditor } from "../components/editors/FormMapEditor";

const mapField = (value: Record<string, any>): FormField =>
    ({
        key: "headers",
        label: "Headers",
        type: "REPEATABLE_MAP",
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

function renderMap(value: Record<string, any>) {
    return renderWithForm(<FormMapEditor field={mapField(value)} label="Add Another Key-Value Pair" />, {
        defaultValues: {},
    });
}

// count the editable controls the map exposes (per-entry variable/expression inputs)
const inputCount = (c: HTMLElement) => c.querySelectorAll("input, textarea, vscode-text-field").length;

describe("FormMapEditor (record/map editor)", () => {
    it("renders the label and an add-entry affordance", () => {
        const { container } = renderMap({});
        expect(container.textContent).toContain("Headers");
        expect(container.textContent).toContain("Add Another Key-Value Pair");
    });

    it("INVARIANT: renders per-entry rows — a populated map exposes more inputs than an empty one", () => {
        const empty = renderMap({});
        const populated = renderMap({
            "Content-Type": { value: "application/json" },
            Accept: { value: "*/*" },
        });
        // structure, not a single collapsed field: entries add editable controls
        expect(inputCount(populated.container)).toBeGreaterThan(inputCount(empty.container));
    });

    it("renders without throwing for a three-entry map", () => {
        const { container } = renderMap({ a: { value: "1" }, b: { value: "2" }, c: { value: "3" } });
        expect(container.textContent).toContain("Headers");
    });
});
