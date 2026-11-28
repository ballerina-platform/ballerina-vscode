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
import type { TypeHelperItem } from "@wso2/type-editor";
import { TypePicker } from "./TypePicker";
import { TypeOption } from "./typeSearch";

// The toolkit ships ES modules jest does not transform here; the picker only needs plain icons and colors.
jest.mock("@wso2/ui-toolkit", () => ({
    Codicon: (): null => null,
    Icon: (): null => null,
    ThemeColors: { ON_SURFACE: "fg", ON_SURFACE_VARIANT: "muted" },
}));

const option = (name: string, source: TypeOption["source"] = "builtin"): TypeOption =>
    ({ item: { name, insertText: name } as TypeHelperItem, source });

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

const MATCHES = [option("string"), option("StringSchema", "imported")];

function setup(query: string, createName?: string) {
    const input = document.createElement("textarea");
    container = document.createElement("div");
    document.body.append(input, container);
    const onPick = jest.fn();
    const onCreate = jest.fn();
    const onClose = jest.fn();
    root = createRoot(container);
    const show = (options: TypeOption[]) => act(() => {
        root.render(
            <TypePicker
                query={query}
                sections={[{ title: "Matches", options }]}
                loading={false}
                createName={createName}
                input={input}
                onPick={onPick}
                onCreate={onCreate}
                onClose={onClose}
            />
        );
    });
    show(MATCHES);
    const key = (k: string) => act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    });
    return { key, show, onPick, onCreate, onClose };
}

describe("TypePicker", () => {
    it("takes the best match with Enter while typing", () => {
        const { key, onPick } = setup("str");
        key("Enter");
        expect(onPick.mock.calls[0][0].item.name).toBe("string");
    });

    it("moves through matches with the arrow keys", () => {
        const { key, onPick } = setup("str");
        key("ArrowDown");
        key("Tab");
        expect(onPick.mock.calls[0][0].item.name).toBe("StringSchema");
    });

    it("never creates a type unless that row is chosen", () => {
        const { key, onPick, onCreate } = setup("Invoice", "Invoice");
        expect(container.querySelector("[data-testid=add-type-completion]")?.textContent).toContain("Create Type Invoice");
        key("Enter");
        expect(onPick).toHaveBeenCalled();
        expect(onCreate).not.toHaveBeenCalled();
    });

    it("leaves Enter to the form when nothing is typed, and closes on Escape", () => {
        const { key, onPick, onClose } = setup("");
        key("Enter");
        expect(onPick).not.toHaveBeenCalled();
        key("Escape");
        expect(onClose).toHaveBeenCalled();
    });

    it("goes to the last row with ArrowUp when no row is chosen", () => {
        const { key, onPick } = setup("");
        key("ArrowUp");
        key("Enter");
        expect(onPick.mock.calls[0][0].item.name).toBe("StringSchema");
    });

    it("goes to the create row with ArrowUp when it is offered", () => {
        const { key, onPick, onCreate } = setup("", "Invoice");
        key("ArrowUp");
        key("Enter");
        expect(onCreate).toHaveBeenCalledWith("Invoice");
        expect(onPick).not.toHaveBeenCalled();
    });

    it("keeps the row chosen with the arrow keys when more results arrive", () => {
        const { key, show, onPick } = setup("str");
        key("ArrowDown");
        show([option("string"), option("strand", "library"), option("StringSchema", "imported")]);
        key("Enter");
        expect(onPick.mock.calls[0][0].item.name).toBe("StringSchema");
    });

    it("keeps the create row chosen when more results arrive", () => {
        const { key, show, onPick, onCreate } = setup("str", "str2");
        key("ArrowUp");
        show([...MATCHES, option("strand", "library")]);
        key("Enter");
        expect(onCreate).toHaveBeenCalledWith("str2");
        expect(onPick).not.toHaveBeenCalled();
    });

    it("takes the new best match when the chosen row goes away", () => {
        const { key, show, onPick } = setup("str");
        key("ArrowDown");
        show([option("string")]);
        key("Enter");
        expect(onPick.mock.calls[0][0].item.name).toBe("string");
    });

    it("highlights the matched part of each name", () => {
        setup("schema");
        const highlighted = [...container.querySelectorAll("span span")].map((span) => span.textContent);
        expect(highlighted).toContain("Schema");
    });
});
