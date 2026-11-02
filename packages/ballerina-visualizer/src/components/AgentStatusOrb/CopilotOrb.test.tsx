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

// The solid style is Agent Builder's own orb, so it must draw in Agent Builder's palette whatever
// colours the caller passes, while animated and simple keep using the caller's colours.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// CopilotOrb relies on the automatic JSX runtime the webpack build uses; jest compiles JSX classically.
(globalThis as unknown as { React: typeof React }).React = React;

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true }));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Icon: ({ iconSx }: { iconSx?: { color?: string } }) => <i data-testid="icon" data-color={iconSx?.color} />,
}));

jest.mock("./ShaderOrb", () => ({
    __esModule: true,
    ShaderOrb: ({ colors }: { colors: string[] }) => <i data-testid="shader" data-colors={colors.join()} />,
}));

jest.mock("./shared", () => ({
    __esModule: true,
    ACCENT_CORE: "accent-core",
    ACCENT_FRAME: ["frame-0", "frame-1", "frame-2"],
    AGENT_BUILDER_ORB_COLORS: {
        "idle": ["ab-idle-0", "ab-idle-1", "ab-idle-2"],
        "running": ["ab-run-0", "ab-run-1", "ab-run-2"],
        "awaiting-input": ["ab-wait-0", "ab-wait-1", "ab-wait-2"],
        "completed": ["ab-done-0", "ab-done-1", "ab-done-2"],
        "error": ["ab-err-0", "ab-err-1", "ab-err-2"],
    },
    FALLBACK_ORB_THEME: "simple",
    Gloss: () => <i data-testid="gloss" />,
    IconOverlay: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    ORB_ENERGY: { "idle": 0, "running": 1, "awaiting-input": 0.5, "completed": 0.3, "error": 0.2 },
    SpinArc: ({ color }: { color: string }) => <i data-testid="solid-spin" data-color={color} />,
    Sphere: ({ colors, highlightColor }: { colors: string[]; highlightColor?: string }) => (
        <i data-testid="sphere" data-colors={colors.join()} data-highlight={highlightColor ?? ""} />
    ),
    useOrbTheme: () => "animated",
}));

import { CopilotOrb } from "./CopilotOrb";
import type { OrbTheme } from "./shared";

const CALLER_COLORS: [string, string, string] = ["caller-0", "caller-1", "caller-2"];

describe("CopilotOrb styles", () => {
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
    });

    const render = (theme: OrbTheme, state: "idle" | "running" = "idle") => {
        act(() => {
            root.render(<CopilotOrb state={state} colors={CALLER_COLORS} size={56} theme={theme} />);
        });
        const byId = (id: string) => container.querySelector(`[data-testid="${id}"]`);
        return { byId };
    };

    it("draws the solid orb in Agent Builder's palette, without gloss, and with a white icon", () => {
        const { byId } = render("solid");
        expect(byId("sphere")?.getAttribute("data-colors")).toBe("ab-idle-0,ab-idle-1,ab-idle-2");
        expect(byId("sphere")?.getAttribute("data-highlight")).toBe("accent-core");
        expect(byId("shader")).toBeNull();
        expect(byId("gloss")).toBeNull();
        expect(byId("icon")?.getAttribute("data-color")).toBe("#ffffff");
    });

    it("spins the solid orb's own arc in the accent frame colour while running", () => {
        const { byId } = render("solid", "running");
        expect(byId("sphere")?.getAttribute("data-colors")).toBe("ab-run-0,ab-run-1,ab-run-2");
        expect(byId("solid-spin")?.getAttribute("data-color")).toBe("frame-1");
    });

    it("keeps the caller's colours and the gloss for the animated orb", () => {
        const { byId } = render("animated");
        expect(byId("shader")?.getAttribute("data-colors")).toBe("caller-0,caller-1,caller-2");
        expect(byId("sphere")).toBeNull();
        expect(byId("gloss")).not.toBeNull();
    });

    it("keeps the caller's colours and the gloss for the simple orb", () => {
        const { byId } = render("simple");
        expect(byId("sphere")?.getAttribute("data-colors")).toBe("caller-0,caller-1,caller-2");
        expect(byId("gloss")).not.toBeNull();
        expect(byId("solid-spin")).toBeNull();
    });
});
