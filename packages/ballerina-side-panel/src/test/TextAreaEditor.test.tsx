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

// L2 (P0): TextAreaEditor (STRING/TEXTAREA/DOC_TEXT) behaviour (docs/TEST_BACKLOG.md
// L2-04). Renders the real editor via formHarness and asserts it exposes an editable
// text control seeded from the model value (incl. multi-line), labelled for a11y, and
// respects read-only. (#1513/#200 class: multi-line string input in forms.)

import React from "react";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import type { FormField } from "../components/Form/types";
import { renderWithForm } from "./formHarness";
import { TextAreaEditor } from "../components/editors/TextAreaEditor";

const stringField = (value: string, overrides: Partial<any> = {}): FormField =>
    ({
        key: "description",
        label: "Description",
        type: "STRING",
        value,
        optional: true,
        editable: true,
        enabled: true,
        documentation: "",
        placeholder: "",
        ...overrides,
    } as unknown as FormField);

function textarea(container: HTMLElement): HTMLTextAreaElement {
    // AutoResizeTextArea renders a <vscode-text-area> wrapper around a real <textarea>
    // that carries the value/readOnly.
    const el = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!el) throw new Error("textarea not found");
    return el;
}

describe("TextAreaEditor", () => {
    it("renders a text control seeded from the model value", () => {
        const { container } = renderWithForm(
            <TextAreaEditor field={stringField("hello world")} inputMode={InputMode.SIMPLE_TEXT} />,
            { defaultValues: { description: "hello world" } }
        );
        expect(textarea(container).value).toBe("hello world");
    });

    it("INVARIANT: preserves multi-line content verbatim", () => {
        const multiline = "line one\nline two\nline three";
        const { container } = renderWithForm(
            <TextAreaEditor field={stringField(multiline)} inputMode={InputMode.SIMPLE_TEXT} />,
            { defaultValues: { description: multiline } }
        );
        expect(textarea(container).value).toBe(multiline);
    });

    it("renders read-only when the field is not editable", () => {
        const { container } = renderWithForm(
            <TextAreaEditor field={stringField("locked", { editable: false })} inputMode={InputMode.SIMPLE_TEXT} />,
            { defaultValues: { description: "locked" } }
        );
        expect(textarea(container).readOnly).toBe(true);
    });
});
