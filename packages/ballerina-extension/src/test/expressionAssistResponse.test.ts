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

jest.mock("../features/ai/utils/ai-client", () => ({}));
jest.mock("../features/ai/agent/console-summary", () => ({}));
jest.mock("../features/ai/service/prompt-enhancement/promptEnhancement", () => ({}));
jest.mock("../features/ai/expression-assist/tools", () => ({ LOOKUP_TOOLS: [] }));
jest.mock("../features/ai/expression-assist/run", () => ({}));
jest.mock("../features/ai/expression-assist/context", () => ({}));

import { checkForm, joinCandidates, needsConfigurable, toResponse } from "../features/ai/expression-assist/form";
import { asDeclared, createConfigurableTool, namedIn } from "../features/ai/expression-assist/configurable";
import { handOffRequestErrors } from "../features/ai/expression-assist/attempt";

const run = (verified: boolean) => ({
    verified, stalled: false, failedSubmits: 0, errorsSeen: [], tries: [],
    explanation: "placeholder",
    best: { values: { name: "ReturnRequest" }, groups: {}, imports: {}, actions: [], errors: [] as string[] },
}) as unknown as Parameters<typeof toResponse>[0];

describe("form Copilot response", () => {
    it("shows a verified change rather than an explanation sent beside it", () => {
        expect(toResponse(run(true))).toMatchObject({ values: { name: "ReturnRequest" } });
    });

    it("shows the explanation when nothing verified", () => {
        expect(toResponse(run(false))).toEqual({ explanation: "placeholder" });
    });

    it("passes on the compiler errors when no value compiled, so the main Copilot can take it", () => {
        const stalled = { ...run(false), explanation: undefined, best: { ...run(false).best, errors: ["bad"] } } as Parameters<typeof toResponse>[0];
        expect(toResponse(stalled)).toMatchObject({ errors: ["bad"] });
    });

    it("carries the configurable a value names, for the editor to declare before the value lands", () => {
        const action = { kind: "createConfigurable", name: "botToken", type: "string", documentation: "The bot's token." } as const;
        const proposed = { ...run(true), best: { ...run(true).best, values: { token: "botToken" }, configurables: { token: [action] } } } as Parameters<typeof toResponse>[0];
        expect(toResponse(proposed)).toMatchObject({ values: { token: "botToken" }, valueActions: { token: [action] } });
        expect(toResponse(run(true)).valueActions).toBeUndefined();
    });
});

describe("form Copilot configurable tool", () => {
    const request = (instruction: string, slots: object[] = [], earlier?: string[]) =>
        ({ instruction, earlier, slots }) as unknown as Parameters<typeof needsConfigurable>[0];

    it("is offered when the thread asks for a configurable or the form holds a secret", () => {
        expect(needsConfigurable(request("use a new configurable for the token"))).toBe(true);
        expect(needsConfigurable(request("yes", [], ["read the port from config"]))).toBe(true);
        expect(needsConfigurable(request("set the name", [{ path: "apiKey", credential: true }]))).toBe(true);
    });

    it("is left out of an ordinary request", () => {
        expect(needsConfigurable(request("message like Ann borrowed 3 books", [{ path: "message" }]))).toBe(false);
    });
});

describe("a new configurable's name", () => {
    // The check compiles the name where the value goes, as the language server reports it.
    const propose = async (nameErrors: string[]) => {
        const onWhole = jest.fn();
        const check = async (expression: string) => (expression === "apiKey" ? nameErrors : []);
        const reply = await createConfigurableTool(check, onWhole, jest.fn()).execute!(
            { name: "apiKey", type: "string", documentation: "", useFieldValue: true }, { toolCallId: "1", messages: [] });
        return { reply, declared: onWhole.mock.calls.length > 0 };
    };

    it("is free only when the name is undefined here", async () => {
        expect(await propose(["undefined symbol 'apiKey'"])).toEqual({ reply: "OK", declared: true });
    });

    it("is refused when the name is declared with another type, or is a keyword", async () => {
        expect(await propose(["incompatible types: expected 'string', found 'int'"])).toMatchObject({ declared: false, reply: expect.stringMatching(/Pick another name/) });
        expect(await propose(["invalid token 'type'"])).toMatchObject({ declared: false });
        expect(await propose([])).toMatchObject({ declared: false, reply: expect.stringMatching(/already exists/) });
    });
});

describe("configurables inside a value", () => {
    const token = { kind: "createConfigurable", name: "mcpToken", type: "string", documentation: "" } as const;

    it("finds the new configurables a value names, as whole words", () => {
        expect(namedIn("{token: mcpToken}", [token])).toEqual([token]);
        expect(namedIn("{token: mcpTokenOld}", [token])).toEqual([]);
    });

    it("declares them around the value for the check", () => {
        expect(asDeclared("{token: mcpToken}", [token])).toBe("let string mcpToken = <string><any>() in ({token: mcpToken})");
        expect(asDeclared("crmBaseUrl", [])).toBe("crmBaseUrl");
    });
});

describe("form Copilot hand-off request", () => {
    it("accepts a request in the user's voice", () => {
        expect(handOffRequestErrors("Add memory to supportAgent that keeps the last 20 messages.")).toEqual([]);
    });

    it("refuses advice and talk about the user or the form", () => {
        expect(handOffRequestErrors("Please confirm with the user before changing the agent.")).toHaveLength(1);
        expect(handOffRequestErrors("This form cannot add memory; ask Copilot to add it.")).toHaveLength(1);
        expect(handOffRequestErrors("Should I add memory to supportAgent?")).toHaveLength(1);
    });
});

describe("form Copilot focused on one field", () => {
    const slot = (path: string, label: string) => ({ path, label, value: "", optional: false, property: { types: [] } });
    const req = (focused: boolean) => ({
        slots: [slot("properties.expression", "Expression"), slot("properties.variable", "Name")],
        groups: [],
        ...(focused ? { focus: { key: "expression", label: "Expression" } } : {}),
    }) as unknown as Parameters<typeof checkForm>[0];
    const errorsOf = async (focused: boolean) => {
        const candidate = { values: { "properties.expression": "1" }, groups: {}, imports: {}, actions: [], errors: [] } as unknown as Parameters<typeof checkForm>[1];
        await checkForm(req(focused), candidate, [], { searches: 0, modules: new Map(), seen: [] }, []);
        return candidate.errors;
    };
    const quiet = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    afterAll(() => quiet.mockRestore());

    it("leaves another empty required field alone", async () => {
        expect((await errorsOf(true)).some((error) => error.startsWith("properties.variable"))).toBe(false);
    });

    it("still asks for every empty required field when the whole form is filled", async () => {
        expect(await errorsOf(false)).toContain("properties.variable (Name): needs a value");
    });
});

describe("a submit and a hand-off sent together", () => {
    it("hand off with the submitted values, and drop the skipped part the hand-off covers", () => {
        const submit = { values: { "properties.maxIter": "5" }, groups: {}, imports: {}, actions: [], note: "Limits it to 5 iterations.", skipped: "memory", errors: [] };
        const handOff = { values: {}, groups: {}, imports: {}, actions: [], note: "", flowChange: { reason: "r", request: "Add a memory." }, errors: [] };
        const joined = joinCandidates(handOff, submit);
        expect(joined.values).toEqual({ "properties.maxIter": "5" });
        expect(joined.flowChange?.request).toBe("Add a memory.");
        expect(joined.skipped).toBeUndefined();
    });
});
