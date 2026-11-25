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

import { toResponse } from "../features/ai/expression-assist/form";
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
        const proposed = { ...run(true), best: { ...run(true).best, values: { token: "botToken" }, configurables: { token: action } } } as Parameters<typeof toResponse>[0];
        expect(toResponse(proposed)).toMatchObject({ values: { token: "botToken" }, valueActions: { token: [action] } });
        expect(toResponse(run(true)).valueActions).toBeUndefined();
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
