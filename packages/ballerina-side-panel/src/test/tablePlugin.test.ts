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

import { EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { GapCursor } from "prosemirror-gapcursor";
import { CellSelection, TableMap } from "prosemirror-tables";
import { Node } from "prosemirror-model";
import { chipSchema } from "../components/editors/MultiModeExpressionEditor/RichTextTemplateEditor/plugins/chipPlugin";
import { handleTableDelete, insertTable } from "../components/editors/MultiModeExpressionEditor/RichTextTemplateEditor/plugins/tablePlugin";

const { doc, paragraph, table, table_row, table_header, table_cell } = chipSchema.nodes;
const cell = (type: typeof table_cell, text: string) => type.create(null, paragraph.create(null, chipSchema.text(text)));
const grid = () => table.create(null, [0, 1, 2].map((r) =>
    table_row.create(null, [0, 1, 2].map((c) => cell(r === 0 ? table_header : table_cell, `${r}${c}`)))));

const tableAt = (state: EditorState) => {
    let found: { node: Node; pos: number } | undefined;
    state.doc.descendants((node, pos) => {
        if (!found && node.type === table) found = { node, pos };
        return !found;
    });
    return found;
};
const selectCells = (state: EditorState, from: [number, number], to: [number, number]) => {
    const { node, pos } = tableAt(state)!;
    const map = TableMap.get(node);
    const at = ([r, c]: [number, number]) => pos + 1 + map.map[r * map.width + c];
    return state.apply(state.tr.setSelection(CellSelection.create(state.doc, at(from), at(to))));
};
const run = (state: EditorState) => {
    let next = state;
    const handled = handleTableDelete(state, (tr: Transaction) => { next = state.apply(tr); });
    return { handled, next };
};
const shape = (state: EditorState) => {
    const found = tableAt(state);
    return found ? `${found.node.childCount}x${found.node.firstChild!.childCount}` : "none";
};

describe("table delete keys", () => {
    const start = () => EditorState.create({ doc: doc.create(null, [paragraph.create(null, chipSchema.text("intro")), grid()]) });

    it("deletes a fully selected row, even in a square table", () => {
        const { handled, next } = run(selectCells(start(), [1, 0], [1, 2]));
        expect(handled).toBe(true);
        expect(shape(next)).toBe("2x3");
    });

    it("deletes a fully selected column", () => {
        const { handled, next } = run(selectCells(start(), [0, 1], [2, 1]));
        expect(handled).toBe(true);
        expect(shape(next)).toBe("3x2");
    });

    it("deletes the table when every cell is selected", () => {
        expect(shape(run(selectCells(start(), [0, 0], [2, 2])).next)).toBe("none");
    });

    it("leaves a partial selection to the default cell clear", () => {
        expect(run(selectCells(start(), [0, 0], [1, 1])).handled).toBe(false);
    });

    it("selects a table from a gap cursor after it without throwing", () => {
        const state = start();
        const end = state.doc.content.size;
        const gap = state.apply(state.tr.setSelection(new GapCursor(state.doc.resolve(end))));
        const { handled, next } = run(gap);
        expect(handled).toBe(true);
        expect(next.selection instanceof NodeSelection && next.selection.node.type).toBe(table);
    });
});

describe("insertTable", () => {
    it("does nothing while the cursor is inside a table", () => {
        const state = EditorState.create({ doc: doc.create(null, [grid()]) });
        const inCell = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));
        expect(insertTable(3, 3)(inCell)).toBe(false);
    });

    it("keeps tables out of table cells", () => {
        expect(table_cell.contentMatch.matchType(table)).toBeNull();
    });
});
