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

/**
 * Tells whether a search query is found in an item's texts. The query is matched word by word, so the
 * words need not be adjacent, in order, or all in the same text: "message send" finds "Send a message".
 * A blank query matches everything.
 */
export function matchesEveryWord(searchText: string, ...texts: (string | undefined)[]): boolean {
    const haystacks = texts.filter((text): text is string => typeof text === "string").map((text) => text.toLowerCase());
    return searchText
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystacks.some((text) => text.includes(word)));
}
