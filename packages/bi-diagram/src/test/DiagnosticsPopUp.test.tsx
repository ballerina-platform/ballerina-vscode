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
import { fireEvent, render, screen } from "@testing-library/react";
import { DiagnosticsPopUp } from "../components/DiagnosticsPopUp";
import { DiagramContext, DiagramContextState } from "../components/DiagramContext";
import { FlowNode, ProductMode, assistantName } from "@wso2/ballerina-core";

const createContextValue = (
    options: {
        onAddNodePrompt?: jest.Mock;
        isUserAuthenticated?: boolean;
        readOnly?: boolean;
    } = {}
): DiagramContextState => ({
    flow: { fileName: "main.bal", nodes: [], connections: [] },
    componentPanel: {
        visible: false,
        show: jest.fn(),
        hide: jest.fn(),
    },
    showErrorFlow: false,
    expandedErrorHandler: undefined,
    toggleErrorHandlerExpansion: jest.fn(),
    onAddNode: jest.fn(),
    onAddNodePrompt: options.onAddNodePrompt,
    onDeleteNode: jest.fn(),
    onAddComment: jest.fn(),
    onNodeSelect: jest.fn(),
    onNodeSave: jest.fn(),
    addBreakpoint: jest.fn(),
    removeBreakpoint: jest.fn(),
    onConnectionSelect: jest.fn(),
    goToSource: jest.fn(),
    openView: jest.fn(),
    draftNode: {
        override: true,
        showSpinner: false,
        description: "",
    },
    selectedNodeId: undefined,
    agentNode: {
        onModelSelect: jest.fn(),
        onAddTool: jest.fn(),
        onAddMcpServer: jest.fn(),
        onSelectTool: jest.fn(),
        onSelectMcpToolkit: jest.fn(),
        onDeleteTool: jest.fn(),
        goToTool: jest.fn(),
        onSelectMemoryManager: jest.fn(),
        onDeleteMemoryManager: jest.fn(),
    },
    aiNodes: {
        onModelSelect: jest.fn(),
    },
    suggestions: {
        fetching: false,
        onAccept: jest.fn(),
        onDiscard: jest.fn(),
    },
    project: {
        org: "",
        path: "",
        getProjectPath: jest.fn(),
    },
    readOnly: options.readOnly ?? false,
    lockCanvas: false,
    setLockCanvas: jest.fn(),
    isUserAuthenticated: options.isUserAuthenticated ?? true,
    aiAssistantName: assistantName(ProductMode.INTEGRATOR),
    expressionContext: {
        completions: [],
        triggerCharacters: [],
        retrieveCompletions: jest.fn().mockResolvedValue(undefined),
    },
});

const createNode = (): FlowNode =>
    ({
        id: "node-1",
        metadata: {
            label: "Sample Node",
            description: "Sample",
        },
        codedata: {
            lineRange: {
                fileName: "main.bal",
                startLine: { line: 3, offset: 4 },
                endLine: { line: 3, offset: 20 },
            },
        },
        diagnostics: {
            hasDiagnostics: true,
            diagnostics: [
                { severity: "ERROR", message: "node level diagnostic" },
            ],
        },
        properties: {
            expression: {
                metadata: {
                    label: "Expression",
                    description: "Expression value",
                },
                value: "a + b",
                optional: false,
                editable: true,
                diagnostics: {
                    hasDiagnostics: true,
                    diagnostics: [
                        { severity: "WARNING", message: "property level diagnostic" },
                    ],
                },
                codedata: {
                    lineRange: {
                        fileName: "main.bal",
                        startLine: { line: 4, offset: 8 },
                        endLine: { line: 4, offset: 16 },
                    },
                },
                types: [{ fieldType: "TEXT", selected: true }],
            },
        },
        branches: [],
        returning: false,
    } as FlowNode);

const renderPopup = (contextValue: DiagramContextState) =>
    render(
        <DiagramContext.Provider value={contextValue}>
            <DiagnosticsPopUp node={createNode()} />
        </DiagramContext.Provider>
    );

describe("DiagnosticsPopUp", () => {
    it("opens the diagnostics popup without bubbling the click to the node container", () => {
        const parentClick = jest.fn();
        const contextValue = createContextValue();

        const { container } = render(
            <div onClick={parentClick}>
                <DiagramContext.Provider value={contextValue}>
                    <DiagnosticsPopUp node={createNode()} />
                </DiagramContext.Provider>
            </div>
        );

        const diagnosticsIcon = container.querySelector(".fw-error-outline-rounded");
        expect(diagnosticsIcon).toBeTruthy();

        fireEvent.click(diagnosticsIcon!.parentElement!);

        expect(screen.getByText("node level diagnostic")).toBeInTheDocument();
        expect(parentClick).not.toHaveBeenCalled();
    });

    it("invokes fix flow with aggregated diagnostics and launch options", () => {
        const onAddNodePrompt = jest.fn();
        const contextValue = createContextValue({
            onAddNodePrompt,
            isUserAuthenticated: true,
        });

        const { container } = renderPopup(contextValue);
        const diagnosticsIcon = container.querySelector(".fw-error-outline-rounded");
        expect(diagnosticsIcon).toBeTruthy();

        fireEvent.click(diagnosticsIcon!.parentElement!);

        const fixButtonLabel = screen.getByText("Fix with AI");
        const fixButton = fixButtonLabel.closest("vscode-button");
        expect(fixButton).toBeTruthy();
        expect(fixButton).not.toHaveAttribute("disabled");

        fireEvent.click(fixButton!);

        expect(onAddNodePrompt).toHaveBeenCalledTimes(1);
        const [node, target, prompt, launchOptions] = onAddNodePrompt.mock.calls[0];
        expect(node.id).toBe("node-1");
        expect(target.fileName).toBe("main.bal");
        expect(target.startLine.line).toBe(3);
        expect(prompt).toContain("[ERROR] node level diagnostic");
        expect(prompt).toContain("[WARNING] property level diagnostic");
        expect(launchOptions).toEqual({
            planMode: false,
            autoSubmit: true,
        });
    });

    it("renders diagnostic rows with icons instead of severity text prefixes", () => {
        const contextValue = createContextValue();

        const { container } = renderPopup(contextValue);
        const diagnosticsIcon = container.querySelector(".fw-error-outline-rounded");
        expect(diagnosticsIcon).toBeTruthy();

        fireEvent.click(diagnosticsIcon!.parentElement!);

        expect(screen.getByText("node level diagnostic")).toBeInTheDocument();
        expect(screen.getByText("property level diagnostic")).toBeInTheDocument();
        expect(screen.queryByText("[ERROR] node level diagnostic")).not.toBeInTheDocument();
        expect(screen.queryByText("[WARNING] property level diagnostic")).not.toBeInTheDocument();
    });

    it("keeps fix disabled when user is unauthenticated", () => {
        const onAddNodePrompt = jest.fn();
        const contextValue = createContextValue({
            onAddNodePrompt,
            isUserAuthenticated: false,
        });

        const { container } = renderPopup(contextValue);
        const diagnosticsIcon = container.querySelector(".fw-error-outline-rounded");
        expect(diagnosticsIcon).toBeTruthy();

        fireEvent.click(diagnosticsIcon!.parentElement!);

        const fixButtonLabel = screen.getByText("Fix with AI");
        const fixButton = fixButtonLabel.closest("vscode-button");
        expect(fixButton).toBeTruthy();
        fireEvent.click(fixButton!);
        expect(onAddNodePrompt).not.toHaveBeenCalled();
    });
});
