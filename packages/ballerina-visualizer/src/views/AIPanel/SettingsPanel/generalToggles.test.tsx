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

// L2: every switch in the General section of Copilot settings is a view of a host
// `ballerina.copilot.*` setting — it starts from what the host reports, asks the host to
// flip it, and falls back to the old value when the host refuses. The orb goes through its
// own RPC (the host drives the orb from it); the rest share one generic setter.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The core barrel pulls in ESM-only LS transport modules that jest cannot load.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    AIMachineEventType: { LOGOUT: "LOGOUT" },
    ProductMode: { BALLERINA: "ballerina", INTEGRATOR: "integrator", AGENT_BUILDER: "agent-builder" },
    seededProductMode: () => "integrator",
    assistantName: () => "WSO2 Integrator Copilot",
    shortAssistantName: () => "Integrator Copilot",
    assistantTagline: () => "",
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = jest.requireActual("../../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("@wso2/ui-toolkit", () => {
    const react = jest.requireActual<typeof React>("react");
    const Stub = ({ children }: { children?: React.ReactNode }) => react.createElement("span", null, children);
    return { __esModule: true, Button: Stub, Codicon: Stub, Icon: Stub };
});

import { TestRpcContext } from "../../../test/rpcHarness";
import { SettingsPanel } from "./index";

const CHAT_TOGGLES = [
    ["Follow-up suggestions", "followupSuggestions"],
] as const;

function makeRpcClient(orbVisible: boolean, chatValue = orbVisible) {
    const setCopilotOrbVisible = jest.fn().mockResolvedValue(undefined);
    const setCopilotToggleSetting = jest.fn().mockResolvedValue(undefined);
    const api = {
        getCopilotOrbVisible: jest.fn().mockResolvedValue(orbVisible),
        setCopilotOrbVisible,
        getCopilotToggleSettings: jest.fn().mockResolvedValue({
            followupSuggestions: chatValue,
        }),
        setCopilotToggleSetting,
        getMcpToolsEnabled: jest.fn().mockResolvedValue(false),
        listMcpServers: jest.fn().mockResolvedValue([]),
        getSkills: jest.fn().mockResolvedValue({ skills: [] }),
        getAgentsMdFileInfo: jest.fn().mockResolvedValue(null),
        isCopilotSignedIn: jest.fn().mockResolvedValue(false),
    };
    const client = {
        getAiPanelRpcClient: () => api,
        onMcpServersChanged: (): (() => void) => (): void => undefined,
        onAgentsMdFileInfoChanged: (): (() => void) => (): void => undefined,
    };
    return { client, setCopilotOrbVisible, setCopilotToggleSetting };
}

describe("SettingsPanel General toggles", () => {
    let container: HTMLDivElement;
    let root: Root;

    const switchFor = (label: string) =>
        container.querySelector(`[role='switch'][aria-label='${label}']`) as HTMLButtonElement;
    const orbSwitch = () => switchFor("Show Copilot orb");

    async function render(client: ReturnType<typeof makeRpcClient>["client"]): Promise<void> {
        await act(async () => {
            root.render(
                React.createElement(
                    TestRpcContext.Provider,
                    { value: { rpcClient: client } },
                    React.createElement(SettingsPanel, { onClose: () => undefined })
                )
            );
        });
    }

    async function click(element: HTMLElement): Promise<void> {
        await act(async () => {
            element.click();
        });
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

    it.each([true, false])("reflects the host's setting (%s) and flips it on click", async (visible) => {
        const rpc = makeRpcClient(visible);
        await render(rpc.client);

        expect(orbSwitch().getAttribute("aria-checked")).toBe(String(visible));

        await click(orbSwitch());

        expect(rpc.setCopilotOrbVisible).toHaveBeenCalledWith({ visible: !visible });
        expect(orbSwitch().getAttribute("aria-checked")).toBe(String(!visible));
    });

    it("rolls back when the host rejects the change", async () => {
        const rpc = makeRpcClient(true);
        rpc.setCopilotOrbVisible.mockRejectedValueOnce(new Error("settings are read-only"));
        await render(rpc.client);

        await click(orbSwitch());

        expect(rpc.setCopilotOrbVisible).toHaveBeenCalledWith({ visible: false });
        expect(orbSwitch().getAttribute("aria-checked")).toBe("true");
    });

    describe.each(CHAT_TOGGLES)("%s", (label, key) => {
        it.each([true, false])("reflects the host's setting (%s) and flips it on click", async (value) => {
            const rpc = makeRpcClient(true, value);
            await render(rpc.client);

            expect(switchFor(label).getAttribute("aria-checked")).toBe(String(value));

            await click(switchFor(label));

            expect(rpc.setCopilotToggleSetting).toHaveBeenCalledWith({ key, value: !value });
            expect(rpc.setCopilotOrbVisible).not.toHaveBeenCalled();
            expect(switchFor(label).getAttribute("aria-checked")).toBe(String(!value));
        });

        it("rolls back when the host rejects the change", async () => {
            const rpc = makeRpcClient(true, true);
            rpc.setCopilotToggleSetting.mockRejectedValueOnce(new Error("settings are read-only"));
            await render(rpc.client);

            await click(switchFor(label));

            expect(rpc.setCopilotToggleSetting).toHaveBeenCalledWith({ key, value: false });
            expect(switchFor(label).getAttribute("aria-checked")).toBe("true");
        });
    });

    it("lists General between Customize Copilot and the sign-in sections", async () => {
        await render(makeRpcClient(true).client);

        const headers = Array.from(container.querySelectorAll("h3"), (h) => h.textContent);
        expect(headers).toEqual(["Customize Integrator Copilot", "General", "Integrations", "Account"]);
    });
});
