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

import { AvailableNode } from "@wso2/ballerina-core";
import { actionMatchesSearch, scoreNode } from "../../../../../views/BI/Connection/ConnectorBrowser/connectorSearch";

describe("actionMatchesSearch", () => {
    const remote = {
        metadata: { label: "uploadFile", description: "Uploads a file to a channel" },
        codedata: { node: "REMOTE_ACTION_CALL", symbol: "uploadFile" },
    } as AvailableNode;
    const resource = {
        metadata: { label: "post /chat.postMessage", description: "Sends a message to a channel" },
        codedata: { node: "RESOURCE_ACTION_CALL", symbol: "post", resourcePath: "/chat.postMessage" },
    } as AvailableNode;

    // The rule for a query of several words: each word is looked for on its own, so the words need not be
    // adjacent, in order, or in the same text.
    it.each([
        ["upload file", remote],
        ["file upload", remote],
        ["upload   channel", remote],
        ["sends message", resource],
        ["channel sends", resource],
        ["post message", resource],
    ])("finds an action by every word of %p", (query, action) => {
        expect(actionMatchesSearch(action, query)).toBe(true);
    });

    it.each([
        ["upload message", remote],
        ["sends file", resource],
    ])("rejects %p, which has a word found nowhere", (query, action) => {
        expect(actionMatchesSearch(action, query)).toBe(false);
    });
});

describe("scoreNode", () => {
    const sheets: any = {
        id: "NEW_CONNECTION",
        label: "Google Sheets",
        description: "Read and write spreadsheet data",
        metadata: { codedata: { module: "googleapis.sheets" } },
    };

    it.each([["sheets google"], ["goo she"], ["google spreadsheet"], ["sheets productivity"]])(
        "finds a connector by every word of %p, wherever each one sits",
        (query) => {
            expect(scoreNode(sheets, "Productivity", query)).toBeGreaterThanOrEqual(0);
        }
    );

    it("rejects a query with a word found nowhere", () => {
        expect(scoreNode(sheets, "Productivity", "google mail")).toBe(-1);
    });

    it("ranks the whole phrase above words found apart, and the label above the other texts", () => {
        const phrase = scoreNode(sheets, "Productivity", "google sheets");
        const wordsInLabel = scoreNode(sheets, "Productivity", "sheets google");
        const wordsAcrossTexts = scoreNode(sheets, "Productivity", "google spreadsheet");
        expect(phrase).toBeLessThan(wordsInLabel);
        expect(wordsInLabel).toBeLessThan(wordsAcrossTexts);
    });
});
