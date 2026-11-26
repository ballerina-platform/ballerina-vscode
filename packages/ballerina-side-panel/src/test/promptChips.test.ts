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

import type { InputType } from "@wso2/ballerina-core";
import { EditorState as PMState } from "prosemirror-state";
import { EditorView as PMView } from "prosemirror-view";
import { EditorState, StateEffect } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { chipRemovalStart, createChipPlugin, createChipSchema } from "../components/editors/MultiModeExpressionEditor/RichTextTemplateEditor/plugins/chipPlugin";
import { createChip } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/CodeUtils";
import { TokenType } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { takesPrompt } from "../components/editors/RawExpressionEditor";

describe("chipRemovalStart", () => {
    const schema = createChipSchema();
    // "Hi " + chip + after; the chip sits at 4..5 inside the paragraph.
    const docWith = (after: string) => schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text("Hi "), schema.node("chip", { text: "${name}" }), ...(after ? [schema.text(after)] : [])]),
    ]);

    it("takes the space before a chip at the end of the text", () => {
        expect(chipRemovalStart(docWith(""), 4, 5)).toBe(3);
    });

    it("takes the space before a chip followed by punctuation", () => {
        expect(chipRemovalStart(docWith(", welcome"), 4, 5)).toBe(3);
    });

    it("keeps the space before a chip followed by a word", () => {
        expect(chipRemovalStart(docWith("welcome"), 4, 5)).toBe(4);
    });
});

describe("takesPrompt", () => {
    it("is true when a type's union includes ai:Prompt", () => {
        expect(takesPrompt([{ fieldType: "PROMPT", ballerinaType: "string|ai:Prompt" } as InputType])).toBe(true);
    });

    it("is false for a plain string prompt", () => {
        expect(takesPrompt([{ fieldType: "PROMPT", ballerinaType: "string" } as InputType])).toBe(false);
    });
});

describe("chips in a read-only editor", () => {
    const fire = (target: Element, type: string) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    // jsdom has no layout; the editors' own mouse handling asks for the element under the pointer.
    beforeAll(() => {
        document.elementFromPoint ??= () => null;
    });

    it("keep their text in a read-only prompt editor", () => {
        const schema = createChipSchema();
        const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("Hi "), schema.node("chip", { text: "${name}" })])]);
        const place = document.createElement("div");
        document.body.appendChild(place);
        const view = new PMView(place, { state: PMState.create({ doc, plugins: [createChipPlugin(schema)] }), editable: () => false });
        const chip = place.querySelector(".pm-chip")!;
        fire(chip.querySelector(".pm-chip-remove")!, "mousedown");
        fire(chip, "dblclick");
        expect(view.state.doc.eq(doc)).toBe(true);
        view.destroy();
        place.remove();
    });

    it("keep their text in a read-only expression editor", () => {
        const view = new EditorView({ state: EditorState.create({ doc: "Hi name", extensions: [EditorView.editable.of(false)] }), parent: document.body });
        const chips = Decoration.set([createChip("name", TokenType.VARIABLE, 3, 7, view).range(3, 7)]);
        view.dispatch({ effects: StateEffect.appendConfig.of(EditorView.decorations.of(chips)) });
        const span = view.dom.querySelector("[data-chip-widget]")!;
        const selection = view.state.selection;
        fire(span.querySelector(".cm-chip-remove")!, "click");
        fire(span, "dblclick");
        expect(view.state.doc.toString()).toBe("Hi name");
        expect(view.state.selection.eq(selection)).toBe(true);
        view.destroy();
    });
});
