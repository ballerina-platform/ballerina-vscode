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

// L2 (P0): CheckBoxEditor (FLAG) behaviour (docs/TEST_BACKLOG.md L2-05).
// Renders the real editor via formHarness and asserts the label renders and the
// boolean value is normalised into the form — the string "true"/"false" the LS may
// send is coerced to a real boolean (#1054 class: boolean fields persist correctly).

import React from "react";
import { waitFor } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { CheckBoxEditor } from "../components/editors/CheckBoxEditor";

const flagField = (value: any): FormField =>
    ({
        key: "advanced",
        label: "Advanced mode",
        type: "FLAG",
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "Enable advanced options",
    } as unknown as FormField);

describe("CheckBoxEditor", () => {
    it("renders the field label", () => {
        const { getByText } = renderWithForm(<CheckBoxEditor field={flagField(true)} />, {
            defaultValues: { advanced: true },
        });
        expect(getByText("Advanced mode")).toBeInTheDocument();
    });

    it.each([
        ["boolean true", true, true],
        ['string "true"', "true", true],
        ["boolean false", false, false],
        ['string "false"', "false", false],
    ])("INVARIANT: normalises %s to a real boolean in the form", async (_desc, value, expected) => {
        const { getForm } = renderWithForm(<CheckBoxEditor field={flagField(value)} />, {
            defaultValues: { advanced: undefined },
        });
        await waitFor(() => expect(getForm().getValues("advanced")).toBe(expected));
    });
});
