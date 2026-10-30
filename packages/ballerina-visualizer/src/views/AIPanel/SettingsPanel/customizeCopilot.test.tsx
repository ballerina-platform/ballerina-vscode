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

const ROW_LABELS = ["MCP servers", "Skills", "Agent instructions"];

const AGENTS_MD_WITH_CONTENT = { fileExists: true, hasWorkspace: true, lineCount: 2, isEmpty: false };

function makeRpcClient(agentsMdInfo: object = AGENTS_MD_WITH_CONTENT) {
    const openOrCreateAgentsMd = jest.fn().mockResolvedValue(undefined);
    const api = {
        getCopilotOrbVisible: jest.fn().mockResolvedValue(true),
        getCopilotToggleSettings: jest.fn().mockResolvedValue({ followupSuggestions: true }),
        getMcpToolsEnabled: jest.fn().mockResolvedValue(false),
        listMcpServers: jest.fn().mockResolvedValue([]),
        getSkills: jest.fn().mockResolvedValue({ skills: [] }),
        getAgentsMdFileInfo: jest.fn().mockResolvedValue(agentsMdInfo),
        isCopilotSignedIn: jest.fn().mockResolvedValue(false),
        openOrCreateAgentsMd,
    };
    const client = {
        getAiPanelRpcClient: () => api,
        onMcpServersChanged: (): (() => void) => (): void => undefined,
        onAgentsMdFileInfoChanged: (): (() => void) => (): void => undefined,
    };
    return { client, api, openOrCreateAgentsMd };
}

describe("SettingsPanel Customize Copilot rows", () => {
    let container: HTMLDivElement;
    let root: Root;
    let onNavigate: jest.Mock;

    const labelFor = (label: string) =>
        Array.from(container.querySelectorAll("span")).find((s) => s.textContent === label) as HTMLElement;
    const rowFor = (label: string) => labelFor(label).closest("[role='button']") as HTMLElement | null;

    async function render(client: ReturnType<typeof makeRpcClient>["client"]): Promise<void> {
        await act(async () => {
            root.render(
                React.createElement(
                    TestRpcContext.Provider,
                    { value: { rpcClient: client } },
                    React.createElement(SettingsPanel, { onClose: () => undefined, onNavigate })
                )
            );
        });
    }

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        onNavigate = jest.fn();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it.each(ROW_LABELS)("renders %s as a focusable row button", async (label) => {
        await render(makeRpcClient().client);

        const row = rowFor(label);
        expect(row).not.toBeNull();
        expect(row!.tabIndex).toBe(0);
    });

    it.each(ROW_LABELS)("ends the %s row with the chevron", async (label) => {
        await render(makeRpcClient().client);

        expect(rowFor(label)!.querySelector(".codicon-chevron-right")).not.toBeNull();
    });

    it.each([
        ["no workspace", { fileExists: false, hasWorkspace: false }, "No workspace open", "Open a workspace folder to create AGENTS.md"],
        ["no AGENTS.md", { fileExists: false, hasWorkspace: true }, "No AGENTS.md", "Create AGENTS.md"],
        ["an empty AGENTS.md", { fileExists: true, hasWorkspace: true, lineCount: 0, isEmpty: true }, "Empty file", "Edit AGENTS.md"],
        ["an AGENTS.md with content", AGENTS_MD_WITH_CONTENT, "2 lines", "Edit AGENTS.md"],
    ])("shows the Agent instructions tooltip for %s and keeps the full subtitle on hover", async (_state, info, subtitle, tooltip) => {
        await render(makeRpcClient(info).client);

        expect(rowFor("Agent instructions")!.title).toBe(tooltip);
        expect(labelFor(subtitle).title).toBe(subtitle);
    });

    it("shows no Agent instructions tooltip before the file info arrives", async () => {
        const rpc = makeRpcClient();
        rpc.api.getAgentsMdFileInfo.mockReturnValue(new Promise(() => undefined));
        await render(rpc.client);

        expect(rowFor("Agent instructions")!.hasAttribute("title")).toBe(false);
    });

    it("opens AGENTS.md when the Agent instructions row is clicked", async () => {
        const rpc = makeRpcClient();
        await render(rpc.client);

        await act(async () => {
            labelFor("Agent instructions").click();
        });

        expect(rpc.openOrCreateAgentsMd).toHaveBeenCalledTimes(1);
    });

    it("opens AGENTS.md when Enter is pressed on the Agent instructions row", async () => {
        const rpc = makeRpcClient();
        await render(rpc.client);

        await act(async () => {
            rowFor("Agent instructions")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });

        expect(rpc.openOrCreateAgentsMd).toHaveBeenCalledTimes(1);
    });

    it("ignores auto-repeated Enter on the Agent instructions row", async () => {
        const rpc = makeRpcClient();
        await render(rpc.client);

        await act(async () => {
            rowFor("Agent instructions")!.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true })
            );
        });

        expect(rpc.openOrCreateAgentsMd).not.toHaveBeenCalled();
    });

    it("ignores Agent instructions clicks until the open in flight finishes", async () => {
        const rpc = makeRpcClient();
        let finishOpen: () => void = () => undefined;
        rpc.openOrCreateAgentsMd.mockReturnValue(new Promise<void>((resolve) => { finishOpen = resolve; }));
        await render(rpc.client);

        await act(async () => {
            labelFor("Agent instructions").click();
            labelFor("Agent instructions").click();
        });
        expect(rpc.openOrCreateAgentsMd).toHaveBeenCalledTimes(1);

        await act(async () => {
            finishOpen();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await act(async () => {
            labelFor("Agent instructions").click();
        });
        expect(rpc.openOrCreateAgentsMd).toHaveBeenCalledTimes(2);
    });

    it("opens AGENTS.md again after a failed open", async () => {
        const rpc = makeRpcClient();
        rpc.openOrCreateAgentsMd.mockRejectedValueOnce(new Error("open failed"));
        await render(rpc.client);

        await act(async () => {
            labelFor("Agent instructions").click();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await act(async () => {
            labelFor("Agent instructions").click();
        });

        expect(rpc.openOrCreateAgentsMd).toHaveBeenCalledTimes(2);
    });

    it("opens the MCP servers panel when its row is clicked", async () => {
        const rpc = makeRpcClient();
        await render(rpc.client);

        await act(async () => {
            labelFor("MCP servers").click();
        });

        expect(onNavigate).toHaveBeenCalledWith("mcp");
        expect(rpc.openOrCreateAgentsMd).not.toHaveBeenCalled();
    });
});
