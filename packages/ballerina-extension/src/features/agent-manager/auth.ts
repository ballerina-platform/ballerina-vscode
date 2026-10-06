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
const DEFAULT_INSTANCE_URL = "http://api.amp.localhost:8080";

export interface AgentManagerSession {
    instanceUrl: string;
    org: string;
    tokenEndpoint: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}

class TokenRejected extends Error { }

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

export async function getSession(): Promise<AgentManagerSession | undefined> {
    const raw = await extension.context.secrets.get(SESSION_KEY);
    return raw ? JSON.parse(raw) : undefined;
}

const sessionChanged = new vscode.EventEmitter<void>();
/** Fires on sign-in and on every sign-out, including the ones a rejected token forces. */
export const onDidChangeSession = sessionChanged.event;

/** What webviews may know about the session; tokens never leave the extension. */
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

/** Whether the signed-in user's token carries an Agent Manager permission, such as "agent:create". */
export async function hasPermission(permission: string): Promise<boolean> {
    const payload = (await getAccessToken())?.split(".")[1];
    try {
        const scopes = String(JSON.parse(Buffer.from(payload ?? "", "base64url").toString()).scope ?? "").split(" ");
        return scopes.includes(`amp:${permission}`);
    } catch {
        return false;
    }
}

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
        if (!(error instanceof TokenRejected)) {
            throw error;
        }
        await signOut();
        return undefined;
    }
}

export async function signIn(): Promise<AgentManagerSession | undefined> {
    const previous = await getSession();
    const instanceUrl = await vscode.window.showInputBox({
        title: "Connect to Agent Manager",
        prompt: "Agent Manager API URL",
        value: previous?.instanceUrl ?? DEFAULT_INSTANCE_URL,
        ignoreFocusOut: true,
    });
    if (!instanceUrl) {
        return undefined;
    }
    const baseUrl = instanceUrl.replace(/\/+$/, "");
    const discovery = await discover(baseUrl);
    const verifier = base64Url(crypto.randomBytes(32));
    const state = base64Url(crypto.randomBytes(32));
    const authUrl = new URL(discovery.authorizationEndpoint);
    authUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: discovery.scopes.join(" "),
        state,
        code_challenge: base64Url(crypto.createHash("sha256").update(verifier).digest()),
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

async function discover(baseUrl: string) {
    const resource = await getJson(`${baseUrl}/.well-known/oauth-protected-resource`);
    const authServer: string | undefined = resource.authorization_servers?.[0];
    if (!authServer) {
        throw new Error(`${baseUrl} does not advertise an authorization server.`);
    }
    const metadata = await getJson(`${authServer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`);
    return {
        authorizationEndpoint: metadata.authorization_endpoint as string,
        tokenEndpoint: metadata.token_endpoint as string,
        scopes: (resource.scopes_supported ?? []) as string[],
    };
}

async function pickOrg(baseUrl: string, accessToken: string): Promise<string | undefined> {
    const response = await httpRequest(`${baseUrl}/api/v1/orgs`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
        throw new Error(`Agent Manager rejected the sign-in (${response.status}): ${response.text.slice(0, 200) || "(empty body)"}.`);
    }
    const orgs: string[] = (parseJson(`${baseUrl}/api/v1/orgs`, response.text).organizations ?? []).map((org: { name: string }) => org.name);
    if (orgs.length === 0) {
        throw new Error("Your account has no Agent Manager organization. Open the Agent Manager console once to create one.");
    }
    return orgs.length === 1
        ? orgs[0]
        : vscode.window.showQuickPick(orgs, { title: "Select an Agent Manager organization", ignoreFocusOut: true });
}

async function postToken(tokenEndpoint: string, body: Record<string, string>): Promise<TokenResponse> {
    const response = await httpRequest(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(body).toString(),
    });
    if (!response.ok) {
        throw new TokenRejected(`Token request failed (${response.status}): ${response.text}`);
    }
    return parseJson(tokenEndpoint, response.text) as TokenResponse;
}

export async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    const response = await httpRequest(url, { headers: { Accept: "application/json", ...headers } });
    if (!response.ok) {
        throw new Error(`GET ${url} failed (${response.status}).`);
    }
    return parseJson(url, response.text);
}

export function parseJson(url: string, text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Unexpected response from ${url}: ${text.slice(0, 200) || "(empty body)"}`);
    }
}

export interface HttpResponse {
    ok: boolean;
    status: number;
    text: string;
}

export async function httpRequest(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<HttpResponse> {
    try {
        // Some gateways reject requests without a User-Agent.
        const response = await fetch(url, { ...init, headers: { "User-Agent": "wso2-integrator-vscode", ...init.headers } });
        return { ok: response.ok, status: response.status, text: await response.text() };
    } catch (error) {
        const host = new URL(url).hostname;
        if (host.endsWith(".localhost") && (error as { cause?: { code?: string } }).cause?.code === "ENOTFOUND") {
            throw new Error(`Cannot resolve ${host}. Add "127.0.0.1 ${host}" to your hosts file.`);
        }
        throw error;
    }
}

function base64Url(buffer: Buffer): string {
    return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
