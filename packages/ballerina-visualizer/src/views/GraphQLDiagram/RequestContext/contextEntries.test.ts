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

import type { ContextEntry, ContextEntrySource } from "@wso2/ballerina-core";
import {
    SOURCE_OPTIONS,
    canBeRequired,
    isDirty,
    newEntry,
    normalizeEntries,
    validateEntries,
    withSource,
} from "./contextEntries";

const SOURCES = Object.keys(SOURCE_OPTIONS) as ContextEntrySource[];

// Every source, required and optional, as the language server reads them back.
const corpus: ContextEntry[] = [
    { key: "scope", source: "header", value: "scope", required: true },
    { key: "tenant", source: "header", value: "x-tenant", required: false },
    { key: "page", source: "query", value: "page", required: true },
    { key: "lang", source: "query", value: "lang", required: false },
    { key: "env", source: "value", value: "prod", required: false },
    { key: "blank", source: "value", value: "", required: false },
    { key: "path", source: "expression", value: "request.rawPath", required: false },
];

describe("context entries", () => {
    it("accepts every entry the language server can read back", () => {
        expect(validateEntries(corpus).every((error) => !error.key && !error.value)).toBe(true);
    });

    it("leaves a valid list unchanged when normalizing, so saving it is a no-op", () => {
        expect(normalizeEntries(corpus)).toEqual(corpus);
        expect(isDirty(corpus, corpus)).toBe(false);
    });

    it("never marks a value as required unless it comes from the request", () => {
        for (const source of SOURCES) {
            for (const entry of corpus) {
                const changed = withSource({ ...entry, required: true }, source);
                expect(changed.required).toBe(canBeRequired(source));
                expect(normalizeEntries([{ ...entry, source, required: true }])[0].required)
                    .toBe(canBeRequired(source));
            }
        }
    });

    it("keeps the value when the source changes", () => {
        for (const source of SOURCES) {
            expect(withSource(corpus[0], source).value).toBe(corpus[0].value);
        }
    });

    it("asks for a key on every entry, and for a name or expression on every entry but a fixed value", () => {
        for (const source of SOURCES) {
            const [errors] = validateEntries([{ key: " ", source, value: " ", required: false }]);
            expect(errors.key).toBeDefined();
            expect(errors.value === undefined).toBe(source === "value");
        }
    });

    it("flags every use of a key that appears more than once, comparing trimmed keys", () => {
        const errors = validateEntries([
            { ...corpus[0], key: "scope" },
            corpus[4],
            { ...corpus[2], key: " scope " },
        ]);
        expect(errors.map((e) => !!e.key)).toEqual([true, false, true]);
    });

    it("trims keys and request names but keeps a fixed value exactly as typed", () => {
        expect(normalizeEntries([
            { key: " a ", source: "header", value: " x-a ", required: true },
            { key: "b", source: "value", value: "  spaced  ", required: false },
        ])).toEqual([
            { key: "a", source: "header", value: "x-a", required: true },
            { key: "b", source: "value", value: "  spaced  ", required: false },
        ]);
    });

    it("sees only real changes as unsaved", () => {
        expect(isDirty(corpus, [...corpus])).toBe(false);
        expect(isDirty(corpus, [{ ...corpus[0], key: " scope " }, ...corpus.slice(1)])).toBe(false);
        expect(isDirty(corpus, corpus.slice(1))).toBe(true);
        expect(isDirty(corpus, [...corpus, newEntry()])).toBe(true);
        expect(isDirty(corpus, [{ ...corpus[0], required: false }, ...corpus.slice(1)])).toBe(true);
    });

    it("starts a new entry as an empty, required header, which validation flags until filled", () => {
        const entry = newEntry();
        expect(entry).toEqual({ key: "", source: "header", value: "", required: true });
        expect(validateEntries([entry]).some((error) => error.key || error.value)).toBe(true);
    });
});
