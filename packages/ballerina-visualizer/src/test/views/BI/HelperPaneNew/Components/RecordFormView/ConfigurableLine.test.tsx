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

// L2: the "Make configurable" line under a new connection's field: what it shows checked and unchecked, and the
// rename it offers. The modal owns the state, so here the line is driven by props and its callbacks recorded.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Codicon: ({ name }: any) => <i data-codicon={name} />,
    Icon: ({ name }: any) => <i data-icon={name} />,
    ProgressRing: () => <span data-testid="progress-ring" />,
    Confirm: ({ message, confirmText, onConfirm, anchorEl }: any) => (
        <div role="dialog" data-anchor={anchorEl?.getAttribute("data-testid")}>
            <span>{message}</span>
            <button type="button" onClick={() => onConfirm(false)}>Cancel</button>
            <button type="button" onClick={() => onConfirm(true)}>{confirmText}</button>
        </div>
    ),
    Tooltip: ({ content, children }: any) => <span data-testid="tooltip" data-content={content?.props?.children}>{children}</span>,
    Typography: ({ children }: any) => <span>{children}</span>,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

// Like vscode-checkbox, the mock reports the element's native change event, which also fires when only `checked` is set.
jest.mock("@vscode/webview-ui-toolkit/react", () => {
    const { useEffect, useRef } = jest.requireActual("react");
    return {
        __esModule: true,
        VSCodeCheckbox: ({ checked, onChange, ...rest }: any) => {
            const ref = useRef(null);
            useEffect(() => {
                const element = ref.current;
                element.addEventListener("change", onChange);
                return () => element.removeEventListener("change", onChange);
            }, [onChange]);
            return <input ref={ref} type="checkbox" checked={!!checked} readOnly data-testid={rest["data-testid"]} />;
        },
    };
});

import { ConfigurableLine, ConfigurableLineProps, CONFIGURABLE_HELP } from "../../../../../../views/BI/HelperPaneNew/Components/RecordFormView/ConfigurableLine";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("ConfigurableLine", () => {
    let container: HTMLDivElement;
    let root: Root;
    let handlers: Pick<ConfigurableLineProps, "onToggle" | "onStartRename" | "onDraftChange" | "onCommit" | "onCancel">;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        handlers = {
            onToggle: jest.fn(),
            onStartRename: jest.fn(),
            onDraftChange: jest.fn(),
            onCommit: jest.fn(),
            onCancel: jest.fn(),
        };
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (props: Partial<ConfigurableLineProps>) => {
        act(() => {
            root.render(<ConfigurableLine path="baseUrl" on={true} editing={false} {...handlers} {...props} />);
        });
    };

    const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

    it("says what it does, checked or not, and explains it on hover", () => {
        render({ on: false });
        expect(container.textContent).toContain("Make configurable");
        expect(byTestId("tooltip")?.getAttribute("data-content")).toBe(CONFIGURABLE_HELP);
        expect(container.querySelector("[data-icon='configurable-icon']")).not.toBeNull();
    });

    it("shows the configurable's name, with a rename button, only when checked", () => {
        render({ on: true, name: "mySalesforceBaseUrl" });
        expect(byTestId("record-form-configurable-name-baseUrl")?.textContent).toBe("mySalesforceBaseUrl");
        expect(byTestId("record-form-configurable-rename-baseUrl")).not.toBeNull();

        render({ on: false, name: "mySalesforceBaseUrl" });
        expect(byTestId("record-form-configurable-name-baseUrl")).toBeNull();
        expect(byTestId("record-form-configurable-rename-baseUrl")).toBeNull();
    });

    it("reports a toggle as checked or unchecked", () => {
        render({ on: true, name: "mySalesforceBaseUrl" });
        const checkbox = byTestId("record-form-configurable-toggle-baseUrl") as HTMLInputElement;
        act(() => {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(handlers.onToggle).toHaveBeenCalledWith(false);
    });

    it("offers the whole name when a long one is cut short", () => {
        render({ on: true, name: "businessClient1SecureSocketKeyPassword" });
        expect(byTestId("record-form-configurable-name-baseUrl")?.getAttribute("title"))
            .toBe("businessClient1SecureSocketKeyPassword");
    });

    it("ignores a change that only reports what it already shows", () => {
        // vscode-checkbox reports a change when React sets `checked` too; that is not the user toggling it.
        render({ on: true, name: "mySalesforceBaseUrl" });
        const checkbox = byTestId("record-form-configurable-toggle-baseUrl") as HTMLInputElement;
        act(() => { checkbox.dispatchEvent(new Event("change", { bubbles: true })); });
        expect(handlers.onToggle).not.toHaveBeenCalled();
    });

    it("starts a rename from the name", () => {
        render({ on: true, name: "mySalesforceBaseUrl" });
        act(() => { byTestId("record-form-configurable-rename-baseUrl")!.click(); });
        expect(handlers.onStartRename).toHaveBeenCalled();
    });

    it("keeps the typed name in the box while renaming, and commits on Enter or cancels on Escape", () => {
        render({ on: true, name: "mySalesforceBaseUrl", editing: true, draft: "salesforceUrl" });
        const input = byTestId("record-form-configurable-name-input-baseUrl") as HTMLInputElement;
        expect(input.value).toBe("salesforceUrl");
        act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
        expect(handlers.onCommit).toHaveBeenCalled();
        act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
        expect(handlers.onCancel).toHaveBeenCalled();
    });

    it("warns that renaming a configurable the connection already uses renames it across the project", () => {
        render({ on: true, name: "sfToken", existing: true, editing: true, draft: "salesforceToken" });
        expect(container.textContent).toContain("Renaming will update all references across the project");

        render({ on: true, name: "sfToken", existing: false, editing: true, draft: "salesforceToken" });
        expect(container.textContent).not.toContain("Renaming will update all references");
    });

    it("shows that the configurable is being renamed across the project, and holds the name meanwhile", () => {
        render({ on: true, name: "sfToken", existing: true, editing: true, draft: "salesforceToken", busy: true });
        expect(byTestId("record-form-configurable-renaming-baseUrl")?.querySelector("[data-testid=progress-ring]"))
            .not.toBeNull();
        expect(container.querySelector("button[aria-label='Done']")).toBeNull();
        expect((byTestId("record-form-configurable-name-input-baseUrl") as HTMLInputElement).disabled).toBe(true);
        expect(container.textContent).toContain("Renaming and updating all references across the project…");
        expect(container.textContent).not.toContain("Note: Renaming will update");

        const input = byTestId("record-form-configurable-name-input-baseUrl")!;
        act(() => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
        expect(handlers.onCommit).not.toHaveBeenCalled();
    });

    it("asks to rename across the project under the line, and reports the answer", () => {
        const onConfirm = jest.fn();
        render({
            on: true, name: "sfToken", existing: true, editing: true, draft: "salesforceToken",
            confirmation: { message: "Rename configurable? Renaming sfToken to salesforceToken will update all "
                + "references across the project.", onConfirm }
        });
        const dialog = container.querySelector("[role=dialog]")!;
        expect(dialog.getAttribute("data-anchor")).toBe("record-form-configurable-baseUrl");
        expect(dialog.textContent).toContain("Rename configurable?");
        act(() => (Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Rename")!).click());
        expect(onConfirm).toHaveBeenCalledWith(true);

        render({ on: true, name: "sfToken", existing: true, editing: true, draft: "salesforceToken" });
        expect(container.querySelector("[role=dialog]")).toBeNull();
    });

    it("says why a typed name won't do", () => {
        render({ on: true, editing: true, draft: "sales force" });
        expect(container.querySelector("[role=alert]")?.textContent)
            .toBe("Use letters, digits and _, and don't start with a digit.");
    });

    it("shows the language server's reason a name can't be used", () => {
        render({ on: true, name: "shared", error: "'shared' is already used in this module. Choose another name." });
        expect(container.querySelector("[role=alert]")?.textContent)
            .toBe("'shared' is already used in this module. Choose another name.");
    });

    it("drops the language server's reason once unchecked", () => {
        render({ on: false, name: "shared", error: "'shared' is already used in this module. Choose another name." });
        expect(container.querySelector("[role=alert]")).toBeNull();
    });
});
