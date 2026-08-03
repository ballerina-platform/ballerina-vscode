/* eslint-disable @typescript-eslint/no-explicit-any */

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

import { createExtensionTransportManager, createRequestRouter } from "@wso2/webview-giga-bridge";
import { randomBytes } from "crypto";
import { Disposable, WebviewPanel } from "vscode";
import { extension } from "../BalExtensionContext";
import {
    isAIAuthenticated,
    onWizardChatNotify,
    signInForAI,
    signInWithAnthropicKey,
    signInWithAwsBedrock,
    signInWithVertexAI,
} from "../features/ai/migration/orchestrator";
import { CommonRpcManager } from "../rpc-managers/common/rpc-manager";
import { LangClientRpcManager } from "../rpc-managers/lang-client/rpc-manager";
import { MigrateIntegrationRpcManager } from "../rpc-managers/migrate-integration/rpc-manager";
import { createBIProject, getDefaultCreationPath, validateProjectPath } from "../utils/bi";
import { onMigratedProjectEvent, onMigrationToolLogEvent, onMigrationToolStateEvent } from "../features/ai/migration/migrationEvents";
// Shared wire contract — single source of truth for both this server and the
// webview client (`ballerina-visualizer` `BiWsClient`).
import { WEBVIEW_WS_EVENTS, WebviewWsRequest, WebviewWsResponse, WebviewWsBootstrap } from "@wso2/ballerina-core";

export type { WebviewWsBootstrap };

type TransportManager = ReturnType<typeof createExtensionTransportManager<WebviewWsRequest, WebviewWsResponse>>;

/**
 * The future webview-communication layer for the BI "migrated forms" (project
 * creation + import-integration wizard). Built on the shared
 * `@wso2/webview-giga-bridge`, mirroring the WSO2 Integrator's `BridgeLayer`.
 *
 * One router of action handlers (calling the underlying business logic directly,
 * NOT the vscode-messenger RPC handlers) is served over TWO transports:
 *  - **proxy** — wired to the Ballerina visualizer webview panel (postMessage),
 *    so the standalone visualizer's migrated forms use this bridge; and
 *  - **websocket** — an OS-allocated, token-gated socket the embedded integrator
 *    webview connects to.
 *
 * Streaming events (download progress, migration tool state/logs, migrated
 * project, AI chat) are published to both transports.
 */
export class DefaultServer {
    private static instance: DefaultServer | undefined;

    private readonly token = randomBytes(32).toString("hex");
    private readonly router = createRequestRouter<WebviewWsRequest, WebviewWsResponse>();
    private proxyManager: TransportManager | undefined;
    private wsManager: TransportManager | undefined;
    /** In-flight or completed bootstrap. Cached as a promise so that concurrent
     *  callers share one server instead of racing to create two. */
    private wsBootstrap: Promise<WebviewWsBootstrap> | undefined;
    private readonly disposables: Disposable[] = [];
    private eventsWired = false;

    private constructor() {
        this.registerHandlers();
    }

    static getInstance(): DefaultServer {
        if (!DefaultServer.instance) {
            DefaultServer.instance = new DefaultServer();
        }
        return DefaultServer.instance;
    }

    /** Attaches the Ballerina visualizer webview panel for proxy (standalone) mode. */
    registerVisualizerPanel(panel: WebviewPanel): Disposable {
        const mgr = this.ensureProxyManager();
        this.wireEvents();
        return mgr.registerWebviewPanel(panel as any);
    }

    /** Starts (if needed) the websocket server for the embedded integrator form
     *  and returns the connection coordinates. */
    getWsBootstrap(): Promise<WebviewWsBootstrap> {
        if (!this.wsBootstrap) {
            this.wsBootstrap = this.startWsServer().catch((error: unknown) => {
                // Let a later call retry instead of caching the failure forever.
                this.wsManager?.dispose();
                this.wsBootstrap = undefined;
                this.wsManager = undefined;
                throw error;
            });
        }
        return this.wsBootstrap;
    }

    private async startWsServer(): Promise<WebviewWsBootstrap> {
        const mgr = createExtensionTransportManager<WebviewWsRequest, WebviewWsResponse>({
            initialMode: "websocket",
            wsPort: 0,
            // Authenticates the handshake; upgrades without this token are refused.
            authToken: this.token,
            handleRequest: (request) => this.router.handle(request),
        });
        this.wsManager = mgr;
        this.wireEvents();
        // The OS assigns the port, which is only known once the server is bound,
        // so the bootstrap must not be read before this resolves.
        await mgr.startWebSocketServer();
        const wb = mgr.getWebviewBootstrap();
        return { host: wb.wsServer, port: wb.wsPort, token: this.token };
    }

    dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.disposables.length = 0;
        this.proxyManager?.dispose();
        this.wsManager?.dispose();
        this.proxyManager = undefined;
        this.wsManager = undefined;
        this.wsBootstrap = undefined;
        DefaultServer.instance = undefined;
    }

    private ensureProxyManager(): TransportManager {
        if (!this.proxyManager) {
            this.proxyManager = createExtensionTransportManager<WebviewWsRequest, WebviewWsResponse>({
                initialMode: "proxy",
                wsPort: 0,
                // Proxy is in-process to the trusted visualizer webview — no token gate.
                handleRequest: (request) => this.router.handle(request),
            });
        }
        return this.proxyManager;
    }

    /** Pushes a streaming event to every active transport. */
    private publishEvent(message: WebviewWsResponse): void {
        this.proxyManager?.publish(message);
        this.wsManager?.publish(message);
    }

    /** Subscribes to the extension's migration/download/chat event sources once. */
    private wireEvents(): void {
        if (this.eventsWired) {
            return;
        }
        this.eventsWired = true;
        this.disposables.push(
            extension.ballerinaExtInstance.onDownloadProgress((progress) =>
                this.publishEvent({ type: WEBVIEW_WS_EVENTS.DOWNLOAD_PROGRESS, progress }),
            ),
            onMigrationToolStateEvent((state) =>
                this.publishEvent({ type: WEBVIEW_WS_EVENTS.MIGRATION_TOOL_STATE_CHANGED, state }),
            ),
            onMigrationToolLogEvent((log) =>
                this.publishEvent({ type: WEBVIEW_WS_EVENTS.MIGRATION_TOOL_LOGS, log }),
            ),
            onMigratedProjectEvent((project) =>
                this.publishEvent({ type: WEBVIEW_WS_EVENTS.MIGRATED_PROJECT, project }),
            ),
            onWizardChatNotify((event) =>
                this.publishEvent({ type: WEBVIEW_WS_EVENTS.CHAT_NOTIFY, event }),
            ),
        );
    }

    private successResponse(action: string, result: unknown): WebviewWsResponse {
        return { type: WEBVIEW_WS_EVENTS.WS_RESPONSE, action, success: true, result: result ?? null };
    }

    private errorResponse(action: string, error: string): WebviewWsResponse {
        return { type: WEBVIEW_WS_EVENTS.WS_RESPONSE, action, success: false, error };
    }

    private register(action: string, handler: (params: any) => unknown | Promise<unknown>): void {
        this.router.register(action, async (request) => {
            try {
                return this.successResponse(action, await handler(request.params));
            } catch (error) {
                return this.errorResponse(action, error instanceof Error ? error.message : "BI bridge handler failed.");
            }
        });
    }

    private registerHandlers(): void {
        const common = new CommonRpcManager();
        const langClient = new LangClientRpcManager();
        const migrate = MigrateIntegrationRpcManager.getInstance();

        // ── Project creation ──────────────────────────────────
        this.register("createBIProject", (p) => createBIProject(p));
        this.register("validateProjectPath", (p) =>
            validateProjectPath(p.projectPath, p.projectName, p.createDirectory, p.createAsWorkspace),
        );
        this.register("selectFileOrDirPath", (p) => common.selectFileOrDirPath(p));
        this.register("selectFileOrFolderPath", () => common.selectFileOrFolderPath());
        this.register("getWorkspaceRoot", () => common.getWorkspaceRoot());
        this.register("getDefaultOrgName", () => common.getDefaultOrgName());
        this.register("getDefaultCreationPath", () => ({ path: getDefaultCreationPath() }));
        this.register("isSupportedSLVersion", (p) => langClient.isSupportedSLVersion(p));
        this.register("showErrorMessage", (p) => common.showErrorMessage(p));

        // ── Import / migration ────────────────────────────────
        this.register("getMigrationTools", () => migrate.getMigrationTools());
        this.register("pullMigrationTool", (p) => migrate.pullMigrationTool(p));
        this.register("importIntegration", (p) => migrate.importIntegration(p));
        this.register("migrateProject", (p) => migrate.migrateProject(p));
        this.register("saveMigrationReport", (p) => migrate.saveMigrationReport(p));
        this.register("openMigrationReport", (p) => migrate.openMigrationReport(p));
        this.register("storeSubProjectReports", (p) => migrate.storeSubProjectReports(p));
        this.register("openSubProjectReport", (p) => migrate.openSubProjectReport(p));
        this.register("wizardEnhancementReady", () => migrate.wizardEnhancementReady());
        this.register("openMigratedProject", () => migrate.openMigratedProjectInVSCode());
        this.register("abortMigrationAgent", () => migrate.abortMigrationAgent());

        // ── AI enhancement auth (orchestrator functions, called directly) ──
        this.register("checkAIAuth", () => isAIAuthenticated());
        this.register("triggerAICopilotSignIn", () => signInForAI());
        this.register("triggerAnthropicKeySignIn", (p) => signInWithAnthropicKey(p.apiKey));
        this.register("triggerAwsBedrockSignIn", (p) => signInWithAwsBedrock(p));
        this.register("triggerVertexAiSignIn", (p) => signInWithVertexAI(p));
    }
}
