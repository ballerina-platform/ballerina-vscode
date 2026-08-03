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

// L2 (P0): FileSelect render behaviour (docs/TEST_BACKLOG.md L2-05). Renders the real
// editor via formHarness: shows the file-select label derived from the field label.

import React from "react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { FileSelect } from "../components/editors/FileSelect";

const field = (value = ""): FormField =>
    ({
        key: "cert",
        label: "Certificate",
        type: "FILE_SELECT",
        value,
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("FileSelect", () => {
    it("renders a file-select control labelled from the field", () => {
        const { container } = renderWithForm(<FileSelect field={field()} />, {
            defaultValues: { cert: "" },
        });
        // FileSelect renders `Select ${field.label} File`
        expect(container.textContent).toContain("Certificate");
    });

    it("seeds the control with the model value", () => {
        const { getForm } = renderWithForm(<FileSelect field={field("/path/to/cert.pem")} />, {
            defaultValues: { cert: "/path/to/cert.pem" },
        });
        expect(getForm().getValues("cert")).toBe("/path/to/cert.pem");
    });
});
