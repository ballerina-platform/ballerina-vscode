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


// Where the AI panel goes when the WSO2 Cloud region in use has no Copilot backend, driven through a real xstate
// machine built from the transition aiMachine.ts uses.

jest.mock("../utils/ai/auth", () => {
    class CopilotTokenExchangeUnavailableError extends Error {}
    return { CopilotTokenExchangeUnavailableError };
});

import { createMachine, interpret } from "xstate";
import { CopilotTokenExchangeUnavailableError } from "../utils/ai/auth";
import { copilotUnavailableTransition } from "../views/ai-panel/copilot-unavailable-transition";

interface PanelContext {
    loginMethod?: string;
    userToken?: unknown;
    errorMessage?: string;
}

/** Runs the token check, failing with `error`, to the state it reaches; `cleared` counts the credential clears. */
function checkFailingWith(error: Error, cleared: { count: number }): Promise<{ state: string; context: PanelContext }> {
    const machine = createMachine<PanelContext>(
        {
            id: "ai",
            initial: "Initialize",
            predictableActionArguments: true,
            context: { loginMethod: "biIntel", userToken: { credentials: {} }, errorMessage: "earlier" },
            states: {
                Initialize: {
                    invoke: {
                        src: () => Promise.reject(error),
                        onError: [copilotUnavailableTransition() as never, { target: "Disabled" }],
                    },
                },
                Unauthenticated: {},
                Disabled: {},
            },
        },
        { actions: { clearCopilotCredentials: () => void cleared.count++ } },
    );
    return new Promise((resolve) => {
        const service = interpret(machine).onTransition((state) => {
            if (!state.matches("Initialize")) {
                resolve({ state: String(state.value), context: state.context });
                service.stop();
            }
        });
        service.start();
    });
}

describe("AI panel when the region has no Copilot backend", () => {
    it("goes to the sign-in view, dropping only the Copilot token, with no error on the panel", async () => {
        const cleared = { count: 0 };
        const { state, context } = await checkFailingWith(new CopilotTokenExchangeUnavailableError(), cleared);
        expect(state).toBe("Unauthenticated");
        expect(cleared.count).toBe(1);
        expect(context).toEqual({ loginMethod: undefined, userToken: undefined, errorMessage: undefined });
    });

    it("leaves any other failure to the transitions after it", async () => {
        const cleared = { count: 0 };
        const { state } = await checkFailingWith(new Error("Error in establishing Connection"), cleared);
        expect(state).toBe("Disabled");
        expect(cleared.count).toBe(0);
    });
});
