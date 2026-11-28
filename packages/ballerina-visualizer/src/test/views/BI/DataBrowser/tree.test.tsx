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
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";

jest.mock("@wso2/ballerina-side-panel", () => ({
    DEFAULT_CHIP_COLOR: { background: "", border: "" },
    HighlightedText: ({ text }: { text: string }) => <>{text}</>,
    setDraggedInsert: (): void => undefined,
}));
jest.mock("@wso2/ui-toolkit", () => ({ Icon: () => <span />, Codicon: () => <span />, Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>, ThemeColors: {} }));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("../../../../utils/bi", () => ({}));
jest.mock("../../../../views/BI/HelperPaneNew/utils/iconUtils", () => ({ HelperPaneIconType: {}, getHelperPaneIcon: (): null => null }));

import { DataNode, treeKeyDown } from "../../../../views/BI/DataBrowser/tree";
import { descendantsWhere } from "../../../../views/BI/DataBrowser/useDataTree";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const payload = { path: "payload", name: "payload", type: "OrderInfo", opens: true };
const city = { path: "payload.city", name: "city", type: "string", opens: false };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

function renderTree(onInsert: jest.Mock, fetchFields = jest.fn().mockResolvedValue([city])) {
    act(() => root.render(
        <div role="tree" onKeyDown={treeKeyDown(() => undefined)}>
            <DataNode item={payload} depth={0} onInsert={onInsert} fetchFields={fetchFields} />
        </div>
    ));
    return { row: container.querySelector<HTMLElement>("[role='treeitem']")!, fetchFields };
}

const click = (element: Element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
// The button shows on hover, and the keyboard skips rows without a layout box; jsdom has neither.
const insertButton = () => container.querySelector<HTMLElement>("[aria-label='Insert payload']");
beforeAll(() => {
    jest.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});

describe("record rows in the Data Browser", () => {
    it("open on click", async () => {
        const onInsert = jest.fn();
        const { row, fetchFields } = renderTree(onInsert);
        await act(async () => click(row));
        expect(fetchFields).toHaveBeenCalled();
        expect(row.getAttribute("aria-expanded")).toBe("true");
        expect(onInsert).not.toHaveBeenCalled();
    });

    it("insert from the Insert button without opening", () => {
        const onInsert = jest.fn();
        const { row } = renderTree(onInsert);
        act(() => click(insertButton()!));
        expect(onInsert).toHaveBeenCalledWith("payload");
        expect(row.getAttribute("aria-expanded")).toBe("false");
    });

    it("insert on Enter", () => {
        const onInsert = jest.fn();
        const { row } = renderTree(onInsert);
        act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        expect(onInsert).toHaveBeenCalledWith("payload");
    });

    it("insert on click when the type turns out to hold nothing to open", async () => {
        const onInsert = jest.fn();
        const { row } = renderTree(onInsert, jest.fn().mockResolvedValue([]));
        await act(async () => click(row));
        expect(onInsert).toHaveBeenCalledWith("payload");
        expect(insertButton()).toBeNull();
    });

    it("stay openable and insert nothing when the field lookup fails", async () => {
        const onInsert = jest.fn();
        const fetchFields = jest.fn().mockRejectedValueOnce(new Error("busy")).mockResolvedValue([city]);
        const { row } = renderTree(onInsert, fetchFields);
        await act(async () => click(row));
        expect(onInsert).not.toHaveBeenCalled();
        expect(row.getAttribute("aria-expanded")).toBe("false");
        await act(async () => click(row));
        expect(row.getAttribute("aria-expanded")).toBe("true");
        expect(container.querySelector("[title^='payload.city']")).not.toBeNull();
    });
});

describe("the item row of a record array", () => {
    it("shows the fields of the item the stepper is on when responses arrive out of order", async () => {
        const pending: Record<string, (fields: unknown[]) => void> = {};
        const fetchFields = jest.fn((parent: { path: string }) => new Promise((resolve) => (pending[parent.path] = resolve)));
        const item = { path: "list[0]", name: "list", type: "Order", opens: true, elementOf: "list" };
        act(() => root.render(<DataNode item={item} depth={0} fetchFields={fetchFields} defaultExpanded />));
        const next = container.querySelector<HTMLElement>("[aria-label='Next Item']")!;
        act(() => click(next));
        act(() => click(next));
        await act(async () => pending["list[2]"]([{ path: "list[2].id", name: "id", type: "int", opens: false }]));
        await act(async () => pending["list[1]"]([{ path: "list[1].id", name: "id", type: "int", opens: false }]));
        expect(container.querySelector("[title^='list[2].id']")).not.toBeNull();
        expect(container.querySelector("[title^='list[1].id']")).toBeNull();
    });
});

describe("descendantsWhere", () => {
    it("lists a member shared by two values of one enum type once", async () => {
        const status = (path: string) => ({ path, name: path, type: "Status", opens: true });
        const children = async () => [{ path: "PAID", name: "PAID", type: "Status", enumMember: true }];
        const found = await descendantsWhere([status("a"), status("b")], () => true, children);
        expect(found.map((item) => item.path)).toEqual(["PAID"]);
    });

    it("skips a value whose lookup fails", async () => {
        const roots = [{ path: "a", name: "a", type: "A", opens: true }, { path: "b", name: "b", type: "B", opens: true }];
        const children = async (parent: { path: string }) => {
            if (parent.path === "a") {
                throw new Error("busy");
            }
            return [{ path: "b.x", name: "x", type: "int", opens: false }];
        };
        expect((await descendantsWhere(roots, () => true, children)).map((item) => item.path)).toEqual(["b.x"]);
    });
});
