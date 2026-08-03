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

// L2 (P0): HeaderSetEditor render behaviour (docs/TEST_BACKLOG.md L2-03/05). Renders the
// real editor via formHarness: label renders, and it renders for both an empty and a
// populated header-set value without throwing (render-safety).

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { HeaderSetEditor } from "../components/editors/HeaderSetEditor";

const field = (value: any[]): FormField =>
    ({
        key: "headerSets",
        label: "Header Sets",
        type: "HEADER_SET",
        value,
        items: ["string", "int"],
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("HeaderSetEditor", () => {
    it("renders the field label", () => {
        const { container } = renderWithForm(<HeaderSetEditor field={field([])} />, { defaultValues: {} });
        expect(container.textContent).toContain("Header Sets");
    });

    it("renders a populated header set without throwing", () => {
        const { container } = renderWithForm(
            <HeaderSetEditor
                field={field([
                    { name: "Content-Type", type: "string", value: "application/json" },
                    { name: "Accept", type: "string", value: "*/*" },
                ])}
            />,
            { defaultValues: {} }
        );
        expect(container.textContent).toContain("Header Sets");
    });
});
