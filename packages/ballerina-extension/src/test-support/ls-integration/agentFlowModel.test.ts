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

// L3: the agent model the LS derives from source (docs/agent-builder-test-plan.md,
// "Language-server tests"). For the smallest agent project — one model provider, one
// agent, one chat trigger — the flow model of the trigger's resource must expose exactly
// one node that runs the declared agent: that node is what the diagram, the tool panel
// and the runtime chat all hang off. Drives the real headless LS against the
// `basic-agent` fixture; skips automatically when no Ballerina distribution is available.

import * as fs from "fs";
import * as path from "path";
import type { BIFlowModelResponse, FlowNode, LinePosition } from "@wso2/ballerina-core";
import { LsHarness, resolveBalCommand } from "@wso2/test-config/ls-harness";

const bal = resolveBalCommand();
const projectRoot = path.join(__dirname, "fixtures", "basic-agent");
const mainBal = path.join(projectRoot, "main.bal");
const agentsBal = path.join(projectRoot, "agents.bal");

// Mirrors AGENT_CALL_NODE_KINDS in @wso2/ballerina-core, whose barrel cannot be loaded here.
const AGENT_CALL_KINDS = new Set(["AGENT_CALL", "AGENT_RUN"]);

/**
 * Whether `node` runs an agent. The LS bundled with the extension models `agent.run(...)`
 * as a dedicated agent-call node; a distribution's own LS may still model it as a method
 * call on `ballerina/ai`. Both carry the agent in the `connection` property.
 */
function runsAnAgent(node: FlowNode): boolean {
    const { node: kind, org, module, symbol } = node.codedata ?? {};
    return AGENT_CALL_KINDS.has(kind ?? "") || (org === "ballerina" && module === "ai" && symbol === "run");
}

/** Every node in the flow, including those nested inside branches. */
function allNodes(nodes: FlowNode[]): FlowNode[] {
    return nodes.flatMap((node) => [node, ...(node.branches ?? []).flatMap((b) => allNodes(b.children ?? []))]);
}

/** The line range of the function whose signature contains `signature`, as the LS expects it. */
function functionRange(source: string, signature: string): { startLine: LinePosition; endLine: LinePosition } {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((line) => line.includes(signature));
    const end = lines.findIndex((line, i) => i > start && line.startsWith("    }"));
    if (start < 0 || end < 0) {
        throw new Error(`fixture no longer declares '${signature}'`);
    }
    return { startLine: { line: start, offset: 0 }, endLine: { line: end, offset: lines[end].length } };
}

if (!bal) {
    // eslint-disable-next-line no-console
    console.warn("[ls-integration] No Ballerina distribution found (set BALLERINA_HOME); skipping agent model tests.");
}

const describeLs = bal ? describe : describe.skip;

describeLs("agent flow model (headless LS)", () => {
    const mainSource = fs.readFileSync(mainBal, "utf8");
    let ls: LsHarness;

    beforeAll(async () => {
        ls = new LsHarness(bal!);
        ls.start();
        await ls.initialize(projectRoot);
        ls.didOpen(agentsBal, fs.readFileSync(agentsBal, "utf8"));
        ls.didOpen(mainBal, mainSource);
    }, 90_000);

    afterAll(async () => {
        await ls?.shutdown();
    });

    it("models the chat trigger's resource with one run of the declared agent", async () => {
        const response = await ls.request<BIFlowModelResponse>("flowDesignService/getFlowModel", {
            filePath: mainBal,
            ...functionRange(mainSource, "resource function post chat"),
        });

        expect(response.errorMsg).toBeUndefined();
        const agentRuns = allNodes(response.flowModel?.nodes ?? []).filter(runsAnAgent);
        expect(agentRuns).toHaveLength(1);
        expect(agentRuns[0].properties?.connection?.value).toBe("greeterAgent");
        expect(agentRuns[0].properties?.variable?.value).toBe("stringResult");
    }, 60_000);
});
