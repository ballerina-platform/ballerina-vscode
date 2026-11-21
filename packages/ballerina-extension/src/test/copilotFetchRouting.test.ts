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


// fetchWithAuth sends a Copilot token only to the backend of the region it was exchanged for, on the first send and
// on the retry after a refresh, whatever form the URL comes in.

const US = "https://us.example.com/copilot";
const EU = "https://eu.example.com/copilot";

let cloudEnv = "prod";
let stored: { accessToken: string; cloudEnv: string } = { accessToken: "us-token", cloudEnv: "prod" };
let refreshed: { accessToken: string; cloudEnv: string } = { accessToken: "eu-token", cloudEnv: "prod-eu" };

jest.mock("../utils/cloud-auth", () => ({
    getCloudEnvName: () => cloudEnv,
    getCopilotUrl: (env: string = cloudEnv) => ({ prod: US, "prod-eu": EU } as Record<string, string>)[env],
    knownCopilotUrls: () => [US, EU],
}));
jest.mock("../utils/ai/auth", () => ({
    getAccessToken: async () => ({ loginMethod: "biIntel", secrets: stored }),
    refreshBiIntelSecrets: async () => refreshed,
    copilotTokenEnv: (secrets: { cloudEnv?: string }) => secrets.cloudEnv ?? "prod",
    CopilotTokenExchangeUnavailableError: class extends Error {},
}));
jest.mock("../views/ai-panel/aiMachine", () => ({ AIStateMachine: { service: () => ({ send: jest.fn() }) } }));
jest.mock("../utils/config", () => ({ isInDevant: () => false, getProductMode: () => "integrator" }));
jest.mock("@wso2/ballerina-core", () => ({
    LoginMethod: { BI_INTEL: "biIntel" },
    AIMachineEventType: {},
    ProductMode: { AGENT_BUILDER: "agent-builder" },
}));
jest.mock("@wso2/ballerina-core/lib/state-machine-types", () => ({ AIMachineEventType: {} }));
jest.mock("@ai-sdk/anthropic", () => ({ createAnthropic: jest.fn() }));
jest.mock("@ai-sdk/amazon-bedrock/anthropic", () => ({ createBedrockAnthropic: jest.fn() }));
jest.mock("@ai-sdk/anthropic-aws", () => ({ createAnthropicAws: jest.fn() }));
jest.mock("@ai-sdk/google-vertex/anthropic", () => ({ createVertexAnthropic: jest.fn() }));
jest.mock("ai", () => ({}));
jest.mock("../stateMachine", () => ({ StateMachine: {} }));
jest.mock("../features/config-generator/configGenerator", () => ({}));
jest.mock("../features/ai/activator", () => ({ langClient: {} }));
jest.mock("../utils", () => ({}));

type FetchWithAuth = (input: string | URL | Request, options?: RequestInit) => Promise<Response>;

describe("fetchWithAuth and the WSO2 Cloud region", () => {
    let fetchWithAuth: FetchWithAuth;
    const sent: { url: string; auth: string | undefined }[] = [];
    let answers: number[] = [];
    const realFetch = global.fetch;

    beforeAll(() => {
        ({ fetchWithAuth } = require("../features/ai/utils/ai-client"));
        global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            sent.push({ url, auth: headers.get("Authorization") ?? undefined });
            return new Response("{}", { status: answers.shift() ?? 200 });
        }) as typeof fetch;
    });

    afterAll(() => {
        global.fetch = realFetch;
    });

    beforeEach(() => {
        sent.length = 0;
        answers = [];
    });

    for (const [form, make] of [
        ["a string", (url: string) => url],
        ["a URL", (url: string) => new URL(url)],
        ["a Request", (url: string) => new Request(url, { method: "POST", body: "{}" })],
    ] as const) {
        it(`sends the token to its region's backend, given ${form} on the other region's`, async () => {
            cloudEnv = "prod-eu";
            stored = { accessToken: "us-token", cloudEnv: "prod" };
            await fetchWithAuth(make(`${EU}/llm/v1/claude/messages`));
            expect(sent).toEqual([{ url: `${US}/llm/v1/claude/messages`, auth: "Bearer us-token" }]);
        });

        it(`retries with the refreshed token at that token's region's backend, given ${form}`, async () => {
            cloudEnv = "prod-eu";
            stored = { accessToken: "us-token", cloudEnv: "prod" };
            refreshed = { accessToken: "eu-token", cloudEnv: "prod-eu" };
            answers = [401, 200];
            await fetchWithAuth(make(`${US}/llm/v1/claude/messages`));
            expect(sent).toEqual([
                { url: `${US}/llm/v1/claude/messages`, auth: "Bearer us-token" },
                { url: `${EU}/llm/v1/claude/messages`, auth: "Bearer eu-token" },
            ]);
        });
    }
});
