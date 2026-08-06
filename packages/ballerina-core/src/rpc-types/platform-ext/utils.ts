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

import { DevantScopes } from "@wso2/wso2-platform-core";
import { IntegrationKind, isIntegrationKind } from "../../utils/identifier-utils";

const INTEGRATION_API_MODULES: ReadonlySet<string> = new Set(["http", "graphql", "tcp"]);
const EVENT_INTEGRATION_MODULES: ReadonlySet<string> = new Set([
    "kafka", "rabbitmq", "salesforce", "trigger.github", "mqtt", "asb", "mssql", "mysql", "postgresql",
    "trigger.hubspot", "trigger.shopify", "trigger.twilio",
]);
const FILE_INTEGRATION_MODULES: ReadonlySet<string> = new Set(["ftp", "file"]);
const AI_AGENT_MODULE = "ai";
const MCP_MODULE = "mcp";

export function findDevantScopeByModule(moduleName: string): DevantScopes | undefined {
    if (AI_AGENT_MODULE === moduleName) {
        return DevantScopes.AI_AGENT;
    } else if (MCP_MODULE === moduleName) {
        return DevantScopes.MCP;
    } else if (INTEGRATION_API_MODULES.has(moduleName)) {
        return DevantScopes.INTEGRATION_AS_API;
    } else if (EVENT_INTEGRATION_MODULES.has(moduleName)) {
        return DevantScopes.EVENT_INTEGRATION;
    } else if (FILE_INTEGRATION_MODULES.has(moduleName)) {
        return DevantScopes.FILE_INTEGRATION;
    }
}

/**
 * Connector-declared semantic `kind` -> Devant scope (mirrors {@link findDevantScopeByModule}).
 * Keyed by the shared {@link IntegrationKind} union so this table is kept in lockstep with
 * `KIND_TO_SCOPE` in `utils/identifier-utils.ts` at compile time.
 */
const KIND_TO_DEVANT_SCOPE: Record<IntegrationKind, DevantScopes> = {
    event: DevantScopes.EVENT_INTEGRATION,
    file: DevantScopes.FILE_INTEGRATION,
    http: DevantScopes.INTEGRATION_AS_API,
    graphql: DevantScopes.INTEGRATION_AS_API,
    ai: DevantScopes.AI_AGENT,
    mcp: DevantScopes.MCP,
};

/**
 * Resolves a Devant scope, preferring the connector-declared `kind` and falling back to the (legacy)
 * module allow-lists for connectors that ship no kind.
 */
export function findDevantScope(kind: string | undefined, moduleName: string): DevantScopes | undefined {
    if (kind && isIntegrationKind(kind)) {
        return KIND_TO_DEVANT_SCOPE[kind];
    }
    return findDevantScopeByModule(moduleName);
}