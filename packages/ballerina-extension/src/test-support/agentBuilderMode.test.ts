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

// L1: Agent Builder mode selection (docs/agent-builder-test-plan.md, "Mode selection"). The
// host reads WSO2_PRODUCT_MODE from its environment and everything downstream — the state
// machine, the webview title, the assistant identity — branches on the result. The rule
// pinned here: ONLY the exact `agent-builder` value selects Agent Builder; every other
// value, including near-misses, leaves the product in its ordinary non-agent mode.
//
// The negative cases assert "not Agent Builder" rather than naming the mode they do get,
// because which normal mode that is depends on the branch: this branch has two modes
// (integrator/agent-builder), while main has since added a third, Ballerina, chosen by
// which extensions are installed. The rule under test is the same either way, so these
// cases survive that merge. Main carries its own `productMode.test.ts` covering the
// Ballerina-vs-Integrator split; this file is named apart from it so both can coexist.

import type { ProductMode as ProductModeEnum } from "@wso2/ballerina-core";

// The real barrel pulls in a WebSocket LS client that jest cannot load. Every value must
// match the real enum: `getProductMode` tests the variable for membership with
const ProductMode = {
    BALLERINA: "ballerina",
    INTEGRATOR: "integrator",
    AGENT_BUILDER: "agent-builder",
} as unknown as typeof ProductModeEnum;
jest.mock("@wso2/ballerina-core", () => ({
    ProductMode,
    assistantName: (mode: string) => mode,
    shortAssistantName: (mode: string) => mode,
}));

import { getProductMode } from "../utils/config";

const VARIABLE = "WSO2_PRODUCT_MODE";

function setMode(value: string | undefined): void {
    if (value === undefined) {
        delete process.env[VARIABLE];
    } else {
        process.env[VARIABLE] = value;
    }
}

describe("getProductMode", () => {
    const declared = process.env[VARIABLE];

    afterEach(() => setMode(declared));

    it("selects Agent Builder for the exact agent-builder value", () => {
        setMode("agent-builder");

        expect(getProductMode()).toBe(ProductMode.AGENT_BUILDER);
    });

    it.each<[string, string | undefined]>([
        ["unset", undefined],
        ["empty", ""],
        ["the integrator value", "integrator"],
        ["the ballerina value", "ballerina"],
        ["upper-cased", "AGENT-BUILDER"],
        ["mixed-case", "Agent-Builder"],
        ["padded with whitespace", " agent-builder "],
        ["underscored", "agent_builder"],
        ["a prefix of the value", "agent"],
        ["the value with a suffix", "agent-builder-v2"],
        ["a boolean-looking value", "true"],
    ])("stays out of Agent Builder when the variable is %s", (_label, value) => {
        setMode(value);

        expect(getProductMode()).not.toBe(ProductMode.AGENT_BUILDER);
    });

    // The host reads the variable on every call rather than caching it at module load, so a
    // value that arrives late (or a test that sets one) is still honoured.
    it("re-reads the variable on each call", () => {
        setMode("agent-builder");
        expect(getProductMode()).toBe(ProductMode.AGENT_BUILDER);

        setMode("integrator");
        expect(getProductMode()).not.toBe(ProductMode.AGENT_BUILDER);
    });
});
