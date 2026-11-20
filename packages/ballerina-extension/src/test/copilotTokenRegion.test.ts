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


// A Copilot token is only handed out for the WSO2 Cloud region it was exchanged for.

let cloudEnv = "prod-eu";
let exchanges = 0;
/** Runs during an exchange, before it answers: a region switch meanwhile. */
let duringExchange: () => void = () => undefined;
const secrets = new Map<string, string>();

jest.mock("../utils/cloud-auth", () => ({
    getCloudEnvName: () => cloudEnv,
    getPlatformGate: async () => undefined,
    withPlatformAPI: async (use: (api: unknown) => Promise<unknown>) =>
        use({
            exchangeToken: async () => {
                exchanges++;
                duringExchange();
                return { accessToken: `copilot-${exchanges}`, expiresAt: Date.now() + 3_600_000 };
            },
        }),
    describeCloudAccess: () => "",
    readCloudAccess: async () => undefined,
}));
jest.mock("../features/ai/utils", () => ({ getCopilotTokenExchangeUrl: () => "https://copilot.example.com/auth-api/v1.0/auth/token-exchange" }));
jest.mock("../BalExtensionContext", () => ({
    extension: {
        context: {
            secrets: {
                get: async (key: string) => secrets.get(key),
                store: async (key: string, value: string) => void secrets.set(key, value),
                delete: async (key: string) => void secrets.delete(key),
            },
        },
    },
}));
jest.mock("../utils/config", () => ({ copilotName: () => "Copilot", WI_EXTENSION_ID: "wso2.wso2-integrator" }));
jest.mock("@wso2/ballerina-core", () => ({ LoginMethod: { BI_INTEL: "biIntel" } }));

import { getAccessToken, storeBiIntelCredentials } from "../utils/ai/auth";

const unexpired = () => Date.now() + 3_600_000;

describe("Copilot token and the WSO2 Cloud region", () => {
    beforeEach(() => {
        secrets.clear();
        exchanges = 0;
        duringExchange = () => undefined;
    });

    it("exchanges again a token from before regions, which was production's, once in Europe", async () => {
        cloudEnv = "prod-eu";
        await storeBiIntelCredentials({ accessToken: "legacy", expiresAt: unexpired() } as never);
        const first = await getAccessToken();
        expect((first?.secrets as { accessToken: string; cloudEnv?: string })).toMatchObject({ accessToken: "copilot-1", cloudEnv: "prod-eu" });
        await getAccessToken();
        expect(exchanges).toBe(1);
    });

    it("keeps a token from before regions in production", async () => {
        cloudEnv = "prod";
        await storeBiIntelCredentials({ accessToken: "legacy", expiresAt: unexpired() } as never);
        expect(((await getAccessToken())?.secrets as { accessToken: string }).accessToken).toBe("legacy");
        expect(exchanges).toBe(0);
    });

    it("exchanges again when the region changes while the exchange runs", async () => {
        cloudEnv = "prod";
        await storeBiIntelCredentials({ accessToken: "us", expiresAt: unexpired(), cloudEnv: "prod" } as never);
        cloudEnv = "prod-eu";
        // The first exchange is for Europe, but the person switches back to the United States before it answers.
        duringExchange = () => {
            duringExchange = () => undefined;
            cloudEnv = "prod";
        };
        const token = (await getAccessToken())?.secrets as { accessToken: string; cloudEnv?: string };
        expect(token).toMatchObject({ accessToken: "copilot-2", cloudEnv: "prod" });
    });
});
