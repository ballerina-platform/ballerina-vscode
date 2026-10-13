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

// L2 / C04 + C10: the agent editor's panel controller — what closing, cancelling and going
// back actually do. Saving and cancelling differ by exactly one thing (whether the host is
// asked to refresh), and that one thing is the difference between the diagram showing the
// edit and silently not showing it. Back is a small state machine with an override, and a
// stale override is how a form ends up with a back button that returns to the wrong step.

// All four of these barrels pull in ESM-only or UI-heavy modules jest cannot load. The
// controller only reaches them from the tool/memory paths, which these cases do not take.
jest.mock("@wso2/bi-diagram", () => ({}));
jest.mock("@wso2/ballerina-core", () => ({ EVENT_TYPE: {}, MACHINE_VIEW: {} }));
jest.mock("../FlowDiagram/utils", () => ({ findClassByName: jest.fn(), findFunctionByName: jest.fn() }));
jest.mock("./utils", () => ({
    findAgentScopedNode: jest.fn(),
    refreshAgentNodeLineRange: jest.fn(),
    removeMcpServerFromAgentNode: jest.fn(),
    removeToolFromAgentNode: jest.fn(),
    resolveAgentNodePosition: jest.fn(),
}));
jest.mock("@wso2/ballerina-rpc-client", () => ({ useRpcContext: (): { rpcClient: undefined } => ({ rpcClient: undefined }) }));

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { AgentEditorController, AgentEditorHost, useAgentEditorController } from "./useAgentEditorController";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const POSITION = { startLine: 4, startColumn: 0, endLine: 9, endColumn: 1 };

describe("useAgentEditorController", () => {
    let container: HTMLDivElement;
    let root: Root;
    let controller: AgentEditorController;
    let host: AgentEditorHost & { onRefresh: jest.Mock; onSelectionChange: jest.Mock };

    function Probe(): null {
        controller = useAgentEditorController(host);
        return null;
    }

    const mount = async (): Promise<void> => {
        await act(async () => {
            root.render(<Probe />);
        });
    };

    beforeEach(async () => {
        host = {
            projectPath: "/w/orders",
            onModelSelect: jest.fn(),
            onRefresh: jest.fn(),
            onSelectionChange: jest.fn(),
        } as never;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await mount();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    describe("closing after a save", () => {
        // The host re-reads the project and moves the diagram to the saved node. Without this
        // the panel shuts and the change is invisible until something else triggers a refresh.
        it("asks the host to refresh at the saved position", async () => {
            await act(async () => {
                controller.close(POSITION as never);
            });

            expect(host.onRefresh).toHaveBeenCalledTimes(1);
            expect(host.onRefresh).toHaveBeenCalledWith(POSITION);
        });

        it("still refreshes when the save reports no position", async () => {
            await act(async () => {
                controller.close();
            });

            expect(host.onRefresh).toHaveBeenCalledWith(undefined);
        });
    });

    describe("cancelling", () => {
        // The whole difference from close(). Cancel changed no source, so asking the host to
        // re-read would be wasted work and would move the diagram for no reason.
        it("never asks the host to refresh", async () => {
            await act(async () => {
                controller.cancel();
            });

            expect(host.onRefresh).not.toHaveBeenCalled();
        });
    });

    it.each<[string, (c: AgentEditorController) => void]>([
        ["closing", (c) => c.close(POSITION as never)],
        ["cancelling", (c) => c.cancel()],
    ])("%s returns the panel to its closed state and clears the selection", async (_label, run) => {
        await act(async () => {
            controller.openView("ADD_TOOL");
        });
        expect(controller.view).toBe("ADD_TOOL");

        await act(async () => {
            run(controller);
        });

        expect(controller.view).toBe("NONE");
        expect(controller.selectedTool).toBeUndefined();
        expect(controller.selectedAgentName).toBe("");
        expect(host.onSelectionChange).toHaveBeenLastCalledWith(undefined);
    });

    describe("going back", () => {
        // The agent-as-tool flow is two steps, so its form returns to the picker rather than
        // all the way out.
        it("returns the agent-as-tool form to the agent picker", async () => {
            await act(async () => {
                controller.openView("NEW_TOOL_AGENT_FORM");
            });

            await act(async () => {
                controller.back();
            });

            expect(controller.view).toBe("NEW_TOOL_AGENT");
        });

        it.each<[string]>([["NEW_TOOL_CUSTOM"], ["NEW_TOOL_CONNECTION"], ["NEW_TOOL_FUNCTION"], ["NEW_TOOL_KNOWLEDGE_BASE"]])(
            "returns the %s form to the tool list",
            async (view) => {
                await act(async () => {
                    controller.openView(view as never);
                });

                await act(async () => {
                    controller.back();
                });

                expect(controller.view).toBe("ADD_TOOL");
            }
        );

        // A form with its own internal steps installs an override so back walks those first.
        it("hands control to an installed override instead of changing view", async () => {
            const override = jest.fn();
            await act(async () => {
                controller.openView("NEW_TOOL_CUSTOM");
                controller.setBackHandler(override);
            });

            await act(async () => {
                controller.back();
            });

            expect(override).toHaveBeenCalledTimes(1);
            expect(controller.view).toBe("NEW_TOOL_CUSTOM");
        });

        // The override belongs to the form that installed it. Carrying it into the next view
        // would leave a back button that jumps into a form the user already left.
        it.each<[string, (c: AgentEditorController) => void]>([
            ["opening another view", (c) => c.openView("ADD_TOOL")],
            ["picking an agent", (c) => c.selectAgent("greeter")],
            ["cancelling", (c) => c.cancel()],
        ])("drops the override on %s", async (_label, move) => {
            const override = jest.fn();
            await act(async () => {
                controller.openView("NEW_TOOL_CUSTOM");
                controller.setBackHandler(override);
            });

            await act(async () => {
                move(controller);
            });
            await act(async () => {
                controller.back();
            });

            expect(override).not.toHaveBeenCalled();
        });

        it("can have its override removed explicitly", async () => {
            const override = jest.fn();
            await act(async () => {
                controller.openView("NEW_TOOL_CUSTOM");
                controller.setBackHandler(override);
            });

            await act(async () => {
                controller.setBackHandler(null);
            });
            await act(async () => {
                controller.back();
            });

            expect(override).not.toHaveBeenCalled();
            expect(controller.view).toBe("ADD_TOOL");
        });
    });

    describe("picking an agent to use as a tool", () => {
        it("remembers the agent and opens its form", async () => {
            await act(async () => {
                controller.selectAgent("greeter");
            });

            expect(controller.selectedAgentName).toBe("greeter");
            expect(controller.view).toBe("NEW_TOOL_AGENT_FORM");
        });
    });
});
