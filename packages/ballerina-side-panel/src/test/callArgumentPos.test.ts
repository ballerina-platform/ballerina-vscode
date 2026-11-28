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
import { EditorView } from "@codemirror/view";
import {
    callArgumentPos,
    chipPlugin,
    operandPadding,
    moveDraggedChip,
    tokenField,
    tokensChangeEffect,
} from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/CodeUtils";

describe("callArgumentPos", () => {
    const doc = "string:trim(name) + items.filter() + total";

    it("moves a drop on a call's name or opening parenthesis inside the parentheses", () => {
        expect(callArgumentPos(doc, 0)).toBe(12);
        expect(callArgumentPos(doc, 9)).toBe(12);
        expect(callArgumentPos(doc, 11)).toBe(12);
        expect(callArgumentPos(doc, doc.indexOf("filter"))).toBe(doc.indexOf("()") + 1);
    });

    it("moves a drop just after an empty call inside it", () => {
        expect(callArgumentPos(doc, doc.indexOf("()") + 2)).toBe(doc.indexOf("()") + 1);
    });

    it("leaves other positions alone", () => {
        expect(callArgumentPos(doc, 12)).toBe(12);
        expect(callArgumentPos(doc, doc.indexOf(")"))).toBe(doc.indexOf(")"));
        expect(callArgumentPos(doc, doc.indexOf("total"))).toBe(doc.indexOf("total"));
        expect(callArgumentPos(doc, doc.length)).toBe(doc.length);
        expect(callArgumentPos("total * (a + b)", 8)).toBe(8);
        expect(callArgumentPos("total * (a + b)", 9)).toBe(9);
    });

    it("moves a drop inside a word to the word's end", () => {
        expect(callArgumentPos("total + 1", 2)).toBe(5);
        expect(callArgumentPos("ord.items + 1", 1)).toBe(9);
        expect(callArgumentPos("string:trim(name)", doc.indexOf("am"))).toBe(16);
    });
});

describe("operandPadding", () => {
    it("separates a value placed first in a call's arguments with a comma", () => {
        expect(operandPadding("o(", "a")).toEqual(["", ", "]);
        expect(operandPadding("m:trim(", "name")).toEqual(["", ", "]);
    });

    it("adds no comma in an empty call or after a grouping parenthesis", () => {
        expect(operandPadding("o(", ")")).toEqual(["", ""]);
        expect(operandPadding(" (", "a")).toEqual(["", " "]);
        expect(operandPadding("(", "a")).toEqual(["", " "]);
    });

    it("spaces a value from the operands beside it", () => {
        expect(operandPadding("a", "b")).toEqual([" ", " "]);
        expect(operandPadding("+ ", " ")).toEqual(["", ""]);
    });
});

describe("moveDraggedChip", () => {
    const dragChipTo = (doc: string, chipIndex: number, target: number) => {
        const view = new EditorView({
            state: EditorState.create({ doc, extensions: [tokenField, chipPlugin] }),
            parent: document.body,
        });
        // Variable tokens for "ord.items" (0-9) and "ord.id" (24-30).
        view.dispatch({ effects: tokensChangeEffect.of({ tokens: [0, 0, 9, 0, 0, 0, 24, 6, 0, 0] }) });
        const chips = view.dom.querySelectorAll("[data-chip-widget]");
        chips[chipIndex].dispatchEvent(new Event("dragstart"));
        view.posAtCoords = (() => target) as typeof view.posAtCoords;
        const moved = moveDraggedChip(view, { clientX: 0, clientY: 0, preventDefault: () => undefined } as DragEvent);
        const result = view.state.doc.toString();
        view.destroy();
        return { moved, result };
    };

    it("moves a chip dropped on a call's name into its arguments", () => {
        expect(dragChipTo("ord.items + string:trim(ord.id)", 0, 15)).toEqual({
            moved: true,
            result: " + string:trim(ord.items, ord.id)",
        });
    });

    it("moves a chip after a grouping parenthesis without a comma", () => {
        expect(dragChipTo("ord.items + (a + bcd) + ord.id", 0, 13).result).toBe(" + (ord.items a + bcd) + ord.id");
    });

    it("moves a chip to another place in the field", () => {
        expect(dragChipTo("ord.items + string:trim(ord.id)", 1, 0).result).toBe("ord.id ord.items + string:trim()");
    });

    it("leaves another field alone when its chip is dropped there", () => {
        const field = (doc: string) => new EditorView({
            state: EditorState.create({ doc, extensions: [tokenField, chipPlugin] }),
            parent: document.body,
        });
        const source = field("ord.items + string:trim(ord.id)");
        source.dispatch({ effects: tokensChangeEffect.of({ tokens: [0, 0, 9, 0, 0, 0, 24, 6, 0, 0] }) });
        const target = field("session-0123456789-abcdefghij");
        const chip = source.dom.querySelectorAll("[data-chip-widget]")[1];
        chip.dispatchEvent(new Event("dragstart"));
        target.posAtCoords = (() => target.state.doc.length) as typeof target.posAtCoords;
        expect(moveDraggedChip(target, { clientX: 0, clientY: 0, preventDefault: () => undefined } as DragEvent)).toBe(false);
        expect(target.state.doc.toString()).toBe("session-0123456789-abcdefghij");
        chip.dispatchEvent(new Event("dragend"));
        source.destroy();
        target.destroy();
    });

    it("leaves the value alone when dropped on itself", () => {
        expect(dragChipTo("ord.items + string:trim(ord.id)", 0, 4).result).toBe("ord.items + string:trim(ord.id)");
    });

    it("ignores drops that did not start on a chip", () => {
        const view = new EditorView({ state: EditorState.create({ doc: "a" }), parent: document.body });
        expect(moveDraggedChip(view, {} as DragEvent)).toBe(false);
        view.destroy();
    });
});
