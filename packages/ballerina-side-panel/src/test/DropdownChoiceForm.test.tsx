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
import { fireEvent } from "@testing-library/react";
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

// A branch's fields belong to the branch whether or not they must be filled in: optional there means
// the field carries no required marker. Filtering them out once left the Auto Retry policy with an
// empty branch, so the distinction is pinned here.
const fieldWithBranch = (branchField: Partial<FormField>): FormField =>
    ({
        key: "retryPolicy",
        label: "Retry Policy",
        type: "SINGLE_SELECT",
        items: ["NoRetry", "AutoRetry"],
        value: "AutoRetry",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        dynamicFormFields: {
            NoRetry: [],
            AutoRetry: [
                {
                    key: "maxRetries",
                    label: "Max Retries",
                    type: "STRING",
                    types: [{ fieldType: "STRING", selected: true }],
                    value: "",
                    editable: true,
                    enabled: true,
                    documentation: "Maximum retry attempts (default: 3)",
                    ...branchField,
                } as unknown as FormField,
            ],
        },
    } as unknown as FormField);

describe("DropdownChoiceForm branch fields", () => {
    it("renders an optional field of the selected branch", () => {
        const { container } = renderWithForm(
            <DropdownChoiceForm field={fieldWithBranch({ optional: true })} />,
            { defaultValues: { retryPolicy: "AutoRetry" } }
        );
        expect(container.textContent ?? "").toContain("Max Retries");
    });

    it("renders a required field of the selected branch", () => {
        const { container } = renderWithForm(
            <DropdownChoiceForm field={fieldWithBranch({ optional: false })} />,
            { defaultValues: { retryPolicy: "AutoRetry" } }
        );
        expect(container.textContent ?? "").toContain("Max Retries");
    });

    it("leaves a hidden branch field out", () => {
        const { container } = renderWithForm(
            <DropdownChoiceForm field={fieldWithBranch({ optional: true, hidden: true })} />,
            { defaultValues: { retryPolicy: "AutoRetry" } }
        );
        expect(container.textContent ?? "").not.toContain("Max Retries");
    });
});

// The retry policy declares its Auto Retry tuning fields inside a group of the AutoRetry branch, while
// their values live in root properties of the same key - which is what source generation reads. The
// group's children must therefore render under their own keys, or an edit has nowhere to land.
const groupBranchField = (): FormField =>
    ({
        key: "retryPolicy",
        label: "Retry Policy",
        type: "SINGLE_SELECT",
        items: ["NoRetry", "AutoRetry"],
        value: "AutoRetry",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        dynamicFormFields: {
            NoRetry: [],
            AutoRetry: [
                {
                    key: "autoRetryOptions",
                    label: "Advanced Configurations",
                    type: "GROUP_SECTION",
                    types: [{ fieldType: "GROUP_SECTION", selected: true }],
                    value: "",
                    optional: true,
                    editable: true,
                    enabled: true,
                    documentation: "",
                    advanceProps: [
                        {
                            key: "maxRetries",
                            label: "Max Retries",
                            type: "STRING",
                            types: [{ fieldType: "STRING", selected: true }],
                            value: "",
                            optional: true,
                            editable: true,
                            enabled: true,
                            documentation: "Maximum number of retry attempts",
                        },
                    ],
                } as unknown as FormField,
            ],
        },
    } as unknown as FormField);

describe("DropdownChoiceForm group branch", () => {
    it("renders the group of the selected branch", () => {
        const { container } = renderWithForm(<DropdownChoiceForm field={groupBranchField()} />, {
            defaultValues: { retryPolicy: "AutoRetry" },
        });
        expect(container.textContent ?? "").toContain("Advanced Configurations");
    });

    it("renders the group's child under its own key once expanded, so its edit reaches the root property", () => {
        const { container, getForm } = renderWithForm(<DropdownChoiceForm field={groupBranchField()} />, {
            defaultValues: { retryPolicy: "AutoRetry" },
        });

        // The toggle is a link button nested in a container that carries the same text, so clicking
        // every element whose text is exactly "Expand" reaches the one holding the handler.
        const expandTargets = Array.from(container.querySelectorAll("*")).filter(
            (element) => element.textContent?.trim() === "Expand"
        );
        expect(expandTargets.length).toBeGreaterThan(0);
        expandTargets.forEach((target) => fireEvent.click(target));

        expect(container.textContent ?? "").toContain("Max Retries");

        // The control the group renders is registered under the leaf key, so typing into it is what
        // puts the value where the root property - and therefore source generation - reads it.
        const control = container.querySelector('[name="maxRetries"]');
        expect(control).toBeTruthy();
        fireEvent.input(control!, { target: { value: "5" } });

        expect(getForm().getValues("maxRetries")).toBe("5");
    });
});

// Editing an existing node: the value lives in the root property and the branch declares the field
// with an empty value. Rendering the branch must not overwrite what was loaded.
describe("DropdownChoiceForm group branch on an existing node", () => {
    it("keeps the loaded value when the group is expanded", () => {
        const { container, getForm } = renderWithForm(<DropdownChoiceForm field={groupBranchField()} />, {
            defaultValues: { retryPolicy: "AutoRetry", maxRetries: "5" },
        });

        Array.from(container.querySelectorAll("*"))
            .filter((element) => element.textContent?.trim() === "Expand")
            .forEach((target) => fireEvent.click(target));

        expect(container.textContent ?? "").toContain("Max Retries");
        expect(getForm().getValues("maxRetries")).toBe("5");
    });
});
