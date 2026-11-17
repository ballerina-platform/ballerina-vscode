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

type SearchText = string | undefined | null;

const lowerCased = (texts: SearchText[]): string[] =>
    texts.filter((text): text is string => typeof text === "string").map((text) => text.toLowerCase());

/** Splits a search query into the lower-cased words that are looked for. A blank query has none. */
export function searchWordsOf(searchText: string): string[] {
    return (searchText ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Tells whether a search query is found in an item's texts. The query is matched word by word, so the
 * words need not be adjacent, in order, or all in the same text: "message send" finds "Send a message".
 * A blank query matches everything.
 */
export function matchesEveryWord(searchText: string, ...texts: SearchText[]): boolean {
    const haystacks = lowerCased(texts);
    return searchWordsOf(searchText).every((word) => haystacks.some((text) => text.includes(word)));
}

/**
 * Tells whether a search query finds an item that sits inside groups. Every word has to be found, and at
 * least one of them on the item itself: the rest may name the groups the item sits in, so "slack send"
 * finds the "Send a message" operation of a "slackClient" connection. A blank query matches everything.
 */
export function matchesWithinGroups(searchText: string, ownTexts: SearchText[], groupTexts: SearchText[]): boolean {
    const words = searchWordsOf(searchText);
    if (words.length === 0) {
        return true;
    }
    const own = lowerCased(ownTexts);
    const groups = lowerCased(groupTexts);
    const inOwn = (word: string) => own.some((text) => text.includes(word));
    return words.some(inOwn) && words.every((word) => inOwn(word) || groups.some((text) => text.includes(word)));
}
