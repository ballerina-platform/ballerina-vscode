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

    it("shows an escaped path the way it is served, not the way it is written in source", () => {
        const escaped = {
            ...model,
            services: [
                {
                    ...model.services[0],
                    absolutePath: "/math\\-tutor\\-agent",
                    resourceFunctions: [
                        { ...model.services[0].resourceFunctions[0], path: "sub\\-chat" },
                    ],
                },
            ],
        } as unknown as CDModel;

        const usages = findAgentUsages(escaped, { filePath: AGENTS_BAL, startLine: 4 });
        expect(usages[0]).toMatchObject({
            label: "POST /sub-chat",
            serviceLabel: "/math-tutor-agent",
        });
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

const TRIGGERS_BAL = "/proj/triggers.bal";
const WHATSAPP_SERVICE_UUID = "wa-service";
const TELEGRAM_SERVICE_UUID = "tg-service";

const triggerModel = {
    ...model,
    listeners: [
        {
            symbol: "whatsappListener",
            location: { filePath: TRIGGERS_BAL, ...range(3) },
            attachedServices: [WHATSAPP_SERVICE_UUID],
            uuid: "wa-listener",
        },
        {
            symbol: "telegramListener",
            location: { filePath: TRIGGERS_BAL, ...range(40) },
            attachedServices: [TELEGRAM_SERVICE_UUID, "some-other-service"],
            uuid: "tg-listener",
        },
    ],
    services: [
        ...(model.services ?? []),
        {
            location: { filePath: TRIGGERS_BAL, ...range(5) },
            attachedListeners: ["wa-listener"],
            connections: [AGENT_UUID],
            functions: [],
            remoteFunctions: [
                {
                    name: "onMessages",
                    location: { filePath: TRIGGERS_BAL, ...range(12) },
                    connections: [AGENT_UUID],
                },
            ],
            resourceFunctions: [],
            absolutePath: "/whatsapp",
            type: "whatsapp:WhatsAppService",
            icon: "whatsapp.png",
            uuid: WHATSAPP_SERVICE_UUID,
            enableFlowModel: true,
            sortText: "triggers.bal5",
        },
        {
            location: { filePath: TRIGGERS_BAL, ...range(42) },
            attachedListeners: ["tg-listener"],
            connections: [AGENT_UUID],
            remoteFunctions: [
                {
                    name: "onMessage",
                    location: { filePath: TRIGGERS_BAL, ...range(48) },
                    connections: [AGENT_UUID],
                },
            ],
            resourceFunctions: [],
            absolutePath: "/telegram",
            type: "telegram:TelegramService",
            functions: [
                { name: "init", location: { filePath: TRIGGERS_BAL, ...range(44) }, connections: [] },
                {
                    name: "replyToTelegramMessage",
                    location: { filePath: TRIGGERS_BAL, ...range(52) },
                    connections: [AGENT_UUID],
                },
            ],
            icon: "telegram.png",
            uuid: TELEGRAM_SERVICE_UUID,
            enableFlowModel: true,
            sortText: "triggers.bal42",
        },
    ],
} as unknown as CDModel;

const CHANNELS = new Set(["whatsapp", "telegram"]);

describe("findAgentUsages trigger payload", () => {
    const usagesOf = (label: string) =>
        findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 }, CHANNELS)
            .find((usage) => usage.label === label);

    it("marks a channel service as a removable trigger, pointing at the service declaration", () => {
        expect(usagesOf("onMessages")?.trigger).toMatchObject({
            serviceName: "/whatsapp",
            documentUri: TRIGGERS_BAL,
            position: { startLine: 5, endLine: 6 },
        });
    });

    it("takes the listener down with a trigger that is its only service", () => {
        expect(usagesOf("onMessages")?.trigger?.listeners).toEqual([
            {
                symbol: "whatsappListener",
                documentUri: TRIGGERS_BAL,
                position: { startLine: 3, startColumn: 0, endLine: 4, endColumn: 1 },
            },
        ]);
    });

    it("leaves a listener alone while another service is still attached to it", () => {
        expect(usagesOf("onMessage")?.trigger?.listeners).toEqual([]);
    });

    it("leaves an entry point the user wrote themselves un-deletable", () => {
        expect(usagesOf("POST /chat")?.trigger).toBeUndefined();
    });

    it("gives a trigger one row, not one per function that reaches the agent", () => {
        const telegramRows = findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 }, CHANNELS)
            .filter((usage) => usage.type === "telegram:TelegramService");

        expect(telegramRows.map((usage) => usage.label)).toEqual(["onMessage"]);
    });

    it("offers nothing to delete when the channel list could not be read", () => {
        const usages = findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 });
        expect(usages.every((usage) => usage.trigger === undefined)).toBe(true);
    });
});

const scatteredChannels = {
    ...model,
    services: [
        {
            location: { filePath: TRIGGERS_BAL, ...range(5) },
            connections: [AGENT_UUID],
            remoteFunctions: [
                { name: "onAssigned", location: { filePath: TRIGGERS_BAL, ...range(9) },
                    connections: [AGENT_UUID] },
            ],
            resourceFunctions: [],
            type: "github:IssuesService",
            uuid: "gh-1",
        },
        {
            location: { filePath: TRIGGERS_BAL, ...range(30) },
            connections: [AGENT_UUID],
            remoteFunctions: [],
            resourceFunctions: [
                { accessor: "post", path: "chat", location: { filePath: TRIGGERS_BAL, ...range(32) },
                    connections: [AGENT_UUID] },
            ],
            absolutePath: "/MathTutor",
            type: "ai:Service",
            uuid: "chat-1",
        },
        {
            location: { filePath: TRIGGERS_BAL, ...range(60) },
            connections: [AGENT_UUID],
            remoteFunctions: [
                { name: "onReopened", location: { filePath: TRIGGERS_BAL, ...range(64) },
                    connections: [AGENT_UUID] },
            ],
            resourceFunctions: [],
            type: "github:IssuesService",
            uuid: "gh-2",
        },
    ],
} as unknown as CDModel;

describe("rail ordering", () => {
    it("keeps rows of the same channel together", () => {
        const labels = findAgentUsages(scatteredChannels, { filePath: AGENTS_BAL, startLine: 4 })
            .map((usage) => usage.label);

        expect(labels).toEqual(["onAssigned", "onReopened", "POST /chat", "main"]);
    });
});
