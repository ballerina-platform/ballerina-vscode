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

import * as crypto from "crypto";
import * as vscode from "vscode";
import { extension } from "../../BalExtensionContext";
import { waitForAuthCode } from "../ai/agent/mcp/oauth";

// Prototype only: borrows amctl's public client and its fixed loopback redirect.
const CLIENT_ID = "amctl";
const CALLBACK_PORT = 10325;
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const SESSION_KEY = "ballerina.agentManager.session";
const DEFAULT_CONSOLE_URL = "http://console.amp.localhost:8080";

export interface AgentManagerSession {
    instanceUrl: string;
    consoleUrl: string;
    org: string;
    tokenEndpoint: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}

export class AgentManagerApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

export async function getSession(): Promise<AgentManagerSession | undefined> {
    const raw = await extension.context.secrets.get(SESSION_KEY);
    const session: AgentManagerSession | undefined = raw ? JSON.parse(raw) : undefined;
    // Sessions saved before the console URL was asked for must sign in again.
    return session?.consoleUrl ? session : undefined;
}

export async function requireSession(): Promise<AgentManagerSession> {
    const session = await getSession();
    if (!session) {
        throw new Error("Sign in to Agent Manager first.");
    }
    return session;
}

const sessionChanged = new vscode.EventEmitter<void>();
export const onDidChangeSession = sessionChanged.event;

// Tokens never leave the extension.
export async function getSessionSummary(): Promise<{ signedIn: boolean; instanceUrl?: string; org?: string }> {
    const session = await getSession();
    return session ? { signedIn: true, instanceUrl: session.instanceUrl, org: session.org } : { signedIn: false };
}

async function saveSession(session: AgentManagerSession): Promise<void> {
    await extension.context.secrets.store(SESSION_KEY, JSON.stringify(session));
}

export async function signOut(): Promise<void> {
    await extension.context.secrets.delete(SESSION_KEY);
    sessionChanged.fire();
}

let refreshing: Promise<string | undefined> | undefined;

export async function getAccessToken(): Promise<string | undefined> {
    const session = await getSession();
    if (!session) {
        return undefined;
    }
    if (session.expiresAt - 60_000 > Date.now()) {
        return session.accessToken;
    }
    // Status polls call this in parallel; one refresh keeps a rotated refresh token from being reused.
    refreshing ??= refresh(session).finally(() => {
        refreshing = undefined;
    });
    return refreshing;
}

async function refresh(session: AgentManagerSession): Promise<string | undefined> {
    if (!session.refreshToken) {
        await signOut();
        return undefined;
    }
    try {
        const token = await postToken(session.tokenEndpoint, {
            grant_type: "refresh_token",
            refresh_token: session.refreshToken,
            client_id: CLIENT_ID,
        });
        await saveSession({ ...session, ...toSessionTokens(token, session.refreshToken) });
        return token.access_token;
    } catch (error) {
        // A network or server failure keeps the session; only a rejected refresh token signs out.
        if (!(error instanceof AgentManagerApiError && (error.status === 400 || error.status === 401))) {
            throw error;
        }
        await signOut();
        return undefined;
    }
}

// Locates an instance without signing in, for callers that only need its addresses.
export async function askInstance(previousConsoleUrl?: string): Promise<{ consoleUrl: string; instanceUrl: string } | undefined> {
    const enteredUrl = await vscode.window.showInputBox({
        title: "Connect to Agent Manager",
        prompt: "Agent Manager Console URL",
        value: previousConsoleUrl ?? DEFAULT_CONSOLE_URL,
        ignoreFocusOut: true,
    });
    if (!enteredUrl) {
        return undefined;
    }
    const consoleUrl = requireSecure(enteredUrl).origin;
    return { consoleUrl, instanceUrl: requireSecure(await apiUrlFromConsole(consoleUrl)).toString().replace(/\/+$/, "") };
}

export async function signIn(): Promise<AgentManagerSession | undefined> {
    const instance = await askInstance((await getSession())?.consoleUrl);
    if (!instance) {
        return undefined;
    }
    const { consoleUrl, instanceUrl: baseUrl } = instance;
    const discovery = await discover(baseUrl);
    const verifier = crypto.randomBytes(32).toString("base64url");
    const state = crypto.randomBytes(32).toString("base64url");
    const authUrl = new URL(discovery.authorizationEndpoint);
    authUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: discovery.scopes.join(" "),
        state,
        code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
    }).toString();

    const code = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Signing in to Agent Manager in your browser...", cancellable: true },
        (_progress, cancel) => waitForAuthCode(CALLBACK_PORT, state, authUrl.toString(), cancel, "Agent Manager")
    );
    const token = await postToken(discovery.tokenEndpoint, {
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        code_verifier: verifier,
    });
    const org = await pickOrg(baseUrl, token.access_token);
    if (!org) {
        return undefined;
    }
    const session: AgentManagerSession = {
        instanceUrl: baseUrl,
        consoleUrl,
        org,
        tokenEndpoint: discovery.tokenEndpoint,
        ...toSessionTokens(token),
    };
    await saveSession(session);
    sessionChanged.fire();
    return session;
}

function toSessionTokens(token: TokenResponse, previousRefresh?: string) {
    return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? previousRefresh,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    };
}

// Tokens travel to these hosts, so plain HTTP is only allowed for a local instance.
function requireSecure(url: string): URL {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.hostname.endsWith(".localhost");
    if (parsed.protocol !== "https:" && !local) {
        throw new Error(`${parsed.origin} isn't using HTTPS. Agent Manager must be reached over HTTPS unless it runs on this machine.`);
    }
    return parsed;
}

// The console publishes its runtime config, including the API it talks to, so one URL locates both.
async function apiUrlFromConsole(consoleUrl: string): Promise<string> {
    const response = await fetch(`${consoleUrl}/config.js`);
    const apiBaseUrl = response.ok ? /apiBaseUrl:\s*['"`]([^'"`]+)['"`]/.exec(await response.text())?.[1] : undefined;
    if (!apiBaseUrl) {
        throw new Error(`${consoleUrl} doesn't look like an Agent Manager console. Enter the URL you open the console at.`);
    }
    return new URL(apiBaseUrl, consoleUrl).toString().replace(/\/+$/, "");
}

async function discover(baseUrl: string) {
    const resource = await fetchJson(`${baseUrl}/.well-known/oauth-protected-resource`);
    const authServer: string | undefined = resource.authorization_servers?.[0];
    if (!authServer) {
        throw new Error(`${baseUrl} does not advertise an authorization server.`);
    }
    const metadata = await fetchJson(`${requireSecure(authServer).toString().replace(/\/+$/, "")}/.well-known/oauth-authorization-server`);
    return {
        authorizationEndpoint: requireSecure(metadata.authorization_endpoint).toString(),
        tokenEndpoint: requireSecure(metadata.token_endpoint).toString(),
        scopes: (resource.scopes_supported ?? []) as string[],
    };
}

async function pickOrg(baseUrl: string, accessToken: string): Promise<string | undefined> {
    const { organizations = [] } = await fetchJson(`${baseUrl}/api/v1/orgs`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const orgs: string[] = organizations.map((org: { name: string }) => org.name);
    if (orgs.length === 0) {
        throw new Error("Your account has no Agent Manager organization. Open the Agent Manager console once to create one.");
    }
    return orgs.length === 1
        ? orgs[0]
        : vscode.window.showQuickPick(orgs, { title: "Select an Agent Manager organization", ignoreFocusOut: true });
}

function postToken(tokenEndpoint: string, body: Record<string, string>): Promise<TokenResponse> {
    return fetchJson(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
    });
}

export async function fetchJson<T = any>(url: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<T> {
    // Some gateways reject requests without a User-Agent.
    const response = await fetch(url, { ...init, headers: { "User-Agent": "wso2-integrator-vscode", Accept: "application/json", ...init.headers } });
    const text = await response.text();
    if (!response.ok) {
        let detail = text;
        try {
            detail = JSON.parse(text).message ?? text;
        } catch { /* plain-text error */ }
        throw new AgentManagerApiError(response.status, `${init.method ?? "GET"} ${url} failed (${response.status}): ${detail}`);
    }
    return text ? JSON.parse(text) : undefined;
}
