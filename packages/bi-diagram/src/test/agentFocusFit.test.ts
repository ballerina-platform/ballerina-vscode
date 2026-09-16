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

import { AGENT_FOCUS_FIT_PADDING, AGENT_FOCUS_FIT_PADDING_Y, AGENT_FOCUS_READABLE_ZOOM, findAgentFocusNode, fitAgentFocus } from "../components/nodes/AgentWidget/agentFocusFit";
import { DurableAgentRunNodeModel } from "../components/nodes/DurableAgentRunNode/DurableAgentRunNodeModel";
import { StartNodeModel } from "../components/nodes/StartNode/StartNodeModel";

const flowNode = (id: string, kind: string) =>
    ({ id, codedata: { node: kind }, viewState: { x: 0, y: 0, lw: 0, rw: 0, h: 0 }, metadata: { label: id, description: "", data: {} }, branches: [] }) as any;

describe("findAgentFocusNode", () => {
    it("picks the durable agent box out of the declaration canvas, beside its Start pill", () => {
        const start = new StartNodeModel(flowNode("start", "EVENT_START"));
        const box = new DurableAgentRunNodeModel(flowNode("box", "DURABLE_AGENT_RUN"));
        expect(findAgentFocusNode([start, box])).toBe(box);
        expect(findAgentFocusNode([start])).toBeUndefined();
    });
});

const node = { contentWidth: 900, contentHeight: 1300, contentLeft: -450, contentTop: 0, embedded: true };

describe("fitAgentFocus", () => {
    it("shrinks a tall node so the whole of it shows when that keeps it readable", () => {
        const fit = fitAgentFocus({ ...node, canvasWidth: 1900, canvasHeight: 1200 });
        expect(fit.targetZoomPct).toBeCloseTo(((1200 - 2 * AGENT_FOCUS_FIT_PADDING_Y) / 1300) * 100);
        const zoom = fit.targetZoomPct / 100;
        expect(fit.targetOffsetY).toBeCloseTo(1200 / 2 - 650 * zoom);
        expect(fit.targetOffsetX).toBeCloseTo(1900 / 2);
    });

    it("keeps a short canvas readable and shows the node from its top", () => {
        const fit = fitAgentFocus({ ...node, contentHeight: 360, canvasWidth: 900, canvasHeight: 225 });
        expect(fit.targetZoomPct).toBe(AGENT_FOCUS_READABLE_ZOOM);
        expect(fit.targetOffsetY).toBe(AGENT_FOCUS_FIT_PADDING_Y);
    });

    it("lets width win when the canvas is narrow, and never zooms past 1:1", () => {
        const narrow = fitAgentFocus({ ...node, contentHeight: 300, canvasWidth: 465, canvasHeight: 900 });
        expect(narrow.targetZoomPct).toBeCloseTo(((465 - 2 * AGENT_FOCUS_FIT_PADDING) / 900) * 100);
        const roomy = fitAgentFocus({ ...node, contentHeight: 300, canvasWidth: 1900, canvasHeight: 900 });
        expect(roomy.targetZoomPct).toBe(100);
        expect(roomy.targetOffsetY).toBeCloseTo(900 / 2 - 150);
    });

    it("keeps the top padding above a node the upward bias would otherwise lift into the header", () => {
        const tall = fitAgentFocus({ ...node, embedded: false, contentHeight: 900 - 2 * AGENT_FOCUS_FIT_PADDING_Y, canvasWidth: 1900, canvasHeight: 900 });
        expect(tall.targetZoomPct).toBe(100);
        expect(tall.targetOffsetY).toBe(AGENT_FOCUS_FIT_PADDING_Y);
        const short = fitAgentFocus({ ...node, embedded: false, contentHeight: 300, canvasWidth: 1900, canvasHeight: 900 });
        expect(short.targetOffsetY).toBeCloseTo(900 / 2 - 40 - 150);
    });
});
