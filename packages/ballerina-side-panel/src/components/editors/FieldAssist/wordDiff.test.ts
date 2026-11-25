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

import { isRewrite, wordDiff } from "./ChangeReview";

const joined = (before: string, after: string) => {
    const parts = wordDiff(before, after);
    return {
        before: parts.filter((part) => part.kind !== "ins").map((part) => part.text).join(""),
        after: parts.filter((part) => part.kind !== "del").map((part) => part.text).join(""),
    };
};

describe("wordDiff", () => {
    it("keeps the shared words and marks the replaced one", () => {
        expect(wordDiff("Be friendly and brief.", "Be friendly and concise.")).toEqual([
            { text: "Be friendly and ", kind: "same" },
            { text: "brief.", kind: "del" },
            { text: "concise.", kind: "ins" },
        ]);
    });

    it("marks a whole replacement as one removal and one addition", () => {
        expect(wordDiff("Customer Support Assistant", "Math Tutor")).toEqual([
            { text: "Customer Support Assistant", kind: "del" },
            { text: "Math Tutor", kind: "ins" },
        ]);
    });

    it("rebuilds both values from the parts", () => {
        const before = "You help Acme Outdoor customers with their orders. Be brief.";
        const after = "You are a math tutor. Explain each step. Be brief.";
        expect(joined(before, after)).toEqual({ before, after });
    });

    it("returns one unchanged part for equal values", () => {
        expect(wordDiff("same text", "same text")).toEqual([{ text: "same text", kind: "same" }]);
    });

    it("reads a change of line breaks in text as no change", () => {
        expect(wordDiff("Be friendly.\nBe brief.", "Be friendly. Be brief.")).toEqual([{ text: "Be friendly. Be brief.", kind: "same" }]);
    });

    it("marks only the added items in reformatted code", () => {
        const before = '{\n    cors: {\n        allowMethods: ["GET", "POST"]\n    }\n}';
        const after = '{cors: {allowMethods: ["GET", "POST", "PUT"]}}';
        expect(wordDiff(before, after, true)).toEqual([
            { text: '{cors: {allowMethods: ["GET", "POST"', kind: "same" },
            { text: ', "PUT"', kind: "ins" },
            { text: "]}}", kind: "same" },
        ]);
    });
});

describe("isRewrite", () => {
    it("reads a small edit as an edit", () => {
        expect(isRewrite(wordDiff("Be friendly and brief. Never promise a refund.", "Be friendly and concise. Never promise a refund."))).toBe(false);
    });

    it("reads a new text with a few shared words as a rewrite", () => {
        expect(isRewrite(wordDiff(
            "You help Acme Outdoor customers with questions about their orders. Look up the order first.",
            "You are a patient math tutor. Explain concepts step by step and ask the student what they know.",
        ))).toBe(true);
    });
});
