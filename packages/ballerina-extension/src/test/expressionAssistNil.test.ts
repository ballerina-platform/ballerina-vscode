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

const checkExpression = jest.fn();
jest.mock("../features/ai/expression-assist/tools", () => ({ LOOKUP_TOOLS: [] }));
jest.mock("../features/ai/expression-assist/context", () => ({ checkExpression: (...args: unknown[]) => checkExpression(...args) }));

import { alwaysNil } from "../features/ai/expression-assist/attempt";

const site = (ballerinaType: string) => ({
    filePath: "main.bal",
    context: { expression: "", startLine: { line: 0, offset: 0 }, lineOffset: 0, offset: 0, property: { types: [{ fieldType: "EXPRESSION", ballerinaType, selected: true }] } },
}) as unknown as Parameters<typeof alwaysNil>[0];

describe("always-nil check", () => {
    beforeEach(() => checkExpression.mockReset());

    it("flags a value whose own type is nil in an optional field", async () => {
        checkExpression.mockResolvedValue([]);
        expect(await alwaysNil(site("Labels?"), "let Labels l = new in l.add(\"x\")", {})).toBe(true);
        expect(checkExpression.mock.calls[0][0].context.property.types[0].ballerinaType).toBe("()");
    });

    it("passes a value that can be more than nil, the nil literal, and fields that never take nil", async () => {
        checkExpression.mockResolvedValue(["incompatible types"]);
        expect(await alwaysNil(site("string?"), "a?.b", {})).toBe(false);
        expect(await alwaysNil(site("string?"), "()", {})).toBe(false);
        expect(await alwaysNil(site("string"), "a.b", {})).toBe(false);
        expect(checkExpression).toHaveBeenCalledTimes(1);
    });
});
