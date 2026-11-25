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

jest.mock("../features/ai/expression-assist/tools", () => ({ LOOKUP_TOOLS: [] }));
jest.mock("../features/ai/expression-assist/context", () => ({}));

import { cannotDoTool } from "../features/ai/expression-assist/attempt";

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
