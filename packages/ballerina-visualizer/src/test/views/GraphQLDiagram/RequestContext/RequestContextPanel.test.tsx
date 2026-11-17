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
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { GraphqlContextResponse, NodePosition } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});
jest.mock("@wso2/ballerina-core", () => ({ EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW" } }));
jest.mock("@wso2/ballerina-side-panel", () => ({
    PanelContainer: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}));
// Plain stand-ins for the toolkit: what the panel lays out is under test, not how the toolkit draws it.
jest.mock("@wso2/ui-toolkit", () => {
    const Plain = (props: { children?: React.ReactNode }) => <div>{props.children}</div>;
    type Action = { text: string; onClick: () => void; disabled?: boolean };
    return {
        ActionButtons: (props: { primaryButton: Action; secondaryButton: Action }) => (
            <div>
                {[props.primaryButton, props.secondaryButton].map((action) => (
                    <button key={action.text} disabled={action.disabled} onClick={action.onClick}>{action.text}</button>
                ))}
            </div>
        ),
        Button: (props: { children: React.ReactNode; onClick: () => void }) => (
            <button onClick={props.onClick}>{props.children}</button>
        ),
        CheckBox: (props: { label: string }) => <label>{props.label}</label>,
        Codicon: (props: { name: string; onClick?: () => void }) => (
            <span data-codicon={props.name} onClick={props.onClick} />
        ),
        Divider: () => <hr />,
        Dropdown: (props: { id: string; value: string; items: { value: string }[];
            onValueChange: (value: string) => void }) => (
            <select id={props.id} value={props.value} onChange={(e) => props.onValueChange(e.target.value)}>
                {props.items.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}
            </select>
        ),
        LinkButton: (props: { children: React.ReactNode; onClick: () => void }) => (
            <button onClick={props.onClick}>{props.children}</button>
        ),
        ProgressRing: () => <div />,
        SidePanelBody: Plain,
        Typography: Plain,
    };
});
jest.mock("../../../../views/BI/ServiceDesigner/styles", () => {
    const Plain = (props: { children?: React.ReactNode }) => <div>{props.children}</div>;
    return {
        ActionIconWrapper: Plain,
        ContentSection: Plain,
        DeleteIconWrapper: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
        EditIconWrapper: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
        EditorContainer: (props: { children: React.ReactNode; "data-testid"?: string }) => (
            <div data-testid={props["data-testid"] ?? "editor"}>{props.children}</div>
        ),
        EditorContent: Plain,
        HeaderLabel: Plain,
        headerLabelStyles: "header-label",
    };
});
jest.mock("../../../../views/GraphQLDiagram/RequestContext/ContextValueItem", () => ({
    ContextValueItem: (props: { onDelete: () => void }) => <button onClick={props.onDelete}>Delete value</button>,
}));
jest.mock("../../../../views/GraphQLDiagram/RequestContext/ContextValueEditor", () => ({
    ContextValueEditor: () => <div />,
}));

import { TestRpcContext } from "../../../rpcHarness";
import { RequestContextPanel } from "../../../../views/GraphQLDiagram/RequestContext/RequestContextPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const range = { startLine: { line: 3, offset: 0 }, endLine: { line: 6, offset: 1 } };
const context: GraphqlContextResponse = {
    supported: true,
    configured: true,
    functionName: "graphqlContextInit",
    functionFilePath: "/project/functions.bal",
    functionRange: range,
    signatureValid: true,
    candidates: ["graphqlContextInit", "otherContextInit"],
    entries: [],
    editable: true,
};

describe("RequestContextPanel", () => {
    let root: Root;
    let container: HTMLDivElement;
    let applyGraphqlContext: jest.Mock;
    let openView: jest.Mock;
    let rpcClient: object;

    const renderPanel = (props: { context?: GraphqlContextResponse; position?: NodePosition; loading?: boolean }) => {
        act(() => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <RequestContextPanel filePath="/project/main.bal" position={props.position ?? ({} as NodePosition)}
                        context={props.context ?? context} loading={props.loading ?? false} onClose={jest.fn()}
                        onOpenServiceConfig={jest.fn()} />
                </TestRpcContext.Provider>
            );
        });
    };

    beforeEach(() => {
        applyGraphqlContext = jest.fn().mockResolvedValue({ errorMsg: "refused" });
        openView = jest.fn().mockResolvedValue(undefined);
        rpcClient = {
            getServiceDesignerRpcClient: () => ({ applyGraphqlContext }),
            getVisualizerRpcClient: () => ({ openView }),
        };
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        renderPanel({});
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const click = async (element: Element) => {
        await act(async () => {
            (element as HTMLElement).click();
        });
    };
    const button = (scope: ParentNode, text: string) =>
        Array.from(scope.querySelectorAll("button")).find((b) => b.textContent === text);
    const alerts = (scope: ParentNode) => Array.from(scope.querySelectorAll("[role=alert]"));

    it.each([
        ["Use a different function", "edit", "editor", "Use"],
        ["Remove the request context", "trash", "remove-context", "Remove"],
    ])("a failed %s shows its error in that editor, and Cancel drops it", async (_, icon, editorId, action) => {
        await click(container.querySelector(`[data-codicon=${icon}]`));
        const editor = container.querySelector(`[data-testid=${editorId}]`);
        if (action === "Use") {
            await act(async () => {
                const select = editor.querySelector("select") as HTMLSelectElement;
                select.value = "otherContextInit";
                select.dispatchEvent(new Event("change", { bubbles: true }));
            });
        }
        await click(button(editor, action));

        expect(applyGraphqlContext).toHaveBeenCalledTimes(1);
        expect(alerts(editor).map((alert) => alert.textContent)).toEqual(["refused"]);
        expect(alerts(container)).toHaveLength(1);

        await click(button(editor, "Cancel"));
        expect(alerts(container)).toHaveLength(0);
    });

    it("the function name opens the function from the keyboard", async () => {
        const name = container.querySelector(".header-label") as HTMLElement;
        expect(name.getAttribute("role")).toBe("button");
        expect(name.tabIndex).toBe(0);
        await act(async () => {
            name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        });
        expect(openView).toHaveBeenCalledTimes(1);
        expect(openView.mock.calls[0][0].location.documentUri).toBe("/project/functions.bal");
    });

    it("nothing is applied while the previous service's context is still shown", async () => {
        renderPanel({ loading: true });
        await click(container.querySelector("[data-codicon=trash]"));
        expect(button(container.querySelector("[data-testid=remove-context]"), "Remove").disabled).toBe(true);
        expect(button(container, "Save").disabled).toBe(true);
    });

    it("another service starts from its own values, even when they match the ones left unsaved", async () => {
        const withValue: GraphqlContextResponse = {
            ...context,
            entries: [{ key: "scope", source: "header", value: "scope", required: true }],
        };
        renderPanel({ context: withValue });
        await click(button(container, "Delete value"));
        expect(button(container, "Save").disabled).toBe(false);

        renderPanel({ context: withValue, position: { startLine: 20, startColumn: 0 } as NodePosition });
        expect(button(container, "Save").disabled).toBe(true);
        expect(button(container, "Delete value")).toBeDefined();
    });

    it("Remove keeps the function unless asked to delete it", async () => {
        await click(container.querySelector("[data-codicon=trash]"));
        await click(button(container.querySelector("[data-testid=remove-context]"), "Remove"));
        expect(applyGraphqlContext).toHaveBeenCalledWith(expect.objectContaining({
            action: "remove",
            deleteFunction: false,
        }));
    });

    it.each([
        ["Open in flow diagram", "Enter"],
        ["Open in flow diagram", " "],
        ["Use a different function", "Enter"],
        ["Use a different function", " "],
        ["Remove the request context", "Enter"],
        ["Remove the request context", " "],
    ])("the %s action is a named button that %p presses", async (label, key) => {
        const action = container.querySelector(`[aria-label="${label}"]`) as HTMLElement;
        expect(action.getAttribute("role")).toBe("button");
        expect(action.tabIndex).toBe(0);
        await act(async () => {
            action.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        });
        if (label === "Open in flow diagram") {
            expect(openView).toHaveBeenCalledTimes(1);
        } else {
            const opened = label === "Remove the request context" ? "remove-context" : "editor";
            expect(container.querySelector(`[data-testid=${opened}]`)).not.toBeNull();
        }
    });
});
