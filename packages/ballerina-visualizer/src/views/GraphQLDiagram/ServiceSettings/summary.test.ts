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

import type { ServiceSetting, ServiceSettingEditorKind } from "@wso2/ballerina-core";
import {
    MAX_SUMMARY_LENGTH,
    availableSettings,
    isPositiveInteger,
    setSettings,
    summarize,
    toBadgeSummary,
    toggleState,
} from "./summary";

const setting = (field: string, editorKind: ServiceSettingEditorKind, value?: string,
                 defaultValue?: string): ServiceSetting => ({
    field,
    label: field,
    editorKind,
    value,
    defaultValue,
});

// A corpus shaped like the language server's response for a GraphQL service: curated settings first,
// set or not, then fields with no descriptor of their own.
const corpus: ServiceSetting[] = [
    setting("contextInit", "contextInit", "graphqlContextInit"),
    setting("maxQueryDepth", "number"),
    setting("introspection", "toggle", "false", "true"),
    setting("validation", "toggle", undefined, "true"),
    setting("cors", "advanced", "{\n        allowOrigins: [\"*\"]\n    }"),
];

describe("service settings summary", () => {
    it("treats exactly the settings with a value as set, keeping their order", () => {
        expect(setSettings(corpus).map((s) => s.field)).toEqual(["contextInit", "introspection", "cors"]);
    });

    it("offers every unset curated setting for adding, and never a field with no editor", () => {
        const available = availableSettings(corpus);
        expect(available.map((s) => s.field)).toEqual(["maxQueryDepth", "validation"]);
        for (const s of available) {
            expect(s.value).toBeUndefined();
            expect(s.editorKind).not.toBe("advanced");
        }
    });

    it("partitions the curated settings: each is either set or available, never both", () => {
        const set = new Set(setSettings(corpus).map((s) => s.field));
        for (const s of corpus.filter((c) => c.editorKind !== "advanced")) {
            expect(set.has(s.field)).not.toBe(availableSettings(corpus).some((a) => a.field === s.field));
        }
    });

    it("gives the badge one entry per set setting", () => {
        expect(toBadgeSummary(corpus).items).toEqual([
            { label: "contextInit", summary: "graphqlContextInit" },
            { label: "introspection", summary: "Off" },
            { label: "cors", summary: "{ allowOrigins: [\"*\"] }" },
        ]);
        expect(toBadgeSummary([setting("maxQueryDepth", "number")]).items).toEqual([]);
    });

    it("keeps every summary on one line and within the length limit", () => {
        const long = setting("cors", "advanced", `{ allowOrigins: [${"\"https://example.com\", ".repeat(10)}] }`);
        for (const s of [...corpus, long].filter((c) => c.value !== undefined)) {
            const summary = summarize(s);
            expect(summary).not.toMatch(/\n/);
            expect(summary.length).toBeLessThanOrEqual(MAX_SUMMARY_LENGTH);
        }
        expect(summarize(long).endsWith("…")).toBe(true);
    });

    it("reads a toggle from its value, then its default, then off", () => {
        expect(toggleState(setting("introspection", "toggle", "false", "true"))).toBe(false);
        expect(toggleState(setting("validation", "toggle", undefined, "true"))).toBe(true);
        expect(toggleState(setting("other", "toggle"))).toBe(false);
    });

    it.each([
        ["10", true], ["1", true], [" 7 ", true],
        ["0", false], ["-1", false], ["1.5", false], ["", false], ["ten", false], ["010", false],
    ])("accepts only whole numbers of 1 or more: %p", (text, valid) => {
        expect(isPositiveInteger(text)).toBe(valid);
    });
});
