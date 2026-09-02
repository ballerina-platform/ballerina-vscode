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

// L2: the highlight.js theme lifecycle of the markdown renderer.
//
// Four things here are invisible on screen and only observable in `document.head` or in
// the RPC client, so they are pinned as a component test rather than left to the E2E suite:
//
//   - `useRpcContext` defaults `rpcClient` to null, and the migration wizard's AI
//     enhancement step reaches this component through the federated remote with no
//     VisualizerContext provider. Without the body-class fallback the effect dereferences
//     null and the whole panel fails to render.
//   - `getThemeKind` is a round trip to the host and can reject. The effect discards the
//     promise, so an uncaught rejection there is both an unhandled rejection and a panel
//     left with no stylesheet at all; the body class is the fallback.
//   - Every theme application must replace the previous <link>, not stack another one on
//     top of it; the last one appended wins, so a leaked stale link is a silently wrong
//     code theme.
//   - `onProjectContentUpdated` returns an unsubscribe. A streaming agent view mounts one
//     renderer per markdown block, so skipping it leaks a listener per block.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// react-markdown v10 and its plugins are ESM-only and this package does not transform
// node_modules; none of them participate in the theme lifecycle under test.
jest.mock("react-markdown", () => ({
    __esModule: true,
    default: ({ children }: { children?: React.ReactNode }) => <div data-testid="markdown">{children}</div>,
}));
jest.mock("rehype-raw", () => ({ __esModule: true, default: (): undefined => undefined }));
jest.mock("remark-gfm", () => ({ __esModule: true, default: (): undefined => undefined }));

// Registered at module load; `getLanguage`/`highlight` are only reached from the code
// renderer, which the react-markdown stub never invokes.
jest.mock("highlight.js", () => ({
    __esModule: true,
    default: {
        registerLanguage: (): void => undefined,
        getLanguage: (): undefined => undefined,
        highlight: () => ({ value: "" }),
    },
}));
jest.mock("highlight.js/lib/languages/yaml", () => ({ __esModule: true, default: () => ({}) }));
jest.mock("../../../languages/ballerina.js", () => ({ __esModule: true, default: () => ({}) }));

// The core barrel pulls in ESM-only LS transport modules that jest cannot load. Values
// mirror the real enum, which the switch in `resolveTheme` compares against.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("./ChatBadge", () => ({ __esModule: true, default: (): null => null }));
jest.mock("./ErrorBox", () => ({ __esModule: true, default: (): null => null }));

import { TestRpcContext } from "../../../test/rpcHarness";
import MarkdownRenderer from "./MarkdownRenderer";

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const LIGHT_HREF = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
const DARK_HREF = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";

/** Mirrors the mocked `ColorThemeKind`, so the tests read as the enum does. */
const ColorThemeKind = { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 };

/** An rpc client stub whose reported theme kind can be changed between updates. */
function makeRpc(themeKind: number) {
    const unsubscribe = jest.fn();
    const listeners: Array<() => void> = [];
    const rpcClient = {
        currentThemeKind: themeKind,
        getVisualizerRpcClient: () => ({
            getThemeKind: async (): Promise<number> => rpcClient.currentThemeKind,
        }),
        onProjectContentUpdated: jest.fn((cb: () => void) => {
            listeners.push(cb);
            return unsubscribe;
        }),
    };
    return { rpcClient, unsubscribe, fireUpdate: (): void => listeners.forEach((cb) => cb()) };
}

const themeLinks = (): HTMLLinkElement[] =>
    Array.from(document.head.querySelectorAll<HTMLLinkElement>("link#hljs-theme"));

const themeHref = (): string | undefined => themeLinks()[0]?.href;

describe("MarkdownRenderer highlight theme lifecycle", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        document.body.className = "";
        document.head.querySelectorAll("#hljs-theme, #hljs-override").forEach((el) => el.remove());
    });

    /** Renders and flushes the async effect that resolves and injects the theme. */
    const render = async (rpcClient: unknown) => {
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <MarkdownRenderer markdownContent="# hello" />
                </TestRpcContext.Provider>
            );
        });
        await act(async () => undefined);
    };

    // No provider above the component - the federated-remote case. The theme comes from the
    // class VS Code puts on <body>, and dereferencing the null client would throw instead.
    describe("without an rpc client", () => {
        it.each<[string, string]>([
            ["vscode-light", LIGHT_HREF],
            ["vscode-high-contrast-light", LIGHT_HREF],
            ["vscode-dark", DARK_HREF],
            ["vscode-high-contrast", DARK_HREF],
            ["", DARK_HREF],
        ])("resolves the %s body class to its stylesheet", async (bodyClass, expectedHref) => {
            document.body.className = bodyClass;

            await render(null);

            expect(themeHref()).toBe(expectedHref);
        });

        it("re-resolves the body class on a later mount and leaves one stylesheet", async () => {
            document.body.className = "vscode-light";
            await render(null);
            expect(themeHref()).toBe(LIGHT_HREF);

            await act(async () => root.unmount());
            document.body.className = "vscode-dark";
            root = createRoot(container);
            await render(null);

            expect(themeLinks()).toHaveLength(1);
            expect(themeHref()).toBe(DARK_HREF);
        });

        // There is no `onProjectContentUpdated` to hang a theme change off here, so the body
        // class is both the source and the change signal.
        it("replaces the stylesheet when the body class changes", async () => {
            document.body.className = "vscode-dark";
            await render(null);
            expect(themeHref()).toBe(DARK_HREF);

            await act(async () => {
                document.body.className = "vscode-light";
            });
            await act(async () => undefined);

            expect(themeLinks()).toHaveLength(1);
            expect(themeHref()).toBe(LIGHT_HREF);
        });

        it("stops observing the body class after unmount", async () => {
            document.body.className = "vscode-dark";
            await render(null);

            await act(async () => root.unmount());
            await act(async () => {
                document.body.className = "vscode-light";
            });
            await act(async () => undefined);

            // The disconnected observer must not re-inject after the component is gone.
            expect(themeHref()).toBe(DARK_HREF);
            root = createRoot(container);
        });

        it("unmounts cleanly with no listener to release", async () => {
            await render(null);

            expect(() => act(() => root.unmount())).not.toThrow();
            // Re-created so the shared afterEach unmount has a live root to act on.
            root = createRoot(container);
        });
    });

    describe("with an rpc client", () => {
        it.each<[string, number, string]>([
            ["Light", ColorThemeKind.Light, LIGHT_HREF],
            ["HighContrastLight", ColorThemeKind.HighContrastLight, LIGHT_HREF],
            ["Dark", ColorThemeKind.Dark, DARK_HREF],
            ["HighContrast", ColorThemeKind.HighContrast, DARK_HREF],
        ])("resolves theme kind %s to its stylesheet", async (_label, themeKind, expectedHref) => {
            const { rpcClient } = makeRpc(themeKind);

            await render(rpcClient);

            expect(themeHref()).toBe(expectedHref);
        });

        // The body class is ignored while a client is present: the client is authoritative.
        it("prefers the client's theme kind over the body class", async () => {
            document.body.className = "vscode-dark";
            const { rpcClient } = makeRpc(ColorThemeKind.Light);

            await render(rpcClient);

            expect(themeHref()).toBe(LIGHT_HREF);
        });

        it("replaces the stylesheet when the theme changes on a content update", async () => {
            const { rpcClient, fireUpdate } = makeRpc(ColorThemeKind.Dark);
            await render(rpcClient);
            expect(themeHref()).toBe(DARK_HREF);

            rpcClient.currentThemeKind = ColorThemeKind.Light;
            await act(async () => {
                fireUpdate();
            });
            await act(async () => undefined);

            expect(themeLinks()).toHaveLength(1);
            expect(themeHref()).toBe(LIGHT_HREF);
        });

        it("adds the background override exactly once across updates", async () => {
            const { rpcClient, fireUpdate } = makeRpc(ColorThemeKind.Dark);
            await render(rpcClient);

            await act(async () => {
                fireUpdate();
            });
            await act(async () => undefined);

            expect(document.head.querySelectorAll("#hljs-override")).toHaveLength(1);
        });

        // A rejected round trip must not escape as an unhandled rejection, and must not
        // leave the panel with no stylesheet at all; the body class is the fallback.
        it("falls back to the body class when the theme request rejects", async () => {
            document.body.className = "vscode-light";
            const { rpcClient } = makeRpc(ColorThemeKind.Dark);
            rpcClient.getVisualizerRpcClient = () => ({
                getThemeKind: async (): Promise<number> => {
                    throw new Error("rpc unavailable");
                },
            });

            await render(rpcClient);

            expect(themeLinks()).toHaveLength(1);
            expect(themeHref()).toBe(LIGHT_HREF);
        });

        it("unsubscribes the content listener on unmount", async () => {
            const { rpcClient, unsubscribe } = makeRpc(ColorThemeKind.Dark);
            await render(rpcClient);
            expect(rpcClient.onProjectContentUpdated).toHaveBeenCalledTimes(1);
            expect(unsubscribe).not.toHaveBeenCalled();

            await act(async () => root.unmount());

            expect(unsubscribe).toHaveBeenCalledTimes(1);
            root = createRoot(container);
        });
    });
});
