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
import { ChoreoIcon, CodeData } from "@wso2/ballerina-core";
import { getNodeReferenceIcon } from "../components/editors/NodeReferenceSelect";

describe("ChoreoIcon", () => {
    it("draws the mark at the size asked, in the current text colour", () => {
        const { container } = render(<ChoreoIcon size={20} />);
        const svg = container.querySelector("svg")!;
        expect(svg.getAttribute("width")).toBe("20");
        expect(svg.getAttribute("height")).toBe("20");
        expect(svg.getAttribute("aria-label")).toBe("Choreo");
        expect(svg.getAttribute("style")).toMatch(/color: currentcolor/i);
    });

    it("fills every shape itself, since a wrapper's `svg { fill }` rule would otherwise recolour it", () => {
        const { container } = render(<ChoreoIcon />);
        const shapes = Array.from(container.querySelectorAll("ellipse"));
        expect(shapes).toHaveLength(9);
        shapes.forEach((shape) => expect(shape.getAttribute("fill")).toBe("currentColor"));
    });

    it("takes the colour it is given", () => {
        const { container } = render(<ChoreoIcon color="red" />);
        expect(container.querySelector("svg")!.getAttribute("style")).toContain("red");
    });
});

describe("model provider dropdown icon", () => {
    const defaultProviders: CodeData[] = [
        { module: "ai", node: "MODEL_PROVIDER", object: "Wso2ModelProvider" },
        { module: "ai", node: "EMBEDDING_PROVIDER", object: "Wso2EmbeddingProvider" },
    ];

    it.each(defaultProviders)("shows the Choreo mark, not the old glyph, for the default $node", (codedata) => {
        const { container } = render(getNodeReferenceIcon(codedata));
        expect(container.querySelector('svg[aria-label="Choreo"]')).not.toBeNull();
        expect(container.querySelector(".fw-bi-wso2")).toBeNull();
    });
});
