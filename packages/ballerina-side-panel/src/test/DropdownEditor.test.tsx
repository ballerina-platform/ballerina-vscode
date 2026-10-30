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

// L2 (P0): DropdownEditor render behaviour (docs/TEST_BACKLOG.md L2-05).
// Renders the REAL editor (via formHarness) and asserts the invariant that the
// dropdown offers exactly the options the field declares — from either a string[]
// or a {label,value}[] `items` list (#1516/#1609 class: options come from the model).

import React from "react";
import { fireEvent } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { DropdownEditor } from "../components/editors/DropdownEditor";

const dropdownField = (items: any[], value?: any): FormField =>
    ({
        key: "logLevel",
        label: "Log Level",
        type: "ENUM",
        items,
        value: value ?? (typeof items[0] === "string" ? items[0] : items[0]?.value),
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
    } as unknown as FormField);

describe("DropdownEditor", () => {
    it("INVARIANT: renders an option for every string item in the model", () => {
        const items = ["DEBUG", "INFO", "ERROR"];
        const { container } = renderWithForm(<DropdownEditor field={dropdownField(items)} />, {
            defaultValues: { logLevel: "DEBUG" },
        });
        const text = container.textContent ?? "";
        for (const item of items) {
            expect(text).toContain(item);
        }
    });

    it("INVARIANT: renders {label,value} items by their label", () => {
        const items = [
            { label: "Debug level", value: "DEBUG" },
            { label: "Info level", value: "INFO" },
        ];
        const { container } = renderWithForm(<DropdownEditor field={dropdownField(items, "DEBUG")} />, {
            defaultValues: { logLevel: "DEBUG" },
        });
        const text = container.textContent ?? "";
        expect(text).toContain("Debug level");
        expect(text).toContain("Info level");
    });

    it("registers the field value with the form", () => {
        const { getForm } = renderWithForm(<DropdownEditor field={dropdownField(["DEBUG", "INFO"])} />, {
            defaultValues: { logLevel: "INFO" },
        });
        expect(getForm().getValues("logLevel")).toBe("INFO");
    });
});

describe("DropdownEditor with type modifiers", () => {
    const typeField = (value: string): FormField =>
        ({
            ...dropdownField(["string", "int"], value),
            key: "type",
            label: "Type",
            typeModifiers: ["list", "nullable"],
        } as FormField);

    it("offers the base types and shows the type's modifiers as toggles", () => {
        const { container, getByTestId } = renderWithForm(<DropdownEditor field={typeField("string[]?")} />, {
            defaultValues: { type: "string[]?" },
        });
        expect(container.textContent).toContain("string");
        expect(container.textContent).not.toContain("string[]");
        expect(getByTestId("type-modifier-list")).toHaveAttribute("aria-pressed", "true");
        expect(getByTestId("type-modifier-nullable")).toHaveAttribute("aria-pressed", "true");
    });

    it("writes a toggled modifier onto the type in the form", () => {
        const { getByTestId, getForm } = renderWithForm(<DropdownEditor field={typeField("int")} />, {
            defaultValues: { type: "int" },
        });
        fireEvent.click(getByTestId("type-modifier-nullable"));
        expect(getForm().getValues("type")).toBe("int?");
    });

    it("keeps the modifiers when another base type is picked", () => {
        const { container, getForm } = renderWithForm(<DropdownEditor field={typeField("string[]?")} />, {
            defaultValues: { type: "string[]?" },
        });
        // The toolkit's dropdown is a `vscode-dropdown` element, which jsdom does not upgrade: its value is set by hand.
        const dropdown = container.querySelector("vscode-dropdown") as HTMLElement & { value: string };
        dropdown.value = "int";
        fireEvent.change(dropdown);
        expect(getForm().getValues("type")).toBe("int[]?");
    });
});
