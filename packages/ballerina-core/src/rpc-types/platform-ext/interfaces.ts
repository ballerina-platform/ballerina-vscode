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

import type { ContextItemEnriched, DirectoryIntegration, Environment, PlatformSession } from "@wso2/wso2-cloud-client";
// The browser-safe entry: this module reaches the webviews, and the package root pulls in Node modules.
import { PLATFORM_EXTENSION_API_VERSION } from "@wso2/wso2-cloud-client/contract";
import {
    ConnectionConfigurations,
    ConnectionDetailed,
    ConnectionListItem,
    CreateComponentConnectionReq,
    MarketplaceItem,
    MarketplaceServiceTypes,
} from "@wso2/wso2-platform-core";
import { AvailableNode } from "../../interfaces/bi";
import { ModuleVarDecl } from "@wso2/syntax-tree/lib/syntax-tree-interfaces";

/** The platform extension contract this extension was written against; an older or newer WSO2 Integrator disables cloud features. */
export const SUPPORTED_PLATFORM_API_VERSION: number = PLATFORM_EXTENSION_API_VERSION;

/** The marketplace item property saying why a service can't be connected to now; absent when it can. */
export const MARKETPLACE_ITEM_UNAVAILABLE = "unavailable";

export interface GenerateCustomConnectorFromOASReq {
    connectionName: string;
    marketplaceItem: MarketplaceItem;
    securityType?: "" | "oauth" | "apikey";
}

export interface GenerateCustomConnectorFromOASResp {
    connectionNode?: AvailableNode;
}

/**
 * A service connection to create. A connection inside the project is the
 * platform filling one of the integration's configurables with the
 * endpoint's address, so it names that configurable.
 */
export interface CreateInternalConnectionReq extends CreateComponentConnectionReq {
    /** The configurable the endpoint's URL fills, in the package's root module. */
    configurableName?: string;
    /** For a service of another project whose API takes an API key: the configurable the key fills, in the root module. */
    apiKeyConfigurableName?: string;
}

export interface InitializeDevantOASConnectionReq {
    name: string;
    visibility: string;
    securityType: "" | "oauth" | "apikey";
    marketplaceItem: MarketplaceItem;
    configurations: ConnectionConfigurations;
    devantConfigs: DevantTempConfig[];
}

export interface InitializeDevantOASConnectionResp {
    connectionName?: string;
}

/** Kept for the third-party flows, which WSO2 Cloud does not offer yet; the request is refused with a clear message. */
export interface RegisterDevantMarketplaceServiceReq {
    name: string;
    /** "OpenAPI", "TCP", or another IDL kind the service names. */
    idlType: string;
    serviceType: MarketplaceServiceTypes;
    idlFilePath?: string;

    configs: DevantTempConfig[];
}

export interface AddDevantTempConfigReq {
    name: string;
    newLine?: boolean;
}

export interface AddDevantTempConfigResp {
    configNode: ModuleVarDecl;
}

export interface DeleteDevantTempConfigReq {
    nodes: ModuleVarDecl[];
}

export interface ReplaceDevantTempConfigValuesReq {
    createdConnection: ConnectionDetailed;
    configs: DevantTempConfig[];
}

export interface PlatformExtConnectionState {
    loading?: boolean;
    /**
     * The integration's environment-variable groups in the selected environment,
     * in the connection vocabulary the connection screens were written against.
     */
    list?: ConnectionListItem[];
    connectedToDevant?: boolean;
}

/**
 * Where this extension stands with the WSO2 Cloud sign-in WSO2 Integrator holds.
 * VS Code lets another extension use that sign-in only once the person allows it
 * (the WSO2 Integrator product allows it up front; stock VS Code asks), so being
 * signed in to WSO2 Integrator is not enough:
 * - `signed-out`: nobody is signed in to WSO2 Cloud in WSO2 Integrator;
 * - `no-access`: signed in, but this extension has not been allowed to use the sign-in yet;
 * - `declined`: signed in, and the person declined this extension's request in this window;
 * - `connected`: this extension can use WSO2 Cloud.
 */
export type CloudAccess = "signed-out" | "no-access" | "declined" | "connected";

/** What the visualizer sees of WSO2 Integrator's cloud state. */
export interface PlatformExtState {
    isExtInstalled?: boolean;
    /** The `apiVersion` WSO2 Integrator exports; cloud features are on only when it is the supported one. */
    platformApiVersion?: number;
    /** False when WSO2 Integrator is installed but speaks another contract version. */
    isCompatible?: boolean;
    /** True only when this extension can use the WSO2 Cloud sign-in; `cloudAccess` tells why it cannot. */
    isLoggedIn: boolean;
    cloudAccess?: CloudAccess;
    session: PlatformSession | null;
    hasPossibleComponent?: boolean;
    hasLocalChanges?: boolean;
    /** The integrations found in the open directory. */
    integrations: DirectoryIntegration[];
    selectedIntegration?: DirectoryIntegration;
    selectedContext?: ContextItemEnriched;
    /** The project's environments, in promotion order. */
    envs?: Environment[];
    selectedEnv?: Environment;
    /** Why the project's environments could not be read, or that it has none; unset while they load and once they have. */
    envsError?: string;
    devantConns?: PlatformExtConnectionState;
}

export interface DevantTempConfig {
    /** The id matching the key in devant side */
    id: string;
    /** The unique identifier in ballerina code */
    name: string;
    value: string;
    isSecret: boolean;
    node?: ModuleVarDecl;
    description?: string;
    type?: "string" | "int";
}
