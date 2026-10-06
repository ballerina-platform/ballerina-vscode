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

// L2: mode loading (docs/agent-builder-test-plan.md, "Component tests"). A webview asks the
// host once whether Agent Builder is on, and what it renders follows the answer; a failed ask
// leaves it out of Agent Builder rather than blank. Asserted through the hook rather than one
// view so every mode-gated view (overview, forms, chat identity) inherits the rule from the
// single place that decides it.
//
// The negative cases assert "not Agent Builder" rather than naming the mode they do get,
// because which normal mode that is depends on the branch: this branch has two modes
// (integrator/agent-builder), while main has since added a third, Ballerina, chosen by a
// second question to the host about the platform extension. Agent Builder is an explicit
// opt-in that outranks that question either way, so these cases survive the merge; the
// Integrator-vs-Ballerina split is main's own concern and is covered by its own test.

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";

// The core barrel re-exports ESM-only LS transport modules jest cannot load; the hook
// reads the enum and the naming helpers. BALLERINA is declared here so the mock matches
// the post-merge enum too — this branch's hook simply never returns it.
enum MockProductMode {
    BALLERINA = "ballerina",
    INTEGRATOR = "integrator",
    AGENT_BUILDER = "agent-builder",
}

jest.mock("@wso2/ballerina-core", () => ({
    ProductMode: MockProductMode,
    // Exported by the core barrel after the merge; this branch's hook seeds from its own
    // local helper and ignores this, so providing it is harmless in both worlds.
    seededProductMode: () => {
        const value = (window as unknown as { productMode?: string }).productMode;
        return Object.values(MockProductMode).includes(value as MockProductMode) ? value : undefined;
    },
    assistantName: (mode: MockProductMode) => mode,
    shortAssistantName: (mode: MockProductMode) => mode,
    assistantTagline: (mode: MockProductMode) => mode,
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

import { TestRpcContext } from "../test/rpcHarness";
import { __resetProductModeForTests, useProductMode } from "./useProductMode";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The smallest mode-gated component: it renders whatever mode the hook settles on. */
function Probe() {
    return <output>{useProductMode()}</output>;
}

/**
 * `platformAnswer` backs the second question the post-merge hook asks to tell the Integrator
 * from a plain Ballerina install. This branch's hook never asks it; it is supplied so the
 * client has the same shape in both worlds.
 */
function makeRpcClient(answer: () => Promise<boolean>, platformAnswer: () => Promise<boolean> = async () => true) {
    const agentBuilderModeEnabled = jest.fn(answer);
    const isPlatformExtensionAvailable = jest.fn(platformAnswer);
    const client = {
        getCommonRpcClient: () => ({ agentBuilderModeEnabled }),
        getAiPanelRpcClient: () => ({ isPlatformExtensionAvailable }),
    };
    return { client, agentBuilderModeEnabled, isPlatformExtensionAvailable };
}

const seed = window as unknown as { productMode?: string };

describe("useProductMode", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        delete seed.productMode;
        __resetProductModeForTests();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        delete seed.productMode;
        __resetProductModeForTests();
    });

    const renderProbe = async (rpcClient: unknown): Promise<string | null> => {
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <Probe />
                </TestRpcContext.Provider>
            );
        });
        // Let the host answer land.
        await act(async () => undefined);
        return container.querySelector("output")!.textContent;
    };

    // Agent Builder is an explicit opt-in, so a host that reports it enabled wins outright.
    it("loads as Agent Builder when the host reports the mode enabled", async () => {
        const { client } = makeRpcClient(async () => true, async () => false);

        expect(await renderProbe(client)).toBe(MockProductMode.AGENT_BUILDER);
    });

    it.each<[string, () => Promise<boolean>, () => Promise<boolean>]>([
        ["the host reports it disabled and the platform extension is there", async () => false, async () => true],
        ["the host reports it disabled and the platform extension is absent", async () => false, async () => false],
        [
            "the host cannot be asked",
            async () => {
                throw new Error("rpc unavailable");
            },
            async () => true,
        ],
    ])("stays out of Agent Builder when %s", async (_label, answer, platformAnswer) => {
        const { client } = makeRpcClient(answer, platformAnswer);

        expect(await renderProbe(client)).not.toBe(MockProductMode.AGENT_BUILDER);
    });

    // The host seeds `window.productMode` into the webview HTML so the first paint is already
    // in the right mode; a seeded webview must not fall back to the slower round trip.
    it("uses the mode seeded on the window without asking the host", async () => {
        seed.productMode = MockProductMode.AGENT_BUILDER;
        __resetProductModeForTests();
        const { client, agentBuilderModeEnabled, isPlatformExtensionAvailable } = makeRpcClient(async () => false);

        expect(await renderProbe(client)).toBe(MockProductMode.AGENT_BUILDER);
        expect(agentBuilderModeEnabled).not.toHaveBeenCalled();
        expect(isPlatformExtensionAvailable).not.toHaveBeenCalled();
    });
});
