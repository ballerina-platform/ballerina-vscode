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

import { PlatformExtAPI, getMarketplaceItems, getMarketplaceItem, getMarketplaceIdl, getConnections, deleteLocalConnectionsConfig, getDevantConsoleUrl, getConnection, onPlatformExtStoreStateChange, refreshConnectionList, getPlatformStore, setConnectedToDevant, setSelectedIntegration, deployIntegrationInDevant, deleteDevantTempConfigs, generateCustomConnectorFromOAS, addDevantTempConfig, setSelectedEnv, createConnectionConfig, replaceDevantTempConfigValues, registerDevantMarketplaceService, createThirdPartyConnection, initializeDevantOASConnection, createInternalConnection, getIntegrationList, getMarketplaceDatabases, getDatabaseServer, getDatabaseAdminCredential, getDatabaseCredentials, getProjectEnvs, createDatabaseConnection, getMarketplaceDatabaseItem, resolveConnectionSecrets } from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";
import type { Component, Environment } from "@wso2/wso2-cloud-client";
import { GetMarketplaceListReq,MarketplaceListResp, GetMarketplaceIdlReq, MarketplaceIdlResp, ConnectionListItem, GetConnectionsReq, DeleteLocalConnectionsConfigReq, GetMarketplaceItemReq, MarketplaceItem, GetConnectionItemReq, ConnectionDetailed, CreateLocalConnectionsConfigReq, CreateThirdPartyConnectionReq, GetComponentsReq, MarketplaceDatabaseListResp, DatabaseServer, GetDatabaseServerReq, DatabaseAdminCredential, DatabaseCredential, GetProjectEnvsReq, CreateDatabaseConnectionReq, GetDatabaseItemReq, ResolveConnectionSecretsReq, ResolveConnectionSecretsResp } from "@wso2/wso2-platform-core"
import { AddDevantTempConfigReq, AddDevantTempConfigResp, CreateInternalConnectionReq, DeleteDevantTempConfigReq, GenerateCustomConnectorFromOASReq, GenerateCustomConnectorFromOASResp, InitializeDevantOASConnectionReq, InitializeDevantOASConnectionResp, PlatformExtState, RegisterDevantMarketplaceServiceReq, ReplaceDevantTempConfigValuesReq } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";

export class PlatformExtRpcClient implements PlatformExtAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getPlatformStore(): Promise<PlatformExtState> {
        return this._messenger.sendRequest(getPlatformStore, HOST_EXTENSION, undefined);
    }

    getMarketplaceItems(params: GetMarketplaceListReq): Promise<MarketplaceListResp> {
        return this._messenger.sendRequest(getMarketplaceItems, HOST_EXTENSION, params);
    }

    getMarketplaceDatabases(params: { orgId: string }): Promise<MarketplaceDatabaseListResp> {
        return this._messenger.sendRequest(getMarketplaceDatabases, HOST_EXTENSION, params);
    }

    getMarketplaceDatabaseItem(params: GetDatabaseItemReq): Promise<MarketplaceItem> {
        return this._messenger.sendRequest(getMarketplaceDatabaseItem, HOST_EXTENSION, params);
    }

    getDatabaseServer(params: GetDatabaseServerReq): Promise<DatabaseServer> {
        return this._messenger.sendRequest(getDatabaseServer, HOST_EXTENSION, params);
    }

    getDatabaseAdminCredential(params: GetDatabaseServerReq): Promise<DatabaseAdminCredential> {
        return this._messenger.sendRequest(getDatabaseAdminCredential, HOST_EXTENSION, params);
    }

    getDatabaseCredentials(params: GetDatabaseServerReq): Promise<DatabaseCredential[]> {
        return this._messenger.sendRequest(getDatabaseCredentials, HOST_EXTENSION, params);
    }

    createDatabaseConnection(params: CreateDatabaseConnectionReq): Promise<ConnectionDetailed> {
        return this._messenger.sendRequest(createDatabaseConnection, HOST_EXTENSION, params);
    }

    getMarketplaceItem(params: GetMarketplaceItemReq): Promise<MarketplaceItem> {
        return this._messenger.sendRequest(getMarketplaceItem, HOST_EXTENSION, params);
    }

    getMarketplaceIdl(params: GetMarketplaceIdlReq): Promise<MarketplaceIdlResp> {
        return this._messenger.sendRequest(getMarketplaceIdl, HOST_EXTENSION, params);
    }

    generateCustomConnectorFromOAS(params: GenerateCustomConnectorFromOASReq): Promise<GenerateCustomConnectorFromOASResp> {
        return this._messenger.sendRequest(generateCustomConnectorFromOAS, HOST_EXTENSION, params);
    }

    initializeDevantOASConnection(params: InitializeDevantOASConnectionReq): Promise<InitializeDevantOASConnectionResp> {
        return this._messenger.sendRequest(initializeDevantOASConnection, HOST_EXTENSION, params);
    }

    registerDevantMarketplaceService(params: RegisterDevantMarketplaceServiceReq): Promise<MarketplaceItem> {
        return this._messenger.sendRequest(registerDevantMarketplaceService, HOST_EXTENSION, params);
    }

    createThirdPartyConnection(params: CreateThirdPartyConnectionReq): Promise<ConnectionDetailed> {
        return this._messenger.sendRequest(createThirdPartyConnection, HOST_EXTENSION, params);
    }

    createInternalConnection(params: CreateInternalConnectionReq): Promise<ConnectionDetailed> {
        return this._messenger.sendRequest(createInternalConnection, HOST_EXTENSION, params);
    }

    replaceDevantTempConfigValues(params: ReplaceDevantTempConfigValuesReq): Promise<void> {
        return this._messenger.sendRequest(replaceDevantTempConfigValues, HOST_EXTENSION, params);
    }

    addDevantTempConfig(params: AddDevantTempConfigReq): Promise<AddDevantTempConfigResp> {
        return this._messenger.sendRequest(addDevantTempConfig, HOST_EXTENSION, params);
    }

    deleteDevantTempConfigs(params: DeleteDevantTempConfigReq): Promise<void> {
        return this._messenger.sendRequest(deleteDevantTempConfigs, HOST_EXTENSION, params);
    }
    
    getConnections(params: GetConnectionsReq): Promise<ConnectionListItem[]> {
        return this._messenger.sendRequest(getConnections, HOST_EXTENSION, params);
    }

    getConnection(params: GetConnectionItemReq): Promise<ConnectionDetailed> {
        return this._messenger.sendRequest(getConnection, HOST_EXTENSION, params);
    }

    getIntegrationList(params: GetComponentsReq): Promise<Component[]> {
        return this._messenger.sendRequest(getIntegrationList, HOST_EXTENSION, params);
    }

    deleteLocalConnectionsConfig(params: DeleteLocalConnectionsConfigReq): Promise<void> {
        return this._messenger.sendRequest(deleteLocalConnectionsConfig, HOST_EXTENSION, params);
    }

    getDevantConsoleUrl(): Promise<string> {
        return this._messenger.sendRequest(getDevantConsoleUrl, HOST_EXTENSION, undefined);
    }

    getProjectEnvs(params: GetProjectEnvsReq): Promise<Environment[]> {
        return this._messenger.sendRequest(getProjectEnvs, HOST_EXTENSION, params);
    }

    resolveConnectionSecrets(params: ResolveConnectionSecretsReq): Promise<ResolveConnectionSecretsResp> {
        return this._messenger.sendRequest(resolveConnectionSecrets, HOST_EXTENSION, params);
    }

    createConnectionConfig(params: CreateLocalConnectionsConfigReq): Promise<string> {
        return this._messenger.sendRequest(createConnectionConfig, HOST_EXTENSION, params);
    }

    onPlatformExtStoreStateChange(callback: (state: PlatformExtState) => void) {
        this._messenger.onNotification(onPlatformExtStoreStateChange, callback);
    }

    refreshConnectionList(): Promise<void> {
        return this._messenger.sendRequest(refreshConnectionList, HOST_EXTENSION, undefined);
    }

    setConnectedToDevant(connected: boolean): Promise<void> {
        return this._messenger.sendRequest(setConnectedToDevant, HOST_EXTENSION, connected);
    }

    setSelectedIntegration(integrationId: string): Promise<void> {
        return this._messenger.sendRequest(setSelectedIntegration, HOST_EXTENSION, integrationId);
    }

    setSelectedEnv(envId: string): Promise<void> {
        return this._messenger.sendRequest(setSelectedEnv, HOST_EXTENSION, envId);
    }

    deployIntegrationInDevant(): Promise<void> {
        return this._messenger.sendRequest(deployIntegrationInDevant, HOST_EXTENSION);
    }
}
