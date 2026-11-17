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

import type { Component, Environment } from "@wso2/wso2-cloud-client";
import { GetMarketplaceListReq,MarketplaceListResp, GetMarketplaceIdlReq, MarketplaceIdlResp, ConnectionListItem, GetConnectionsReq, DeleteLocalConnectionsConfigReq, GetMarketplaceItemReq, MarketplaceItem, GetConnectionItemReq, ConnectionDetailed, CreateLocalConnectionsConfigReq, CreateThirdPartyConnectionReq, GetComponentsReq, GetDatabaseServerReq, DatabaseAdminCredential, DatabaseServer, MarketplaceDatabaseListResp, DatabaseCredential, GetProjectEnvsReq, CreateDatabaseConnectionReq, GetDatabaseItemReq, ResolveConnectionSecretsReq, ResolveConnectionSecretsResp } from "@wso2/wso2-platform-core"
import { CloudAccess, CreateInternalConnectionReq, DeleteDevantTempConfigReq, GenerateCustomConnectorFromOASReq, GenerateCustomConnectorFromOASResp, AddDevantTempConfigReq, AddDevantTempConfigResp, ReplaceDevantTempConfigValuesReq, RegisterDevantMarketplaceServiceReq, InitializeDevantOASConnectionReq, InitializeDevantOASConnectionResp } from "./interfaces";
export * from "./rpc-type"
export * from "./utils"

/**
 * What the visualizer asks the extension about WSO2 Cloud.
 *
 * The connection screens still speak the marketplace vocabulary
 * (`MarketplaceItem`, `ConnectionListItem`); the extension feeds them from the
 * platform's databases, exposed endpoints and environment-variable groups, and
 * refuses what the platform has no counterpart for (third-party registration,
 * reading secrets back) with a message naming the gap.
 */
export interface PlatformExtAPI {
    // BI ext handlers
    generateCustomConnectorFromOAS: (params: GenerateCustomConnectorFromOASReq) => Promise<GenerateCustomConnectorFromOASResp>
    initializeDevantOASConnection: (params: InitializeDevantOASConnectionReq) => Promise<InitializeDevantOASConnectionResp>
    addDevantTempConfig: (params: AddDevantTempConfigReq) => Promise<AddDevantTempConfigResp>
    deleteDevantTempConfigs: (params: DeleteDevantTempConfigReq) => Promise<void>
    replaceDevantTempConfigValues: (params: ReplaceDevantTempConfigValuesReq) => Promise<void>
    setConnectedToDevant: (connected: boolean) => void;
    setSelectedIntegration: (integrationId: string) => void;
    setSelectedEnv: (envId: string) => void;
    // Platform ext proxies
    createThirdPartyConnection: (params: CreateThirdPartyConnectionReq) => Promise<ConnectionDetailed>
    createInternalConnection: (params: CreateInternalConnectionReq) => Promise<ConnectionDetailed>
    registerDevantMarketplaceService: (params: RegisterDevantMarketplaceServiceReq) => Promise<MarketplaceItem>
    getMarketplaceItems: (params: GetMarketplaceListReq) => Promise<MarketplaceListResp>;
    getMarketplaceDatabases: (params: { orgId: string }) => Promise<MarketplaceDatabaseListResp>;
    getMarketplaceDatabaseItem: (params: GetDatabaseItemReq) => Promise<MarketplaceItem>;
    getDatabaseServer: (params: GetDatabaseServerReq) => Promise<DatabaseServer>;
    getDatabaseAdminCredential: (params: GetDatabaseServerReq) => Promise<DatabaseAdminCredential>;
    getDatabaseCredentials: (params: GetDatabaseServerReq) => Promise<DatabaseCredential[]>;
    createDatabaseConnection: (params: CreateDatabaseConnectionReq) => Promise<ConnectionDetailed>;
    getMarketplaceItem: (params: GetMarketplaceItemReq) => Promise<MarketplaceItem>;
    getMarketplaceIdl: (params: GetMarketplaceIdlReq) => Promise<MarketplaceIdlResp>;
    getConnections: (params: GetConnectionsReq) => Promise<ConnectionListItem[]>;
    getConnection: (params: GetConnectionItemReq) => Promise<ConnectionDetailed>;
    getIntegrationList: (params: GetComponentsReq) => Promise<Component[]>;
    deleteLocalConnectionsConfig: (params: DeleteLocalConnectionsConfigReq) => void;
    getDevantConsoleUrl: () => Promise<string>;
    refreshConnectionList: () => Promise<void>;
    /** Signs in through WSO2 Integrator when nobody is, else asks VS Code to let this extension use the sign-in; answers where that left it. */
    requestCloudAccess: () => Promise<CloudAccess>;
    /** Reads the sign-in again without asking, for access granted from the Accounts menu, which VS Code does not announce. */
    refreshCloudAccess: () => Promise<CloudAccess>;
    getProjectEnvs: (params: GetProjectEnvsReq) => Promise<Environment[]>;
    resolveConnectionSecrets: (params: ResolveConnectionSecretsReq) => Promise<ResolveConnectionSecretsResp>;
    deployIntegrationInDevant: () => void;
    createConnectionConfig: (params: CreateLocalConnectionsConfigReq) => Promise<string>;
}
