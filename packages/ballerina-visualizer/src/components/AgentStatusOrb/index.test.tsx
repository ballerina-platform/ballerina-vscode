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

// The idle invite stays in the tree the whole time the orb is idle and is only ever faded, so
// what these cases pin is the visibility model: hover brings it in, focus or an unsent draft
// holds it, and the two things that could otherwise resurface it on their own — the orb hiding,
// a run starting — wipe the draft instead. Hidden, it must be neither clickable nor tabbable.

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { AgentRunStatus } from "@wso2/ballerina-core";

// The core barrel re-exports ESM-only LS transport modules jest cannot load. shared.ts
// only property-accesses MACHINE_VIEW, and the orb only reads the open-panel command id.
jest.mock("@wso2/ballerina-core", () => ({
    MACHINE_VIEW: {},
    SHARED_COMMANDS: { OPEN_AI_PANEL: "ballerina.open.ai.panel" },
}));

let mockRpcClient: ReturnType<typeof makeRpcClient>["client"] | undefined;

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: mockRpcClient }),
}));

// A WebGL surface jsdom has no renderer for, and a chat overlay irrelevant here.
jest.mock("./CopilotOrb", () => ({ CopilotOrb: (): null => null }));
jest.mock("./MiniChat", () => ({ MiniChat: (): null => null }));

import { AgentStatusOrb } from "./index";
import { __resetAgentRunStatusStoreForTests } from "./shared";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const INVITE_PLACEHOLDER = "How can I help?";
const IDLE = { state: "idle", aiPanelOpen: false, timestamp: 0 } as AgentRunStatus;

function makeRpcClient() {
    let pushed: ((status: AgentRunStatus) => void) | undefined;
    const client = {
        getCommonRpcClient: () => ({
            getAgentRunStatus: jest.fn().mockResolvedValue(undefined),
            getCopilotOrbTheme: jest.fn().mockResolvedValue("animated"),
            executeCommand: jest.fn().mockResolvedValue(undefined),
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

describe("AgentStatusOrb idle invite", () => {
    let container: HTMLDivElement;
    let root: Root;
    let notify: (status: AgentRunStatus) => void;

    /** The orb widget: what the pointer enters and leaves. */
    const wrapper = () => container.firstElementChild as HTMLElement;
    const invite = () =>
        container.querySelector(`input[placeholder="${INVITE_PLACEHOLDER}"]`) as HTMLInputElement | null;
    /** The box carrying the fade, and the bridge deciding whether the pointer can reach it. */
    const box = () => invite()!.parentElement as HTMLElement;
    const bridge = () => box().parentElement as HTMLElement;
    const clearButton = () =>
        container.querySelector('button[aria-label="Clear the message"]') as HTMLButtonElement | null;
    const orb = () => wrapper().querySelector(":scope > button") as HTMLButtonElement;

    function fire(target: EventTarget, event: Event): void {
        act(() => {
            target.dispatchEvent(event);
        });
    }

    // React derives mouseenter/mouseleave from these, so hover has to be driven natively.
    const hover = () =>
        fire(wrapper(), new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    const unhover = () =>
        fire(wrapper(), new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    const focusInvite = () => act(() => invite()!.focus());
    const blurInvite = () => act(() => invite()!.blur());
    const press = (key: string) => fire(invite()!, new KeyboardEvent("keydown", { key, bubbles: true }));
    const click = (element: HTMLElement) => fire(element, new MouseEvent("click", { bubbles: true }));

    function type(text: string): void {
        const input = invite()!;
        act(() => {
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
            setValue.call(input, text);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    const opacity = () => getComputedStyle(box()).opacity;
    const visibility = () => getComputedStyle(box()).visibility;
    const reachable = () => getComputedStyle(bridge()).pointerEvents;

    beforeEach(() => {
        __resetAgentRunStatusStoreForTests();
        const rpc = makeRpcClient();
        mockRpcClient = rpc.client;
        notify = rpc.notify;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => root.render(React.createElement(AgentStatusOrb)));
        notify(IDLE);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        mockRpcClient = undefined;
    });

    it("is in the tree but hidden, untouchable and out of the tab order until the pointer arrives", () => {
        expect(invite()).not.toBeNull();
        expect(opacity()).toBe("0");
        expect(visibility()).toBe("hidden");
        expect(reachable()).toBe("none");
    });

    it("shows the invite while the pointer is on the orb", () => {
        hover();

        expect(opacity()).toBe("1");
        expect(visibility()).toBe("visible");
        expect(reachable()).toBe("auto");
    });

    it("starts hiding the moment the pointer leaves, and stops taking clicks at once", () => {
        hover();

        unhover();

        expect(opacity()).toBe("0");
        expect(reachable()).toBe("none");
    });

    it("never remounts the box across a hover cycle", () => {
        const opened = box();

        hover();
        unhover();
        hover();

        expect(box()).toBe(opened);
    });

    it("holds the invite while the input has focus", () => {
        hover();
        focusInvite();

        unhover();

        expect(opacity()).toBe("1");
    });

    it("holds the invite while it carries an unsent draft", () => {
        hover();
        focusInvite();
        type("build me a service");

        blurInvite();
        unhover();

        expect(opacity()).toBe("1");
        expect(invite()!.value).toBe("build me a service");
    });

    it("wipes the draft when the orb hides, so nothing resurfaces when it returns", () => {
        hover();
        focusInvite();
        type("stale draft");

        notify({ ...IDLE, aiPanelOpen: true });
        expect(invite()).toBeNull();
        notify(IDLE);

        expect(invite()!.value).toBe("");
        expect(opacity()).toBe("0");
    });

    it("wipes the draft when a run starts, so nothing resurfaces when it ends", () => {
        hover();
        focusInvite();
        type("stale draft");
        blurInvite();
        unhover();

        notify({ ...IDLE, state: "running" });
        expect(invite()).toBeNull();
        notify(IDLE);

        expect(invite()!.value).toBe("");
        expect(opacity()).toBe("0");
    });

    it("clears the draft on Escape and lets the box go", () => {
        hover();
        focusInvite();
        type("oops");

        press("Escape");

        expect(invite()!.value).toBe("");
        expect(document.activeElement).not.toBe(invite());
        unhover();
        expect(opacity()).toBe("0");
    });

    it("offers a clear button only once there is text, and clearing leaves the box where it is", () => {
        hover();
        expect(clearButton()).toBeNull();
        focusInvite();
        type("oops");
        expect(clearButton()).not.toBeNull();

        click(clearButton()!);

        expect(invite()!.value).toBe("");
        expect(clearButton()).toBeNull();
        expect(opacity()).toBe("1");
        blurInvite();
        unhover();
        expect(opacity()).toBe("0");
    });

    it("hands the draft to the mini chat on Enter and releases the input", () => {
        hover();
        focusInvite();
        type("build me a service");

        press("Enter");

        expect(invite()!.value).toBe("");
        expect(document.activeElement).not.toBe(invite());
        expect(opacity()).toBe("0");
    });

    it("wipes the draft when the mini chat takes over, so nothing resurfaces when it closes", () => {
        hover();
        focusInvite();
        type("stale draft");

        // Clicking the orb moves focus onto it; the mini chat then takes it from there.
        act(() => orb().focus());
        click(orb());
        expect(opacity()).toBe("0");
        act(() => orb().blur());
        unhover();
        click(orb());

        expect(invite()!.value).toBe("");
        expect(opacity()).toBe("0");
    });

    it("reveals the invite while the orb has keyboard focus", () => {
        act(() => orb().focus());
        expect(opacity()).toBe("1");

        act(() => orb().blur());

        expect(opacity()).toBe("0");
    });

    it("keeps the invite when focus moves from the orb into the input", () => {
        act(() => orb().focus());

        focusInvite();

        expect(opacity()).toBe("1");
    });
});
