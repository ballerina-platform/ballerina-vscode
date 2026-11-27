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

import type { AppliedChanges, AppliedMark } from "./AssistHost";
import { withoutRow } from "./ChangeReview";

const mark = (label: string) => ({ label, added: true, before: "", request: "", revert: jest.fn() } as AppliedMark);

describe("withoutRow", () => {
    const revert = jest.fn(() => ({}));
    const applied: AppliedChanges = {
        formId: "", request: "", revert,
        marks: { "field-0": mark("Field 1"), "field-2": mark("Field 3"), "field-3": mark("Field 4"), name: mark("Name") },
        changes: { "fields:Field 2": ["field-1"], "fields:Field 3": ["field-2"], "fields:Field 4": ["field-3"], "name:Name": ["name"] },
    };

    it("moves the marks of the rows below a removed row up one", () => {
        const next = withoutRow({ ...applied, marks: { ...applied.marks, "field-1": mark("Field 2") } }, "field-1");
        expect(Object.fromEntries(Object.entries(next.marks).map(([key, { label }]) => [key, label])))
            .toEqual({ "field-0": "Field 1", "field-1": "Field 3", "field-2": "Field 4", name: "Name" });
        expect(next.changes).toEqual({ "fields:Field 2": [], "fields:Field 3": ["field-1"], "fields:Field 4": ["field-2"], "name:Name": ["name"] });
    });

    it("lets Undo All find each moved change by the key it was made with", () => {
        withoutRow(applied, "field-1").revert(["field-1", "field-2", "name"]);
        expect(revert).toHaveBeenCalledWith(["field-2", "field-3", "name"], undefined);
    });
});
