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

import { CDModel } from "@wso2/ballerina-core";
import { buildTopology } from "../components/AgentTopologyDiagram/topologyModel";
import { layoutTopology } from "../components/AgentTopologyDiagram/topologyLayout";
import { describeTopology } from "../components/AgentTopologyDiagram/topologyDescribe";

const AGENTS_BAL = "/proj/agents.bal";
const SERVICES_BAL = "/proj/services.bal";
const range = (line: number) => ({ startLine: { line, offset: 0 }, endLine: { line: line + 1, offset: 1 } });

const model = {
    connections: [
        { symbol: "outlineAgent", location: { filePath: AGENTS_BAL, ...range(1) }, scope: "GLOBAL", kind: "Agent", uuid: "o", typeName: "Agent", dependentFunctions: [], enableFlowModel: false, sortText: "a1" },
        { symbol: "rewriteAgent", location: { filePath: AGENTS_BAL, ...range(5) }, scope: "GLOBAL", kind: "Agent", uuid: "r", typeName: "Agent", dependentFunctions: [], enableFlowModel: false, sortText: "a5" },
        { symbol: "draftAgent", location: { filePath: AGENTS_BAL, ...range(9) }, scope: "GLOBAL", kind: "Agent", uuid: "d", typeName: "Agent", dependentFunctions: ["searchFacts"], delegatesTo: ["o"], enableFlowModel: false, sortText: "a9" },
    ],
    listeners: [],
    services: [{
        location: { filePath: SERVICES_BAL, ...range(1) },
        attachedListeners: [],
        connections: ["o", "r", "d"],
        functions: [],
        remoteFunctions: [],
        resourceFunctions: [{
            accessor: "post",
            path: "gated",
            location: { filePath: SERVICES_BAL, ...range(2) },
            connections: ["o", "r", "d"],
            agentCalls: [
                { connection: "o", line: 3, groups: [] },
                { connection: "r", line: 5, groups: [{ kind: "if", id: "g1", label: "!passesGate(outline)" }] },
                { connection: "d", line: 7, groups: [] },
            ],
        }],
        absolutePath: "/content",
        type: "http:Service",
        icon: "",
        uuid: "svc",
        enableFlowModel: true,
        sortText: "s1",
    }],
} as unknown as CDModel;

const agents = [
    { name: "outlineAgent", path: AGENTS_BAL, startLine: 1, moduleName: "ai", isDefinition: false },
    { name: "rewriteAgent", path: AGENTS_BAL, startLine: 5, moduleName: "ai", isDefinition: false },
    { name: "draftAgent", path: AGENTS_BAL, startLine: 9, moduleName: "ai", isDefinition: false },
];

describe("describeTopology", () => {
    it("prints every node, edge and handler of the canvas as text", () => {
        const graph = buildTopology({ model, agents });
        const layout = layoutTopology(graph, { availableWidth: 1400 });
        const text = describeTopology(model, graph, layout, { availableWidth: 1400 });

        expect(text).toMatchSnapshot();
    });

});
