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

import { matchesEveryWord } from "../utils/searchWords";

describe("matchesEveryWord", () => {
    const label = "post /chat.postMessage";
    const description = "Sends a message to a channel";

    it.each([[""], ["   "], ["sends"], ["SENDS A MESSAGE"], ["message sends"], ["sends   channel"], ["post message"], ["mess chan"]])(
        "finds every word of %p across the texts, in any order",
        (query) => {
            expect(matchesEveryWord(query, label, description)).toBe(true);
        }
    );

    it.each([["upload"], ["sends upload"], ["message file"]])("rejects %p, which has a word found nowhere", (query) => {
        expect(matchesEveryWord(query, label, description)).toBe(false);
    });

    it("ignores a missing text", () => {
        expect(matchesEveryWord("post", label, undefined)).toBe(true);
        expect(matchesEveryWord("sends", label, undefined)).toBe(false);
    });
});
