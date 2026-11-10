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

// L2: the variables a TCP service keeps per client, under Advanced Configurations. The section always starts
// collapsed behind the editor's Expand/Collapse control, with nothing of it shown. Each variable shows its name, type
// and initial value, opens for editing on click, and is deleted only once confirmed.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { FieldType } from "@wso2/ballerina-core";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, id }: any) => <button id={id} onClick={onClick}>{children}</button>,
    LinkButton: ({ children, onClick, id }: any) => <button id={id} onClick={onClick}>{children}</button>,
    Codicon: (): null => null,
    Typography: ({ children }: any) => <span>{children}</span>,
    ThemeColors: { PRIMARY: "primary", OUTLINE_VARIANT: "outline" },
    Confirm: ({ isOpen, onConfirm }: any) => isOpen ? (
        <div>
            <button id="confirm" onClick={() => onConfirm(true)}>Delete</button>
            <button id="cancel" onClick={() => onConfirm(false)}>Cancel</button>
        </div>
    ) : null,
}));

import { ConnectionStateSection } from "../../../../../views/BI/ServiceDesigner/components/ConnectionStateSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = (name: string, type: string, initialValue: string) =>
    ({ name: { value: name }, type: { value: type }, defaultValue: { value: initialValue } } as unknown as FieldType);

describe("ConnectionStateSection", () => {
    let container: HTMLDivElement;
    let root: Root;
    const handlers = () => ({ onAdd: jest.fn(), onEdit: jest.fn(), onDelete: jest.fn() });

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (fields: FieldType[], callbacks = handlers()) => {
        act(() => root.render(<ConnectionStateSection fields={fields} description="Kept per client" {...callbacks} />));
        return callbacks;
    };
    const byId = (id: string) => container.querySelector(`#${id}`);
    const click = (element: Element) => act(() => (element as HTMLElement).click());
    const expand = () => click(byId("connection-state-toggle"));

    it.each([
        ["no variables", [] as FieldType[]],
        ["variables", [field("buffer", "byte[]", "[]"), field("authenticated", "boolean", "false")]],
    ])("starts collapsed with %s, showing only its title", (_case, fields) => {
        render(fields);

        expect(byId("connection-state-toggle").textContent).toBe("Expand");
        expect(container.textContent).toBe("Advanced ConfigurationsExpand");
    });

    it("expands to add a variable, and collapses again", () => {
        const callbacks = render([]);

        expand();
        expect(container.textContent).toContain("Variables");
        expect(container.textContent).toContain("No variables yet.");
        click([...container.querySelectorAll("button")].find((button) => button.textContent === "Variable"));
        expect(callbacks.onAdd).toHaveBeenCalled();

        expand();
        expect(byId("connection-state-toggle").textContent).toBe("Expand");
        expect(container.textContent).not.toContain("No variables yet.");
    });

    it.each([
        ["buffer", "byte[]", "[]", "bufferbyte[] = []"],
        ["count", "int", "", "countint"],
    ])("shows %s with its type and initial value", (name, type, initialValue, text) => {
        render([field(name, type, initialValue)]);
        expand();

        expect(container.querySelector(`[data-testid="connection-state-${name}"]`).textContent).toBe(text);
    });

    it("opens a variable for editing from its row or its edit button", () => {
        const buffer = field("buffer", "byte[]", "[]");
        const callbacks = render([buffer]);
        expand();

        click(container.querySelector('[data-testid="connection-state-buffer"]'));
        click(byId("edit-connection-state-buffer"));

        expect(callbacks.onEdit).toHaveBeenCalledTimes(2);
        expect(callbacks.onEdit).toHaveBeenCalledWith(buffer);
    });

    it("deletes a variable only once confirmed, without opening it", () => {
        const buffer = field("buffer", "byte[]", "[]");
        const callbacks = render([buffer]);
        expand();

        click(byId("delete-connection-state-buffer"));
        click(byId("cancel"));
        expect(callbacks.onDelete).not.toHaveBeenCalled();

        click(byId("delete-connection-state-buffer"));
        click(byId("confirm"));
        expect(callbacks.onDelete).toHaveBeenCalledWith(buffer);
        expect(callbacks.onEdit).not.toHaveBeenCalled();
    });
});
