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
import { fireEvent, render, screen } from "@testing-library/react";
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

    describe("nested groups", () => {
        const leaf = (id: string) => ({ id, label: id, description: id + " description" });
        const nested: any[] = [{
            title: "Model Providers",
            items: [{
                title: "AWS Model Providers",
                description: "aws",
                items: [
                    leaf("AWS Default"),
                    {
                        title: "Bedrock",
                        description: "bedrock",
                        items: [{ title: "Anthropic", description: "anthropic", items: [leaf("Sonnet"), leaf("Haiku")] }, leaf("Titan")],
                    },
                ],
            }],
        }];
        const renderNested = () => render(<CardList categories={nested} title="Nodes" onSelect={jest.fn()} />);

        it("shows subgroups as rows with a leaf count instead of expanding them inline", () => {
            renderNested();
            fireEvent.click(screen.getByText("AWS Model Providers"));
            expect(screen.getByText("Bedrock")).toBeTruthy();
            expect(screen.getByText("3 options")).toBeTruthy();
            expect(screen.queryByText("Sonnet")).toBeNull();
        });

        it("drills into a subgroup, naming the current level and the parent to go back to", () => {
            renderNested();
            fireEvent.click(screen.getByText("AWS Model Providers"));
            fireEvent.click(screen.getByText("Bedrock"));
            fireEvent.click(screen.getByText("Anthropic"));
            expect(document.activeElement?.textContent).toContain("Sonnet");
            expect(screen.getByRole("heading", { name: "Anthropic" })).toBeTruthy();
            expect(screen.getByRole("button", { name: "Back to Bedrock" }).getAttribute("title")).toBe("AWS › Bedrock › Anthropic");
            expect(screen.getByText("Sonnet")).toBeTruthy();
            expect(screen.queryByText("Titan")).toBeNull();
        });

        it("steps back one level at a time, returning to the accordion from the top", () => {
            renderNested();
            fireEvent.click(screen.getByText("AWS Model Providers"));
            fireEvent.click(screen.getByText("Bedrock"));
            fireEvent.click(screen.getByText("Anthropic"));
            fireEvent.click(screen.getByRole("button", { name: "Back to Bedrock" }));
            expect(screen.getByText("Titan")).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Back to AWS" }));
            expect(screen.queryByRole("heading", { name: "Bedrock" })).toBeNull();
            expect(screen.getByText("AWS Default")).toBeTruthy();
        });

        it("restores a drilled-in group from a controlled expanded id", () => {
            render(
                <CardList
                    categories={nested}
                    title="Nodes"
                    onSelect={jest.fn()}
                    expandedGroupId={"AWS Model Providers:aws\u001fBedrock:bedrock"}
                    onExpandedGroupChange={jest.fn()}
                />
            );
            expect(screen.getByText("Titan")).toBeTruthy();
            expect(screen.getByRole("heading", { name: "Bedrock" })).toBeTruthy();
        });

        it("falls back to the accordion when the expanded id no longer matches a group", () => {
            render(
                <CardList
                    categories={nested}
                    title="Nodes"
                    onSelect={jest.fn()}
                    expandedGroupId={"AWS Model Providers:aws\u001fGone:gone"}
                    onExpandedGroupChange={jest.fn()}
                />
            );
            expect(screen.queryByRole("button", { name: /^Back to/ })).toBeNull();
            expect(screen.getByText("AWS Model Providers")).toBeTruthy();
        });

        it("steps back one level with Backspace or Alt+Left from inside the list", () => {
            renderNested();
            fireEvent.click(screen.getByText("AWS Model Providers"));
            fireEvent.click(screen.getByText("Bedrock"));
            fireEvent.click(screen.getByText("Anthropic"));
            fireEvent.keyDown(document.activeElement as Element, { key: "Backspace" });
            expect(screen.getByRole("heading", { name: "Bedrock" })).toBeTruthy();
            fireEvent.keyDown(document.activeElement as Element, { key: "ArrowLeft", altKey: true });
            expect(screen.getByText("AWS Default")).toBeTruthy();
        });

        it("keeps the drill position when a group header is clicked during a search", () => {
            renderNested();
            fireEvent.click(screen.getByText("AWS Model Providers"));
            fireEvent.click(screen.getByText("Bedrock"));
            const search = screen.getByPlaceholderText("Search");
            fireEvent.input(search, { target: { value: "titan" } });
            fireEvent.click(screen.getByText("AWS Model Providers"));
            fireEvent.input(search, { target: { value: "" } });
            expect(screen.getByRole("heading", { name: "Bedrock" })).toBeTruthy();
        });

        it("merges a single-subgroup chain into one row and one level", () => {
            const chained: any[] = [{
                title: "Model Providers",
                items: [{
                    title: "AWS Model Providers",
                    description: "aws",
                    items: [
                        leaf("AWS Default"),
                        {
                            title: "SageMaker",
                            description: "sm",
                            items: [{
                                title: "JumpStart",
                                description: "js",
                                items: [{ title: "Hugging Face", description: "hf", items: [leaf("Falcon"), leaf("Mixtral")] }],
                            }],
                        },
                    ],
                }],
            }];
            render(<CardList categories={chained} title="Nodes" onSelect={jest.fn()} />);
            fireEvent.click(screen.getByText("AWS Model Providers"));
            fireEvent.click(screen.getByText("SageMaker › JumpStart › Hugging Face"));
            expect(screen.getByText("Falcon")).toBeTruthy();
            expect(screen.getByRole("heading", { name: "SageMaker › JumpStart › Hugging Face" })).toBeTruthy();
            fireEvent.click(screen.getByRole("button", { name: "Back to AWS" }));
            expect(screen.getByText("AWS Default")).toBeTruthy();
        });
    });
});
