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

import { CDFunction, CDModel } from "@wso2/ballerina-core";
import {
    AgentTriggerScopes,
    agentCallerProtocols,
    findAgentUsages,
    findListenerPosition,
    resolveTriggerScopes,
} from "./agentUsages";

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

const CHANNELS: AgentTriggerScopes = new Map([
    ["whatsapp", "SERVICE"],
    ["telegram", "SERVICE"],
]);

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

    it("re-resolves a listener that moved after the service was deleted", () => {
        const shifted = {
            ...triggerModel,
            listeners: triggerModel.listeners.map((listener) =>
                listener.symbol === "whatsappListener"
                    ? { ...listener, location: { filePath: TRIGGERS_BAL, ...range(2) } }
                    : listener
            ),
        } as unknown as CDModel;
        expect(findListenerPosition(shifted, "whatsappListener", TRIGGERS_BAL)).toEqual({
            startLine: 2,
            startColumn: 0,
            endLine: 3,
            endColumn: 1,
        });
    });

    it("skips a listener that is already gone", () => {
        expect(findListenerPosition(triggerModel, "whatsappListener", "/proj/other.bal")).toBeUndefined();
        expect(findListenerPosition(triggerModel, "goneListener", TRIGGERS_BAL)).toBeUndefined();
    });

    it("leaves an entry point the user wrote themselves un-deletable", () => {
        expect(usagesOf("POST /chat")?.trigger).toBeUndefined();
    });

    it("gives a trigger one row, not one per function that reaches the agent", () => {
        const telegramRows = findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 }, CHANNELS)
            .filter((usage) => usage.type === "telegram:TelegramService");

        expect(telegramRows.map((usage) => usage.label)).toEqual(["onMessage"]);
    });

    it("opens the helper holding the agent call, not the handler that offloads to it", () => {
        expect(usagesOf("onMessage")).toMatchObject({
            documentUri: TRIGGERS_BAL,
            position: { startLine: 52, endLine: 53 },
        });
    });

    it("stays on the handler when it is the only function reaching the agent", () => {
        expect(usagesOf("onMessages")?.position).toMatchObject({ startLine: 12, endLine: 13 });
    });

    it("stays on the handlers when a merged service leaves the helper ambiguous", () => {
        const merged = {
            ...triggerModel,
            services: (triggerModel.services ?? []).map((service) =>
                service.type === "telegram:TelegramService"
                    ? {
                          ...service,
                          remoteFunctions: [
                              ...service.remoteFunctions,
                              { name: "onEdited", location: { filePath: TRIGGERS_BAL, ...range(60) },
                                  connections: [AGENT_UUID] },
                          ],
                          functions: [
                              ...service.functions,
                              { name: "replyToEditedMessage", location: { filePath: TRIGGERS_BAL, ...range(70) },
                                  connections: [AGENT_UUID] },
                          ],
                      }
                    : service
            ),
        } as unknown as CDModel;

        const rows = findAgentUsages(merged, { filePath: AGENTS_BAL, startLine: 4 }, CHANNELS)
            .filter((usage) => usage.type === "telegram:TelegramService");

        expect(rows.map((usage) => [usage.label, usage.position.startLine])).toEqual([
            ["onMessage", 48],
            ["onEdited", 60],
        ]);
    });

    it("offers nothing to delete when the channel list could not be read", () => {
        const usages = findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 });
        expect(usages.every((usage) => usage.trigger === undefined)).toBe(true);
    });
});

const HTTP_BAL = "/proj/http_trigger.bal";
const SUPPORT_API_UUID = "support-api-service";
const HTTP_CHANNELS: AgentTriggerScopes = new Map([["http", "ENTRY_POINT"]]);

const supportApi = {
    location: { filePath: HTTP_BAL, ...range(5) },
    attachedListeners: ["http-listener"],
    connections: [AGENT_UUID],
    functions: [] as CDFunction[],
    remoteFunctions: [] as CDFunction[],
    resourceFunctions: [
        {
            accessor: "post",
            path: "products/[string productId]/questions",
            location: { filePath: HTTP_BAL, ...range(6) },
            connections: [AGENT_UUID],
        },
    ],
    absolutePath: "/support\\-api",
    type: "http:Service",
    icon: "http.png",
    uuid: SUPPORT_API_UUID,
    enableFlowModel: true,
    sortText: "http_trigger.bal5",
};

const httpRows = (service: unknown) =>
    findAgentUsages(
        {
            ...model,
            listeners: [
                {
                    symbol: "httpListener",
                    location: { filePath: HTTP_BAL, ...range(3) },
                    attachedServices: [SUPPORT_API_UUID],
                    uuid: "http-listener",
                },
            ],
            services: [service],
        } as unknown as CDModel,
        { filePath: AGENTS_BAL, startLine: 4 },
        HTTP_CHANNELS
    ).filter((usage) => usage.type === "http:Service");

describe("http endpoint rows", () => {
    it("aims the row's deletion at the entry point, not the whole service", () => {
        const row = httpRows(supportApi)[0];

        expect(row.label).toBe("POST /products/[string productId]/questions");
        expect(row.trigger?.entryPoint).toEqual({
            label: "POST /products/[string productId]/questions",
            documentUri: HTTP_BAL,
            position: { startLine: 6, startColumn: 0, endLine: 7, endColumn: 1 },
        });
        expect(row.trigger).toMatchObject({ serviceName: "/support-api", position: { startLine: 5 } });
    });

    it("offers the service and its listener when the endpoint is all the service holds", () => {
        const trigger = httpRows(supportApi)[0].trigger;

        expect(trigger?.orphansService).toBe(true);
        expect(trigger?.listeners.map((listener) => listener.symbol)).toEqual(["httpListener"]);
    });

    it("keeps the service when another endpoint would be left behind", () => {
        const rows = httpRows({
            ...supportApi,
            resourceFunctions: [
                ...supportApi.resourceFunctions,
                { accessor: "get", path: "health", location: { filePath: HTTP_BAL, ...range(20) },
                    connections: [] },
            ],
        });

        expect(rows.map((row) => row.label)).toEqual(["POST /products/[string productId]/questions"]);
        expect(rows[0].trigger?.orphansService).toBe(false);
    });

    it("keeps the service when it holds members the endpoint does not own", () => {
        const rows = httpRows({
            ...supportApi,
            functions: [{ name: "init", location: { filePath: HTTP_BAL, ...range(8) }, connections: [] }],
        });

        expect(rows[0].trigger?.orphansService).toBe(false);
    });

    it("gives each endpoint its own entry point to delete", () => {
        const rows = httpRows({
            ...supportApi,
            resourceFunctions: [
                ...supportApi.resourceFunctions,
                { accessor: "get", path: "summary", location: { filePath: HTTP_BAL, ...range(20) },
                    connections: [AGENT_UUID] },
            ],
        });

        expect(rows.map((row) => row.trigger?.entryPoint?.label)).toEqual([
            "POST /products/[string productId]/questions",
            "GET /summary",
        ]);
        expect(rows.every((row) => row.trigger?.orphansService === false)).toBe(true);
    });

    it("leaves a service reached only through a private helper alone", () => {
        const rows = httpRows({
            ...supportApi,
            resourceFunctions: [{ ...supportApi.resourceFunctions[0], connections: [] }],
            functions: [{ name: "askAgent", location: { filePath: HTTP_BAL, ...range(9) },
                connections: [AGENT_UUID] }],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0].trigger).toBeUndefined();
    });

    it("still takes a chat channel down as a whole service", () => {
        const trigger = findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 }, CHANNELS)
            .find((usage) => usage.label === "onMessages")?.trigger;

        expect(trigger?.entryPoint).toBeUndefined();
        expect(trigger?.orphansService).toBeUndefined();
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

        expect(labels).toEqual(["onAssigned", "onReopened", "Agent Chat", "main"]);
    });
});

describe("try it on a rail row", () => {
    it("carries the base path and listener the tryIt command matches on", () => {
        expect(httpRows(supportApi)[0].tryIt).toEqual({
            basePath: "/support\\-api",
            listener: "httpListener",
            resource: { method: "post", path: "products/[string productId]/questions" },
        });
    });

    it("drops an attached listener the model carries no declaration for", () => {
        const row = httpRows({ ...supportApi, attachedListeners: ["http-listener", "gone"] })[0];

        expect(row.tryIt?.listener).toBe("httpListener");
    });

    it("aims each endpoint of one service at its own resource", () => {
        const rows = httpRows({
            ...supportApi,
            resourceFunctions: [
                ...supportApi.resourceFunctions,
                { accessor: "get", path: "orders", location: { filePath: HTTP_BAL, ...range(20) },
                    connections: [AGENT_UUID] },
            ],
        });

        expect(rows.map((row) => row.tryIt?.resource)).toEqual([
            { method: "post", path: "products/[string productId]/questions" },
            { method: "get", path: "orders" },
        ]);
    });

    it("offers try it on an entry point the user wrote themselves", () => {
        const rows = findAgentUsages(
            { ...model, listeners: [], services: [supportApi] } as unknown as CDModel,
            { filePath: AGENTS_BAL, startLine: 4 }
        );

        expect(rows[0].trigger).toBeUndefined();
        expect(rows[0].tryIt).toMatchObject({ basePath: "/support\\-api", listener: "" });
    });

    it("sends no resource for a protocol with no OpenAPI spec to resolve it against", () => {
        const chatService = { ...supportApi, absolutePath: "/agent\\-chat", type: "ai:Service", uuid: "chat-service" };
        const rows = findAgentUsages(
            {
                ...model,
                listeners: [{
                    symbol: "agentChatListener",
                    location: { filePath: HTTP_BAL, ...range(3) },
                    attachedServices: ["chat-service"],
                    uuid: "http-listener",
                }],
                services: [chatService],
            } as unknown as CDModel,
            { filePath: AGENTS_BAL, startLine: 4 }
        );

        expect(rows[0].label).toBe("Agent Chat");
        expect(rows[0].tryIt).toEqual({ basePath: "/agent\\-chat", listener: "agentChatListener" });
    });

    it("offers nothing to try on a protocol the tryIt command does not handle", () => {
        const rows = findAgentUsages(triggerModel, { filePath: AGENTS_BAL, startLine: 4 }, CHANNELS);

        expect(rows.find((usage) => usage.label === "onMessages")?.tryIt).toBeUndefined();
        expect(rows.find((usage) => usage.label === "automation")?.tryIt).toBeUndefined();
    });
});

describe("triggers that only Ballerina Central knows about", () => {
    const SLACK_UUID = "slack-service";
    const SLACK_BAL = "/proj/slack.bal";

    const slackModel = {
        ...model,
        listeners: [{
            symbol: "salesAssistantSlackListener",
            location: { filePath: SLACK_BAL, ...range(1) },
            attachedServices: [SLACK_UUID],
            uuid: "slack-listener",
        }],
        services: [{
            location: { filePath: SLACK_BAL, ...range(3) },
            attachedListeners: ["slack-listener"],
            connections: [AGENT_UUID],
            functions: [],
            resourceFunctions: [],
            remoteFunctions: [
                { name: "onMessage", location: { filePath: SLACK_BAL, ...range(5) }, connections: [AGENT_UUID] },
            ],
            absolutePath: "",
            type: "slack:MessageService",
            icon: "slack.png",
            uuid: SLACK_UUID,
            enableFlowModel: true,
            sortText: "slack.bal3",
        }],
    } as unknown as CDModel;

    const agent = { filePath: AGENTS_BAL, startLine: 4 };

    const clientReturning = (results: unknown[]) => {
        const searchTriggers = jest.fn().mockResolvedValue({ local: results });
        return { client: { getServiceDesignerRpcClient: () => ({ searchTriggers }) } as never, searchTriggers };
    };

    it("asks only about the protocols that actually call this agent", () => {
        expect(agentCallerProtocols(slackModel, agent)).toEqual(["slack"]);
    });

    it("says nothing when the agent is not in the model", () => {
        expect(agentCallerProtocols(slackModel, { filePath: AGENTS_BAL, startLine: 99 })).toEqual([]);
    });

    it("deletes a Central trigger as a whole service", async () => {
        const { client, searchTriggers } = clientReturning([
            { listenerProtocol: "slack", agentTriggerKind: "EVENT", deletionScope: "SERVICE" },
        ]);

        const scopes = await resolveTriggerScopes(client, new Map(), agentCallerProtocols(slackModel, agent));
        const row = findAgentUsages(slackModel, agent, scopes).find((usage) => usage.label === "onMessage");

        expect(scopes.get("slack")).toBe("SERVICE");
        expect(searchTriggers).toHaveBeenCalledWith({ query: "slack", includeLocalRepository: true });
        expect(row?.trigger).toMatchObject({ documentUri: SLACK_BAL, position: { startLine: 3 } });
        expect(row?.trigger?.listeners.map((l) => l.symbol)).toEqual(["salesAssistantSlackListener"]);
        expect(row?.trigger?.entryPoint).toBeUndefined();
    });

    it("leaves a protocol Central does not answer for alone", async () => {
        const { client } = clientReturning([{ listenerProtocol: "somethingelse" }]);

        expect((await resolveTriggerScopes(client, new Map(), ["mystery"])).has("mystery")).toBe(false);
    });

    it("treats a failed lookup as a miss rather than breaking the rail", async () => {
        const searchTriggers = jest.fn().mockRejectedValue(new Error("offline"));
        const client = { getServiceDesignerRpcClient: () => ({ searchTriggers }) } as never;

        await expect(resolveTriggerScopes(client, new Map(), ["unreachable"])).resolves.toEqual(new Map());
    });

    it("never asks twice about the same protocol", async () => {
        const { client, searchTriggers } = clientReturning([
            { listenerProtocol: "repeated", agentTriggerKind: "EVENT", deletionScope: "SERVICE" },
        ]);

        await resolveTriggerScopes(client, new Map(), ["repeated"]);
        const second = await resolveTriggerScopes(client, new Map(), ["repeated"]);

        expect(searchTriggers).toHaveBeenCalledTimes(1);
        expect(second.get("repeated")).toBe("SERVICE");
    });

    it("keeps the local scope for a protocol the local index already has", async () => {
        const { client, searchTriggers } = clientReturning([]);

        const scopes = await resolveTriggerScopes(client, new Map([["http", "ENTRY_POINT"]]), ["http"]);

        expect(searchTriggers).not.toHaveBeenCalled();
        expect(scopes.get("http")).toBe("ENTRY_POINT");
    });
});
