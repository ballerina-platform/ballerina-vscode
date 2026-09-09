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

// L1 regression test for issue #2307: switching a FLAG (boolean) field to
// Expression mode crashed because the raw JS boolean form value was handed to
// the CodeMirror-backed chip editor, whose doc/insert APIs require a string
// (EditorState.create({ doc: <boolean> }) throws).

import React from "react";
import { render } from "@testing-library/react";
import type { FormField } from "../components/Form/types";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { coerceChipEditorValue } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/utils";

// Capture whatever value each mount site passes to the chip editor.
const chipValues: unknown[] = [];
jest.mock(
    "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/components/ChipExpressionEditor",
    () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const react = require("react");
        return {
            __esModule: true,
            ChipExpressionEditorComponent: (props: any) => {
                chipValues.push(props.value);
                return react.createElement("div", {
                    "data-testid": "ChipExpressionEditorComponent",
                    "data-value": String(props.value),
                });
            },
        };
    }
);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ExpressionField } = require("../components/editors/ExpressionField");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ExpressionMode } = require("../components/editors/ExpandedEditor/modes/ExpressionMode");

const autoDeleteMessagesField = (value: any): FormField =>
    ({
        key: "autoDeleteMessages",
        label: "Auto Delete Messages",
        type: "FLAG",
        types: [{ fieldType: "FLAG" }, { fieldType: "EXPRESSION" }],
        value,
        optional: true,
        editable: true,
        enabled: true,
    } as unknown as FormField);

const renderInlineEditor = (value: any) =>
    render(
        <ExpressionField
            field={autoDeleteMessagesField(value)}
            inputMode={InputMode.EXP}
            primaryMode={InputMode.BOOLEAN}
            name="autoDeleteMessages"
            value={value}
            completions={[]}
            onChange={() => {}}
            isHelperPaneOpen={false}
            changeHelperPaneState={() => {}}
            onToggleHelperPane={() => {}}
            exprRef={React.createRef()}
            anchorRef={React.createRef()}
        />
    );

const renderExpandedEditor = (value: any) =>
    render(
        <ExpressionMode
            value={value}
            onChange={() => {}}
            field={autoDeleteMessagesField(value)}
            completions={[]}
        />
    );

describe("coerceChipEditorValue (issue #2307 fix)", () => {
    it.each([
        ["boolean true", true, "true"],
        ["boolean false", false, "false"],
        ["number", 42, "42"],
    ])("coerces a non-string %s to a string", (_desc, value, expected) => {
        const result = coerceChipEditorValue(value);
        expect(typeof result).toBe("string");
        expect(result).toBe(expected);
    });

    it.each([
        ["a string expression", "check foo()"],
        ["an empty string", ""],
    ])("passes %s through unchanged", (_desc, value) => {
        expect(coerceChipEditorValue(value)).toBe(value);
    });

    it.each([
        ["null", null],
        ["undefined", undefined],
    ])("leaves %s as-is (never coerced to a string)", (_desc, value) => {
        expect(coerceChipEditorValue(value)).toBe(value);
    });
});

describe("Boolean-to-expression mount sites funnel through ChipExpressionEditorComponent", () => {
    beforeEach(() => {
        chipValues.length = 0;
    });

    // Both mount sites must render without throwing for a raw FLAG boolean, and
    // both must delegate the value to the single ChipExpressionEditorComponent
    // that applies coerceChipEditorValue. The earlier inline-only fix left the
    // expanded site (below) unguarded.
    it.each([
        ["inline editor (ExpressionField)", renderInlineEditor],
        ["expanded editor (ExpressionMode)", renderExpandedEditor],
    ])("%s hands a raw boolean to the chip editor without crashing", (_desc, renderFn) => {
        expect(() => renderFn(false)).not.toThrow();
        expect(chipValues).toHaveLength(1);
        expect(chipValues.at(-1)).toBe(false);
    });
});
