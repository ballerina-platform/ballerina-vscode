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


// A WSO2 Integrator build with no Copilot backend for the region, or another one, refuses the exchange: that is
// "not available", never a reason to sign out of WSO2 Cloud.

let refusal: unknown;
jest.mock("../utils/cloud-auth", () => ({
    getCloudEnvName: () => "prod-eu",
    withPlatformAPI: async () => {
        throw refusal;
    },
    describeCloudAccess: () => "",
    readCloudAccess: async () => undefined,
    getPlatformGate: () => undefined,
}));
jest.mock("../features/ai/utils", () => ({ getCopilotTokenExchangeUrl: () => "https://eu.example.com/copilot/auth-api/v1.0/auth/token-exchange" }));
jest.mock("../BalExtensionContext", () => ({ extension: {} }));
jest.mock("../utils/config", () => ({ copilotName: () => "Copilot", WI_EXTENSION_ID: "wso2.wso2-integrator" }));
jest.mock("@wso2/ballerina-core", () => ({ LoginMethod: { BI_INTEL: "biIntel" } }));

import { CopilotTokenExchangeUnavailableError, exchangeForCopilotToken } from "../utils/ai/auth";

const cloudError = (code: string, reason: string) => Object.assign(new Error(reason), { cloudError: true, code, details: { reason } });

describe("Copilot token exchange WSO2 Integrator refuses", () => {
    it("is not available when WSO2 Integrator's build has no backend for the region, or names another", async () => {
        for (const refused of [
            cloudError("not_supported", "copilot_token_exchange_not_configured"),
            cloudError("forbidden", "token_exchange_endpoint_refused"),
        ]) {
            refusal = refused;
            await expect(exchangeForCopilotToken()).rejects.toBeInstanceOf(CopilotTokenExchangeUnavailableError);
        }
    });

    it("passes any other failure on as it is", async () => {
        refusal = cloudError("unavailable", "upstream_down");
        await expect(exchangeForCopilotToken()).rejects.toBe(refusal);
    });
});
