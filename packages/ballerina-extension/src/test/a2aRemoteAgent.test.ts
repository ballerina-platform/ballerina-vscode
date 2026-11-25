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

import { cardUrlOf, fetchAgentCard, toBaseUrl, toCardInfo, toolkitVariableName, unsupportedReason } from "../rpc-managers/ai-agent/a2a-remote-agent";

const weatherCard = {
    name: "Weather Agent",
    description: "Gives today's forecast",
    version: "1.0.0",
    supportedInterfaces: [{ protocolBinding: "HTTP+JSON", url: "http://localhost:9092/rest", protocolVersion: "1.0" }],
    capabilities: { streaming: true },
    skills: [{ id: "forecast", name: "Forecast", description: "Today's forecast", tags: ["weather"] }],
};

const response = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("a2a remote agent helpers", () => {
    describe("URLs", () => {
        it("drops the card path, query and trailing slash", () => {
            expect(toBaseUrl("http://h:9092/")).toBe("http://h:9092");
            expect(toBaseUrl("http://h/agents/planner/.well-known/agent-card.json?x=1")).toBe("http://h/agents/planner");
            expect(cardUrlOf("http://h/agents/planner/")).toBe("http://h/agents/planner/.well-known/agent-card.json");
        });
    });

    describe("variable names", () => {
        it.each([
            ["Weather Agent", "weatherAgent"],
            ["Trip Planner", "tripPlannerAgent"],
            ["trip-planner agent", "tripPlannerAgent"],
            ["Agent", "remoteAgent"],
            ["???", "remoteAgent"],
            ["2go", "agent2goAgent"],
        ])("%s -> %s", (name, expected) => {
            expect(toolkitVariableName(name)).toBe(expected);
        });
    });

    describe("card info", () => {
        it("reads the fields the form shows", () => {
            const info = toCardInfo({
                ...weatherCard,
                securitySchemes: { gw: { apiKeySecurityScheme: { name: "X-API-Key", location: "header" } } },
            });
            expect(info.name).toBe("Weather Agent");
            expect(info.endpointUrl).toBe("http://localhost:9092/rest");
            expect(info.protocolBindings).toEqual(["HTTP+JSON"]);
            expect(info.streaming).toBe(true);
            expect(info.securitySchemes).toEqual([{ name: "gw", kind: "API key", acceptsSecret: true, location: "header" }]);
            expect(info.skills[0].id).toBe("forecast");
            expect(info.requiredSchemes).toEqual([]);
        });

        it.each([
            ["a v1.0 requirement", { securityRequirements: [{ schemes: { bearer: { list: [] } } }] }, ["bearer"]],
            ["an earlier card's requirement", { security: [{ gw: [] }] }, ["gw"]],
            ["only the first of several alternatives", { securityRequirements: [{ schemes: { a: {} } }, { schemes: { b: {} } }] }, ["a"]],
            ["no requirement", {}, []],
        ])("reads the schemes a caller must satisfy from %s", (_label, extra, expected) => {
            expect(toCardInfo({ ...weatherCard, ...extra }).requiredSchemes).toEqual(expected);
        });

        it.each([
            ["HTTP Bearer", { httpAuthSecurityScheme: { scheme: "Bearer" } }, true],
            ["HTTP Basic", { httpAuthSecurityScheme: { scheme: "Basic" } }, true],
            ["an API key in a header", { apiKeySecurityScheme: { name: "X-API-Key", location: "header" } }, true],
            ["an API key in the query", { apiKeySecurityScheme: { name: "key", location: "query" } }, false],
            ["an API key in a cookie, v0.3 shape", { type: "apiKey", name: "k", in: "cookie" }, false],
            ["OAuth2", { oauth2SecurityScheme: { flows: {} } }, false],
            ["OpenID Connect", { openIdConnectSecurityScheme: { openIdConnectUrl: "x" } }, false],
            ["mutual TLS", { mtlsSecurityScheme: {} }, false],
        ])("knows whether the toolkit's secret can carry %s", (_label, scheme, expected) => {
            expect(toCardInfo({ ...weatherCard, securitySchemes: { s: scheme } }).securitySchemes[0].acceptsSecret).toBe(expected);
        });

        it.each(["query", "cookie"])("refuses a card whose required API key goes in the %s", (location) => {
            const info = toCardInfo({
                ...weatherCard,
                securitySchemes: { key: { apiKeySecurityScheme: { name: "key", location } } },
                securityRequirements: [{ schemes: { key: { list: [] } } }],
            });
            expect(unsupportedReason(info)).toContain(`API key in the ${location}`);
        });

        it("refuses a card that asks for several credentials together, which one secret can't satisfy", () => {
            const info = toCardInfo({ ...weatherCard, securityRequirements: [{ schemes: { key: {}, token: {} } }] });
            expect(unsupportedReason(info)).toContain("2 credentials together");
            expect(unsupportedReason(toCardInfo(weatherCard))).toBeUndefined();
        });
    });

    describe("fetching a card", () => {
        it("fetches the card from the well-known path and suggests a variable name", async () => {
            const fetchImpl = jest.fn().mockResolvedValue(response(200, weatherCard));
            const result = await fetchAgentCard("http://localhost:9092/", {}, fetchImpl);
            expect(fetchImpl.mock.calls[0][0]).toBe("http://localhost:9092/.well-known/agent-card.json");
            expect(result).toMatchObject({ agentUrl: "http://localhost:9092", toolkitName: "weatherAgent", fromJson: false });
            expect(result.unsupported).toBeUndefined();
        });

        it("sends the given headers with the request", async () => {
            const fetchImpl = jest.fn().mockResolvedValue(response(200, weatherCard));
            await fetchAgentCard("http://gw/agents/weather", { "X-API-Key": "k" }, fetchImpl);
            expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ "X-API-Key": "k", Accept: "application/json" });
        });

        it("reports a card behind credentials on 401 and 403, which the toolkit can still read with headers", async () => {
            for (const status of [401, 403]) {
                const result = await fetchAgentCard("http://gw/a", {}, jest.fn().mockResolvedValue(response(status, {})));
                expect(result).toEqual({ agentUrl: "http://gw/a", credentialsRequired: true });
            }
        });

        it("reports other statuses and an unreachable agent", async () => {
            expect((await fetchAgentCard("http://h", {}, jest.fn().mockResolvedValue(response(404, {})))).error)
                .toContain("answered 404");
            expect((await fetchAgentCard("http://h", {}, jest.fn().mockRejectedValue(new Error("down")))).error)
                .toContain("couldn't be reached");
        });

        it("reads a pasted card without a URL", async () => {
            const result = await fetchAgentCard(JSON.stringify(weatherCard));
            expect(result).toMatchObject({ fromJson: true, toolkitName: "weatherAgent" });
            expect(result.agentUrl).toBeUndefined();
        });

        it("refuses text that is not a URL or a card", async () => {
            expect((await fetchAgentCard("")).error).toContain("Enter the agent's URL");
            expect((await fetchAgentCard("localhost:9092")).error).toContain("http://");
            expect((await fetchAgentCard("{nope")).error).toContain("valid JSON");
            expect((await fetchAgentCard("{}")).error).toContain("no name");
        });

        it("flags a card with no HTTP+JSON interface", async () => {
            const card = { ...weatherCard, supportedInterfaces: [{ protocolBinding: "JSONRPC", url: "http://h/rpc" }] };
            const result = await fetchAgentCard("http://h", {}, jest.fn().mockResolvedValue(response(200, card)));
            expect(result.card).toBeDefined();
            expect(result.unsupported).toContain("JSONRPC");
            expect(result.unsupported).toContain("HTTP+JSON");
        });

        it("does not flag a card that lists JSON-RPC and HTTP+JSON", async () => {
            const card = {
                ...weatherCard,
                supportedInterfaces: [{ protocolBinding: "JSONRPC", url: "http://h/rpc" }, { protocolBinding: "HTTP+JSON", url: "http://h/rest" }],
            };
            const result = await fetchAgentCard("http://h", {}, jest.fn().mockResolvedValue(response(200, card)));
            expect(result.unsupported).toBeUndefined();
            expect(result.card?.endpointUrl).toBe("http://h/rest");
        });
    });
});
