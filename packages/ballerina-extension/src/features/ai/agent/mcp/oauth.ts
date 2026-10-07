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
    private readonly expectedState = crypto.randomBytes(24).toString("base64url");
    private readonly secretKey: string;

    constructor(serverUrl: string, private readonly oauth: McpOAuthConfig) {
        this.secretKey = `ballerina.copilot.mcp.oauth:${oauth.clientId}@${serverUrl}`;
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

    state(): string {
        return this.expectedState;
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
        if (!authUrl) {
            throw new Error(`MCP server '${serverName}' has no pending sign-in.`);
        }
        const run = signInQueue.then(() => vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Signing in to MCP server '${serverName}' in your browser...`, cancellable: true },
            (_progress, cancel) => waitForAuthCode(this.oauth.callbackPort, this.expectedState, authUrl.toString(), cancel, `MCP server '${serverName}'`)
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
            res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" });
            res.end(callbackPage(service, error));
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

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// Follows the Agent Manager console's Acrylic Orange theme, as amctl's own sign-in page does.
function callbackPage(service: string, error?: string): string {
    const title = error ? "Sign-in failed" : "You're signed in";
    const message = error ? escapeHtml(error) : `${escapeHtml(service)} is connected. You can close this tab.`;
    const glyph = error ? '<path d="M18 6 6 18M6 6l12 12"/>' : '<path d="M20 6 9 17l-5-5"/>';
    const appName = productName(getProductMode());
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
:root{color-scheme:light dark}*{margin:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Inter Variable',Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background-color:#f5f5f5;color:#40404b;background-image:radial-gradient(circle at 65% 30%,rgba(255,116,0,.10) 10%,rgba(255,255,255,0) 40%),radial-gradient(circle at 15% 50%,rgba(74,41,165,.10) 1%,rgba(255,255,255,0) 40%);background-attachment:fixed}
main{background:rgba(255,255,255,.77);border:1px solid rgba(0,0,0,.07);border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.06);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);padding:48px 56px;margin:16px;text-align:center;max-width:420px}
.icon{width:56px;height:56px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px;color:#fff;background:${error ? "#d3302f" : "linear-gradient(90deg,#f47b20 0%,#ef4223 100%)"}}
.icon svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
h1{font-size:1.25rem;font-weight:600;margin-bottom:8px}p{font-size:.875rem;color:#6b6b76;line-height:1.5;overflow-wrap:break-word}
a{display:inline-block;margin-top:24px;padding:8px 20px;border-radius:6px;color:#fff;background:linear-gradient(90deg,#f47b20 0%,#ef4223 100%);font-size:.875rem;font-weight:500;text-decoration:none}
@media (prefers-color-scheme:dark){body{background-color:#000;color:#efefef;background-image:radial-gradient(circle at 65% 30%,rgba(255,116,0,.13) 10%,rgba(0,0,0,0) 60%),radial-gradient(circle at 15% 50%,rgba(132,40,0,.18) 1%,rgba(0,0,0,0) 40%)}main{background:rgba(0,0,0,.77);border-color:rgba(255,255,255,.09)}p{color:#d0d3e2}}
</style></head><body><main><div class="icon"><svg viewBox="0 0 24 24">${glyph}</svg></div><h1>${title}</h1><p>${message}</p><a href="${vscode.env.uriScheme}://">${error ? `Return to ${appName}` : `Open ${appName}`}</a></main></body></html>`;
}
