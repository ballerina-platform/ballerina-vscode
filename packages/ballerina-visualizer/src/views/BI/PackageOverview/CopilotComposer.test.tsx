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

// The orb is the only thing marking itself as a control, so these pin its hover/focus lift.

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { AgentRunStatus } from "@wso2/ballerina-core";

// The core barrel re-exports ESM-only LS transport modules jest cannot load.
jest.mock("@wso2/ballerina-core", () => ({
    MACHINE_VIEW: {},
    AttachmentStatus: { Success: "Success" },
    SHARED_COMMANDS: {
        OPEN_AI_PANEL: "ballerina.open.ai.panel",
        SET_COPILOT_INLINE_STATUS: "ballerina.set.copilot.inline.status",
    },
}));

let mockRpcClient: ReturnType<typeof makeRpcClient>["client"] | undefined;

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: mockRpcClient }),
}));

// A WebGL surface jsdom has no renderer for.
jest.mock("../../../components/AgentStatusOrb/CopilotOrb", () => ({ CopilotOrb: (): null => null }));

jest.mock("@wso2/ui-toolkit", () => ({
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    Icon: ({ name }: any) => <i data-icon={name} />,
    ThemeColors: {},
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    VSCodeLink: ({ children, onClick }: any) => <a onClick={onClick}>{children}</a>,
}));

jest.mock("../../AIPanel/components/AIChatInput/ModeToggle", () => ({
    __esModule: true,
    default: (): null => null,
    AgentMode: { Edit: "Edit", Plan: "Plan" },
}));

jest.mock("../../AIPanel/components/AIChatInput/hooks/useAttachments", () => ({
    useAttachments: (): any => ({
        attachments: [],
        fileInputRef: { current: null },
        handleAttachClick: jest.fn(),
        onAttachmentSelection: jest.fn(),
        removeAttachment: jest.fn(),
        removeAllAttachments: jest.fn(),
    }),
}));

jest.mock("../../AIPanel/utils/attachment/attachmentManager", () => ({
    acceptResolver: jest.fn(),
    handleAttachmentSelection: jest.fn(),
}));

jest.mock("../../AIPanel/components/AttachmentBox", () => ({ __esModule: true, default: (): null => null }));

import { CopilotComposer } from "./CopilotComposer";
import { __resetAgentRunStatusStoreForTests } from "../../../components/AgentStatusOrb/shared";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ORB_LABEL = "Open WSO2 Integrator Copilot";

function makeRpcClient() {
    let pushed: ((status: AgentRunStatus) => void) | undefined;
    // One instance, or assertions inspect a different mock than the component invoked.
    const common = {
        getAgentRunStatus: jest.fn().mockResolvedValue(undefined),
        getCopilotOrbTheme: jest.fn().mockResolvedValue("animated"),
        executeCommand: jest.fn().mockResolvedValue(undefined),
    };
    const client = {
        getCommonRpcClient: () => common,
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

describe("CopilotComposer orb affordance", () => {
    let container: HTMLDivElement;
    let root: Root;
    let harness: ReturnType<typeof makeRpcClient>;

    beforeEach(() => {
        __resetAgentRunStatusStoreForTests();
        harness = makeRpcClient();
        mockRpcClient = harness.client;
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
            root.render(<CopilotComposer onAddArtifactManually={jest.fn()} />);
        });
    };

    const orbButton = () =>
        Array.from(container.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === ORB_LABEL);

    const cssRules = () =>
        Array.from(document.querySelectorAll("style"))
            .flatMap((style) => Array.from((style.sheet?.cssRules ?? []) as unknown as CSSRule[]))
            .map((rule) => rule.cssText);

    // Interpolating OrbGlow would stringify to ".undefined" without @emotion/babel-plugin, matching
    // nothing and failing silently — so pin the class the rule depends on.
    it("gives the orb the class the button's hover rule targets", async () => {
        await render();
        harness.notify({ state: "idle", aiPanelOpen: false, timestamp: 0 } as AgentRunStatus);

        expect(orbButton()).toBeDefined();
        expect(orbButton()!.disabled).toBe(false);
        expect(container.querySelector(".orb-glow")).not.toBeNull();
        expect(cssRules().some((text) => text.includes(".undefined"))).toBe(false);
    });

    // The ambient sphere pulse peaks at 1.13 on its own; a lift at or below that is invisible.
    it("lifts the orb past the ambient pulse on hover and on keyboard focus", async () => {
        await render();
        harness.notify({ state: "idle", aiPanelOpen: false, timestamp: 0 } as AgentRunStatus);

        const lift = cssRules().filter((text) => text.includes(".orb-glow") && text.includes("brightness"));
        expect(lift.some((text) => text.includes(":hover"))).toBe(true);
        expect(lift.some((text) => text.includes(":focus-visible"))).toBe(true);

        const factors = lift.flatMap((text) =>
            Array.from(text.matchAll(/brightness\(([\d.]+)\)/g)).map((m) => Number(m[1]))
        );
        expect(factors.length).toBeGreaterThan(0);
        expect(Math.min(...factors)).toBeGreaterThan(1.13);
    });
});
