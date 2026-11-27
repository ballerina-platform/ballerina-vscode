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

import { getDevantComponentList, getMarketplaceItems, getMarketplaceIdl, getConnections, deleteLocalConnectionsConfig, getDevantConsoleUrl, getMarketplaceItem, getConnection, onPlatformExtStoreStateChange, refreshConnectionList, requestCloudAccess, refreshCloudAccess, getPlatformStore, setConnectedToDevant, setSelectedIntegration, deployIntegrationInDevant, deleteDevantTempConfigs, generateCustomConnectorFromOAS, addDevantTempConfig, setSelectedEnv, createConnectionConfig, replaceDevantTempConfigValues, registerDevantMarketplaceService, createThirdPartyConnection, initializeDevantOASConnection, createInternalConnection, getIntegrationList, getMarketplaceDatabases, getDatabaseServer, getDatabaseAdminCredential, getDatabaseCredentials, getProjectEnvs, getCloudIntegrationStatus, createDatabaseConnection, getMarketplaceDatabaseItem, resolveConnectionSecrets } from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { allPlatformExtManagers, platformExtManager } from "./router";
import { CreateDatabaseConnectionReq, CreateLocalConnectionsConfigReq, CreateThirdPartyConnectionReq, DeleteLocalConnectionsConfigReq, GetComponentsReq, GetConnectionItemReq, GetConnectionsReq, GetDatabaseItemReq, GetDatabaseServerReq, GetMarketplaceIdlReq, GetMarketplaceItemReq, GetMarketplaceListReq, GetProjectEnvsReq, ResolveConnectionSecretsReq, } from "@wso2/wso2-platform-core";
import { AddDevantTempConfigReq, CloudIntegrationStatusReq, CreateInternalConnectionReq, DeleteDevantTempConfigReq, GenerateCustomConnectorFromOASReq, InitializeDevantOASConnectionReq, RegisterDevantMarketplaceServiceReq, ReplaceDevantTempConfigValuesReq } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { platformExtStore } from "./platform-store";
import { debug } from "../../utils";

export function registerPlatformExtRpcHandlers(messenger: Messenger) {
    // Each platform's manager follows the session; the one in use answers the calls.
    for (const manager of allPlatformExtManagers()) {
        manager.initStateSubscription(messenger).catch((err) => {
            debug(`Failed to init platform ext state: ${err?.message}`);
        });
    }
    // BI ext handlers
    messenger.onRequest(generateCustomConnectorFromOAS, (params: GenerateCustomConnectorFromOASReq) => platformExtManager().generateCustomConnectorFromOAS(params));
    messenger.onRequest(initializeDevantOASConnection, (params: InitializeDevantOASConnectionReq) => platformExtManager().initializeDevantOASConnection(params));
    messenger.onRequest(registerDevantMarketplaceService, (params: RegisterDevantMarketplaceServiceReq) => platformExtManager().registerDevantMarketplaceService(params));
    messenger.onRequest(addDevantTempConfig, (params: AddDevantTempConfigReq) => platformExtManager().addDevantTempConfig(params));
    messenger.onRequest(deleteDevantTempConfigs, (params: DeleteDevantTempConfigReq) => platformExtManager().deleteDevantTempConfigs(params));
    messenger.onRequest(replaceDevantTempConfigValues, (params: ReplaceDevantTempConfigValuesReq) => platformExtManager().replaceDevantTempConfigValues(params));
    messenger.onRequest(setConnectedToDevant, (params: boolean) => platformExtManager().setConnectedToDevant(params));
    messenger.onRequest(setSelectedIntegration, (params: string) => platformExtManager().setSelectedIntegration(params));
    messenger.onRequest(setSelectedEnv, (params: string) => platformExtManager().setSelectedEnv(params));
    messenger.onRequest(getPlatformStore, () => platformExtStore.getState().state);   
    // Platform ext proxies
    messenger.onRequest(createThirdPartyConnection, (params: CreateThirdPartyConnectionReq) => platformExtManager().createThirdPartyConnection(params));
    messenger.onRequest(createInternalConnection, (params: CreateInternalConnectionReq) => platformExtManager().createInternalConnection(params));
    messenger.onRequest(getMarketplaceItems, (params: GetMarketplaceListReq) => platformExtManager().getMarketplaceItems(params));
    messenger.onRequest(getMarketplaceDatabases, (params: { orgId: string }) => platformExtManager().getMarketplaceDatabases(params));
    messenger.onRequest(getMarketplaceDatabaseItem, (params: GetDatabaseItemReq) => platformExtManager().getMarketplaceDatabaseItem(params));
    messenger.onRequest(getDatabaseServer, (params: GetDatabaseServerReq) => platformExtManager().getDatabaseServer(params));
    messenger.onRequest(getDatabaseAdminCredential, (params: GetDatabaseServerReq) => platformExtManager().getDatabaseAdminCredential(params));
    messenger.onRequest(getDatabaseCredentials, (params: GetDatabaseServerReq) => platformExtManager().getDatabaseCredentials(params));
    messenger.onRequest(createDatabaseConnection, (params: CreateDatabaseConnectionReq) => platformExtManager().createDatabaseConnection(params));
    messenger.onRequest(getMarketplaceItem, (params: GetMarketplaceItemReq) => platformExtManager().getMarketplaceItem(params));
    messenger.onRequest(getMarketplaceIdl, (params: GetMarketplaceIdlReq) => platformExtManager().getMarketplaceIdl(params));
    messenger.onRequest(getConnections, (params: GetConnectionsReq) => platformExtManager().getConnections(params));
    messenger.onRequest(getConnection, (params: GetConnectionItemReq) => platformExtManager().getConnection(params));
    messenger.onRequest(getIntegrationList, (params: GetComponentsReq) => platformExtManager().getIntegrationList(params));
    messenger.onRequest(getDevantComponentList, (params: GetComponentsReq) => platformExtManager().getDevantComponentList(params));
    messenger.onRequest(deleteLocalConnectionsConfig, (params: DeleteLocalConnectionsConfigReq) => platformExtManager().deleteLocalConnectionsConfig(params));
    messenger.onRequest(getDevantConsoleUrl, () => platformExtManager().getDevantConsoleUrl());
    messenger.onRequest(refreshConnectionList, () => platformExtManager().refreshConnectionList());
    messenger.onRequest(requestCloudAccess, () => platformExtManager().requestCloudAccess());
    messenger.onRequest(refreshCloudAccess, () => platformExtManager().refreshCloudAccess());
    messenger.onRequest(getProjectEnvs, (params: GetProjectEnvsReq) => platformExtManager().getProjectEnvs(params));
    messenger.onRequest(getCloudIntegrationStatus, (params: CloudIntegrationStatusReq) => platformExtManager().getCloudIntegrationStatus(params));
    messenger.onRequest(resolveConnectionSecrets, (params: ResolveConnectionSecretsReq) => platformExtManager().resolveConnectionSecrets(params));
    messenger.onRequest(deployIntegrationInDevant, () => platformExtManager().deployIntegrationInDevant());
    messenger.onRequest(createConnectionConfig, (params: CreateLocalConnectionsConfigReq) => platformExtManager().createConnectionConfig(params));
}
