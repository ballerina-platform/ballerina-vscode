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

import { A2aConfigurable } from "@wso2/ballerina-core";

/**
 * How a remote agent's connection is written. The credential a remote agent (or the gateway in front of it) asks for
 * goes into the arguments of `ai:A2aToolKit`'s `new`: a header, or `clientConfig.auth`. Every value that differs per
 * environment is a configurable, and a secret is never written into the code.
 */

export const DEFAULT_API_KEY_HEADER = "X-API-Key";

export type A2aAuthKind = "none" | "apiKey" | "bearer" | "oauth2";

export interface A2aAuth {
    kind: A2aAuthKind;
    /** The header an API key is sent in. */
    headerName: string;
    /** The API key, or the bearer token. */
    secret: string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
}

export const NO_AUTH: A2aAuth = {
    kind: "none", headerName: DEFAULT_API_KEY_HEADER, secret: "", tokenUrl: "", clientId: "", clientSecret: "",
};

export interface A2aConnection {
    /** The `agent` argument: the configurable that holds the agent's URL. */
    agent: string;
    /** The `headers` argument, when an API key is sent. */
    headers?: string;
    /** The `clientConfig` argument, when a bearer token or an OAuth2 grant is used. */
    clientConfig?: string;
    /** The configurables to declare, with the values for Config.toml. */
    configurables: A2aConfigurable[];
}

const quote = (text: string) => JSON.stringify(text);

/** What the form lets the user pick, and what each choice asks for. */
export const AUTH_CHOICES: { kind: A2aAuthKind; label: string }[] = [
    { kind: "none", label: "None" },
    { kind: "apiKey", label: "API key header" },
    { kind: "bearer", label: "Bearer token" },
    { kind: "oauth2", label: "OAuth2 client credentials" },
];

/** The kinds a card's security scheme suggests, so the form can preselect one. */
export function authKindOfScheme(kind: string): A2aAuthKind | undefined {
    switch (kind) {
        case "Bearer": return "bearer";
        case "API key": return "apiKey";
        case "OAuth2": return "oauth2";
        default: return undefined;
    }
}

/**
 * The connection for an agent at `url`, with the toolkit variable `name`. A secret left empty is still declared (as a
 * required configurable) so the author fills it in Config.toml; it just has no value written.
 */
export function buildConnection(name: string, url: string, auth: A2aAuth): A2aConnection {
    const urlName = `${name}Url`;
    const configurables: A2aConfigurable[] = [{ name: urlName, defaultValue: quote(url) }];
    const secret = (suffix: string, value: string): string => {
        configurables.push({ name: `${name}${suffix}`, configValue: value === "" ? undefined : value });
        return `${name}${suffix}`;
    };
    const connection: A2aConnection = { agent: urlName, configurables };
    switch (auth.kind) {
        case "apiKey":
            connection.headers = `{${quote(auth.headerName.trim() || DEFAULT_API_KEY_HEADER)}: ${secret("ApiKey", auth.secret)}}`;
            break;
        case "bearer":
            connection.clientConfig = `{auth: {token: ${secret("Token", auth.secret)}}}`;
            break;
        case "oauth2": {
            configurables.push({ name: `${name}TokenUrl`, defaultValue: quote(auth.tokenUrl.trim()) });
            const clientId = secret("ClientId", auth.clientId);
            const clientSecret = secret("ClientSecret", auth.clientSecret);
            connection.clientConfig =
                `{auth: {tokenUrl: ${name}TokenUrl, clientId: ${clientId}, clientSecret: ${clientSecret}}}`;
            break;
        }
        default:
            break;
    }
    return connection;
}

/** Which credential an existing toolkit sends, read from its `headers` and `clientConfig` arguments. */
export function readAuth(headers?: string, clientConfig?: string): A2aAuth {
    const header = /^\s*\{\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(headers ?? "");
    if (header) {
        return { ...NO_AUTH, kind: "apiKey", headerName: JSON.parse(`"${header[1]}"`) };
    }
    const config = clientConfig ?? "";
    if (/\bauth\s*:\s*\{[^}]*\btokenUrl\b/.test(config)) {
        return { ...NO_AUTH, kind: "oauth2" };
    }
    if (/\bauth\s*:\s*\{[^}]*\btoken\b/.test(config)) {
        return { ...NO_AUTH, kind: "bearer" };
    }
    return NO_AUTH;
}

/** The identifiers an expression reads, so the configurables behind a toolkit can be found. */
export function identifiersIn(expression: string | undefined): string[] {
    const withoutStrings = (expression ?? "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    return Array.from(new Set(withoutStrings.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []));
}
