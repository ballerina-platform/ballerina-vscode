/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { URLSearchParams } from "url";
import { window, Uri, ProviderResult, commands } from "vscode";
import { BallerinaExtension } from "../core";
import { handleOpenFile, handleOpenRepo } from ".";
import { CMP_OPEN_VSCODE_URL, TM_EVENT_OPEN_FILE_URL_START, TM_EVENT_OPEN_REPO_URL_START, sendTelemetryEvent } from "../features/telemetry";
import { IOpenCompSrcCmdParams, WICommandIds } from "@wso2/wso2-platform-core";

// Why a flow ended — a denied consent and a silent timeout are both "no connection id".
export type ConnectionSettleReason =
    | "callback"    // redirected back with an id; the only success
    | "timeout"
    | "cancelled"   // user hit Cancel on the connection card
    | "denied"      // redirected back without an id
    | "superseded"; // a newer flow took the single pending slot

export interface ConnectionCallbackResult {
    connectionId: string | null; // non-null only when reason is "callback"
    reason: ConnectionSettleReason;
}

// Bridges the managed-connection browser round-trip back to the awaiting extension code:
// createManagedConnection awaits waitForConnectionCallback, and the redirect lands on the
// '/oauth-callback' route below.
interface PendingConnectionFlow {
    state: string;
    settle: (connectionId: string | null, reason: ConnectionSettleReason) => void;
}

let pendingConnectionFlow: PendingConnectionFlow | null = null;

// Per-flow nonce, carried on the redirect URI and matched on return. The '/oauth-callback'
// route is invocable by any local process, so without it a foreign or stale callback is
// consumed by whichever flow happens to be pending.
export function createConnectionState(): string {
    return crypto.randomBytes(16).toString("hex");
}

/** Releases a waiting caller immediately; any connection already created is left unused. */
export function cancelConnectionCallback(): void {
    pendingConnectionFlow?.settle(null, "cancelled");
}

export function waitForConnectionCallback(state: string, timeoutMs: number): Promise<ConnectionCallbackResult> {
    return new Promise((resolve) => {
        let timer: NodeJS.Timeout;
        const flow: PendingConnectionFlow = {
            state,
            settle: (connectionId, reason) => {
                clearTimeout(timer);
                // Only release the slot if this flow still owns it, so a late timer cannot
                // cancel a newer flow.
                if (pendingConnectionFlow === flow) {
                    pendingConnectionFlow = null;
                }
                resolve({ connectionId, reason });
            },
        };

        // Settle any superseded flow rather than orphaning it — its slot is gone, so nothing
        // could ever resolve it.
        pendingConnectionFlow?.settle(null, "superseded");

        timer = setTimeout(() => flow.settle(null, "timeout"), timeoutMs);
        pendingConnectionFlow = flow;
    });
}

export function activateUriHandlers(ballerinaExtInstance: BallerinaExtension) {
    window.registerUriHandler({
        handleUri(uri: Uri): ProviderResult<void> {
            const urlParams = new URLSearchParams(uri.query);
            switch (uri.path) {
                case '/open-file':
                    const gistId = urlParams.get('gist');
                    const fileName = urlParams.get('file');
                    const repoFileUrl = urlParams.get('repoFileUrl');
                    sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_FILE_URL_START, CMP_OPEN_VSCODE_URL);
                    if ((gistId && fileName) || repoFileUrl) {
                        handleOpenFile(ballerinaExtInstance, gistId, fileName, repoFileUrl);
                    } else {
                        window.showErrorMessage(`Gist or the file not found!`);
                    }
                    break;
                case '/open-repo':
                    const repoUrl = urlParams.get('repoUrl');
                    const openFile = urlParams.get('openFile');
                    sendTelemetryEvent(ballerinaExtInstance, TM_EVENT_OPEN_REPO_URL_START, CMP_OPEN_VSCODE_URL);
                    if (repoUrl) {
                        handleOpenRepo(ballerinaExtInstance, repoUrl, openFile);
                    } else {
                        window.showErrorMessage(`Repository url not found!`);
                    }
                    break;
                case '/signin':
                    // Legacy OAuth callback route - no longer used
                    // Authentication is now handled via Devant platform extension
                    console.log("Legacy /signin route called - authentication now uses Devant platform extension");
                    break;
                case '/oauth-callback': {
                    const connectionId = urlParams.get('connection_id');
                    if (!pendingConnectionFlow) {
                        console.warn("[ManagedConnection] callback received with no flow pending — ignoring.");
                        break;
                    }
                    if (urlParams.get('state') !== pendingConnectionFlow.state) {
                        console.warn("[ManagedConnection] callback state does not match the pending flow — ignoring.");
                        break;
                    }
                    if (!connectionId) {
                        // Right flow, no id — e.g. consent denied. Fail now rather than making
                        // the caller sit out the full timeout.
                        console.warn("[ManagedConnection] callback carried no connection_id — treating as a failed flow.");
                        pendingConnectionFlow.settle(null, "denied");
                        break;
                    }
                    pendingConnectionFlow.settle(connectionId, "callback");
                    break;
                }
                case '/open':
                    const org = urlParams.get("org");
                    const project = urlParams.get("project");
                    const component = urlParams.get("component");
                    const technology = urlParams.get("technology");
                    const integrationType = urlParams.get("integrationType");
                    const integrationDisplayType = urlParams.get("integrationDisplayType");
                    if (org && project && component && technology && integrationType) {
                        commands.executeCommand(WICommandIds.OpenCompSrcDir, {
                            org, project, component, technology, integrationType, integrationDisplayType, extName: "Devant"
                        } as IOpenCompSrcCmdParams);
                    } else {
                        window.showErrorMessage('Invalid component URL parameters');
                    }
                    break;

            }
        }
    });
}
