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

// The orb draws before the orb-style setting arrives over RPC, so the style it starts with comes
// from the product the host seeded into the page: Agent Builder's own orb there, animated elsewhere.

jest.mock("@wso2/ballerina-core", () => ({
    MACHINE_VIEW: {},
    ProductMode: { BALLERINA: "ballerina", INTEGRATOR: "integrator", AGENT_BUILDER: "agent-builder" },
    seededProductMode: () => (window as unknown as { productMode?: string }).productMode,
}));

jest.mock("@wso2/ballerina-rpc-client", () => ({ useRpcContext: () => ({}) }));

type Shared = typeof import("./shared");

function loadShared(mode: string | undefined): Shared {
    (window as unknown as { productMode?: string }).productMode = mode;
    let shared: Shared;
    jest.isolateModules(() => {
        shared = require("./shared");
    });
    return shared;
}

afterEach(() => {
    (window as unknown as { productMode?: string }).productMode = undefined;
});

describe("the orb style before the setting arrives", () => {
    it.each([
        ["agent-builder", "solid"],
        ["integrator", "animated"],
        ["ballerina", "animated"],
        [undefined, "animated"],
    ])("in %s mode is %s", (mode, style) => {
        expect(loadShared(mode).getOrbTheme()).toBe(style);
    });

    it("gives way to the setting once it arrives", () => {
        const shared = loadShared("agent-builder");
        shared.setOrbTheme(shared.orbThemeFromSetting("animated"));
        expect(shared.getOrbTheme()).toBe("animated");
    });

    it("accepts the solid style from the setting", () => {
        expect(loadShared("integrator").orbThemeFromSetting("solid")).toBe("solid");
    });
});
