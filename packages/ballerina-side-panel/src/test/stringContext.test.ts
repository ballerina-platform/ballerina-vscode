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

// L1: a helper-pane value inserted in Expression mode stays an expression wherever the cursor is.

import {
    composeHelperInsertion,
    getHelperInsertionWrap,
    getStringContextAt,
    NO_WRAP,
    StringContext,
} from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/stringContext";
import { ExpressionModeEditorConfig, RecordConfigExpressionEditorConfig } from "../components/editors/MultiModeExpressionEditor/Configurations";
import { getEditorConfiguration } from "../components/editors/ExpressionField";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";

// `|` marks the cursor.
const CASES: Array<[string, StringContext]> = [
    ["|", "code"],
    ["a + |", "code"],
    ['"|"', "string"],
    ['"Hello |world"', "string"],
    ['"Hello world"|', "code"],
    ['|"Hello"', "code"],
    ['"a \\" b |"', "string"],
    ['"a \\\\" + |', "code"],
    ['"a" + "b|"', "string"],
    ["string `Hi |`", "template"],
    ["`Hi ${|}`", "code"],
    ["`Hi ${name} |`", "template"],
    ["`Hi ${ {a: 1}.a } |`", "template"],
    ["`Hi ${\"x|\"}`", "string"],
    ["`Hi ${`inner |`}`", "template"],
    ["{a: \"|\"}", "string"],
    ["{a: 1}|", "code"],
    ["x // \"comment |", "code"],
    ["x // \"comment\n|", "code"],
    ["x // c\n\"|\"", "string"],
    // Inside an escape sequence: still the string, but the insert moves before it.
    ['"a\\|nb"', "string"],
    ['"a\\u{1F|600}b"', "string"],
    ['"a\\u{1F600}|b"', "string"],
];

const at = (marked: string): [string, number] => [marked.replace("|", ""), marked.indexOf("|")];

describe("getStringContextAt", () => {
    it.each(CASES)("%j -> %s", (marked, expected) => {
        expect(getStringContextAt(...at(marked))).toBe(expected);
    });
});

describe("helper insertion in Expression mode", () => {
    const insert = (marked: string, value: string) => {
        const [doc, pos] = at(marked);
        const wrap = new ExpressionModeEditorConfig().getHelperInsertionWrap(doc, pos);
        const { from, to, insert: text } = composeHelperInsertion({ from: pos, to: pos }, wrap, value);
        return doc.slice(0, from) + text + doc.slice(to);
    };

    it("leaves a value in code untouched", () => {
        expect(insert("a + |", "var2.name")).toBe("a + var2.name");
    });

    it("interpolates a value inside a template", () => {
        expect(insert("string `Hi |!`", "var2.name")).toBe("string `Hi ${var2.name}!`");
    });

    it("concatenates a value inside a string literal, which does not interpolate", () => {
        expect(insert('"Hi |!"', "var2.name")).toBe('"Hi " + var2.name + "!"');
    });

    it("never splits an escape sequence: the value goes in before it", () => {
        expect(insert('"a\\|nb"', "v")).toBe('"a" + v + "\\nb"');
        expect(insert('"a\\u{1F|600}b"', "v")).toBe('"a" + v + "\\u{1F600}b"');
        // Right after an escape is outside it.
        expect(insert('"a\\n|b"', "v")).toBe('"a\\n" + v + "b"');
    });

    it("wrap agrees with getStringContextAt for every case", () => {
        const expected = { code: "", template: "${", string: '" + ' };
        for (const [marked, ctx] of CASES) {
            expect(getHelperInsertionWrap(...at(marked)).prefix).toBe(expected[ctx]);
        }
    });

    it("the record editor wraps only inside a string field of the record literal", () => {
        // The minimized record field (RecordPreviewEditorConfig) has no helper pane, so it never inserts.
        const config = new RecordConfigExpressionEditorConfig();
        const wrapAt = (marked: string) => config.getHelperInsertionWrap(...at(marked));
        expect(wrapAt("{name: |}")).toEqual({ prefix: "", suffix: "" });
        expect(wrapAt('{name: "Anne", age: |}')).toEqual({ prefix: "", suffix: "" });
        expect(wrapAt('{name: "Hi |"}')).toEqual({ prefix: '" + ', suffix: ' + "' });
        expect(wrapAt("{name: string `Hi |`}")).toEqual({ prefix: "${", suffix: "}" });
    });

    it("getEditorConfiguration: only Expression mode wraps; other modes own their own string handling", () => {
        for (const mode of Object.values(InputMode) as InputMode[]) {
            const wrap = getEditorConfiguration(mode).getHelperInsertionWrap('"|"', 1);
            expect(wrap.prefix !== "").toBe(mode === InputMode.EXP);
        }
    });
});

describe("composeHelperInsertion", () => {
    // Applies an insertion to a doc and marks the resulting cursor with `|`.
    const apply = (marked: string, value: string, opts: { wrap?: boolean; argsCursorOffset?: number; fullText?: boolean } = {}) => {
        const [doc, pos] = at(marked);
        const selection = opts.fullText ? { from: 0, to: doc.length } : { from: pos, to: pos };
        const wrap = opts.wrap === false ? NO_WRAP : getHelperInsertionWrap(doc, selection.from);
        const { from, to, insert, cursor } = composeHelperInsertion(selection, wrap, value, opts.argsCursorOffset);
        const result = doc.slice(0, from) + insert + doc.slice(to);
        return result.slice(0, cursor) + "|" + result.slice(cursor);
    };

    it("puts a plain-source call's cursor inside its parentheses, past the wrap", () => {
        const argsCursorOffset = "getFullName(".length;
        expect(apply("a + |", "getFullName()", { argsCursorOffset })).toBe("a + getFullName(|)");
        expect(apply("string `Hi |!`", "getFullName()", { argsCursorOffset }))
            .toBe("string `Hi ${getFullName(|)}!`");
        expect(apply('"Hi |!"', "getFullName()", { argsCursorOffset }))
            .toBe('"Hi " + getFullName(|) + "!"');
    });

    it("lands after everything inserted, including the closing quote, when there are no arguments", () => {
        expect(apply('"Hi |!"', "name")).toBe('"Hi " + name + "|!"');
        expect(apply("string `Hi |`", "name")).toBe("string `Hi ${name}|`");
    });

    it("leaves a chip-mode call with $1/$2 placeholders unwrapped", () => {
        const value = "getFullName($1, $2)";
        expect(apply('"Hi |"', value, { wrap: false, argsCursorOffset: value.length }))
            .toBe('"Hi getFullName($1, $2)|"');
    });

    it("replaces the whole document on a full-text rewrite", () => {
        expect(apply('{name: "|"}', '{name: "Anne"}', { wrap: false, fullText: true })).toBe('{name: "Anne"}|');
    });

    it("moves out of an escape only for a collapsed cursor", () => {
        expect(apply('"a\\|nb"', "v")).toBe('"a" + v + "|\\nb"');
        const [doc] = at('"a\\|nb"');
        const wrap = getHelperInsertionWrap(doc, 3);
        expect(composeHelperInsertion({ from: 3, to: 5 }, wrap, "v")).toMatchObject({ from: 3, to: 5 });
    });
});
