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

import { matchesEveryWord, matchesWithinGroups, searchWordsOf } from "../utils/searchWords";

describe("matchesEveryWord", () => {
    const label = "post /chat.postMessage";
    const description = "Sends a message to a channel";

    it.each([[""], ["   "], ["sends"], ["SENDS A MESSAGE"], ["message sends"], ["sends   channel"], ["post message"], ["mess chan"]])(
        "finds every word of %p across the texts, in any order",
        (query) => {
            expect(matchesEveryWord(query, label, description)).toBe(true);
        }
    );

    it.each([["sends-channel"], ["message,sends"], ["post/message"], ["chat.post"], ["(sends) [channel]"]])(
        "treats the punctuation in %p as a space between words",
        (query) => {
            expect(matchesEveryWord(query, label, description)).toBe(true);
        }
    );

    it("finds words split by punctuation inside a name that has none between them", () => {
        expect(matchesEveryWord("read,csv", "openReadableCsvFile")).toBe(true);
        expect(matchesEveryWord("send_email", "sendEmail")).toBe(true);
    });

    it("matches a query of punctuation alone as typed, not as a blank query", () => {
        expect(matchesEveryWord("/", label, description)).toBe(true);
        expect(matchesEveryWord(" @#$% ", label, description)).toBe(false);
    });

    it.each([["upload"], ["sends upload"], ["message file"], ["sends-upload"]])(
        "rejects %p, which has a word found nowhere",
        (query) => {
            expect(matchesEveryWord(query, label, description)).toBe(false);
        }
    );

    it("ignores a missing text", () => {
        expect(matchesEveryWord("post", label, undefined)).toBe(true);
        expect(matchesEveryWord("sends", label, undefined)).toBe(false);
    });
});

describe("searchWordsOf", () => {
    it.each([
        ["", []],
        ["   ", []],
        [" Send   Email ", ["send", "email"]],
        ["send-email", ["send", "email"]],
        ["send_email", ["send", "email"]],
        ["http:Client", ["http", "client"]],
        ["post /chat.postMessage", ["post", "chat", "postmessage"]],
        ["Café-Menü 2", ["café", "menü", "2"]],
        [" / . - ", []],
    ])("splits %p into its lower-cased words", (query, words) => {
        expect(searchWordsOf(query)).toEqual(words);
    });
});

describe("matchesWithinGroups", () => {
    const own = ["post /chat.postMessage", "Sends a message to a channel"];
    const groups = ["slackClient", undefined];

    it.each([[""], ["sends"], ["slack sends"], ["message slack client"], ["slack-sends"]])(
        "finds %p when the words not on the item name a group it sits in",
        (query) => {
            expect(matchesWithinGroups(query, own, groups)).toBe(true);
        }
    );

    it.each([["slack"], ["slack client"], ["slack upload"], ["upload"], ["@#$%"]])(
        "rejects %p: no word is on the item itself, or one is found nowhere",
        (query) => {
            expect(matchesWithinGroups(query, own, groups)).toBe(false);
        }
    );
});
