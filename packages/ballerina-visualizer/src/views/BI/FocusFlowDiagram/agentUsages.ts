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

import { AgentUsage, AgentUsageTrigger, CDLocation, CDModel, CDService, NodePosition } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";

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

function unescapePath(path: string): string {
    return path.replace(/\\(.)/g, "$1");
}

function serviceLabel(service: CDService): string {
    return unescapePath(service.displayName || service.absolutePath || service.type);
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

function resourcePath(path: string): string {
    return unescapePath(path === "." ? "/" : path.startsWith("/") ? path : `/${path}`);
}

function resourceLabel(accessor: string, path: string): string {
    return `${accessor.toUpperCase()} ${resourcePath(path)}`;
}

function serviceName(service: CDService): string {
    return unescapePath(service.absolutePath || service.displayName || service.type);
}

function modulePrefix(type?: string): string {
    return type?.includes(":") ? type.split(":")[0] : type ?? "";
}

function triggerFor(model: CDModel, service: CDService): AgentUsageTrigger {
    const listeners = (model.listeners ?? [])
        .filter((listener) => listener.attachedServices?.includes(service.uuid))
        .filter((listener) => (listener.attachedServices ?? []).length === 1)
        .map((listener) => ({
            symbol: listener.symbol,
            documentUri: listener.location.filePath,
            position: toPosition(listener.location),
        }));
    return {
        serviceName: serviceName(service),
        documentUri: service.location.filePath,
        position: toPosition(service.location),
        listeners,
    };
}

function usagesForService(service: CDService, uuid: string, trigger?: AgentUsageTrigger): AgentUsage[] {
    const label = serviceLabel(service);
    const name = serviceName(service);
    const isAgentChat = modulePrefix(service.type) === "ai";
    const usages: AgentUsage[] = [];

    for (const resource of service.resourceFunctions ?? []) {
        if (resource.connections?.includes(uuid)) {
            usages.push({
                label: isAgentChat ? "Agent Chat" : resourceLabel(resource.accessor, resource.path),
                serviceLabel: label,
                serviceName: name,
                functionName: resourcePath(resource.path),
                type: service.type,
                typeLabel: serviceTypeLabel(service.type),
                icon: service.icon,
                documentUri: resource.location.filePath,
                position: toPosition(resource.location),
                trigger,
            });
        }
    }

    for (const fn of service.remoteFunctions ?? []) {
        if (fn.connections?.includes(uuid)) {
            usages.push({
                label: fn.name,
                serviceLabel: label,
                serviceName: name,
                functionName: fn.name,
                type: service.type,
                typeLabel: serviceTypeLabel(service.type),
                icon: service.icon,
                documentUri: fn.location.filePath,
                position: toPosition(fn.location),
                trigger,
            });
        }
    }

    if (usages.length === 0) {
        usages.push({
            label,
            serviceName: name,
            type: service.type,
            typeLabel: serviceTypeLabel(service.type),
            icon: service.icon,
            documentUri: service.location.filePath,
            position: toPosition(service.location),
            trigger,
        });
    }

    return usages;
}

export function findListenerPosition(model: CDModel, symbol: string, filePath: string): NodePosition | undefined {
    const listener = (model?.listeners ?? []).find(
        (candidate) => candidate.symbol === symbol && samePath(candidate.location?.filePath ?? "", filePath)
    );
    return listener ? toPosition(listener.location) : undefined;
}

export type AgentRef = {
    filePath: string;
    startLine: number;
    symbol?: string;
};

const GENERATED_CHAT_SERVICE_FILE = "_agent_chat.bal";

function isGeneratedChatService(filePath?: string): boolean {
    return Boolean(filePath?.endsWith(GENERATED_CHAT_SERVICE_FILE));
}

function groupByChannel(services: CDService[]): CDService[] {
    const order = new Map<string, number>();
    services.forEach((service) => {
        const channel = modulePrefix(service.type);
        if (!order.has(channel)) {
            order.set(channel, order.size);
        }
    });
    return [...services].sort((a, b) => order.get(modulePrefix(a.type)) - order.get(modulePrefix(b.type)));
}

export function findAgentUsages(model: CDModel, agent: AgentRef, triggerProtocols?: Set<string>): AgentUsage[] {
    const uuid = model && findAgentUuid(model, agent);
    if (!uuid) {
        return [];
    }

    const services = (model.services ?? [])
        .filter((service) => service.connections?.includes(uuid))
        .filter((service) => !isGeneratedChatService(service.location?.filePath));

    const usages = groupByChannel(services)
        .flatMap((service) => usagesForService(service, uuid,
            triggerProtocols?.has(modulePrefix(service.type)) ? triggerFor(model, service) : undefined));

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

const usageCache = new Map<string, AgentUsage[]>();

export function usageCacheKey(projectPath: string, filePath: string, startLine: number): string {
    return `${projectPath}::${filePath}::${startLine}`;
}

export function getCachedUsages(key: string): AgentUsage[] | undefined {
    return usageCache.get(key);
}

export function setCachedUsages(key: string, usages: AgentUsage[]): void {
    usageCache.set(key, usages);
}

let triggerProtocols: Set<string> | undefined;

export async function getAgentTriggerProtocols(rpcClient: BallerinaRpcClient): Promise<Set<string>> {
    if (!triggerProtocols) {
        const models = await rpcClient.getServiceDesignerRpcClient().getTriggerModels({ query: "" });
        triggerProtocols = new Set(
            (models?.local ?? [])
                .filter((trigger) => trigger.agentTriggerKind && trigger.listenerProtocol)
                .map((trigger) => trigger.listenerProtocol)
        );
    }
    return triggerProtocols;
}
