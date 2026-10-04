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
import { extension } from "../../../../BalExtensionContext";
import { McpOAuthConfig } from "./types";

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    token_type: string;
    expires_in?: number;
}

type CredentialScope = "all" | "client" | "tokens" | "verifier" | "discovery";

// Servers the user just added from a button click sign in without a second prompt.
const interactiveSignIns = new Set<string>();
// Agent Manager's IdP (SQLite-backed Thunder) fails concurrent authorization requests, so browser sign-ins run one at a time.
let signInQueue: Promise<unknown> = Promise.resolve();

export function signInOnNextConnect(url: string): void {
    interactiveSignIns.add(url);
}

export function takeInteractiveSignIn(url: string): boolean {
    return interactiveSignIns.delete(url);
}

/** A pre-registered public client with a pinned loopback redirect, as `claude mcp add --client-id --callback-port` uses. */
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

    async invalidateCredentials(scope: CredentialScope): Promise<void> {
        if (scope === "all" || scope === "tokens") {
            await extension.context.secrets.delete(this.secretKey);
        }
    }

    /** Opens the pending authorization URL and resolves with the code from the loopback redirect. */
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

/** Serves the loopback redirect, opens the browser, and resolves with the authorization code. */
function waitForAuthCode(port: number, state: string, authUrl: string, cancel: vscode.CancellationToken, service: string): Promise<string> {
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
        const cancelListener = cancel.onCancellationRequested(() => finish(new Error("Sign-in cancelled.")));
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

function callbackPage(service: string, error?: string): string {
    const title = error ? "Sign-in failed" : "You're signed in";
    const body = error
        ? `${escapeHtml(error)}<br>Return to VS Code and try again.`
        : `${escapeHtml(service)} is connected. You can close this tab and return to VS Code.`;
    const icon = error
        ? '<path d="M15 9l-6 6M9 9l6 6"/>'
        : '<path d="M8 12.5l2.5 2.5L16 9.5"/>';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
:root{--bg:#f3f3f3;--card:#fff;--fg:#1f1f1f;--muted:#616161;--border:#e0e0e0;--accent:${error ? "#c72e2e" : "#2e7d32"}}
@media (prefers-color-scheme:dark){:root{--bg:#1e1e1e;--card:#252526;--fg:#e6e6e6;--muted:#a0a0a0;--border:#3c3c3c;--accent:${error ? "#f14c4c" : "#4caf50"}}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:420px;margin:16px;padding:32px;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:10px}
svg{width:48px;height:48px;stroke:var(--accent);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
h1{font-size:20px;margin:12px 0 8px}p{margin:0;color:var(--muted)}
</style></head><body><main><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/>${icon}</svg><h1>${title}</h1><p>${body}</p></main></body></html>`;
}
