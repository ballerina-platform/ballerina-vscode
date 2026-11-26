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
jest.mock("../features/ai/expression-assist/tools", () => ({ LOOKUP_TOOLS: [], newLookupState: () => ({}) }));
jest.mock("../features/ai/expression-assist/context", () => ({ checkExpression: (...args: unknown[]) => checkExpression(...args) }));

import { alwaysNil, cannotDoTool, newAttemptState, recordAttempt, secretInValue } from "../features/ai/expression-assist/attempt";

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

const call = (flowCheck: boolean) => {
    const run: { declined?: string; called?: Set<string> } = {};
    const tool = cannotDoTool(run, "test", flowCheck);
    return { run, refuse: (reason: string) => tool.execute!({ reason }, { toolCallId: "t", messages: [] }) };
};

describe("refusal with a flow change on offer", () => {
    it("asks once whether a flow change fits, then accepts the refusal", async () => {
        const { run, refuse } = call(true);
        expect(await refuse("Not about this value.")).toContain("needs_flow_change");
        expect(run.declined).toBeUndefined();
        expect(await refuse("Not about this value.")).toBe("Noted.");
        expect(run.declined).toBe("Not about this value.");
    });

    it("refuses at once where no flow change is offered", async () => {
        const { run, refuse } = call(false);
        expect(await refuse("Not about this value.")).toBe("Noted.");
        expect(run.declined).toBe("Not about this value.");
    });
});

describe("submits sent together", () => {
    it("keeps the first one that compiles", () => {
        const run = newAttemptState<{ expression: string; errors: string[] }>();
        recordAttempt(run, { expression: "os:getEnv(\"HOST\")", errors: [] });
        recordAttempt(run, { expression: "\"localhost\"", errors: [] });
        expect(run.best?.expression).toBe("os:getEnv(\"HOST\")");
    });
});

describe("secrets typed into a value", () => {
    it("flags a secret field written as text, and leaves names and other text alone", () => {
        expect(secretInValue('{key: {path: "/k.p12", password: "changeit"}}')).toMatch(/^password /);
        expect(secretInValue('{tokenUrl: "https://idp/token", clientSecret: "s3cr"}')).toMatch(/^clientSecret /);
        expect(secretInValue("{token: mcpToken}")).toBeUndefined();
        expect(secretInValue('{tokenUrl: "https://idp/token"}')).toBeUndefined();
        expect(secretInValue('{message: "password reset"}')).toBeUndefined();
    });
});
