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

// L2 (P0): ReadonlyField render behaviour (docs/TEST_BACKLOG.md L2-05). Renders the real
// editor via formHarness: shows the label and the (non-editable) value.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ReadonlyField } from "../components/editors/ReadonlyField";

const field = (value: any): FormField =>
    ({
        key: "connection",
        label: "connection",
        type: "IDENTIFIER",
        value,
        optional: false,
        editable: false,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("ReadonlyField", () => {
    it("renders the label and the value", () => {
        const { container } = renderWithForm(<ReadonlyField field={field("mysqlClient")} />, {
            defaultValues: { connection: "mysqlClient" },
        });
        const text = container.textContent ?? "";
        expect(text).toContain("Connection"); // label is capitalized
        expect(text).toContain("mysqlClient");
    });

    it("coerces a non-string value to text without crashing", () => {
        const { container } = renderWithForm(<ReadonlyField field={field(42)} />, {
            defaultValues: { connection: 42 },
        });
        expect(container.textContent).toContain("42");
    });
});
