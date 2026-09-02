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

import {
    AddIntegrationArtifactRequest,
    BINodeTemplateRequest,
    BINodeTemplateResponse,
    ChatNotify,
    CreateIntegrationRequest,
    DownloadProgress,
    ExpressionDiagnosticsRequest,
    ExpressionDiagnosticsResponse,
    GetMigrationToolsResponse,
    ImportIntegrationResponse,
    ImportIntegrationRPCRequest,
    MigrateRequest,
    MigrationToolPullRequest,
    OpenMigrationReportRequest,
    OpenSubProjectReportRequest,
    ProjectFileRequest,
    ProjectFileResponse,
    ProjectMigrationResult,
    SaveMigrationReportRequest,
    ScaffoldIntegrationProjectResponse,
    ServiceModelInitResponse,
    ServiceModelRequest,
    StoreSubProjectReportsRequest,
    TriggerModelsRequest,
    TriggerModelsResponse,
    ValidateProjectFormRequest,
    ValidateProjectFormResponse,
    WizardCapabilitiesResponse,
    WizardFormTargetRequest,
    WizardFormTargetResponse,
    WorkspaceSupportResponse,
} from "@wso2/ballerina-core";
import { ConnectionStatus, createWebviewTransportAdapter } from "@wso2/webview-giga-bridge/webview";
import { WEBVIEW_WS_EVENTS, WebviewWsRequest, WebviewWsResponse, WebviewTransportBootstrap, SignInResult } from "@wso2/ballerina-core";

declare global {
    interface Window {
        /** Injected by the host to force websocket mode + coords when the form is
         *  embedded outside the Ballerina visualizer (e.g. the integrator webview). */
        __BI_BRIDGE_BOOTSTRAP?: WebviewTransportBootstrap;
    }
}

const DEFAULT_WS_SERVER = "127.0.0.1";
const DEFAULT_WS_PORT = 8787;

/**
 * Resolves the bridge transport. An explicitly-injected bootstrap always wins
 * (the integrator embed injects `{ mode: 'websocket', ... }`). Otherwise, when a
 * VS Code webview API is present we are inside the Ballerina visualizer and use
 * `proxy` (postMessage) mode; failing that, websocket.
 */
export function resolveBiBridgeBootstrap(): WebviewTransportBootstrap {
    const injected = window.__BI_BRIDGE_BOOTSTRAP;
    if (injected?.mode) {
        return {
            mode: injected.mode,
            wsServer: injected.wsServer ?? DEFAULT_WS_SERVER,
            wsPort: injected.wsPort ?? DEFAULT_WS_PORT,
            token: injected.token,
        };
    }
    const hasVsCodeApi = typeof (globalThis as { acquireVsCodeApi?: unknown }).acquireVsCodeApi === "function";
    return {
        mode: hasVsCodeApi ? "proxy" : "websocket",
        wsServer: DEFAULT_WS_SERVER,
        wsPort: DEFAULT_WS_PORT,
    };
}

/**
 * Returns the VS Code webview API, reusing the single instance shared across this
 * page rather than calling `acquireVsCodeApi()` again.
 *
 * The API can only be acquired ONCE per webview. In the native visualizer the main
 * RPC client (via ballerina-core's `vscode` singleton) has already acquired it and
 * cached it on `globalThis.__ballerinaVsCodeApi`; the giga-bridge transport would
 * otherwise call the raw `acquireVsCodeApi()` a second time and throw
 * "An instance of the VS Code API has already been acquired", blocking proxy mode.
 * We hand the transport this resolver so it reuses the shared handle (and populates
 * it if we happen to be first), keeping the singleton mutually compatible.
 */
function resolveSharedVsCodeApi(): unknown {
    const g = globalThis as {
        __ballerinaVsCodeApi?: unknown;
        acquireVsCodeApi?: () => unknown;
    };
    if (g.__ballerinaVsCodeApi) {
        return g.__ballerinaVsCodeApi;
    }
    if (typeof g.acquireVsCodeApi === "function") {
        try {
            const api = g.acquireVsCodeApi();
            if (api) {
                g.__ballerinaVsCodeApi = api;
            }
            return api;
        } catch {
            // Already acquired elsewhere without sharing — nothing more we can do.
            return undefined;
        }
    }
    return undefined;
}

/**
 * The migrated-forms WS manager client. One flat client over the shared
 * giga-bridge transport, mirroring the integrator's `WsClient`: project-creation
 * + import-migration request/notify methods plus the streaming subscriptions the
 * import wizard needs. Works unchanged in proxy and websocket modes.
 */
export class BiWsClient {
    private readonly bootstrap: WebviewTransportBootstrap;
    private readonly transport: ReturnType<typeof createWebviewTransportAdapter<WebviewWsRequest, WebviewWsResponse>>;

    private readonly downloadProgressListeners = new Set<(progress: DownloadProgress) => void>();
    private readonly migrationToolStateListeners = new Set<(state: string) => void>();
    private readonly migrationToolLogListeners = new Set<(log: string) => void>();
    private readonly migratedProjectListeners = new Set<(result: ProjectMigrationResult) => void>();
    private readonly chatNotifyListeners = new Set<(event: ChatNotify) => void>();

    constructor(bootstrap: WebviewTransportBootstrap = resolveBiBridgeBootstrap()) {
        this.bootstrap = bootstrap;
        this.transport = createWebviewTransportAdapter<WebviewWsRequest, WebviewWsResponse>({
            mode: bootstrap.mode,
            server: bootstrap.wsServer,
            port: bootstrap.wsPort,
            // Presented during the websocket handshake; the host rejects the
            // upgrade without it. Ignored in proxy mode, which does not use a
            // socket.
            token: bootstrap.token,
            // Reuse the already-acquired VS Code API instead of re-acquiring (which
            // throws in the native visualizer, where the main RPC client owns it).
            acquireVsCodeApi: resolveSharedVsCodeApi as () => any,
        });
        this.transport.subscribe(
            (message) => this.handleIncomingMessage(message),
            (status) => this.handleConnectionStatus(status),
        );
    }

    // ── Project creation ──────────────────────────────────────
    public createBIProject(params: any): Promise<void> {
        return this.request("createBIProject", params);
    }

    public validateProjectPath(params: ValidateProjectFormRequest): Promise<ValidateProjectFormResponse> {
        return this.request("validateProjectPath", params);
    }

    public getProjectComponentNames(params: { projectPath: string }): Promise<{ folders: string[]; titles: string[] }> {
        return this.request("getProjectComponentNames", params);
    }

    public getExistingProjectInfo(
        params: { projectPath: string }
    ): Promise<{ isProject?: boolean; name?: string } | null> {
        return this.request("getExistingProjectInfo", params);
    }

    public selectFileOrDirPath(params: any): Promise<any> {
        return this.request("selectFileOrDirPath", params);
    }

    public selectProjectRelativeFile(params: ProjectFileRequest): Promise<ProjectFileResponse> {
        return this.request<ProjectFileResponse>("selectProjectRelativeFile", params);
    }

    public selectFileOrFolderPath(): Promise<any> {
        return this.request("selectFileOrFolderPath");
    }

    public getWorkspaceRoot(): Promise<any> {
        return this.request("getWorkspaceRoot");
    }

    public getDefaultOrgName(): Promise<any> {
        return this.request("getDefaultOrgName");
    }

    public getDefaultCreationPath(): Promise<any> {
        return this.request("getDefaultCreationPath");
    }

    public isSupportedSLVersion(params: any): Promise<boolean> {
        return this.request("isSupportedSLVersion", params);
    }
    public getWizardCapabilities(): Promise<WizardCapabilitiesResponse> {
        return this.request("getWizardCapabilities");
    }

    /** Settled workspace support. Resolves only once the extension knows the answer,
     *  so unlike `getWizardCapabilities().isWorkspaceSupported` it is never `undefined`. */
    public getWorkspaceSupport(): Promise<WorkspaceSupportResponse> {
        return this.request("getWorkspaceSupport");
    }

    public getTriggerModels(params: TriggerModelsRequest): Promise<TriggerModelsResponse> {
        return this.request("getTriggerModels", params);
    }

    public getServiceInitModel(params: ServiceModelRequest): Promise<ServiceModelInitResponse> {
        return this.request("getServiceInitModel", params);
    }

    public getNodeTemplate(params: BINodeTemplateRequest): Promise<BINodeTemplateResponse> {
        return this.request("getNodeTemplate", params);
    }

    public getWizardFormTarget(params: WizardFormTargetRequest): Promise<WizardFormTargetResponse> {
        return this.request("getWizardFormTarget", params);
    }

    /**
     * Validation for the Configure step's expression fields, resolved against the
     * throwaway staging package. The request is file-scoped, so it works before the
     * real project exists
     */
    public getExpressionDiagnostics(params: ExpressionDiagnosticsRequest): Promise<ExpressionDiagnosticsResponse> {
        return this.request("getExpressionDiagnostics", params);
    }

    public scaffoldIntegrationProject(): Promise<ScaffoldIntegrationProjectResponse> {
        return this.request("scaffoldIntegrationProject", {});
    }

    public createIntegration(params: CreateIntegrationRequest): Promise<void> {
        return this.request("createIntegration", params);
    }

    /** Adds the configured artifact into an already-created package (no package
     *  creation, no window reload) — the empty-integration "continue" flow. */
    public addIntegrationArtifact(params: AddIntegrationArtifactRequest): Promise<void> {
        return this.request("addIntegrationArtifact", params);
    }

    public cancelIntegrationWizard(): Promise<void> {
        return this.request("cancelIntegrationWizard", {});
    }

    public cleanupAbandonedIntegrationScaffolds(): Promise<void> {
        return this.request("cleanupAbandonedIntegrationScaffolds");
    }

    // ── Import / migration ────────────────────────────────────
    public getMigrationTools(): Promise<GetMigrationToolsResponse> {
        return this.request("getMigrationTools");
    }

    public pullMigrationTool(params: MigrationToolPullRequest): Promise<void> {
        return this.request("pullMigrationTool", params);
    }

    public importIntegration(params: ImportIntegrationRPCRequest): Promise<ImportIntegrationResponse> {
        return this.request("importIntegration", params);
    }

    public migrateProject(params: MigrateRequest): Promise<void> {
        return this.request("migrateProject", params);
    }

    public saveMigrationReport(params: SaveMigrationReportRequest): Promise<void> {
        return this.request("saveMigrationReport", params);
    }

    public openMigrationReport(params: OpenMigrationReportRequest): Promise<void> {
        return this.request("openMigrationReport", params);
    }

    public storeSubProjectReports(params: StoreSubProjectReportsRequest): Promise<void> {
        return this.request("storeSubProjectReports", params);
    }

    public openSubProjectReport(params: OpenSubProjectReportRequest): Promise<void> {
        return this.request("openSubProjectReport", params);
    }

    public wizardEnhancementReady(): Promise<void> {
        return this.request("wizardEnhancementReady");
    }

    public openMigratedProject(): Promise<void> {
        return this.request("openMigratedProject");
    }

    public abortMigrationAgent(): Promise<void> {
        return this.request("abortMigrationAgent");
    }

    public showErrorMessage(params: any): Promise<void> {
        return this.request("showErrorMessage", params);
    }

    // ── AI enhancement auth ───────────────────────────────────
    public checkAIAuth(): Promise<boolean> {
        return this.request("checkAIAuth");
    }

    public triggerAICopilotSignIn(): Promise<SignInResult> {
        return this.request("triggerAICopilotSignIn");
    }

    public triggerAnthropicKeySignIn(params: { apiKey: string }): Promise<SignInResult> {
        return this.request("triggerAnthropicKeySignIn", params);
    }

    public triggerAwsBedrockSignIn(params: { accessKeyId: string; secretAccessKey: string; region: string; sessionToken?: string }): Promise<SignInResult> {
        return this.request("triggerAwsBedrockSignIn", params);
    }

    public triggerVertexAiSignIn(params: { projectId: string; location: string; clientEmail: string; privateKey: string }): Promise<SignInResult> {
        return this.request("triggerVertexAiSignIn", params);
    }

    /** Returns to the welcome view. In the integrator embed this is overridden by
     *  the host's `onBack`; in the visualizer it routes to BIWelcome. */
    public goBack(): Promise<void> {
        return this.request("goBack");
    }

    // ── Streaming subscriptions ───────────────────────────────
    public onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
        this.downloadProgressListeners.add(callback);
        return () => this.downloadProgressListeners.delete(callback);
    }

    public onMigrationToolStateChanged(callback: (state: string) => void): () => void {
        this.migrationToolStateListeners.add(callback);
        return () => this.migrationToolStateListeners.delete(callback);
    }

    public onMigrationToolLogs(callback: (log: string) => void): () => void {
        this.migrationToolLogListeners.add(callback);
        return () => this.migrationToolLogListeners.delete(callback);
    }

    public onMigratedProject(callback: (result: ProjectMigrationResult) => void): () => void {
        this.migratedProjectListeners.add(callback);
        return () => this.migratedProjectListeners.delete(callback);
    }

    public onChatNotify(callback: (event: ChatNotify) => void): () => void {
        this.chatNotifyListeners.add(callback);
        return () => this.chatNotifyListeners.delete(callback);
    }

    // ── Transport ─────────────────────────────────────────────
    public async request<T = any>(action: string, params?: unknown): Promise<T> {
        const payload: WebviewWsRequest = { action };
        if (params !== undefined) {
            payload.params = params;
        }
        const response = await this.transport.request(payload);
        if (!response || response.type !== WEBVIEW_WS_EVENTS.WS_RESPONSE || response.action !== action) {
            throw new Error(`Unexpected response for "${action}"`);
        }
        if (!response.success) {
            throw new Error(response.error ?? `Request failed for "${action}"`);
        }
        return response.result as T;
    }

    public notify(action: string, params?: unknown): void {
        void this.request(action, params).catch((error) => {
            console.warn(`[BI bridge] Failed to send "${action}"`, error);
        });
    }

    public dispose(): void {
        this.transport.close();
    }

    private handleIncomingMessage(message: WebviewWsResponse): void {
        switch (message.type) {
            case WEBVIEW_WS_EVENTS.DOWNLOAD_PROGRESS:
                this.downloadProgressListeners.forEach((l) => l(message.progress));
                return;
            case WEBVIEW_WS_EVENTS.MIGRATION_TOOL_STATE_CHANGED:
                this.migrationToolStateListeners.forEach((l) => l(message.state));
                return;
            case WEBVIEW_WS_EVENTS.MIGRATION_TOOL_LOGS:
                this.migrationToolLogListeners.forEach((l) => l(message.log));
                return;
            case WEBVIEW_WS_EVENTS.MIGRATED_PROJECT:
                this.migratedProjectListeners.forEach((l) => l(message.project));
                return;
            case WEBVIEW_WS_EVENTS.CHAT_NOTIFY:
                this.chatNotifyListeners.forEach((l) => l(message.event));
                return;
            default:
                return;
        }
    }

    private handleConnectionStatus(status: ConnectionStatus): void {
        if (status === "error") {
            console.warn("[BI bridge] connection error");
        }
    }
}
