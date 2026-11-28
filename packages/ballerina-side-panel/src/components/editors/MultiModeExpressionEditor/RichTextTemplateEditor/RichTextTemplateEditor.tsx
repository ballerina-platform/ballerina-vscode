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

import React, { useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import { baseKeymap } from "prosemirror-commands";
import { gapCursor } from "prosemirror-gapcursor";
import { splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list";
import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownParser, MarkdownSerializer } from "prosemirror-markdown";
import markdownit from "markdown-it";
import { ThemeColors, CompletionItem, FnSignatureDocumentation, HelperPaneHeight } from "@wso2/ui-toolkit";
import { LineRange } from "@wso2/ballerina-core/lib/interfaces/common";
import { HelperpaneOnChangeOptions } from "../../../Form/types";
import { useFormContext } from "../../../../context/form";
import { chipRemovalStart, createChipPlugin, createChipSchema, updateChipTokens } from "./plugins/chipPlugin";
import { clearDropCursor, createDropCursorPlugin, NEW_LINE } from "./plugins/dropCursorPlugin";
import { createXMLTagDecorationPlugin } from "./plugins/xmlTagDecorationPlugin";
import { createPlaceholderPlugin } from "./plugins/placeholderPlugin";
import { createTablePlugins, fixTables } from "./plugins/tablePlugin";
import { registerTableCellParagraphRule } from "./utils/tableUtils";
import { FIELD_BORDER, FIELD_RADIUS } from "../ChipExpressionEditor/constants";
import { HelperPane } from "../ChipExpressionEditor/components/HelperPane";
import {
    toggleBold,
    toggleItalic,
    toggleHeading,
    toggleBlockquote,
    toggleBulletList,
    toggleOrderedList,
    handleMarkdownShortcutEnter,
    createMarkdownInputRulesPlugin,
    exitInlineCodeOnArrowRight,
    exitBlockOnArrowDown
} from "./plugins/markdownCommands";
import { HELPER_PANE_WIDTH } from "../ChipExpressionEditor/constants";
import { calculateHelperPanePosition, isInsideInterpolation, processFunctionWithArguments } from "../ChipExpressionEditor/utils";
import { callArgumentPos, operandPadding } from "../ChipExpressionEditor/CodeUtils";
import { useHelperPaneClickOutside, useHelperPane } from "../ChipExpressionEditor/hooks/useHelperPane";
import { ChipExpressionEditorDefaultConfiguration } from "../ChipExpressionEditor/ChipExpressionDefaultConfig";
import { useInsertTarget } from "../../../../context/insertTarget";

const isInCode = (view: EditorView, pos: number) => isInsideInterpolation(view.state.doc.textBetween(0, pos));

// A drop inside an interpolation lands inside a call's parentheses; in prose it lands after the word under the pointer.
const placeDrop = (view: EditorView, pos: number): number => {
    const { doc } = view.state;
    const $pos = doc.resolve(pos);
    const after = $pos.nodeAfter?.isText ? $pos.nodeAfter.text : "";
    const before = $pos.nodeBefore?.isText ? $pos.nodeBefore.text : "";
    if (isInCode(view, pos)) {
        return pos + callArgumentPos(before + after, before.length) - before.length;
    }
    return /\w$/.test(before) ? pos + (/^\w*/.exec(after)?.[0].length ?? 0) : pos;
};

// Below the last line, a drop starts a new line.
const dropTarget = (view: EditorView, event: MouseEvent): number | null => {
    if (event.clientY > (view.dom.lastElementChild?.getBoundingClientRect().bottom ?? Infinity)) {
        return NEW_LINE;
    }
    const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
    return hit ? placeDrop(view, hit.pos) : null;
};

// Keeps an inserted value from running into the word or value beside it.
const neighbourSpaces = (view: EditorView, from: number, to: number): [string, string] => {
    const { doc } = view.state;
    const before = doc.textBetween(Math.max(0, from - 2), from);
    const after = doc.textBetween(to, Math.min(doc.content.size, to + 1));
    if (isInCode(view, from)) {
        return operandPadding(before, after);
    }
    return [/[^\s([{"'`]$/.test(before) ? " " : "", /[\w$]/.test(after) ? " " : ""];
};

// The dragged slice shares its node with the document, which gives the drag's source range.
const findNode = (view: EditorView, target: unknown): { from: number; to: number } | undefined => {
    let found: { from: number; to: number } | undefined;
    view.state.doc.descendants((node, pos) => {
        if (node === target) {
            found = { from: pos, to: pos + node.nodeSize };
        }
        return !found;
    });
    return found;
};

// A chip moved inside an interpolation drops its own ${…}, and lands spaced from its neighbours.
const moveDraggedChip = (view: EditorView, event: DragEvent): boolean => {
    const chip = view.dragging?.slice.content.firstChild;
    const source = chip && findNode(view, chip);
    const target = dropTarget(view, event);
    if (!view.dragging?.move || chip?.type.name !== "chip" || !source || target === null) {
        return false;
    }
    event.preventDefault();
    // ProseMirror's own drop clears this; the source chip is removed before its dragend can.
    view.dragging = null;
    if (target >= source.from && target <= source.to) {
        return true;
    }
    const { schema } = view.state;
    const tr = (view.state.tr as any).delete(chipRemovalStart(view.state.doc, source.from, source.to), source.to);
    if (target === NEW_LINE) {
        view.dispatch(tr.insert(tr.doc.content.size, schema.nodes.paragraph.create(null, chip)));
        view.focus();
        return true;
    }
    const [before, after] = neighbourSpaces(view, target, target);
    const code = /^\$\{([\s\S]*)\}$/.exec(chip.attrs.text)?.[1];
    const moved = isInCode(view, target) && code ? schema.text(code) : chip;
    const nodes = [before && schema.text(before), moved, after && schema.text(after)].filter(Boolean);
    view.dispatch(tr.insert(tr.mapping.map(target), nodes));
    view.focus();
    return true;
};

const EditorContainer = styled.div<{ readOnly?: boolean }>`
    flex: 1;
    overflow: auto;
    border: 1px solid var(--field-changed-border, ${FIELD_BORDER});
    border-radius: 0 0 ${FIELD_RADIUS} ${FIELD_RADIUS};
    border-top: none;
    background-color: var(--field-changed-background, var(--vscode-input-background));
    position: relative;

    .ProseMirror {
        padding: 8px 12px;
        outline: none;
        min-height: 100%;
        font-family: var(--vscode-font-family);
        font-size: 13px;
        color: ${ThemeColors.ON_SURFACE};
        line-height: 1.6;
        ${props => props.readOnly && 'cursor: default;'}
    }

    .ProseMirror p {
        margin: 0.5em 0;
    }

    .ProseMirror .pm-drop-cursor {
        display: inline-block;
        width: 0;
        height: 1.2em;
        margin-left: -1px;
        border-left: 2px solid ${ThemeColors.ON_SURFACE};
        vertical-align: text-bottom;
        pointer-events: none;
    }

    .ProseMirror h1,
    .ProseMirror h2,
    .ProseMirror h3,
    .ProseMirror h4,
    .ProseMirror h5,
    .ProseMirror h6 {
        margin: 0.5em 0;
        font-weight: 600;
    }

    .ProseMirror h1 { font-size: 2em; }
    .ProseMirror h2 { font-size: 1.5em; }
    .ProseMirror h3 { font-size: 1.25em; }

    .ProseMirror ul,
    .ProseMirror ol {
        margin: 0.5em 0;
        padding-left: 2em;
    }

    .ProseMirror blockquote {
        margin: 1em 0;
        padding-left: 1em;
        padding-top: 0.1em;
        padding-bottom: 0.1em;
        border-left: 3px solid ${ThemeColors.PRIMARY};
        color: ${ThemeColors.ON_SURFACE_VARIANT};
    }

    .ProseMirror code {
        background: ${ThemeColors.SURFACE_BRIGHT};
        padding: 2px 4px;
        border-radius: 3px;
        font-family: var(--vscode-editor-font-family);
        font-size: 0.9em;
    }

    .ProseMirror pre {
        background: ${ThemeColors.SURFACE_BRIGHT};
        padding: 8px;
        border-radius: 3px;
        overflow-x: auto;
    }

    .ProseMirror pre code {
        background: none;
        padding: 0;
    }

    .ProseMirror hr {
        margin: 1.5em 0;
        border: none;
        border-top: 1.5px solid var(--vscode-foreground);
    }

    .ProseMirror .tableWrapper {
        overflow-x: auto;
        margin: 0.5em 0;
    }

    .ProseMirror table {
        border-collapse: collapse;
        width: auto;
        table-layout: fixed;
    }

    .ProseMirror th,
    .ProseMirror td {
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        padding: 6px 12px;
        position: relative;
        vertical-align: top;
        min-width: 60px;
    }

    .ProseMirror th {
        font-weight: 600;
        background-color: ${ThemeColors.SURFACE_BRIGHT};
        text-align: left;
    }

    .ProseMirror th p,
    .ProseMirror td p {
        margin: 0;
    }

    .ProseMirror .selectedCell {
        background-color: color-mix(in srgb, ${ThemeColors.PRIMARY} 15%, transparent);
    }

    .ProseMirror .column-resize-handle {
        position: absolute;
        right: -2px;
        top: 0;
        bottom: 0;
        width: 4px;
        background-color: ${ThemeColors.PRIMARY};
        pointer-events: none;
    }

    .ProseMirror.resize-cursor {
        cursor: col-resize;
    }

    .ProseMirror .xml-tag,
    .ProseMirror .xml-tag-opening,
    .ProseMirror .xml-tag-closing,
    .ProseMirror .xml-tag-selfClosing {
        color: var(--vscode-charts-green);
    }

    .ProseMirror .placeholder {
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        opacity: 0.6;
        pointer-events: none;
        position: absolute;
        top: 14px;
        left: 12px;
    }
`;

const markdownTokenizer = markdownit("commonmark", { html: false }).disable(["autolink", "html_inline", "html_block"]).enable("table");
registerTableCellParagraphRule(markdownTokenizer);

// Helper function to sanitize text by removing invisible characters
const sanitizeText = (text: string): string => {
    return text
        .replace(/\u00A0/g, ' ')  // Replace non-breaking spaces with regular spaces
        .replace(/\u200B/g, '')   // Remove zero-width spaces
        .replace(/\u200C/g, '')   // Remove zero-width non-joiners
        .replace(/\u200D/g, '')   // Remove zero-width joiners
        .replace(/\uFEFF/g, '');  // Remove zero-width no-break spaces
};

// Create chip schema once
const chipSchema = createChipSchema();

export const customMarkdownParser = new MarkdownParser(
    chipSchema,
    markdownTokenizer,
    {
        ...defaultMarkdownParser.tokens,
        table: { block: "table" },
        thead: { ignore: true },
        tbody: { ignore: true },
        tr: { block: "table_row" },
        th: {
            block: "table_header",
            getAttrs: (tok: any) => ({ alignment: tok.info || null })
        },
        td: {
            block: "table_cell",
            getAttrs: (tok: any) => ({ alignment: tok.info || null })
        }
    }
);

// Serialize a single table cell's inline content to a string
function serializeCellContent(cell: any): string {
    const tempSerializer = new MarkdownSerializer(
        {
            ...defaultMarkdownSerializer.nodes,
            chip(state: any, node: any) {
                state.text(node.attrs.text, false);
            }
        },
        defaultMarkdownSerializer.marks
    );
    const output = tempSerializer.serialize(cell);
    // Flatten to single line and trim
    return output.replace(/\n/g, " ").trim();
}

// Create custom serializer that handles chip nodes and tables
export const customMarkdownSerializer = new MarkdownSerializer(
    {
        ...defaultMarkdownSerializer.nodes,
        chip(state: any, node: any) {
            // Serialize chip nodes back to their original text
            state.text(node.attrs.text, false);
        },
        table(state: any, node: any) {
            const rows: string[][] = [];
            const alignments: (string | null)[] = [];

            node.forEach((row: any, _offset: number, rowIndex: number) => {
                const cells: string[] = [];
                row.forEach((cell: any) => {
                    const cellText = serializeCellContent(cell).replace(/\|/g, "\\|");
                    cells.push(cellText);

                    // Capture alignment from header row
                    if (rowIndex === 0) {
                        alignments.push(cell.attrs.alignment || null);
                    }
                });
                rows.push(cells);
            });

            // Compute column widths
            const colCount = Math.max(...rows.map(r => r.length));
            const colWidths = Array(colCount).fill(3);
            for (const row of rows) {
                for (let i = 0; i < row.length; i++) {
                    colWidths[i] = Math.max(colWidths[i], row[i].length);
                }
            }

            // Ensure blank line before table
            state.flushClose(1);
            if (state.out && !state.out.endsWith("\n\n")) {
                state.out += state.out.endsWith("\n") ? "\n" : "\n\n";
            }

            // Output header row
            state.out += "| " + rows[0].map((c: string, i: number) => c.padEnd(colWidths[i])).join(" | ") + " |\n";

            // Output separator row with alignment markers
            const sep = alignments.map((a, i) => {
                const w = colWidths[i];
                if (a === "center") return ":" + "-".repeat(w) + ":";
                if (a === "left") return ":" + "-".repeat(w + 1);
                if (a === "right") return "-".repeat(w + 1) + ":";
                return "-".repeat(w + 2);
            });
            state.out += "| " + sep.join(" | ") + " |\n";

            // Output body rows
            for (let i = 1; i < rows.length; i++) {
                const paddedCells = rows[i].map((c: string, j: number) => c.padEnd(colWidths[j] || 3));
                // Pad row if it has fewer cells than header
                while (paddedCells.length < colCount) {
                    paddedCells.push(" ".repeat(colWidths[paddedCells.length] || 3));
                }
                state.out += "| " + paddedCells.join(" | ") + " |\n";
            }

            state.closeBlock(node);
        },
        table_row() { /* handled inside table serializer */ },
        table_cell() { /* handled inside table serializer */ },
        table_header() { /* handled inside table serializer */ },
    },
    defaultMarkdownSerializer.marks
);

interface RichTextTemplateEditorProps {
    value: string;
    onChange?: (value: string, cursorPosition: number) => void;
    completions?: CompletionItem[];
    placeholder?: string;
    fileName?: string;
    targetLineRange?: LineRange;
    configuration: ChipExpressionEditorDefaultConfiguration;
    extractArgsFromFunction?: (value: string, cursorPosition: number) => Promise<{
        label: string;
        args: string[];
        currentArgIndex: number;
        documentation?: FnSignatureDocumentation;
    }>;
    getHelperPane?: (
        value: string,
        onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
        helperPaneHeight: HelperPaneHeight
    ) => React.ReactNode;
    onEditorViewReady?: (view: EditorView) => void;
    onHelperPaneStateChange?: (state: {
        isOpen: boolean;
        ref: React.RefObject<HTMLButtonElement>;
        toggle: () => void;
    }) => void;
    readOnly?: boolean;
}

export const RichTextTemplateEditor: React.FC<RichTextTemplateEditorProps> = ({
    value,
    onChange,
    placeholder,
    fileName,
    targetLineRange,
    configuration,
    onEditorViewReady,
    getHelperPane,
    onHelperPaneStateChange,
    extractArgsFromFunction,
    readOnly = false,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const helperPaneRef = useRef<HTMLDivElement>(null);
    const helperPaneToggleButtonRef = useRef<HTMLButtonElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const pendingTokenFetchRef = useRef(false);
    const readOnlyRef = useRef(readOnly);
    readOnlyRef.current = readOnly;

    const { expressionEditor } = useFormContext();
    const rpcManager = expressionEditor?.rpcManager;

    // Helper pane state management with fixed placement for toolbar button
    const { helperPaneState, setHelperPaneState, handleKeyboardToggle } = useHelperPane(
        {
            editorRef,
            toggleButtonRef: helperPaneToggleButtonRef,
            helperPaneWidth: HELPER_PANE_WIDTH,
            onStateChange: onHelperPaneStateChange,
            customManualToggle: (setHelperPaneState) => {
                if (!editorRef?.current || !viewRef.current) return;

                setHelperPaneState(prev => {
                    if (prev.isOpen) {
                        return { ...prev, isOpen: false };
                    }

                    const scrollTop = editorRef.current!.scrollTop || 0;
                    return { isOpen: true, top: scrollTop, left: 10 };
                });
            }
        },
        () => {
            const view = viewRef.current;
            if (!view) return null;
            const cursorPos = view.state.selection.$head.pos;
            return view.coordsAtPos(cursorPos) || null;
        }
    );

    // Handle chip click to show helper pane
    const handleChipClick = (event: MouseEvent, chipPos: number, chipNode: any) => {
        if (!viewRef.current || !editorRef.current) return;

        const target = event.target as HTMLElement;
        const chipElement = target.closest('.pm-chip') as HTMLElement;
        if (!chipElement) return;

        const chipRect = chipElement.getBoundingClientRect();
        const editorRect = editorRef.current.getBoundingClientRect();

        // Get the scroll position from the editor container
        const scrollTop = editorRef.current.scrollTop || 0;

        const position = calculateHelperPanePosition(chipRect, editorRect, HELPER_PANE_WIDTH, scrollTop);

        setHelperPaneState({
            isOpen: true,
            ...position,
            clickedChipPos: chipPos,
            clickedChipNode: chipNode
        });
    };

    // Handle helper pane selection
    const onHelperItemSelect = async (selectedValue: string, options?: HelperpaneOnChangeOptions) => {
        if (!viewRef.current) return;

        const view = viewRef.current;

        if (options?.closeHelperPane) {
            setHelperPaneState({
                isOpen: false,
                top: helperPaneState.top,
                left: helperPaneState.left
            });
        }

        // Check if selection is on a chip/token
        const isOnChip = helperPaneState.clickedChipPos !== undefined && helperPaneState.clickedChipNode;
        const insertPos = isOnChip ? helperPaneState.clickedChipPos! : view.state.selection.from;
        const transformedValue = isInsideInterpolation(view.state.doc.textBetween(0, insertPos))
            ? selectedValue
            : configuration.getHelperValue(selectedValue);

        const finalValue = transformedValue;
        let caretOffset = finalValue.length;

        // Chips here cannot be edited, so a call goes in without $1 placeholders, with the caret inside its parentheses when it takes arguments.
        if (extractArgsFromFunction && /\(\)\}?$/.test(transformedValue)) {
            const result = await processFunctionWithArguments(transformedValue, extractArgsFromFunction);
            if (result.finalValue !== transformedValue) {
                caretOffset = transformedValue.lastIndexOf("(") + 1;
            }
        }

        const from = isOnChip ? helperPaneState.clickedChipPos! : view.state.selection.from;
        const to = isOnChip ? from + helperPaneState.clickedChipNode.nodeSize : view.state.selection.to;
        const [before, after] = options?.padToNeighbours && !isOnChip ? neighbourSpaces(view, from, to) : ["", ""];
        const tr = view.state.tr.insertText(before + finalValue + after, from, to);
        const cursorPosition = from + before.length + caretOffset;
        view.dispatch(tr.setSelection(TextSelection.create((tr as any).doc, cursorPosition)));

        setHelperPaneState(prev => ({
            ...prev,
            isOpen: prev.isOpen && !options?.closeHelperPane,
            clickedChipPos: undefined,
            clickedChipNode: undefined
        }));

        // Trigger onChange to update parent
        const serialized = customMarkdownSerializer.serialize(view.state.doc);
        const newEditorValue = sanitizeText(configuration.deserializeValue(serialized));
        onChange?.(newEditorValue, cursorPosition);

        // Explicitly trigger token fetch to convert inserted text to chips
        pendingTokenFetchRef.current = true;
        fetchAndUpdateTokens(view);
    };

    const { register: registerInsertTarget, drop: dropInsert } = useInsertTarget((value) => {
        void onHelperItemSelect(value, { closeHelperPane: true, padToNeighbours: true });
        viewRef.current?.focus();
    });

    const fetchAndUpdateTokens = async (editorView: EditorView) => {
        if (!rpcManager || !fileName) return;
        if (!pendingTokenFetchRef.current) return;

        pendingTokenFetchRef.current = false;

        try {
            const plainText = editorView.state.doc.textContent;
            if (!plainText) return;

            const startLine = targetLineRange?.startLine;

            const wrappedForAPI = configuration.deserializeValue(plainText);

            const tokens = await rpcManager.getExpressionTokens(
                wrappedForAPI,
                fileName,
                startLine !== undefined ? startLine : undefined
            );
            
            if (editorView.state.doc.textContent !== plainText) {
                return;
            }

            updateChipTokens(editorView, {
                tokens,
                plainText,
                wrappedText: wrappedForAPI
            });
        } catch (error) {
            console.error("Failed to fetch tokens:", error);
        }
    };

    // Initialize ProseMirror editor
    useEffect(() => {
        if (!editorRef.current) return;

        const sanitizedValue = configuration.serializeValue(value);
        const chipPlugin = createChipPlugin(chipSchema, handleChipClick);
        const xmlTagPlugin = createXMLTagDecorationPlugin();

        // Plugin to close helper pane when cursor moves (only for chip-click-opened panes)
        const cursorMovePlugin = new Plugin({
            view() {
                return {
                    update(view, prevState) {
                        if (!view.state.doc.eq(prevState.doc)) {
                            return;
                        }
                        const oldSelection = prevState.selection;
                        const newSelection = view.state.selection;

                        if (oldSelection.from !== newSelection.from || oldSelection.to !== newSelection.to) {
                            setHelperPaneState(prev => {
                                // Only close on cursor move if the pane was opened via chip click,
                                // not when opened via toolbar toggle (which has no clickedChipPos)
                                if (prev.isOpen && prev.clickedChipPos !== undefined) {
                                    return { ...prev, isOpen: false };
                                }
                                return prev;
                            });
                        }
                    }
                };
            }
        });

        const state = EditorState.create({
            doc: customMarkdownParser.parse(sanitizedValue),
            schema: chipSchema,
            plugins: [
                history(),
                keymap({
                    // Undo/Redo
                    "Mod-z": undo,
                    "Mod-y": redo,
                    "Mod-Shift-z": redo,

                    // Text formatting
                    "Mod-b": toggleBold,
                    "Mod-i": toggleItalic,
                    "ArrowRight": exitInlineCodeOnArrowRight,
                    "ArrowDown": exitBlockOnArrowDown,
                    // Mod-k removed: link insertion now requires dialog from toolbar

                    // Headings
                    "Mod-Alt-1": toggleHeading(1),
                    "Mod-Alt-2": toggleHeading(2),
                    "Mod-Alt-3": toggleHeading(3),
                    "Mod-Alt-4": toggleHeading(4),
                    "Mod-Alt-5": toggleHeading(5),
                    "Mod-Alt-6": toggleHeading(6),

                    // Block formatting
                    "Mod-Shift-9": toggleBlockquote,
                    "Mod-Shift-8": toggleBulletList,
                    "Mod-Shift-7": toggleOrderedList,

                    // List management + markdown shortcuts (--- → hr, ``` → code block)
                    "Enter": (state: any, dispatch: any, view: any) => {
                        // Try markdown shortcuts first
                        if (handleMarkdownShortcutEnter(state, dispatch, view)) return true;
                        // Then default list item split
                        return splitListItem(chipSchema.nodes.list_item)(state, dispatch, view);
                    },
                    "Mod-[": liftListItem(chipSchema.nodes.list_item),
                    "Mod-]": sinkListItem(chipSchema.nodes.list_item),
                    "Tab": (state: any, dispatch: any) => {
                        return sinkListItem(chipSchema.nodes.list_item)(state, dispatch);
                    },
                    "Shift-Tab": (state: any, dispatch: any) => {
                        return liftListItem(chipSchema.nodes.list_item)(state, dispatch);
                    },

                    // Helper pane
                    "Mod-/": () => handleKeyboardToggle(),
                    "Escape": () => {
                        if (helperPaneState.isOpen) {
                            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
                            return true;
                        }
                        return false;
                    }
                }),
                ...createTablePlugins(),
                keymap(baseKeymap),
                gapCursor(),
                createMarkdownInputRulesPlugin(chipSchema),
                chipPlugin,
                createDropCursorPlugin(dropTarget),
                xmlTagPlugin,
                cursorMovePlugin,
                ...(placeholder ? [createPlaceholderPlugin(placeholder)] : [])
            ]
        });

        // Fix any malformed tables in the initial document
        const fixedTr = fixTables(state);
        const initialState = fixedTr ? state.apply(fixedTr.setMeta("addToHistory", false)) : state;

        const view = new EditorView(editorRef.current, {
            state: initialState,
            handlePaste(view, event, _slice) {
                const text = event.clipboardData?.getData('text/plain');
                if (!text) return false;

                // Sanitize pasted text to remove invisible characters
                const sanitizedText = sanitizeText(text);

                // Check if the pasted text looks like markdown
                const markdownPatterns = [
                    /^#{1,6}\s/m,           // Headings
                    /\*\*[^*]+\*\*/,        // Bold
                    /\*[^*]+\*/,            // Italic
                    /^[-*+]\s/m,            // Unordered list
                    /^\d+\.\s/m,            // Ordered list
                    /^>\s/m,                // Blockquote
                    /`[^`]+`/,              // Inline code
                    /```[\s\S]*```/,        // Code block
                    /\[.+\]\(.+\)/,         // Links
                    /^\|.+\|$/m             // GFM table rows
                ];

                const looksLikeMarkdown = markdownPatterns.some(pattern => pattern.test(sanitizedText));

                if (looksLikeMarkdown) {
                    const doc = customMarkdownParser.parse(sanitizedText);
                    if (doc && doc.content.size > 0) {
                        const { from, to } = view.state.selection;
                        const tr = (view.state.tr as any).replaceWith(from, to, doc.content);
                        view.dispatch(tr);
                        return true;
                    }
                } else {
                    // For plain text, insert sanitized text
                    const { from, to } = view.state.selection;
                    const tr = view.state.tr.insertText(sanitizedText, from, to);
                    view.dispatch(tr);
                    return true;
                }

                return false;
            },
            transformPastedText(text) {
                return sanitizeText(text);
            },
            editable: () => !readOnlyRef.current,
            dispatchTransaction(transaction) {
                const newState = view.state.apply(transaction);
                view.updateState(newState);

                // Check if we should fetch tokens based on what was typed
                if ((transaction as any).docChanged && !readOnlyRef.current) {
                    // Check if this is undo/redo
                    const meta = (transaction as any).getMeta('history$');
                    if (meta) {
                        pendingTokenFetchRef.current = true;
                        fetchAndUpdateTokens(view);
                    } else {
                        // Check what text was inserted
                        let shouldTrigger = false;
                        (transaction as any).steps?.forEach((step: any) => {
                            if (step.slice?.content) {
                                const insertedText = step.slice.content.textBetween(0, step.slice.content.size);
                                if (insertedText.includes(' ') || insertedText.includes('}')) {
                                    shouldTrigger = true;
                                }
                            }
                        });

                        if (shouldTrigger) {
                            pendingTokenFetchRef.current = true;
                            fetchAndUpdateTokens(view);
                        }
                    }

                    // Call onChange when document changes
                    const serialized = customMarkdownSerializer.serialize(newState.doc);
                    const newValue = sanitizeText(configuration.deserializeValue(serialized));
                    const cursorPos = (newState.selection as any).$head?.pos || 0;
                    onChange?.(newValue, cursorPos);
                }
            },
            handleDOMEvents: {
                focus: () => {
                    registerInsertTarget();
                    return false;
                },
                drop: (view, event) => {
                    clearDropCursor(view);
                    return moveDraggedChip(view, event) || dropInsert(event, () => {
                        const target = dropTarget(view, event);
                        if (target === NEW_LINE) {
                            const tr = (view.state.tr as any).insert(view.state.doc.content.size, chipSchema.nodes.paragraph.create());
                            view.dispatch(tr.setSelection(TextSelection.create(tr.doc, tr.doc.content.size - 1)));
                        } else if (target !== null) {
                            view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target))));
                        }
                    });
                },
                keydown: (_view, event) => {
                    // Prevent Cmd+B from propagating to VSCode (which would open the sidebar)
                    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b' && !event.shiftKey && !event.altKey) {
                        event.stopPropagation();
                    }
                    return false;
                }
            }
        });

        viewRef.current = view;

        if (onEditorViewReady) {
            onEditorViewReady(view);
        }

        // Fetch initial tokens
        pendingTokenFetchRef.current = true;
        fetchAndUpdateTokens(view);

        return () => {
            if (viewRef.current) {
                viewRef.current.destroy();
                viewRef.current = null;
            }
        };
    }, []);

    // Fetch tokens when value changes from parent
    useEffect(() => {
        if (viewRef.current) {
            pendingTokenFetchRef.current = true;
            fetchAndUpdateTokens(viewRef.current);
        }
    }, [value]);

    // Handle click outside and escape key for helper pane
    useHelperPaneClickOutside({
        enabled: helperPaneState.isOpen,
        refs: {
            editor: editorRef,
            helperPane: helperPaneRef,
            toggleButton: helperPaneToggleButtonRef,
            toolbar: toolbarRef
        },
        onClickOutside: () => {
            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
        },
        onEscapeKey: () => {
            setHelperPaneState(prev => ({ ...prev, isOpen: false }));
        }
    });

    return (
        <>
            <EditorContainer ref={editorRef} readOnly={readOnly}>
                {helperPaneState.isOpen && getHelperPane && configuration.showHelperPane() && (
                    <HelperPane
                        ref={helperPaneRef}
                        top={helperPaneState.top}
                        left={helperPaneState.left}
                        getHelperPane={getHelperPane}
                        value={value}
                        onChange={onHelperItemSelect}
                    />
                )}
            </EditorContainer>
        </>
    );
};
