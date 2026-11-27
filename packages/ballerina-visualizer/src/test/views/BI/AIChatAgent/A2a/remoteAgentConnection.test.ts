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

import type { A2aAgentCardInfo } from "@wso2/ballerina-core";
import {
    credentialCheck, identifiersIn, isEmptyRecord, quoteBareUrl,
} from "../../../../../views/BI/AIChatAgent/A2a/remoteAgentConnection";

const card = (requiredSchemes: string[], kind = "Bearer", acceptsSecret = true): A2aAgentCardInfo => ({
    name: "Weather Agent", description: "", version: "1.0.0", protocolBindings: ["HTTP+JSON"],
    streaming: false, pushNotifications: false, extendedAgentCard: false,
    securitySchemes: requiredSchemes.map((name) => ({ name, kind, acceptsSecret })),
    requiredSchemes, inputModes: [], outputModes: [], skills: [],
});

describe("the credential a remote agent's card asks for, given in Client Config", () => {
    const empty = ["", "{}", "{\n\n}"];

    it.each([
        ["Bearer", "{auth: {token: bearerToken}}"],
        ["Basic", "{auth: {username: user, password: pass}}"],
        ["OAuth2", "{auth: {tokenUrl: url, clientId: id, clientSecret: secret}}"],
        ["OpenID Connect", "{auth: {tokenUrl: url, clientId: id, clientSecret: secret}}"],
        ["Mutual TLS", "{secureSocket: {key: {certFile: c, keyFile: k}}}"],
    ])("accepts %s set in Client Config", (kind, clientConfig) => {
        const check = credentialCheck(card(["s"], kind, kind === "Bearer" || kind === "Basic"), { clientConfig });
        expect(check.problem).toBeUndefined();
        expect(check.needsClientConfig).toBe(true);
    });

    it.each(["Bearer", "Basic", "OAuth2", "OpenID Connect"])("requires auth in Client Config for %s", (kind) => {
        for (const clientConfig of empty) {
            const check = credentialCheck(card(["s"], kind), { clientConfig });
            expect(check.problem).toContain(`requires ${kind}`);
            expect(check.problem).toContain("{auth:");
        }
    });

    it("requires secureSocket, not auth, for mutual TLS", () => {
        expect(credentialCheck(card(["s"], "Mutual TLS", false), { clientConfig: "{auth: {token: t}}" }).problem)
            .toContain("secureSocket");
    });

    it("accepts a Bearer or Basic secret already in the code", () => {
        expect(credentialCheck(card(["s"], "Bearer"), { clientConfig: "", secret: "token" }).problem).toBeUndefined();
    });

    it("asks for nothing when the card requires no credential", () => {
        expect(credentialCheck(card([]), { clientConfig: "" })).toEqual({ needsClientConfig: false });
    });

    it("refuses a secret in the code when the card requires no credential", () => {
        expect(credentialCheck(card([]), { clientConfig: "", secret: '"x"' }).problem).toContain("requires no credential");
    });
});

describe("an API key, which Client Config can't send", () => {
    const apiKey = card(["key"], "API key");

    it("doesn't stop the save, and points to the code", () => {
        const check = credentialCheck(apiKey, { clientConfig: "" });
        expect(check.problem).toBeUndefined();
        expect(check.notice).toContain("secret = apiKey");
        expect(check.needsClientConfig).toBe(false);
    });

    it.each([{ secret: "apiKey" }, { headers: '{"X-API-Key": apiKey}' }])("is satisfied by code that gives the key (%o)",
        (code) => expect(credentialCheck(apiKey, { clientConfig: "", ...code }).notice).toBeUndefined());
});

describe("the configurables a toolkit reads", () => {
    it("finds the identifiers an expression reads, ignoring strings", () => {
        expect(identifiersIn('{"X-API-Key": weatherAgentApiKey}')).toEqual(["weatherAgentApiKey"]);
        expect(identifiersIn("{auth: {token: aToken}}")).toEqual(["auth", "token", "aToken"]);
        expect(identifiersIn(undefined)).toEqual([]);
    });
});

describe("quoteBareUrl", () => {
    it.each([
        ["http://localhost:9201/", "\"http://localhost:9201/\""],
        ["  https://agent.example.com/a2a ", "\"https://agent.example.com/a2a\""],
    ])("quotes the bare URL %s", (typed, saved) => expect(quoteBareUrl(typed)).toBe(saved));

    it.each(["\"http://localhost:9201\"", "agentUrl", "string `http://${host}`", "", "{name: \"x\"}"])(
        "keeps the expression %s as typed", (typed) => expect(quoteBareUrl(typed)).toBe(typed));
});

describe("isEmptyRecord", () => {
    it.each(["{}", "{\n\n}", " { } "])("treats %j as empty", (value) => expect(isEmptyRecord(value)).toBe(true));
    it.each(["", "{auth: {token: t}}", "()"])("treats %j as set", (value) => expect(isEmptyRecord(value)).toBe(false));
});
