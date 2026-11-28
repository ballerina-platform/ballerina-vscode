/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { CreateConfigurableAction, FormAssistSlot } from "@wso2/ballerina-core";
import { AppliedChanges, AppliedMark, errorLines, offersFix, withFieldChange } from "./AssistHost";
import { withoutRow } from "./ChangeReview";
import { Change, FormAssistDescription, appliedChanges, prepareValues } from "./FormAssist";

describe("form fix offer", () => {
    const field = (label: string) => ({ label, messages: [`${label} is wrong`] });

    it("leaves a single field error to that field's own Fix", () => {
        expect(offersFix({ fields: [field("Name")], outside: [] })).toBe(false);
        expect(offersFix(undefined)).toBe(false);
    });

    it("offers a fix for errors in two fields or one outside the fields", () => {
        expect(offersFix({ fields: [field("Name"), field("Expression")], outside: [] })).toBe(true);
        expect(offersFix({ fields: [], outside: ["unreachable code"] })).toBe(true);
    });

    it("labels field errors and keeps step errors bare", () => {
        expect(errorLines({ fields: [field("Name")], outside: ["unreachable code"] }))
            .toEqual(["Name: Name is wrong", "unreachable code"]);
    });
});

const rowMark = (label: string) => ({ label, added: true, before: "", request: "", revert: jest.fn() } as AppliedMark);

describe("withoutRow", () => {
    const revert = jest.fn(() => ({}));
    const applied: AppliedChanges = {
        formId: "", revert,
        marks: { "field-0": rowMark("Field 1"), "field-2": rowMark("Field 3"), "field-3": rowMark("Field 4"), name: rowMark("Name") },
        changes: { "fields:Field 2": ["field-1"], "fields:Field 3": ["field-2"], "fields:Field 4": ["field-3"], "name:Name": ["name"] },
    };

    it("moves the marks of the rows below a removed row up one", () => {
        const next = withoutRow({ ...applied, marks: { ...applied.marks, "field-1": rowMark("Field 2") } }, "field-1");
        expect(Object.fromEntries(Object.entries(next.marks).map(([key, { label }]) => [key, label])))
            .toEqual({ "field-0": "Field 1", "field-1": "Field 3", "field-2": "Field 4", name: "Name" });
        expect(next.changes).toEqual({ "fields:Field 2": [], "fields:Field 3": ["field-1"], "fields:Field 4": ["field-2"], "name:Name": ["name"] });
    });

    it("lets Undo All find each moved change by the key it was made with", () => {
        withoutRow(applied, "field-1").revert(["field-1", "field-2", "name"]);
        expect(revert).toHaveBeenCalledWith(["field-2", "field-3", "name"], undefined);
    });
});

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
        const applied = appliedChanges(changes, "a request", "form", () => undefined)!;
        expect(applied.revert(["branch-1"], form).groups).toEqual({ conditions: [{ condition: "a2" }] });
        expect(applied.revert(["branch-0", "branch-1"], form).groups).toEqual({ conditions: before });
    });

    it("removes a configurable once no change that names it stays", () => {
        const remove = jest.fn();
        const slot = (field: string): Change => ({ id: field, field, label: field, before: "", revert: { values: { [field]: "" } }, creates: ["apiKey"] });
        const applied = appliedChanges([slot("token"), slot("auth")], "a request", "form", () => undefined, remove)!;
        applied.marks.token.undone?.();
        expect(remove).toHaveBeenLastCalledWith([]);
        applied.revert(["auth"]);
        expect(remove).toHaveBeenLastCalledWith(["apiKey"]);
    });
});

const action: CreateConfigurableAction = { kind: "createConfigurable", name: "botToken", type: "string", documentation: "The bot's token.", useFieldValue: true };
const slots = { slots: [{ path: "token", label: "Token", value: "\"abc\"", property: { types: [] } } as unknown as FormAssistSlot], groups: [] };
const response = { values: { token: "botToken" }, valueActions: { token: [action] } };

describe("form Copilot value actions", () => {
    it("declares what a value names, with the value it replaces, before the values land", async () => {
        const run = jest.fn().mockResolvedValue(undefined);
        await expect(prepareValues(response, slots, run)).resolves.toBe(response);
        expect(run).toHaveBeenCalledWith([action], "\"abc\"");
    });

    it("declares a configurable two values name only once", async () => {
        const run = jest.fn().mockResolvedValue(undefined);
        await prepareValues({ values: { token: "botToken", auth: "{token: botToken}" }, valueActions: { token: [action], auth: [action] } }, slots, run);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("keeps what removes each declared configurable", async () => {
        const remove = jest.fn();
        const created = new Map<string, () => Promise<void>>();
        await prepareValues(response, slots, jest.fn().mockResolvedValue(remove), created);
        expect(created.get("botToken")).toBe(remove);
    });

    it("fails a change that needs a configurable when the form can't declare one", async () => {
        await expect(prepareValues(response, slots)).rejects.toThrow("can't create configurables");
        await expect(prepareValues({ values: { token: "\"x\"" } }, slots)).resolves.toEqual({ values: { token: "\"x\"" } });
    });
});
