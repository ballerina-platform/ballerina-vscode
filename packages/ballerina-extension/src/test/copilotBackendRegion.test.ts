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

const US = "https://us.example.com/copilot";
const EU = "https://eu.example.com/copilot";

describe("Copilot backend across a region switch", () => {
    let toCurrentBackend: (url: string) => string;
    const saved = { us: process.env.COPILOT_ROOT_URL, eu: process.env.COPILOT_EU_ROOT_URL };

    beforeAll(() => {
        process.env.COPILOT_ROOT_URL = US;
        process.env.COPILOT_EU_ROOT_URL = EU;
        jest.isolateModules(() => {
            ({ toCurrentBackend } = require("../features/ai/utils"));
        });
    });

    afterAll(() => {
        process.env.COPILOT_ROOT_URL = saved.us;
        process.env.COPILOT_EU_ROOT_URL = saved.eu;
    });

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
});
