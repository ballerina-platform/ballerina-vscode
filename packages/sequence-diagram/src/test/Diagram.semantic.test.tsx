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

// L2 (P0): sequence-diagram render SEMANTICS (docs/TEST_BACKLOG.md L2-09).
// The snapshot suite guards DOM drift; this asserts meaning over the story corpus:
//   - every fixture renders an SVG without throwing
//   - INVARIANT: every participant declared in the model appears (by name) in the
//     rendered diagram — nothing silently dropped
//   - a pathologically long participant name renders without crashing (#655 class)

import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Diagram } from "../components/Diagram";
import { Flow } from "../utils/types";

import functionCall1Model from "../stories/function_call1.json";
import functionCall2Model from "../stories/function_call2.json";
import functionCall3Model from "../stories/function_call3.json";
import ifNode1Model from "../stories/if_node1.json";
import ifNode4Model from "../stories/if_node4.json";
import ifNode5Model from "../stories/if_node5.json";
import ifNode8Model from "../stories/if_node8.json";
import whileNode1Model from "../stories/while_node1.json";
import endpointCall1Model from "../stories/endpoint_call1.json";
import sequenceModel from "../stories/sequence-model.json";

const mockProps = {
    onClickParticipant: jest.fn(),
    onAddParticipant: jest.fn(),
    onReady: jest.fn(),
};

async function renderDiagram(model: Flow) {
    const dom = render(<Diagram model={model} {...mockProps} />);
    await waitFor(
        () => {
            expect(dom.container.querySelectorAll('[class*="diagram"], svg, canvas').length).toBeGreaterThan(0);
        },
        { timeout: 10000 }
    );
    return dom;
}

interface Fixture {
    name: string;
    model: Flow;
}

const MODELS: Fixture[] = [
    { name: "function-call-1", model: functionCall1Model as unknown as Flow },
    { name: "function-call-2", model: functionCall2Model as unknown as Flow },
    { name: "function-call-3", model: functionCall3Model as unknown as Flow },
    { name: "if-node-1", model: ifNode1Model as unknown as Flow },
    { name: "if-node-4", model: ifNode4Model as unknown as Flow },
    { name: "if-node-5", model: ifNode5Model as unknown as Flow },
    { name: "if-node-8", model: ifNode8Model as unknown as Flow },
    { name: "while-node-1", model: whileNode1Model as unknown as Flow },
    { name: "endpoint-call-1", model: endpointCall1Model as unknown as Flow },
    { name: "sequence-model", model: (sequenceModel as any).sequenceDiagram as Flow },
];

describe("Sequence Diagram — render semantics", () => {
    describe.each(MODELS.map((f) => [f.name, f] as [string, Fixture]))("%s", (_name, fixture) => {
        it("renders an SVG without throwing", async () => {
            const { container } = await renderDiagram(fixture.model);
            expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
        }, 15000);

        it("INVARIANT: every participant in the model is rendered by name", async () => {
            const { container } = await renderDiagram(fixture.model);
            const participants = (fixture.model as any).participants ?? [];
            const text = container.textContent ?? "";
            const missing = participants
                .map((p: any) => p.name)
                .filter((name: string) => name && !text.includes(name));
            expect(missing).toEqual([]);
        }, 15000);
    });

    it("renders a pathologically long participant name without crashing (#655 class)", async () => {
        const base = functionCall1Model as any;
        const longName = "veryLongParticipantName".repeat(20); // ~460 chars
        const model: Flow = {
            ...base,
            participants: [{ ...base.participants[0], name: longName }, ...base.participants.slice(1)],
        };
        const { container } = await renderDiagram(model);
        expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
        // the long name (or a prefix of it) is present — it was not dropped on overflow
        expect((container.textContent ?? "").includes(longName.slice(0, 20))).toBe(true);
    }, 15000);
});
