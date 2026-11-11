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
    onPlatformExtStoreStateChange,
    PlatformExtAPI,
    SyntaxTree,
    DIRECTORY_MAP,
    findDevantScope,
    AvailableNode,
    hasWorkflowArtifacts,
    isSamePath,
} from "@wso2/ballerina-core";
import { Uri, window, WorkspaceEdit } from "vscode";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type {
    Component,
    ContextItemEnriched,
    DirectoryIntegration,
    EndpointLink,
    Environment,
    IWso2PlatformExtensionAPI,
    IWso2PlatformExtensionGate,
    LocalRuntimeEnv,
} from "@wso2/wso2-cloud-client";
import { NotSupportedError, UnauthenticatedError, isCloudError } from "@wso2/wso2-cloud-client";
import {
    ConnectionListItem,
    DeleteLocalConnectionsConfigReq,
    GetConnectionsReq,
    GetMarketplaceIdlReq,
    GetMarketplaceItemReq,
    GetMarketplaceListReq,
    MarketplaceIdlResp,
    MarketplaceItem,
    MarketplaceListResp,
    GetConnectionItemReq,
    StartProxyServerResp,
    ConnectionDetailed,
    DevantScopes,
    CreateLocalConnectionsConfigReq,
    CreateThirdPartyConnectionReq,
    GetComponentsReq,
    MarketplaceDatabaseListResp,
    DatabaseServer,
    GetDatabaseServerReq,
    DatabaseAdminCredential,
    DatabaseCredential,
    GetProjectEnvsReq,
    CreateDatabaseConnectionReq,
    GetDatabaseItemReq,
    ResolveConnectionSecretsResp,
    ResolveConnectionSecretsReq,
    WICommandIds,
    ICreateNewIntegrationCmdParams,
} from "@wso2/wso2-platform-core";
import { log } from "../../utils/logger";
import {
    AddDevantTempConfigReq,
    AddDevantTempConfigResp,
    CreateInternalConnectionReq,
    DeleteDevantTempConfigReq,
    GenerateCustomConnectorFromOASReq,
    GenerateCustomConnectorFromOASResp,
    InitializeDevantOASConnectionReq,
    InitializeDevantOASConnectionResp,
    RegisterDevantMarketplaceServiceReq,
    ReplaceDevantTempConfigValuesReq,
    SUPPORTED_PLATFORM_API_VERSION,
    MARKETPLACE_ITEM_UNAVAILABLE,
} from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { StateMachine } from "../../stateMachine";
import { CaptureBindingPattern, ModulePart, ModuleVarDecl, STKindChecker } from "@wso2/syntax-tree";
import { DeleteBiDevantConnectionReq } from "./types";
import { platformExtStore } from "./platform-store";
import { Messenger } from "vscode-messenger";
import { VisualizerWebview } from "../../views/visualizer/webview";
import {
    addConfigurable,
    addConnection,
    getConfigFileUri,
    hasContextYaml,
    processOpenApiWithApiKeyAuth,
    ProxyConfigEnvVars,
    Templates,
} from "./platform-utils";
import {
    configurableId,
    createdConnection,
    accessTo,
    connectableToMarketplaceItem,
    endpointLinkConnections,
    API_KEY_ENTRY,
    connectionLinksOf,
    linkToConnectionDetailed,
    parseLinkConnectionId,
    dbCredentialsToAdminCredential,
    dbServerToMarketplaceItem,
    dbServerToV1DatabaseServer,
    endpointToMarketplaceItem,
    envGroupToConnectionDetailed,
    envGroupToConnectionListItem,
    parseConnectionId,
    parseDatabaseId,
    parseServiceId,
    resourceRefOf,
    serviceId,
    localConnectionServiceIds,
} from "./v1-adapters";
import { debounce } from "lodash";
import { BiDiagramRpcManager } from "../bi-diagram/rpc-manager";
import { promptToAddConstruct } from "../../features/devant/add-construct-prompt";
import { confirmListenerAlongside } from "../../features/devant/integration-type";
import { updateSourceCode } from "../../utils";
import {
    type CloudSessionOptions,
    cloudAccessOf,
    connectPlatformAPI,
    describeCloudAccess,
    inspectPlatformAPI,
    onDidChangeCloudSessions,
    readCloudAccess,
    requestCloudAccess,
} from "../../utils/cloud-auth";
import type { CloudAccess } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { getOrgPackageName } from "../../utils/config";

/** Thrown for what WSO2 Cloud has no API for yet; a `NotSupportedError`, so `isCloudError` and the shared handlers know it. */
export class CloudFeatureUnavailableError extends NotSupportedError {
    constructor(feature: string) {
        super(`${feature} is not available on WSO2 Cloud yet.`, { reason: "cloud_feature_unavailable" });
        this.name = "CloudFeatureUnavailableError";
    }
}

/**
 * The cloud side of the BI visualizer, over WSO2 Integrator's exported
 * platform API. State the visualizer renders lives in `platformExtStore`;
 * the connection screens' marketplace vocabulary is served through
 * `./v1-adapters`.
 */
let missingAccessNoticeShown = false;

/**
 * Tells the person, once per window, that WSO2 Integrator is signed in but this
 * extension may not use the sign-in. VS Code itself only adds a badge to the
 * Accounts menu, which is easy to miss, and the cloud views would otherwise
 * look signed out.
 */
function noticeMissingCloudAccess(access: CloudAccess | undefined, allow: () => Promise<unknown>): void {
    if (access !== "no-access" || missingAccessNoticeShown) {
        return;
    }
    missingAccessNoticeShown = true;
    const allowAccess = "Allow Access";
    void Promise.resolve(
        vscode.window.showInformationMessage(
            `${describeCloudAccess(access)} Allow it to use WSO2 Cloud connections and deployments here.`,
            allowAccess
        )
    ).then((choice) => {
        if (choice === allowAccess) {
            return allow();
        }
    }).catch((error) => log(`Failed to ask for access to the WSO2 Cloud session: ${error}`));
}

export class PlatformExtRpcManager implements PlatformExtAPI {
    static platformGate: IWso2PlatformExtensionGate | undefined;
    /** Set once WSO2 Integrator was found to speak another contract version, so it is not asked again. */
    private static incompatibleVersion: number | undefined | null;
    /** What the store hears through the API of the current session; that API stops delivering once the key is replaced. */
    private sessionSubscriptions: (() => void)[] = [];
    private disposeProjectPathWatcher: (() => void) | undefined;

    /**
     * WSO2 Integrator's gate. An installed WSO2 Integrator that speaks another
     * contract version counts as not installed for the screens (no cloud
     * actions are offered), is reported once, and is not asked again.
     */
    private async getPlatformGate(): Promise<IWso2PlatformExtensionGate | undefined> {
        if (PlatformExtRpcManager.platformGate) {
            return PlatformExtRpcManager.platformGate;
        }
        if (PlatformExtRpcManager.incompatibleVersion !== undefined) {
            return undefined;
        }
        const verdict = await inspectPlatformAPI();
        if (!verdict.installed) {
            return undefined;
        }
        platformExtStore.getState().setState({
            isExtInstalled: !!verdict.gate,
            isCompatible: !!verdict.gate,
            platformApiVersion: verdict.version,
        });
        if (!verdict.gate) {
            PlatformExtRpcManager.incompatibleVersion = verdict.version ?? null;
            const message = `WSO2 Integrator exports platform API version ${verdict.version ?? "unknown"}; this extension needs ${SUPPORTED_PLATFORM_API_VERSION}. WSO2 Cloud features are off until both extensions are updated.`;
            log(message);
            void vscode.window.showWarningMessage(message);
            return undefined;
        }
        await this.waitForExtensionActive(verdict.gate);
        PlatformExtRpcManager.platformGate = verdict.gate;
        return verdict.gate;
    }

    // Wait for the cloud features to activate
    private async waitForExtensionActive(gate: IWso2PlatformExtensionGate, timeoutMs: number = 30000): Promise<void> {
        const startTime = Date.now();
        while (!gate.isActive()) {
            if (Date.now() - startTime > timeoutMs) {
                log("Timeout: Platform extension failed to activate within 30 seconds");
                throw new Error("WI extension cloud features activation timeout");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    /**
     * WSO2 Integrator's API for the current session; undefined without WSO2
     * Integrator, when nobody is signed in, or when this extension may not
     * use the session. Read per call: the session can change at any time.
     */
    private async getPlatformExt(options: CloudSessionOptions = {}): Promise<IWso2PlatformExtensionAPI | undefined> {
        if (!(await this.getPlatformGate())) {
            return undefined;
        }
        return connectPlatformAPI(options);
    }

    /** For calls the person made: asks for access to the session when this extension has none yet. */
    private async requirePlatformExt(): Promise<IWso2PlatformExtensionAPI> {
        if (!(await this.getPlatformGate())) {
            throw new Error("WSO2 Integrator's cloud features are not available. Install or update the WSO2 Integrator extension.");
        }
        const platformExt = await connectPlatformAPI({ askAccess: true });
        if (!platformExt) {
            // Signed in but not allowed is not "signed out": say which, and show it in the views.
            const access = await readCloudAccess();
            void this.refreshCloudAccess();
            throw new UnauthenticatedError("no_session", describeCloudAccess(access));
        }
        return platformExt;
    }

    /** Signs in, or asks VS Code to let this extension use the session WSO2 Integrator holds, then follows the result. */
    async requestCloudAccess(): Promise<CloudAccess> {
        await requestCloudAccess();
        await this.initSessionState(StateMachine.context()?.projectPath);
        if (platformExtStore.getState().state?.cloudAccess === "connected") {
            this.debouncedRefreshConnectionList();
        }
        return platformExtStore.getState().state?.cloudAccess ?? "signed-out";
    }

    /**
     * Reads the session again without asking. VS Code announces no change when
     * the person allows this extension from the Accounts menu, so the views ask
     * for this when they open.
     */
    async refreshCloudAccess(): Promise<CloudAccess> {
        const access = await readCloudAccess();
        if (access && access !== platformExtStore.getState().state?.cloudAccess) {
            await this.initSessionState(StateMachine.context()?.projectPath);
            if (access === "connected") {
                this.debouncedRefreshConnectionList();
            }
        }
        return access ?? "signed-out";
    }

    /** What the store currently points at: the org handle, the project name, the integration and the environment. */
    private selection() {
        const state = platformExtStore.getState().state;
        return {
            orgHandle: state?.session?.org.handle,
            projectName: state?.selectedContext?.projectName,
            integration: state?.selectedIntegration?.integration,
            env: state?.selectedEnv,
        };
    }

    private requireProjectName(): string {
        const { projectName } = this.selection();
        if (!projectName) {
            throw new Error("Link this directory with a WSO2 Cloud project first.");
        }
        return projectName;
    }

    private requireEnvId(): string {
        const { env } = this.selection();
        if (!env) {
            throw new Error("The project has no environment to connect to.");
        }
        return env.id;
    }

    public async initStateSubscription(messenger: Messenger) {
        // The webview always hears the store, so it can show that cloud features are off.
        await this.initSelfStoreSubscription(messenger);
        // Without WSO2 Integrator the store is not rehydrated.
        if (!(await this.getPlatformGate())) {
            return;
        }
        await platformExtStore.persist.rehydrate();
        let projectPath = StateMachine.context()?.projectPath;
        await this.initSessionState(projectPath);
        if (projectPath) {
            this.debouncedRefreshConnectionList();
        }
        await this.initFileWatcher();
        // The watcher's disposer is kept on the manager, not returned: a debounced function hands its
        // caller the previous call's result, which would dispose the wrong watcher one switch late.
        const debouncedInitProjectPathWatcher = debounce(async (nextPath: string) => {
            this.disposeProjectPathWatcher?.();
            this.disposeProjectPathWatcher = await this.initProjectPathWatcher(nextPath);
        }, 250);
        StateMachine.service().subscribe((state) => {
            if (state.context?.projectPath && !isSamePath(state.context?.projectPath, projectPath)) {
                projectPath = state.context?.projectPath;
                debouncedInitProjectPathWatcher(projectPath);
            }
        });
        // Sign-in, sign-out and an organization switch replace the key; the store is subscribed again through the new session.
        const debouncedSessionChange = debounce(() => {
            this.initSessionState(projectPath).catch((err) => log(`Failed to follow the WSO2 Cloud session change: ${err}`));
        }, 250);
        onDidChangeCloudSessions(debouncedSessionChange);

    }

    /** Fills the store from the current session and subscribes it there, dropping what it heard through an earlier session. */
    private async initSessionState(projectPath: string) {
        this.sessionSubscriptions.forEach((unsubscribe) => unsubscribe());
        this.sessionSubscriptions = [];
        await this.initAuthState();
        this.disposeProjectPathWatcher?.();
        this.disposeProjectPathWatcher = await this.initProjectPathWatcher(projectPath);
    }

    /** Fills the store's sign-in state from WSO2 Integrator and follows its changes through the connected API. */
    private async initAuthState() {
        const gate = await this.getPlatformGate();
        let platformExt: IWso2PlatformExtensionAPI | undefined;
        let authState: ReturnType<IWso2PlatformExtensionAPI["getAuthState"]> | undefined;
        let selectedContext: ContextItemEnriched | undefined;
        try {
            platformExt = await this.getPlatformExt();
            authState = platformExt?.getAuthState();
            selectedContext = platformExt?.getSelectedContext() ?? undefined;
        } catch (error) {
            // A key replaced while this ran: the session change that replaced it runs this again.
            log(`Failed to read the WSO2 Cloud session from WSO2 Integrator: ${error}`);
            platformExt = undefined;
            authState = undefined;
            selectedContext = undefined;
        }
        const session = authState?.session ?? null;
        const isLoggedIn = !!session && authState?.status === "signed-in";
        const cloudAccess = gate ? cloudAccessOf(gate, isLoggedIn) : undefined;
        platformExtStore.getState().setState({ session, isLoggedIn, cloudAccess, selectedContext });
        noticeMissingCloudAccess(cloudAccess, () => this.requestCloudAccess());
        await this.refreshEnvironments(selectedContext);
        if (!platformExt) {
            return;
        }

        // Subscribed only through a connected API, so signed in here means this extension may use the session.
        this.sessionSubscriptions.push(platformExt.subscribeAuthState((authState) => {
            const isLoggedIn = !!authState.session && authState.status === "signed-in";
            platformExtStore.getState().setState({
                session: authState.session,
                isLoggedIn,
                cloudAccess: isLoggedIn ? "connected" : "signed-out",
            });
        }));

        const debouncedEnvListRefresh = debounce((context?: ContextItemEnriched) => this.refreshEnvironments(context), 1000);

        this.sessionSubscriptions.push(platformExt.subscribeContextState(async (selectedContext) => {
            const previousProject = platformExtStore.getState().state?.selectedContext?.projectName;
            // Another project's environments go now, so a failed listing for this one cannot leave them in place.
            const projectChanged = selectedContext?.projectName !== previousProject;
            platformExtStore.getState().setState(projectChanged ? { selectedContext, envs: [], selectedEnv: undefined } : { selectedContext });
            debouncedEnvListRefresh(selectedContext);
        }));
    }

    /** The project's environments in promotion order; the selection survives a refresh, else the context's default, else the first. */
    private async refreshEnvironments(context?: ContextItemEnriched) {
        const platformExt = await this.getPlatformExt();
        if (!platformExt || !context?.projectName || context.foreignOrg || context.local) {
            platformExtStore.getState().setState({ envs: [], selectedEnv: undefined, envsError: undefined });
            return;
        }
        platformExtStore.getState().setState({ envsError: undefined });
        // A list that comes back after the selection moved to another project is dropped.
        const stillSelected = () => platformExtStore.getState().state?.selectedContext?.projectName === context.projectName;
        try {
            const envs = await platformExt.environments.listOrdered(context.projectName);
            if (!stillSelected()) {
                return;
            }
            const previous = platformExtStore.getState().state?.selectedEnv?.id;
            const selectedEnv =
                envs.find((env) => env.id === previous) ||
                envs.find((env) => env.id === context.defaultEnv || env.name === context.defaultEnv) ||
                envs[0];
            // Said, so what waits for an environment stops waiting.
            const envsError = selectedEnv ? undefined : `The project ${context.projectName} has no environments.`;
            platformExtStore.getState().setState({ envs, selectedEnv, envsError });
        } catch (err) {
            if (stillSelected()) {
                log(`Failed to list the environments of ${context.projectName}: ${err}`);
                platformExtStore.getState().setState({
                    envsError: `Couldn't read the environments of ${context.projectName}: ${err instanceof Error ? err.message : String(err)}`,
                });
            }
        }
    }

    private async initFileWatcher() {
        const debouncedOnFilChange = debounce(async () => {
            const projectPath = StateMachine.context().projectPath;
            // Read per change: the API the watcher started with stops answering once the session changes.
            const platformExt = projectPath ? await this.getPlatformExt() : undefined;
            if (platformExt) {
                const hasLocalChanges = await platformExt.localRepoHasChanges(projectPath);
                platformExtStore.getState().setState({ hasLocalChanges });
            }
        }, 1000);

        if (vscode.workspace.workspaceFolders?.length > 0) {
            const fileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], "**/*"),
            );
            fileWatcher.onDidCreate(debouncedOnFilChange);
            fileWatcher.onDidChange(debouncedOnFilChange);
            fileWatcher.onDidDelete(debouncedOnFilChange);
        }
    }

    private async initProjectPathWatcher(projectPath: string) {
        const platformExt = await this.getPlatformExt();
        let integrations: DirectoryIntegration[] = [];
        let matchingIntegration: DirectoryIntegration | undefined;
        let hasLocalChanges = false;
        let hasProjectYaml = false;
        const selectedId = () => platformExtStore.getState().state?.selectedIntegration?.integration.id;
        if (projectPath) {
            integrations = platformExt?.getDirectoryIntegrations(projectPath) ?? [];
            matchingIntegration = integrations.find((item) => item.integration.id === selectedId());
            hasLocalChanges = (await platformExt?.localRepoHasChanges(projectPath)) ?? false;
            hasProjectYaml = hasContextYaml(projectPath);
            await this.debouncedRefreshConnectionList();
        }

        platformExtStore.getState().setState({
            integrations,
            selectedIntegration: matchingIntegration || integrations[0],
            hasLocalChanges,
            hasPossibleComponent: integrations.length > 0 || hasProjectYaml,
        });

        if (!projectPath) {
            return undefined; // a workspace with no single package has no directory to watch
        }
        const unsubscribeDirCompWatcher = platformExt?.subscribeDirectoryIntegrations(projectPath, (integrations) => {
            const hasProjectYaml = hasContextYaml(projectPath);
            const matchingIntegration = integrations.find((item) => item.integration.id === selectedId());
            platformExtStore.getState().setState({
                integrations,
                selectedIntegration: matchingIntegration || integrations[0],
                hasPossibleComponent: integrations.length > 0 || hasProjectYaml,
            });
        });
        return unsubscribeDirCompWatcher;
    }

    private async initSelfStoreSubscription(messenger: Messenger) {
        platformExtStore.subscribe((state, prevState) => {
            messenger.sendNotification(
                onPlatformExtStoreStateChange,
                { type: "webview", webviewType: VisualizerWebview.viewType },
                state.state,
            );

            let refetchConnections = false;
            if (!state.state?.isLoggedIn && prevState?.state?.isLoggedIn) {
                // signing out keeps the last list until the next refresh
            } else if (
                state.state?.selectedIntegration &&
                state.state?.selectedIntegration.integration.id !== prevState?.state?.selectedIntegration?.integration.id
            ) {
                refetchConnections = true;
            } else if (
                state.state?.selectedContext?.projectName &&
                state.state?.selectedContext?.projectName !== prevState.state?.selectedContext?.projectName
            ) {
                platformExtStore.getState().setConnectionState({ list: [] });
                refetchConnections = true;
            } else if (state.state?.selectedEnv?.id !== prevState.state?.selectedEnv?.id) {
                // connections are per environment on the platform
                refetchConnections = true;
            }

            if (refetchConnections) {
                this.debouncedRefreshConnectionList();
            }
        });
    }

    // ---- the catalog: the endpoints of the organization the integration may connect to ----

    async getMarketplaceItems(params: GetMarketplaceListReq): Promise<MarketplaceListResp> {
        const empty: MarketplaceListResp = { count: 0, pagination: { limit: 0, offset: 0, total: 0 }, data: [] };
        try {
            if (params?.request?.isThirdParty) {
                // WSO2 Cloud has no third-party marketplace; the tab is empty rather than full of internal services.
                return empty;
            }
            const platformExt = await this.requirePlatformExt();
            const { orgHandle = "", integration } = this.selection();
            const projectName = this.requireProjectName();
            const envId = this.requireEnvId();
            // Before it is deployed the integration goes by its package's name; the platform only uses the
            // name to leave the integration's own endpoints out.
            const projectPath = StateMachine.context()?.projectPath;
            const integrationName = integration?.id ?? (projectPath ? getOrgPackageName(projectPath).packageName : "");
            if (!integrationName) {
                throw new Error("Open a Ballerina package: the services are listed for the package's integration, and its name is read from Ballerina.toml.");
            }
            // Every project's endpoints the integration may reach. The ones it can't connect to in the
            // environment are listed too, with the platform's reason, so a service never just goes missing.
            // Before the integration is deployed none can be connected to yet; the screen says so once.
            const endpoints = await platformExt.connections.listConnectable(integrationName, projectName);
            const query = params?.request?.query?.toLowerCase();
            const data = endpoints
                .map((endpoint) => connectableToMarketplaceItem(endpoint, envId, orgHandle))
                .filter((item) => !query || item.name.toLowerCase().includes(query))
                .sort((a, b) => Number(!!a.properties?.[MARKETPLACE_ITEM_UNAVAILABLE]) - Number(!!b.properties?.[MARKETPLACE_ITEM_UNAVAILABLE]));
            const offset = params?.request?.offset ?? 0;
            const limit = params?.request?.limit ?? data.length;
            return { count: data.length, pagination: { limit, offset, total: data.length }, data: data.slice(offset, offset + limit) };
        } catch (err) {
            log(`Failed to invoke getMarketplaceItems: ${err}`);
            throw err;
        }
    }

    async getMarketplaceDatabases(_params: { orgId: string }): Promise<MarketplaceDatabaseListResp> {
        try {
            const platformExt = await this.requirePlatformExt();
            const { orgHandle = "" } = this.selection();
            const servers = await platformExt.dbServers.list();
            const data = servers.map((server) => dbServerToMarketplaceItem(server, orgHandle));
            return { count: data.length, pagination: { limit: data.length, offset: 0, total: data.length }, data };
        } catch (err) {
            log(`Failed to invoke getMarketplaceDatabases: ${err}`);
        }
    }

    async getMarketplaceDatabaseItem(params: GetDatabaseItemReq): Promise<MarketplaceItem> {
        try {
            const platformExt = await this.requirePlatformExt();
            const { orgHandle = "" } = this.selection();
            const serverId = parseDatabaseId(params.resourceId) ?? params.resourceId;
            if (!serverId) {
                throw new CloudFeatureUnavailableError("Opening the database behind an existing connection");
            }
            return dbServerToMarketplaceItem(await platformExt.dbServers.get(serverId), orgHandle);
        } catch (err) {
            log(`Failed to invoke getMarketplaceDatabaseItem: ${err}`);
            throw err;
        }
    }

    async getDatabaseServer(params: GetDatabaseServerReq): Promise<DatabaseServer> {
        try {
            const platformExt = await this.requirePlatformExt();
            const [server, credentials] = await Promise.all([
                platformExt.dbServers.get(params.databaseServerId),
                platformExt.dbServers.revealCredentials(params.databaseServerId),
            ]);
            return dbServerToV1DatabaseServer(server, credentials);
        } catch (err) {
            log(`Failed to invoke getDatabaseServer: ${err}`);
            throw err;
        }
    }

    async getDatabaseAdminCredential(params: GetDatabaseServerReq): Promise<DatabaseAdminCredential> {
        try {
            const platformExt = await this.requirePlatformExt();
            return dbCredentialsToAdminCredential(await platformExt.dbServers.revealCredentials(params.databaseServerId));
        } catch (err) {
            log(`Failed to invoke getDatabaseAdminCredential: ${err}`);
            throw err;
        }
    }

    /**
     * Per-environment database users are a platform dependency; the server's
     * administrator credential is what there is, offered for every environment
     * so a connection can be made at all.
     */
    async getDatabaseCredentials(params: GetDatabaseServerReq): Promise<DatabaseCredential[]> {
        try {
            const platformExt = await this.requirePlatformExt();
            const { orgHandle = "" } = this.selection();
            const server = await platformExt.dbServers.get(params.databaseServerId);
            const item = dbServerToMarketplaceItem(server, orgHandle);
            const environments = (platformExtStore.getState().state.envs ?? []).map((env) => env.id);
            const now = new Date().toISOString();
            return [
                {
                    id: `admin:${params.databaseServerId}`,
                    display_name: "Administrator (the server's credentials)",
                    database_name: item.name,
                    applicable_environments: environments,
                    is_super_admin: true,
                    privilege_levels: null,
                    created_at: now,
                    updated_at: now,
                },
            ];
        } catch (err) {
            log(`Failed to invoke getDatabaseCredentials: ${err}`);
            return [];
        }
    }

    async createDatabaseConnection(params: CreateDatabaseConnectionReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.requirePlatformExt();
            const projectName = this.requireProjectName();
            const integration = params.componentId || this.selection().integration?.id;
            if (!integration) {
                throw new CloudFeatureUnavailableError("A project-level database connection");
            }
            // The form keys the mapping by environment id; only ids the project has are taken.
            const known = new Set((platformExtStore.getState().state.envs ?? []).map((env) => env.id));
            const environments = Object.keys(params.envMapping ?? {}).filter((id) => known.has(id));
            const envs = environments.length > 0 ? environments : [this.requireEnvId()];
            const dbServerId = parseDatabaseId(params.serviceId) ?? params.serviceId;
            await platformExt.connections.createDatabaseConnection({ integration, dbServerId, name: params.name, environments: envs, projectName });
            return createdConnection({ name: params.name, integration, environments: envs, kind: "DATABASE", serviceId: params.serviceId });
        } catch (err) {
            log(`Failed to invoke createDatabaseConnection: ${err}`);
            throw err;
        }
    }

    async getMarketplaceItem(params: GetMarketplaceItemReq): Promise<MarketplaceItem> {
        try {
            const platformExt = await this.requirePlatformExt();
            const { orgHandle = "" } = this.selection();
            const dbServerId = parseDatabaseId(params.serviceId);
            if (dbServerId) {
                return dbServerToMarketplaceItem(await platformExt.dbServers.get(dbServerId), orgHandle);
            }
            const ref = parseServiceId(params.serviceId);
            if (!ref) {
                throw new CloudFeatureUnavailableError("Opening the service behind an existing connection");
            }
            const envId = this.requireEnvId();
            const [integration, endpoints] = await Promise.all([
                platformExt.integrations.find(ref.integration, ref.project),
                platformExt.endpoints.listForEnvironment(ref.integration, envId, ref.project),
            ]);
            const endpoint = endpoints.find((item) => item.name === ref.endpoint);
            if (!endpoint) {
                throw new Error(`${ref.integration} exposes no endpoint ${ref.endpoint} in ${envId}.`);
            }
            return endpointToMarketplaceItem(ref.project, integration, envId, endpoint, orgHandle, this.requireProjectName());
        } catch (err) {
            log(`Failed to invoke getMarketplaceItem: ${err}`);
            throw err;
        }
    }

    async getMarketplaceIdl(params: GetMarketplaceIdlReq): Promise<MarketplaceIdlResp> {
        try {
            const platformExt = await this.requirePlatformExt();
            const ref = parseServiceId(params.serviceId);
            if (!ref) {
                throw new CloudFeatureUnavailableError("An API definition for this connection");
            }
            const envId = this.requireEnvId();
            const content = await platformExt.endpoints.getOpenApi(ref.integration, envId, ref.endpoint, ref.project);
            return { environmentId: envId, idlType: content ? "OpenAPI" : "", content: content ?? "" };
        } catch (err) {
            log(`Failed to invoke getMarketplaceIdl: ${err}`);
            throw err;
        }
    }

    // ---- connections: an integration's env-var groups in the selected environment ----

    async getConnections(params: GetConnectionsReq): Promise<ConnectionListItem[]> {
        try {
            const platformExt = await this.requirePlatformExt();
            if (!params.componentId) {
                // The platform has no project-level connections.
                return [];
            }
            const projectName = params.projectId || this.requireProjectName();
            const envId = this.requireEnvId();
            const groups = await platformExt.connections.list(params.componentId, envId, projectName);
            // The platform keeps no record of what a group points at, nor which groups are connections
            // rather than plain configuration; the local reference WI wrote for each connection does.
            const localRefs = localConnectionServiceIds(platformExtStore.getState().state.selectedIntegration?.fsPath);
            const groupConnections = groups
                .filter((group) => localRefs.has(group.name ?? ""))
                .map((group) => envGroupToConnectionListItem(group, { integration: params.componentId, environment: envId }, localRefs.get(group.name ?? "")));
            // A service connection is a link the platform resolves, not a group. Links that cannot
            // be read leave the group connections listed.
            let links: EndpointLink[];
            try {
                links = await platformExt.connections.listEndpointLinks(params.componentId, projectName);
            } catch (err) {
                log(`Failed to list the endpoint links of ${params.componentId}: ${err}`);
                return groupConnections;
            }
            const linkConnections = endpointLinkConnections(
                links,
                localRefs,
                { project: projectName, integration: params.componentId },
                new Set(groupConnections.map((item) => item.name)),
            );
            return [...groupConnections, ...linkConnections];
        } catch (err) {
            log(`Failed to invoke getConnections: ${err}`);
            return [];
        }
    }

    async getConnection(params: GetConnectionItemReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.requirePlatformExt();
            const link = parseLinkConnectionId(params.connectionGroupId);
            if (link) {
                const localRefs = localConnectionServiceIds(platformExtStore.getState().state.selectedIntegration?.fsPath);
                const linkedServiceId = localRefs.get(link.name);
                const target = parseServiceId(linkedServiceId);
                const projectName = this.requireProjectName();
                const access = target ? accessTo(target.project, projectName) : "project";
                // Across projects the API key is a link of its own, there only when the endpoint's API takes a key.
                const apiKey =
                    !!target &&
                    access === "organization" &&
                    (await platformExt.connections.listEndpointLinks(link.integration, projectName)).some(
                        (item) => item.key === "apiKey" && item.project === target.project && item.component === target.integration && item.endpoint === target.endpoint,
                    );
                return linkToConnectionDetailed(link, linkedServiceId, access, apiKey);
            }
            const ref = parseConnectionId(params.connectionGroupId);
            if (!ref) {
                throw new Error(`Unknown connection ${params.connectionGroupId}`);
            }
            const group = await platformExt.config.getEnvGroup(ref.integration, ref.environment, ref.name, this.selection().projectName);
            return envGroupToConnectionDetailed(group, ref);
        } catch (err) {
            log(`Failed to invoke getConnection: ${err}`);
            throw err;
        }
    }

    async getIntegrationList(params: GetComponentsReq): Promise<Component[]> {
        try {
            const platformExt = await this.requirePlatformExt();
            return await platformExt.integrations.list(params.projectId || this.requireProjectName());
        } catch (err) {
            log(`Failed to invoke getIntegrationList: ${err}`);
            return [];
        }
    }

    async deleteLocalConnectionsConfig(params: DeleteLocalConnectionsConfigReq): Promise<void> {
        try {
            const platformExt = await this.requirePlatformExt();
            platformExt.local.deleteConnectionReference({ componentDir: params.componentDir, name: params.connectionName });
        } catch (err) {
            log(`Failed to delete connection config: ${err}`);
        }
    }

    async getDevantConsoleUrl(): Promise<string> {
        try {
            const gate = await this.getPlatformGate();
            return gate?.getPlatformConfig().consoleUrl ?? "";
        } catch (err) {
            log(`Failed to read the console URL: ${err}`);
            return "";
        }
    }

    async createConnectionConfig(params: CreateLocalConnectionsConfigReq): Promise<string> {
        try {
            const platformExt = await this.requirePlatformExt();
            return await platformExt.local.writeConnectionReference({
                componentDir: params.componentDir,
                name: params.name,
                resourceRef: resourceRefOf(params.marketplaceItem, params.name),
            });
        } catch (err) {
            log(`Failed to create connection config: ${err}`);
        }
    }

    /** Third-party connections are a platform dependency (no marketplace registration on WSO2 Cloud). */
    async createThirdPartyConnection(_params: CreateThirdPartyConnectionReq): Promise<ConnectionDetailed> {
        const error = new CloudFeatureUnavailableError("Connecting to a third-party service through the cloud");
        window.showErrorMessage(error.message);
        throw error;
    }

    async getProjectEnvs(params: GetProjectEnvsReq): Promise<Environment[]> {
        try {
            const platformExt = await this.requirePlatformExt();
            return await platformExt.environments.listOrdered(params.projectId || this.requireProjectName());
        } catch (err) {
            log(`Failed to get project environments: ${err}`);
            return [];
        }
    }

    /** Secret values are write-only on the platform; a form or a local run gets none back and says so. */
    async resolveConnectionSecrets(params: ResolveConnectionSecretsReq): Promise<ResolveConnectionSecretsResp> {
        if (params.secrets.length > 0) {
            log(`The platform does not read secret values back; ${params.secrets.map((s) => s.key).join(", ")} have to be set locally.`);
        }
        return { secrets: [] };
    }

    async createInternalConnection(params: CreateInternalConnectionReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.requirePlatformExt();
            const projectName = params.projectId || this.requireProjectName();
            const integration = params.componentId || this.selection().integration?.id;
            if (!integration) {
                throw new Error("Deploy this integration to WSO2 Cloud first: a connection is made for a deployed integration.");
            }
            const target = parseServiceId(params.serviceId);
            if (!target) {
                throw new Error(`Unknown service ${params.serviceId}`);
            }
            const envId = this.requireEnvId();
            // Inside the project the endpoint is reached directly; another project's through the gateway.
            const access = accessTo(target.project, projectName);
            const url = this.rootConfigurableId(params.configurableName);
            // Across projects the API key goes in the header the endpoint's API takes, when it takes one.
            const apiKeyHeader = access === "organization" ? await this.apiKeyHeaderOf(params.serviceId) : undefined;
            const apiKey = apiKeyHeader ? this.rootConfigurableId(params.apiKeyConfigurableName) : undefined;
            await platformExt.connections.createServiceConnection({ integration, target, access, configurables: { url, apiKey }, projectName });
            return createdConnection({
                name: params.name,
                integration,
                environments: [envId],
                kind: "SERVICE",
                serviceId: params.serviceId,
                access,
                apiKey: !!apiKey,
                configurable: url,
            });
        } catch (err) {
            log(`Failed to create WSO2 Cloud connection: ${err}`);
            throw err;
        }
    }

    /**
     * The header the API of another project's endpoint takes its API key in, in the selected environment;
     * undefined when the API takes none. An API taking only OAuth2 tokens can't be connected to with a key.
     */
    private async apiKeyHeaderOf(id: string): Promise<string | undefined> {
        const target = parseServiceId(id);
        if (!target) {
            throw new Error(`Unknown service ${id}`);
        }
        const platformExt = await this.requirePlatformExt();
        const security = await platformExt.endpoints.getSecurity(target.integration, this.requireEnvId(), target.endpoint, target.project);
        if (security.mode === "jwt") {
            throw new Error(`${target.integration} takes only OAuth2 tokens; a connection from another project needs an API that takes an API key or no auth.`);
        }
        return security.mode === "api-key" ? security.apiKey?.header || "X-API-Key" : undefined;
    }

    /** The platform's id of a configurable in the open package's root module, where the connection screens write configurables. */
    private rootConfigurableId(name: string | undefined): string {
        if (!name) {
            throw new Error("A WSO2 Cloud connection needs the configurables the platform fills.");
        }
        const { orgName, packageName } = getOrgPackageName(StateMachine.context().projectPath);
        if (!orgName || !packageName) {
            throw new Error("The package's org and name could not be read from its Ballerina.toml.");
        }
        return configurableId(orgName, packageName, name);
    }

    setSelectedIntegration(integrationId: string): void {
        const selectedIntegration = platformExtStore
            .getState()
            .state?.integrations?.find((item) => item.integration.id === integrationId);
        if (selectedIntegration) {
            platformExtStore.getState().setState({ selectedIntegration });
        }
    }

    setSelectedEnv(envId: string): void {
        const selectedEnv = platformExtStore.getState().state?.envs?.find((item) => item?.id === envId);
        if (selectedEnv) {
            platformExtStore.getState().setState({ selectedEnv });
        }
    }

    setConnectedToDevant(connected: boolean): void {
        platformExtStore.getState().setConnectionState({ connectedToDevant: connected });
    }

    async deployIntegrationInDevant(): Promise<void> {
        const projectStructure = await new BiDiagramRpcManager().getProjectStructure();
        if (!projectStructure) {
            return;
        }

        const project = projectStructure.projects.find(
            (project) => isSamePath(project.projectPath, StateMachine.context()?.projectPath),
        );
        if (!project) {
            return;
        }

        const services = project.directoryMap[DIRECTORY_MAP.SERVICE];
        const automation = project.directoryMap[DIRECTORY_MAP.AUTOMATION];

        let scopes: DevantScopes[] = [];
        if (services?.length > 0) {
            const svcScopes = services
                .map((svc) => findDevantScope(svc?.triggerKind ?? svc?.kind, svc?.moduleName))
                .filter((svc) => svc !== undefined);
            scopes.push(...Array.from(new Set(svcScopes)));
        }
        if (hasWorkflowArtifacts(project)) {
            scopes.push(DevantScopes.WORKFLOW);
        }
        if (automation?.length > 0) {
            scopes.push(DevantScopes.AUTOMATION);
        }

        if (scopes.length === 0) {
            promptToAddConstruct();
            return;
        }

        // Deliberately asks whenever there is more than one scope, rather than going through
        // selectIntegrationType like the other two deploy entry points. Auto-picking would decide
        // the component's classification for the user, and this panel is the surface where they
        // expect to choose it. The listener warning is orthogonal to that choice, so it is applied
        // below either way. Aligning the three is tracked separately as a product decision.
        let integrationType: DevantScopes;

        if (scopes.length === 1) {
            integrationType = scopes[0];
        } else {
            const selectedScope = await window.showQuickPick(scopes, {
                placeHolder:
                    "You have multiple artifact types within this project. Select the artifact type to be deployed",
            });
            if (!selectedScope) {
                return;
            }
            integrationType = selectedScope as DevantScopes;
        }

        if (!(await confirmListenerAlongside(scopes, integrationType))) {
            return;
        }

        const deployementParams: ICreateNewIntegrationCmdParams = {
            buildPackLang:"ballerina",
            workspaceDir: StateMachine.context().workspacePath || StateMachine.context().projectPath,
            integrations: [{
                fsPath: StateMachine.context().projectPath,
                supportedIntegrationTypes: [integrationType],
                name: project?.projectTitle || project?.projectName
            }]
        };
        vscode.commands.executeCommand(WICommandIds.CreateNewComponent, deployementParams);
    }

    async getAllConnections(): Promise<ConnectionListItem[]> {
        try {
            const state = platformExtStore.getState().state;
            if (state.isLoggedIn && state.selectedContext?.projectName && state.selectedIntegration && state.selectedEnv) {
                return await this.getConnections({
                    orgId: state.session?.org.handle ?? "",
                    projectId: state.selectedContext.projectName,
                    componentId: state.selectedIntegration.integration.id,
                });
            }
            return [];
        } catch (err) {
            log(`Failed to get all connections: ${err}`);
            return [];
        }
    }

    /**
     * Gives a local run or debug session the integration's cloud environment.
     * The platform has no network bridge, so only the variables are injected;
     * secrets are write-only there and have to be set locally.
     */
    async setupDevantProxyForDebugging(debugConfig: vscode.DebugConfiguration): Promise<void> {
        const localEnv = await this.startProxyServer(debugConfig);
        if (!localEnv) {
            return;
        }
        debugConfig.env = { ...(debugConfig.env || {}), ...localEnv.envVars };
        delete debugConfig.env[ProxyConfigEnvVars.proxyHost.envName];
        delete debugConfig.env[ProxyConfigEnvVars.proxyPort.envName];
    }

    async startProxyServer(
        debugConfig: vscode.DebugConfiguration,
    ): Promise<(StartProxyServerResp & { requiresProxy: boolean }) | undefined> {
        try {
            const platformExt = await this.getPlatformExt();
            const configBalFile = path.join(StateMachine.context().projectPath, "config.bal");
            const configBalFileUri = Uri.file(configBalFile);
            const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
                documentIdentifier: { uri: configBalFileUri.toString() },
            })) as SyntaxTree;
            let requiresProxy = false;
            if (
                (syntaxTree?.syntaxTree as ModulePart)?.members?.find(
                    (member) =>
                        STKindChecker.isModuleVarDecl(member) &&
                        (member.typedBindingPattern?.bindingPattern as CaptureBindingPattern)?.variableName?.value ===
                            ProxyConfigEnvVars.proxyConfig.varName,
                )
            ) {
                requiresProxy = true;
            }

            if (debugConfig.request === "launch" && debugConfig?.choreoConnect) {
                if (!platformExtStore.getState().state?.isLoggedIn) {
                    window
                        .showErrorMessage(
                            "You must log in before connecting to WSO2 Cloud environment. Retry after logging in.",
                            "Login",
                        )
                        .then((res) => {
                            if (res === "Login") {
                                vscode.commands.executeCommand(WICommandIds.SignIn);
                            }
                        });
                    return;
                }

                if (!platformExtStore.getState().state?.selectedContext?.projectName) {
                    window
                        .showErrorMessage(
                            "Please associate your directory with a WSO2 Cloud project in order to connect to WSO2 Cloud while running or debugging",
                            "Manage Project",
                        )
                        .then((res) => {
                            if (res === "Manage Project") {
                                vscode.commands.executeCommand(WICommandIds.ManageDirectoryContext);
                            }
                        });
                    return;
                }
            }

            const state = platformExtStore.getState().state;
            if (
                debugConfig.request === "launch" &&
                platformExt &&
                state?.isLoggedIn &&
                state?.selectedContext?.projectName &&
                state?.devantConns?.connectedToDevant
            ) {
                const localEnv: LocalRuntimeEnv = await window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Reading the WSO2 Cloud environment before running/debugging the application...",
                    },
                    () =>
                        platformExt.runtime.collectLocalEnv({
                            projectName: debugConfig?.choreoConnect?.project || state.selectedContext.projectName,
                            integration: debugConfig?.choreoConnect?.component || state.selectedIntegration?.integration.id,
                            environment: debugConfig?.choreoConnect?.env || state.selectedEnv?.id,
                            skip: debugConfig?.choreoConnect?.skipConnection || [],
                        }),
                );
                if (localEnv.missingSecrets.length > 0) {
                    window.showWarningMessage(
                        `WSO2 Cloud keeps secrets write-only, so these were not injected into the run: ${localEnv.missingSecrets.join(", ")}. Set them locally.`,
                    );
                }
                if (requiresProxy) {
                    window.showWarningMessage(
                        "This integration is configured for the WSO2 Cloud network proxy, which is not available yet; services visible only inside the organization or project cannot be reached from this machine.",
                    );
                }
                return { envVars: localEnv.envVars, proxyServerPort: 0, requiresProxy };
            }
            return { envVars: {}, proxyServerPort: 0, requiresProxy };
        } catch (err) {
            log(`Failed to read the cloud environment for the run: ${err}`);
            return { envVars: {}, proxyServerPort: 0, requiresProxy: false };
        }
    }

    async deleteBiDevantConnection(params: DeleteBiDevantConnectionReq): Promise<void> {
        // A cloud connection that could not be deleted fails the call, so the caller keeps its code to retry with.
        let deletingCloudConnection = false;
        try {
            StateMachine.setEditMode();
            const platformExt = await this.getPlatformExt({ askAccess: true });
            const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
                documentIdentifier: { uri: Uri.file(params.filePath).toString() },
            })) as SyntaxTree;

            const matchingConnection = (syntaxTree.syntaxTree as ModulePart)?.members?.find((member) => {
                return (
                    member.position?.startLine === params?.startLine &&
                    member.position?.startColumn === params?.startColumn &&
                    member.position?.endLine === params?.endLine &&
                    member.position?.endColumn === params?.endColumn
                );
            });

            if (matchingConnection && STKindChecker.isModuleVarDecl(matchingConnection)) {
                const connectionName = (matchingConnection.typedBindingPattern?.bindingPattern as CaptureBindingPattern)
                    ?.variableName?.value;
                if (connectionName) {
                    const projectPath = StateMachine.context().projectPath;
                    const matchingConnListItem = platformExtStore
                        .getState()
                        .state?.devantConns?.list.find(
                            (connItem) => connItem.name?.replaceAll("-", "_").replaceAll(" ", "_") === connectionName,
                        );
                    if (matchingConnListItem) {
                        const ref = parseConnectionId(matchingConnListItem.groupUuid);
                        const link = parseLinkConnectionId(matchingConnListItem.groupUuid);
                        if (link && platformExt) {
                            // Unlinked before the local reference goes: the list shows a link only while a reference names its endpoint.
                            deletingCloudConnection = true;
                            const projectName = this.selection().projectName;
                            // The list pairs links with connections by endpoint alone; with two connections to one
                            // endpoint, the configurables this connection's code reads are the links that are its own:
                            // its URL's and, across projects, its API key's.
                            const links = await platformExt.connections.listEndpointLinks(link.integration, projectName);
                            const configurables = connectionLinksOf(links, link.configurable, matchingConnection.initializer?.source ?? "");
                            for (const configurable of configurables) {
                                await platformExt.connections.unlinkEndpoint({ integration: link.integration, configurable, projectName });
                            }
                            if (configurables.length === 0) {
                                window.showWarningMessage(
                                    `${connectionName} doesn't name the configurables it reads, and other connections use the same service, so its links in WSO2 Cloud were kept. Remove them in WSO2 Cloud.`,
                                );
                            }
                            deletingCloudConnection = false;
                        } else if (ref && platformExt) {
                            // Every environment it was written to, not only the one selected now. Deleted before the
                            // local reference: the connection list shows only groups that still have one.
                            deletingCloudConnection = true;
                            await platformExt.connections.delete({
                                integration: ref.integration,
                                name: ref.name,
                                projectName: this.selection().projectName,
                            });
                            deletingCloudConnection = false;
                        }
                        await this.deleteLocalConnectionsConfig({
                            componentDir: projectPath,
                            connectionName: matchingConnListItem.name,
                        });
                    }
                }
            }

            this.refreshConnectionList();
            StateMachine.setReadyMode();
        } catch (err) {
            StateMachine.setReadyMode();
            window.showErrorMessage(`Failed to delete WSO2 Cloud connection: ${(err as Error).message}`);
            log(`Failed to invoke deleteBiDevantConnection: ${err}`);
            if (deletingCloudConnection) {
                throw err;
            }
        }
    }

    async initializeDevantOASConnection(
        params: InitializeDevantOASConnectionReq,
    ): Promise<InitializeDevantOASConnectionResp> {
        try {
            StateMachine.setEditMode();
            await this.generateCustomConnectorFromOAS({
                connectionName: params.name,
                marketplaceItem: params.marketplaceItem,
                securityType: params.securityType,
            });
            const moduleName = params.name.replace(/[_\-\s]/g, "")?.toLowerCase();
            const configFileUri = getConfigFileUri();

            const envIds = Object.keys(params.configurations || {});
            const firstEnvConfig = envIds.length > 0 ? params.configurations[envIds[0]] : undefined;
            const connectionKeys = firstEnvConfig?.entries ?? {};

            interface IkeyVal {
                keyname: string;
                envName: string;
            }
            interface Ikeys {
                APIKey?: IkeyVal;
                ServiceURL?: IkeyVal;
                TokenURL?: IkeyVal;
                ConsumerKey?: IkeyVal;
                ConsumerSecret?: IkeyVal;
            }
            const keys: Ikeys = {};

            const deleteTempConfigBalEdits = new WorkspaceEdit();
            const configBalFileUri = getConfigFileUri();

            for (const entry of params.devantConfigs) {
                if (entry.node) {
                    deleteTempConfigBalEdits.delete(
                        configBalFileUri,
                        new vscode.Range(
                            new vscode.Position(entry.node.position.startLine, entry.node.position.startColumn),
                            new vscode.Position(entry.node.position.endLine, entry.node.position.endColumn),
                        ),
                    );
                }

                if (connectionKeys[entry.id]){
                    keys[entry.id] = {
                        keyname: entry.name,
                        envName: connectionKeys[entry.id].envVariableName,
                    };
                } else {
                    log(`connectionKeys ${JSON.stringify(connectionKeys)} does not include the needed key for entry ${entry.id}`);
                }
            }
            if (deleteTempConfigBalEdits.size > 0) {
                await updateSourceCode({
                    textEdits: { [configBalFileUri.toString()]: deleteTempConfigBalEdits.get(configBalFileUri) || [] },
                    skipPayloadCheck: true,
                });
            }

            await addConfigurable(
                configFileUri,
                Object.values(keys).map((item) => ({ configName: item.keyname, configEnvName: item.envName })),
            );

            // WSO2 Cloud has no local proxy to route a connection through: the connection calls its URL directly.
            const resp = await addConnection(params.name, moduleName, params.securityType, false, {
                apiKeyVarName: keys?.APIKey?.keyname,
                svsUrlVarName: keys?.ServiceURL?.keyname,
                tokenClientIdVarName: keys?.ConsumerKey?.keyname,
                tokenClientSecretVarName: keys?.ConsumerSecret?.keyname,
                tokenUrlVarName: keys?.TokenURL?.keyname,
            });

            StateMachine.setReadyMode();
            return { connectionName: resp.connName };
        } catch (err) {
            StateMachine.setReadyMode();
            window.showErrorMessage(`Failed to initialize WSO2 Cloud connection: ${(err as Error).message}`);
            log(`Failed to initialize WSO2 Cloud connection: ${err}`);
        }
    }

    async generateCustomConnectorFromOAS(
        params: GenerateCustomConnectorFromOASReq,
    ): Promise<GenerateCustomConnectorFromOASResp> {
        try {
            const projectPath = StateMachine.context().projectPath;

            const serviceIdl = await this.getMarketplaceIdl({
                orgId: this.selection().orgHandle ?? "",
                serviceId: params.marketplaceItem.serviceId,
            });

            const choreoDir = path.join(projectPath, ".wso2");
            if (!fs.existsSync(choreoDir)) {
                fs.mkdirSync(choreoDir, { recursive: true });
            }

            const moduleName = params.connectionName.replace(/[_\-\s]/g, "")?.toLowerCase();
            const filePath = path.join(choreoDir, `${moduleName}-spec.yaml`);

            if (serviceIdl?.idlType === "OpenAPI" && serviceIdl.content) {
                // The key goes in the header the endpoint's API takes it in.
                const apiKeyHeader = params.securityType === "apikey" ? await this.apiKeyHeaderOf(params.marketplaceItem.serviceId) : undefined;
                const updatedDef = processOpenApiWithApiKeyAuth(serviceIdl.content, params.securityType, apiKeyHeader);
                fs.writeFileSync(filePath, updatedDef, "utf8");
            }

            const diagram = new BiDiagramRpcManager();
            await diagram.generateOpenApiClient({
                module: moduleName,
                openApiContractPath: filePath,
                projectPath,
            });

            const connectors = await diagram.search({
                filePath: StateMachine.context().documentUri,
                queryMap: { limit: 60 },
                searchKind: "CONNECTOR",
            });

            const localCategory = connectors?.categories?.find((item) => item.metadata?.label === "Local");
            if (localCategory) {
                const matchingLocalConnector = localCategory?.items?.find(
                    (item) => (item as AvailableNode)?.codedata?.module === moduleName,
                );
                if (matchingLocalConnector) {
                    return { connectionNode: matchingLocalConnector as AvailableNode };
                }
            }

            return { connectionNode: null };
        } catch (err) {
            StateMachine.setReadyMode();
            window.showErrorMessage(`Failed to invoke generateCustomConnectorFromOAS: ${(err as Error).message}`);
            log(`Failed to invoke generateCustomConnectorFromOAS: ${err}`);
        }
    }

    async deleteDevantTempConfigs(params: DeleteDevantTempConfigReq): Promise<void> {
        try {
            const configBalFileUri = getConfigFileUri();

            const configBalEdits = new WorkspaceEdit();
            for (const node of params.nodes) {
                configBalEdits.delete(
                    configBalFileUri,
                    new vscode.Range(
                        new vscode.Position(node.position.startLine, node.position.startColumn),
                        new vscode.Position(node.position.endLine, node.position.endColumn),
                    ),
                );
            }

            await updateSourceCode({
                textEdits: { [configBalFileUri.toString()]: configBalEdits.get(configBalFileUri) || [] },
                skipPayloadCheck: true,
            });
        } catch (err) {
            log(`Failed to invoke deleteDevantTempConfigs: ${err}`);
        }
    }

    async addDevantTempConfig(params: AddDevantTempConfigReq): Promise<AddDevantTempConfigResp> {
        try {
            const configBalFileUri = getConfigFileUri();
            const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
                documentIdentifier: { uri: configBalFileUri.toString() },
            })) as SyntaxTree;

            const newConfigEditLine = (syntaxTree?.syntaxTree?.position?.endLine ?? 0) + 1;
            const configBalEdits = new WorkspaceEdit();

            if (params.newLine) {
                configBalEdits.insert(
                    configBalFileUri,
                    new vscode.Position(newConfigEditLine, 0),
                    Templates.emptyLine(),
                );
            }

            const newConfigTemplate = Templates.newDefaultEnvConfigurable({ CONFIG_NAME: params.name });
            configBalEdits.insert(configBalFileUri, new vscode.Position(newConfigEditLine, 0), newConfigTemplate);

            await updateSourceCode({
                textEdits: { [configBalFileUri.toString()]: configBalEdits.get(configBalFileUri) || [] },
                skipPayloadCheck: true,
            });

            const updatedSyntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
                documentIdentifier: { uri: configBalFileUri.toString() },
            })) as SyntaxTree;

            const matchingConfig = (updatedSyntaxTree?.syntaxTree as ModulePart)?.members?.find((member) => {
                return (
                    (member.typedBindingPattern?.bindingPattern as CaptureBindingPattern)?.variableName?.value ===
                    params.name
                );
            });
            if (STKindChecker.isModuleVarDecl(matchingConfig)) {
                return { configNode: matchingConfig };
            }

            throw new Error("failed to add new temp config");
        } catch (err) {
            log(`Failed to invoke addDevantTempConfig: ${err}`);
        }
    }

    /** Registering a third-party service in a marketplace is a platform dependency. */
    async registerDevantMarketplaceService(_params: RegisterDevantMarketplaceServiceReq): Promise<MarketplaceItem> {
        const error = new CloudFeatureUnavailableError("Registering a third-party service");
        window.showErrorMessage(error.message);
        throw error;
    }

    async replaceDevantTempConfigValues(params: ReplaceDevantTempConfigValuesReq): Promise<void> {
        try {
            const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
                documentIdentifier: { uri: getConfigFileUri().toString() },
            })) as SyntaxTree;

            const envIds = Object.keys(params.createdConnection.configurations || {});
            const firstEnvConfig = envIds.length > 0 ? params.createdConnection.configurations[envIds[0]] : undefined;
            const connectionKeys = firstEnvConfig?.entries ?? {};

            let hasUpdatedConfig = false;
            const configBalEdits = new WorkspaceEdit();

            for (const config of params.configs) {
                const matchingConfigEntry = Object.values(connectionKeys).find((item) => item.key === config.id);
                let matchingNode: ModuleVarDecl = config.node as ModuleVarDecl;
                if (!matchingNode) {
                    matchingNode = (syntaxTree?.syntaxTree as ModulePart)?.members?.find(
                        (member) =>
                            STKindChecker.isModuleVarDecl(member) &&
                            (member.typedBindingPattern?.bindingPattern as CaptureBindingPattern)?.variableName?.value === config.name,
                    ) as ModuleVarDecl;
                }
                if (!matchingConfigEntry && matchingNode && config.id === API_KEY_ENTRY) {
                    // An API that takes no key: its key's configurable is left empty, not required with nothing to fill it.
                    hasUpdatedConfig = true;
                    configBalEdits.replace(
                        getConfigFileUri(),
                        new vscode.Range(
                            new vscode.Position(matchingNode.initializer.position.startLine, matchingNode.initializer.position.startColumn),
                            new vscode.Position(matchingNode.initializer.position.endLine, matchingNode.initializer.position.endColumn),
                        ),
                        '""',
                    );
                } else if (matchingConfigEntry && matchingNode) {
                    let value = `os:getEnv("${matchingConfigEntry.envVariableName}")`;
                    if (config.type === "int") {
                        value = `check int:fromString(os:getEnv("${matchingConfigEntry.envVariableName}"))`;
                    }
                    hasUpdatedConfig = true;
                    configBalEdits.replace(
                        getConfigFileUri(),
                        new vscode.Range(
                            new vscode.Position(
                                matchingNode.initializer.position.startLine,
                                matchingNode.initializer.position.startColumn,
                            ),
                            new vscode.Position(
                                matchingNode.initializer.position.endLine,
                                matchingNode.initializer.position.endColumn,
                            ),
                        ),
                        value,
                    );
                }
            }

            if (hasUpdatedConfig) {
                if (
                    !(syntaxTree?.syntaxTree as ModulePart)?.imports?.some((item) =>
                        item.source?.includes("import ballerina/os"),
                    )
                ) {
                    const balOsImportTemplate = Templates.importBalOs();
                    configBalEdits.insert(getConfigFileUri(), new vscode.Position(0, 0), balOsImportTemplate);
                }

                await updateSourceCode({
                    textEdits: { [getConfigFileUri().toString()]: configBalEdits.get(getConfigFileUri()) || [] },
                    skipPayloadCheck: true,
                });
            }
        } catch (err) {
            window.showErrorMessage(`Failed to invoke replaceDevantTempConfigValues: ${(err as Error).message}`);
            log(`Failed to invoke replaceDevantTempConfigValues: ${err}`);
        }
    }

    debouncedRefreshConnectionList = debounce(() => this.refreshConnectionList(), 500);

    async refreshConnectionList(): Promise<void> {
        try {
            platformExtStore.getState().setConnectionState({ loading: true });
            const connections = await this.getAllConnections();
            platformExtStore.getState().setConnectionState({ list: connections, loading: false });
        } catch (err) {
            platformExtStore.getState().setConnectionState({ loading: false });
            log(`Failed to refresh connection list: ${err}`);
        }
    }
}
