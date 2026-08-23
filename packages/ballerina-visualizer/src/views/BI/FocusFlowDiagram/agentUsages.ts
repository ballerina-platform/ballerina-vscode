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

import {
    AgentTriggerDeletionScope,
    AgentUsage,
    AgentUsageTrigger,
    AgentUsageTriggerListener,
    AgentUsageTryIt,
    CDLocation,
    CDModel,
    CDService,
    FlowNode,
    NodePosition,
} from "@wso2/ballerina-core";
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
    return SERVICE_TYPE_LABELS[modulePart] ?? `${modulePart.charAt(0).toUpperCase()}${modulePart.slice(1)} Service`;
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

function agentHelpers(service: CDService, uuid: string): AgentUsageTriggerListener[] {
    return (service.functions ?? [])
        .filter((fn) => fn.connections?.includes(uuid))
        .map((fn) => ({ symbol: fn.name, documentUri: fn.location.filePath, position: toPosition(fn.location) }));
}

function entryPointTrigger(
    service: CDService,
    trigger: AgentUsageTrigger,
    uuid: string,
    scope: AgentTriggerDeletionScope,
    label: string,
    location: CDLocation
): AgentUsageTrigger {
    const entryPoints = [...(service.resourceFunctions ?? []), ...(service.remoteFunctions ?? [])];
    return {
        ...trigger,
        entryPoint: { label, documentUri: location.filePath, position: toPosition(location) },
        orphansService: scope === "ENTRY_POINT_BODY"
            ? entryPoints.filter((fn) => fn.connections?.includes(uuid)).length === 1
            : entryPoints.length === 1 && (service.functions?.length ?? 0) === 0,
        scope,
        helpers: scope === "ENTRY_POINT_BODY" ? agentHelpers(service, uuid) : undefined,
    };
}

const TRY_IT_PROTOCOLS = new Set(["http", "ai", "graphql", "mcp"]);

function tryItFor(model: CDModel, service: CDService): AgentUsageTryIt | undefined {
    if (!TRY_IT_PROTOCOLS.has(modulePrefix(service.type))) {
        return undefined;
    }
    const listener = (service.attachedListeners ?? [])
        .map((uuid) => (model.listeners ?? []).find((listener) => listener.uuid === uuid)?.symbol)
        .filter(Boolean)
        .join(",");
    return { basePath: service.absolutePath?.trim() || "/", listener };
}

function agentCallSite(service: CDService, uuid: string, entryPoints: number): CDLocation | undefined {
    if (entryPoints !== 1) {
        return undefined;
    }
    const helpers = (service.functions ?? []).filter((fn) => fn.connections?.includes(uuid));
    return helpers.length === 1 ? helpers[0].location : undefined;
}

function usagesForService(
    model: CDModel,
    service: CDService,
    uuid: string,
    scope?: AgentTriggerDeletionScope
): AgentUsage[] {
    const label = serviceLabel(service);
    const name = serviceName(service);
    const isAgentChat = modulePrefix(service.type) === "ai";
    const trigger = scope ? triggerFor(model, service) : undefined;
    const memberScoped = scope === "ENTRY_POINT" || scope === "ENTRY_POINT_BODY";
    const serviceTrigger = memberScoped ? undefined : trigger;
    const scopedTrigger = (rowLabel: string, location: CDLocation) =>
        memberScoped ? entryPointTrigger(service, trigger, uuid, scope, rowLabel, location) : trigger;
    const tryIt = tryItFor(model, service);
    const isHttp = modulePrefix(service.type) === "http";
    const usages: AgentUsage[] = [];

    for (const resource of service.resourceFunctions ?? []) {
        if (resource.connections?.includes(uuid)) {
            const rowLabel = isAgentChat ? "Agent Chat" : resourceLabel(resource.accessor, resource.path);
            usages.push({
                label: rowLabel,
                serviceLabel: label,
                serviceName: name,
                functionName: resourcePath(resource.path),
                type: service.type,
                typeLabel: serviceTypeLabel(service.type),
                icon: service.icon,
                documentUri: resource.location.filePath,
                position: toPosition(resource.location),
                trigger: scopedTrigger(rowLabel, resource.location),
                tryIt: tryIt && isHttp
                    ? { ...tryIt, resource: { method: resource.accessor, path: resource.path } }
                    : tryIt,
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
                trigger: scopedTrigger(fn.name, fn.location),
                tryIt,
            });
        }
    }

    const callSite = agentCallSite(service, uuid, usages.length);
    if (callSite) {
        usages[0].documentUri = callSite.filePath;
        usages[0].position = toPosition(callSite);
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
            trigger: serviceTrigger,
            tryIt,
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
    return [...services].sort((a, b) =>
        modulePrefix(a.type).localeCompare(modulePrefix(b.type)) ||
        (a.location?.filePath ?? "").localeCompare(b.location?.filePath ?? "") ||
        (a.location?.startLine?.line ?? 0) - (b.location?.startLine?.line ?? 0));
}

export function findAgentUsages(
    model: CDModel,
    agent: AgentRef,
    triggerScopes?: AgentTriggerScopes
): AgentUsage[] {
    const uuid = model && findAgentUuid(model, agent);
    if (!uuid) {
        return [];
    }

    const services = (model.services ?? [])
        .filter((service) => service.connections?.includes(uuid))
        .filter((service) => !isGeneratedChatService(service.location?.filePath));

    const usages = groupByChannel(services).flatMap((service) =>
        usagesForService(model, service, uuid, triggerScopes?.get(modulePrefix(service.type))));

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

export type AgentTriggerScopes = Map<string, AgentTriggerDeletionScope>;

let triggerScopes: AgentTriggerScopes | undefined;

export async function getAgentTriggerScopes(rpcClient: BallerinaRpcClient): Promise<AgentTriggerScopes> {
    if (!triggerScopes) {
        const models = await rpcClient.getServiceDesignerRpcClient().getTriggerModels({ query: "" });
        triggerScopes = new Map(
            (models?.local ?? [])
                .filter((trigger) => trigger.agentTriggerKind && trigger.listenerProtocol && trigger.deletionScope)
                .map((trigger) => [trigger.listenerProtocol, trigger.deletionScope])
        );
    }
    return triggerScopes;
}

export function agentCallerProtocols(model: CDModel, agent: AgentRef): string[] {
    const uuid = model && findAgentUuid(model, agent);
    if (!uuid) {
        return [];
    }
    return (model.services ?? [])
        .filter((service) => service.connections?.includes(uuid))
        .map((service) => modulePrefix(service.type))
        .filter(Boolean);
}

const centralScopes = new Map<string, AgentTriggerDeletionScope | undefined>();

export async function resolveTriggerScopes(
    rpcClient: BallerinaRpcClient,
    known: AgentTriggerScopes,
    present: string[]
): Promise<AgentTriggerScopes> {
    const unresolved = [...new Set(present)].filter((protocol) => !known.has(protocol) && !centralScopes.has(protocol));

    await Promise.all(unresolved.map(async (protocol) => {
        try {
            const models = await rpcClient
                .getServiceDesignerRpcClient()
                .searchTriggers({ query: protocol, includeLocalRepository: true });
            const results = [...(models?.local ?? []), ...(models?.localRepositoryResults ?? [])];
            const match = results.find((trigger) => trigger.listenerProtocol === protocol && trigger.agentTriggerKind && trigger.deletionScope);
            centralScopes.set(protocol, match?.deletionScope);
        } catch (error) {
            console.error(`>>> agent focus: could not resolve the trigger protocol '${protocol}'`, error);
            centralScopes.set(protocol, undefined);
        }
    }));

    const resolved = new Map(known);
    for (const protocol of present) {
        const scope = centralScopes.get(protocol);
        if (scope) {
            resolved.set(protocol, scope);
        }
    }
    return resolved;
}

export function startLineOf(node: FlowNode): number {
    return node.codedata?.lineRange?.startLine?.line ?? 0;
}

export function namesHelper(node: FlowNode, helper: string): boolean {
    const expression = node.properties?.expression?.value;
    if (typeof expression !== "string") {
        return false;
    }
    return new RegExp(`(^|[^\\w.])(self\\.)?${helper}\\s*\\(`).test(expression);
}

export function findServiceHelperPosition(
    model: CDModel,
    service: string,
    helper: string,
    filePath: string
): NodePosition | undefined {
    const owner = (model?.services ?? []).find((candidate) => serviceName(candidate) === service);
    const fn = (owner?.functions ?? []).find(
        (candidate) => candidate.name === helper && samePath(candidate.location?.filePath ?? "", filePath));
    return fn ? toPosition(fn.location) : undefined;
}

export function deleteComponentAt(
    rpcClient: BallerinaRpcClient,
    name: string,
    documentUri: string,
    position: NodePosition
): Promise<unknown> {
    return rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
        filePath: documentUri,
        component: {
            name, filePath: documentUri,
            startLine: position.startLine, startColumn: position.startColumn,
            endLine: position.endLine, endColumn: position.endColumn,
        },
    });
}

export async function deleteEachResolved(
    rpcClient: BallerinaRpcClient,
    targets: AgentUsageTriggerListener[],
    locate: (model: CDModel, target: AgentUsageTriggerListener) => NodePosition | undefined
): Promise<void> {
    for (const target of targets) {
        const location = await rpcClient.getVisualizerLocation();
        const model = await rpcClient.getBIDiagramRpcClient()
            .getDesignModel({ projectPath: location?.projectPath });
        const position = locate(model?.designModel, target);
        if (position) {
            await deleteComponentAt(rpcClient, target.symbol, target.documentUri, position);
        }
    }
}

export async function clearAgentCallFromHandler(
    rpcClient: BallerinaRpcClient,
    trigger: AgentUsageTrigger
): Promise<void> {
    const entryPoint = trigger.entryPoint;
    const helpers = trigger.helpers ?? [];
    const response = await rpcClient.getBIDiagramRpcClient().getFlowModel({
        filePath: entryPoint.documentUri,
        startLine: { line: entryPoint.position.startLine, offset: entryPoint.position.startColumn },
        endLine: { line: entryPoint.position.endLine, offset: entryPoint.position.endColumn },
    });
    const calls = (response?.flowModel?.nodes ?? [])
        .filter((node) => helpers.some((helper) => namesHelper(node, helper.symbol)))
        .sort((a, b) => startLineOf(b) - startLineOf(a));
    if (calls.length === 0) {
        throw new Error(`no agent call found in ${entryPoint.label}`);
    }

    for (const node of calls) {
        await rpcClient.getBIDiagramRpcClient().deleteFlowNode({ filePath: entryPoint.documentUri, flowNode: node });
    }

    await deleteEachResolved(
        rpcClient,
        helpers.filter((helper) => calls.some((node) => namesHelper(node, helper.symbol))),
        (model, helper) => findServiceHelperPosition(model, trigger.serviceName, helper.symbol, helper.documentUri));
}
