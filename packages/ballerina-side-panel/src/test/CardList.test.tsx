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

// L2 (P0): CardList render behaviour (side-panel P0 component). Renders a searchable
// list of node cards grouped by category. INVARIANT: every leaf item in the model is
// listed by its label; the group title renders.

import React from "react";
import { render } from "@testing-library/react";
import CardList from "../components/CardList";

const categories: any[] = [
    {
        title: "Endpoints",
        items: [
            { id: "get", label: "Get Resource" },
            { id: "post", label: "Post Resource" },
        ],
    },
];

describe("CardList", () => {
    it("INVARIANT: lists every leaf item by its label", () => {
        const { container } = render(
            <CardList categories={categories} title="Nodes" onSelect={jest.fn()} onSearch={undefined as any} />
        );
        const text = container.textContent ?? "";
        expect(text).toContain("Get Resource");
        expect(text).toContain("Post Resource");
    });

    it("renders the group title", () => {
        const { container } = render(
            <CardList categories={categories} title="Nodes" onSelect={jest.fn()} onSearch={undefined as any} />
        );
        expect(container.textContent).toContain("Endpoints");
    });

    it("renders without throwing for empty categories", () => {
        const { container } = render(
            <CardList categories={[]} title="Nodes" onSelect={jest.fn()} onSearch={undefined as any} />
        );
        expect(container).toBeTruthy();
    });
});
