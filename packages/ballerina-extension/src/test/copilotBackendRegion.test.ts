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


// The Copilot backend follows the WSO2 Cloud environment WSO2 Integrator works in, which a production region switch changes.

let cloudEnv = "prod";
jest.mock("../utils/cloud-auth", () => ({ getCloudEnvName: () => cloudEnv }));
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../views/ai-panel/aiMachine", () => ({ AIStateMachine: { service: () => ({ send: jest.fn() }) } }));
jest.mock("../features/config-generator/configGenerator", () => ({}));
jest.mock("../features/ai/activator", () => ({ langClient: {} }));
jest.mock("../utils", () => ({}));
jest.mock("../utils/ai/auth", () => ({}));
jest.mock("@wso2/ballerina-core", () => ({ LoginMethod: { BI_INTEL: "biIntel" } }));
jest.mock("@wso2/ballerina-core/lib/state-machine-types", () => ({ AIMachineEventType: {} }));

/** `toCurrentBackend` of a build whose United States and Europe Copilot backends are `us` and `eu`. */
function buildWith(us: string, eu: string): (url: string) => string {
    const saved = { COPILOT_ROOT_URL: process.env.COPILOT_ROOT_URL, COPILOT_EU_ROOT_URL: process.env.COPILOT_EU_ROOT_URL };
    process.env.COPILOT_ROOT_URL = us;
    process.env.COPILOT_EU_ROOT_URL = eu;
    let toCurrentBackend: (url: string) => string = (url) => url;
    try {
        jest.isolateModules(() => {
            ({ toCurrentBackend } = require("../features/ai/utils"));
        });
    } finally {
        // A variable that was not set is removed again: assigning undefined would set the string "undefined".
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
    return toCurrentBackend;
}

describe("Copilot backend across a region switch", () => {
    const US = "https://us.example.com/copilot";
    const EU = "https://eu.example.com/copilot";
    const toCurrentBackend = buildWith(US, EU);

    it("moves a request built on the region left to the backend of the region in use", () => {
        cloudEnv = "prod-eu";
        expect(toCurrentBackend(`${US}/llm/v1/claude/messages`)).toBe(`${EU}/llm/v1/claude/messages`);
        expect(toCurrentBackend(`${EU}/llm/v1/claude/messages`)).toBe(`${EU}/llm/v1/claude/messages`);
        cloudEnv = "prod";
        expect(toCurrentBackend(`${EU}/llm/v1/claude/messages`)).toBe(`${US}/llm/v1/claude/messages`);
    });

    it("leaves a URL on no Copilot backend as it is", () => {
        cloudEnv = "prod-eu";
        expect(toCurrentBackend("https://elsewhere.example.com/copilot/x")).toBe("https://elsewhere.example.com/copilot/x");
    });

    it("tells apart backends whose roots share a prefix", () => {
        const sharing = buildWith("https://example.com/copilot", "https://example.com/copilot-eu");
        cloudEnv = "prod";
        expect(sharing("https://example.com/copilot-eu/llm/v1/x")).toBe("https://example.com/copilot/llm/v1/x");
        cloudEnv = "prod-eu";
        expect(sharing("https://example.com/copilot/llm/v1/x")).toBe("https://example.com/copilot-eu/llm/v1/x");
        expect(sharing("https://example.com/copilot-eu/llm/v1/x")).toBe("https://example.com/copilot-eu/llm/v1/x");
    });
});
