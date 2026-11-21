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

// L2: the card a variable is shown with, by the class designer, the agent definition designer and a TCP service's
// variables. It shows the variable's type in a badge followed by its name, opens the variable from the row or the
// edit button, deletes it only once confirmed, and keeps the test ids and icons E2E relies on.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { FieldType } from "@wso2/ballerina-core";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Codicon: ({ name }: any) => <i data-icon={name} />,
    Icon: ({ name }: any) => <i data-icon={name} />,
    Confirm: ({ isOpen, onConfirm, confirmText }: any) => isOpen ? (
        <div>
            <button id="confirm" onClick={() => onConfirm(true)}>{confirmText}</button>
            <button id="cancel" onClick={() => onConfirm(false)}>Cancel</button>
        </div>
    ) : null,
}));
jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeButton: ({ children, onClick, title, ...rest }: any) => (
        <button data-testid={rest["data-testid"]} title={title} onClick={onClick}>{children}</button>
    ),
}));

import { VariableCard } from "../../../../views/BI/ServiceClassEditor/VariableCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const field = (name: string, type: string, initialValue?: string) =>
    ({
        name: { value: name },
        type: { value: type },
        ...(initialValue !== undefined && { defaultValue: { value: initialValue } }),
    } as unknown as FieldType);

describe("VariableCard", () => {
    let container: HTMLDivElement;
    let root: Root;
    const callbacks = () => ({ onEditVariable: jest.fn(), onDeleteVariable: jest.fn(), onVariableImplement: jest.fn() });

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (model: FieldType, handlers = callbacks()) => {
        act(() => root.render(<VariableCard fieldModel={model} {...handlers} />));
        return handlers;
    };
    const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const click = (element: Element) => act(() => (element as HTMLElement).click());

    it.each([
        ["with an initial value", field("buffer", "byte[]", "[]")],
        ["without one, as a parameter", field("query", "string")],
    ])("shows the type of a variable %s, then its name", (_case, model) => {
        render(model);

        expect(container.textContent).toBe(`${model.type.value}${model.name.value}`);
    });

    it("opens the variable from its row", () => {
        const model = field("buffer", "byte[]", "[]");
        const handlers = render(model);

        click(container.querySelector("span"));

        expect(handlers.onVariableImplement).toHaveBeenCalledWith(model);
        expect(handlers.onEditVariable).not.toHaveBeenCalled();
    });

    it("edits the variable from its edit button, without opening it as well", () => {
        const model = field("buffer", "byte[]", "[]");
        const handlers = render(model);

        click(byTestId("edit-variable-button-buffer"));

        expect(handlers.onEditVariable).toHaveBeenCalledWith(model);
        expect(handlers.onVariableImplement).not.toHaveBeenCalled();
    });

    it("deletes the variable only once the deletion is confirmed", () => {
        const model = field("buffer", "byte[]", "[]");
        const handlers = render(model);
        const deleteButton = byTestId("delete-variable-button-buffer");

        click(deleteButton);
        click(container.querySelector("#cancel"));
        expect(handlers.onDeleteVariable).not.toHaveBeenCalled();

        click(deleteButton);
        expect(container.querySelector("#confirm").textContent).toBe("Okay");
        click(container.querySelector("#confirm"));
        expect(handlers.onDeleteVariable).toHaveBeenCalledWith(model);
        expect(handlers.onVariableImplement).not.toHaveBeenCalled();
    });

    it("keeps the delete button an icon, which E2E clicks through", () => {
        render(field("buffer", "byte[]", "[]"));

        expect(byTestId("delete-variable-button-buffer").querySelector("i")).not.toBeNull();
    });
});
