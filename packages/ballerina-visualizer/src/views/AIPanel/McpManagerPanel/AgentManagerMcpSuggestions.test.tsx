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

// The Agent Manager section is Agent Builder-only, so outside Agent Builder the MCP panel must
// not ask for the offer (an Agent Manager session lookup) at all.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockGetOffer = jest.fn();
let mockMode = "integrator";

jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    ProductMode: { INTEGRATOR: "integrator", AGENT_BUILDER: "agent-builder" },
}));

jest.mock("@wso2/ballerina-rpc-client", () => ({
    __esModule: true,
    useRpcContext: () => ({
        rpcClient: { getAgentManagerRpcClient: () => ({ getAgentManagerMcpOffer: mockGetOffer }) },
    }),
}));

jest.mock("@wso2/ui-toolkit", () => ({ Codicon: (): null => null, Icon: (): null => null }));

jest.mock("../../../hooks/useProductMode", () => ({
    __esModule: true,
    useProductMode: (): string => mockMode,
}));

import { AgentManagerMcpSuggestions } from "./AgentManagerMcpSuggestions";

describe("AgentManagerMcpSuggestions", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        mockGetOffer.mockReset();
        mockGetOffer.mockResolvedValue({ servers: [] });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = async () => {
        await act(async () => {
            root.render(<AgentManagerMcpSuggestions servers={[]} />);
        });
    };

    it("does not fetch the Agent Manager offer outside Agent Builder", async () => {
        mockMode = "integrator";
        await render();
        expect(mockGetOffer).not.toHaveBeenCalled();
    });

    it("fetches the Agent Manager offer in Agent Builder", async () => {
        mockMode = "agent-builder";
        await render();
        expect(mockGetOffer).toHaveBeenCalledTimes(1);
    });
});
