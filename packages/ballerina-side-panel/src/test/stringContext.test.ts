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
    getHelperInsertionWrap,
    getStringContextAt,
    StringContext,
} from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/stringContext";
import { ExpressionModeEditorConfig } from "../components/editors/MultiModeExpressionEditor/Configurations";
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
        const { prefix, suffix } = new ExpressionModeEditorConfig().getHelperInsertionWrap(doc, pos);
        return doc.slice(0, pos) + prefix + value + suffix + doc.slice(pos);
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

    it("wrap agrees with getStringContextAt for every case", () => {
        const expected = { code: "", template: "${", string: '" + ' };
        for (const [marked, ctx] of CASES) {
            expect(getHelperInsertionWrap(...at(marked)).prefix).toBe(expected[ctx]);
        }
    });

    it("only Expression mode wraps; other modes own their own string handling", () => {
        for (const mode of Object.values(InputMode) as InputMode[]) {
            const wrap = getEditorConfiguration(mode).getHelperInsertionWrap('"|"', 1);
            expect(wrap.prefix !== "").toBe(mode === InputMode.EXP);
        }
    });
});
