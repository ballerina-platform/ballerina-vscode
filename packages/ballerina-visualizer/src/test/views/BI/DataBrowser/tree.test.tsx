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
import { act, fireEvent, render, screen } from "@testing-library/react";

jest.mock("@wso2/ballerina-side-panel", () => ({
    DEFAULT_CHIP_COLOR: { background: "", border: "" },
    HighlightedText: ({ text }: { text: string }) => <>{text}</>,
    setDraggedInsert: () => undefined,
}));
jest.mock("@wso2/ui-toolkit", () => ({ Icon: () => <span />, Codicon: () => <span />, ThemeColors: {} }));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("../../../../utils/bi", () => ({}));
jest.mock("../../../../views/BI/HelperPaneNew/utils/iconUtils", () => ({ HelperPaneIconType: {}, getHelperPaneIcon: (): null => null }));

import { DataNode, treeKeyDown } from "../../../../views/BI/DataBrowser/tree";

const payload = { path: "payload", name: "payload", type: "OrderInfo", opens: true };
const city = { path: "payload.city", name: "city", type: "string", opens: false };

function renderTree(onInsert: jest.Mock, fetchFields = jest.fn().mockResolvedValue([city])) {
    render(
        <div role="tree" onKeyDown={treeKeyDown(() => undefined)}>
            <DataNode item={payload} depth={0} onInsert={onInsert} fetchFields={fetchFields} />
        </div>
    );
    return { row: screen.getByRole("treeitem"), fetchFields };
}

// The button shows on hover, and the keyboard skips rows without a layout box; jsdom has neither.
const insertButton = () => screen.getByTitle("Insert");
beforeAll(() => {
    jest.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});

describe("record rows in the Data Browser", () => {
    it("open on click", async () => {
        const onInsert = jest.fn();
        const { row, fetchFields } = renderTree(onInsert);
        await act(async () => fireEvent.click(row));
        expect(fetchFields).toHaveBeenCalled();
        expect(row.getAttribute("aria-expanded")).toBe("true");
        expect(onInsert).not.toHaveBeenCalled();
    });

    it("insert from the Insert button without opening", () => {
        const onInsert = jest.fn();
        const { row } = renderTree(onInsert);
        fireEvent.click(insertButton());
        expect(onInsert).toHaveBeenCalledWith("payload");
        expect(row.getAttribute("aria-expanded")).toBe("false");
    });

    it("insert on Enter", () => {
        const onInsert = jest.fn();
        const { row } = renderTree(onInsert);
        fireEvent.keyDown(row, { key: "Enter" });
        expect(onInsert).toHaveBeenCalledWith("payload");
    });

    it("insert on click when the type turns out to hold nothing to open", async () => {
        const onInsert = jest.fn();
        const { row } = renderTree(onInsert, jest.fn().mockResolvedValue([]));
        await act(async () => fireEvent.click(row));
        expect(onInsert).toHaveBeenCalledWith("payload");
        expect(screen.queryByTitle("Insert")).toBeNull();
    });
});
