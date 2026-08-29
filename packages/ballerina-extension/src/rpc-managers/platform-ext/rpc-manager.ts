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
    isSamePath,
} from "@wso2/ballerina-core";
import { Uri, window, WorkspaceEdit } from "vscode";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
    ConnectionListItem,
    DeleteLocalConnectionsConfigReq,
    GetConnectionsReq,
    GetMarketplaceIdlReq,
    GetMarketplaceItemReq,
    GetMarketplaceListReq,
    IWso2PlatformExtensionAPI,
    MarketplaceIdlResp,
    MarketplaceItem,
    MarketplaceListResp,
    ServiceInfoVisibilityEnum,
    GetConnectionItemReq,
    StartProxyServerResp,
    StopProxyServerReq,
    ConnectionDetailed,
    DevantScopes,
    ICreateComponentCmdParams,
    ComponentKind,
    ICmdParamsBase,
    RegisterMarketplaceConfigMap,
    Project,
    Organization,
    CreateLocalConnectionsConfigReq,
    CreateThirdPartyConnectionReq,
    CreateComponentConnectionReq,
    GetComponentsReq,
    MarketplaceDatabaseListResp,
    DatabaseServer,
    GetDatabaseServerReq,
    DatabaseAdminCredential,
    DatabaseCredential,
    Environment,
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
    DeleteDevantTempConfigReq,
    GenerateCustomConnectorFromOASReq,
    GenerateCustomConnectorFromOASResp,
    InitializeDevantOASConnectionReq,
    InitializeDevantOASConnectionResp,
    RegisterDevantMarketplaceServiceReq,
    ReplaceDevantTempConfigValuesReq,
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
    addProxyConfigurable,
    findUniqueConnectionName,
    getConfigFileUri,
    hasContextYaml,
    processOpenApiWithApiKeyAuth,
    ProxyConfigEnvVars,
    Templates,
} from "./platform-utils";
import { debounce } from "lodash";
import { BiDiagramRpcManager } from "../bi-diagram/rpc-manager";
import { updateSourceCode, WI_EXTENSION_ID } from "../../utils";

export class PlatformExtRpcManager implements PlatformExtAPI {
    static platformExtAPI: IWso2PlatformExtensionAPI | undefined;
    private async getPlatformExt() {
        if (PlatformExtRpcManager.platformExtAPI) {
            return PlatformExtRpcManager.platformExtAPI;
        }
        const platformExt = vscode.extensions.getExtension(WI_EXTENSION_ID);
        if (!platformExt) {
            return undefined;
        }
        if (!platformExt.isActive) {
            await platformExt.activate();
        }
        platformExtStore.getState().setState({ isExtInstalled: true });
        const platformExtAPI: IWso2PlatformExtensionAPI = platformExt.exports?.cloudAPIs;
        await this.waitForExtensionActive(platformExtAPI);            
        PlatformExtRpcManager.platformExtAPI = platformExtAPI;
        return platformExtAPI;
    }

    // Wait for devant features to activate
    private async waitForExtensionActive(platformExtAPI: IWso2PlatformExtensionAPI, timeoutMs: number = 30000): Promise<void> {
        const startTime = Date.now();
        while (!platformExtAPI?.isActive()) {
            if (Date.now() - startTime > timeoutMs) {
                log("Timeout: Platform extension failed to activate within 30 seconds");
                throw new Error("WI extension cloud features activation timeout");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    public async initStateSubscription(messenger: Messenger) {
        // if extension is not installed, the store will not be rehydrated
        const platformExt = await this.getPlatformExt();
        if (!platformExt) {
            return;
        }
        await platformExtStore.persist.rehydrate();
        await this.initAuthState();
        let projectPath = StateMachine.context()?.projectPath;
        let disposeProjectPathWatcher = await this.initProjectPathWatcher(projectPath);
        if (projectPath) {
            this.debouncedRefreshConnectionList();
        }
        await this.initFileWatcher();
        const debouncedInitProjectPathWatcher = debounce(
            async (projectPath: string) => await this.initProjectPathWatcher(projectPath),
            250,
        );
        StateMachine.service().subscribe(async (state) => {
            if (state.context?.projectPath && !isSamePath(state.context?.projectPath, projectPath)) {
                projectPath = state.context?.projectPath;
                if (disposeProjectPathWatcher) {
                    disposeProjectPathWatcher();
                }

                disposeProjectPathWatcher = await debouncedInitProjectPathWatcher(projectPath);
            }
        });

        await this.initSelfStoreSubscription(messenger);
    }

    private async initAuthState() {
        const platformExt = await this.getPlatformExt();
        const userInfo = platformExt?.getAuthState().userInfo;
        const selectedContext = platformExt?.getSelectedContext();
        platformExtStore.getState().setState({ userInfo, isLoggedIn: !!userInfo, selectedContext });

        if (selectedContext?.project) {
            const envs = await platformExt?.getProjectEnvs({
                orgId: selectedContext?.org?.id?.toString(),
                orgUuid: selectedContext?.org?.uuid,
                projectId: selectedContext?.project?.id,
            });
            const selectedEnv =
                envs.find((env) => env.id === platformExtStore.getState().state?.selectedEnv?.id) || envs[0];
            platformExtStore.getState().setState({ envs, selectedEnv });
        }

        platformExt?.subscribeAuthState((authState) => {
            platformExtStore.getState().setState({ userInfo: authState.userInfo, isLoggedIn: !!authState.userInfo });
        });

        const debouncedEnvListRefresh = debounce(async (org?: Organization, project?: Project) => {
            if (org && project) {
                const envs = await platformExt?.getProjectEnvs({
                    orgId: org.id?.toString(),
                    orgUuid: org.uuid,
                    projectId: project.id,
                });
                const selectedEnv =
                    envs.find((env) => env.id === platformExtStore.getState().state?.selectedEnv?.id) || envs[0];
                platformExtStore.getState().setState({ envs, selectedEnv });
            }
        }, 1000);

        platformExt?.subscribeContextState(async (selectedContext) => {
            platformExtStore.getState().setState({ selectedContext });
            debouncedEnvListRefresh(selectedContext?.org, selectedContext?.project);
        });
    }

    private async initFileWatcher() {
        const platformExt = await this.getPlatformExt();
        const debouncedOnFilChange = debounce(async () => {
            if (StateMachine.context().projectPath) {
                const hasLocalChanges = await platformExt?.localRepoHasChanges(StateMachine.context().projectPath);
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
        let components: ComponentKind[] = [];
        let matchingComponent: ComponentKind;
        let hasLocalChanges = false;
        let hasProjectYaml = false;
        if (projectPath) {
            components = platformExt?.getDirectoryComponents(projectPath);
            matchingComponent = components.find(
                (item) => platformExtStore.getState().state?.selectedComponent?.metadata?.id === item.metadata?.id,
            );
            hasLocalChanges = await platformExt?.localRepoHasChanges(projectPath);
            hasProjectYaml = hasContextYaml(projectPath);
            await this.debouncedRefreshConnectionList();
        }

        platformExtStore.getState().setState({
            components,
            selectedComponent: matchingComponent || components[0],
            hasLocalChanges,
            hasPossibleComponent: components.length > 0 || hasProjectYaml,
        });

        const unsubscribeDirCompWatcher = platformExt?.subscribeDirComponents(projectPath, (components) => {
            const hasProjectYaml = hasContextYaml(projectPath);
            const matchingComponent = components.find(
                (item) => platformExtStore.getState().state?.selectedComponent?.metadata?.id === item.metadata?.id,
            );
            platformExtStore.getState().setState({
                components,
                selectedComponent: matchingComponent || components[0],
                hasPossibleComponent: components.length > 0 || hasProjectYaml,
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
                // if user is logging out
                // todo: check if this needs to be enabled again
                // platformExtStore.getState().setState({connections: []});
            } else if (
                state.state?.selectedComponent &&
                state.state?.selectedComponent.metadata?.id !== prevState?.state?.selectedComponent?.metadata?.id
            ) {
                // if component selection has changed
                // todo: remove connections related to previous component
                // todo: test after applying fix to support multiple components
                // platformExtStore.getState().setState({connections: platformExtStore.getState().state?.connections?.filter(item=>item.componentId)});
                refetchConnections = true;
            } else if (
                state.state?.selectedContext?.project &&
                state.state?.selectedContext?.project?.id !== prevState.state?.selectedContext?.project?.id
            ) {
                // if project selection has changed
                platformExtStore.getState().setConnectionState({ list: [] });
                refetchConnections = true;
            }

            if (refetchConnections) {
                this.debouncedRefreshConnectionList();
            }
        });
    }

    async getMarketplaceItems(params: GetMarketplaceListReq): Promise<MarketplaceListResp> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getMarketplaceItems(params);
        } catch (err) {
            log(`Failed to invoke getMarketplaceItems: ${err}`);
        }
    }

    async getMarketplaceDatabases(params: { orgId: string }): Promise<MarketplaceDatabaseListResp> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getMarketplaceDatabases(params);
        } catch (err) {
            log(`Failed to invoke getMarketplaceDatabases: ${err}`);
        }
    }

    async getMarketplaceDatabaseItem(params: GetDatabaseItemReq): Promise<MarketplaceItem> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getMarketplaceDatabaseItem(params);
        } catch (err) {
            log(`Failed to invoke getMarketplaceDatabaseItem: ${err}`);
        }
    }

    async getDatabaseServer(params: GetDatabaseServerReq): Promise<DatabaseServer> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getDatabaseServer(params);
        } catch (err) {
            log(`Failed to invoke getDatabaseServer: ${err}`);
        }
    }

    async getDatabaseAdminCredential(params: GetDatabaseServerReq): Promise<DatabaseAdminCredential> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getDatabaseAdminCredential(params);
        } catch (err) {
            log(`Failed to invoke getDatabaseAdminCredential: ${err}`);
        }
    }

    async getDatabaseCredentials(params: GetDatabaseServerReq): Promise<DatabaseCredential[]> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getDatabaseCredentials(params);
        } catch (err) {
            log(`Failed to invoke getDatabaseCredentials: ${err}`);
        }
    }

    async createDatabaseConnection(params: CreateDatabaseConnectionReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.createDatabaseConnection(params);
        } catch (err) {
            log(`Failed to invoke createDatabaseConnection: ${err}`);
        }
    }

    async getMarketplaceItem(params: GetMarketplaceItemReq): Promise<MarketplaceItem> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getMarketplaceItem(params);
        } catch (err) {
            log(`Failed to invoke getMarketplaceItem: ${err}`);
        }
    }

    async getMarketplaceIdl(params: GetMarketplaceIdlReq): Promise<MarketplaceIdlResp> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getMarketplaceIdl(params);
        } catch (err) {
            log(`Failed to invoke getMarketplaceIdl: ${err}`);
        }
    }

    async getConnections(params: GetConnectionsReq): Promise<ConnectionListItem[]> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getConnections(params);
        } catch (err) {
            log(`Failed to invoke getConnections: ${err}`);
        }
    }

    async getConnection(params: GetConnectionItemReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getConnection(params);
        } catch (err) {
            log(`Failed to invoke getConnection: ${err}`);
        }
    }

    async getComponentList(params: GetComponentsReq): Promise<ComponentKind[]> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.getComponentList(params);
        } catch (err) {
            log(`Failed to invoke getComponentList: ${err}`);
        }
    }

    async deleteLocalConnectionsConfig(params: DeleteLocalConnectionsConfigReq): Promise<void> {
        try {
            const platformExt = await this.getPlatformExt();
            platformExt?.deleteLocalConnectionsConfig(params);
        } catch (err) {
            log(`Failed to delete connection config: ${err}`);
        }
    }

    async getDevantConsoleUrl(): Promise<string> {
        try {
            const platformExt = await this.getPlatformExt();
            return await platformExt?.getDevantConsoleUrl();
        } catch (err) {
            log(`Failed to delete connection config: ${err}`);
        }
    }

    async createConnectionConfig(params: CreateLocalConnectionsConfigReq): Promise<string> {
        try {
            const platformExt = await this.getPlatformExt();
            return await platformExt?.createConnectionConfig(params);
        } catch (err) {
            log(`Failed to create connection config: ${err}`);
        }
    }

    async createThirdPartyConnection(params: CreateThirdPartyConnectionReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.getPlatformExt();
            return await platformExt?.createThirdPartyConnection(params);
        } catch (err) {
            log(`Failed to create 3rd party connection: ${err}`);
        }
    }

    async getProjectEnvs(params: GetProjectEnvsReq): Promise<Environment[]> {
        try {
            const platformExt = await this.getPlatformExt();
            return await platformExt?.getProjectEnvs(params);
        } catch (err) {
            log(`Failed to get project environments: ${err}`);
        }
    }

    async resolveConnectionSecrets(params: ResolveConnectionSecretsReq): Promise<ResolveConnectionSecretsResp> {
        try {
            const platformExt = await this.getPlatformExt();
            return await platformExt?.resolveConnectionSecrets(params);
        } catch (err) {
            log(`Failed to resolve connection secrets: ${err}`);
        }
    }

    async createInternalConnection(params: CreateComponentConnectionReq): Promise<ConnectionDetailed> {
        try {
            const platformExt = await this.getPlatformExt();
            return await platformExt?.createComponentConnection(params);
        } catch (err) {
            log(`Failed to create WSO2 Cloud connection: ${err}`);
        }
    }

    async stopProxyServer(params: StopProxyServerReq): Promise<void> {
        try {
            const platformExt = await this.getPlatformExt();
            return platformExt?.stopProxyServer(params);
        } catch (err) {
            log(`Failed to stop proxy server: ${err}`);
        }
    }

    setSelectedComponent(componentId: string): void {
        const selectedComponent = platformExtStore
            .getState()
            .state?.components?.find((item) => item.metadata?.id === componentId);
        if (selectedComponent) {
            platformExtStore.getState().setState({ selectedComponent });
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
                .map((svc) => findDevantScope(svc?.kind, svc?.moduleName))
                .filter((svc) => svc !== undefined);
            scopes.push(...Array.from(new Set(svcScopes)));
        }
        if (automation?.length > 0) {
            scopes.push(DevantScopes.AUTOMATION);
        }

        let integrationType: DevantScopes;

        if (scopes.length === 1) {
            integrationType = scopes[0];
        } else if (scopes?.length > 1) {
            const selectedScope = await window.showQuickPick(scopes, {
                placeHolder:
                    "You have multiple artifact types within this project. Select the artifact type to be deployed",
            });
            if (!selectedScope) {
                return;
            }
            integrationType = selectedScope as DevantScopes;
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
            const platformExt = await this.getPlatformExt();
            if (
                platformExtStore.getState().state.isLoggedIn &&
                platformExtStore.getState().state.selectedContext?.project?.id
            ) {
                const projectPromise = platformExt?.getConnections({
                    orgId: platformExtStore.getState().state.selectedContext?.org?.id?.toString(),
                    projectId: platformExtStore.getState().state.selectedContext?.project?.id,
                    componentId: "",
                });

                const componentPromise: Promise<ConnectionListItem[]> = platformExtStore.getState().state
                    .selectedComponent
                    ? platformExt?.getConnections({
                          orgId: platformExtStore.getState().state.selectedContext?.org?.id?.toString(),
                          projectId: platformExtStore.getState().state.selectedContext?.project?.id,
                          componentId: platformExtStore.getState().state.selectedComponent?.metadata?.id,
                      })
                    : Promise.resolve([]);

                const [projectConnections, componentConnections] = await Promise.all([
                    projectPromise,
                    componentPromise,
                ]);

                return [...componentConnections, ...projectConnections];
            }
            return [];
        } catch (err) {
            log(`Failed to get all connections: ${err}`);
        }
    }

    async setupDevantProxyForDebugging(debugConfig: vscode.DebugConfiguration): Promise<void> {
        // check if choreoConnect is provided as param, if so use pass those as param
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
    ): Promise<StartProxyServerResp & { requiresProxy: boolean }> {
        // todo: need to take in params from config
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

                if (!platformExtStore.getState().state?.selectedContext?.project) {
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
                platformExtStore.getState().state?.isLoggedIn &&
                platformExtStore.getState().state?.selectedContext?.org &&
                platformExtStore.getState().state?.selectedContext?.project &&
                // todo: check and fetch configs of only the connections used
                // platformExtStore.getState().state?.devantConns?.list?.filter((item) => item.isUsed)?.length > 0 &&
                platformExtStore.getState().state?.devantConns?.connectedToDevant
            ) {
                // TODO: need to check whether at least one devant connection being used
                const resp = await window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: "Connecting to WSO2 Cloud before running/debugging the application...",
                    },
                    () =>
                        platformExt?.startProxyServer({
                            orgId: platformExtStore.getState().state?.selectedContext?.org?.id?.toString(),
                            project:
                                debugConfig?.choreoConnect?.project ||
                                platformExtStore.getState().state?.selectedContext?.project?.id,
                            component:
                                debugConfig?.choreoConnect?.component ||
                                platformExtStore.getState().state?.selectedComponent?.metadata?.id ||
                                "",
                            env:
                                debugConfig?.choreoConnect?.env ||
                                platformExtStore?.getState().state?.selectedEnv?.name ||
                                "",
                            skipConnection: debugConfig?.choreoConnect?.skipConnection || [],
                        }),
                );
                return { ...resp, requiresProxy };
            }
            return { envVars: {}, proxyServerPort: 0, requiresProxy };
        } catch (err) {
            log(`Failed to delete connection config: ${err}`);
            return { envVars: {}, proxyServerPort: 0, requiresProxy: false };
        }
    }

    async deleteBiDevantConnection(params: DeleteBiDevantConnectionReq): Promise<void> {
        try {
            StateMachine.setEditMode();
            const platformExt = await this.getPlatformExt();
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

                    const selected = platformExtStore.getState().state?.selectedContext;
                    const matchingConnListItem = platformExtStore
                        .getState()
                        .state?.devantConns?.list.find(
                            (connItem) => connItem.name?.replaceAll("-", "_").replaceAll(" ", "_") === connectionName,
                        );
                    if (matchingConnListItem) {
                        await this.deleteLocalConnectionsConfig({
                            componentDir: projectPath,
                            connectionName: matchingConnListItem.name,
                        });
                        if (matchingConnListItem?.componentId) {
                            await platformExt?.deleteConnection({
                                componentPath: projectPath,
                                connectionId: matchingConnListItem.groupUuid,
                                connectionName: matchingConnListItem.name,
                                orgId: selected.org.id.toString(),
                            });
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
                                                `${devantUrl}/organizations/${selected.org.handle}/projects/${selected.project.handler}/admin/connections`,
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

            const requireProxy = [
                ServiceInfoVisibilityEnum.Organization.toString(),
                ServiceInfoVisibilityEnum.Project.toString(),
            ].includes(params.visibility);

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
            log(`Failed to initialize WSO2 Cloud connection: ${err}`);
        }
    }

    async generateCustomConnectorFromOAS(
        params: GenerateCustomConnectorFromOASReq,
    ): Promise<GenerateCustomConnectorFromOASResp> {
        try {
            const platformExt = await this.getPlatformExt();
            const projectPath = StateMachine.context().projectPath;

            const serviceIdl = await platformExt?.getMarketplaceIdl({
                orgId: platformExtStore.getState().state?.selectedContext?.org.id?.toString(),
                serviceId: params.marketplaceItem.serviceId,
            });

            const choreoDir = path.join(projectPath, ".wso2");
            if (!fs.existsSync(choreoDir)) {
                fs.mkdirSync(choreoDir, { recursive: true });
            }

            const moduleName = params.connectionName.replace(/[_\-\s]/g, "")?.toLowerCase();
            const filePath = path.join(choreoDir, `${moduleName}-spec.yaml`);

            if (serviceIdl?.idlType === "OpenAPI" && serviceIdl.content) {
                const updatedDef = processOpenApiWithApiKeyAuth(serviceIdl.content, params.securityType);
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

    async registerDevantMarketplaceService(params: RegisterDevantMarketplaceServiceReq): Promise<MarketplaceItem> {
        try {
            const platformExt = await this.getPlatformExt();

            const marketplaceItems = await platformExt?.getMarketplaceItems({
                orgId: platformExtStore.getState().state?.selectedContext?.org?.id?.toString(),
                request: {
                    query: params.name,
                    limit: 100,
                    networkVisibilityFilter: "all",
                    sortBy: "createdTime",
                },
            });

            let idlContent = "";
            if (params.idlFilePath) {
                // read contents of idlFilePath and convert it to base64
                const idlFileContent = await fs.promises.readFile(params.idlFilePath, { encoding: "utf-8" });
                idlContent = Buffer.from(idlFileContent).toString("base64");
            }

            const envs = await platformExt?.getProjectEnvs({
                orgId: platformExtStore.getState().state?.selectedContext?.org?.id?.toString(),
                orgUuid: platformExtStore.getState().state?.selectedContext?.org?.uuid,
                projectId: platformExtStore.getState().state?.selectedContext?.project?.id,
            });

            const configs: RegisterMarketplaceConfigMap = {};
            for (const env of envs) {
                const endpointName = `${env.name}Endpoint`;
                if (env.critical) {
                    configs[endpointName] = {
                        name: endpointName,
                        environmentTemplateIds: [env.templateId],
                        values: params.configs?.map((item) => ({ key: item.id, value: "" })),
                    };
                } else {
                    configs[endpointName] = {
                        name: endpointName,
                        environmentTemplateIds: [env.templateId],
                        values: params.configs?.map((item) => ({ key: item.id, value: item.value || "" })),
                    };
                }
            }

            const registeredMarketplaceItem = await platformExt?.registerMarketplaceConnection({
                orgId: platformExtStore.getState().state?.selectedContext?.org?.id?.toString(),
                orgUuid: platformExtStore.getState().state?.selectedContext?.org?.uuid,
                projectId: platformExtStore.getState().state?.selectedContext?.project?.id,
                serviceType: params.serviceType,
                idlType: params.idlType,
                idlContent,
                configs,
                schemaEntries: params.configs?.map((item) => ({
                    name: item.id,
                    type: "string",
                    isSensitive: item.isSecret,
                })),
                name: findUniqueConnectionName(params.name, marketplaceItems.data),
            });

            const marketplaceService = await platformExt?.getMarketplaceItem({
                orgId: platformExtStore.getState().state?.selectedContext?.org?.id?.toString(),
                serviceId: registeredMarketplaceItem.serviceId,
            });

            return marketplaceService;
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
            // TODO in order to improve speed during debugging, we need to bring cache connections secrets in Devant
            /*
            1. store connection with secret info in bal ext
            2. start proxy server. need to pass secure host list.
            3. leave the server running
            4. on extension exit, kill the server if its running
            */
        } catch (err) {
            platformExtStore.getState().setConnectionState({ loading: false });
            log(`Failed to refresh connection list: ${err}`);
        }
    }
}
