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

import { EditorState } from "@codemirror/state";
import { NumberExpressionEditorConfig } from "../components/editors/MultiModeExpressionEditor/Configurations";

const edit = (doc: string, from: number, to: number, insert: string, onRejectedInput?: () => void) =>
    EditorState.create({ doc, extensions: new NumberExpressionEditorConfig(onRejectedInput).getPlugins() })
        .update({ changes: { from, to, insert } }).state.doc.toString();

describe("Number editor input filter", () => {
    it("takes digits and one decimal point", () => {
        expect(edit("12", 2, 2, "3")).toBe("123");
        expect(edit("1.5", 3, 3, ".")).toBe("1.5");
        expect(edit("12", 2, 2, "a")).toBe("12");
        expect(edit("", 0, 0, "-")).toBe("-");
        expect(edit("-", 1, 1, "5")).toBe("-5");
    });

    it("reports a keystroke it refuses, so the field can say why", () => {
        const rejected = jest.fn();
        edit("12", 2, 2, "a", rejected);
        edit("12", 2, 2, "3", rejected);
        expect(rejected).toHaveBeenCalledTimes(1);
    });

    it("lets a value that is not a number be deleted", () => {
        expect(edit("someNum", 6, 7, "")).toBe("someNu");
        expect(edit("someNum", 0, 7, "")).toBe("");
        expect(edit("someNum", 0, 7, "5")).toBe("5");
    });
});
