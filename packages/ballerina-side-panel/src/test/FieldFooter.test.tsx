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

// L2: a host can draw something under a field's editor (a connection form's "Make configurable" line). The footer is
// given the field, its editor's mode and its value as typed, and follows the value as it changes.

import React from "react";
import { act } from "@testing-library/react";
import type { FieldFooterRenderer, FormField } from "../components/Form/types";
import { FieldFactory } from "../components/editors/FieldFactory";
import { renderWithForm } from "./formHarness";

const selectField = (): FormField =>
    ({
        key: "level",
        label: "Level",
        type: "ENUM",
        items: ["DEBUG", "INFO"],
        value: "DEBUG",
        optional: false,
        editable: true,
        enabled: true,
        documentation: "",
        types: [{ fieldType: "SINGLE_SELECT", selected: true, options: ["DEBUG", "INFO"] }],
    } as unknown as FormField);

const footer: FieldFooterRenderer = (field, inputMode, value) => (
    <span data-testid={`footer-${field.key}`}>{`${inputMode}:${value}`}</span>
);

describe("field footer", () => {
    it("draws the host's footer with the field's mode and value", () => {
        const { getByTestId } = renderWithForm(<FieldFactory field={selectField()} />, {
            defaultValues: { level: "DEBUG" },
            renderFieldFooter: footer,
        });
        expect(getByTestId("footer-level").textContent).toBe("Select:DEBUG");
    });

    it("follows the value as it changes", () => {
        const { getByTestId, getForm } = renderWithForm(<FieldFactory field={selectField()} />, {
            defaultValues: { level: "DEBUG" },
            renderFieldFooter: footer,
        });
        act(() => getForm().setValue("level", "INFO"));
        expect(getByTestId("footer-level").textContent).toBe("Select:INFO");
    });

    it("draws nothing when the host adds nothing", () => {
        const { queryByTestId } = renderWithForm(<FieldFactory field={selectField()} />, {
            defaultValues: { level: "DEBUG" },
        });
        expect(queryByTestId("footer-level")).toBeNull();
    });
});
