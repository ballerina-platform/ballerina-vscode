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

// L2 (P0): GroupList render behaviour (side-panel P0 component). Renders a category's
// title and its enabled node widgets. Asserts the title renders and it handles both a
// populated category and an empty one without throwing.

import React from "react";
import { render } from "@testing-library/react";
import { GroupList } from "../components/GroupList";

const node = (id: string, label: string, enabled = true): any => ({
    id,
    enabled,
    metadata: { label, description: "" },
    codedata: { node: "FUNCTION" },
});

const category = (title: string, items: any[]): any => ({ title, items });

describe("GroupList", () => {
    it("renders the category title", () => {
        const { container } = render(
            <GroupList category={category("Utilities", [node("a", "Alpha"), node("b", "Beta")])} onSelect={jest.fn()} />
        );
        expect(container.textContent).toContain("Utilities");
    });

    it("renders a category with enabled nodes without throwing", () => {
        const { container } = render(
            <GroupList category={category("Utilities", [node("a", "Alpha"), node("b", "Beta")])} onSelect={jest.fn()} />
        );
        expect(container.textContent).toContain("Utilities");
    });

    it("renders an empty category (no nodes) without throwing", () => {
        // the empty branch renders a placeholder (no title); just assert it doesn't crash
        const { container } = render(
            <GroupList category={category("Empty", [])} onSelect={jest.fn()} />
        );
        expect(container).toBeTruthy();
    });
});
