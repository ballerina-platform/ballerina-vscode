/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import {
    tableEditing,
    columnResizing,
    goToNextCell,
    fixTables,
    addColumnBefore,
    addColumnAfter,
    deleteColumn,
    addRowBefore,
    addRowAfter,
    deleteRow,
    deleteTable,
    CellSelection
} from "prosemirror-tables";
import { keymap } from "prosemirror-keymap";
import { EditorState, NodeSelection } from "prosemirror-state";

// Backspace/Delete on selected rows, columns or the whole table removes them.
// When cursor is adjacent to a table, first press selects it, second deletes it.
export const handleTableDelete = (state: EditorState, dispatch?: (tr: any) => void): boolean => {
    const sel = state.selection;

    // Check for CellSelection by constructor name (bundling can rename the class)
    const isCellSel = sel instanceof CellSelection ||
        sel.constructor.name === "_CellSelection" ||
        sel.constructor.name === "CellSelection";

    // Whole rows or columns go; a partial selection falls through so tableEditing() clears the cells.
    if (isCellSel) {
        const cellSel = sel as CellSelection;
        const fullRows = cellSel.isRowSelection();
        const fullCols = cellSel.isColSelection();
        if (fullRows && fullCols) {
            return deleteTable(state, dispatch);
        }
        if (fullRows) {
            return deleteRow(state, dispatch);
        }
        if (fullCols) {
            return deleteColumn(state, dispatch);
        }
        return false;
    }

    // If a table node is already selected (via NodeSelection), delete it
    const isNodeSel = sel instanceof NodeSelection ||
        sel.constructor.name === "_NodeSelection" ||
        sel.constructor.name === "NodeSelection";
    if (isNodeSel && (sel as any).node?.type.name === "table") {
        if (dispatch) {
            dispatch(state.tr.deleteSelection().scrollIntoView());
        }
        return true;
    }

    // If cursor is inside a table and the current cell is empty, select the table
    if (isInTable(state) && sel.empty) {
        const { $from } = sel;
        for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (node.type.name === "table_cell" || node.type.name === "table_header") {
                if (node.textContent.length === 0) {
                    for (let td = d - 1; td >= 0; td--) {
                        if ($from.node(td).type.name === "table") {
                            if (dispatch) {
                                const tablePos = $from.before(td);
                                dispatch(state.tr.setSelection(
                                    NodeSelection.create(state.doc, tablePos)
                                ).scrollIntoView());
                            }
                            return true;
                        }
                    }
                }
                break;
            }
        }
        return false;
    }

    // If cursor is right after a table, select the table node
    if (sel.empty && !isInTable(state)) {
        const { $from } = sel;
        // A gap cursor after a top-level table sits at depth 0, which has no position before it.
        const posBefore = $from.depth > 0 ? $from.before($from.depth) : $from.pos;
        if (posBefore > 0) {
            const nodeBefore = state.doc.resolve(posBefore).nodeBefore;
            if (nodeBefore && nodeBefore.type.name === "table") {
                if (dispatch) {
                    const tablePos = posBefore - nodeBefore.nodeSize;
                    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, tablePos)).scrollIntoView());
                }
                return true;
            }
        }
    }

    return false;
};

export function createTablePlugins() {
    return [
        columnResizing(),
        // Table delete keymap must come BEFORE tableEditing() which has its own
        // Backspace handler that clears cell content instead of deleting the table
        keymap({
            "Backspace": handleTableDelete,
            "Delete": handleTableDelete,
        }),
        tableEditing(),
        keymap({
            "Tab": goToNextCell(1),
            "Shift-Tab": goToNextCell(-1),
        })
    ];
}

export const insertTable = (rows: number, cols: number) => {
    return (state: EditorState, dispatch?: (tr: any) => void): boolean => {
        const { table, table_row, table_cell, table_header } = state.schema.nodes;
        // Inside a cell the table would split the one around it; Markdown has no nested tables.
        if (!table || !table_row || !table_cell || !table_header || isInTable(state)) return false;

        const headerCells = [];
        for (let j = 0; j < cols; j++) {
            headerCells.push(table_header.createAndFill({ alignment: null })!);
        }
        const headerRow = table_row.create(null, headerCells);

        const bodyRows = [];
        for (let i = 1; i < rows; i++) {
            const cells = [];
            for (let j = 0; j < cols; j++) {
                cells.push(table_cell.createAndFill({ alignment: null })!);
            }
            bodyRows.push(table_row.create(null, cells));
        }

        const tableNode = table.create(null, [headerRow, ...bodyRows]);

        if (dispatch) {
            const tr = state.tr.replaceSelectionWith(tableNode);
            dispatch(tr.scrollIntoView());
        }
        return true;
    };
};

export function isInTable(state: EditorState): boolean {
    const $from = state.selection.$from;
    for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === "table") {
            return true;
        }
    }
    return false;
}

export {
    fixTables,
    addColumnBefore,
    addColumnAfter,
    deleteColumn,
    addRowBefore,
    addRowAfter,
    deleteRow,
    deleteTable
};
