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

import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Diagram } from "../components/Diagram";
import { Flow } from "../utils/types";

const agentFlow = (): Flow => ({
    fileName: "agents.bal",
    nodes: [{
        id: "agent-1",
        codedata: { node: "AGENT", lineRange: { fileName: "agents.bal", startLine: { line: 4, offset: 0 }, endLine: { line: 8, offset: 1 } } },
        returning: true,
        properties: { variable: { value: "mathTutorAgent" } },
        metadata: {
            label: "AI Agent",
            data: {
                agentInfo: {
                    animateUsages: false,
                    usages: [{
                        label: "POST /chat",
                        type: "http:Service",
                        documentUri: "main.bal",
                        position: { startLine: 6, startColumn: 4, endLine: 9, endColumn: 5 },
                        trigger: { serviceName: "/math-tutor", documentUri: "main.bal", listeners: [],
                            position: { startLine: 5, startColumn: 0, endLine: 12, endColumn: 1 } },
                    }],
                },
            },
        },
    }],
    connections: [],
} as unknown as Flow);

const agentNode = { onAddTrigger: jest.fn(), onDeleteTrigger: jest.fn(), onTryTrigger: jest.fn() };

const props = {
    onAddNode: jest.fn(), onDeleteNode: jest.fn(), onNodeSelect: jest.fn(),
    onAddComment: jest.fn(), goToSource: jest.fn(), openView: jest.fn(),
};

const GEOMETRY_TESTIDS = ["agent-node", "agent-usage-column", "agent-usage-row", "agent-usage-menu", "agent-add-trigger"];

async function geometryOf(readOnly: boolean): Promise<Record<string, number>> {
    const dom = render(<Diagram model={agentFlow()} {...props} agentNode={agentNode} readOnly={readOnly} />);
    await waitFor(() => expect(dom.container.querySelector("[data-testid='agent-node']")).toBeTruthy(),
        { timeout: 10000 });
    const counts = Object.fromEntries(GEOMETRY_TESTIDS.map((id) =>
        [id, dom.container.querySelectorAll(`[data-testid='${id}']`).length]));
    dom.unmount();
    return counts;
}

describe("the agent node's footprint does not depend on transient state", () => {
    it("renders the same geometry-bearing elements whether or not readOnly is set", async () => {
        const editable = await geometryOf(false);
        const loading = await geometryOf(true);

        expect(loading).toEqual(editable);
    });

    it("still draws the usage column and its add tile while a refresh is in flight", async () => {
        const loading = await geometryOf(true);

        expect(loading["agent-usage-column"]).toBe(1);
        expect(loading["agent-add-trigger"]).toBe(1);
        expect(loading["agent-usage-row"]).toBe(1);
        expect(loading["agent-usage-menu"]).toBe(1);
    });
});
