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
import { render } from "@testing-library/react";
import { A2aIcon } from "../components/NodeIcon";

describe("A2aIcon", () => {
    it("draws the protocol's mark at the size asked, in the current text colour", () => {
        const { container } = render(<A2aIcon size={20} />);
        const svg = container.querySelector("svg")!;
        expect(svg.getAttribute("width")).toBe("20");
        expect(svg.getAttribute("height")).toBe("20");
        expect(svg.getAttribute("aria-label")).toBe("A2A");
        expect(container.innerHTML).not.toContain("#fff");
        expect(container.innerHTML).toContain('stroke="currentColor"');
    });

    it("takes the colour it is given", () => {
        const { container } = render(<A2aIcon color="red" />);
        expect(container.querySelector("svg")!.getAttribute("style")).toContain("red");
    });
});
