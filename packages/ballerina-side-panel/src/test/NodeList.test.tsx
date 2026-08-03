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
import { waitFor } from "@testing-library/react";

// NodeList reads useRpcContext from the @wso2/ballerina-rpc-client barrel; mock it to
// delegate to the harness so the component and the Provider share one context.
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("./rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

import { renderWithRpc } from "./rpcHarness";
import { NodeList } from "../components/NodeList";

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
});

