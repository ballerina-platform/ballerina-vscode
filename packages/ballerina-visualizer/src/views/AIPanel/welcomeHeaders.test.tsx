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

// The Copilot welcome view and sign-in screen keep the Integrator header (the shared orb and our
// copy) outside Agent Builder, and Agent Builder's own header inside it.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockMode = "integrator";

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    AIMachineEventType: {},
    ProductMode: { BALLERINA: "ballerina", INTEGRATOR: "integrator", AGENT_BUILDER: "agent-builder" },
}));

jest.mock("@wso2/ballerina-rpc-client", () => ({
    __esModule: true,
    useRpcContext: () => ({
        rpcClient: {
            getAiPanelRpcClient: () => ({ isPlatformExtensionAvailable: () => Promise.resolve(true) }),
            getCommonRpcClient: () => ({}),
            sendAIStateEvent: jest.fn(),
        },
    }),
}));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Icon: (): null => null,
    ThemeColors: {},
    Typography: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}));

jest.mock("../../components/AgentStatusOrb/CopilotOrb", () => ({
    __esModule: true,
    CopilotOrb: () => <i data-testid="copilot-orb" />,
}));

jest.mock("../../components/AgentStatusOrb/orbTheme", () => ({
    __esModule: true,
    useOrbColors: () => ["c0", "c1", "c2"],
}));

jest.mock("../../components/AgentStatusOrb/shared", () => ({
    __esModule: true,
    ACCENT_CORE: "core",
    ACCENT_FRAME: ["f0", "f1", "f2"],
    ACCENT_SPHERE: ["s0", "s1", "s2"],
    AGENT_BUILDER_ORB_COLORS: { idle: ["a0", "a1", "a2"] },
    frameTriple: (base: string) => [base, base, base],
    IconOverlay: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    OrbAura: ({ children }: { children?: React.ReactNode }) => <div data-testid="ab-orb">{children}</div>,
    ORB_ENERGY: { idle: 0 },
    Sphere: () => <i data-testid="sphere" />,
}));

jest.mock("../../hooks/useProductMode", () => ({
    __esModule: true,
    useAssistantName: () => (mockMode === "agent-builder" ? "WSO2 Agent Builder Copilot" : "WSO2 Integrator Copilot"),
    useAssistantTagline: () => "The tagline",
    useProductMode: () => mockMode,
}));

import WelcomeMessage from "./components/AIChat/Welcome";
import LoginPanel from "./LoginPanel";

describe("Copilot welcome headers", () => {
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
        mockMode = "integrator";
    });

    const render = async (element: React.ReactElement) => {
        await act(async () => {
            root.render(<QueryClientProvider client={new QueryClient()}>{element}</QueryClientProvider>);
        });
    };
    const orb = () => container.querySelector('[data-testid="copilot-orb"]');

    it("shows the shared orb and the Integrator subtitle on the welcome view outside Agent Builder", async () => {
        await render(<WelcomeMessage />);
        expect(orb()).not.toBeNull();
        expect(container.textContent).toContain("Build integrations faster with AI.");
        expect(container.textContent).not.toContain("Wii");
    });

    it("keeps Agent Builder's welcome orb and copy in Agent Builder", async () => {
        mockMode = "agent-builder";
        await render(<WelcomeMessage />);
        expect(orb()).toBeNull();
        expect(container.querySelector('[data-testid="sphere"]')).not.toBeNull();
        expect(container.textContent).toContain("I can help you build, update, and understand your agent.");
    });

    it("shows the shared orb and the Integrator title on the sign-in screen outside Agent Builder", async () => {
        await render(<LoginPanel />);
        expect(orb()).not.toBeNull();
        expect(container.querySelector("h2")?.textContent).toBe("Welcome to WSO2 Integrator Copilot");
        expect(container.textContent).toContain("The tagline");
    });

    it("keeps Agent Builder's sign-in header in Agent Builder", async () => {
        mockMode = "agent-builder";
        await render(<LoginPanel />);
        expect(orb()).toBeNull();
        expect(container.querySelector('[data-testid="ab-orb"]')).not.toBeNull();
        expect(container.querySelector("h2")?.textContent).toBe("WSO2 Agent Builder Copilot");
    });
});
