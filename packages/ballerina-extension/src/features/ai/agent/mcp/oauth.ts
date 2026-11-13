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
import * as http from "http";
import * as vscode from "vscode";
import { productName } from "@wso2/ballerina-core";
import { renderSignInPage } from "@wso2/wso2-cloud-client";
import { extension } from "../../../../BalExtensionContext";
import { getProductMode } from "../../../../utils/config";
import { McpOAuthConfig } from "./types";

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in?: number;
}

// Servers the user just added from a button click sign in without a second prompt.
const interactiveSignIns = new Set<string>();
// Agent Manager's IdP (SQLite-backed Thunder) fails concurrent authorization requests, so browser sign-ins run one at a time.
let signInQueue: Promise<unknown> = Promise.resolve();

export class SignInCancelled extends Error {
    constructor() {
        super("Sign-in cancelled.");
    }
}

const tokensKey = (serverUrl: string, oauth: McpOAuthConfig) => `ballerina.copilot.mcp.oauth:${oauth.clientId}@${serverUrl}`;

export async function forgetTokens(serverUrl: string, oauth: McpOAuthConfig): Promise<void> {
    await extension.context.secrets.delete(tokensKey(serverUrl, oauth));
}

export function signInOnNextConnect(url: string): void {
    interactiveSignIns.add(url);
}

export function takeInteractiveSignIn(url: string): boolean {
    return interactiveSignIns.delete(url);
}

// A pre-registered public client with a pinned loopback redirect, so no dynamic client registration.
export class McpOAuthProvider {
    authorizationUrl?: URL;
    private verifier = "";
    private readonly secretKey: string;

    constructor(serverUrl: string, private readonly oauth: McpOAuthConfig) {
        this.secretKey = tokensKey(serverUrl, oauth);
    }

    get redirectUrl(): string {
        return `http://127.0.0.1:${this.oauth.callbackPort}/callback`;
    }

    get clientMetadata() {
        return {
            client_name: "WSO2 Integrator Copilot",
            redirect_uris: [this.redirectUrl],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
        };
    }

    // A fresh value per authorization request; signIn checks the one carried in that request's URL.
    state(): string {
        return crypto.randomBytes(24).toString("base64url");
    }

    clientInformation() {
        return { client_id: this.oauth.clientId };
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        const raw = await extension.context.secrets.get(this.secretKey);
        return raw ? JSON.parse(raw) : undefined;
    }

    async saveTokens(tokens: OAuthTokens): Promise<void> {
        await extension.context.secrets.store(this.secretKey, JSON.stringify(tokens));
    }

    // Connects run in the background, so the browser only opens from signIn().
    redirectToAuthorization(authorizationUrl: URL): void {
        this.authorizationUrl = authorizationUrl;
    }

    saveCodeVerifier(codeVerifier: string): void {
        this.verifier = codeVerifier;
    }

    codeVerifier(): string {
        return this.verifier;
    }

    async invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): Promise<void> {
        if (scope === "all" || scope === "tokens") {
            await extension.context.secrets.delete(this.secretKey);
        }
    }

    async signIn(serverName: string): Promise<string> {
        const authUrl = this.authorizationUrl;
        const expectedState = authUrl?.searchParams.get("state");
        if (!authUrl || !expectedState) {
            throw new Error(`MCP server '${serverName}' has no pending sign-in.`);
        }
        const run = signInQueue.then(() => vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Signing in to MCP server '${serverName}' in your browser...`, cancellable: true },
            (_progress, cancel) => waitForAuthCode(this.oauth.callbackPort, expectedState, authUrl.toString(), cancel, `MCP server '${serverName}'`)
        ));
        signInQueue = run.catch(() => undefined);
        return run;
    }
}

export function waitForAuthCode(port: number, state: string, authUrl: string, cancel: vscode.CancellationToken, service: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
            if (url.pathname !== "/callback") {
                res.writeHead(404).end();
                return;
            }
            const code = url.searchParams.get("code");
            const ok = !!code && url.searchParams.get("state") === state;
            const error = ok ? undefined : url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Sign-in failed.";
            res.writeHead(ok ? 200 : 400, {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
            });
            res.end(renderSignInPage({ service, error }, productName(getProductMode())));
            finish(error === undefined ? undefined : new Error(error), code ?? "");
        });
        const timer = setTimeout(() => finish(new Error("Sign-in timed out.")), SIGN_IN_TIMEOUT_MS);
        const cancelListener = cancel.onCancellationRequested(() => finish(new SignInCancelled()));
        function finish(error?: Error, code?: string) {
            clearTimeout(timer);
            cancelListener.dispose();
            server.close();
            error ? reject(error) : resolve(code!);
        }
        server.on("error", (err: NodeJS.ErrnoException) => finish(err.code === "EADDRINUSE"
            ? new Error(`Port ${port} is in use, likely by another sign-in. Try again when it finishes.`)
            : err));
        server.listen(port, "127.0.0.1", () => vscode.env.openExternal(vscode.Uri.parse(authUrl)));
    });
}
