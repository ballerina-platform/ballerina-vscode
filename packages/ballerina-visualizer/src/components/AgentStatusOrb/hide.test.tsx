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

// Right-clicking the orb offers to hide it; the extension then turns off
// `ballerina.copilot.showOrb` and the editor title bar's Copilot button takes over. What
// these cases pin: the menu only asks the host to hide (the orb stays until the host says
// so), a hidden status keeps the orb and its presence off screen, and coming back — from
// the Copilot settings toggle — returns an idle orb without opening any chat.

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { AgentRunStatus } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () => ({
    MACHINE_VIEW: {},
    SHARED_COMMANDS: {
        OPEN_AI_PANEL: "ballerina.open.ai.panel",
        HIDE_COPILOT_ORB: "ballerina.copilot.hideOrb",
    },
    ProductMode: { BALLERINA: "ballerina", INTEGRATOR: "integrator", AGENT_BUILDER: "agent-builder" },
    // Seeded, so the orb never goes asking the host for the product mid-test.
    seededProductMode: () => "integrator",
    assistantName: () => "WSO2 Integrator Copilot",
    shortAssistantName: () => "Integrator Copilot",
    assistantTagline: () => "",
}));

let mockRpcClient: ReturnType<typeof makeRpcClient>["client"] | undefined;

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: mockRpcClient }),
}));

jest.mock("./CopilotOrb", () => ({ CopilotOrb: (): null => null }));
jest.mock("@wso2/ui-toolkit", () => ({ Icon: (): null => null }));
jest.mock("./MiniChat", () => ({
    MiniChat: () => {
        const react = jest.requireActual<typeof React>("react");
        return react.createElement("div", { "data-testid": "mini-chat" });
    },
}));

import { AgentStatusOrb } from "./index";
import {
    __resetAgentRunStatusStoreForTests,
    requestMiniChatOpen,
    subscribeAmbientCopilotPresence,
    useSuppressAgentStatusOrb,
} from "./shared";
import { createMiniChatPrompt } from "./promptHandoff";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const IDLE = { state: "idle", aiPanelOpen: false, timestamp: 0 } as AgentRunStatus;
const HIDDEN = { ...IDLE, orbHidden: true } as AgentRunStatus;

function makeRpcClient() {
    let pushed: ((status: AgentRunStatus) => void) | undefined;
    const executeCommand = jest.fn().mockResolvedValue(undefined);
    const openAIPanel = jest.fn().mockResolvedValue(undefined);
    const common = {
        getAgentRunStatus: jest.fn().mockResolvedValue(undefined),
        getCopilotOrbTheme: jest.fn().mockResolvedValue("animated"),
        executeCommand,
    };
    const client = {
        getCommonRpcClient: () => common,
        getAiPanelRpcClient: () => ({ openAIPanel }),
        onAgentRunStatusChanged: jest.fn((cb: (status: AgentRunStatus) => void) => {
            pushed = cb;
        }),
    };
    return {
        client,
        executeCommand,
        openAIPanel,
        notify: (status: AgentRunStatus) => act(() => pushed!(status)),
    };
}

/** Stands in for a view that opts out of the orb (a form, a wizard). */
function SuppressingView({ suppressed }: { suppressed: boolean }): null {
    useSuppressAgentStatusOrb(suppressed);
    return null;
}

describe("AgentStatusOrb hide", () => {
    let container: HTMLDivElement;
    let root: Root;
    let rpc: ReturnType<typeof makeRpcClient>;
    let present: boolean;
    let unsubscribePresence: () => void;

    const orb = () => container.querySelector("button[aria-label*='mini chat']") as HTMLButtonElement | null;
    const menuItem = () => container.querySelector("[role='menuitem']") as HTMLButtonElement | null;
    const miniChat = () => container.querySelector("[data-testid='mini-chat']");
    const openAiPanelCalls = () =>
        rpc.executeCommand.mock.calls.filter(([arg]) => arg.commands[0] === "ballerina.open.ai.panel");

    function render(suppressed = false): void {
        act(() =>
            root.render(
                React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(SuppressingView, { suppressed }),
                    React.createElement(AgentStatusOrb)
                )
            )
        );
    }

    function rightClick(element: HTMLElement, clientX = 0, clientY = 0): void {
        act(() => {
            element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY }));
        });
    }

    beforeEach(() => {
        __resetAgentRunStatusStoreForTests();
        rpc = makeRpcClient();
        mockRpcClient = rpc.client;
        unsubscribePresence = subscribeAmbientCopilotPresence((value) => {
            present = value;
        });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        render();
        rpc.notify(IDLE);
    });

    afterEach(() => {
        act(() => root.unmount());
        unsubscribePresence();
        container.remove();
        mockRpcClient = undefined;
    });

    it("opens a 'Hide the Copilot orb' menu on right-click instead of the webview's own menu", () => {
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 });
        act(() => {
            orb()!.dispatchEvent(event);
        });

        expect(event.defaultPrevented).toBe(true);
        expect(menuItem()?.textContent).toBe("Hide the Copilot orb");
    });

    it("asks the host to hide, and keeps the orb until the host confirms", () => {
        rightClick(orb()!, 40, 40);

        act(() => menuItem()!.click());

        expect(rpc.executeCommand).toHaveBeenCalledWith({ commands: ["ballerina.copilot.hideOrb"] });
        expect(menuItem()).toBeNull();
        expect(orb()).not.toBeNull();
    });

    it("closes the menu on Escape without hiding", () => {
        rightClick(orb()!, 40, 40);

        act(() => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        });

        expect(menuItem()).toBeNull();
        expect(rpc.executeCommand).not.toHaveBeenCalled();
    });

    it("drops the orb and its ambient presence while hidden, so the title-bar button can take over", () => {
        expect(present).toBe(true);

        rpc.notify(HIDDEN);

        expect(orb()).toBeNull();
        expect(present).toBe(false);
    });

    it("comes back idle when shown again, without opening the mini chat or the panel", () => {
        rpc.notify(HIDDEN);

        rpc.notify(IDLE);

        expect(orb()).not.toBeNull();
        expect(present).toBe(true);
        expect(miniChat()).toBeNull();
        expect(openAiPanelCalls()).toHaveLength(0);
    });

    it("opens nothing when shown again on a view with no room for the orb", () => {
        rpc.notify(HIDDEN);
        render(true);

        rpc.notify(IDLE);

        expect(orb()).toBeNull();
        expect(miniChat()).toBeNull();
        expect(openAiPanelCalls()).toHaveLength(0);

        render(false);
        expect(orb()).not.toBeNull();
        expect(miniChat()).toBeNull();
    });

    it("hands a diagram's prompt to the chat panel while hidden, and never replays it on the mini chat", () => {
        rpc.notify(HIDDEN);
        const prompt = createMiniChatPrompt("Add a log statement");

        let handled = false;
        act(() => {
            handled = requestMiniChatOpen(prompt);
        });

        expect(handled).toBe(true);
        expect(rpc.openAIPanel).toHaveBeenCalledWith(prompt);

        rpc.notify(IDLE);

        expect(orb()).not.toBeNull();
        expect(miniChat()).toBeNull();
    });

    it("does not open anything for statuses that were never hidden", () => {
        rpc.notify({ ...IDLE, state: "running" });
        rpc.notify(IDLE);

        expect(miniChat()).toBeNull();
        expect(openAiPanelCalls()).toHaveLength(0);
    });
});
