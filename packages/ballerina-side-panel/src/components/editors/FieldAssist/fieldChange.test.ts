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

import { AppliedChanges, AppliedMark, withFieldChange } from "./AssistHost";
import { Change, FormAssistDescription, appliedChanges } from "./FormAssist";

const mark = (before: string, after: string, revert = jest.fn()): AppliedMark => ({
    before, after, request: "a request", label: "Expression", revert, values: { before, after },
});

describe("withFieldChange", () => {
    it("adds a field's own change as a mark reviewed under the field", () => {
        const applied = withFieldChange(undefined, "expression", mark("subtotal", "subtotal * 2"));
        expect(applied.marks.expression).toMatchObject({ before: "subtotal", after: "subtotal * 2", inField: true });
        expect(applied.changes).toEqual({ "field:expression": ["expression"] });
        expect(applied.revert(["expression"])).toEqual({});
    });

    it("keeps the form's marks and the first value of a field changed again", () => {
        const formRevert = jest.fn();
        const current: AppliedChanges = {
            formId: "form",
            changes: { "1:Role": ["role"], "2:Expression": ["expression"] },
            request: "fill the form",
            marks: { role: mark("", "Assistant"), expression: mark("subtotal", "subtotal * 2", formRevert) },
            revert: (keys) => ({ values: Object.fromEntries(keys.map((key) => [key, "before"])) }),
        };
        const applied = withFieldChange(current, "expression", mark("subtotal * 2", "subtotal * 3"));
        expect(applied.formId).toBe("form");
        expect(applied.marks.role).toBe(current.marks.role);
        expect(applied.marks.expression).toMatchObject({ before: "subtotal", after: "subtotal * 3", values: { before: "subtotal", after: "subtotal * 3" }, inField: true });
        applied.marks.expression.revert();
        expect(formRevert).toHaveBeenCalled();
        // The form puts back only its own fields; this field's Undo handles its value.
        expect(applied.revert(["role", "expression"])).toEqual({ values: { role: "before" } });
    });
});

describe("appliedChanges", () => {
    const before = [{ condition: "a" }];
    const rowChange = (field: string, now: Record<string, string>, was?: Record<string, string>): Change => ({
        id: "conditions", field: "conditions", label: field, before: was?.condition ?? "", row: { field, was, now }, revert: { groups: { conditions: before } },
    });
    const changes = [rowChange("branch-0", { condition: "a2" }, { condition: "a" }), rowChange("branch-1", { condition: "b" })];
    const form = { slots: [], groups: [{ id: "conditions", rows: [{ condition: "a2" }, { condition: "b" }] }] } as unknown as FormAssistDescription;

    it("puts back only the rows still under review", () => {
        const applied = appliedChanges(changes, "a request", undefined, "form", () => undefined)!;
        expect(applied.revert(["branch-1"], form).groups).toEqual({ conditions: [{ condition: "a2" }] });
        expect(applied.revert(["branch-0", "branch-1"], form).groups).toEqual({ conditions: before });
    });

    it("removes a configurable once no change that names it stays", () => {
        const remove = jest.fn();
        const slot = (field: string): Change => ({ id: field, field, label: field, before: "", revert: { values: { [field]: "" } }, creates: ["apiKey"] });
        const applied = appliedChanges([slot("token"), slot("auth")], "a request", undefined, "form", () => undefined, remove)!;
        applied.marks.token.undone?.();
        expect(remove).toHaveBeenLastCalledWith([]);
        applied.revert(["auth"]);
        expect(remove).toHaveBeenLastCalledWith(["apiKey"]);
    });
});
