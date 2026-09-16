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

import React, { useState } from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import { AgentUsage, Flow, FlowNode } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";

// The hook's rpc-client import is an ES module jest cannot parse, so the context is mocked; the design-model walk is
// mocked too, so the hook's fetch-and-cache behaviour is under test on its own.
jest.mock("@wso2/ballerina-rpc-client", () => ({ useRpcContext: jest.fn() }));
jest.mock("../FocusFlowDiagram/agentUsages", () => ({ ...jest.requireActual("../FocusFlowDiagram/agentUsages"), findDurableAgentUsages: jest.fn() }));

import { findDurableAgentUsages } from "../FocusFlowDiagram/agentUsages";
import { durableAgentRefOf, durableUsagesReady, findDurableAgentBox, sameUsages, useDurableAgentUsages, withDurableUsages } from "./durableAgentUsages";

const AGENTS_BAL = "/proj/agents.bal";

function node(id: string, kind: string, data: Record<string, unknown> = {}): FlowNode {
    return {
        id,
        codedata: { node: kind, lineRange: { fileName: AGENTS_BAL, startLine: { line: 40, offset: 0 }, endLine: { line: 41, offset: 0 } } },
        metadata: { label: id, description: "", data },
    } as unknown as FlowNode;
}

const start = node("start", "EVENT_START");
const box = node("box", "DURABLE_AGENT_RUN", {
    agentBox: true,
    agentName: "claimAgent",
    declaration: { fileName: AGENTS_BAL, startLine: { line: 5, offset: 0 }, endLine: { line: 20, offset: 3 } },
});
const flow = { fileName: "/proj/main.bal", nodes: [start, box] } as unknown as Flow;
const usage: AgentUsage = { label: "POST /conversations", documentUri: "/proj/services.bal", position: { startLine: 3, startColumn: 0, endLine: 4, endColumn: 1 } };

describe("durable agent usages on the flow model", () => {
    it("finds the agent-box copy of the declaration and names the agent by its declaration, not the flow's file", () => {
        expect(findDurableAgentBox(flow)).toBe(box);
        expect(durableAgentRefOf(flow, box)).toEqual({ filePath: AGENTS_BAL, startLine: 5, symbol: "claimAgent" });
        expect(findDurableAgentBox({ ...flow, nodes: [start, node("run", "DURABLE_AGENT_RUN")] } as Flow)).toBeUndefined();
    });

    it("falls back to the box's own range when the declaration is missing", () => {
        const bare = node("box", "DURABLE_AGENT_RUN", { agentBox: true });
        expect(durableAgentRefOf(flow, bare)).toEqual({ filePath: "/proj/main.bal", startLine: 40, symbol: undefined });
    });

    it("writes the usages onto the box's flat metadata and leaves every other node alone", () => {
        const next = withDurableUsages(flow, [usage]);
        expect(next.nodes[0]).toBe(start);
        expect((next.nodes[1].metadata.data as { usages?: AgentUsage[]; agentName?: string })).toMatchObject({ agentName: "claimAgent", usages: [usage], animateUsages: true });
        expect((withDurableUsages(flow, [usage], false).nodes[1].metadata.data as { animateUsages?: boolean }).animateUsages).toBe(false);
        expect(sameUsages((next.nodes[1].metadata.data as { usages?: AgentUsage[] }).usages, [usage])).toBe(true);
        expect(sameUsages(undefined, [])).toBe(true);
        expect(sameUsages(undefined, [usage])).toBe(false);
    });

    it("holds the canvas until the box has a usage list, and stays ready for an agent whose list was shown before", () => {
        expect(durableUsagesReady(box, "k", undefined)).toBe(false);
        expect(durableUsagesReady(findDurableAgentBox(withDurableUsages(flow, [])), "k", undefined)).toBe(true);
        expect(durableUsagesReady(box, "k", { key: "k", usages: [] })).toBe(true);
        expect(durableUsagesReady(box, "k", { key: "other", usages: [] })).toBe(false);
        expect(durableUsagesReady(undefined, undefined, undefined)).toBe(true);
    });
});

describe("useDurableAgentUsages", () => {
    const contentListeners: (() => void)[] = [];
    const getDesignModel = jest.fn(async () => ({ designModel: {} }));
    let root: Root;
    let container: HTMLDivElement;
    let latest: Flow | undefined;

    // The flow diagram's own state: the hook writes usages back through setFlow, a content change hands it a fresh model.
    let refresh: (flow: Flow) => void = () => {};
    function Probe({ initial }: { initial: Flow }): null {
        const [flow, setFlow] = useState(initial);
        refresh = setFlow;
        latest = flow;
        useDurableAgentUsages(true, flow, "/proj", setFlow);
        return null;
    }

    const boxUsages = () => (findDurableAgentBox(latest)?.metadata?.data as { usages?: AgentUsage[] })?.usages;
    const flush = async (ms: number) => {
        await act(async () => {
            jest.advanceTimersByTime(ms);
            await Promise.resolve();
        });
    };

    beforeEach(() => {
        jest.useFakeTimers();
        contentListeners.length = 0;
        getDesignModel.mockClear();
        (useRpcContext as jest.Mock).mockReturnValue({
            rpcClient: {
                onProjectContentUpdated: (listener: () => void) => {
                    contentListeners.push(listener);
                    return () => {};
                },
                getBIDiagramRpcClient: () => ({ getDesignModel }),
            },
        });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    });

    it("refetches the callers after a project content change instead of putting the stale cache back", async () => {
        (findDurableAgentUsages as jest.Mock).mockReturnValue([]);
        // A fresh agent name so the module-level cache starts empty for this test.
        const freshBox = node("box", "DURABLE_AGENT_RUN", { agentBox: true, agentName: `agent-${Date.now()}` });
        const initial = { fileName: "/proj/main.bal", nodes: [start, freshBox] } as unknown as Flow;
        act(() => root.render(React.createElement(Probe, { initial })));
        await flush(0);
        expect(getDesignModel).toHaveBeenCalledTimes(1);
        expect(boxUsages()).toEqual([]);

        // A trigger was added: the project content changes, and the flow model comes back without usages.
        (findDurableAgentUsages as jest.Mock).mockReturnValue([usage]);
        act(() => contentListeners.forEach((listener) => listener()));
        act(() => refresh({ ...initial, nodes: [start, { ...freshBox }] } as Flow));
        await flush(0);
        // The cached (empty) list paints first, then the dirty cache is refreshed after the debounce.
        expect(boxUsages()).toEqual([]);
        await flush(600);
        expect(getDesignModel).toHaveBeenCalledTimes(2);
        expect(boxUsages()).toEqual([usage]);

        // Without a content change, a refreshed model only puts the cache back.
        act(() => refresh({ ...initial, nodes: [start, { ...freshBox }] } as Flow));
        await flush(600);
        expect(getDesignModel).toHaveBeenCalledTimes(2);
        expect(boxUsages()).toEqual([usage]);
    });
});
