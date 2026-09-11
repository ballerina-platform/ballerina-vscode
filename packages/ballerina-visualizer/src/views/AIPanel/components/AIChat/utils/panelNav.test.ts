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

// L1: the back arrow's label is the only thing telling the user where it goes, and the same arrow
// serves every panel — so the label has to come from the stack, not from where the panel was reached
// most often. MCP reached from Settings returning to Settings under a "Back to chat" tooltip is the
// case that shipped.

import { backTooltipFor, PanelRoute } from "./panelNav";

describe("panel back-arrow tooltip", () => {
    it("names the chat one level deep", () => {
        expect(backTooltipFor(["settings"])).toBe("Back to chat");
        expect(backTooltipFor(["mcp"])).toBe("Back to chat");
    });

    it("names the panel underneath when nested", () => {
        expect(backTooltipFor(["settings", "mcp"])).toBe("Back to Settings");
        expect(backTooltipFor(["settings", "skills"])).toBe("Back to Settings");
    });

    it("names the immediate parent, not the bottom of the stack", () => {
        expect(backTooltipFor(["settings", "skills", "mcp"])).toBe("Back to Skills");
    });

    it("falls back to the chat for an empty stack", () => {
        expect(backTooltipFor([])).toBe("Back to chat");
    });

    it("covers every route as a parent", () => {
        const routes: PanelRoute[] = ["settings", "mcp", "skills"];
        const labels = routes.map((parent) => backTooltipFor([parent, "mcp"]));
        expect(labels).toEqual(["Back to Settings", "Back to MCP Servers", "Back to Skills"]);
    });
});
