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
    fetchIdentifierDiagnostics,
    getFieldKeyForAdvanceProp,
    stringToRawArrayElements,
    stringToRawObjectEntries,
    buildStringArray,
    buildStringMap,
    withHeldValue,
    requiresSourceFormName,
    toEditableName,
    getMapKeyField,
    getMapSubFormFieldFromTypes,
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

// A policy sub-form's role field (Reviewers, Administrator Users) is defined with the list mode
// selected and takes its loaded value from the hidden root property of the same key. The value's
// shape says which mode can show it (wso2/product-integrator#2716).
describe("withHeldValue on a list-or-expression field", () => {
    const roleField = (): any => ({
        key: "retryUsers",
        label: "Reviewers",
        type: "TEXT_SET",
        types: [
            { fieldType: "TEXT_SET", ballerinaType: "string[]", selected: true },
            { fieldType: "EXPRESSION", ballerinaType: "string|[string, string...]", selected: false },
        ],
        value: "",
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
    });
    const selected = (field: any) => field.types.find((type: any) => type.selected).fieldType;

    it("opens a reference in the expression mode", () => {
        const field = withHeldValue(roleField(), { retryUsers: "input.id" });
        expect(field.value).toBe("input.id");
        expect(selected(field)).toBe("EXPRESSION");
    });
    it("opens a list of names in the list mode", () => {
        const field = withHeldValue(roleField(), { retryUsers: ["alice", "bob"] });
        expect(selected(field)).toBe("TEXT_SET");
    });
    it("keeps the definition's mode when nothing or an empty text is held", () => {
        expect(selected(withHeldValue(roleField(), {}))).toBe("TEXT_SET");
        expect(selected(withHeldValue(roleField(), { retryUsers: "" }))).toBe("TEXT_SET");
    });
    it("does not touch the definition's own type objects", () => {
        const definition = roleField();
        withHeldValue(definition, { retryUsers: "input.id" });
        expect(selected(definition)).toBe("TEXT_SET");
    });
});

// The language-server identifier check shared by IdentifierField, IdentifierEditor and the approval
// function's add form: it sends the name as the property's expression and rewords the diagnostics.
describe("fetchIdentifierDiagnostics", () => {
    const property = { metadata: { label: "Name", description: "" }, value: "", optional: false, editable: true };
    const check = (diagnostics: { message: string; severity: number }[]) => {
        const getExpressionDiagnostics = jest.fn().mockResolvedValue({ diagnostics });
        const rpcClient: any = { getBIDiagramRpcClient: () => ({ getExpressionDiagnostics }) };
        return { getExpressionDiagnostics, result: fetchIdentifierDiagnostics(rpcClient, {
            filePath: "main.bal", startLine: { line: 2, offset: 0 }, value: "check", property, label: "Variable Name",
        }) };
    };

    it("sends the name as the expression of the property at the given position", async () => {
        const { getExpressionDiagnostics, result } = check([]);
        expect(await result).toEqual({ first: undefined, firstError: undefined });
        expect(getExpressionDiagnostics).toHaveBeenCalledWith({
            filePath: "main.bal",
            context: {
                expression: "check", startLine: { line: 2, offset: 0 }, offset: 0, lineOffset: 0,
                codedata: undefined, property,
            },
        });
    });

    it("returns the first diagnostic and the first error, reworded", async () => {
        const { result } = check([
            { message: "unused variable", severity: 2 },
            { message: "`check` is a reserved keyword", severity: 1 },
        ]);
        expect(await result).toEqual({
            first: { message: "unused variable", severity: "WARNING" },
            firstError: {
                message: "'variable name' cannot be a reserved keyword. Please choose a different name.",
                severity: "ERROR",
            },
        });
    });
});

describe("fetchIdentifierDiagnostics node kind", () => {
    const property = { metadata: { label: "Name", description: "" }, value: "", optional: false, editable: true };
    const sendContext = async (nodeKind?: string, sourceForm?: boolean) => {
        const getExpressionDiagnostics = jest.fn().mockResolvedValue({ diagnostics: [] });
        const rpcClient: any = { getBIDiagramRpcClient: () => ({ getExpressionDiagnostics }) };
        await fetchIdentifierDiagnostics(rpcClient, {
            filePath: "config.bal", startLine: { line: 0, offset: 0 }, value: "issue-number", property, nodeKind,
            sourceForm,
        });
        return getExpressionDiagnostics.mock.calls[0][0].context;
    };
    const send = async (nodeKind?: string) => (await sendContext(nodeKind)).codedata;

    it("tells the language server a configurable name must be valid source", async () => {
        expect(await send("CONFIG_VARIABLE")).toEqual({ node: "CONFIG_VARIABLE" });
    });

    it("sends no node kind for other forms, whose names the language server escapes", async () => {
        expect(await send("VARIABLE")).toBeUndefined();
        expect(await send(undefined)).toBeUndefined();
    });

    it("marks a name whose writer puts it in the source as given", async () => {
        expect((await sendContext(undefined, true)).sourceFormName).toBe(true);
        expect((await sendContext("CONFIG_VARIABLE")).sourceFormName).toBe(true);
        expect((await sendContext("VARIABLE")).sourceFormName).toBeUndefined();
    });
});

describe("requiresSourceFormName", () => {
    it("is true for a marked field, a listener name and a configurable", () => {
        expect(requiresSourceFormName({ sourceFormName: true })).toBe(true);
        expect(requiresSourceFormName({ codedata: { type: "LISTENER_VAR_NAME" } })).toBe(true);
        expect(requiresSourceFormName({}, "CONFIG_VARIABLE")).toBe(true);
    });

    it("is false for other names, which the language server escapes", () => {
        expect(requiresSourceFormName({})).toBe(false);
        expect(requiresSourceFormName({ codedata: { type: "SERVICE_BASEPATH" } }, "VARIABLE")).toBe(false);
    });
});

describe("toEditableName", () => {
    it.each([
        ["issue\\-number", "issue-number"],
        ["'type", "type"],
        ["name", "name"],
        ["[a, b]", "[a, b]"],
        ["{a: x\\-y}", "{a: x\\-y}"],
        ["first\\ name", "first name"],
        ["a\\,b", "a,b"],
        ["a\\u{2D}b", "a-b"],
        ["[a\\u{2D}b, c]", "[a\\u{2D}b, c]"],
        ["[first\\ name, b]", "[first\\ name, b]"],
    ])("shows %p as %p", (value, expected) => {
        expect(toEditableName(value)).toBe(expected);
    });

    it("keeps the source form of a name edited in source form", () => {
        expect(toEditableName("'type", true)).toBe("'type");
        expect(toEditableName("issue\\-number", true)).toBe("issue\\-number");
    });

    // The plain form (`ab`, `a\b`) is valid source for another name, so an unchanged save would rename it
    it.each(["a\\\\b", "a\\u{5C}b", "a\\u{005c}b", "issue\\\\\\-number"])("keeps %p, which holds a literal backslash", (value) => {
        expect(toEditableName(value)).toBe(value);
    });
});

describe("map key fields", () => {
    // A map key is a field name, so the LS must not check it against the variables in scope:
    // a key `name` next to a `name` variable is valid (`{name: ...}`). The "Object" scope is
    // what makes IdentifierDiagnosticsRequest skip that check.
    it("INVARIANT: every map key field carries the Object scope", () => {
        const keyFields = [
            getMapKeyField("mp-key-1", "name"),
            getMapSubFormFieldFromTypes("2", [{ fieldType: "EXPRESSION", selected: true }])[0],
        ];
        for (const keyField of keyFields) {
            expect(keyField.type).toBe("IDENTIFIER");
            expect(keyField.types).toEqual([{ fieldType: "IDENTIFIER", scope: "Object", selected: true }]);
        }
    });
});
