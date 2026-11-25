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

// Anything that is not a letter or a digit separates two words, as it does on the language server.
const WORD_SEPARATOR = /[^\p{L}\p{N}]+/u;

/**
 * Splits a search query into the lower-cased words that are looked for. Punctuation separates words as spaces do,
 * so "send-email" asks for "send" and "email". A query that is blank, or only punctuation, has none.
 */
export function searchWordsOf(searchText: string): string[] {
    return (searchText ?? "").toLowerCase().split(WORD_SEPARATOR).filter(Boolean);
}

// What a query is matched by: its words, or, for a query of punctuation alone such as "/", that punctuation as
// typed, so it finds what contains it rather than everything. A blank query has nothing to match.
const searchTermsOf = (searchText: string): string[] => {
    const words = searchWordsOf(searchText);
    if (words.length > 0) {
        return words;
    }
    const typed = (searchText ?? "").trim().toLowerCase();
    return typed ? [typed] : [];
};

/**
 * Tells whether a search query is found in an item's texts. The query is matched word by word, so the
 * words need not be adjacent, in order, or all in the same text: "message send" finds "Send a message".
 * A blank query matches everything.
 */
export function matchesEveryWord(searchText: string, ...texts: SearchText[]): boolean {
    const haystacks = lowerCased(texts);
    return searchTermsOf(searchText).every((word) => haystacks.some((text) => text.includes(word)));
}

/**
 * Tells whether a search query finds an item that sits inside groups. Every word has to be found, and at
 * least one of them on the item itself: the rest may name the groups the item sits in, so "slack send"
 * finds the "Send a message" operation of a "slackClient" connection. A blank query matches everything.
 */
export function matchesWithinGroups(searchText: string, ownTexts: SearchText[], groupTexts: SearchText[]): boolean {
    const words = searchTermsOf(searchText);
    if (words.length === 0) {
        return true;
    }
    const own = lowerCased(ownTexts);
    const groups = lowerCased(groupTexts);
    const inOwn = (word: string) => own.some((text) => text.includes(word));
    return words.some(inOwn) && words.every((word) => inOwn(word) || groups.some((text) => text.includes(word)));
}
