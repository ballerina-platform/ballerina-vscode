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
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IconDescriptor } from "@wso2/ballerina-core";
import { TriggerGlyph } from "../components/AgentTopologyDiagram/TriggerGlyph";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><path d="M0 0h18v18H0z"/></svg>';
// Not an AI-module URL: ConnectorIcon swaps those (e.g. `azure`) for its own bundled glyph.
const CENTRAL_URL = "https://central.test/ballerinax_trigger.foo_1.0.0.png";

function themed(url?: string): IconDescriptor {
    return { url, light: SVG, dark: SVG, source: "trigger-ui-metadata" };
}

function imageSources(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("img")).map((img) => img.getAttribute("src") ?? "");
}

describe("TriggerGlyph", () => {
    // Invariant: a connector-shipped themed SVG is the glyph, whatever the module would otherwise draw.
    test.each([
        ["azure", "a module with only a Central image"],
        ["kafka", "a module with a brand glyph"],
        ["websocket", "a module with neither"],
    ])("draws the connector's themed SVG for %s (%s)", (glyphType) => {
        const view = render(<TriggerGlyph glyphType={glyphType} icon={themed(CENTRAL_URL)} />);
        const sources = imageSources(view.container);
        expect(sources).toHaveLength(1);
        expect(sources[0]).toMatch(/^data:image\/svg\+xml/);
        expect(view.container.querySelector(`.fw-bi-${glyphType}`)).not.toBeInTheDocument();
    });

    test("falls back to the Central image when the themed SVG fails to load", () => {
        const view = render(<TriggerGlyph glyphType="foo" icon={themed(CENTRAL_URL)} />);
        fireEvent.error(view.getByRole("img"));
        expect(imageSources(view.container)).toEqual([CENTRAL_URL]);
    });

    test("falls back to the brand glyph when the themed SVG fails to load", () => {
        const view = render(<TriggerGlyph glyphType="kafka" icon={themed(CENTRAL_URL)} />);
        fireEvent.error(view.getByRole("img"));
        expect(view.container.querySelector(".fw-bi-kafka")).toBeInTheDocument();
    });

    test.each([
        ["a bare URL", CENTRAL_URL],
        ["a URL-only descriptor", { url: CENTRAL_URL }],
    ])("draws the Central image for %s", (_label, icon) => {
        const view = render(<TriggerGlyph glyphType="foo" icon={icon} />);
        expect(imageSources(view.container)).toEqual([CENTRAL_URL]);
    });

    test("keeps the entry-type glyph for chat services even with a themed SVG", () => {
        const view = render(<TriggerGlyph glyphType="ai" icon={themed(CENTRAL_URL)} />);
        expect(view.container.querySelector("img")).not.toBeInTheDocument();
    });
});
