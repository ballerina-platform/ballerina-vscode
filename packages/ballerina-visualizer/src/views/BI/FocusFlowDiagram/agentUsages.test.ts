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
import { findAgentUsages } from "./agentUsages";

const AGENT_UUID = "c371fce0-2d2e-4e47-2f32-13911cf544a8";
const MODEL_UUID = "56125554-ece7-d97c-cf7c-f67f55d014fe";
const SUPPORT_AGENT_UUID = "a46ec61a-dc9e-c2eb-bb48-4a38adfb51c5";
const HEALTH_CLIENT_UUID = "cb23197d-5209-82a6-d09a-de4d66bd7343";

const AGENTS_BAL = "/proj/agents.bal";
const SERVICES_BAL = "/proj/services.bal";
const MAIN_BAL = "/proj/main.bal";

const range = (line: number) => ({
    startLine: { line, offset: 0 },
    endLine: { line: line + 1, offset: 1 },
});

const model = {
    automation: {
        name: "automation",
        displayName: "main",
        location: { filePath: MAIN_BAL, ...range(1) },
        connections: [MODEL_UUID, AGENT_UUID],
        uuid: "dd326f77-fb27-1ce0-c934-ab8a58bd3b0b",
    },
    connections: [
        {
            symbol: "mathTutorModel",
            location: { filePath: AGENTS_BAL, ...range(2) },
            scope: "GLOBAL",
            kind: "Model Provider",
            uuid: MODEL_UUID,
            enableFlowModel: true,
            sortText: "agents.bal2",
        },
        {
            symbol: "supportAgent",
            location: { filePath: SERVICES_BAL, ...range(24) },
            scope: "LOCAL",
            kind: "Connection",
            uuid: SUPPORT_AGENT_UUID,
            enableFlowModel: false,
            sortText: "services.bal24",
        },
        {
            symbol: "mathTutorAgent",
            location: { filePath: AGENTS_BAL, ...range(4) },
            scope: "GLOBAL",
            kind: "Agent",
            uuid: AGENT_UUID,
            enableFlowModel: false,
            sortText: "agents.bal4",
        },
        {
            symbol: "healthClient",
            location: { filePath: SERVICES_BAL, ...range(3) },
            scope: "GLOBAL",
            kind: "Connection",
            uuid: HEALTH_CLIENT_UUID,
            enableFlowModel: true,
            sortText: "services.bal3",
        },
    ],
    listeners: [],
    services: [
        {
            location: { filePath: SERVICES_BAL, ...range(6) },
            attachedListeners: [],
            connections: [MODEL_UUID, AGENT_UUID],
            functions: [],
            remoteFunctions: [],
            resourceFunctions: [
                {
                    accessor: "post",
                    path: "chat",
                    location: { filePath: SERVICES_BAL, ...range(7) },
                    connections: [MODEL_UUID, AGENT_UUID],
                },
            ],
            absolutePath: "/mathService",
            type: "http:Service",
            icon: "http.png",
            uuid: "bc99dd3d-30a3-1470-bd65-a31441c86e16",
            enableFlowModel: true,
            sortText: "services.bal6",
        },
        {
            location: { filePath: SERVICES_BAL, ...range(13) },
            attachedListeners: [],
            connections: [HEALTH_CLIENT_UUID],
            functions: [],
            remoteFunctions: [],
            resourceFunctions: [
                {
                    accessor: "get",
                    path: "status",
                    location: { filePath: SERVICES_BAL, ...range(14) },
                    connections: [HEALTH_CLIENT_UUID],
                },
            ],
            absolutePath: "/healthService",
            type: "http:Service",
            icon: "http.png",
            uuid: "2962d0eb-ccfb-5bf5-2c16-23f84d471b2f",
            enableFlowModel: true,
            sortText: "services.bal13",
        },
        {
            location: { filePath: SERVICES_BAL, ...range(20) },
            attachedListeners: [],
            connections: [MODEL_UUID, SUPPORT_AGENT_UUID],
            functions: [],
            remoteFunctions: [],
            resourceFunctions: [
                {
                    accessor: "post",
                    path: "chat",
                    location: { filePath: SERVICES_BAL, ...range(31) },
                    connections: [MODEL_UUID, SUPPORT_AGENT_UUID],
                },
            ],
            absolutePath: "/supportService",
            type: "http:Service",
            icon: "http.png",
            uuid: "b1a0f3c2-0000-0000-0000-000000000000",
            enableFlowModel: true,
            sortText: "services.bal20",
        },
    ],
} as unknown as CDModel;

describe("findAgentUsages", () => {
    it("finds the calling resource function and main(), and nothing else", () => {
        const usages = findAgentUsages(model, { filePath: AGENTS_BAL, startLine: 4 });

        expect(usages.map((u) => u.label)).toEqual(["POST /chat", "main"]);
        expect(usages[0]).toMatchObject({
            serviceLabel: "/mathService",
            type: "http:Service",
            documentUri: SERVICES_BAL,
            position: { startLine: 7, startColumn: 0, endLine: 8, endColumn: 1 },
        });
        expect(usages[1]).toMatchObject({ type: "automation", documentUri: MAIN_BAL });
    });

    it("excludes services that do not call the agent", () => {
        const usages = findAgentUsages(model, { filePath: AGENTS_BAL, startLine: 4 });
        expect(usages.some((u) => u.serviceLabel === "/healthService")).toBe(false);
        expect(usages.some((u) => u.serviceLabel === "/supportService")).toBe(false);
    });

    it("does not confuse the agent with the model provider declared beside it", () => {
        const usages = findAgentUsages(model, { filePath: AGENTS_BAL, startLine: 2 });
        expect(usages.map((u) => u.serviceLabel)).toEqual([
            "/mathService",
            "/supportService",
            undefined,
        ]);
    });

    it("falls back to the symbol when the declaration position has drifted", () => {
        const usages = findAgentUsages(model, {
            filePath: AGENTS_BAL,
            startLine: 999,
            symbol: "mathTutorAgent",
        });
        expect(usages.map((u) => u.label)).toEqual(["POST /chat", "main"]);
    });

    it("returns nothing when the agent is not in the model", () => {
        expect(findAgentUsages(model, { filePath: "/other.bal", startLine: 0 })).toEqual([]);
    });
});
