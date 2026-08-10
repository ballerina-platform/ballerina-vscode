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

// FAST (PR gate, no LS): render the Diagram against a flow model CAPTURED from the real
// LS (fixtures/realdata/flowModel.json, produced + drift-checked nightly by
// Diagram.flowModel.capture.test.ts) and snapshot it. This is the agreed split — real
// rpc data lives in a file, the fast test snapshots the render, the rpc/drift assertion
// runs nightly. jsdom, no VSCode/LS/distro.

import React from "react";
import { render, waitFor } from "@testing-library/react";
import { prettyDOM } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { Diagram } from "../components/Diagram";
import { Flow } from "../utils/types";
import flowModel from "./fixtures/realdata/flowModel.json";

const mockProps = {
    onAddNode: jest.fn(),
    onAddNodePrompt: jest.fn(),
    onDeleteNode: jest.fn(),
    onAddComment: jest.fn(),
    onNodeSelect: jest.fn(),
    onNodeSave: jest.fn(),
    addBreakpoint: jest.fn(),
    removeBreakpoint: jest.fn(),
    onConnectionSelect: jest.fn(),
    goToSource: jest.fn(),
    openView: jest.fn(),
};

// Normalize Emotion css-<hash> classes to stable indices (order of first appearance) so
// the DOM snapshot is deterministic; strip dynamic ids/markers.
function sanitize(dom: string): string {
    const clean = dom.replace(/\x1b\[\d+m/g, "");
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const m of clean.matchAll(/css-([a-z0-9]+)/g)) {
        if (!seen.has(m[1])) {
            seen.add(m[1]);
            ordered.push(m[1]);
        }
    }
    // `appearance` on <vscode-button> is reflected from a prop by the webview-ui-toolkit
    // custom element; whether/when it appears in the serialized DOM depends on custom-element
    // upgrade timing + the resolved toolkit version, so it varies by environment. Strip it —
    // it's styling noise for structural drift detection.
    let out = clean.replaceAll(
        /\s+(marker-end|id|data-linkid|data-nodeid|aria-label|current-value|appearance)="[^"]*"/g,
        ""
    );
    // prettyDOM prints an element that HAD attributes across multiple lines; once the only
    // attribute is stripped (above), an empty multi-line opening tag (`<tag\n    >`) remains,
    // which won't match a single-line `<tag>` from an environment that never had the attribute.
    // Collapse any opening tag left with nothing but whitespace before `>`.
    out = out.replaceAll(/<([a-zA-Z][\w-]*)\s+>/g, "<$1>");
    ordered.forEach((hash, i) => {
        out = out.replaceAll(`css-${hash}`, `css-${i}`);
    });
    return out;
}

describe("bi-diagram — render + snapshot from a real captured flow model", () => {
    it("renders the real model (canvas + start node + the source's nodes)", async () => {
        const { container } = render(<Diagram model={flowModel as unknown as Flow} {...mockProps} />);
        await waitFor(
            () => expect(container.querySelector('[data-testid="bi-diagram-canvas"]')).toBeInTheDocument(),
            { timeout: 10_000 }
        );
        expect(container.querySelectorAll('[data-testid="start-node"]').length).toBeGreaterThan(0);
        // the real model has a couple of variables + an if → node links are drawn
        expect(container.querySelectorAll('[data-testid^="diagram-link-"]').length).toBeGreaterThan(0);
    }, 20_000);

    it("matches the diagram snapshot", async () => {
        const { container } = render(<Diagram model={flowModel as unknown as Flow} {...mockProps} />);
        await waitFor(
            () => expect(container.querySelector('[data-testid="bi-diagram-canvas"]')).toBeInTheDocument(),
            { timeout: 10_000 }
        );
        expect(sanitize(prettyDOM(container, 1_000_000) as string)).toMatchSnapshot();
    }, 20_000);
});
