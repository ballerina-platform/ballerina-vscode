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

import { AgentUsage, CDLocation, CDModel, CDService, NodePosition } from "@wso2/ballerina-core";

function toPosition(location: CDLocation): NodePosition {
    return {
        startLine: location.startLine.line,
        startColumn: location.startLine.offset,
        endLine: location.endLine.line,
        endColumn: location.endLine.offset,
    };
}

function samePath(a: string, b: string): boolean {
    return a === b || a.replace(/\\/g, "/") === b.replace(/\\/g, "/");
}

function findAgentUuid(model: CDModel, agent: AgentRef): string | undefined {
    const connections = model.connections ?? [];
    const byLocation = connections.find(
        (connection) =>
            samePath(connection.location?.filePath ?? "", agent.filePath) &&
            connection.location?.startLine?.line === agent.startLine
    );
    if (byLocation) {
        return byLocation.uuid;
    }
    return agent.symbol ? connections.find((connection) => connection.symbol === agent.symbol)?.uuid : undefined;
}

function serviceLabel(service: CDService): string {
    return service.displayName || service.absolutePath || service.type;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
    ai: "AI Chat Service",
    graphql: "GraphQL Service",
    http: "HTTP Service",
    grpc: "gRPC Service",
    tcp: "TCP Service",
    mcp: "MCP Service",
};

function serviceTypeLabel(type?: string): string | undefined {
    if (!type) {
        return undefined;
    }
    const modulePart = type.includes(":") ? type.split(":")[0] : type;
    return SERVICE_TYPE_LABELS[modulePart] ?? `${modulePart} Service`;
}

function resourceLabel(accessor: string, path: string): string {
    const normalized = path === "." ? "/" : path.startsWith("/") ? path : `/${path}`;
    return `${accessor.toUpperCase()} ${normalized}`;
}

function usagesForService(service: CDService, uuid: string): AgentUsage[] {
    const label = serviceLabel(service);
    const usages: AgentUsage[] = [];

    for (const resource of service.resourceFunctions ?? []) {
        if (resource.connections?.includes(uuid)) {
            usages.push({
                label: resourceLabel(resource.accessor, resource.path),
                serviceLabel: label,
                type: service.type,
                typeLabel: serviceTypeLabel(service.type),
                icon: service.icon,
                documentUri: resource.location.filePath,
                position: toPosition(resource.location),
            });
        }
    }

    for (const fn of [...(service.remoteFunctions ?? []), ...(service.functions ?? [])]) {
        if (fn.connections?.includes(uuid)) {
            usages.push({
                label: fn.name,
                serviceLabel: label,
                type: service.type,
                typeLabel: serviceTypeLabel(service.type),
                icon: service.icon,
                documentUri: fn.location.filePath,
                position: toPosition(fn.location),
            });
        }
    }

    if (usages.length === 0) {
        usages.push({
            label,
            type: service.type,
            typeLabel: serviceTypeLabel(service.type),
            icon: service.icon,
            documentUri: service.location.filePath,
            position: toPosition(service.location),
        });
    }

    return usages;
}

export type AgentRef = {
    filePath: string;
    startLine: number;
    symbol?: string;
};

export function findAgentUsages(model: CDModel, agent: AgentRef): AgentUsage[] {
    const uuid = model && findAgentUuid(model, agent);
    if (!uuid) {
        return [];
    }

    const usages = (model.services ?? [])
        .filter((service) => service.connections?.includes(uuid))
        .flatMap((service) => usagesForService(service, uuid));

    const automation = model.automation;
    if (automation?.connections?.includes(uuid)) {
        usages.push({
            label: automation.displayName || automation.name,
            type: "automation",
            typeLabel: "Automation",
            documentUri: automation.location.filePath,
            position: toPosition(automation.location),
        });
    }

    return usages;
}
