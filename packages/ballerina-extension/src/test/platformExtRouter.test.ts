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

// L1: the router answers with the manager of the platform WSO2 Integrator works against, read on every call.

let cloudPlatform: string | undefined;
/** What reaching WSO2 Integrator finds out: until then the platform reads as WSO2 Cloud. */
let reached: () => void = () => undefined;

jest.mock("../utils/cloud-auth", () => ({
    getCloudPlatform: () => cloudPlatform,
    getPlatformGate: async () => {
        reached();
        return undefined;
    },
}));
jest.mock("../rpc-managers/platform-ext/rpc-manager", () => ({
    PlatformExtRpcManager: class {
        readonly serves = "wso2-cloud";
    },
}));
jest.mock("../rpc-managers/platform-ext/devant/rpc-manager", () => ({
    DevantPlatformExtRpcManager: class {
        readonly serves = "devant";
    },
}));

import { DEVANT_PLATFORM } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { allPlatformExtManagers, platformExtManager, platformExtManagerReady } from "../rpc-managers/platform-ext/router";

const serves = (manager: unknown) => (manager as { serves: string }).serves;

describe("platformExtManager", () => {
    beforeEach(() => {
        cloudPlatform = undefined;
        reached = () => undefined;
    });

    it("answers with WSO2 Cloud's manager when WSO2 Integrator names no platform", () => {
        expect(serves(platformExtManager())).toBe("wso2-cloud");
    });

    it("answers with Devant's manager while Devant is in use, and follows a switch back", () => {
        const cloud = platformExtManager();
        cloudPlatform = DEVANT_PLATFORM;
        const devant = platformExtManager();
        expect(serves(devant)).toBe("devant");
        expect(platformExtManager()).toBe(devant);
        cloudPlatform = undefined;
        expect(platformExtManager()).toBe(cloud);
    });

    it("hands out both managers, the same ones the calls reach", () => {
        const [cloud, devant] = allPlatformExtManagers();
        expect(platformExtManager()).toBe(cloud);
        cloudPlatform = DEVANT_PLATFORM;
        expect(platformExtManager()).toBe(devant);
    });

    it("waits for WSO2 Integrator before choosing, for a call that can come before any screen has asked", async () => {
        reached = () => {
            cloudPlatform = DEVANT_PLATFORM;
        };
        expect(serves(platformExtManager())).toBe("wso2-cloud");
        expect(serves(await platformExtManagerReady())).toBe("devant");
    });
});
