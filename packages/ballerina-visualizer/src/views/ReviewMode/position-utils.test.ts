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

import type { NodePosition } from "@wso2/ballerina-core";
import { getFlowLookupPosition } from "./position-utils";

describe("getFlowLookupPosition", () => {
    const modifiedPosition: NodePosition = {
        startLine: 38,
        startColumn: 4,
        endLine: 40,
        endColumn: 5,
    };
    const originalPosition: NodePosition = {
        startLine: 32,
        startColumn: 4,
        endLine: 34,
        endColumn: 5,
    };

    it("uses the original range for file-schema lookups after earlier edits shift a function", () => {
        expect(getFlowLookupPosition(modifiedPosition, originalPosition, true)).toBe(originalPosition);
    });

    it("uses the modified range for ai-schema lookups", () => {
        expect(getFlowLookupPosition(modifiedPosition, originalPosition, false)).toBe(modifiedPosition);
    });

    it("falls back to the modified range for older semantic-diff responses", () => {
        expect(getFlowLookupPosition(modifiedPosition, undefined, true)).toBe(modifiedPosition);
    });
});
