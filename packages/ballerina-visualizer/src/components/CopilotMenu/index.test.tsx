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

// The menu's job is to hand the panel a payload it understands. What these pin is the shape of those
// payloads — the panel reads them on mount, and a wrong `type` fails silently as "panel just opened".

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";

jest.mock("@wso2/ballerina-core", () => ({
    SHARED_COMMANDS: { OPEN_AI_PANEL: "ballerina.open.ai.panel" },
}));

let mockRpcClient: ReturnType<typeof makeRpcClient> | undefined;

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: mockRpcClient }),
}));

import { CopilotMenu } from "./index";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const THREADS = [
    { id: "t1", name: "Order API", isActive: true, createdAt: 1, updatedAt: 9, turnCount: 3 },
    { id: "t2", name: "Kafka consumer", isActive: false, createdAt: 1, updatedAt: 8, turnCount: 1 },
];

function makeRpcClient(threads: unknown[] = THREADS) {
    const common = { executeCommand: jest.fn().mockResolvedValue(undefined) };
    const ai = { listThreads: jest.fn().mockResolvedValue(threads) };
    return { getCommonRpcClient: () => common, getAiPanelRpcClient: () => ai };
}

describe("CopilotMenu", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mockRpcClient = makeRpcClient();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        mockRpcClient = undefined;
    });

    const render = async () => {
        await act(async () => {
            root.render(<CopilotMenu />);
        });
    };

    const trigger = () => container.querySelector("button[aria-haspopup='menu']") as HTMLButtonElement;
    const items = () => Array.from(container.querySelectorAll("[role='menuitem']")) as HTMLButtonElement[];
    const labelled = (text: string) => items().find((el) => el.textContent?.trim().startsWith(text))!;
    const click = async (el: HTMLElement) => {
        await act(async () => {
            el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
    };
    const commands = () =>
        (mockRpcClient!.getCommonRpcClient().executeCommand as jest.Mock).mock.calls.map((c) => c[0].commands);

    it("stays closed until asked", async () => {
        await render();
        expect(items()).toHaveLength(0);
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
    });

    it("offers chats and every configured surface", async () => {
        await render();
        await click(trigger());

        expect(items().map((el) => el.textContent?.trim())).toEqual(["Chats", "Settings"]);
    });

    it("opens the panel on a surface rather than sending a prompt", async () => {
        await render();
        await click(trigger());
        await click(labelled("Settings"));

        const [command, payload] = commands()[0];
        expect(command).toBe("ballerina.open.ai.panel");
        expect(payload).toEqual({ type: "view", view: "settings" });
    });

    // Loading on mount would call listThreads for every overview render, most of which never open it.
    it("does not read the thread list until the menu is opened", async () => {
        await render();
        expect(mockRpcClient!.getAiPanelRpcClient().listThreads).not.toHaveBeenCalled();

        await click(trigger());
        expect(mockRpcClient!.getAiPanelRpcClient().listThreads).toHaveBeenCalled();
    });

    it("opens the panel on the chosen conversation", async () => {
        await render();
        await click(trigger());
        await click(labelled("Chats"));
        await click(labelled("Kafka consumer"));

        const [command, payload] = commands()[0];
        expect(command).toBe("ballerina.open.ai.panel");
        expect(payload).toEqual({ type: "thread", threadId: "t2" });
    });

    // The composer outlives the menu, so a fetch-once list would go stale against chats started
    // elsewhere, and a single failed call would read as "no chats" for the rest of the session.
    it("re-reads the thread list every time it opens", async () => {
        await render();
        await click(trigger());
        await click(trigger());
        await click(trigger());

        expect(mockRpcClient!.getAiPanelRpcClient().listThreads).toHaveBeenCalledTimes(2);
    });

    it("distinguishes a failed read from an empty history", async () => {
        const failing = makeRpcClient();
        (failing.getAiPanelRpcClient().listThreads as jest.Mock).mockRejectedValue(new Error("rpc down"));
        mockRpcClient = failing;

        await render();
        await click(trigger());
        await click(labelled("Chats"));

        expect(container.textContent).toContain("Couldn't load chats");
        expect(container.textContent).not.toContain("No chats yet");
    });

    it("returns focus to the trigger when it closes", async () => {
        await render();
        await click(trigger());
        await click(labelled("Settings"));

        expect(document.activeElement).toBe(trigger());
    });

    it("says so when there is no history rather than showing an empty list", async () => {
        mockRpcClient = makeRpcClient([]);
        await render();
        await click(trigger());
        await click(labelled("Chats"));

        expect(container.textContent).toContain("No chats yet");
    });

    // It sits under the prompt box, so upward covers the thing being typed into — only acceptable
    // when there is genuinely no room below.
    describe("direction", () => {
        const withSpaceBelow = (px: number) => {
            jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
                bottom: window.innerHeight - px,
            } as DOMRect);
        };

        const placement = () => {
            const surface = container.querySelector("[role='menu']") as HTMLElement;
            const own = Array.from(surface.classList).find((c) => c.startsWith("css-"))!;
            const rule = Array.from(document.querySelectorAll("style"))
                .flatMap((style) => Array.from((style.sheet?.cssRules ?? []) as unknown as CSSRule[]))
                .map((r) => r.cssText)
                .find((text) => text.includes(own))!;
            return /bottom:\s*calc/.test(rule) ? "up" : "down";
        };

        afterEach(() => jest.restoreAllMocks());

        it("opens downward when there is room", async () => {
            withSpaceBelow(500);
            await render();
            await click(trigger());

            expect(placement()).toBe("down");
        });

        it("flips up only when it would be clipped", async () => {
            withSpaceBelow(40);
            await render();
            await click(trigger());

            expect(placement()).toBe("up");
        });
    });

    // role="menu" promises a keyboard model; without it the role misleads assistive tech.
    describe("keyboard", () => {
        const key = async (name: string) => {
            await act(async () => {
                (document.activeElement ?? document.body).dispatchEvent(
                    new KeyboardEvent("keydown", { key: name, bubbles: true })
                );
            });
        };

        it("puts focus on the first item when it opens", async () => {
            await render();
            await click(trigger());

            expect(document.activeElement).toBe(items()[0]);
        });

        it("moves with the arrow keys and wraps", async () => {
            await render();
            await click(trigger());

            await key("ArrowDown");
            expect(document.activeElement).toBe(items()[1]);

            await key("ArrowDown");
            expect(document.activeElement).toBe(items()[0]);

            await key("ArrowUp");
            expect(document.activeElement).toBe(items()[items().length - 1]);
        });

        it("jumps to the ends with Home and End", async () => {
            await render();
            await click(trigger());

            await key("End");
            expect(document.activeElement).toBe(items()[items().length - 1]);

            await key("Home");
            expect(document.activeElement).toBe(items()[0]);
        });
    });

    it("closes on Escape", async () => {
        await render();
        await click(trigger());
        expect(items().length).toBeGreaterThan(0);

        await act(async () => {
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        });
        expect(items()).toHaveLength(0);
    });
});
