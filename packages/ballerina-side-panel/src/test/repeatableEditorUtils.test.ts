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

/**
 * L1 (pure-logic) tests for the helpers behind the repeatable list and map editors: reading the diagnostics
 * envelope, the error banner messages, the required rule, the value-only comparisons and the required error that
 * survives a form reset.
 */

jest.mock("../index", () => ({}));
jest.mock("../components/editors/ExpandedEditor", () => ({}));
jest.mock("../components/editors/ExpandedEditor/modes/types", () => ({ EXPANDABLE_MODES: [] }));

import { renderHook } from "@testing-library/react";
import {
    buildRequiredRepeatableRule,
    getArrayElementValues,
    getMapEntryValues,
    getRepeatableErrorMessages,
    normalizeDiagnostics,
    useRepeatableRequiredError,
} from "../components/editors/utils";

const diagnostic = (message: string) => ({ message, severity: "ERROR" });

describe("normalizeDiagnostics", () => {
    it("returns a flat list as it is", () => {
        const list = [diagnostic("a"), diagnostic("b")];
        expect(normalizeDiagnostics(list)).toBe(list);
    });

    it("unwraps the { hasDiagnostics, diagnostics } envelope", () => {
        expect(normalizeDiagnostics({ hasDiagnostics: true, diagnostics: [diagnostic("a")] })).toEqual([diagnostic("a")]);
    });

    it.each([
        ["undefined", undefined],
        ["null", null],
        ["an envelope without a list", { hasDiagnostics: false }],
        ["an envelope with a non-list", { diagnostics: "oops" }],
        ["a string", "oops"],
    ])("returns an empty list for %s", (_desc, raw) => {
        expect(normalizeDiagnostics(raw)).toEqual([]);
    });
});

describe("getRepeatableErrorMessages", () => {
    it("shows each message once when the form error joins the same diagnostics with new lines", () => {
        const messages = getRepeatableErrorMessages([diagnostic("m1"), diagnostic("m2")], "m1\nm2");
        expect(messages).toEqual(["m1", "m2"]);
    });

    it("merges the form error with diagnostics read from the envelope", () => {
        const messages = getRepeatableErrorMessages({ diagnostics: [diagnostic("ambiguous type")] }, "Items is required");
        expect(messages).toEqual(["Items is required", "ambiguous type"]);
    });

    it("drops empty messages", () => {
        expect(getRepeatableErrorMessages([{ message: "" }, {}], undefined)).toEqual([]);
    });

    it("returns no messages when there is no error and no diagnostics", () => {
        expect(getRepeatableErrorMessages(undefined, undefined)).toEqual([]);
    });
});

describe("buildRequiredRepeatableRule", () => {
    const required = buildRequiredRepeatableRule({ isRequired: true, label: "Items" });

    it.each([
        ["an empty array", []],
        ["an empty object", {}],
        ["an empty string", ""],
        ["undefined", undefined],
    ])("rejects %s for a required field", (_desc, value) => {
        expect(required(value)).toBe("Items is required");
    });

    it.each([
        ["an array with an element", ["a"]],
        ["an object with an entry", { key: "value" }],
        ["array source with an element", "[a]"],
        ["map source with an entry", "{ key: value }"],
        ["empty array source", "[]"],
        ["empty array source with spaces", "[ ]"],
        ["empty array source over lines", "[\n]"],
        ["empty map source", "{}"],
        ["empty map source with spaces", "{ }"],
        ["empty map source over lines", "{\n}"],
    ])("accepts %s for a required field", (_desc, value) => {
        expect(required(value)).toBe(true);
    });

    it("accepts an empty value for an optional field", () => {
        expect(buildRequiredRepeatableRule({ isRequired: false, label: "Items" })([])).toBe(true);
    });

    it("falls back to a generic label", () => {
        expect(buildRequiredRepeatableRule({ isRequired: true })([])).toBe("This field is required");
    });
});

describe("getArrayElementValues", () => {
    it("reads the values regardless of the keys and diagnostics of the elements", () => {
        const fromEditor = [
            { key: "ar-elm-1", value: "a", diagnostics: [diagnostic("x")] },
            { key: "ar-elm-2", value: "b" },
        ];
        const fromServer = [
            { key: "ar-elm-9", value: "a" },
            { key: "ar-elm-8", value: "b", diagnostics: { diagnostics: [diagnostic("y")] } },
        ];
        expect(getArrayElementValues(fromEditor)).toEqual(["a", "b"]);
        expect(getArrayElementValues(fromEditor)).toEqual(getArrayElementValues(fromServer));
    });

    it("reads plain strings and treats a missing value as empty", () => {
        expect(getArrayElementValues(["a", { key: "ar-elm-1" }])).toEqual(["a", ""]);
    });
});

describe("getMapEntryValues", () => {
    it("reads the key and value of each entry regardless of the keys and diagnostics of the value fields", () => {
        const fromEditor = { host: { key: "mp-val-1", value: "localhost" }, port: { key: "mp-val-2", value: "9090" } };
        const fromServer = {
            host: { key: "mp-val-7", value: "localhost", diagnostics: [diagnostic("x")] },
            port: { key: "mp-val-8", value: "9090" },
        };
        expect(getMapEntryValues(fromEditor)).toEqual([["host", "localhost"], ["port", "9090"]]);
        expect(getMapEntryValues(fromEditor)).toEqual(getMapEntryValues(fromServer));
    });

    it("tells apart maps whose values differ", () => {
        expect(getMapEntryValues({ host: { value: "a" } })).not.toEqual(getMapEntryValues({ host: { value: "b" } }));
    });
});

describe("useRepeatableRequiredError", () => {
    const rule = buildRequiredRepeatableRule({ isRequired: true, label: "Items" });

    const renderError = (initial: { value: unknown; fieldError?: string }) =>
        renderHook(({ value, fieldError }) => useRepeatableRequiredError(value, fieldError, rule), {
            initialProps: initial,
        });

    it("shows nothing before the form has reported an error", () => {
        const { result } = renderError({ value: [] });
        expect(result.current).toBeUndefined();
    });

    it("passes the form error through", () => {
        const { result } = renderError({ value: [], fieldError: "Items is required" });
        expect(result.current).toBe("Items is required");
    });

    it("keeps the required error after a reset clears the form error while the value is still empty", () => {
        const { result, rerender } = renderError({ value: [], fieldError: "Items is required" });
        rerender({ value: [], fieldError: undefined });
        expect(result.current).toBe("Items is required");
    });

    it("drops the required error once the value has an entry", () => {
        const { result, rerender } = renderError({ value: [], fieldError: "Items is required" });
        rerender({ value: [], fieldError: undefined });
        rerender({ value: ["a"], fieldError: undefined });
        expect(result.current).toBeUndefined();
    });
});
