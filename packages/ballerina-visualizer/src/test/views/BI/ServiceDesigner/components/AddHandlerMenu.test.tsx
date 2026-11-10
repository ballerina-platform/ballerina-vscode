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

// L2: the "+ Handler" menu of a TCP service. The button opens a list of the handlers that can still be added, each
// with what it is for; picking one adds it and closes the list.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, id, disabled }: any) => (
        <button id={id} disabled={disabled} onClick={onClick}>{children}</button>
    ),
    Codicon: (): null => null,
    Popover: ({ open, children }: any) => open ? <div data-testid="menu">{children}</div> : null,
    Menu: ({ children }: any) => <div>{children}</div>,
    MenuItem: ({ item }: any) => (
        <button data-testid={`option-${item.id}`} onClick={item.onClick}>{item.label}</button>
    ),
}));

import { AddHandlerMenu } from "../../../../../views/BI/ServiceDesigner/components/AddHandlerMenu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AddHandlerMenu", () => {
    let container: HTMLDivElement;
    let root: Root;
    const options = [
        { name: "onError", description: "Runs when an error occurs on the connection" },
        { name: "onClose", description: "Runs when the client disconnects" },
    ];

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = (onSelect = jest.fn(), disabled = false) => {
        act(() => root.render(<AddHandlerMenu options={options} disabled={disabled} onSelect={onSelect} />));
        return onSelect;
    };
    const click = (selector: string) => act(() => (container.querySelector(selector) as HTMLElement).click());
    const menu = () => container.querySelector('[data-testid="menu"]');

    it("is a single button until opened", () => {
        render();

        expect(container.querySelector("#add-connection-handler").textContent).toBe("Handler");
        expect(menu()).toBeNull();
    });

    it("lists each handler that can be added, with what it is for", () => {
        render();
        click("#add-connection-handler");

        expect(menu().textContent).toBe(options.map((option) => option.name + option.description).join(""));
    });

    it("adds the picked handler and closes the list", () => {
        const onSelect = render();
        click("#add-connection-handler");
        click('[data-testid="option-onClose"]');

        expect(onSelect).toHaveBeenCalledWith("onClose");
        expect(menu()).toBeNull();
    });

    it("cannot be used while a change is being saved", () => {
        render(jest.fn(), true);

        expect((container.querySelector("#add-connection-handler") as HTMLButtonElement).disabled).toBe(true);
    });
});
