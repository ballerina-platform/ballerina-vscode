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

// L2 / C11: the tracing control. Two providers are mutually exclusive — the IDE's own and the
// Agent Manager's — and the UI shows them as separate switches, so what matters is that the
// hook maps one active provider onto the right switch and sends the right command when either
// is flipped. A wrong mapping shows tracing as off while it is running, or vice versa.

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";

// The core barrel re-exports an ESM-only LS transport jest cannot load. The module under test
// also exports the product-mode helpers, which read these.
jest.mock("@wso2/ballerina-core", () => ({
    ProductMode: { BALLERINA: "ballerina", INTEGRATOR: "integrator", AGENT_BUILDER: "agent-builder" },
    seededProductMode: (): undefined => undefined,
    assistantName: (m: string) => m,
    shortAssistantName: (m: string) => m,
    assistantTagline: (m: string) => m,
}));
jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: (): { rpcClient: undefined } => ({ rpcClient: undefined }),
}));

import { AGENT_MANAGER_TRACING_PROVIDER, TracingStatus, useTracingStatus } from "./useProductMode";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT = "/w/orders";
const IDE_PROVIDER = "idetraceprovider";

function makeRpcClient(status: { enabled: boolean; provider?: string } | Error) {
    const getTracingStatus = jest.fn(async (): Promise<{ enabled: boolean; provider?: string }> => {
        if (status instanceof Error) {
            throw status;
        }
        return status;
    });
    const executeCommand = jest.fn(async (): Promise<undefined> => undefined);
    const client = {
        getAgentChatRpcClient: () => ({ getTracingStatus, onTracingStatusChanged: jest.fn() }),
        getCommonRpcClient: () => ({ executeCommand }),
    };
    return { client: client as never, getTracingStatus, executeCommand };
}

describe("useTracingStatus", () => {
    let container: HTMLDivElement;
    let root: Root;
    let latest: TracingStatus;

    function Probe({ rpcClient }: { rpcClient: never }): null {
        latest = useTracingStatus(rpcClient, PROJECT);
        return null;
    }

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const mount = async (rpcClient: never) => {
        await act(async () => {
            root.render(<Probe rpcClient={rpcClient} />);
        });
        // The hook asks the host for the current status on mount.
        await act(async () => undefined);
    };

    it.each<[string, { enabled: boolean; provider?: string } | Error, boolean, boolean]>([
        ["tracing is off", { enabled: false }, false, false],
        ["the IDE provider is active", { enabled: true, provider: IDE_PROVIDER }, true, false],
        ["the Agent Manager provider is active", { enabled: true, provider: AGENT_MANAGER_TRACING_PROVIDER }, false, true],
        // Enabled with no provider named is the IDE's own, which is what the host used to
        // report before the second provider existed.
        ["enabled with no provider named", { enabled: true }, true, false],
        // A failed lookup must read as off rather than leaving the switches in a stale state.
        ["the host cannot be asked", new Error("rpc unavailable"), false, false],
    ])("shows the right switches when %s", async (_label, status, ide, amp) => {
        const { client } = makeRpcClient(status);

        await mount(client);

        expect(latest.isTracingEnabled).toBe(ide);
        expect(latest.ampTracingEnabled).toBe(amp);
    });

    // The two providers are mutually exclusive, so turning one on is never additive.
    it("never reports both providers at once", async () => {
        const { client } = makeRpcClient({ enabled: true, provider: AGENT_MANAGER_TRACING_PROVIDER });

        await mount(client);

        expect(latest.isTracingEnabled && latest.ampTracingEnabled).toBe(false);
    });

    it("turns the IDE provider on when tracing is off", async () => {
        const { client, executeCommand } = makeRpcClient({ enabled: false });
        await mount(client);

        await act(async () => {
            await latest.toggleTracing();
        });

        expect(executeCommand).toHaveBeenCalledWith({ commands: ["ballerina.enableTracing", false] });
    });

    it("turns tracing off when the IDE provider is already on", async () => {
        const { client, executeCommand } = makeRpcClient({ enabled: true, provider: IDE_PROVIDER });
        await mount(client);

        await act(async () => {
            await latest.toggleTracing();
        });

        expect(executeCommand).toHaveBeenCalledWith({ commands: ["ballerina.disableTracing"] });
    });

    // The second element of the command is the flag that picks the Agent Manager provider over
    // the IDE's, which is the whole difference between the two enable paths.
    it("selects the Agent Manager provider by its flag", async () => {
        const { client, executeCommand } = makeRpcClient({ enabled: false });
        await mount(client);

        await act(async () => {
            await latest.setAmpTracingEnabled(true);
        });

        expect(executeCommand).toHaveBeenCalledWith({ commands: ["ballerina.enableTracing", true] });
    });

    it("disables rather than switching when the Agent Manager provider is turned off", async () => {
        const { client, executeCommand } = makeRpcClient({ enabled: true, provider: AGENT_MANAGER_TRACING_PROVIDER });
        await mount(client);

        await act(async () => {
            await latest.setAmpTracingEnabled(false);
        });

        expect(executeCommand).toHaveBeenCalledWith({ commands: ["ballerina.disableTracing"] });
    });

    // The hook re-reads the status after every change, so the switch reflects what the host
    // actually did rather than what was asked for.
    it("re-reads the status after changing it", async () => {
        const { client, getTracingStatus } = makeRpcClient({ enabled: false });
        await mount(client);
        const onMount = getTracingStatus.mock.calls.length;

        await act(async () => {
            await latest.toggleTracing();
        });

        expect(getTracingStatus.mock.calls.length).toBeGreaterThan(onMount);
    });
});
