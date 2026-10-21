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

// L2 / C03: clicking a node in the Agent Builder topology has to open the right thing for the
// thing clicked. Each of these sends one navigation to the host, and the payload IS the
// behaviour — a wrong file or position opens somebody else's artifact, which looks identical
// on screen until you edit it.

// The core barrel re-exports an ESM-only LS transport jest cannot load; these two enums are
// all this module reads from it, and the values must match the real ones because the host
// branches on them.
jest.mock("@wso2/ballerina-core", () => ({
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW" },
    MACHINE_VIEW: { BIServiceConfigView: "BI Service Config View" },
}));

import { openAgent, openServiceConfig, openTrigger } from "./topologyNavigation";

function makeRpcClient() {
    const openView = jest.fn();
    return { rpcClient: { getVisualizerRpcClient: () => ({ openView }) } as never, openView };
}

const POSITION = { startLine: { line: 4, offset: 0 }, endLine: { line: 9, offset: 1 } };

describe("opening an agent", () => {
    it("navigates to the agent's own file and position", () => {
        const { rpcClient, openView } = makeRpcClient();

        openAgent(rpcClient, { path: "/w/orders/agents.bal", position: POSITION } as never);

        expect(openView).toHaveBeenCalledTimes(1);
        expect(openView).toHaveBeenCalledWith({
            type: "OPEN_VIEW",
            location: { documentUri: "/w/orders/agents.bal", position: POSITION },
        });
    });

    // Deliberately no `view`: the host resolves which editor to open from the artifact at that
    // position, so an agent opens the same way whether it is reached from the topology or the
    // project tree. Naming a view here would make the two diverge.
    it("names no view, leaving the host to resolve it from the artifact", () => {
        const { rpcClient, openView } = makeRpcClient();

        openAgent(rpcClient, { path: "/w/orders/agents.bal", position: POSITION } as never);

        expect(openView.mock.calls[0][0].location).not.toHaveProperty("view");
    });
});

describe("opening a trigger", () => {
    // A selection carries a start and an optional end as {line, offset}; the navigation sends
    // the flattened range the host expects.
    const selection = {
        filePath: "/w/orders/main.bal",
        position: { line: 4, offset: 0 },
        endPosition: { line: 9, offset: 1 },
    } as never;

    it("navigates to the trigger's file and line range", () => {
        const { rpcClient, openView } = makeRpcClient();

        openTrigger(rpcClient, selection);

        expect(openView).toHaveBeenCalledWith({
            type: "OPEN_VIEW",
            location: {
                documentUri: "/w/orders/main.bal",
                position: { startLine: 4, startColumn: 0, endLine: 9, endColumn: 1 },
            },
        });
    });

    // A node the diagram knows only by its start collapses to a point rather than producing an
    // undefined end, which the host would read as a range running to the top of the file.
    it("collapses to a point when the selection has no end", () => {
        const { rpcClient, openView } = makeRpcClient();

        openTrigger(rpcClient, { filePath: "/w/orders/main.bal", position: { line: 4, offset: 0 } } as never);

        expect(openView.mock.calls[0][0].location.position).toEqual({
            startLine: 4, startColumn: 0, endLine: 4, endColumn: 0,
        });
    });
});

describe("opening a service's configuration", () => {
    // Unlike the other two this one DOES name a view, because a service entry has no artifact
    // the host could resolve a config editor from on its own.
    it("opens the service config view at the entry", () => {
        const { rpcClient, openView } = makeRpcClient();

        openServiceConfig(rpcClient, {
            filePath: "/w/orders/main.bal",
            position: { line: 4, offset: 0 },
            endPosition: { line: 9, offset: 1 },
        } as never);

        expect(openView).toHaveBeenCalledWith({
            type: "OPEN_VIEW",
            location: {
                view: "BI Service Config View",
                documentUri: "/w/orders/main.bal",
                position: { startLine: 4, startColumn: 0, endLine: 9, endColumn: 1 },
            },
        });
    });
});
