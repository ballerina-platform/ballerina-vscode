/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { getGraphqlNameError, toDisplayName, toDisplayPath, toSourceIdentifier } from "../utils/source-name-utils";

// The same vectors as IdentifierUtilTest in model-generator-commons (the language server side), so the two stay in step
describe("toSourceIdentifier / toDisplayName", () => {
    const vectors: [string, string, string][] = [
        // input, source form, plain form
        ["name", "name", "name"],
        ["issue-number", "issue\\-number", "issue-number"],
        ["issue\\-number", "issue\\-number", "issue-number"],
        ["issue\\\\\\-number", "issue\\-number", "issue-number"],
        ["type", "'type", "type"],
        ["'type", "'type", "type"],
        ["'name", "name", "name"],
        ["'type-x", "type\\-x", "type-x"],
        ["key", "key", "key"],
        ["string", "'string", "string"],
        ["_", "_", "_"],
        ["1st", "\\1st", "1st"],
        ["\\1st", "\\1st", "1st"],
        ["a1", "a1", "a1"],
        ["first name", "first\\ name", "first name"],
        ["a.b", "a\\.b", "a.b"],
        ["a@b$c", "a\\@b\\$c", "a@b$c"],
        ["a\\u{2D}b", "a\\-b", "a-b"],
        ["a\\u{5C}b", "a\\u{5C}b", "a\\b"],
        ["_x", "_x", "_x"],
        ["été", "été", "été"],
        // Only decimal digits are kept unescaped, as Java's `Character.isLetterOrDigit` does
        ["x٣", "x٣", "x٣"],
        ["x²", "x\\²", "x²"],
    ];

    it.each(vectors)("%s", (input, source, plain) => {
        expect(toSourceIdentifier(input)).toBe(source);
        expect(toSourceIdentifier(source)).toBe(source);
        expect(toDisplayName(input)).toBe(plain);
    });

    it("keeps empty values", () => {
        expect(toDisplayName("")).toBe("");
        expect(toSourceIdentifier("")).toBe("");
        expect(toDisplayName(undefined)).toBeUndefined();
    });
});

describe("toDisplayPath", () => {
    const vectors: [string, string][] = [
        // input, plain form
        ["/", "/"],
        [".", "."],
        ["/issues-memox", "/issues-memox"],
        ["/issues\\-memox", "/issues-memox"],
        ["/issues\\\\\\-memox", "/issues-memox"],
        ["/a\\@b", "/a@b"],
        ["/api/v1\\.0/'type", "/api/v1.0/type"],
        ["orders/[int id]/line\\-items", "orders/[int id]/line-items"],
        ["[string... rest]", "[string... rest]"],
        ["v1/\\2024", "v1/2024"],
        ["/a\\[b/c", "/a[b/c"],
        ["\"/literal-path\"", "\"/literal-path\""],
    ];

    it.each(vectors)("%s", (input, plain) => {
        expect(toDisplayPath(input)).toBe(plain);
    });
});

describe("getGraphqlNameError", () => {
    it.each(["name", "_id", "type", "'type", "a1", ""])("accepts %p", (name) => {
        expect(getGraphqlNameError(name)).toBeUndefined();
    });

    it.each(["issue-number", "issue\\-number", "1st", "a.b", "first name"])("rejects %p", (name) => {
        expect(getGraphqlNameError(name)).toBeDefined();
    });
});
