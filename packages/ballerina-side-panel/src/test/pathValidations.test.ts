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

import { parseBasePath, parseResourceFunctionPath } from "../utils/path-validations";

describe("parseResourceFunctionPath", () => {
    // Any character is allowed in a segment: the language server escapes it when it writes the source
    it.each([".", "chat", "chat/rooms", "rooms/[string id]", "a/[int... rest]", "'function", "function",
        "chat/service", "orders/[int id]/line-items", "v1.0/a@b", "line\\-items", "2024/report"])("accepts %s", (path) => {
        expect(parseResourceFunctionPath(path).errors).toEqual([]);
        expect(parseResourceFunctionPath(path).valid).toBe(true);
    });

    it.each([
        ["", "path cannot be empty"],
        ["/chat", "path cannot start with a slash (/)"],
        ["chat//rooms", "cannot have two consecutive slashes (//)"],
        ["chat/", "path cannot end with a slash (/)"],
        ["chat rooms", "spaces are not allowed in a path"],
        ["rooms/[string id", "path parameter is missing its closing (]) bracket"],
        ["rooms/string id]", "path parameter is missing its opening ([) bracket"],
    ])("rejects %p", (path, message) => {
        const result = parseResourceFunctionPath(path);
        expect(result.valid).toBe(false);
        expect(result.errors[0].message).toBe(message);
    });
});

describe("parseBasePath", () => {
    it.each(["/", "/api", "/issues-memox", "/issues\\-memox", "/api/v1.0", "/a@b", "/api/type", "\"/literal\""])(
        "accepts %s",
        (path) => {
            expect(parseBasePath(path).errors).toEqual([]);
        }
    );

    it.each([
        ["", "base path cannot be empty"],
        ["api", "base path must start with a slash (/) character"],
        ["/api//orders", "cannot have two consecutive slashes (//)"],
        ["/api/", "base path cannot end with a slash (/)"],
        ["/my api", "spaces are not allowed in a path"],
        ["/api/[string id]", "a path parameter must be a whole segment, e.g. [string id]"],
    ])("rejects %p", (path, message) => {
        expect(parseBasePath(path).errors[0].message).toBe(message);
    });
});
