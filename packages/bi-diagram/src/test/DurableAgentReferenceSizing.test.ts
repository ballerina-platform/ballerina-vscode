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

import { traverseFlow } from "@wso2/ballerina-core";

import {
    AGENT_CALL_REFERENCE_HEIGHT,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_WIDTH,
} from "../resources/constants";
import {
    AGENT_USAGE_ROW_PITCH,
    DURABLE_CAPTION_HEIGHT,
    DURABLE_FOOTER_TILE_PITCH,
    DURABLE_LEFT_SECTION_GAP,
    DURABLE_SENDER_COLUMN_WIDTH,
    DURABLE_USAGE_COLUMN_EXTRA_WIDTH,
} from "../components/nodes/AgentWidget/agentNodeLayout";
import { SizingVisitor } from "../visitors/SizingVisitor";

const createAgentBoxNode = () => ({
    id: "durable-agent-run-node",
    codedata: { node: "DURABLE_AGENT_RUN" },
    viewState: { x: 0, y: 0, lw: 0, rw: 0, h: 0, clw: 0, crw: 0, ch: 0 },
    metadata: { label: "Run Agent", description: "", data: { agentBox: true } },
    branches: [],
});

const createFlow = (node: ReturnType<typeof createAgentBoxNode>) => ({ nodes: [node] } as any);

const halfNodeWidth = NODE_WIDTH / 2;
const sideColumnWidth = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;

// The right column at n rows: the model circle, then the rest under the tool section gap, flush at the bottom.
const rightColumn = (rows: number) =>
    NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + (rows - 1) * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
// A left-column group of n circles, preceded by the section gap.
const leftGroup = (rows: number) => DURABLE_LEFT_SECTION_GAP + rows * (NODE_HEIGHT + AGENT_NODE_TOOL_GAP);
// The two footer tiles right under the circles: one row, and the second tile a tile pitch lower.
const footerTiles = NODE_HEIGHT + DURABLE_FOOTER_TILE_PITCH;

describe("SizingVisitor: durable-agent reference sizing", () => {
    it("sizes the full agent box (with side columns holding the add tiles) when not a run() reference", () => {
        const node = createAgentBoxNode();
        traverseFlow(createFlow(node), new SizingVisitor(undefined, false));

        // Left: the two footer tiles fit under the right column's model circle plus tool tile.
        expect(node.viewState.lw).toBe(halfNodeWidth + sideColumnWidth);
        expect(node.viewState.rw).toBe(halfNodeWidth + sideColumnWidth);
        expect(node.viewState.ch).toBe(rightColumn(2));
    });

    const usage = (label: string) => ({ label, documentUri: "/proj/services.bal", position: { line: 1, offset: 0 } });

    it("stacks the trigger block on the left: five caller rows, \"+N more\", the Add Trigger tile, then the circles", () => {
        const node = createAgentBoxNode();
        node.metadata.data = {
            agentBox: true,
            usages: Array.from({ length: 7 }, (_, i) => usage(`POST /r${i}`)),
            humanTasks: [{ name: "signoff" }],
            events: [{ name: "chat" }],
        } as any;
        traverseFlow(createFlow(node), new SizingVisitor({ canAddTrigger: true }, false));

        const triggerBlock = (5 + 1 + 1) * AGENT_USAGE_ROW_PITCH;
        // One task and one event circle, then the two footer tiles.
        expect(node.viewState.lw).toBe(halfNodeWidth + sideColumnWidth + DURABLE_USAGE_COLUMN_EXTRA_WIDTH);
        expect(node.viewState.rw).toBe(halfNodeWidth + sideColumnWidth);
        expect(node.viewState.ch).toBe(triggerBlock + leftGroup(2) + footerTiles);
    });

    it("hangs a channel's senders off its circle: the slot grows to their rows and the column widens for them", () => {
        const node = createAgentBoxNode();
        node.metadata.data = {
            agentBox: true,
            usages: [usage("POST /orders"), { ...usage("POST /orders/[string id]/events"), channel: "shipping" }, { ...usage("POST /orders/[string id]/cancel"), channel: "shipping" }],
            humanTasks: [{ name: "signoff" }],
            events: [{ name: "shipping" }],
        } as any;
        traverseFlow(createFlow(node), new SizingVisitor({ canAddTrigger: true }, false));

        // One run row and the Add Trigger tile; the task keeps a circle row, the event's slot is its two sender rows.
        const triggerBlock = 2 * AGENT_USAGE_ROW_PITCH;
        const circles = DURABLE_LEFT_SECTION_GAP + (NODE_HEIGHT + AGENT_NODE_TOOL_GAP) + 2 * AGENT_USAGE_ROW_PITCH;
        expect(node.viewState.lw).toBe(halfNodeWidth + sideColumnWidth + DURABLE_USAGE_COLUMN_EXTRA_WIDTH + DURABLE_SENDER_COLUMN_WIDTH);
        expect(node.viewState.ch).toBe(triggerBlock + circles + footerTiles);
    });

    it("gives each channel an Add Trigger tile beside its circle without opening the sender column", () => {
        const node = createAgentBoxNode();
        node.metadata.data = { agentBox: true, events: [{ name: "chat" }] } as any;
        traverseFlow(createFlow(node), new SizingVisitor({ canAddTrigger: true, canAddEventTrigger: true }, false));

        // The Add Trigger tile alone at the top; the channel's slot is one tile row plus room for its caption.
        const triggerBlock = AGENT_USAGE_ROW_PITCH;
        const channelSlot = Math.max(AGENT_USAGE_ROW_PITCH, NODE_HEIGHT + AGENT_NODE_TOOL_GAP + DURABLE_CAPTION_HEIGHT);
        expect(node.viewState.lw).toBe(halfNodeWidth + sideColumnWidth + DURABLE_USAGE_COLUMN_EXTRA_WIDTH);
        expect(node.viewState.ch).toBe(triggerBlock + DURABLE_LEFT_SECTION_GAP + channelSlot + footerTiles);
    });

    it("reserves the wide left column for the Add Trigger tile alone, without growing past the right column", () => {
        const node = createAgentBoxNode();
        traverseFlow(createFlow(node), new SizingVisitor({ canAddTrigger: true }, false));

        expect(node.viewState.lw).toBe(halfNodeWidth + sideColumnWidth + DURABLE_USAGE_COLUMN_EXTRA_WIDTH);
        expect(node.viewState.ch).toBe(rightColumn(2));
    });

    it("collapses to the simple reference row (no side columns) for a run() call site", () => {
        const node = createAgentBoxNode();
        traverseFlow(createFlow(node), new SizingVisitor(undefined, true));

        expect(node.viewState.lw).toBe(halfNodeWidth);
        expect(node.viewState.rw).toBe(halfNodeWidth);
        expect(node.viewState.ch).toBe(NODE_HEIGHT + AGENT_CALL_REFERENCE_HEIGHT);
    });
});
