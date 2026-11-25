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

import { authKindOfScheme, buildConnection, identifiersIn, NO_AUTH, readAuth } from "./remoteAgentConnection";

describe("remote agent connection", () => {
    it("an open agent needs only its URL configurable", () => {
        expect(buildConnection("weatherAgent", "http://localhost:9092", NO_AUTH)).toEqual({
            agent: "weatherAgentUrl",
            configurables: [{ name: "weatherAgentUrl", defaultValue: '"http://localhost:9092"' }],
        });
    });

    it("an API key goes in a header, and the key is a configurable with its value for Config.toml", () => {
        const connection = buildConnection("weatherAgent", "http://gw/weather",
            { ...NO_AUTH, kind: "apiKey", headerName: "X-API-Key", secret: "k-123" });
        expect(connection.headers).toBe('{"X-API-Key": weatherAgentApiKey}');
        expect(connection.clientConfig).toBeUndefined();
        expect(connection.configurables).toEqual([
            { name: "weatherAgentUrl", defaultValue: '"http://gw/weather"' },
            { name: "weatherAgentApiKey", configValue: "k-123" },
        ]);
    });

    it("the key's header name is quoted, and defaults when left empty", () => {
        expect(buildConnection("a", "http://h", { ...NO_AUTH, kind: "apiKey", headerName: "Ocp-Apim-Key", secret: "x" }).headers)
            .toBe('{"Ocp-Apim-Key": aApiKey}');
        expect(buildConnection("a", "http://h", { ...NO_AUTH, kind: "apiKey", headerName: " ", secret: "x" }).headers)
            .toBe('{"X-API-Key": aApiKey}');
    });

    it("a bearer token goes in clientConfig.auth", () => {
        const connection = buildConnection("tripPlannerAgent", "http://h", { ...NO_AUTH, kind: "bearer", secret: "t" });
        expect(connection.clientConfig).toBe("{auth: {token: tripPlannerAgentToken}}");
        expect(connection.headers).toBeUndefined();
        expect(connection.configurables.map((c) => c.name)).toEqual(["tripPlannerAgentUrl", "tripPlannerAgentToken"]);
    });

    it("an OAuth2 grant has a token URL and a client id and secret", () => {
        const connection = buildConnection("a", "http://h", {
            ...NO_AUTH, kind: "oauth2", tokenUrl: "https://idp/token", clientId: "id", clientSecret: "s",
        });
        expect(connection.clientConfig).toBe("{auth: {tokenUrl: aTokenUrl, clientId: aClientId, clientSecret: aClientSecret}}");
        expect(connection.configurables).toEqual([
            { name: "aUrl", defaultValue: '"http://h"' },
            { name: "aTokenUrl", defaultValue: '"https://idp/token"' },
            { name: "aClientId", configValue: "id" },
            { name: "aClientSecret", configValue: "s" },
        ]);
    });

    it("a secret left empty is declared as required, with no value written", () => {
        const connection = buildConnection("a", "http://h", { ...NO_AUTH, kind: "bearer", secret: "" });
        expect(connection.configurables[1]).toEqual({ name: "aToken", configValue: undefined });
    });

    it("reads the credential kind back from the code", () => {
        expect(readAuth('{"X-API-Key": aApiKey}', undefined)).toMatchObject({ kind: "apiKey", headerName: "X-API-Key" });
        expect(readAuth(undefined, "{auth: {token: aToken}}").kind).toBe("bearer");
        expect(readAuth(undefined, "{auth: {tokenUrl: aTokenUrl, clientId: x, clientSecret: y}}").kind).toBe("oauth2");
        expect(readAuth("{}", "{}").kind).toBe("none");
        expect(readAuth(undefined, undefined).kind).toBe("none");
    });

    it("finds the identifiers an expression reads, ignoring strings", () => {
        expect(identifiersIn('{"X-API-Key": weatherAgentApiKey}')).toEqual(["weatherAgentApiKey"]);
        expect(identifiersIn("{auth: {token: aToken}}")).toEqual(["auth", "token", "aToken"]);
        expect(identifiersIn(undefined)).toEqual([]);
    });

    it("preselects a credential from the card's scheme", () => {
        expect(authKindOfScheme("Bearer")).toBe("bearer");
        expect(authKindOfScheme("API key")).toBe("apiKey");
        expect(authKindOfScheme("OAuth2")).toBe("oauth2");
        expect(authKindOfScheme("Mutual TLS")).toBeUndefined();
    });
});
