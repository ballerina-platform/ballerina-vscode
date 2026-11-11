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
    const h = require("../../../test/rpcHarness");
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
jest.mock("../../BI/ServiceDesigner/styles", () => {
    const Plain = (props: { children?: React.ReactNode }) => <div>{props.children}</div>;
    return {
        ActionIconWrapper: Plain,
        ContentSection: Plain,
        DeleteIconWrapper: (props: { children: React.ReactNode; title: string }) => (
            <div title={props.title}>{props.children}</div>
        ),
        EditIconWrapper: (props: { children: React.ReactNode; title: string }) => (
            <div title={props.title}>{props.children}</div>
        ),
        EditorContainer: (props: { children: React.ReactNode; "data-testid"?: string }) => (
            <div data-testid={props["data-testid"] ?? "editor"}>{props.children}</div>
        ),
        EditorContent: Plain,
        HeaderLabel: Plain,
        headerLabelStyles: "header-label",
    };
});
jest.mock("./ContextValueItem", () => ({ ContextValueItem: () => <div /> }));
jest.mock("./ContextValueEditor", () => ({ ContextValueEditor: () => <div /> }));

import { TestRpcContext } from "../../../test/rpcHarness";
import { RequestContextPanel } from "./RequestContextPanel";

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

    beforeEach(() => {
        applyGraphqlContext = jest.fn().mockResolvedValue({ errorMsg: "refused" });
        openView = jest.fn().mockResolvedValue(undefined);
        const rpcClient = {
            getServiceDesignerRpcClient: () => ({ applyGraphqlContext }),
            getVisualizerRpcClient: () => ({ openView }),
        };
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        act(() => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <RequestContextPanel filePath="/project/main.bal" position={{} as NodePosition}
                        context={context} loading={false} onClose={jest.fn()} onOpenServiceConfig={jest.fn()} />
                </TestRpcContext.Provider>
            );
        });
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
});
