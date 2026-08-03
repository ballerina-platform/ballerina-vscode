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

// Reference L1 (pure-logic) test: form value <-> expression conversion helpers.
// See docs/TEST_BACKLOG.md L1-01. These functions back the string-quoting and
// array/map value handling that several form bugs touch (#967, #1117, #319).

// The utils module imports the side-panel barrel and the ExpandedEditor tree only
// for types / rarely-used constants; stub them so this stays a fast pure-logic test.
jest.mock("../index", () => ({}));
jest.mock("../components/editors/ExpandedEditor", () => ({}));
jest.mock("../components/editors/ExpandedEditor/modes/types", () => ({ EXPANDABLE_MODES: [] }));

import {
    capitalize,
    sanitizeType,
    isRecord,
    getValueForTextModeEditor,
    getFriendlyIdentifierMessage,
    getFieldKeyForAdvanceProp,
    stringToRawArrayElements,
    stringToRawObjectEntries,
    buildStringArray,
    buildStringMap,
} from "../components/editors/utils";

describe("capitalize", () => {
    it("returns empty string for falsy input", () => {
        expect(capitalize("")).toBe("");
    });
    it("splits camelCase into start case words", () => {
        expect(capitalize("myVariableName")).toBe("My Variable Name");
    });
});

describe("sanitizeType", () => {
    it("strips a single module prefix", () => {
        expect(sanitizeType("http:Client")).toBe("Client");
    });
    it("leaves an unqualified type untouched", () => {
        expect(sanitizeType("string")).toBe("string");
    });
    it("leaves inline record types (with braces) untouched", () => {
        expect(sanitizeType("record {| int a; |}")).toBe("record {| int a; |}");
    });
    it("leaves multi-colon types untouched", () => {
        expect(sanitizeType("foo:bar:Baz")).toBe("foo:bar:Baz");
    });
});

describe("isRecord", () => {
    it.each([
        [{}, true],
        [{ a: 1 }, true],
        [[], false],
        [null, false],
        ["x", false],
        [1, false],
    ])("isRecord(%p) === %p", (value, expected) => {
        expect(isRecord(value)).toBe(expected);
    });
});

describe("getValueForTextModeEditor (string quoting)", () => {
    it("strips only the surrounding double quotes", () => {
        expect(getValueForTextModeEditor('"hello"')).toBe("hello");
    });
    it("preserves inner quotes", () => {
        expect(getValueForTextModeEditor('"a\\"b"')).toBe('a\\"b');
    });
    it("returns unquoted values unchanged", () => {
        expect(getValueForTextModeEditor("hello")).toBe("hello");
    });
    it("handles the empty quoted string", () => {
        expect(getValueForTextModeEditor('""')).toBe("");
    });
    it("returns null for record values", () => {
        expect(getValueForTextModeEditor({ a: 1 })).toBeNull();
    });
    it("returns the first element for array values", () => {
        expect(getValueForTextModeEditor(["x", "y"])).toBe("x");
    });
});

describe("getFriendlyIdentifierMessage", () => {
    it("rewrites redeclared/already-exists diagnostics", () => {
        expect(getFriendlyIdentifierMessage("redeclared symbol 'x'")).toBe(
            "This name is already used. Please choose a different name."
        );
    });
    it("rewrites reserved keyword diagnostics using the label", () => {
        expect(getFriendlyIdentifierMessage("reserved keyword", "Variable")).toBe(
            "'variable' cannot be a reserved keyword. Please choose a different name."
        );
    });
    it("rewrites invalid identifier diagnostics", () => {
        expect(getFriendlyIdentifierMessage("missing identifier")).toBe(
            "Invalid name. Use letters, digits or underscores, and start with a letter or underscore."
        );
    });
    it("falls back to the raw message when unknown", () => {
        expect(getFriendlyIdentifierMessage("something unexpected")).toBe("something unexpected");
    });
});

describe("getFieldKeyForAdvanceProp", () => {
    it("nests a plain advance prop under the field", () => {
        expect(getFieldKeyForAdvanceProp("foo", "bar")).toBe("foo.advanceProperties.bar");
    });
    it("returns the advance prop as-is when its parent is the field", () => {
        expect(getFieldKeyForAdvanceProp("x", "x.advanceProperties.y")).toBe("x.advanceProperties.y");
    });
});

describe("stringToRawArrayElements", () => {
    it("returns [] for an empty array literal", () => {
        expect(stringToRawArrayElements("[]")).toEqual([]);
    });
    it("splits top-level comma-separated elements", () => {
        expect(stringToRawArrayElements("[1, 2, 3]")).toEqual(["1", " 2", " 3"]);
    });
    it("does not split inside nested arrays", () => {
        expect(stringToRawArrayElements("[[1,2], [3]]")).toEqual(["[1,2]", " [3]"]);
    });
    it("does not split commas inside strings", () => {
        expect(stringToRawArrayElements('["a,b", "c"]')).toEqual(['"a,b"', ' "c"']);
    });
});

describe("stringToRawObjectEntries", () => {
    it("splits top-level key/value pairs on the first colon", () => {
        expect(stringToRawObjectEntries("{a: 1, b: 2}")).toEqual([
            { key: "a", value: "1" },
            { key: "b", value: "2" },
        ]);
    });
});

describe("buildStringArray / buildStringMap", () => {
    it("builds an array literal from field values", () => {
        expect(buildStringArray([{ value: "1" }, { value: "2" }] as any)).toBe("[1, 2]");
    });
    it("builds an empty array literal", () => {
        expect(buildStringArray([] as any)).toBe("[]");
    });
    it("builds a map literal from key/value field pairs", () => {
        const pairs = [
            [{ value: "a" }, { value: "1" }],
            [{ value: "b" }, { value: "2" }],
        ] as any;
        expect(buildStringMap(pairs)).toBe("{ a: 1, b: 2}");
    });
});
