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
import type { CompletionItem } from "@wso2/ui-toolkit";
import { buildCompletionSource } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/CodeUtils";
import {
    endsWithModulePrefix,
    endsWithModulePrefixInMode,
    filterCompletionsByPrefix,
} from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/utils";
import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";

const item = (label: string, kind: string): CompletionItem =>
    ({ label, value: label, kind, description: "", sortText: "A" } as unknown as CompletionItem);

// One member of every kind `expressionEditor/completion` returns for `kafka:` (ballerinax/kafka 4.6.7).
const KAFKA_MODULE_MEMBERS: CompletionItem[] = [
    item("DEFAULT_URL", "variable"),
    item("SSL", "enum-member"),
    item("ProducerConfiguration", "struct"),
    item("Producer", "interface"),
    item("CompressionType", "type-parameter"),
    item("Error", "event"),
];

const ACCESS_MEMBERS: CompletionItem[] = [
    item("toString", "function"),
    item("name", "field"),
    item("MAX", "variable"),
    item("cloneWithType", "method"),
    item("age", "field"),
];

// Builds the context CodeMirror hands a completion source while the user is typing (not Ctrl+Space).
const typingContext = (doc: string) => {
    const word = doc.match(/\w*$/)![0];
    return {
        state: EditorState.create({ doc }),
        pos: doc.length,
        explicit: false,
        matchBefore: () => ({ from: doc.length - word.length, to: doc.length, text: word }),
    } as any;
};

const labelsShownWhileTyping = async (doc: string, items: CompletionItem[]) => {
    const result = await buildCompletionSource(async () => items)(typingContext(doc));
    return result?.options.map((option) => option.label) ?? null;
};

describe("filterCompletionsByPrefix", () => {
    it("INVARIANT: every kind the LS returns survives an empty prefix", () => {
        const shown = filterCompletionsByPrefix(KAFKA_MODULE_MEMBERS, "");
        expect(shown.map((c) => c.label).sort()).toEqual(KAFKA_MODULE_MEMBERS.map((c) => c.label).sort());
    });

    it("INVARIANT: with a prefix, every kind whose label starts with it is kept", () => {
        for (const member of KAFKA_MODULE_MEMBERS) {
            const prefix = member.label.slice(0, 2).toLowerCase();
            expect(filterCompletionsByPrefix(KAFKA_MODULE_MEMBERS, prefix)).toContain(member);
        }
    });

    it("drops labels that do not start with the prefix", () => {
        expect(filterCompletionsByPrefix(KAFKA_MODULE_MEMBERS, "Pro").map((c) => c.label))
            .toEqual(["ProducerConfiguration", "Producer"]);
    });

    it("orders fields, then functions/methods, then the rest when there is no prefix", () => {
        expect(filterCompletionsByPrefix(ACCESS_MEMBERS, "").map((c) => c.kind))
            .toEqual(["field", "field", "function", "method", "variable"]);
    });

    it("does not reorder the caller's array", () => {
        const input = [...ACCESS_MEMBERS];
        filterCompletionsByPrefix(input, "");
        expect(input).toEqual(ACCESS_MEMBERS);
    });
});

describe("endsWithModulePrefix", () => {
    it.each([
        "kafka:",
        "file:",
        "x + kafka:",
        "foo(kafka:",
        "foo(a, kafka:",
        "[1, kafka:",
        "cond ? kafka:",
        "{a: kafka:",
        "{a: 1, b: foo(x, kafka:",
    ])("treats %p as a module prefix", (text) => {
        expect(endsWithModulePrefix(text)).toBe(true);
    });

    it.each([
        "",
        ":",
        "kafka: ",
        "kafka :",
        "kafka:DEF",
        "x + ",
        "cond ? a :",
        "{name:",
        "{ name:",
        "{a: 1, name:",
        "{a: 1,\n  name:",
        "a.b:",
        "'quoted:",
    ])("does not treat %p as a module prefix", (text) => {
        expect(endsWithModulePrefix(text)).toBe(false);
    });
});

describe("endsWithModulePrefixInMode", () => {
    it.each([InputMode.EXP, InputMode.RECORD, InputMode.MAP, InputMode.ARRAY, undefined])(
        "detects `kafka:` in code mode %p",
        (mode) => {
            expect(endsWithModulePrefixInMode("kafka:", mode)).toBe(true);
        }
    );

    it.each([InputMode.TEXT, InputMode.TEMPLATE, InputMode.PROMPT, InputMode.TEXT_ARRAY, InputMode.SIMPLE_TEXT])(
        "INVARIANT: `word:` is prose, not a module prefix, in %p mode",
        (mode) => {
            expect(endsWithModulePrefixInMode("Note:", mode)).toBe(false);
        }
    );
});

describe("buildCompletionSource while typing", () => {
    it("INVARIANT: right after `module:` every returned member is offered", async () => {
        expect(await labelsShownWhileTyping("kafka:", KAFKA_MODULE_MEMBERS))
            .toEqual(KAFKA_MODULE_MEMBERS.map((c) => c.label));
    });

    it("stays closed after `word:` when the caller says it is not a module prefix", async () => {
        const source = buildCompletionSource(async () => KAFKA_MODULE_MEMBERS, undefined, () => false);
        expect(await source(typingContext("Note:"))).toBeNull();
    });

    it("narrows module members by the typed prefix, across kinds", async () => {
        expect(await labelsShownWhileTyping("kafka:Pro", KAFKA_MODULE_MEMBERS))
            .toEqual(["ProducerConfiguration", "Producer"]);
    });

    it("still offers members right after `.`", async () => {
        expect(await labelsShownWhileTyping("person.", ACCESS_MEMBERS)).not.toBeNull();
    });

    it.each(["x + ", "x +", "{name:", "cond ? a : "])(
        "stays closed after an operator or separator: %p",
        async (doc) => {
            expect(await labelsShownWhileTyping(doc, KAFKA_MODULE_MEMBERS)).toBeNull();
        }
    );
});
