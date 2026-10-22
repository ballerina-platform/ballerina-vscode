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
import { loadFixtures } from "@wso2/test-config/fixtures";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { ReadonlyField } from "../components/editors/ReadonlyField";

jest.mock("../components/Form/WarningBanner", () => ({
    WarningBanner: ({ warningMsg }: { warningMsg: string }) => <div data-testid="warning-banner">{warningMsg}</div>,
}));

interface FieldFixture {
    field: FormField;
}

// Read-only field fixtures (e.g. issue-1767.json) that carry ERROR diagnostics
const readonlyErrorFixtures = loadFixtures<FieldFixture>(__dirname, "fixtures", "fields").filter(
    (f) => f.data.field.editable === false && (f.data.field.diagnostics ?? []).some((d) => d.severity === "ERROR")
);

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

describe("ReadonlyField diagnostics", () => {
    it("has fixtures to run", () => {
        expect(readonlyErrorFixtures.length).toBeGreaterThan(0);
    });

    it.each(readonlyErrorFixtures.map((f) => [f.name, f.data] as [string, FieldFixture]))(
        "INVARIANT: %s -> every ERROR diagnostic of a read-only field is shown",
        (_name, fx) => {
            const { container } = renderWithForm(<ReadonlyField field={fx.field} />, {
                defaultValues: { [fx.field.key]: fx.field.value },
            });
            const text = container.textContent ?? "";
            (fx.field.diagnostics ?? [])
                .filter((d) => d.severity === "ERROR")
                .forEach((d) => expect(text).toContain(d.message));
        }
    );
});

describe("ReadonlyField", () => {
    it("renders the label and the value", () => {
        const { container } = renderWithForm(<ReadonlyField field={field("mysqlClient")} />, {
            defaultValues: { connection: "mysqlClient" },
        });
        const text = container.textContent ?? "";
        expect(text).toContain("Connection"); // label is capitalized
        expect(text).toContain("mysqlClient");
    });

    it("shows the diagnostics of a read-only field", () => {
        // wso2/product-integrator#1767: the result type is read-only, so its error was never shown
        const typeField = {
            ...field("Unknown Type"),
            key: "type",
            label: "Result Type",
            diagnostics: [
                { message: "attempt to refer to non-accessible symbol 'HttpClient'", severity: "ERROR" },
                { message: "unknown type 'HttpClient'", severity: "ERROR" },
            ],
        } as unknown as FormField;
        const { container } = renderWithForm(<ReadonlyField field={typeField} />, {
            defaultValues: { type: "Unknown Type" },
        });
        const text = container.textContent ?? "";
        expect(text).toContain("attempt to refer to non-accessible symbol 'HttpClient'");
        expect(text).toContain("unknown type 'HttpClient'");
    });

    it("shows no error when the field has no diagnostics", () => {
        const { container } = renderWithForm(<ReadonlyField field={field("mysqlClient")} />, {
            defaultValues: { connection: "mysqlClient" },
        });
        expect(container.querySelector(".codicon-warning")).toBeNull();
    });

    it("shows a warning in the warning banner rather than as an error", () => {
        const warned = {
            ...field("x"),
            diagnostics: [{ message: "deprecated", severity: "WARNING" }],
        } as unknown as FormField;
        const { getByTestId } = renderWithForm(<ReadonlyField field={warned} />, {
            defaultValues: { connection: "x" },
        });
        expect(getByTestId("warning-banner").textContent).toBe("deprecated");
    });

    it("shows a repeated diagnostic once", () => {
        const duplicated = {
            ...field("x"),
            diagnostics: [
                { message: "unknown type 'X'", severity: "ERROR" },
                { message: "unknown type 'X'", severity: "ERROR" },
            ],
        } as unknown as FormField;
        const { container } = renderWithForm(<ReadonlyField field={duplicated} />, {
            defaultValues: { connection: "x" },
        });
        expect((container.textContent ?? "").split("unknown type 'X'").length - 1).toBe(1);
    });

    it("coerces a non-string value to text without crashing", () => {
        const { container } = renderWithForm(<ReadonlyField field={field(42)} />, {
            defaultValues: { connection: 42 },
        });
        expect(container.textContent).toContain("42");
    });
});
