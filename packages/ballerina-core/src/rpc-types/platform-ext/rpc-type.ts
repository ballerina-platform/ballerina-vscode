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
import { ConnectionDetailed, ConnectionListItem, CreateDatabaseConnectionReq, CreateLocalConnectionsConfigReq, CreateThirdPartyConnectionReq, DatabaseCredential, DeleteLocalConnectionsConfigReq, GetComponentsReq, GetConnectionItemReq, GetConnectionsReq, GetDatabaseItemReq, GetDatabaseServerReq, GetMarketplaceIdlReq, GetMarketplaceItemReq, GetMarketplaceListReq,GetProjectEnvsReq,MarketplaceDatabaseListResp,MarketplaceIdlResp,MarketplaceItem,MarketplaceListResp, ResolveConnectionSecretsReq, ResolveConnectionSecretsResp } from "@wso2/wso2-platform-core"
import { NotificationType, RequestType } from "vscode-messenger-common";
import { AddDevantTempConfigReq, AddDevantTempConfigResp, CreateInternalConnectionReq, DeleteDevantTempConfigReq, GenerateCustomConnectorFromOASReq, GenerateCustomConnectorFromOASResp, InitializeDevantOASConnectionReq, InitializeDevantOASConnectionResp, PlatformExtState, RegisterDevantMarketplaceServiceReq, ReplaceDevantTempConfigValuesReq } from "./interfaces";

const _preFix = "platform-ext";
// BI ext handlers
export const generateCustomConnectorFromOAS: RequestType<GenerateCustomConnectorFromOASReq, GenerateCustomConnectorFromOASResp> = { method: `${_preFix}/generateCustomConnectorFromOAS` };
export const initializeDevantOASConnection: RequestType<InitializeDevantOASConnectionReq,  InitializeDevantOASConnectionResp> = { method: `${_preFix}/initializeDevantOASConnection` };
export const addDevantTempConfig: RequestType<AddDevantTempConfigReq,  AddDevantTempConfigResp> = { method: `${_preFix}/addDevantTempConfig` };
export const deleteDevantTempConfigs: RequestType<DeleteDevantTempConfigReq,  void> = { method: `${_preFix}/deleteDevantTempConfigs` };
export const replaceDevantTempConfigValues: RequestType<ReplaceDevantTempConfigValuesReq,  void> = { method: `${_preFix}/replaceDevantTempConfigValues` };
export const getPlatformStore: RequestType<void,  PlatformExtState> = { method: `${_preFix}/getPlatformStore` };
export const setConnectedToDevant: RequestType<boolean,  void> = { method: `${_preFix}/setConnectedToDevant` };
export const setSelectedIntegration: RequestType<string,  void> = { method: `${_preFix}/setSelectedIntegration` };
export const setSelectedEnv: RequestType<string,  void> = { method: `${_preFix}/setSelectedEnv` };

// Platform ext proxies
export const registerDevantMarketplaceService: RequestType<RegisterDevantMarketplaceServiceReq,  MarketplaceItem> = { method: `${_preFix}/registerDevantMarketplaceService` };
export const createThirdPartyConnection: RequestType<CreateThirdPartyConnectionReq,  ConnectionDetailed> = { method: `${_preFix}/createThirdPartyConnection` };
export const createInternalConnection: RequestType<CreateInternalConnectionReq, ConnectionDetailed> = { method: `${_preFix}/createInternalConnection` };
export const getMarketplaceItems: RequestType<GetMarketplaceListReq, MarketplaceListResp> = { method: `${_preFix}/getMarketplaceItems` };
export const getMarketplaceDatabases: RequestType<{ orgId: string }, MarketplaceDatabaseListResp> = { method: `${_preFix}/getMarketplaceDatabases` };
export const getMarketplaceDatabaseItem: RequestType<GetDatabaseItemReq, MarketplaceItem> = { method: `${_preFix}/getMarketplaceDatabaseItem` };
export const getDatabaseServer: RequestType<GetDatabaseServerReq,  any> = { method: `${_preFix}/getDatabaseServer` };
export const getDatabaseAdminCredential: RequestType<GetDatabaseServerReq,  any> = { method: `${_preFix}/getDatabaseAdminCredential` };
export const getDatabaseCredentials: RequestType<GetDatabaseServerReq,  DatabaseCredential[]> = { method: `${_preFix}/getDatabaseCredentials` };
export const createDatabaseConnection: RequestType<CreateDatabaseConnectionReq,  ConnectionDetailed> = { method: `${_preFix}/createDatabaseConnection` };
export const getMarketplaceItem: RequestType<GetMarketplaceItemReq, MarketplaceItem> = { method: `${_preFix}/getMarketplaceItem` };
export const getMarketplaceIdl: RequestType<GetMarketplaceIdlReq,  MarketplaceIdlResp> = { method: `${_preFix}/getMarketplaceIdl` };
export const getConnections: RequestType<GetConnectionsReq,  ConnectionListItem[]> = { method: `${_preFix}/getConnections` };
export const getConnection: RequestType<GetConnectionItemReq,  ConnectionDetailed> = { method: `${_preFix}/getConnection` };
export const getIntegrationList: RequestType<GetComponentsReq,  Component[]> = { method: `${_preFix}/getIntegrationList` };
export const deleteLocalConnectionsConfig: RequestType<DeleteLocalConnectionsConfigReq,  void> = { method: `${_preFix}/deleteLocalConnectionsConfig` };
export const getDevantConsoleUrl: RequestType<void,  string> = { method: `${_preFix}/getDevantConsoleUrl` };
export const refreshConnectionList: RequestType<void,  void> = { method: `${_preFix}/refreshConnectionList` };
export const getProjectEnvs: RequestType<GetProjectEnvsReq,  Environment[]> = { method: `${_preFix}/getProjectEnvs` };
export const deployIntegrationInDevant: RequestType<void,  void> = { method: `${_preFix}/deployIntegrationInDevant` };
export const createConnectionConfig: RequestType<CreateLocalConnectionsConfigReq, string> = { method: `${_preFix}/createConnectionConfig` };
export const resolveConnectionSecrets: RequestType<ResolveConnectionSecretsReq,  ResolveConnectionSecretsResp> = { method: `${_preFix}/resolveConnectionSecrets` };

// Notifications
export const onPlatformExtStoreStateChange: NotificationType<PlatformExtState> = { method: `${_preFix}/onPlatformExtStoreStateChange` };
