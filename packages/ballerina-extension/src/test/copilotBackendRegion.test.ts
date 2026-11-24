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

// A module, not a script: its names stay its own.
export {};


// The Copilot backend follows the WSO2 Cloud environment WSO2 Integrator works in, which a production region switch changes.

let cloudEnv = "prod";
/** Each environment's Copilot backend, as WSO2 Integrator and the package name them. */
let copilotUrls: Record<string, string> = {};
jest.mock("../utils/cloud-auth", () => ({
    getCloudEnvName: () => cloudEnv,
    getCopilotUrl: (env: string = cloudEnv) => copilotUrls[env] || undefined,
    knownCopilotUrls: () => Object.values(copilotUrls),
}));
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../views/ai-panel/aiMachine", () => ({ AIStateMachine: { service: () => ({ send: jest.fn() }) } }));
jest.mock("../features/config-generator/configGenerator", () => ({}));
jest.mock("../features/ai/activator", () => ({ langClient: {} }));
jest.mock("../utils", () => ({}));
jest.mock("../utils/ai/auth", () => ({}));
jest.mock("@wso2/ballerina-core", () => ({ LoginMethod: { BI_INTEL: "biIntel" } }));
jest.mock("@wso2/ballerina-core/lib/state-machine-types", () => ({ AIMachineEventType: {} }));

import { getBackendUrlFor, getCopilotTokenExchangeUrl, toBackend } from "../features/ai/utils";

const US = "https://us.example.com/copilot";
const EU = "https://eu.example.com/copilot";

describe("Copilot backend across a region switch", () => {
    beforeEach(() => {
        copilotUrls = { prod: US, "prod-eu": EU };
    });

    it("moves a request built on the region left to the backend of the region in use", () => {
        cloudEnv = "prod-eu";
        expect(toBackend(`${US}/llm/v1/claude/messages`)).toBe(`${EU}/llm/v1/claude/messages`);
        expect(toBackend(`${EU}/llm/v1/claude/messages`)).toBe(`${EU}/llm/v1/claude/messages`);
        cloudEnv = "prod";
        expect(toBackend(`${EU}/llm/v1/claude/messages`)).toBe(`${US}/llm/v1/claude/messages`);
    });

    it("leaves a URL on no Copilot backend as it is", () => {
        cloudEnv = "prod-eu";
        expect(toBackend("https://elsewhere.example.com/copilot/x")).toBe("https://elsewhere.example.com/copilot/x");
    });

    it("sends a request to the backend of the region its token was exchanged for, whatever region is in use", () => {
        cloudEnv = "prod";
        expect(toBackend(`${US}/llm/v1/claude/messages`, getBackendUrlFor("prod-eu"))).toBe(`${EU}/llm/v1/claude/messages`);
        cloudEnv = "prod-eu";
        expect(toBackend(`${EU}/llm/v1/claude/messages`, getBackendUrlFor("prod"))).toBe(`${US}/llm/v1/claude/messages`);
    });

    it("tells apart backends whose roots share a prefix", () => {
        copilotUrls = { prod: "https://example.com/copilot", "prod-eu": "https://example.com/copilot-eu" };
        cloudEnv = "prod";
        expect(toBackend("https://example.com/copilot-eu/llm/v1/x")).toBe("https://example.com/copilot/llm/v1/x");
        cloudEnv = "prod-eu";
        expect(toBackend("https://example.com/copilot/llm/v1/x")).toBe("https://example.com/copilot-eu/llm/v1/x");
        expect(toBackend("https://example.com/copilot-eu/llm/v1/x")).toBe("https://example.com/copilot-eu/llm/v1/x");
    });

    it("exchanges only at the backend of the environment in use, and calls production's where an environment has none", () => {
        cloudEnv = "prod-eu";
        expect(getCopilotTokenExchangeUrl()).toBe(`${EU}/auth-api/v1.0/auth/token-exchange`);
        cloudEnv = "stage";
        expect(getCopilotTokenExchangeUrl()).toBeUndefined();
        expect(getBackendUrlFor("stage")).toBe(US);
    });
});
