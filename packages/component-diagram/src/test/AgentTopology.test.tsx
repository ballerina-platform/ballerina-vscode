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
import { prettyDOM, waitFor } from "@testing-library/dom";
import { fireEvent, render, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CDConnection, CDModel, CDResourceFunction, CDService } from "@wso2/ballerina-core";
import { AgentTopologyDiagram } from "../components/AgentTopologyDiagram";
import { TopologyAgentArtifact, TopologyInput } from "../components/AgentTopologyDiagram/types";

const AGENTS_BAL = "/proj/agents.bal";
const SERVICES_BAL = "/proj/services.bal";

const range = (line: number) => ({ startLine: { line, offset: 0 }, endLine: { line: line + 1, offset: 1 } });

function agentConnection(uuid: string, symbol: string, filePath: string, line: number, extra: Partial<CDConnection> = {}): CDConnection {
    return {
        symbol,
        location: { filePath, ...range(line) },
        scope: "GLOBAL",
        kind: "Agent",
        uuid,
        enableFlowModel: false,
        sortText: `${filePath}${line}`,
        ...extra,
    };
}

function artifact(name: string, path: string, startLine: number): TopologyAgentArtifact {
    return { name, path, startLine, isDefinition: false, moduleName: "ai" };
}

function resourceFn(accessor: string, path: string, filePath: string, line: number, connections: string[], agentCalls?: CDResourceFunction["agentCalls"]): CDResourceFunction {
    return { accessor, path, location: { filePath, ...range(line) }, connections, agentCalls };
}

function service(filePath: string, line: number, type: string, absolutePath: string, connections: string[], resourceFunctions: CDResourceFunction[]): CDService {
    return {
        location: { filePath, ...range(line) },
        attachedListeners: [],
        connections,
        functions: [],
        remoteFunctions: [],
        resourceFunctions,
        absolutePath,
        type,
        icon: "",
        uuid: `${filePath}${line}-svc`,
        enableFlowModel: true,
        sortText: `${filePath}${line}`,
    };
}

// The Help Desk shape used across the design spec: a supervisor delegates to three
// specialists, and a separate /quotes handler runs order then shippingRates in sequence.
function helpDeskInput(): TopologyInput {
    const supervisor = agentConnection("sup", "supportSupervisorAgent", AGENTS_BAL, 1, {
        role: "Supervisor",
        delegatesTo: ["bil", "tech", "ord"],
    });
    const billing = agentConnection("bil", "billingAgent", AGENTS_BAL, 5, { role: "Billing" });
    const technical = agentConnection("tech", "technicalSupportAgent", AGENTS_BAL, 9, { role: "Technical" });
    const order = agentConnection("ord", "orderAgent", AGENTS_BAL, 13, { role: "Order" });
    const shipping = agentConnection("ship", "shippingRatesAgent", AGENTS_BAL, 17, { role: "Shipping" });

    const chat = resourceFn("post", "helpDesk", SERVICES_BAL, 1, ["sup"]);
    const chatService = service(SERVICES_BAL, 1, "ai:Service", "/helpDesk", ["sup"], [chat]);

    const quotes = resourceFn("post", "quotes", SERVICES_BAL, 3, ["ord", "ship"], [
        { connection: "ord", line: 4 },
        { connection: "ship", line: 5 },
    ]);
    const shippingApi = service(SERVICES_BAL, 1, "http:Service", "/shipping-api", ["ord", "ship"], [quotes]);

    const model: CDModel = {
        connections: [supervisor, billing, technical, order, shipping],
        listeners: [],
        services: [chatService, shippingApi],
    };

    return {
        model,
        agents: [
            artifact("supportSupervisorAgent", AGENTS_BAL, 1),
            artifact("billingAgent", AGENTS_BAL, 5),
            artifact("technicalSupportAgent", AGENTS_BAL, 9),
            artifact("orderAgent", AGENTS_BAL, 13),
            artifact("shippingRatesAgent", AGENTS_BAL, 17),
        ],
    };
}

// --- Emotion style snapshot helpers (mirrors Diagram.test.tsx) ---

function getEmotionStyles(container: HTMLElement): string {
    const domContent = container.innerHTML;
    const usedHashes = new Set<string>();
    const hashRegex = /css-([a-z0-9]+)/g;
    let match: RegExpExecArray | null;
    while ((match = hashRegex.exec(domContent)) !== null) {
        usedHashes.add(match[1]);
    }
    const relevantRules: string[] = [];
    const styleTags = document.querySelectorAll("style[data-emotion]");
    styleTags.forEach((tag) => {
        if (tag instanceof HTMLStyleElement && tag.sheet) {
            try {
                Array.from(tag.sheet.cssRules).forEach((rule) => {
                    const ruleText = rule.cssText;
                    const ruleHashMatch = /\.css-([a-z0-9]+)/.exec(ruleText);
                    if (ruleHashMatch && usedHashes.has(ruleHashMatch[1])) {
                        relevantRules.push(ruleText);
                    }
                });
            } catch (e) {
                // CORS may block access to cssRules
            }
        }
    });
    return relevantRules.sort().join("\n");
}

function buildHashMap(content: string): Map<string, string> {
    const hashRegex = /css-([a-z0-9]+)/g;
    const seen = new Set<string>();
    const ordered: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = hashRegex.exec(content)) !== null) {
        if (!seen.has(match[1])) {
            seen.add(match[1]);
            ordered.push(match[1]);
        }
    }
    const map = new Map<string, string>();
    ordered.forEach((hash, i) => map.set(`css-${hash}`, `css-${i}`));
    return map;
}

function applyHashMap(content: string, hashMap: Map<string, string>): string {
    if (hashMap.size === 0) {
        return content;
    }
    const pattern = new RegExp(
        [...hashMap.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
        "g"
    );
    return content.replace(pattern, (m) => hashMap.get(m) ?? m);
}

async function renderAndCheckSnapshot(input: TopologyInput, testName: string) {
    const dom = render(
        <AgentTopologyDiagram input={input} onAgentSelect={jest.fn()} onTriggerSelect={jest.fn()} />
    );

    await waitFor(() => {
        const diagramElements = dom.container.querySelectorAll('[class*="diagram"], svg, canvas');
        expect(diagramElements.length).toBeGreaterThan(0);
    }, { timeout: 10000 });

    const emotionStyles = getEmotionStyles(dom.container);
    const prettyDom = prettyDOM(dom.container, 1000000, { filterNode: () => true });
    expect(prettyDom).toBeTruthy();

    const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");
    const cleanDom = (prettyDom as string).replace(ansiEscapePattern, "");
    const hashMap = buildHashMap(cleanDom);
    let sanitizedDom = cleanDom.replaceAll(
        /\s+(marker-end|id|data-linkid|data-nodeid|appearance|aria-label|current-value)="[^"]*"/g,
        ""
    );
    sanitizedDom = applyHashMap(sanitizedDom, hashMap);
    const normalizedStyles = applyHashMap(emotionStyles, hashMap);

    const snapshot = normalizedStyles.trim()
        ? `/* Emotion Styles */\n${normalizedStyles}\n\n/* DOM */\n${sanitizedDom}`
        : sanitizedDom;
    expect(snapshot).toMatchSnapshot(testName);
}

describe("AgentTopologyDiagram - Snapshot Tests", () => {
    test("renders the Help Desk shape", async () => {
        await renderAndCheckSnapshot(helpDeskInput(), "help-desk-shape");
    }, 15000);

    test("renders an empty package with no agents", async () => {
        await renderAndCheckSnapshot({ model: { connections: [], listeners: [], services: [] }, agents: [] }, "no-agents");
    }, 15000);
});

describe("AgentTopologyDiagram - Entry points", () => {
    it("folds the triggers into a chip, pins a flow from the list and clears it from the chip or with Escape", () => {
        const dom = render(<AgentTopologyDiagram input={helpDeskInput()} onAgentSelect={() => {}} onTriggerSelect={() => {}} />);
        expect(dom.queryByRole("listbox")).toBeNull();
        fireEvent.click(dom.getByRole("button", { name: /entry points/i }));

        const rows = within(dom.getByRole("listbox", { name: "Entry points" })).getAllByRole("button", { pressed: false });
        expect(rows.map((row) => row.textContent)).toEqual(["POST /helpDeskAgent Chat", "POST /quoteshttp:Service · /shipping-api"]);

        fireEvent.click(rows[1]);
        expect(dom.queryByRole("listbox")).toBeNull();
        expect(dom.getByRole("button", { name: "POST /quotes" })).toBeInTheDocument();

        fireEvent.click(dom.getByRole("button", { name: "Clear the pinned flow" }));
        expect(dom.getByRole("button", { name: /entry points/i })).toBeInTheDocument();

        fireEvent.click(dom.getByRole("button", { name: /entry points/i }));
        fireEvent.click(within(dom.getByRole("listbox")).getAllByRole("button", { pressed: false })[0]);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(dom.queryByRole("button", { name: "Clear the pinned flow" })).toBeNull();
    });

    it("opens a flow from the row's shortcut and from the pinned chip, as the trigger square would", () => {
        const onTriggerSelect = jest.fn();
        const dom = render(<AgentTopologyDiagram input={helpDeskInput()} onAgentSelect={() => {}} onTriggerSelect={onTriggerSelect} />);
        fireEvent.click(dom.getByRole("button", { name: /entry points/i }));
        fireEvent.click(dom.getByRole("button", { name: "Open POST /quotes" }));
        expect(onTriggerSelect).toHaveBeenCalledWith({ filePath: SERVICES_BAL, position: { line: 3, offset: 0 }, endPosition: { line: 4, offset: 1 } });
        expect(dom.getByRole("listbox")).toBeInTheDocument();

        fireEvent.click(within(dom.getByRole("listbox")).getAllByRole("button", { pressed: false })[1]);
        fireEvent.click(dom.getByRole("button", { name: "Open POST /quotes" }));
        expect(onTriggerSelect).toHaveBeenCalledTimes(2);
    });

});
