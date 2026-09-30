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

// L2 (P0): NodeList render behaviour — an RPC-driven component (docs/TEST_BACKLOG.md
// L2). Its node data arrives as the `categories` prop; the rpc client is used only for
// one feature-flag (`isNPSupported`). So a trivial fake client (via renderWithRpc)
// renders it fully — fast, jsdom, no LS/VSCode/distro. Demonstrates the rpc-driven test
// pattern for the fast tier.

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";

// NodeList reads useRpcContext from the @wso2/ballerina-rpc-client barrel; mock it to
// delegate to the harness so the component and the Provider share one context.
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

import { renderWithRpc } from "./rpcHarness";
import { NodeList } from "../components/NodeList";
import type { Category } from "../components/NodeList/types";

const fakeRpc = (npSupported = false) => ({
    getCommonRpcClient: () => ({ isNPSupported: async () => npSupported }),
});

const node = (id: string, label: string): any => ({
    id,
    enabled: true,
    label,
    metadata: { label },
    description: "",
});

const props = (categories: any[]) =>
    ({
        categories,
        title: "Nodes",
        onSelect: jest.fn(),
        onSearch: jest.fn(),
        onAddConnection: jest.fn(),
        onSelectConnector: jest.fn(),
    } as any);

type CreateFunctionCase = {
    name: string;
    categories: Category[];
    expand: string[];
    showsCreateFunction: boolean;
};

const createFunctionCases: CreateFunctionCase[] = [
    {
        name: "canonical current-integration category",
        categories: [{
            title: "Current Integration",
            description: "Functions in the current integration",
            items: [],
        }],
        expand: [],
        showsCreateFunction: true,
    },
    {
        name: "submodule-shaped current-integration category within a project",
        categories: [{
            title: "Within Project",
            description: "Packages within the project",
            items: [
                {
                    title: "orders.helpers (Current Integration)",
                    description: "Current integration submodule",
                    items: [{
                        id: "local",
                        label: "localFunction",
                        description: "Local function",
                        enabled: true,
                    }],
                },
                {
                    title: "inventory",
                    description: "Another package",
                    items: [],
                },
            ],
        }],
        expand: ["Within Project"],
        showsCreateFunction: true,
    },
    {
        name: "workspace packages without a current-integration marker",
        categories: [{
            title: "Within Project",
            description: "Packages within the project",
            items: [
                {
                    title: "orders",
                    description: "Workspace package",
                    items: [{
                        id: "workspace",
                        label: "workspaceFunction",
                        description: "Workspace function",
                        enabled: true,
                    }],
                },
                {
                    title: "orders.helpers",
                    description: "Workspace submodule",
                    items: [],
                },
            ],
        }],
        expand: ["Within Project"],
        showsCreateFunction: false,
    },
];

describe("NodeList (rpc-driven)", () => {
    it("INVARIANT: renders every category title from the categories prop", async () => {
        const categories = [
            { title: "Statements", items: [node("log", "Log"), node("if", "If")] },
            { title: "Connections", items: [node("http", "HTTP Client")] },
        ];
        const { container } = renderWithRpc(<NodeList {...props(categories)} />, fakeRpc());
        // the isNPSupported() rpc effect runs against the fake client without crashing
        await waitFor(() => expect(container.textContent).toContain("Statements"));
        expect(container.textContent).toContain("Connections");
    });

    it("renders with the rpc client wired (feature-flag effect) without throwing", async () => {
        const npCalled = jest.fn().mockResolvedValue(true);
        const rpc = { getCommonRpcClient: () => ({ isNPSupported: npCalled }) };
        const categories = [{ title: "Functions", items: [node("fn", "Function")] }];
        const { container } = renderWithRpc(<NodeList {...props(categories)} />, rpc);
        // proves the component reached the rpc client through the shared context
        await waitFor(() => expect(npCalled).toHaveBeenCalled());
        expect(container.textContent).toContain("Functions");
    });

    it("does not crash when a malformed category has no title", () => {
        const malformedCategory = {
            title: undefined,
            items: [node("fn", "Function")],
        } as unknown as Category;
        const { container } = renderWithRpc(
            <NodeList {...props([malformedCategory])} />,
            { getCommonRpcClient: () => ({ isNPSupported: () => new Promise<boolean>(() => undefined) }) }
        );

        expect(container).toBeTruthy();
    });

    it.each(createFunctionCases)("offers function creation for $name: $showsCreateFunction", async (testCase) => {
        const onAddFunction = jest.fn();
        const { getByText, queryAllByText } = renderWithRpc(
            <NodeList {...props(testCase.categories)} onAddFunction={onAddFunction} />,
            fakeRpc()
        );

        testCase.expand.forEach((title) => fireEvent.click(getByText(title)));
        const expectedActionCount = testCase.showsCreateFunction ? 1 : 0;
        const visibleCreateFunctionActions = () => queryAllByText("Create Function")
            .filter((element) => getComputedStyle(element).visibility !== "hidden");
        await waitFor(() => expect(visibleCreateFunctionActions()).toHaveLength(expectedActionCount));
        if (testCase.showsCreateFunction) {
            fireEvent.click(visibleCreateFunctionActions()[0]);
        }
        expect(onAddFunction).toHaveBeenCalledTimes(expectedActionCount);
    });

    // rpc feature-flag gating: the NP_FUNCTION node must appear only when the LS reports
    // natural-programming supported — a node wrongly listed/hidden is the #766-class of
    // "node not (correctly) listed in the UI", decided here on the FE from the rpc flag.
    // (searchText expands the category so the node rows are rendered.)
    it.each([
        ["hidden when the LS reports NP unsupported", false, false],
        ["shown when the LS reports NP supported", true, true],
    ])("INVARIANT: NP_FUNCTION node %s", async (_desc, npSupported, expectVisible) => {
        const categories = [
            { title: "Functions", items: [node("NP_FUNCTION", "Natural Function"), node("fn", "Function")] },
        ];
        const rpc = { getCommonRpcClient: () => ({ isNPSupported: async () => npSupported }) };
        const { container } = renderWithRpc(<NodeList {...props(categories)} searchText="Function" />, rpc);
        // the ordinary node is always present; NP visibility is gated on the rpc flag
        await waitFor(() => expect(container.textContent).toContain("Function"));
        expect((container.textContent ?? "").includes("Natural Function")).toBe(expectVisible);
    });

    // Regression: when every candidate node in a category is filtered out (here, the
    // category's only item is NP_FUNCTION and NP is unsupported), the grid container itself
    // must not render — an empty grid would still reserve layout spacing.
    // (searchText forces the category expanded, as in the NP_FUNCTION test above.)
    it("INVARIANT: a category whose every node is filtered out renders no empty grid", async () => {
        const categories = [
            { title: "Functions", items: [node("NP_FUNCTION", "Natural Function")] },
        ];
        const rpc = { getCommonRpcClient: () => ({ isNPSupported: async () => false }) };
        const { container } = renderWithRpc(
            <NodeList {...props(categories)} searchText="Function" />,
            rpc
        );

        await waitFor(() => expect(container.textContent).toContain("Functions"));
        expect(container.textContent).not.toContain("Natural Function");
        const grids = Array.from(container.querySelectorAll("div")).filter(
            (el) => getComputedStyle(el).display === "grid"
        );
        expect(grids).toHaveLength(0);
    });
    // Regression (wso2/product-integrator): two columns of a side panel are too narrow for a
    // name like "Send Data to Child Workflow", and the row used to cut it to one clipped line.
    // The name now wraps within its row rather than being held on one line.
    it("INVARIANT: a long node name wraps rather than being held on one line", async () => {
        const label = "Send Data to Child Workflow";
        const categories = [{ title: "Child Workflows", items: [node("CHILD_WORKFLOW_SEND_DATA", label)] }];
        const { findByText } = renderWithRpc(
            <NodeList {...props(categories)} searchText="Child" />,
            fakeRpc()
        );

        const shown = await findByText(label);
        expect(shown.textContent).toBe(label);
        expect(getComputedStyle(shown).whiteSpace).not.toBe("nowrap");
    });

    // One tooltip per row and no more. The styled one carries the description; a node that has
    // none falls back to the browser's own with the name, so a clipped name is still readable.
    // The name must not appear twice in the document: the styled tooltip's content is mounted
    // whether or not it is shown, and a duplicate breaks every locator that matches on the name.
    it.each([
        ["described", "Sends a data event to a running child workflow", 0],
        ["undescribed", "", 1],
    ])("INVARIANT: a %s node row carries exactly one tooltip", async (_desc, description, nativeTitles) => {
        const label = "Send Data to Child Workflow";
        const item = { ...node("CHILD_WORKFLOW_SEND_DATA", label), description };
        const { container, findByText } = renderWithRpc(
            <NodeList {...props([{ title: "Child Workflows", items: [item] }])} searchText="Child" />,
            fakeRpc()
        );

        await findByText(label);
        expect(container.querySelectorAll(`[title="${label}"]`)).toHaveLength(nativeTitles);
        const showingTheName = Array.from(container.querySelectorAll("div"))
            .filter((el) => el.textContent === label && el.children.length === 0);
        expect(showingTheName).toHaveLength(1);
    });
});
