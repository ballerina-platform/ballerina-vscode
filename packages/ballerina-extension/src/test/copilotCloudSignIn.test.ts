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

// Copilot's sign-in through WSO2 Integrator, where the `wso2-cloud` session event comes before WSO2 Integrator
// records the sign-in.

const mockCloud = {
    loggedIn: false,
    stored: false,
    sessionsChanged: (() => undefined) as () => void,
    signIn: async () => undefined as void,
};

jest.mock("../utils/cloud-auth", () => ({
    getPlatformGate: async () => ({ isLoggedIn: () => mockCloud.loggedIn }),
    onDidChangeCloudSessions: (listener: () => void) => {
        mockCloud.sessionsChanged = listener;
        return { dispose: () => undefined };
    },
    describeCloudAccess: () => "",
    readCloudAccess: async () => undefined,
}));
jest.mock("../utils/ai/auth", () => ({
    CopilotTokenExchangeUnavailableError: class extends Error {},
    isDevantUserLoggedIn: async () => mockCloud.loggedIn,
    isCopilotTokenExchangeAvailable: () => true,
    exchangeForCopilotToken: async () => ({ accessToken: "copilot" }),
    storeBiIntelCredentials: async () => {
        mockCloud.stored = true;
    },
    getAuthCredentials: async () => (mockCloud.stored ? { loginMethod: "biIntel" } : undefined),
    getAccessToken: async () => ({ accessToken: "copilot" }),
    getLoginMethod: async () => "biIntel",
    clearAuthCredentials: async () => undefined,
}));
jest.mock("../views/ai-panel/utils", () => ({
    checkToken: async () => undefined,
    initiateDevantAuth: async () => {
        await mockCloud.signIn();
        return true;
    },
    logout: jest.fn(),
    validateApiKey: jest.fn(),
    validateAwsCredentials: jest.fn(),
    validateVertexAiCredentials: jest.fn(),
    validateAnthropicAwsCredentials: jest.fn(),
}));
jest.mock("@wso2/ballerina-core", () => ({
    ...jest.requireActual("@wso2/ballerina-core/lib/state-machine-types"),
    SHARED_COMMANDS: {},
}));
jest.mock("../views/ai-panel/webview", () => ({ AiPanelWebview: {} }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
jest.mock("../RPCLayer", () => ({ notifyAiPromptUpdated: jest.fn() }));
jest.mock("../views/closeOrphanWebviewTabs", () => ({ closeOrphanWebviewTabs: jest.fn() }));

import { AIMachineEventType } from "@wso2/ballerina-core/lib/state-machine-types";
import { AIStateMachine } from "../views/ai-panel/aiMachine";

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

async function stateOnceSettled(): Promise<unknown> {
    for (let i = 0; i < 5; i++) {
        await settled();
    }
    return AIStateMachine.state();
}

describe("Copilot sign-in with WSO2 Cloud", () => {
    beforeAll(async () => {
        AIStateMachine.initialize();
        await stateOnceSettled();
    });

    it("completes when the session event comes before WSO2 Integrator records the sign-in", async () => {
        mockCloud.signIn = async () => {
            mockCloud.sessionsChanged();
            mockCloud.loggedIn = true;
        };
        AIStateMachine.sendEvent(AIMachineEventType.LOGIN);

        expect(await stateOnceSettled()).toBe("Authenticated");
    });

    it("signs Copilot out when WSO2 Integrator signs out afterwards", async () => {
        mockCloud.loggedIn = false;
        mockCloud.sessionsChanged();

        expect(await stateOnceSettled()).toBe("Unauthenticated");
    });
});
