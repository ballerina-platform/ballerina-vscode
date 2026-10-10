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
import type { CompletionItem } from "@wso2/ui-toolkit";
import { buildCompletionSource } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/CodeUtils";

const crossModuleItem = {
    label: "utcFromString",
    value: "utcFromString(${1:timestamp})",
    kind: "function",
    description: "ballerina/time",
    additionalTextEdits: [{ newText: "import ballerina/time;\n", range: {} }],
} as unknown as CompletionItem;

const localItem = {
    label: "utcNow",
    value: "utcNow()",
    kind: "function",
    description: "local",
} as unknown as CompletionItem;

const contextFor = (doc: string, prefix: string) =>
    ({
        state: EditorState.create({ doc }),
        pos: doc.length,
        explicit: true,
        matchBefore: () => ({ from: doc.length - prefix.length, to: doc.length, text: prefix }),
    } as any);

const optionsFor = async (
    items: CompletionItem[],
    onAccept?: (docValue: string, item: CompletionItem) => void
) => {
    const source = buildCompletionSource(async () => items, onAccept);
    const result = await source(contextFor("utc", "utc"));
    return result?.options ?? [];
};

describe("buildCompletionSource", () => {
    it("inserts the snippet-stripped text and places the cursor after it", async () => {
        const [option] = await optionsFor([crossModuleItem]);
        expect(typeof option.apply).toBe("function");

        const view = new EditorView({ state: EditorState.create({ doc: "utc" }), parent: document.body });
        (option.apply as any)(view, option, 0, 3);

        expect(view.state.doc.toString()).toBe("utcFromString(timestamp)");
        expect(view.state.selection.main.head).toBe("utcFromString(timestamp)".length);
        view.destroy();
    });

    it("INVARIANT: the accepted item reaches onAccept with additionalTextEdits intact", async () => {
        const onAccept = jest.fn();
        const [option] = await optionsFor([crossModuleItem], onAccept);

        const view = new EditorView({ state: EditorState.create({ doc: "utc" }), parent: document.body });
        (option.apply as any)(view, option, 0, 3);

        expect(onAccept).toHaveBeenCalledTimes(1);
        const [docValue, item] = onAccept.mock.calls[0];
        expect(docValue).toBe("utcFromString(timestamp)");
        expect(item).toBe(crossModuleItem);
        expect(item.additionalTextEdits[0].newText).toBe("import ballerina/time;\n");
        view.destroy();
    });

    it("still reports items carrying no import - the caller decides what to skip", async () => {
        const onAccept = jest.fn();
        const [option] = await optionsFor([localItem], onAccept);

        const view = new EditorView({ state: EditorState.create({ doc: "utc" }), parent: document.body });
        (option.apply as any)(view, option, 0, 3);

        expect(view.state.doc.toString()).toBe("utcNow()");
        expect(onAccept).toHaveBeenCalledWith("utcNow()", localItem);
        view.destroy();
    });

    it("omitting onAccept does not throw", async () => {
        const [option] = await optionsFor([crossModuleItem]);
        const view = new EditorView({ state: EditorState.create({ doc: "utc" }), parent: document.body });
        expect(() => (option.apply as any)(view, option, 0, 3)).not.toThrow();
        view.destroy();
    });
});
