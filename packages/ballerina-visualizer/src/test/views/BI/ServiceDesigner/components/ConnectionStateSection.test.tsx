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
// collapsed behind the editor's Expand/Collapse control, with nothing of it shown. Each variable is shown with the
// class designer's VariableCard (tested on its own), wired to open and delete that variable.

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
}));
// The card is the class designer's, tested on its own; here only what it is given matters.
jest.mock("../../../../../views/BI/ServiceClassEditor/VariableCard", () => ({
    __esModule: true,
    VariableCard: ({ fieldModel, onEditVariable, onDeleteVariable, onVariableImplement }: any) => (
        <div data-testid={`card-${fieldModel.name.value}`}>
            <button id={`open-${fieldModel.name.value}`} onClick={() => onVariableImplement(fieldModel)} />
            <button id={`edit-${fieldModel.name.value}`} onClick={() => onEditVariable(fieldModel)} />
            <button id={`delete-${fieldModel.name.value}`} onClick={() => onDeleteVariable(fieldModel)} />
        </div>
    ),
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

    it("shows each variable with a card, in order", () => {
        render([field("buffer", "byte[]", "[]"), field("authenticated", "boolean", "false")]);
        expand();

        expect([...container.querySelectorAll('[data-testid^="card-"]')].map((card) => card.getAttribute("data-testid")))
            .toEqual(["card-buffer", "card-authenticated"]);
    });

    it("opens a variable for editing from its card's row or edit button", () => {
        const buffer = field("buffer", "byte[]", "[]");
        const callbacks = render([buffer]);
        expand();

        click(byId("open-buffer"));
        click(byId("edit-buffer"));

        expect(callbacks.onEdit).toHaveBeenCalledTimes(2);
        expect(callbacks.onEdit).toHaveBeenCalledWith(buffer);
    });

    it("deletes the variable its card asks to delete", () => {
        const buffer = field("buffer", "byte[]", "[]");
        const callbacks = render([buffer]);
        expand();

        click(byId("delete-buffer"));

        expect(callbacks.onDelete).toHaveBeenCalledWith(buffer);
        expect(callbacks.onEdit).not.toHaveBeenCalled();
    });
});
