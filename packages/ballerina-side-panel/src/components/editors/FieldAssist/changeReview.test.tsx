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

import React from "react";
import { render } from "@testing-library/react";
import { ReviewDiff, ValueDiff, changeKind, isRewrite, wordDiff } from "./ChangeReview";

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

const lines = (diff: React.ReactElement) => {
    const { container } = render(diff);
    return [...container.children].map((line) => ({
        text: line.textContent,
        changed: [...line.querySelectorAll("span span")].map((word) => word.textContent),
    }));
};

describe("ValueDiff", () => {
    it("shows a first value as the new line alone", () => {
        expect(lines(<ValueDiff before="" after="(subtotal - discount) * taxRate" />)).toEqual([{ text: "+(subtotal - discount) * taxRate", changed: [] }]);
    });

    it("shows a cleared value as the old line alone", () => {
        expect(lines(<ValueDiff before="http:KEEPALIVE_NEVER" after="" />)).toEqual([{ text: "−http:KEEPALIVE_NEVER", changed: [] }]);
    });

    it("tints only the changed word when the values share most words", () => {
        expect(lines(<ValueDiff before="{keepAlive: http:KEEPALIVE_NEVER}" after="{keepAlive: http:KEEPALIVE_ALWAYS}" />)).toEqual([
            { text: "−{keepAlive: http:KEEPALIVE_NEVER}", changed: ["KEEPALIVE_NEVER"] },
            { text: "+{keepAlive: http:KEEPALIVE_ALWAYS}", changed: ["KEEPALIVE_ALWAYS"] },
        ]);
    });

    it("shows a rewrite as two whole lines with nothing tinted", () => {
        expect(lines(<ValueDiff before="ord.customer.vip" after="items.length() > 10" />)).toEqual([
            { text: "−ord.customer.vip", changed: [] },
            { text: "+items.length() > 10", changed: [] },
        ]);
    });
});

describe("ReviewDiff", () => {
    it("shows nothing for a first value, which the field already shows", () => {
        expect(changeKind("", "(subtotal - discount) * taxRate")).toBe("added");
        expect(lines(<ReviewDiff before="" after="(subtotal - discount) * taxRate" display="code" />)).toEqual([]);
    });

    it("shows a cleared value as the old line", () => {
        expect(lines(<ReviewDiff before="http:KEEPALIVE_NEVER" after="" display="code" />)).toEqual([{ text: "−http:KEEPALIVE_NEVER", changed: [] }]);
    });

    it("shows only the old value of a rewrite", () => {
        expect(changeKind("ord.customer.vip", "items.length() > 10", "code")).toBe("replaced");
        expect(lines(<ReviewDiff before="ord.customer.vip" after="items.length() > 10" display="code" />)).toEqual([{ text: "−ord.customer.vip", changed: [] }]);
        // A value it names shows as code, with no chip.
        expect(render(<ReviewDiff before="order.total" after="{amount: 0d}" display="code" />).container.querySelector("i, [class*='codicon'], [class*='fw-']")).toBeNull();
    });

    it("shows a small edit as one line with the removed and added words marked", () => {
        expect(lines(<ReviewDiff before="{keepAlive: http:KEEPALIVE_NEVER}" after="{keepAlive: http:KEEPALIVE_ALWAYS}" display="code" />)).toEqual([
            { text: "{keepAlive: http:KEEPALIVE_NEVERKEEPALIVE_ALWAYS}", changed: ["KEEPALIVE_NEVER", "KEEPALIVE_ALWAYS"] },
        ]);
    });
});
