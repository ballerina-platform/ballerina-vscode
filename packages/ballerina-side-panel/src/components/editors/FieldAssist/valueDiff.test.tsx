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
import { ReviewDiff, ValueDiff, changeKind } from "./ChangeReview";

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
    });

    it("shows a small edit as one line with the removed and added words marked", () => {
        expect(lines(<ReviewDiff before="{keepAlive: http:KEEPALIVE_NEVER}" after="{keepAlive: http:KEEPALIVE_ALWAYS}" display="code" />)).toEqual([
            { text: "{keepAlive: http:KEEPALIVE_NEVERKEEPALIVE_ALWAYS}", changed: ["KEEPALIVE_NEVER", "KEEPALIVE_ALWAYS"] },
        ]);
    });
});
