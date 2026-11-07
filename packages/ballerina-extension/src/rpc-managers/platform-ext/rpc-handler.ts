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

import { getMarketplaceItems, getMarketplaceIdl, getConnections, deleteLocalConnectionsConfig, getDevantConsoleUrl, getMarketplaceItem, getConnection, onPlatformExtStoreStateChange, refreshConnectionList, getPlatformStore, setConnectedToDevant, setSelectedIntegration, deployIntegrationInDevant, deleteDevantTempConfigs, generateCustomConnectorFromOAS, addDevantTempConfig, setSelectedEnv, createConnectionConfig, replaceDevantTempConfigValues, registerDevantMarketplaceService, createThirdPartyConnection, initializeDevantOASConnection, createInternalConnection, getIntegrationList, getMarketplaceDatabases, getDatabaseServer, getDatabaseAdminCredential, getDatabaseCredentials, getProjectEnvs, createDatabaseConnection, getMarketplaceDatabaseItem, resolveConnectionSecrets } from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { PlatformExtRpcManager } from "./rpc-manager";
import { CreateComponentConnectionReq, CreateDatabaseConnectionReq, CreateLocalConnectionsConfigReq, CreateThirdPartyConnectionReq, DeleteLocalConnectionsConfigReq, GetComponentsReq, GetConnectionItemReq, GetConnectionsReq, GetDatabaseItemReq, GetDatabaseServerReq, GetMarketplaceIdlReq, GetMarketplaceItemReq, GetMarketplaceListReq, GetProjectEnvsReq, ResolveConnectionSecretsReq, } from "@wso2/wso2-platform-core";
import { AddDevantTempConfigReq, DeleteDevantTempConfigReq, GenerateCustomConnectorFromOASReq, InitializeDevantOASConnectionReq, RegisterDevantMarketplaceServiceReq, ReplaceDevantTempConfigValuesReq } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { platformExtStore } from "./platform-store";
import { debug } from "../../utils";

export function registerPlatformExtRpcHandlers(messenger: Messenger) {
    const rpcManger = new PlatformExtRpcManager();
    rpcManger.initStateSubscription(messenger).catch((err) => {  
        debug(`Failed to init platform ext state: ${err?.message}`);
    });  
    // BI ext handlers
    messenger.onRequest(generateCustomConnectorFromOAS, (params: GenerateCustomConnectorFromOASReq) => rpcManger.generateCustomConnectorFromOAS(params));
    messenger.onRequest(initializeDevantOASConnection, (params: InitializeDevantOASConnectionReq) => rpcManger.initializeDevantOASConnection(params));
    messenger.onRequest(registerDevantMarketplaceService, (params: RegisterDevantMarketplaceServiceReq) => rpcManger.registerDevantMarketplaceService(params));
    messenger.onRequest(addDevantTempConfig, (params: AddDevantTempConfigReq) => rpcManger.addDevantTempConfig(params));
    messenger.onRequest(deleteDevantTempConfigs, (params: DeleteDevantTempConfigReq) => rpcManger.deleteDevantTempConfigs(params));
    messenger.onRequest(replaceDevantTempConfigValues, (params: ReplaceDevantTempConfigValuesReq) => rpcManger.replaceDevantTempConfigValues(params));
    messenger.onRequest(setConnectedToDevant, (params: boolean) => rpcManger.setConnectedToDevant(params));
    messenger.onRequest(setSelectedIntegration, (params: string) => rpcManger.setSelectedIntegration(params));
    messenger.onRequest(setSelectedEnv, (params: string) => rpcManger.setSelectedEnv(params));
    messenger.onRequest(getPlatformStore, () => platformExtStore.getState().state);   
    // Platform ext proxies
    messenger.onRequest(createThirdPartyConnection, (params: CreateThirdPartyConnectionReq) => rpcManger.createThirdPartyConnection(params));
    messenger.onRequest(createInternalConnection, (params: CreateComponentConnectionReq) => rpcManger.createInternalConnection(params));
    messenger.onRequest(getMarketplaceItems, (params: GetMarketplaceListReq) => rpcManger.getMarketplaceItems(params));
    messenger.onRequest(getMarketplaceDatabases, (params: { orgId: string }) => rpcManger.getMarketplaceDatabases(params));
    messenger.onRequest(getMarketplaceDatabaseItem, (params: GetDatabaseItemReq) => rpcManger.getMarketplaceDatabaseItem(params));
    messenger.onRequest(getDatabaseServer, (params: GetDatabaseServerReq) => rpcManger.getDatabaseServer(params));
    messenger.onRequest(getDatabaseAdminCredential, (params: GetDatabaseServerReq) => rpcManger.getDatabaseAdminCredential(params));
    messenger.onRequest(getDatabaseCredentials, (params: GetDatabaseServerReq) => rpcManger.getDatabaseCredentials(params));
    messenger.onRequest(createDatabaseConnection, (params: CreateDatabaseConnectionReq) => rpcManger.createDatabaseConnection(params));
    messenger.onRequest(getMarketplaceItem, (params: GetMarketplaceItemReq) => rpcManger.getMarketplaceItem(params));
    messenger.onRequest(getMarketplaceIdl, (params: GetMarketplaceIdlReq) => rpcManger.getMarketplaceIdl(params));
    messenger.onRequest(getConnections, (params: GetConnectionsReq) => rpcManger.getConnections(params));
    messenger.onRequest(getConnection, (params: GetConnectionItemReq) => rpcManger.getConnection(params));
    messenger.onRequest(getIntegrationList, (params: GetComponentsReq) => rpcManger.getIntegrationList(params));
    messenger.onRequest(deleteLocalConnectionsConfig, (params: DeleteLocalConnectionsConfigReq) => rpcManger.deleteLocalConnectionsConfig(params));
    messenger.onRequest(getDevantConsoleUrl, () => rpcManger.getDevantConsoleUrl());
    messenger.onRequest(refreshConnectionList, () => rpcManger.refreshConnectionList());
    messenger.onRequest(getProjectEnvs, (params: GetProjectEnvsReq) => rpcManger.getProjectEnvs(params));
    messenger.onRequest(resolveConnectionSecrets, (params: ResolveConnectionSecretsReq) => rpcManger.resolveConnectionSecrets(params));
    messenger.onRequest(deployIntegrationInDevant, () => rpcManger.deployIntegrationInDevant());
    messenger.onRequest(createConnectionConfig, (params: CreateLocalConnectionsConfigReq) => rpcManger.createConnectionConfig(params));
}
