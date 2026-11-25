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

import { act, renderHook } from "@testing-library/react";
import { ExpressionAssistResponse } from "@wso2/ballerina-core";
import { useFieldAssist } from "./FieldAssist";

const ask = async (response: ExpressionAssistResponse, continueInChat?: jest.Mock) => {
    const { result } = renderHook(() => useFieldAssist({ assist: async () => response, getValue: () => "new ()", continueInChat }));
    await act(async () => {
        result.current.submit("pass tier GOLD");
    });
    return result;
};

describe("field Copilot hand-off to the main Copilot", () => {
    it("offers a change outside the form and sends its request with the user's words", async () => {
        const toChat = jest.fn();
        const result = await ask({ flowChange: { reason: "It needs a step before the agent runs.", request: "Create a context with tier GOLD." } }, toChat);
        expect(result.current.state.handoff?.request).toBe("Create a context with tier GOLD.");
        result.current.toChat();
        expect(toChat).toHaveBeenCalledWith("Create a context with tier GOLD.", expect.stringContaining("\"pass tier GOLD\""));
        expect(toChat.mock.calls[0][1]).toContain("It needs a step before the agent runs.");
    });

    it("offers the user's request when no value compiled", async () => {
        const toChat = jest.fn();
        const result = await ask({ error: "Couldn't find a value that works here: bad", errors: ["bad"] }, toChat);
        expect(result.current.state.failed).toEqual(["bad"]);
        expect(result.current.state.error).toBeUndefined();
        result.current.toChat();
        expect(toChat).toHaveBeenCalledWith("pass tier GOLD", expect.stringContaining("bad"));
    });

    it("keeps the error where nothing can take the request", async () => {
        const result = await ask({ error: "Couldn't find a value that works here: bad", errors: ["bad"] });
        expect(result.current.state.failed).toBeUndefined();
        expect(result.current.state.error).toBe("Couldn't find a value that works here: bad");
    });
});
