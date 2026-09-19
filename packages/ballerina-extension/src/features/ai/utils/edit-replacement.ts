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
 * Pure find/replace core for the file edit tools. Kept free of `vscode` and `fs` imports so
 * it can be unit tested; the tools module it serves is not importable under jest.
 */

import { normalizeToLf } from './eol-utils';

/**
 * Replaces `searchString` in `content`, inserting `replacement` verbatim.
 *
 * `replace`/`replaceAll` expand `$` sequences in a *string* replacement even when the search
 * pattern is a plain string: `` $` `` splices in everything before the match, `$'` everything
 * after, `$&` the match, and `$$` collapses to `$`. Ballerina payloads hit this because
 * backticks delimit regex and string templates, so an end-anchored regex (``re `^\d{6}$` ``)
 * duplicates the file at the match point. A function replacer disables the expansion.
 */
export function replaceLiteral(
    content: string,
    searchString: string,
    replacement: string,
    replaceAll: boolean
): string {
    return replaceAll
        ? content.replaceAll(searchString, () => replacement)
        : content.replace(searchString, () => replacement);
}

/** Applies one find/replace. An empty edit on an empty file writes the whole file. */
export function applyEdit(
    content: string,
    oldString: string,
    newString: string,
    replaceAll: boolean
): string {
    if (content.trim() === "" && oldString.trim() === "") {
        return newString;
    }
    return replaceLiteral(content, oldString, newString, replaceAll);
}

/**
 * Compares contents ignoring EOL style and the trailing/final whitespace that on-save
 * settings (trimTrailingWhitespace, insertFinalNewline, trimFinalNewlines) rewrite for us.
 */
export function contentsEquivalent(a: string, b: string): boolean {
    const canonical = (s: string) => normalizeToLf(s).replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
    return canonical(a) === canonical(b);
}
