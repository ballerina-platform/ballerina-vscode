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

import { A2aAgentCardInfo } from "@wso2/ballerina-core";

/**
 * Rules for a remote agent's `ai:A2aToolKit` that the form checks before it saves. The form offers one place for a
 * credential, Client Config: its `auth` carries a Bearer token, Basic credentials or an OAuth2 or OpenID Connect grant,
 * and its `secureSocket` mutual TLS. An API key goes in code (the toolkit's `secret` or `headers`), since Client Config
 * can't send one; a `secret` or `headers` already in the code is kept and counts.
 */

/** Whether an expression gives no value: nothing, nil (the parameter's default), or an empty string literal. */
export function isEmptyExpression(expression: string): boolean {
    const text = expression.trim();
    return text === "" || text === "()" || text === '""' || /^string\s*``$/.test(text);
}

/** The one scheme the card requires, when it requires exactly one. */
function requiredScheme(card: A2aAgentCardInfo) {
    if (card.requiredSchemes.length !== 1) {
        return undefined;
    }
    const name = card.requiredSchemes[0];
    return { name, ...card.securitySchemes.find((s) => s.name === name) };
}

/** The toolkit's credential parameters as the form has them: Client Config, and `secret` and `headers` from the code. */
export interface CredentialValues {
    clientConfig: string;
    secret?: string;
    headers?: string;
}

export interface CredentialCheck {
    /** What stops the save, such as a Bearer token missing from Client Config. */
    problem?: string;
    /** Something to know that doesn't stop the save, such as an API key that goes in code. */
    notice?: string;
    /** Whether Client Config is what this card needs, so it is shown out of Advanced Configurations. */
    needsClientConfig: boolean;
}

// What Client Config holds for each kind of scheme it can carry, as the example the form shows
const CLIENT_CONFIG_EXAMPLES: Record<string, { field: "auth" | "secureSocket"; example: string }> = {
    "Bearer": { field: "auth", example: "{auth: {token: bearerToken}}" },
    "Basic": { field: "auth", example: "{auth: {username: user, password: password}}" },
    "OAuth2": { field: "auth", example: "{auth: {tokenUrl: tokenUrl, clientId: clientId, clientSecret: clientSecret}}" },
    "OpenID Connect": { field: "auth", example: "{auth: {tokenUrl: tokenUrl, clientId: clientId, clientSecret: clientSecret}}" },
    "Mutual TLS": { field: "secureSocket", example: "{secureSocket: {key: {certFile: certFile, keyFile: keyFile}}}" },
};

function sets(record: string, field: string): boolean {
    return new RegExp(`\\b${field}\\s*:`).test(record);
}

/** Checks the credential against what the card requires. */
export function credentialCheck(card: A2aAgentCardInfo, values: CredentialValues): CredentialCheck {
    const secretGiven = !isEmptyExpression(values.secret ?? "");
    const headersGiven = !isEmptyExpression(values.headers ?? "") && !/^\{\s*\}$/.test((values.headers ?? "").trim());
    if (card.requiredSchemes.length === 0) {
        return secretGiven
            ? { problem: "This agent's card requires no credential, but the code passes the toolkit a secret, which it "
                + "can't take. Remove `secret` from the toolkit in the code.", needsClientConfig: false }
            : { needsClientConfig: false };
    }
    const scheme = requiredScheme(card);
    if (!scheme) {
        return { needsClientConfig: false };
    }
    const kind = scheme.kind ?? `scheme "${scheme.name}"`;
    if (kind === "API key") {
        return secretGiven || headersGiven
            ? { needsClientConfig: false }
            : {
                notice: `This agent takes an API key in a header (scheme "${scheme.name}"), which Client Config can't `
                    + "send. Add the tool, then give the key in code: `secret = apiKey` on the toolkit.",
                needsClientConfig: false,
            };
    }
    const expected = CLIENT_CONFIG_EXAMPLES[kind];
    if (!expected) {
        return { notice: `This agent asks for ${kind}. Set the credential in Client Config.`, needsClientConfig: true };
    }
    // A Bearer or Basic credential already passed as `secret` in the code works as well
    if (sets(values.clientConfig, expected.field) || (scheme.acceptsSecret && secretGiven)) {
        return { needsClientConfig: true };
    }
    return {
        problem: `This agent requires ${kind}. Set it in Client Config, for example ${expected.example}.`,
        needsClientConfig: true,
    };
}

/** The identifiers an expression reads, so the configurables behind a toolkit can be found. */
export function identifiersIn(expression: string | undefined): string[] {
    const withoutStrings = (expression ?? "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    return Array.from(new Set(withoutStrings.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
}

/**
 * The Agent URL field takes an expression, so a URL typed without quotes would be written into the code as is and not
 * compile. A bare http(s) URL is quoted; a string, a configurable or any other expression is kept as typed.
 */
export function quoteBareUrl(value: string): string {
    const trimmed = value.trim();
    return /^https?:\/\/[^\s"]+$/i.test(trimmed) ? `"${trimmed}"` : value;
}

/** An empty record (`{}`, with or without blank lines) adds nothing to the toolkit's init, so it is left out. */
export function isEmptyRecord(value: string): boolean {
    return /^\{\s*\}$/.test(value.trim());
}
