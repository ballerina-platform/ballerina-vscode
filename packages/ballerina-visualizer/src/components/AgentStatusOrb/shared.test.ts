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

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { AgentRunStatus } from "@wso2/ballerina-core";

// @wso2/ballerina-core's barrel export (lib/index.js) re-exports WSConnection,
// which requires vscode-ws-jsonrpc — an ESM-only package jest cannot load
// without extra transform config. shared.ts only needs MACHINE_VIEW's keys to
// exist (as property-access targets), not any real value.
jest.mock("@wso2/ballerina-core", () => ({ MACHINE_VIEW: {} }));

import { activeStateLabel, useAgentRunState, __resetAgentRunStatusStoreForTests } from "./shared";

// react-dom/test-utils' act() requires this flag; @testing-library/react sets
// it automatically, but nothing does here since this package doesn't depend on it.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mockRpcClient: any;

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: mockRpcClient }),
}));

function makeStatus(overrides: Partial<AgentRunStatus> = {}): AgentRunStatus {
    return { state: "running", aiPanelOpen: false, timestamp: 0, ...overrides };
}

/** A mock rpcClient plus a `notify` helper standing in for the extension host pushing a live update. */
function makeRpcClient() {
    let pushed: ((status: AgentRunStatus) => void) | undefined;
    const client = {
        getCommonRpcClient: () => ({
            getAgentRunStatus: jest.fn().mockResolvedValue(undefined),
        }),
        onAgentRunStatusChanged: jest.fn((cb: (status: AgentRunStatus) => void) => {
            pushed = cb;
        }),
    };
    return {
        client,
        notify: (status: AgentRunStatus) => {
            if (!pushed) {
                throw new Error("onAgentRunStatusChanged callback was never registered");
            }
            act(() => pushed!(status));
        },
    };
}

describe("useAgentRunState", () => {
    const containers: HTMLDivElement[] = [];
    const roots: Root[] = [];

    function mount(onRender: (state: string | undefined) => void): void {
        function Harness(): null {
            onRender(useAgentRunState());
            return null;
        }
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        containers.push(container);
        roots.push(root);
        act(() => root.render(React.createElement(Harness)));
    }

    beforeEach(() => {
        __resetAgentRunStatusStoreForTests();
        mockRpcClient = undefined;
    });

    afterEach(() => {
        roots.forEach((root) => act(() => root.unmount()));
        containers.forEach((container) => container.remove());
        roots.length = 0;
        containers.length = 0;
    });

    it("returns undefined and never subscribes when rpcClient is absent", () => {
        mockRpcClient = null;
        const onRender = jest.fn();

        mount(onRender);

        expect(onRender).toHaveBeenCalledWith(undefined);
    });

    it("updates when a live AgentRunStatus is pushed through onAgentRunStatusChanged", () => {
        const { client, notify } = makeRpcClient();
        mockRpcClient = client;
        const onRender = jest.fn();
        mount(onRender);

        notify(makeStatus({ state: "awaiting-input" }));

        expect(onRender).toHaveBeenLastCalledWith("awaiting-input");
    });

    it("initializes a subscriber mounted after the cache is warm from the cached status", () => {
        const { client, notify } = makeRpcClient();
        mockRpcClient = client;
        mount(jest.fn());
        notify(makeStatus({ state: "running" }));

        const onRenderSecond = jest.fn();
        mount(onRenderSecond);

        // The very first render (before this subscriber's own effect fires)
        // must already reflect the cache — proving the lazy useState
        // initializer, not just the live subscription, picks it up.
        expect(onRenderSecond.mock.calls[0][0]).toBe("running");
    });

    it("stops receiving updates once unmounted", () => {
        const { client, notify } = makeRpcClient();
        mockRpcClient = client;
        const onRender = jest.fn();
        mount(onRender);
        notify(makeStatus({ state: "running" }));

        const callsBeforeUnmount = onRender.mock.calls.length;
        act(() => roots[0].unmount());
        notify(makeStatus({ state: "error" }));

        expect(onRender.mock.calls.length).toBe(callsBeforeUnmount);
    });
});

describe("activeStateLabel", () => {
    // The orb tooltip and the extension's status bar both render "<product> — <label>",
    // so a label that names the product again stutters: "WSO2 Integration Intelligence —
    // WSO2 Integration Intelligence needs your input".
    it.each(["completed", "running", "awaiting-input", "error", "idle"] as const)(
        "leaves the product name to the surface showing it (%s)",
        (state) => {
            expect(activeStateLabel(makeStatus({ state }))).not.toMatch(/WSO2|Integration Intelligence/);
        }
    );

    it("prefers the live label the extension pushes", () => {
        expect(activeStateLabel(makeStatus({ state: "running", label: "Editing service.bal…" }))).toBe(
            "Editing service.bal…"
        );
    });
});
