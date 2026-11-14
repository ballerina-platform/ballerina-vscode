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
import { type CloudEnvName, type CloudServiceRequest, isCloudError } from "@wso2/wso2-cloud-client";
import { readCloudEnvironment } from "@wso2/wso2-cloud-client/vscode";
import { WICommandIds } from "@wso2/wso2-platform-core";
import { connectPlatformAPI, onDidChangeCloudSessions } from "../../utils/cloud-auth";

interface OAuthClient {
    id: string;
    port: number;
    scopes: string[];
}

// Temporary: reuses amctl's OAuth client until Agent Builder is registered as a client in Agent Manager.
const SELF_HOSTED_CLIENT: OAuthClient = { id: "amctl", port: 10325, scopes: [] };
const redirectUri = (client: OAuthClient) => `http://127.0.0.1:${client.port}/callback`;
const SESSION_KEY = "ballerina.agentManager.session";
const DEFAULT_CONSOLE_URL = "http://console.amp.localhost:8080";
// Agent Manager on WSO2 Cloud sits behind the same gateway as the WSO2 Cloud API, under this path.
const CLOUD_API_PATH = "/agent-manager-service-agent-manager-api";
const CLOUD_CONSOLES: Partial<Record<CloudEnvName, string>> = {
    prod: "https://console.agent-manager.cloud.wso2.com",
    stage: "https://console.agent-manager.stg.cloud.wso2.com",
};

export interface AgentManagerSession {
    instanceUrl: string;
    consoleUrl: string;
    org: string;
    orgDisplayName?: string;
    /** The handle console URLs use, when it differs from the org name. */
    orgHandle?: string;
    /** A self-hosted instance's own sign-in; Agent Manager on WSO2 Cloud uses WSO2 Integrator's. */
    tokenEndpoint?: string;
    clientId?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
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

/** The self-hosted instance signed in to, which is used over WSO2 Cloud until it is signed out of. */
async function storedSession(): Promise<AgentManagerSession | undefined> {
    const raw = await extension.context.secrets.get(SESSION_KEY);
    const session: AgentManagerSession | undefined = raw ? JSON.parse(raw) : undefined;
    // Sessions saved before the console URL was asked for, and WSO2 Cloud ones from before WSO2 Integrator's sign-in was used, sign in again.
    return session?.consoleUrl && !isCloudSession(session) ? session : undefined;
}

export async function getSession(): Promise<AgentManagerSession | undefined> {
    return (await storedSession()) ?? cloudSession();
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
export async function getSessionSummary(): Promise<{ signedIn: boolean; instanceUrl?: string; org?: string; orgDisplayName?: string; cloud?: boolean }> {
    const session = await getSession();
    return session
        ? { signedIn: true, instanceUrl: session.instanceUrl, org: session.org, orgDisplayName: orgDisplayName(session), cloud: isCloudSession(session) }
        : { signedIn: false };
}

async function saveSession(session: AgentManagerSession): Promise<void> {
    await extension.context.secrets.store(SESSION_KEY, JSON.stringify(session));
}

/** Forgets the self-hosted session, so Agent Manager on WSO2 Cloud is used if WSO2 Integrator is signed in. */
export async function signOut(): Promise<void> {
    if (await extension.context.secrets.get(SESSION_KEY)) {
        await extension.context.secrets.delete(SESSION_KEY);
        sessionChanged.fire();
    }
}

/** Signs out of the Agent Manager in use: the self-hosted session, or the WSO2 Cloud sign-in shared with WSO2 Integrator. */
export async function signOutOfAgentManager(): Promise<void> {
    if (await storedSession()) {
        return signOut();
    }
    await (await wso2Cloud())?.signOut();
}

let cloudOrgs: { handle: string; org: Promise<Org | undefined> } | undefined;
let lastCloudOrg: string | undefined;
let watchingCloud = false;

// Agent Manager on WSO2 Cloud is called through WSO2 Integrator, which holds the WSO2 Cloud token.
async function wso2Cloud(askAccess = false) {
    if (!watchingCloud) {
        watchingCloud = true;
        extension.context.subscriptions.push(onDidChangeCloudSessions(() => {
            cloudOrgs = undefined;
            sessionChanged.fire();
        }));
    }
    return connectPlatformAPI(askAccess ? { askAccess } : { silent: true });
}

export async function cloudRequest<T>(method: CloudServiceRequest["method"], path: string, body?: unknown): Promise<T> {
    const api = await wso2Cloud();
    if (!api) {
        throw new AgentManagerApiError(401, "Sign in to WSO2 Cloud to use Agent Manager on it.");
    }
    try {
        return await api.request<T>({ service: "agent-manager", method, path, body });
    } catch (error) {
        throw isCloudError(error) ? new AgentManagerApiError(error.details.status ?? 0, error.message) : error;
    }
}

async function cloudSession(): Promise<AgentManagerSession | undefined> {
    const account = (await wso2Cloud())?.getAuthState().session;
    if (!account) {
        return undefined;
    }
    if (cloudOrgs?.handle !== account.org.handle) {
        cloudOrgs = { handle: account.org.handle, org: cloudOrg(account.org.handle) };
    }
    const lookup = cloudOrgs;
    const org = await lookup.org.catch((): undefined => {
        // A lookup that failed, say while WSO2 Integrator refreshed its token, is tried again on the next read.
        if (cloudOrgs === lookup) {
            cloudOrgs = undefined;
        }
        return undefined;
    });
    if (org?.name !== lastCloudOrg) {
        // The views only re-read the session on this event, so one read that found it signed out must not stick.
        lastCloudOrg = org?.name;
        sessionChanged.fire();
    }
    const { consoleUrl, instanceUrl } = cloudInstance();
    return org && { instanceUrl, consoleUrl, org: org.name, orgHandle: org.handle ?? account.org.handle, orgDisplayName: org.displayName || account.org.name };
}

// Agent Manager names the signed-in WSO2 Cloud organization by its own name, which can differ from the handle.
async function cloudOrg(handle: string): Promise<Org | undefined> {
    const { organizations = [] } = await cloudRequest<{ organizations?: Org[] }>("GET", "/orgs");
    return organizations.find((org) => org.handle === handle || org.name === handle) ?? (organizations.length === 1 ? organizations[0] : undefined);
}

// Uses WSO2 Integrator's sign-in, and leaves any self-hosted instance.
async function signInCloud(): Promise<AgentManagerSession | undefined> {
    let api = await wso2Cloud(true);
    if (!api) {
        await vscode.commands.executeCommand(WICommandIds.SignIn);
        api = await wso2Cloud(true);
    } else if (!(await cloudSession())) {
        // A WSO2 Cloud sign-in made before Agent Builder called Agent Manager with it has none of Agent Manager's scopes.
        await api.signIn();
    }
    if (!api) {
        return undefined;
    }
    await extension.context.secrets.delete(SESSION_KEY);
    cloudOrgs = undefined;
    const session = await cloudSession();
    sessionChanged.fire();
    if (!session) {
        // Says why Agent Manager could not be reached instead of reporting a cancelled sign-in.
        await cloudOrgs?.org;
    }
    return session;
}

let refreshing: Promise<string | undefined> | undefined;

export async function getAccessToken(): Promise<string | undefined> {
    const session = await storedSession();
    if (!session?.accessToken) {
        return undefined;
    }
    if ((session.expiresAt ?? 0) - 60_000 > Date.now()) {
        return session.accessToken;
    }
    // Status polls call this in parallel; one refresh keeps a rotated refresh token from being reused.
    refreshing ??= refresh(session).finally(() => {
        refreshing = undefined;
    });
    return refreshing;
}

async function refresh(session: AgentManagerSession): Promise<string | undefined> {
    if (!session.refreshToken || !session.tokenEndpoint) {
        await signOut();
        return undefined;
    }
    try {
        const token = await postToken(session.tokenEndpoint, {
            grant_type: "refresh_token",
            refresh_token: session.refreshToken,
            client_id: session.clientId ?? SELF_HOSTED_CLIENT.id,
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

export const isCloudSession = (session: { instanceUrl: string }) => new URL(session.instanceUrl).pathname.startsWith(CLOUD_API_PATH);

export const agentManagerCloudConsoleUrl = () => cloudInstance().consoleUrl;

// The WSO2 Cloud environment and OAuth client WSO2 Integrator signs in with decide which Agent Manager on WSO2 Cloud is used.
function cloudInstance() {
    const environment = readCloudEnvironment();
    return { consoleUrl: CLOUD_CONSOLES[environment.name] ?? `${environment.consoleUrl}/agent-management`, instanceUrl: new URL(environment.apiBaseUrl).origin + CLOUD_API_PATH };
}

export async function signIn(cloud = false): Promise<AgentManagerSession | undefined> {
    if (cloud) {
        return signInCloud();
    }
    const previous = await storedSession();
    const instance = await askInstance(previous?.consoleUrl);
    if (!instance) {
        return undefined;
    }
    const { consoleUrl, instanceUrl: baseUrl } = instance;
    const client = SELF_HOSTED_CLIENT;
    const discovery = await discover(baseUrl);
    const verifier = crypto.randomBytes(32).toString("base64url");
    const state = crypto.randomBytes(32).toString("base64url");
    const authUrl = new URL(discovery.authorizationEndpoint);
    authUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: client.id,
        redirect_uri: redirectUri(client),
        scope: [...client.scopes, ...discovery.scopes].join(" "),
        state,
        code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
    }).toString();

    const code = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "Signing in to Agent Manager in your browser...", cancellable: true },
        (_progress, cancel) => waitForAuthCode(client.port, state, authUrl.toString(), cancel, "Agent Manager")
    );
    const token = await postToken(discovery.tokenEndpoint, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(client),
        client_id: client.id,
        code_verifier: verifier,
    });
    const org = await pickOrg(baseUrl, token.access_token);
    if (!org) {
        return undefined;
    }
    const session: AgentManagerSession = {
        instanceUrl: baseUrl,
        consoleUrl,
        org: org.name,
        orgDisplayName: org.displayName || tokenClaims(token.access_token).ouName || org.handle,
        orgHandle: org.handle,
        tokenEndpoint: discovery.tokenEndpoint,
        clientId: client.id,
        ...toSessionTokens(token),
    };
    await saveSession(session);
    sessionChanged.fire();
    return session;
}

// Sessions saved before the token's organization name was read have none stored.
export const orgDisplayName = (session: AgentManagerSession) => session.orgDisplayName || (session.accessToken ? tokenClaims(session.accessToken).ouName : undefined);

// WSO2 Cloud's IdP names the organization in the access token, which Agent Manager may leave unnamed.
function tokenClaims(accessToken: string): { ouName?: string } {
    try {
        return JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString());
    } catch {
        return {};
    }
}

function toSessionTokens(token: TokenResponse, previousRefresh?: string) {
    return {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? previousRefresh,
        expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    };
}

// Tokens travel to these hosts, so plain HTTP is only allowed for a local instance.
export function requireSecure(url: string): URL {
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

interface Org {
    name: string;
    displayName?: string;
    handle?: string;
}

async function pickOrg(baseUrl: string, accessToken: string): Promise<Org | undefined> {
    const { organizations = [] } = await fetchJson<{ organizations?: Org[] }>(`${baseUrl}/api/v1/orgs`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (organizations.length === 0) {
        throw new Error("Your account has no Agent Manager organization. Open the Agent Manager console once to create one.");
    }
    if (organizations.length === 1) {
        return organizations[0];
    }
    const picked = await vscode.window.showQuickPick(
        organizations.map((org) => ({ label: org.displayName || org.name, org })),
        { title: "Select an Agent Manager organization", ignoreFocusOut: true },
    );
    return picked?.org;
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
