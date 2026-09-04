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

// L2: the overview's add-artifact entry point. There is exactly ONE, wherever the
// integration stands: the Design header once it has artifacts, the empty state before that,
// and both go to the artifact list (BIComponentView).
//
// Asserted here rather than left to the E2E suite because the two placements are separate
// JSX branches gated on the same `isEmptyIntegration()` predicate — flip either gate and
// you get two buttons or none, in a state that is awkward to reach by hand. The destination
// is pinned too: nothing about the two buttons distinguishes them but their click target,
// so a wrong one looks identical on screen.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// The core barrel pulls in ESM-only LS transport modules that jest cannot load. Only the
// enum-like values this view reads are needed; DIRECTORY_MAP keys must match the real ones
// because `isEmptyIntegration` indexes the directory map with them.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW" },
    MACHINE_VIEW: { BIComponentView: "BIComponentView", PackageOverview: "Overview" },
    BuildMode: {},
    BI_COMMANDS: {},
    DIRECTORY_MAP: {
        AUTOMATION: "AUTOMATION",
        SERVICE: "SERVICE",
        LISTENER: "LISTENER",
        FUNCTION: "FUNCTION",
        CONNECTION: "CONNECTION",
        TYPE: "TYPE",
        CONFIGURABLE: "CONFIGURABLE",
        DATA_MAPPER: "DATA_MAPPER",
        NP_FUNCTION: "NP_FUNCTION",
        AGENT: "AGENT",
        AGENT_DEFINITION: "AGENT_DEFINITION",
        LOCAL_CONNECTORS: "LOCAL_CONNECTORS",
        WORKFLOW: "WORKFLOW",
        ACTIVITY: "ACTIVITY",
    },
    isSamePath: (a: string, b: string) => a === b,
    // Reached through `getIntegrationTypes`, which the view derives its deployment options
    // from. Irrelevant to which add-artifact button renders; undefined means "no scope",
    // which the caller already filters out.
    findScope: (): undefined => undefined,
    SCOPE: { AUTOMATION: "AUTOMATION", WORKFLOW: "WORKFLOW", LIBRARY: "LIBRARY" },
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

// Stubbed so the assertions read the real button, not a toolkit abstraction over it: a
// plain <button> whose accessible name is its text.
jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, disabled, appearance, buttonSx, tooltip, ...rest }: any) => (
        <button onClick={onClick} disabled={disabled} data-appearance={appearance} {...rest}>
            {children}
        </button>
    ),
    Codicon: (): null => null,
    Icon: (): null => null,
    Divider: (): null => null,
    CheckBox: (): null => null,
    ProgressIndicator: (): null => null,
    ProgressRing: () => <div data-testid="progress-ring" />,
    Overlay: (): null => null,
    Dropdown: (): null => null,
    Typography: ({ children }: any) => <div>{children}</div>,
    ThemeColors: { PRIMARY: "#000", ON_SURFACE: "#000", SURFACE_BRIGHT: "#fff", OUTLINE_VARIANT: "#ccc" },
}));

jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQuery: (): { data: undefined; isLoading: boolean; refetch: () => void } => ({
        data: undefined,
        isLoading: false,
        refetch: (): void => undefined,
    }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeLink: ({ children, onClick }: any) => <a onClick={onClick}>{children}</a>,
}));
jest.mock("@wso2/wso2-platform-core", () => ({ __esModule: true, WICommandIds: {} }));

// Children irrelevant to which add-artifact button renders. Stubbed so the test stays in
// jsdom with no diagram canvas, no markdown renderer and no VSCode.
jest.mock("../../../components/EditableTitle", () => ({
    __esModule: true,
    EditableTitle: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("../../../components/Markdown", () => ({ __esModule: true, Markdown: (): null => null }));
jest.mock("../../AIPanel/AlertBoxWithClose", () => ({ __esModule: true, AlertBoxWithClose: (): null => null }));
jest.mock("../../../components/UndoRedoGroup", () => ({ __esModule: true, UndoRedoGroup: (): null => null }));
jest.mock("../../../providers/platform-ext-ctx-provider", () => ({
    __esModule: true,
    usePlatformExtContext: () => ({ platformExtState: {} }),
}));
jest.mock("../../../components/TopNavigationBar", () => ({ __esModule: true, TopNavigationBar: (): null => null }));
jest.mock("../../../components/TitleBar", () => ({ __esModule: true, TitleBar: (): null => null }));
jest.mock("./PublishToCentralButton", () => ({ __esModule: true, PublishToCentralButton: (): null => null }));
jest.mock("./LibraryOverview", () => ({ __esModule: true, LibraryOverview: (): null => null }));
// Stubbed: it owns the shader-orb rendering (real WebGL, unavailable in jsdom) and its own
// status-orb wiring, none of which this suite cares about. Its "Add Artifact manually" button
// is kept, wired to the same prop, since that IS the click target these tests assert on.
jest.mock("./CopilotComposer", () => ({
    __esModule: true,
    CopilotComposer: ({ onAddArtifactManually }: any) => (
        <div>
            <div>What would you like to build?</div>
            <button onClick={onAddArtifactManually}>Add Artifact manually</button>
        </div>
    ),
}));
jest.mock("../../../components/AgentStatusOrb/shared", () => ({
    __esModule: true,
    AWAITING_INPUT_LABEL: "Waiting for your reply",
    useAgentRunState: () => "idle",
    useAiPanelOpen: () => false,
}));
jest.mock("../ComponentDiagram", () => ({
    __esModule: true,
    default: () => <div data-testid="component-diagram" />,
    ComponentDiagram: () => <div data-testid="component-diagram" />,
}));

import { TestRpcContext } from "../../../test/rpcHarness";
import { PackageOverview } from "./index";

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT_PATH = "/workspace/orders";

/** A directory map with every key empty — the shape `isEmptyIntegration` walks. */
function emptyDirectoryMap(): Record<string, unknown[]> {
    return {
        AUTOMATION: [], SERVICE: [], LISTENER: [], FUNCTION: [], CONNECTION: [], TYPE: [],
        CONFIGURABLE: [], DATA_MAPPER: [], NP_FUNCTION: [], AGENT: [], AGENT_DEFINITION: [],
        LOCAL_CONNECTORS: [], WORKFLOW: [], ACTIVITY: [],
    };
}

function makeRpc(directoryMap: Record<string, unknown[]>) {
    // Typed argument so `mock.calls[0][0]` is a real element rather than an empty tuple.
    const openView = jest.fn(async (_request: { type: string; location: { view: string } }): Promise<void> => undefined);
    const rpcClient = {
        getVisualizerRpcClient: () => ({ openView, goBack: jest.fn() }),
        getBIDiagramRpcClient: () => ({
            getProjectStructure: async () => ({
                workspaceName: "orders-project",
                projects: [{ projectName: "orders", projectPath: PROJECT_PATH, isLibrary: false, directoryMap }],
            }),
            handleReadmeContent: async () => ({ content: "" }),
        }),
        getCommonRpcClient: () => ({ isNPSupported: async () => false }),
        getICPRpcClient: () => ({ isIcpEnabled: async () => ({ enabled: false }) }),
        getWorkflowManagementRpcClient: () => ({ isWorkflowManagementEnabled: async () => ({ enabled: false }) }),
        getAiPanelRpcClient: () => ({ showSignInAlert: async () => false }),
        onProjectContentUpdated: jest.fn(() => (): void => undefined),
    };
    return { rpcClient, openView };
}

describe("PackageOverview add-artifact entry point", () => {
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

    const renderOverview = async (rpcClient: any) => {
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <PackageOverview projectPath={PROJECT_PATH} isInDevant={false} />
                </TestRpcContext.Provider>
            );
        });
        // The view fetches structure, readme, NP support, ICP and workflow state on mount.
        for (let i = 0; i < 10; i++) {
            await act(async () => undefined);
        }
    };

    const addArtifactButtons = () =>
        Array.from(container.querySelectorAll("button")).filter((b) =>
            (b.textContent ?? "").includes("Add Artifact")
        );

    const populated = () => ({ ...emptyDirectoryMap(), SERVICE: [{ name: "greeter" }] });

    it.each<[string, () => Record<string, unknown[]>]>([
        ["an empty integration", emptyDirectoryMap],
        ["an integration with artifacts", populated],
    ])("offers exactly one Add Artifact action on %s", async (_label, directoryMap) => {
        const { rpcClient } = makeRpc(directoryMap());
        await renderOverview(rpcClient);

        expect(addArtifactButtons()).toHaveLength(1);
    });

    it.each<[string, () => Record<string, unknown[]>]>([
        ["an empty integration", emptyDirectoryMap],
        ["an integration with artifacts", populated],
    ])("goes to the artifact list from %s", async (_label, directoryMap) => {
        const { rpcClient, openView } = makeRpc(directoryMap());
        await renderOverview(rpcClient);

        await act(async () => {
            addArtifactButtons()[0].click();
        });

        expect(openView).toHaveBeenCalledTimes(1);
        expect(openView.mock.calls[0][0]).toEqual({
            type: "OPEN_VIEW",
            location: { view: "BIComponentView" },
        });
    });

    // The empty state's button sits inside the empty state, not the Design header, so the
    // two placements cannot both be satisfied by one of them rendering twice.
    it("puts the empty state's button below the empty-state message", async () => {
        const { rpcClient } = makeRpc(emptyDirectoryMap());
        await renderOverview(rpcClient);

        const emptyMessage = Array.from(container.querySelectorAll("div")).find(
            (d) => d.textContent === "What would you like to build?"
        );
        expect(emptyMessage).toBeTruthy();

        const button = addArtifactButtons()[0];
        // DOCUMENT_POSITION_FOLLOWING: the button comes after the message in document order,
        // and both are inside the same empty-state container.
        expect(emptyMessage!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // A second add action under its own label would defeat the single entry point whatever
    // it opened, and "Add Integration" is the label most easily confused for this one.
    it("never offers an Add Integration action", async () => {
        for (const directoryMap of [emptyDirectoryMap(), populated()]) {
            const { rpcClient } = makeRpc(directoryMap);
            await renderOverview(rpcClient);

            const addIntegration = Array.from(container.querySelectorAll("button")).filter((b) =>
                (b.textContent ?? "").includes("Add Integration")
            );
            expect(addIntegration).toHaveLength(0);
        }
    });
});
