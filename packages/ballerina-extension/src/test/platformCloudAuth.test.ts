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

// L1: the WSO2 Cloud session helpers decide, from what WSO2 Integrator exports,
// whether cloud features are on. No editor, no network.

import { cloudSessionScopes, isCompatiblePlatformAPI, WSO2_CLOUD_AUTH_PROVIDER_ID } from "../utils/cloud-auth";

describe("cloud-auth", () => {
    it("accepts only the platform contract version this extension speaks", () => {
        expect(isCompatiblePlatformAPI({ apiVersion: 2, isActive: () => true })).toBe(true);
        expect(isCompatiblePlatformAPI({ isActive: () => true, getStsToken: async () => "x" })).toBe(false);
        expect(isCompatiblePlatformAPI({ apiVersion: 1 })).toBe(false);
        expect(isCompatiblePlatformAPI(undefined)).toBe(false);
        expect(isCompatiblePlatformAPI(null)).toBe(false);
    });

    it("requests a session per environment from the wso2-cloud provider", () => {
        expect(WSO2_CLOUD_AUTH_PROVIDER_ID).toBe("wso2-cloud");
        expect(cloudSessionScopes("dev")).toEqual(["env:dev"]);
        expect(cloudSessionScopes("prod")).toEqual(["env:prod"]);
    });
});
