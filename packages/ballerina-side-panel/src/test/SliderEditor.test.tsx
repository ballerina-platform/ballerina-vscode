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

// L2 (P0): SliderEditor render behaviour (docs/TEST_BACKLOG.md L2-05). Renders the real
// editor via formHarness: label renders and the value is registered with the form.

import React from "react";
import { waitFor } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { SliderEditor } from "../components/editors/SliderEditor";

const field = (value: number): FormField =>
    ({
        key: "temperature",
        label: "Temperature",
        type: "SLIDER",
        value,
        sliderProps: { min: 0, max: 10, step: 1 },
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("SliderEditor", () => {
    it("renders the field label", () => {
        const { container } = renderWithForm(<SliderEditor field={field(5)} />, {
            defaultValues: { temperature: 5 },
        });
        expect(container.textContent).toContain("Temperature");
    });

    it("registers the slider value with the form", async () => {
        const { getForm } = renderWithForm(<SliderEditor field={field(7)} />, {
            defaultValues: { temperature: undefined },
        });
        // SliderEditor seeds the form value from field.value in an effect
        await waitFor(() => expect(getForm().getValues("temperature")).toBe(7));
    });
});
