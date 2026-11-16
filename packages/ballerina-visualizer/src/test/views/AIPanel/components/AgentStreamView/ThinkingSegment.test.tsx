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
import ThinkingSegment from "../../../../../views/AIPanel/components/AgentStreamView/ThinkingSegment";
import { ThinkingItem } from "../../../../../views/AIPanel/components/AgentStreamView/types";

jest.mock("../../../../../views/AIPanel/components/MarkdownRenderer", () => ({
    __esModule: true,
    default: ({ markdownContent }: { markdownContent: string }) => <div>{markdownContent}</div>,
}));

describe("ThinkingSegment", () => {
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

    const render = (item: Partial<ThinkingItem>, streamActive = false) =>
        act(() => {
            root.render(<ThinkingSegment item={{ kind: "thinking", id: "0", text: "", ...item }} streamActive={streamActive} />);
        });
    const header = () => container.querySelector("button")!;

    it("collapses a finished thought to its header and toggles it on click", () => {
        render({ text: "Planning the retry.\n\nChecking the tests.", done: true, startedAt: 0, endedAt: 4000 });
        expect(header().textContent).toContain("Thought for 4s");
        expect(header().getAttribute("aria-expanded")).toBe("false");
        expect(container.querySelector("[inert]")).not.toBeNull();
        act(() => header().click());
        expect(header().getAttribute("aria-expanded")).toBe("true");
        expect(container.querySelector("[inert]")).toBeNull();
        act(() => header().click());
        expect(header().getAttribute("aria-expanded")).toBe("false");
        expect(container.querySelector("[inert]")).not.toBeNull();
    });

    it("shows the live text while thinking", () => {
        render({ text: "Checking the diagnostics." }, true);
        expect(header().textContent).toContain("Thinking");
        expect(container.textContent).toContain("Checking the diagnostics.");
    });

    it("renders a never-closed saved block as a finished thought", () => {
        render({ text: "Half a thought", done: false });
        expect(header().textContent).toContain("Thought");
        expect(header().textContent).not.toContain("Thinking");
    });

    it("has nothing to open when the text is blank", () => {
        render({ text: "  \n\n ", done: true });
        expect(header().hasAttribute("aria-expanded")).toBe(false);
    });
});
