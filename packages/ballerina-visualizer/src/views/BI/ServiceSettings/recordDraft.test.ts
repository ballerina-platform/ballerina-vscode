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

import type { ServiceSetting, ServiceSettingField, ServiceSettingFieldValue } from "@wso2/ballerina-core";
import { draftOf, parseRecordDraft } from "./recordDraft";
import { isEditableInPanel, summarize, summarizeRecord } from "./summary";

// Sub-fields of every kind, shaped like the CORS and caching descriptors the language server ships.
const fields: ServiceSettingField[] = [
    { name: "allowOrigins", label: "Allowed origins", kind: "textList", defaultValue: [] },
    { name: "allowCredentials", label: "Allow credentials", kind: "toggle", defaultValue: false },
    { name: "maxAge", label: "Max age", kind: "decimal", defaultValue: -1 },
    { name: "maxSize", label: "Max entries", kind: "integer", defaultValue: 120 },
    { name: "path", label: "Path", kind: "text", defaultValue: "graphiql" },
    { name: "limit", label: "Limit", kind: "integer" },
];

const record = (recordValue?: Record<string, ServiceSettingFieldValue>, structured = true): ServiceSetting => ({
    field: "cors",
    label: "CORS",
    editorKind: "record",
    fields,
    value: recordValue || !structured ? "{...}" : undefined,
    recordValue,
    structured,
});

// Values a user could have set, each differing from its default.
const samples: Record<string, ServiceSettingFieldValue>[] = [
    {},
    { allowOrigins: ["https://a.example", "https://b.example"] },
    { allowCredentials: true, maxAge: 84900 },
    { maxAge: 30.5, maxSize: 500, path: "playground" },
    { limit: 7, maxAge: -1 },
];

describe("record settings", () => {
    it("starts an unset record at its defaults, and a set one at its values", () => {
        expect(draftOf(record())).toEqual({
            allowOrigins: "", allowCredentials: false, maxAge: "-1", maxSize: "120", path: "graphiql", limit: "",
        });
        expect(draftOf(record({ allowOrigins: ["*"], maxSize: 5 }))).toMatchObject({ allowOrigins: "*", maxSize: "5" });
    });

    it.each(samples)("reads back unchanged what it starts from: %p", (values) => {
        const { value, errors } = parseRecordDraft(fields, draftOf(record(values)));
        expect(errors).toEqual({});
        for (const [name, expected] of Object.entries(values)) {
            expect(value[name]).toEqual(expected);
        }
    });

    it("splits a text list on commas and drops empty items", () => {
        const { value } = parseRecordDraft(fields, { ...draftOf(record()), allowOrigins: " a , ,b,  " });
        expect(value.allowOrigins).toEqual(["a", "b"]);
    });

    it.each([
        ["maxSize", "1.5"], ["maxSize", "ten"], ["maxAge", "1e3"], ["maxAge", "--1"], ["limit", "1 2"],
    ])("flags %s set to %p", (name, text) => {
        const { errors, value } = parseRecordDraft(fields, { ...draftOf(record()), [name]: text });
        expect(errors[name]).toBeDefined();
        expect(value[name]).toBeUndefined();
    });

    it("leaves out an empty number, so the record type's default applies", () => {
        const { value, errors } = parseRecordDraft(fields, { ...draftOf(record()), limit: "  " });
        expect(errors).toEqual({});
        expect("limit" in value).toBe(false);
    });

    it("summarizes only the sub-fields away from their default, and a record at its defaults as Defaults", () => {
        expect(summarizeRecord(fields, {})).toBe("Defaults");
        expect(summarizeRecord(fields, { allowCredentials: false, maxSize: 120, allowOrigins: [] })).toBe("Defaults");
        expect(summarizeRecord(fields, { allowOrigins: ["*"], allowCredentials: true }))
            .toBe("Allowed origins: * · Allow credentials: On");
        expect(summarize(record({ maxAge: 30 }))).toBe("Max age: 30");
    });

    it("edits a record in the panel only when the language server could read its values", () => {
        expect(isEditableInPanel(record({ maxAge: 30 }))).toBe(true);
        expect(isEditableInPanel(record())).toBe(true);
        expect(isEditableInPanel(record(undefined, false))).toBe(false);
        expect(isEditableInPanel({ ...record({}), editorKind: "advanced" })).toBe(false);
    });
});
