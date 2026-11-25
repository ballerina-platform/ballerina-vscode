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

import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";

const dropCursorKey = new PluginKey<number | null>("dropCursor");

const setDropCursor = (view: EditorView, pos: number | null) => {
    if (pos !== dropCursorKey.getState(view.state)) {
        view.dispatch(view.state.tr.setMeta(dropCursorKey, pos));
    }
};

export const clearDropCursor = (view: EditorView) => setDropCursor(view, null);

export const NEW_LINE = -1;

/** Shows where a dragged value will land; `place` gives the drop position for the pointer, or NEW_LINE below the content. */
export const createDropCursorPlugin = (place: (view: EditorView, event: MouseEvent) => number | null) =>
    new Plugin<number | null>({
        key: dropCursorKey,
        state: {
            init: () => null,
            apply: (tr, pos) => {
                const meta = tr.getMeta(dropCursorKey);
                return meta !== undefined ? meta : pos === null || pos === NEW_LINE ? pos : (tr as any).mapping.map(pos);
            }
        },
        props: {
            decorations(state) {
                const pos = dropCursorKey.getState(state);
                if (pos === null) {
                    return DecorationSet.empty;
                }
                const newLine = pos === NEW_LINE;
                const cursor = Decoration.widget(newLine ? state.doc.content.size : pos, () => {
                    const span = document.createElement("span");
                    span.className = "pm-drop-cursor";
                    if (!newLine) {
                        return span;
                    }
                    const line = document.createElement("p");
                    line.appendChild(span);
                    return line;
                }, { side: -1, key: newLine ? "drop-line" : "drop-cursor" });
                return DecorationSet.create(state.doc, [cursor]);
            },
            handleDOMEvents: {
                dragover: (view, event) => {
                    setDropCursor(view, place(view, event));
                    return false;
                },
                dragleave: (view, event) => {
                    if (!view.dom.contains(event.relatedTarget as Node)) {
                        clearDropCursor(view);
                    }
                    return false;
                },
                dragend: (view) => {
                    clearDropCursor(view);
                    return false;
                }
            }
        }
    });
