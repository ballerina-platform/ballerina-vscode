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

// A form section the language server declares can ask for one of its fields to be filled, though each is
// optional on its own (a task names its roles, its users, or both). The section says so in its description,
// is marked required, sits with the main fields, and keeps Save disabled while the ask is unmet.

import React from "react";
import { act, render } from "@testing-library/react";
import type { FieldGroup, FormField } from "../components/Form/types";
import { Form } from "../components/Form";
import { isFilledValue, isSectionAskUnmet } from "../components/Form/utils";

const field = (key: string, label: string, group?: string, value: unknown = ""): FormField =>
    ({
        key,
        label,
        type: "IDENTIFIER",
        value,
        optional: true,
        editable: true,
        enabled: true,
        hidden: false,
        documentation: "",
        group,
        types: [{ fieldType: "IDENTIFIER", selected: true }],
    } as unknown as FormField);

const common = {
    submitText: "Save",
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    fileName: "x.bal",
};

const DESCRIPTION = "Name who may decide this: fill in the roles, the users, or both";
const ASSIGNMENT: FieldGroup = {
    id: "audience", label: "Assignment", description: DESCRIPTION, defaultCollapsed: false,
    requireAnyOf: ["userRoles", "users"],
};
const audience = (roles: unknown = "", users: unknown = "") => [
    field("taskName", "Task Name", undefined, "approve"),
    field("userRoles", "User Roles", "audience", roles),
    field("users", "Users", "audience", users),
    field("excludedUsers", "Excluded Users", "audience"),
];

const sectionHeader = (container: HTMLElement, label: string): HTMLElement => {
    const header = Array.from(container.querySelectorAll("button[aria-expanded]"))
        .find((button) => button.textContent?.includes(label)) as HTMLElement;
    expect(header).toBeTruthy();
    return header;
};
const sectionBody = (container: HTMLElement, label: string) =>
    sectionHeader(container, label).nextElementSibling as HTMLElement;

describe("isFilledValue / isSectionAskUnmet", () => {
    // Every shape a cleared role or user field leaves behind, in both of its modes.
    const blank: unknown[] = [undefined, null, "", "   ", "()", "( )", " ( ) ", [], [""], ["  "]];
    const filled: unknown[] = ["ops", "approvers", ["ops"], ["", "alice"], '["a", "b"]', true, 0];

    it.each(blank.map((value) => [JSON.stringify(value) ?? "undefined", value]))("%s fills nothing", (_, value) => {
        expect(isFilledValue(value)).toBe(false);
    });

    it.each(filled.map((value) => [JSON.stringify(value), value]))("%s fills its field", (_, value) => {
        expect(isFilledValue(value)).toBe(true);
    });

    it("is unmet exactly when every asked-for field is blank", () => {
        for (const roles of [...blank, ...filled]) {
            for (const users of [...blank, ...filled]) {
                expect(isSectionAskUnmet(ASSIGNMENT, { userRoles: roles, users }))
                    .toBe(!isFilledValue(roles) && !isFilledValue(users));
            }
        }
        // Fields the section does not ask for satisfy nothing.
        expect(isSectionAskUnmet(ASSIGNMENT, { excludedUsers: ["bob"] })).toBe(true);
        // A section without an ask is never unmet.
        expect(isSectionAskUnmet({ id: "x", label: "X" }, {})).toBe(false);
    });
});

describe("Form — sections", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const settle = async () => {
        await act(async () => {
            jest.advanceTimersByTime(300);
        });
    };

    it("renders a section's members and its description in it, and nothing else", async () => {
        const { container } = render(<Form formFields={audience()} groups={[ASSIGNMENT]} onSubmit={() => {}} {...common} />);
        await settle();
        const body = sectionBody(container, "Assignment");
        expect(body.textContent).toContain(DESCRIPTION);
        expect(body.textContent).toContain("User Roles");
        expect(body.textContent).toContain("Excluded Users");
        expect(body.textContent).not.toContain("Task Name");
        // A description, not an alarm.
        expect(body.querySelector(".codicon-warning")).toBeNull();
    });

    it.each([true, false])("marks the header required exactly when the section asks (asks: %s)", async (asks) => {
        const group = asks ? ASSIGNMENT : { ...ASSIGNMENT, requireAnyOf: [] };
        const { container } = render(<Form formFields={audience()} groups={[group]} onSubmit={() => {}} {...common} />);
        await settle();
        expect(sectionHeader(container, "Assignment").textContent?.includes("*")).toBe(asks);
    });

    it("puts a section that asks above the advanced configurations and one that does not below", async () => {
        const advanced = { ...field("stepId", "Step Id"), advanced: true } as FormField;
        const extras: FieldGroup = { id: "extra", label: "Extras", defaultCollapsed: true };
        const { container } = render(
            <Form formFields={[...audience(), field("note", "Note", "extra"), advanced]} groups={[ASSIGNMENT, extras]}
                onSubmit={() => {}} {...common} />
        );
        await settle();
        const text = container.textContent ?? "";
        const advancedAt = text.indexOf("Advanced Configurations");
        expect(advancedAt).toBeGreaterThan(-1);
        expect(text.indexOf("Assignment")).toBeLessThan(advancedAt);
        expect(text.indexOf("Extras")).toBeGreaterThan(advancedAt);
    });

    // Save's disabled state is not observable under jsdom (see Form.test.tsx); the form reports the same
    // condition through onValidityChange, which is what a host gating its own Save reads.
    const validityOf = async (formFields: FormField[], group: FieldGroup = ASSIGNMENT) => {
        const onValidityChange = jest.fn();
        render(<Form formFields={formFields} groups={[group]} onSubmit={() => {}}
            onValidityChange={onValidityChange} {...common} />);
        await settle();
        return onValidityChange.mock.calls[onValidityChange.mock.calls.length - 1]?.[0];
    };

    const withExcludedUser = audience().map((member) =>
        (member.key === "excludedUsers" ? { ...member, value: ["bob"] } : member));

    it.each([
        ["nobody is named", audience(), false],
        ["only an excluded user is named", withExcludedUser, false],
        ["the roles are filled", audience(["ops"]), true],
        ["the users are filled", audience("", ["alice"]), true],
        ["the roles are nil and the users filled", audience("()", ["alice"]), true],
    ] as const)("holds Save exactly while the ask is unmet: %s", async (_, formFields, valid) => {
        expect(await validityOf([...formFields])).toBe(valid);
    });

    it("leaves Save to the rest of the form when the section asks for nothing", async () => {
        expect(await validityOf(audience(), { ...ASSIGNMENT, requireAnyOf: [] })).toBe(true);
    });

    it("does not hold Save for a section whose fields are all hidden", async () => {
        const hidden = audience().map((member) => (member.group ? { ...member, hidden: true } : member));
        expect(await validityOf(hidden)).toBe(true);
    });
});
