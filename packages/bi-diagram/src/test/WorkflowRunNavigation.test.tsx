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

// The side icon of a Run Workflow node stands for the workflow being run, and clicking it opens
// that workflow — the same move as clicking a connection to open the connection. This was lost
// once when the node moved from the plain box (which navigated through its own View action) to the
// action shape with the icon beside it, so the click is pinned here.

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Diagram } from "../components/Diagram";
import { Flow } from "../utils/types";

const WORKFLOW_NAME = "orderWorkflow";

const workflowLocation = {
    view: "BIDiagram",
    documentUri: "main.bal",
    position: { startLine: 10, startColumn: 0, endLine: 20, endColumn: 1 },
    identifier: WORKFLOW_NAME,
};

const flowWithWorkflowRun = {
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
            id: "run",
            metadata: { label: "Run Workflow", description: "Run a workflow instance" },
            codedata: {
                node: "WORKFLOW_RUN",
                org: "ballerina",
                module: "workflow",
                // The workflow a run targets is kept as the node's symbol.
                symbol: WORKFLOW_NAME,
                lineRange: {
                    fileName: "main.bal",
                    startLine: { line: 2, offset: 4 },
                    endLine: { line: 2, offset: 60 },
                },
            },
            properties: {
                variable: {
                    metadata: { label: "Workflow ID Variable Name" },
                    valueType: "IDENTIFIER",
                    value: "workflowId",
                    optional: false,
                    editable: true,
                },
            },
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

async function clickWorkflowIcon() {
    const label = await screen.findByText(WORKFLOW_NAME);
    const icon = label.closest("svg");
    expect(icon).not.toBeNull();
    fireEvent.click(icon!);
}

describe("Run Workflow node", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("opens the workflow it runs when its icon is clicked", async () => {
        const getFunctionLocation = jest.fn().mockResolvedValue(workflowLocation);

        render(
            <Diagram
                model={flowWithWorkflowRun}
                {...mockProps}
                project={{ org: "wso2", path: "/project", getFunctionLocation }}
            />
        );

        await clickWorkflowIcon();

        await waitFor(() => expect(getFunctionLocation).toHaveBeenCalledWith(WORKFLOW_NAME));
        await waitFor(() => expect(mockProps.openView).toHaveBeenCalledWith(workflowLocation));
        expect(mockProps.onNodeSelect).not.toHaveBeenCalled();
    });

    it("falls back to selecting the node when there is nowhere to open the view", async () => {
        const getFunctionLocation = jest.fn().mockResolvedValue(workflowLocation);
        const { openView, ...withoutOpenView } = mockProps;

        render(
            <Diagram
                model={flowWithWorkflowRun}
                {...(withoutOpenView as typeof mockProps)}
                project={{ org: "wso2", path: "/project", getFunctionLocation }}
            />
        );

        await clickWorkflowIcon();

        await waitFor(() => expect(mockProps.onNodeSelect).toHaveBeenCalled());
    });

    it("falls back to selecting the node when the workflow cannot be located", async () => {
        const getFunctionLocation = jest.fn().mockResolvedValue(undefined);

        render(
            <Diagram
                model={flowWithWorkflowRun}
                {...mockProps}
                project={{ org: "wso2", path: "/project", getFunctionLocation }}
            />
        );

        await clickWorkflowIcon();

        await waitFor(() => expect(mockProps.onNodeSelect).toHaveBeenCalled());
        expect(mockProps.openView).not.toHaveBeenCalled();
    });
});
