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

// L1: getWorkflowFunctionIconName is the shared source of truth the side panel and NodeIcon both
// call to key a workflow accessor's icon off its symbol rather than its (generic) node kind. These
// pin its five supported symbols, the exact ballerina/workflow scoping, and the unknown-symbol
// fallback so a change here cannot silently drop an icon or leak it onto an unrelated function.
//
// L2: NodeIcon and BaseNodeWidget render tests confirm the same contract holds through the public
// component paths — a workflow accessor icon wins over the generic per-node-kind icon, and a node
// that does not match the ballerina/workflow scope keeps its generic icon.

import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Diagram } from "../components/Diagram";
import NodeIcon, { getWorkflowFunctionIconName } from "../components/NodeIcon";
import { Flow } from "../utils/types";

describe("getWorkflowFunctionIconName", () => {
    it.each([
        ["currentTime", "bi-timeline"],
        ["isReplaying", "bi-redo"],
        ["getWorkflowId", "bi-key"],
        ["getWorkflowType", "bi-type"],
        ["sleep", "bi-clock"],
    ])("maps %s to %s for a ballerina/workflow call", (symbol, expectedIcon) => {
        expect(getWorkflowFunctionIconName("ballerina", "workflow", symbol)).toBe(expectedIcon);
    });

    it("does not match an unknown symbol", () => {
        expect(getWorkflowFunctionIconName("ballerina", "workflow", "somethingElse")).toBeUndefined();
    });

    it("does not match outside the ballerina org", () => {
        expect(getWorkflowFunctionIconName("ballerinax", "workflow", "sleep")).toBeUndefined();
    });

    it("does not match outside the workflow module", () => {
        // A function named `sleep` living in some other module must not pick up the clock glyph.
        expect(getWorkflowFunctionIconName("ballerina", "workflow.activity", "sleep")).toBeUndefined();
    });

    it("does not match without a symbol", () => {
        expect(getWorkflowFunctionIconName("ballerina", "workflow", undefined)).toBeUndefined();
    });
});

describe("NodeIcon workflow accessor precedence", () => {
    it("shows the workflow accessor icon instead of the generic node-kind icon", () => {
        const { container } = render(
            <NodeIcon type={"EXPRESSION" as any} symbol="sleep" org="ballerina" module="workflow" />
        );

        expect(container.querySelector(".fw-bi-clock")).toBeInTheDocument();
        // EXPRESSION's generic icon (CodeIcon) is a plain <svg>; it must be replaced, not layered.
        expect(container.querySelector("svg")).not.toBeInTheDocument();
    });

    it("falls back to the generic node-kind icon outside the ballerina/workflow scope", () => {
        const { container } = render(
            <NodeIcon type={"EXPRESSION" as any} symbol="sleep" org="ballerinax" module="workflow" />
        );

        expect(container.querySelector(".fw-bi-clock")).not.toBeInTheDocument();
        expect(container.querySelector("svg")).toBeInTheDocument();
    });
});

describe("BaseNodeWidget rendering a workflow accessor statement", () => {
    // The language server currently sends `workflow:sleep()` as a generic EXPRESSION statement (see
    // utils/node.ts), so BaseNodeWidget must forward the statement's symbol/org/module to NodeIcon
    // for the clock glyph to appear at all.
    const flowWithGenericSleepCall = {
        fileName: "main.bal",
        nodes: [
            {
                id: "start",
                metadata: { label: "Start" },
                codedata: {
                    node: "EVENT_START",
                    lineRange: {
                        fileName: "main.bal",
                        startLine: { line: 1, offset: 0 },
                        endLine: { line: 1, offset: 20 },
                    },
                },
                returning: false,
                flags: 0,
            },
            {
                id: "sleep-call",
                metadata: { label: "workflow:sleep" },
                codedata: {
                    node: "EXPRESSION",
                    org: "ballerina",
                    module: "workflow",
                    symbol: "sleep",
                    lineRange: {
                        fileName: "main.bal",
                        startLine: { line: 2, offset: 4 },
                        endLine: { line: 2, offset: 30 },
                    },
                },
                properties: {},
                branches: [],
                returning: false,
                flags: 0,
            },
        ],
        connections: [],
    } as unknown as Flow;

    const mockProps = {
        onAddNode: jest.fn(),
        onAddNodePrompt: jest.fn(),
        onDeleteNode: jest.fn(),
        onAddComment: jest.fn(),
        onNodeSelect: jest.fn(),
        onNodeSave: jest.fn(),
        addBreakpoint: jest.fn(),
        removeBreakpoint: jest.fn(),
        onConnectionSelect: jest.fn(),
        goToSource: jest.fn(),
        openView: jest.fn(),
    };

    it("renders the workflow accessor icon for a generic statement node", () => {
        const { container } = render(<Diagram model={flowWithGenericSleepCall} {...mockProps} />);

        expect(container.querySelector(".fw-bi-clock")).toBeInTheDocument();
    });
});
