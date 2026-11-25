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
import { credentialHint, identifiersIn, needsSecret, secretProblem } from "../../../../../views/BI/AIChatAgent/A2a/remoteAgentConnection";

const card = (requiredSchemes: string[], kind = "Bearer", acceptsSecret = true): A2aAgentCardInfo => ({
    name: "Weather Agent", description: "", version: "1.0.0", protocolBindings: ["HTTP+JSON"],
    streaming: false, pushNotifications: false, extendedAgentCard: false,
    securitySchemes: requiredSchemes.map((name) => ({ name, kind, acceptsSecret })),
    requiredSchemes, inputModes: [], outputModes: [], skills: [],
});

describe("the secret a remote agent's card asks for", () => {
    const empty = ["", "  ", "()", '""', "string ``"];

    it.each(empty)("is required when the card names one scheme (secret %p)", (secret) => {
        expect(secretProblem(card(["bearer"]), secret)).toContain('scheme "bearer"');
    });

    it.each(['"abc"', "weatherAgentToken"])("is accepted when given, as text or a configurable (%s)", (secret) => {
        expect(secretProblem(card(["bearer"]), secret)).toBeUndefined();
    });

    it.each(['"abc"', "weatherAgentToken"])("is refused when the card names no scheme (%s)", (secret) => {
        expect(secretProblem(card([]), secret)).toContain("requires no credential");
    });

    it.each(empty)("is not needed when the card names no scheme (secret %p)", (secret) => {
        expect(secretProblem(card([]), secret)).toBeUndefined();
    });
});

describe("a credential the secret can't carry", () => {
    const oauth = card(["oauth"], "OAuth2", false);

    it.each(["", "()"])("isn't asked for as a secret (secret %p)", (secret) => {
        expect(needsSecret(oauth)).toBe(false);
        expect(secretProblem(oauth, secret)).toBeUndefined();
    });

    it("is refused as a secret, since the secret isn't sent for it", () => {
        expect(secretProblem(oauth, "oauthToken")).toContain("isn't sent for OAuth2");
    });

    it("points to Client Config or Headers", () => {
        expect(credentialHint(oauth)).toContain("Client Config");
        expect(credentialHint(card(["bearer"]))).toBeUndefined();
        expect(credentialHint(card([]))).toBeUndefined();
    });
});

describe("the configurables a toolkit reads", () => {
    it("finds the identifiers an expression reads, ignoring strings", () => {
        expect(identifiersIn('{"X-API-Key": weatherAgentApiKey}')).toEqual(["weatherAgentApiKey"]);
        expect(identifiersIn("{auth: {token: aToken}}")).toEqual(["auth", "token", "aToken"]);
        expect(identifiersIn(undefined)).toEqual([]);
    });
});
