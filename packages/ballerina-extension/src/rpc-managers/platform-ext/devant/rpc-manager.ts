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
import type { Messenger } from "vscode-messenger";
import type {
    Component,
    Environment,
    IWso2PlatformExtensionAPI as CloudAPI,
    IWso2PlatformExtensionGate,
} from "@wso2/wso2-cloud-client";
import { UnauthenticatedError } from "@wso2/wso2-cloud-client";
import {
    ComponentKind,
    ConnectionDetailed,
    ConnectionListItem,
    ContextItemEnriched,
    CreateDatabaseConnectionReq,
    CreateLocalConnectionsConfigReq,
    CreateThirdPartyConnectionReq,
    DatabaseAdminCredential,
    DatabaseCredential,
    DatabaseServer,
    DeleteLocalConnectionsConfigReq,
    DevantScopes,
    GetComponentsReq,
    GetConnectionItemReq,
    GetConnectionsReq,
    GetDatabaseItemReq,
    GetDatabaseServerReq,
    GetMarketplaceIdlReq,
    GetMarketplaceItemReq,
    GetMarketplaceListReq,
    GetProjectEnvsReq,
    ICreateNewIntegrationCmdParams,
    IWso2PlatformExtensionAPI as DevantAPI,
    MarketplaceDatabaseListResp,
    MarketplaceIdlResp,
    MarketplaceItem,
    MarketplaceListResp,
    RegisterMarketplaceConfigMap,
    ResolveConnectionSecretsReq,
    ResolveConnectionSecretsResp,
    ServiceInfoVisibilityEnum,
    StartProxyServerResp,
    StopProxyServerReq,
    WICommandIds,
} from "@wso2/wso2-platform-core";
import type {
    AddDevantTempConfigReq,
    AddDevantTempConfigResp,
    CloudAccess,
    CloudIntegrationStatus,
    CloudIntegrationStatusReq,
    CreateInternalConnectionReq,
    DeleteDevantTempConfigReq,
    DevantPlatformExtState,
    GenerateCustomConnectorFromOASReq,
    GenerateCustomConnectorFromOASResp,
    InitializeDevantOASConnectionReq,
    InitializeDevantOASConnectionResp,
    PlatformExtState,
    RegisterDevantMarketplaceServiceReq,
    ReplaceDevantTempConfigValuesReq,
} from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { CaptureBindingPattern, ModulePart, ModuleVarDecl, STKindChecker } from "@wso2/syntax-tree";
import { debounce } from "lodash";
import { log } from "../../../utils/logger";
import { StateMachine } from "../../../stateMachine";
import { updateSourceCode } from "../../../utils";
import { BiDiagramRpcManager } from "../../bi-diagram/rpc-manager";
import { promptToAddConstruct } from "../../../features/devant/add-construct-prompt";
import { confirmListenerAlongside } from "../../../features/devant/integration-type";
import {
    type CloudSessionOptions,
    cloudAccessOf,
    connectPlatformAPI,
    describeCloudAccess,
    getCloudPlatform,
    getPlatformGate,
    onDidChangeCloudSessions,
    readCloudAccess,
    requestCloudAccess,
    withPlatformAPI,
} from "../../../utils/cloud-auth";
import type { PlatformExtManager } from "../router";
import { noticeMissingCloudAccess } from "../rpc-manager";
import type { DeleteBiDevantConnectionReq } from "../types";
import { platformExtStore } from "../platform-store";
import {
    addConfigurable,
    addConnection,
    findUniqueConnectionName,
    getConfigFileUri,
    processOpenApiWithApiKeyAuth,
    ProxyConfigEnvVars,
    Templates,
} from "../platform-utils";
import { addProxyConfigurable, DEVANT_API_KEY_HEADER, DEVANT_PLATFORM, hasDevantContextYaml } from "./platform-utils";
import { isComponent, toEnvironment } from "./mapping";

const EMPTY_DEVANT_STATE: DevantPlatformExtState = { userInfo: null, components: [] };

/** How long WSO2 Integrator's cloud features get to activate. */
const ACTIVATION_TIMEOUT_MS = 30000;

/** Tries to read Devant's user details, which WSO2 Integrator fetches after a sign-in change, before giving up. */
const MAX_DETAIL_REREADS = 4;

let missingDevantApiReported = false;

/** Devant's API inside the connected API; an error when WSO2 Integrator offers none. */
function devantOf(api: CloudAPI): DevantAPI {
    const devant = (api.platformApis as { devant?: DevantAPI } | undefined)?.devant;
    if (!devant) {
        const message = "WSO2 Integrator does not offer its WSO2 Cloud features to the Ballerina extension. Update WSO2 Integrator to use them here.";
        // Said once, and not for a call that outlived a switch to another platform.
        if (!missingDevantApiReported && isDevant()) {
            missingDevantApiReported = true;
            log(message);
            void window.showWarningMessage(message);
        }
        throw new Error(message);
    }
    return devant;
}

function devantState(): DevantPlatformExtState {
    return platformExtStore.getState().state?.devant ?? EMPTY_DEVANT_STATE;
}

function isDevant(): boolean {
    return getCloudPlatform() === DEVANT_PLATFORM;
}

/** Signed in through WSO2 Integrator, but this extension is not allowed to use that sign-in (yet). */
const isCloudAccessMissing = (access: CloudAccess | undefined): boolean => access === "no-access" || access === "declined";

/**
 * `next` with the organization and project the store holds for the same handles, which WSO2 Integrator reads a
 * moment after it knows the handles.
 */
function filledFrom(next: ContextItemEnriched | undefined, known: ContextItemEnriched | undefined): ContextItemEnriched | undefined {
    if (!next || !known || next.orgHandle !== known.orgHandle || next.projectHandle !== known.projectHandle) {
        return next;
    }
    return { ...next, org: next.org ?? known.org, project: next.project ?? known.project };
}

/**
 * The cloud side of the BI visualizer on Devant, over the API WSO2 Integrator
 * offers for Devant beside its own. The Devant screens read `state.devant`;
 * the store is pushed to the webview by the WSO2 Cloud manager.
 */
export class DevantPlatformExtRpcManager implements PlatformExtManager {
    private static gate: IWso2PlatformExtensionGate | undefined;
    /** What the store hears through the current session's API, which stops delivering once the key is replaced. */
    private sessionSubscriptions: (() => void)[] = [];
    private disposeProjectPathWatcher: (() => void) | undefined;
    private rereadTimer: ReturnType<typeof setTimeout> | undefined;

    private async getGate(): Promise<IWso2PlatformExtensionGate | undefined> {
        if (DevantPlatformExtRpcManager.gate) {
            return DevantPlatformExtRpcManager.gate;
        }
        const gate = await getPlatformGate();
        if (!gate) {
            return undefined;
        }
        await this.waitForExtensionActive(gate);
        DevantPlatformExtRpcManager.gate = gate;
        return gate;
    }

    private async waitForExtensionActive(gate: IWso2PlatformExtensionGate): Promise<void> {
        const startTime = Date.now();
        while (!gate.isActive()) {
            if (Date.now() - startTime > ACTIVATION_TIMEOUT_MS) {
                log(`Timeout: Platform extension failed to activate within ${ACTIVATION_TIMEOUT_MS / 1000} seconds`);
                throw new Error("WI extension cloud features activation timeout");
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    /** The connected API and Devant's inside it, for reads in the background; undefined without a usable session. */
    private async connect(options: CloudSessionOptions = {}): Promise<{ api: CloudAPI; devant: DevantAPI } | undefined> {
        if (!(await this.getGate())) {
            return undefined;
        }
        const api = await connectPlatformAPI(options);
        return api ? { api, devant: devantOf(api) } : undefined;
    }

    private async getDevant(options: CloudSessionOptions = {}): Promise<DevantAPI | undefined> {
        return (await this.connect(options))?.devant;
    }

    /**
     * Runs `call` with Devant's API, asking for access to the session by
     * default since the screens call for what the person did. A key replaced
     * meanwhile is followed once.
     */
    private async withDevant<T>(call: (devant: DevantAPI) => Promise<T> | T, options: CloudSessionOptions = { askAccess: true }): Promise<T> {
        if (!(await this.getGate())) {
            throw new Error("WSO2 Integrator's cloud features are not available. Install or update the WSO2 Integrator extension.");
        }
        return withPlatformAPI(async (api) => {
            if (!api) {
                const access = await readCloudAccess();
                void this.refreshCloudAccess();
                throw new UnauthenticatedError("no_session", describeCloudAccess(access));
            }
            return call(devantOf(api));
        }, options);
    }

    /** Writes the shared fields and Devant's, while Devant is the platform in use; a late answer after a switch is dropped. */
    private update(shared: Partial<PlatformExtState>, devant?: Partial<DevantPlatformExtState>): void {
        if (!isDevant()) {
            return;
        }
        platformExtStore.getState().setState({
            ...shared,
            platform: DEVANT_PLATFORM,
            ...(devant ? { devant: { ...devantState(), ...devant } } : {}),
        });
    }

    // ---- state ----

    public async initStateSubscription(_messenger: Messenger) {
        // The WSO2 Cloud manager pushes the store to the webview, whichever platform fills it.
        if (!(await this.getGate())) {
            return;
        }
        if (!platformExtStore.persist.hasHydrated()) {
            await platformExtStore.persist.rehydrate();
        }
        let projectPath = StateMachine.context()?.projectPath;
        await this.initSessionState(projectPath);
        if (projectPath && isDevant()) {
            this.debouncedRefreshConnectionList();
        }
        // The disposer is kept on the manager: a debounced function returns the previous call's result.
        const debouncedInitProjectPathWatcher = debounce(async (nextPath: string) => {
            this.disposeProjectPathWatcher?.();
            this.disposeProjectPathWatcher = undefined;
            if (isDevant()) {
                this.disposeProjectPathWatcher = await this.initProjectPathWatcher(nextPath);
            }
        }, 250);
        StateMachine.service().subscribe((state) => {
            if (state.context?.projectPath && !isSamePath(state.context?.projectPath, projectPath)) {
                projectPath = state.context?.projectPath;
                debouncedInitProjectPathWatcher(projectPath);
            }
        });
        // Sign-in, sign-out, an organization or platform switch replace the key; the store is subscribed again.
        const debouncedSessionChange = debounce(() => {
            this.initSessionState(projectPath).catch((err) => log(`Failed to follow the Devant session change: ${err}`));
        }, 250);
        onDidChangeCloudSessions(debouncedSessionChange);
        this.initConnectionRefetch();
    }

    /** Fills the store from the current session and subscribes it there; on another platform only drops what it held. */
    private async initSessionState(projectPath: string | undefined) {
        this.sessionSubscriptions.forEach((unsubscribe) => unsubscribe());
        this.sessionSubscriptions = [];
        clearTimeout(this.rereadTimer);
        if (!isDevant()) {
            this.disposeProjectPathWatcher?.();
            this.disposeProjectPathWatcher = undefined;
            return;
        }
        // WSO2 Cloud's fields go: the Devant screens read `devant`.
        this.update(
            { integrations: [], selectedIntegration: undefined, selectedContext: undefined, envs: [], selectedEnv: undefined, envsError: undefined },
            {},
        );
        await this.initAuthState();
        this.disposeProjectPathWatcher?.();
        this.disposeProjectPathWatcher = await this.initProjectPathWatcher(projectPath);
    }

    private async initAuthState() {
        const gate = await this.getGate();
        let connected: { api: CloudAPI; devant: DevantAPI } | undefined;
        let authState: ReturnType<CloudAPI["getAuthState"]> | undefined;
        let userInfo: DevantPlatformExtState["userInfo"] = null;
        let selectedContext: ContextItemEnriched | undefined;
        try {
            connected = await this.connect();
            authState = connected?.api.getAuthState();
            userInfo = connected?.devant.getAuthState().userInfo ?? null;
            selectedContext = filledFrom(connected?.devant.getSelectedContext() ?? undefined, devantState().selectedContext);
        } catch (error) {
            // A key replaced while this ran: the session change that replaced it runs this again.
            log(`Failed to read the Devant session from WSO2 Integrator: ${error}`);
            connected = undefined;
            authState = undefined;
        }
        const session = authState?.session ?? null;
        const isLoggedIn = !!session && authState?.status === "signed-in";
        const cloudAccess = gate ? cloudAccessOf(gate, isLoggedIn) : undefined;
        if (!isLoggedIn) {
            // Signed out, the screens show no project.
            userInfo = null;
            selectedContext = undefined;
        }
        this.update({ session, isLoggedIn, cloudAccess }, { userInfo, selectedContext });
        noticeMissingCloudAccess(cloudAccess, () => this.requestCloudAccess());
        await this.refreshEnvironments(selectedContext);
        if (!connected) {
            return;
        }
        const { api, devant } = connected;
        if (isLoggedIn) {
            this.scheduleDetailsReread();
        }

        this.sessionSubscriptions.push(api.subscribeAuthState((state) => {
            const signedIn = !!state.session && state.status === "signed-in";
            this.update(
                { session: state.session, isLoggedIn: signedIn, cloudAccess: signedIn ? "connected" : "signed-out" },
                signedIn ? undefined : { userInfo: null, selectedContext: undefined },
            );
            if (signedIn) {
                this.scheduleDetailsReread();
            }
        }));

        this.sessionSubscriptions.push(devant.subscribeAuthState((state) => {
            this.update({}, { userInfo: state.userInfo });
        }));

        const debouncedEnvListRefresh = debounce((context?: ContextItemEnriched) => this.refreshEnvironments(context), 1000);
        this.sessionSubscriptions.push(devant.subscribeContextState((context) => {
            const signedIn = platformExtStore.getState().state?.isLoggedIn;
            const selectedContext = signedIn ? filledFrom(context, devantState().selectedContext) : undefined;
            this.update({}, { selectedContext });
            debouncedEnvListRefresh(selectedContext);
        }));
    }

    /**
     * WSO2 Integrator fetches the person's Devant details after a sign-in
     * change, and the organization of the selected context comes from them,
     * so they are read again until they are there.
     */
    private scheduleDetailsReread(attempt = 0) {
        clearTimeout(this.rereadTimer);
        this.rereadTimer = setTimeout(() => void this.rereadDetails(attempt), 1000 * 2 ** attempt);
    }

    private async rereadDetails(attempt: number) {
        if (!isDevant() || !platformExtStore.getState().state?.isLoggedIn) {
            return;
        }
        try {
            const devant = await this.getDevant({ silent: true });
            if (!devant) {
                return;
            }
            const userInfo = devant.getAuthState().userInfo;
            const previous = devantState().selectedContext;
            const selectedContext = filledFrom(devant.getSelectedContext() ?? undefined, previous);
            this.update({}, { userInfo, selectedContext });
            if (selectedContext?.project?.id !== previous?.project?.id || selectedContext?.org?.id !== previous?.org?.id) {
                await this.refreshEnvironments(selectedContext);
            }
            const incomplete = !userInfo || (!!selectedContext && (!selectedContext.org || !selectedContext.project));
            if (incomplete && platformExtStore.getState().state?.isLoggedIn && attempt < MAX_DETAIL_REREADS) {
                this.scheduleDetailsReread(attempt + 1);
            }
        } catch (err) {
            log(`Failed to read the Devant user details: ${err}`);
        }
    }

    /** The project's environments; the selection survives a refresh, else the first. */
    private async refreshEnvironments(context?: ContextItemEnriched) {
        if (!context?.org || !context?.project) {
            this.update({}, { envs: [], selectedEnv: undefined });
            return;
        }
        try {
            const devant = await this.getDevant();
            if (!devant) {
                return;
            }
            const envs = await devant.getProjectEnvs({
                orgId: context.org.id?.toString(),
                orgUuid: context.org.uuid,
                projectId: context.project.id,
            });
            // A list that comes back after the selection moved to another project is dropped.
            if (devantState().selectedContext?.project?.id !== context.project.id) {
                return;
            }
            const selectedEnv = envs.find((env) => env.id === devantState().selectedEnv?.id) || envs[0];
            this.update({}, { envs, selectedEnv });
        } catch (err) {
            log(`Failed to list the environments of ${context.project.name}: ${err}`);
        }
    }

    private async initProjectPathWatcher(projectPath: string | undefined): Promise<(() => void) | undefined> {
        let devant: DevantAPI | undefined;
        let components: ComponentKind[] = [];
        let matchingComponent: ComponentKind | undefined;
        let hasLocalChanges = false;
        let hasProjectYaml = false;
        const selectedId = () => devantState().selectedComponent?.metadata?.id;
        try {
            devant = await this.getDevant();
            if (projectPath) {
                components = devant?.getDirectoryComponents(projectPath) ?? [];
                matchingComponent = components.find((item) => item.metadata?.id === selectedId());
                hasLocalChanges = (await devant?.localRepoHasChanges(projectPath)) ?? false;
                hasProjectYaml = hasDevantContextYaml(projectPath);
                this.debouncedRefreshConnectionList();
            }
        } catch (err) {
            log(`Failed to read the Devant components of ${projectPath}: ${err}`);
        }

        this.update(
            { hasLocalChanges, hasPossibleComponent: components.length > 0 || hasProjectYaml },
            { components, selectedComponent: matchingComponent || components[0] },
        );

        if (!projectPath || !devant) {
            return undefined;
        }
        return devant.subscribeDirComponents(projectPath, (components) => {
            const hasProjectYaml = hasDevantContextYaml(projectPath);
            const matchingComponent = components.find((item) => item.metadata?.id === selectedId());
            this.update(
                { hasPossibleComponent: components.length > 0 || hasProjectYaml },
                { components, selectedComponent: matchingComponent || components[0] },
            );
        });
    }

    /** Refetches the connections when the component or the project changes; nothing is pushed to the webview here. */
    private initConnectionRefetch() {
        platformExtStore.subscribe((state, prevState) => {
            if (!isDevant() || state.state?.platform !== DEVANT_PLATFORM) {
                return;
            }
            const next = state.state?.devant;
            const prev = prevState?.state?.devant;
            let refetchConnections = false;
            if (!state.state?.isLoggedIn && prevState?.state?.isLoggedIn) {
                // signing out keeps the last list until the next refresh
            } else if (next?.selectedComponent && next.selectedComponent.metadata?.id !== prev?.selectedComponent?.metadata?.id) {
                refetchConnections = true;
            } else if (next?.selectedContext?.project && next.selectedContext.project.id !== prev?.selectedContext?.project?.id) {
                platformExtStore.getState().setConnectionState({ list: [] });
                refetchConnections = true;
            }
            if (refetchConnections) {
                this.debouncedRefreshConnectionList();
            }
        });
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

    /** Reads the session again without asking, for access granted from the Accounts menu. */
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

    // ---- Devant's API ----

    async getMarketplaceItems(params: GetMarketplaceListReq): Promise<MarketplaceListResp> {
        try {
            return await this.withDevant((devant) => devant.getMarketplaceItems(params));
        } catch (err) {
            log(`Failed to invoke getMarketplaceItems: ${err}`);
        }
    }

    async getMarketplaceDatabases(params: { orgId: string }): Promise<MarketplaceDatabaseListResp> {
        try {
            return await this.withDevant((devant) => devant.getMarketplaceDatabases(params));
        } catch (err) {
            log(`Failed to invoke getMarketplaceDatabases: ${err}`);
        }
    }

    async getMarketplaceDatabaseItem(params: GetDatabaseItemReq): Promise<MarketplaceItem> {
        try {
            return await this.withDevant((devant) => devant.getMarketplaceDatabaseItem(params));
        } catch (err) {
            log(`Failed to invoke getMarketplaceDatabaseItem: ${err}`);
        }
    }

    async getDatabaseServer(params: GetDatabaseServerReq): Promise<DatabaseServer> {
        try {
            return await this.withDevant((devant) => devant.getDatabaseServer(params));
        } catch (err) {
            log(`Failed to invoke getDatabaseServer: ${err}`);
        }
    }

    async getDatabaseAdminCredential(params: GetDatabaseServerReq): Promise<DatabaseAdminCredential> {
        try {
            return await this.withDevant((devant) => devant.getDatabaseAdminCredential(params));
        } catch (err) {
            log(`Failed to invoke getDatabaseAdminCredential: ${err}`);
        }
    }

    async getDatabaseCredentials(params: GetDatabaseServerReq): Promise<DatabaseCredential[]> {
        try {
            return await this.withDevant((devant) => devant.getDatabaseCredentials(params));
        } catch (err) {
            log(`Failed to invoke getDatabaseCredentials: ${err}`);
        }
    }

    async createDatabaseConnection(params: CreateDatabaseConnectionReq): Promise<ConnectionDetailed> {
        try {
            return await this.withDevant((devant) => devant.createDatabaseConnection(params));
        } catch (err) {
            log(`Failed to invoke createDatabaseConnection: ${err}`);
        }
    }

    async getMarketplaceItem(params: GetMarketplaceItemReq): Promise<MarketplaceItem> {
        try {
            return await this.withDevant((devant) => devant.getMarketplaceItem(params));
        } catch (err) {
            log(`Failed to invoke getMarketplaceItem: ${err}`);
        }
    }

    async getMarketplaceIdl(params: GetMarketplaceIdlReq): Promise<MarketplaceIdlResp> {
        try {
            return await this.withDevant((devant) => devant.getMarketplaceIdl(params));
        } catch (err) {
            log(`Failed to invoke getMarketplaceIdl: ${err}`);
        }
    }

    async getConnections(params: GetConnectionsReq): Promise<ConnectionListItem[]> {
        try {
            return await this.withDevant((devant) => devant.getConnections(params));
        } catch (err) {
            log(`Failed to invoke getConnections: ${err}`);
        }
    }

    async getConnection(params: GetConnectionItemReq): Promise<ConnectionDetailed> {
        try {
            return await this.withDevant((devant) => devant.getConnection(params));
        } catch (err) {
            log(`Failed to invoke getConnection: ${err}`);
        }
    }

    /**
     * The project's components, as Devant answers them (`ComponentKind`): the Devant screens read their
     * `metadata`. The request's blanks are filled from the selected context.
     */
    async getIntegrationList(params: GetComponentsReq): Promise<Component[]> {
        try {
            const context = devantState().selectedContext;
            const request: GetComponentsReq = {
                orgId: params?.orgId || (context?.org?.id?.toString() ?? ""),
                orgHandle: params?.orgHandle || context?.org?.handle || context?.orgHandle || "",
                projectId: params?.projectId || context?.project?.id || "",
                projectHandle: params?.projectHandle || context?.project?.handler || context?.projectHandle || "",
            };
            const components = await this.withDevant((devant) => devant.getComponentList(request));
            return components as unknown as Component[];
        } catch (err) {
            log(`Failed to invoke getIntegrationList: ${err}`);
        }
    }

    async deleteLocalConnectionsConfig(params: DeleteLocalConnectionsConfigReq): Promise<void> {
        try {
            await this.withDevant((devant) => devant.deleteLocalConnectionsConfig(params));
        } catch (err) {
            log(`Failed to delete connection config: ${err}`);
        }
    }

    async getDevantConsoleUrl(): Promise<string> {
        try {
            return await this.withDevant((devant) => devant.getDevantConsoleUrl(), { silent: true });
        } catch (err) {
            // The console is known without a session.
            log(`Failed to read the Devant console URL from its API, using WSO2 Integrator's configuration: ${err}`);
            try {
                return (await this.getGate())?.getPlatformConfig().consoleUrl ?? "";
            } catch {
                return "";
            }
        }
    }

    async createConnectionConfig(params: CreateLocalConnectionsConfigReq): Promise<string> {
        try {
            return await this.withDevant((devant) => devant.createConnectionConfig(params));
        } catch (err) {
            log(`Failed to create connection config: ${err}`);
        }
    }

    async createThirdPartyConnection(params: CreateThirdPartyConnectionReq): Promise<ConnectionDetailed> {
        try {
            return await this.withDevant((devant) => devant.createThirdPartyConnection(params));
        } catch (err) {
            log(`Failed to create 3rd party connection: ${err}`);
        }
    }

    async getProjectEnvs(params: GetProjectEnvsReq): Promise<Environment[]> {
        try {
            const envs = await this.withDevant((devant) => devant.getProjectEnvs(params));
            return envs?.map(toEnvironment);
        } catch (err) {
            log(`Failed to get project environments: ${err}`);
        }
    }

    /** Devant's builds and deployments are not read here. */
    async getCloudIntegrationStatus(_params: CloudIntegrationStatusReq): Promise<CloudIntegrationStatus | undefined> {
        return undefined;
    }

    async resolveConnectionSecrets(params: ResolveConnectionSecretsReq): Promise<ResolveConnectionSecretsResp> {
        try {
            return await this.withDevant((devant) => devant.resolveConnectionSecrets(params));
        } catch (err) {
            log(`Failed to resolve connection secrets: ${err}`);
        }
    }

    async createInternalConnection(params: CreateInternalConnectionReq): Promise<ConnectionDetailed> {
        try {
            // Devant fills the connection's own variables; the configurables WSO2 Cloud links are not sent.
            const { configurableName: _url, apiKeyConfigurableName: _apiKey, ...request } = params;
            return await this.withDevant((devant) => devant.createComponentConnection(request));
        } catch (err) {
            log(`Failed to create Devant connection: ${err}`);
        }
    }

    async stopProxyServer(params: StopProxyServerReq): Promise<void> {
        try {
            await this.withDevant((devant) => devant.stopProxyServer(params), {});
        } catch (err) {
            log(`Failed to stop proxy server: ${err}`);
        }
    }

    setSelectedIntegration(integrationId: string): void {
        const selectedComponent = devantState().components?.find((item) => isComponent(item, integrationId));
        if (selectedComponent) {
            this.update({}, { selectedComponent });
        }
    }

    setSelectedEnv(envId: string): void {
        const selectedEnv = devantState().envs?.find((item) => item?.id === envId);
        if (selectedEnv) {
            this.update({}, { selectedEnv });
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

        // Asks whenever there is more than one scope: this panel is where the person chooses the classification.
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
            buildPackLang: "ballerina",
            workspaceDir: StateMachine.context().workspacePath || StateMachine.context().projectPath,
            integrations: [{
                fsPath: StateMachine.context().projectPath,
                supportedIntegrationTypes: [integrationType],
                name: project?.projectTitle || project?.projectName,
            }],
        };
        vscode.commands.executeCommand(WICommandIds.CreateNewComponent, deployementParams);
    }

    /** The selected component's connections, then the project's. */
    async getAllConnections(): Promise<ConnectionListItem[]> {
        try {
            const state = platformExtStore.getState().state;
            const { selectedContext, selectedComponent } = devantState();
            if (!state?.isLoggedIn || !selectedContext?.project?.id) {
                return [];
            }
            const orgId = selectedContext.org?.id?.toString();
            const projectId = selectedContext.project.id;
            return await this.withDevant(async (devant) => {
                const [projectConnections, componentConnections] = await Promise.all([
                    devant.getConnections({ orgId, projectId, componentId: "" }),
                    selectedComponent
                        ? devant.getConnections({ orgId, projectId, componentId: selectedComponent.metadata?.id })
                        : Promise.resolve([] as ConnectionListItem[]),
                ]);
                return [...(componentConnections ?? []), ...(projectConnections ?? [])];
            }, {});
        } catch (err) {
            log(`Failed to get all connections: ${err}`);
        }
    }

    /** Starts Devant's proxy for a run or debug session that connects to Devant, and stops it when the session ends. */
    async setupDevantProxyForDebugging(debugConfig: vscode.DebugConfiguration): Promise<void> {
        const devantProxyResp = await this.startProxyServer(debugConfig);

        if (devantProxyResp?.proxyServerPort) {
            debugConfig.env = { ...(debugConfig.env || {}), ...devantProxyResp.envVars };
            if (devantProxyResp.requiresProxy) {
                debugConfig.env[ProxyConfigEnvVars.proxyHost.envName] = "127.0.0.1";
                debugConfig.env[ProxyConfigEnvVars.proxyPort.envName] = `${devantProxyResp.proxyServerPort}`;
            } else {
                delete debugConfig.env[ProxyConfigEnvVars.proxyHost.envName];
                delete debugConfig.env[ProxyConfigEnvVars.proxyPort.envName];
            }

            const disposable = vscode.debug.onDidTerminateDebugSession((session) => {
                if (session.configuration === debugConfig) {
                    this.stopProxyServer({ proxyPort: devantProxyResp.proxyServerPort });
                    disposable.dispose();
                }
            });
        }
    }

    async startProxyServer(
        debugConfig: vscode.DebugConfiguration,
    ): Promise<(StartProxyServerResp & { requiresProxy: boolean }) | undefined> {
        try {
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

            const state = platformExtStore.getState().state;
            // A run right after start-up: WSO2 Integrator may not have read the project yet.
            const pending = devantState().selectedContext;
            if (state?.isLoggedIn && pending && (!pending.org || !pending.project)) {
                await this.rereadDetails(MAX_DETAIL_REREADS);
            }
            const { selectedContext, selectedComponent, selectedEnv } = devantState();
            // Signed in through WSO2 Integrator, but this extension may not use the sign-in yet: say so rather than run without the connections.
            if (debugConfig.request === "launch" && (requiresProxy || debugConfig?.choreoConnect) && isCloudAccessMissing(state?.cloudAccess)) {
                const allowAccess = "Allow Access";
                void Promise.resolve(
                    window.showWarningMessage(
                        `${describeCloudAccess(state?.cloudAccess)} Running without WSO2 Cloud connections; allow access to use them.`,
                        allowAccess,
                    ),
                ).then((choice) => (choice === allowAccess ? this.requestCloudAccess() : undefined));
                return { envVars: {}, proxyServerPort: 0, requiresProxy: false };
            }
            if (debugConfig.request === "launch" && debugConfig?.choreoConnect) {
                if (!state?.isLoggedIn) {
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

                if (!selectedContext?.project) {
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

            if (
                debugConfig.request === "launch" &&
                state?.isLoggedIn &&
                selectedContext?.org &&
                selectedContext?.project &&
                state?.devantConns?.connectedToDevant
            ) {
                const resp = await window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Connecting to WSO2 Cloud before running/debugging the application...",
                    },
                    () =>
                        this.withDevant((devant) =>
                            devant.startProxyServer({
                                orgId: selectedContext.org.id?.toString(),
                                project: debugConfig?.choreoConnect?.project || selectedContext.project.id,
                                component: debugConfig?.choreoConnect?.component || selectedComponent?.metadata?.id || "",
                                env: debugConfig?.choreoConnect?.env || selectedEnv?.name || "",
                                skipConnection: debugConfig?.choreoConnect?.skipConnection || [],
                            }),
                        ),
                );
                return { ...resp, requiresProxy };
            }
            return { envVars: {}, proxyServerPort: 0, requiresProxy };
        } catch (err) {
            log(`Failed to start the Devant proxy for the run: ${err}`);
            return { envVars: {}, proxyServerPort: 0, requiresProxy: false };
        }
    }

    async deleteBiDevantConnection(params: DeleteBiDevantConnectionReq): Promise<void> {
        try {
            StateMachine.setEditMode();
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
                    const devantUrl = await this.getDevantConsoleUrl();

                    const selected = devantState().selectedContext;
                    const matchingConnListItem = platformExtStore
                        .getState()
                        .state?.devantConns?.list?.find(
                            (connItem) => connItem.name?.replaceAll("-", "_").replaceAll(" ", "_") === connectionName,
                        );
                    if (matchingConnListItem) {
                        await this.deleteLocalConnectionsConfig({
                            componentDir: projectPath,
                            connectionName: matchingConnListItem.name,
                        });
                        if (matchingConnListItem?.componentId) {
                            await this.withDevant((devant) =>
                                devant.deleteConnection({
                                    componentPath: projectPath,
                                    connectionId: matchingConnListItem.groupUuid,
                                    connectionName: matchingConnListItem.name,
                                    orgId: selected?.org?.id?.toString(),
                                }),
                            );
                        } else {
                            window
                                .showInformationMessage(
                                    "In-order to delete your project level WSO2 Cloud connection, please head over to WSO2 Cloud console",
                                    "Open WSO2 Cloud",
                                )
                                .then((resp) => {
                                    if (resp === "Open WSO2 Cloud") {
                                        vscode.env.openExternal(
                                            Uri.parse(
                                                `${devantUrl}/organizations/${selected?.org?.handle}/projects/${selected?.project?.handler}/admin/connections`,
                                            ),
                                        );
                                    }
                                });
                        }
                    }
                }
            }

            this.refreshConnectionList();
            StateMachine.setReadyMode();
        } catch (err) {
            StateMachine.setReadyMode();
            window.showErrorMessage(`Failed to delete WSO2 Cloud connection: ${(err as Error).message}`);
            log(`Failed to invoke deleteBiDevantConnection: ${err}`);
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
            // Devant's names of a connection's variables.
            interface Ikeys {
                ChoreoAPIKey?: IkeyVal;
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

                if (connectionKeys[entry.id]) {
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
                Object.values(keys).map((item: IkeyVal) => ({ configName: item.keyname, configEnvName: item.envName })),
            );

            // Organization and project services are reached through Devant's proxy in a local run.
            const requireProxy = ([ServiceInfoVisibilityEnum.Organization, ServiceInfoVisibilityEnum.Project] as string[]).includes(
                params.visibility,
            );

            if (requireProxy) {
                await addProxyConfigurable(configFileUri);
            }

            const resp = await addConnection(params.name, moduleName, params.securityType, requireProxy, {
                apiKeyVarName: keys?.ChoreoAPIKey?.keyname,
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
            log(`Failed to initialize Devant connection: ${err}`);
        }
    }

    async generateCustomConnectorFromOAS(
        params: GenerateCustomConnectorFromOASReq,
    ): Promise<GenerateCustomConnectorFromOASResp> {
        try {
            const projectPath = StateMachine.context().projectPath;

            const serviceIdl = await this.withDevant((devant) =>
                devant.getMarketplaceIdl({
                    orgId: devantState().selectedContext?.org?.id?.toString(),
                    serviceId: params.marketplaceItem.serviceId,
                }),
            );

            const choreoDir = path.join(projectPath, ".wso2");
            if (!fs.existsSync(choreoDir)) {
                fs.mkdirSync(choreoDir, { recursive: true });
            }

            const moduleName = params.connectionName.replace(/[_\-\s]/g, "")?.toLowerCase();
            const filePath = path.join(choreoDir, `${moduleName}-spec.yaml`);

            if (serviceIdl?.idlType === "OpenAPI" && serviceIdl.content) {
                const updatedDef = processOpenApiWithApiKeyAuth(serviceIdl.content, params.securityType, DEVANT_API_KEY_HEADER);
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

    /** Registers a third-party service in the organization's marketplace, with a value per environment. */
    async registerDevantMarketplaceService(params: RegisterDevantMarketplaceServiceReq): Promise<MarketplaceItem> {
        try {
            const selectedContext = devantState().selectedContext;
            const orgId = selectedContext?.org?.id?.toString();
            return await this.withDevant(async (devant) => {
                const marketplaceItems = await devant.getMarketplaceItems({
                    orgId,
                    request: {
                        query: params.name,
                        limit: 100,
                        networkVisibilityFilter: "all",
                        sortBy: "createdTime",
                    },
                });

                let idlContent = "";
                if (params.idlFilePath) {
                    const idlFileContent = await fs.promises.readFile(params.idlFilePath, { encoding: "utf-8" });
                    idlContent = Buffer.from(idlFileContent).toString("base64");
                }

                const envs = await devant.getProjectEnvs({
                    orgId,
                    orgUuid: selectedContext?.org?.uuid,
                    projectId: selectedContext?.project?.id,
                });

                // A production environment's values are left for the person to set in Devant.
                const configs: RegisterMarketplaceConfigMap = {};
                for (const env of envs) {
                    const endpointName = `${env.name}Endpoint`;
                    configs[endpointName] = {
                        name: endpointName,
                        environmentTemplateIds: [env.templateId],
                        values: params.configs?.map((item) => ({ key: item.id, value: env.critical ? "" : item.value || "" })),
                    };
                }

                const registeredMarketplaceItem = await devant.registerMarketplaceConnection({
                    orgId,
                    orgUuid: selectedContext?.org?.uuid,
                    projectId: selectedContext?.project?.id,
                    serviceType: params.serviceType,
                    idlType: params.idlType as Parameters<DevantAPI["registerMarketplaceConnection"]>[0]["idlType"],
                    idlContent,
                    configs,
                    schemaEntries: params.configs?.map((item) => ({
                        name: item.id,
                        type: "string",
                        isSensitive: item.isSecret,
                    })),
                    name: findUniqueConnectionName(params.name, marketplaceItems?.data ?? []),
                });

                return devant.getMarketplaceItem({ orgId, serviceId: registeredMarketplaceItem.serviceId });
            });
        } catch (err) {
            window.showErrorMessage(`Failed to create WSO2 Cloud connection: ${(err as Error).message}`);
            log(`Failed to invoke registerDevantMarketplaceService: ${err}`);
        }
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
                if (matchingConfigEntry && matchingNode) {
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
                    configBalEdits.insert(getConfigFileUri(), new vscode.Position(0, 0), Templates.importBalOs());
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
        // A refresh queued before a switch to another platform would overwrite that platform's list.
        if (!isDevant()) {
            return;
        }
        try {
            platformExtStore.getState().setConnectionState({ loading: true });
            const connections = await this.getAllConnections();
            if (isDevant()) {
                platformExtStore.getState().setConnectionState({ list: connections ?? [], loading: false });
            }
        } catch (err) {
            platformExtStore.getState().setConnectionState({ loading: false });
            log(`Failed to refresh connection list: ${err}`);
        }
    }
}
