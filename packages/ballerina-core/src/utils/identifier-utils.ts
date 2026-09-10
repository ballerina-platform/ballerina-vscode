/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ComponentInfo } from "../interfaces/ballerina";
import { BallerinaProjectComponents } from "../interfaces/extended-lang-client";
import { SCOPE } from "../interfaces/shared-types";

/** Modules that map to the INTEGRATION_AS_API scope. */
const INTEGRATION_API_MODULES: ReadonlySet<string> = new Set(["http", "graphql", "tcp"]);

/** Modules that map to the EVENT_INTEGRATION scope. */
const EVENT_INTEGRATION_MODULES: ReadonlySet<string> = new Set([
    "kafka",
    "rabbitmq",
    "salesforce",
    "trigger.github",
    "mqtt",
    "asb",
    "mssql",
    "mysql",
    "postgresql",
    "trigger.shopify",
    "trigger.twilio",
    "trigger.hubspot",
    "solace",
    "solace.jms",
    "oracledb",
    "sap.jco",
    "aws.sqs",
    "telegram",
    "googleapis.chat",
    "whatsapp.business"
]);

/** Modules that map to the FILE_INTEGRATION scope. */
const FILE_INTEGRATION_MODULES: ReadonlySet<string> = new Set(["ftp", "file", "smb", "azure.storage.files"]);

export function findScopeByModule(moduleName: string): SCOPE {
    if (moduleName === "ai") {
        return SCOPE.AI_AGENT;
    } else if (moduleName === "mcp") {
        return SCOPE.MCP;
    } else if (INTEGRATION_API_MODULES.has(moduleName)) {
        return SCOPE.INTEGRATION_AS_API;
    } else if (EVENT_INTEGRATION_MODULES.has(moduleName)) {
        return SCOPE.EVENT_INTEGRATION;
    } else if (FILE_INTEGRATION_MODULES.has(moduleName)) {
        return SCOPE.FILE_INTEGRATION;
    }
}

/**
 * The connector-declared semantic `kind` values known to the designer (not to be confused with the
 * unrelated LSP-completion `TriggerKind` in `extended-lang-client.ts`). Single source of truth for
 * every `kind`-keyed lookup table (e.g. {@link KIND_TO_SCOPE} here, `KIND_TO_DEVANT_SCOPE` in
 * `rpc-types/platform-ext/utils.ts`) so a new kind added here fails those tables to compile until
 * they're updated too, instead of silently degrading at runtime.
 */
export const INTEGRATION_KINDS = ["event", "file", "http", "graphql", "ai", "mcp"] as const;
export type IntegrationKind = typeof INTEGRATION_KINDS[number];

export function isIntegrationKind(kind: string): kind is IntegrationKind {
    return (INTEGRATION_KINDS as readonly string[]).includes(kind);
}

/**
 * Maps a connector's declared semantic `triggerKind` to a project {@link SCOPE}. This is the
 * connector-agnostic classifier: any event trigger is an Event Integration without a per-module entry.
 */
const KIND_TO_SCOPE: Record<IntegrationKind, SCOPE> = {
    event: SCOPE.EVENT_INTEGRATION,
    file: SCOPE.FILE_INTEGRATION,
    http: SCOPE.INTEGRATION_AS_API,
    graphql: SCOPE.INTEGRATION_AS_API,
    ai: SCOPE.AI_AGENT,
    mcp: SCOPE.MCP,
};

/**
 * Resolves a project scope, preferring the connector-declared `triggerKind` and falling back to the
 * legacy module allow-lists in {@link findScopeByModule} for responses that do not provide it.
 */
export function findScope(triggerKind: string | undefined, moduleName: string | undefined): SCOPE | undefined {
    if (triggerKind && isIntegrationKind(triggerKind)) {
        return KIND_TO_SCOPE[triggerKind];
    }
    return moduleName ? findScopeByModule(moduleName) : undefined;
}

export function getAllVariablesForAiFrmProjectComponents(projectComponents: BallerinaProjectComponents): { [key: string]: any } {
    const variableCollection: { [key: string]: any } = {};
    projectComponents.packages?.forEach((packageSummary) => {
        packageSummary.modules.forEach((moduleSummary) => {
            moduleSummary.moduleVariables.forEach(({ name }: ComponentInfo) => {
                if (!variableCollection[name]) {
                    variableCollection[name] = {
                        type: name,
                        position: 0,
                        isUsed: 0,
                    };
                }
            });
            moduleSummary.enums.forEach(({ name }: ComponentInfo) => {
                if (!variableCollection[name]) {
                    variableCollection[name] = {
                        type: name,
                        position: 0,
                        isUsed: 0,
                    };
                }
            });
            moduleSummary.records.forEach(({ name }: ComponentInfo) => {
                if (!variableCollection[name]) {
                    variableCollection[name] = {
                        type: name,
                        position: 0,
                        isUsed: 0,
                    };
                }
            });
        })
    });
    return variableCollection;
}

export function getAllVariablesByProjectComponents(projectComponents: BallerinaProjectComponents): string[] {
    const variableCollection: string[] = [];
    const variableInfo = getAllVariablesForAiFrmProjectComponents(projectComponents);
    Object.keys(variableInfo).map((variable) => {
        variableCollection.push(variable);
    });
    return variableCollection;
}
