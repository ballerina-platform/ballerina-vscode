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

import * as React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";

jest.mock("@wso2/ballerina-core", () => {
    const anyEnum = new Proxy({}, { get: (_target, key) => String(key) });
    return { ChangeTypeEnum: anyEnum, NodeKindEnum: anyEnum, MACHINE_VIEW: anyEnum };
});
jest.mock("../../../../../views/BI/ServiceDesigner/components/ResourceAccordion", () => ({ getColorByMethod: () => "" }));

import { ReviewBar } from "../../../../../views/AIPanel/components/ReviewBar/index";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const CONFIRM_TEXT = "Undo these changes?";

function makeRpcClient(revertGeneration = jest.fn().mockResolvedValue(undefined)) {
    const ai = { revertGeneration, openFileDiff: jest.fn() };
    const visualizer = { goBack: jest.fn(), navigateReviewMode: jest.fn() };
    return {
        ai,
        visualizer,
        client: {
            getAiPanelRpcClient: () => ai,
            getVisualizerRpcClient: () => visualizer,
            getVisualizerLocation: jest.fn().mockResolvedValue({ view: "Overview" }),
            onReviewModeOpened: jest.fn(),
            onReviewModeClosed: jest.fn(),
        },
    };
}

describe("ReviewBar revert", () => {
    let container: HTMLDivElement;
    let root: Root;

    const render = async (props: Partial<React.ComponentProps<typeof ReviewBar>>) => {
        await act(async () => {
            root.render(<ReviewBar modifiedFiles={["main.bal"]} generationId="gen-1" {...props} />);
        });
    };
    const button = (label: string) =>
        Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
    const click = async (label: string) => {
        await act(async () => {
            button(label)!.click();
        });
    };

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.restoreAllMocks();
    });

    it("asks before reverting", async () => {
        const rpc = makeRpcClient();
        await render({ isActive: true, rpcClient: rpc.client });

        await click("Revert");

        expect(rpc.ai.revertGeneration).not.toHaveBeenCalled();
        expect(container.textContent).toContain(CONFIRM_TEXT);
        expect(button("Revert")).toBeDefined();
        expect(button("Cancel")).toBeDefined();
    });

    it("puts the button back on cancel without reverting", async () => {
        const rpc = makeRpcClient();
        await render({ isActive: true, rpcClient: rpc.client });

        await click("Revert");
        await click("Cancel");

        expect(container.textContent).not.toContain(CONFIRM_TEXT);
        expect(button("Revert")).toBeDefined();
        expect(rpc.ai.revertGeneration).not.toHaveBeenCalled();
    });

    it("closes the confirm on Escape and returns focus to the button", async () => {
        const rpc = makeRpcClient();
        await render({ isActive: true, rpcClient: rpc.client });
        await click("Revert");

        await act(async () => {
            button("Cancel")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });

        expect(container.textContent).not.toContain(CONFIRM_TEXT);
        expect(document.activeElement).toBe(button("Revert"));
        expect(rpc.ai.revertGeneration).not.toHaveBeenCalled();
    });

    it("reverts this generation once confirmed", async () => {
        const rpc = makeRpcClient();
        await render({ isActive: true, rpcClient: rpc.client });

        await click("Revert");
        await click("Revert");

        expect(rpc.ai.revertGeneration).toHaveBeenCalledTimes(1);
        expect(rpc.ai.revertGeneration).toHaveBeenCalledWith({ generationId: "gen-1" });
    });

    it("keeps the bar usable when the revert fails", async () => {
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        const rpc = makeRpcClient(jest.fn().mockRejectedValue(new Error("no checkpoint")));
        await render({ isActive: true, rpcClient: rpc.client });

        await click("Revert");
        await click("Revert");

        expect(button("Revert")?.disabled).toBe(false);
    });

    it("drops an open confirm when the bar stops being the current one", async () => {
        const rpc = makeRpcClient();
        await render({ isActive: true, rpcClient: rpc.client });
        await click("Revert");

        await render({ isActive: false, rpcClient: rpc.client });
        await render({ isActive: true, rpcClient: rpc.client });

        expect(container.textContent).not.toContain(CONFIRM_TEXT);
        expect(button("Revert")).toBeDefined();
    });

    it("titles the list by what happened to it", async () => {
        const rpc = makeRpcClient();

        await render({ isActive: true, rpcClient: rpc.client });
        expect(container.textContent).toContain("Changes made");

        await render({ isActive: false, isKept: true, rpcClient: rpc.client });
        expect(container.textContent).toContain("Changes kept");

        await render({ isActive: false, isDiscarded: true, rpcClient: rpc.client });
        expect(container.textContent).toContain("Changes reverted");
    });
});
