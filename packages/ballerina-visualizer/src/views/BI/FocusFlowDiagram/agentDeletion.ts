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
    AgentUsage,
    AgentUsageTrigger,
    CDConnection,
    CDFunction,
    CDLocation,
    CDModel,
    CDResourceFunction,
    CDService,
    DeclarationReference,
    FlowNode,
    NodePosition,
    ProjectDirectoryMap,
    ProjectStructureArtifactResponse,
} from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import {
    AgentRef,
    AgentTriggerScopes,
    TriggerDeletionChoice,
    delegatedAgentUuids,
    deleteComponentAt,
    findAgentUsages,
    findAgentUuid,
    findAgentWorkflow,
    findDurableAgentUsages,
    getAgentTriggerScopes,
    isGeneratedChatService,
    modulePrefix,
    removeAgentTrigger,
    resolveTriggerScopes,
    resourceLabel,
    runsAgent,
    samePath,
    serviceName,
    toPosition,
    triggerFor,
} from "./agentUsages";
import { deleteMcpToolkit } from "../FlowDiagram/utils";

export type DeletableAgentKind = "agent" | "durable" | "workflow";

// Stable across re-reads: positions shift as earlier deletions land, these names don't.
export function triggerKey(trigger: AgentUsageTrigger): string {
    return `${trigger.documentUri}|${trigger.serviceName}|${trigger.entryPoint?.label ?? ""}`;
}

export function agentDeletionScope(trigger: AgentUsageTrigger): TriggerDeletionChoice {
    return !trigger.entryPoint || trigger.orphansService ? "service" : "endpoint";
}

function deletesWithAgent(usage: AgentUsage): boolean {
    const trigger = usage.trigger;
    if (usage.parentAgent || !trigger) {
        return false;
    }
    const clearsCall = agentDeletionScope(trigger) === "endpoint" && trigger.scope === "ENTRY_POINT_BODY";
    return !clearsCall || (trigger.helpers?.length ?? 0) > 0;
}

function usagesOf(model: CDModel, agent: AgentRef, kind: DeletableAgentKind, scopes?: AgentTriggerScopes): AgentUsage[] {
    return kind === "agent" ? findAgentUsages(model, agent, scopes) : findDurableAgentUsages(model, agent, scopes);
}

function declarationOf(model: CDModel, agent: AgentRef, kind: DeletableAgentKind): { uuid: string; location: CDLocation } | undefined {
    if (kind !== "agent") {
        return findAgentWorkflow(model, agent);
    }
    const uuid = findAgentUuid(model, agent);
    return (model.connections ?? []).find((connection) => connection.uuid === uuid);
}

type EntryFunction = CDResourceFunction | CDFunction;

function entryPointsOf(service: CDService | undefined): EntryFunction[] {
    return [...(service?.resourceFunctions ?? []), ...(service?.remoteFunctions ?? [])];
}

function atLine(location: CDLocation, filePath: string, line: number): boolean {
    return samePath(location.filePath, filePath) && location.startLine.line === line;
}

function deletedEntryPoints(model: CDModel, trigger: AgentUsageTrigger): EntryFunction[] {
    const service = (model.services ?? []).find((candidate) =>
        atLine(candidate.location, trigger.documentUri, trigger.position.startLine));
    const entryPoints = entryPointsOf(service);
    if (agentDeletionScope(trigger) === "service") {
        return entryPoints;
    }
    const { documentUri, position } = trigger.entryPoint;
    return trigger.scope === "ENTRY_POINT_BODY" ? [] : entryPoints.filter((fn) => atLine(fn.location, documentUri, position.startLine));
}

function runsOtherAgents(model: CDModel, fn: EntryFunction, uuid: string): boolean {
    const delegated = delegatedAgentUuids(model);
    const others = (model.connections ?? []).filter((connection) => connection.kind === "Agent" && connection.uuid !== uuid);
    return others.some((agent) => runsAgent(fn, agent.uuid, delegated)) || (fn.workflows ?? []).some((id) => id !== uuid);
}

export type AgentDeletionPlan = {
    triggers: AgentUsage[];
    blockers: AgentUsage[];
    shared: AgentUsage[];
};

export function planAgentDeletion(
    model: CDModel,
    agent: AgentRef,
    kind: DeletableAgentKind,
    scopes?: AgentTriggerScopes
): AgentDeletionPlan {
    const uuid = declarationOf(model, agent, kind)?.uuid;
    const usages = usagesOf(model, agent, kind, scopes);
    const removable = usages.filter(deletesWithAgent);
    const shared = removable.filter((usage) =>
        deletedEntryPoints(model, usage.trigger).some((fn) => runsOtherAgents(model, fn, uuid)));
    return {
        triggers: removable.filter((usage) => !shared.includes(usage)),
        blockers: usages.filter((usage) => !deletesWithAgent(usage)),
        shared,
    };
}

function servesAgent(service: CDService, uuid: string): boolean {
    return Boolean(service.connections?.includes(uuid)) || entryPointsOf(service).some((fn) => fn.workflows?.includes(uuid));
}

function generatedChatServices(model: CDModel, uuid: string | undefined): CDService[] {
    if (!uuid) {
        return [];
    }
    return (model.services ?? []).filter((service) => isGeneratedChatService(service.location?.filePath) && servesAgent(service, uuid));
}

type Span = { filePath: string; start: number; end: number };

function spanOf(filePath: string, position: NodePosition): Span {
    return { filePath, start: position.startLine, end: position.endLine };
}

function locationSpan(location: CDLocation): Span {
    return spanOf(location.filePath, toPosition(location));
}

function covers(span: Span, ref: DeclarationReference): boolean {
    return samePath(span.filePath, ref.filePath) && ref.position.line >= span.start && ref.position.line <= span.end;
}

function deletedSpans(trigger: AgentUsageTrigger): Span[] {
    if (agentDeletionScope(trigger) === "service") {
        return [spanOf(trigger.documentUri, trigger.position)];
    }
    if (trigger.scope === "ENTRY_POINT_BODY") {
        return (trigger.helpers ?? []).map((helper) => spanOf(helper.documentUri, helper.position));
    }
    return [spanOf(trigger.entryPoint.documentUri, trigger.entryPoint.position)];
}

function usageSpans(usage: AgentUsage): Span[] {
    const spans = [spanOf(usage.documentUri, usage.position)];
    return usage.trigger?.entryPoint ? [...spans, spanOf(usage.trigger.entryPoint.documentUri, usage.trigger.entryPoint.position)] : spans;
}

export type Declaration = { name: string; filePath: string; position: NodePosition };

function artifactsOf(directoryMap: ProjectDirectoryMap | undefined): ProjectStructureArtifactResponse[] {
    return Object.values(directoryMap ?? {}).flat().filter((artifact) => artifact?.position && artifact.path);
}

function enclosingArtifact(artifacts: ProjectStructureArtifactResponse[], ref: DeclarationReference): ProjectStructureArtifactResponse | undefined {
    const enclosing = artifacts.filter((artifact) => covers(spanOf(artifact.path, artifact.position), ref));
    return enclosing.sort((a, b) => (a.position.endLine - a.position.startLine) - (b.position.endLine - b.position.startLine))[0];
}

function agentToolNames(model: CDModel, uuid: string): Set<string> {
    return new Set((model.connections ?? []).flatMap((connection) =>
        Object.entries(connection.agentTools ?? {}).filter(([, target]) => target === uuid).map(([tool]) => tool)));
}

function placeOf(model: CDModel, artifacts: ProjectStructureArtifactResponse[], ref: DeclarationReference): AgentUsage {
    const at = { documentUri: ref.filePath, position: { startLine: ref.position.line, startColumn: ref.position.offset, endLine: ref.position.line, endColumn: ref.position.offset } };
    const service = (model.services ?? []).find((candidate) => covers(locationSpan(candidate.location), ref));
    if (service) {
        const fn = [...entryPointsOf(service), ...(service.functions ?? [])].find((candidate) => covers(locationSpan(candidate.location), ref));
        const name = serviceName(service).trim();
        const label = !fn ? name : "accessor" in fn ? resourceLabel(fn.accessor, fn.path) : fn.name;
        return { ...at, label, serviceName: fn ? name : undefined };
    }
    if (model.automation && covers(locationSpan(model.automation.location), ref)) {
        return { ...at, label: "main", type: "automation" };
    }
    const artifact = enclosingArtifact(artifacts, ref);
    return { ...at, label: artifact?.name ?? (/[\\/]tests[\\/]/.test(ref.filePath) ? "Tests" : "Other code") };
}

async function referencesTo(rpcClient: BallerinaRpcClient, declaration: Declaration): Promise<DeclarationReference[] | undefined> {
    const { position } = declaration;
    const response = await rpcClient.getBIDiagramRpcClient().getDeclarationReferences({
        filePath: declaration.filePath,
        startLine: { line: position.startLine, offset: position.startColumn },
        endLine: { line: position.endLine, offset: position.endColumn },
    });
    return response?.references;
}

function danglingPlaces(
    model: CDModel,
    artifacts: ProjectStructureArtifactResponse[],
    refs: DeclarationReference[],
    covered: Span[],
    tools: Set<string>
): AgentUsage[] {
    const places = refs
        .filter((ref) => !covered.some((span) => covers(span, ref)))
        .map((ref) => placeOf(model, artifacts, ref))
        .filter((place) => !tools.has(place.label));
    return places.filter((place, index) => places.findIndex((other) => other.label === place.label && other.serviceName === place.serviceName) === index);
}

export type CleanupGroup = {
    key: "model" | "memory" | "tools" | "mcp" | "store";
    declarations: Declaration[];
};

function declarationNamed(model: CDModel, artifacts: ProjectStructureArtifactResponse[], name: string): Declaration | undefined {
    const artifact = artifacts.find((candidate) => candidate.name === name);
    if (artifact) {
        return { name, filePath: artifact.path, position: artifact.position };
    }
    const connection = (model.connections ?? []).find((candidate) => candidate.symbol === name);
    return connection ? { name, filePath: connection.location.filePath, position: toPosition(connection.location) } : undefined;
}

function cleanupNames(agent: CDConnection): Record<Exclude<CleanupGroup["key"], "store">, string[]> {
    return {
        model: [agent.modelProvider?.symbol].filter(Boolean),
        memory: [agent.memory?.symbol].filter(Boolean),
        tools: agent.dependentFunctions ?? [],
        mcp: (agent.mcpToolKits ?? []).filter((name) => !name.includes("://")),
    };
}

async function moduleNodesOf(rpcClient: BallerinaRpcClient): Promise<FlowNode[]> {
    const flow = (await rpcClient.getBIDiagramRpcClient().getModuleNodes())?.flowModel;
    return [...(flow?.connections ?? []), ...(flow?.variables ?? [])];
}

async function nodeDeclaration(rpcClient: BallerinaRpcClient, node: FlowNode): Promise<Declaration> {
    const { fileName, startLine, endLine } = node.codedata.lineRange;
    const { filePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] });
    const position = { startLine: startLine.line, startColumn: startLine.offset, endLine: endLine.line, endColumn: endLine.offset };
    return { name: node.properties?.variable?.value as string, filePath, position };
}

function nodesOfKind(nodes: FlowNode[], kind: string, names?: string[]): FlowNode[] {
    return nodes.filter((node) =>
        node.codedata?.node === kind && (!names || names.includes(node.properties?.variable?.value as string)));
}

async function cleanupGroups(
    rpcClient: BallerinaRpcClient,
    model: CDModel,
    artifacts: ProjectStructureArtifactResponse[],
    agent: CDConnection | undefined,
    covered: Span[]
): Promise<CleanupGroup[]> {
    if (!agent) {
        return [];
    }
    const onlyWithin = (spans: Span[]) => async (declaration: Declaration) => {
        const refs = await referencesTo(rpcClient, declaration);
        return refs !== undefined && refs.every((ref) => spans.some((span) => covers(span, ref)));
    };
    const keep = async (declarations: Declaration[], spans: Span[]) => {
        const flags = await Promise.all(declarations.map(onlyWithin(spans)));
        return declarations.filter((_, index) => flags[index]);
    };
    const nodes = await moduleNodesOf(rpcClient);
    const groups = await Promise.all(Object.entries(cleanupNames(agent)).map(async ([key, names]) => {
        const declarations = key === "mcp"
            ? await Promise.all(nodesOfKind(nodes, "MCP_TOOL_KIT", names).map((node) => nodeDeclaration(rpcClient, node)))
            : names.map((name) => declarationNamed(model, artifacts, name)).filter(Boolean);
        return { key, declarations: await keep(declarations, covered) } as CleanupGroup;
    }));
    const memory = groups.find((group) => group.key === "memory")?.declarations[0];
    if (memory) {
        const stores = await Promise.all(nodesOfKind(nodes, "SHORT_TERM_MEMORY_STORE").map((node) => nodeDeclaration(rpcClient, node)));
        groups.push({ key: "store", declarations: await keep(stores, [spanOf(memory.filePath, memory.position)]) });
    }
    return groups.filter((group) => group.declarations.length > 0);
}

async function designModelOf(rpcClient: BallerinaRpcClient, projectPath: string): Promise<CDModel> {
    const model = (await rpcClient.getBIDiagramRpcClient().getDesignModel({ projectPath }))?.designModel;
    if (!model) {
        throw new Error("design model unavailable");
    }
    return model;
}

export type AgentDeletion = {
    plan: AgentDeletionPlan;
    scopes: AgentTriggerScopes;
    chatServices: number;
    dangling: AgentUsage[];
    cleanup: CleanupGroup[];
};

export async function loadAgentDeletion(
    rpcClient: BallerinaRpcClient,
    projectPath: string,
    agent: AgentRef,
    kind: DeletableAgentKind,
    directoryMap?: ProjectDirectoryMap
): Promise<AgentDeletion> {
    const [model, localScopes] = await Promise.all([designModelOf(rpcClient, projectPath), getAgentTriggerScopes(rpcClient)]);
    const protocols = usagesOf(model, agent, kind).map((usage) => modulePrefix(usage.type)).filter(Boolean);
    const scopes = await resolveTriggerScopes(rpcClient, localScopes, protocols);
    const plan = planAgentDeletion(model, agent, kind, scopes);
    const declaration = declarationOf(model, agent, kind);
    if (!declaration) {
        throw new Error(`${agent.symbol} not found in the design model`);
    }
    const chats = generatedChatServices(model, declaration.uuid);
    const artifacts = artifactsOf(directoryMap);
    const alwaysDeleted = [locationSpan(declaration.location), ...chats.map((service) => locationSpan(service.location))];
    const refs = await referencesTo(rpcClient, { name: agent.symbol, filePath: declaration.location.filePath, position: toPosition(declaration.location) });
    const known = [
        ...alwaysDeleted,
        ...plan.triggers.flatMap((usage) => deletedSpans(usage.trigger)),
        ...[...plan.blockers, ...plan.shared].flatMap(usageSpans),
    ];
    const agentConnection = kind === "agent" ? (model.connections ?? []).find((connection) => connection.uuid === declaration.uuid) : undefined;
    return {
        plan,
        scopes,
        chatServices: chats.length,
        dangling: danglingPlaces(model, artifacts, refs ?? [], known, agentToolNames(model, declaration.uuid)),
        cleanup: await cleanupGroups(rpcClient, model, artifacts, agentConnection, alwaysDeleted),
    };
}

async function locate(rpcClient: BallerinaRpcClient, projectPath: string, declaration: Declaration): Promise<NodePosition | undefined> {
    const structure = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
    const project = structure?.projects?.find((candidate) => samePath(candidate.projectPath, projectPath));
    const artifact = artifactsOf(project?.directoryMap)
        .find((candidate) => candidate.name === declaration.name && samePath(candidate.path, declaration.filePath));
    if (artifact) {
        return artifact.position;
    }
    const model = await designModelOf(rpcClient, projectPath);
    const connection = (model.connections ?? [])
        .find((candidate) => candidate.symbol === declaration.name && samePath(candidate.location.filePath, declaration.filePath));
    return connection ? toPosition(connection.location) : undefined;
}

async function deleteDeclaration(rpcClient: BallerinaRpcClient, projectPath: string, key: CleanupGroup["key"], declaration: Declaration) {
    if (key === "mcp") {
        return deleteMcpToolkit(rpcClient, declaration.name);
    }
    const position = await locate(rpcClient, projectPath, declaration);
    if (position) {
        await deleteComponentAt(rpcClient, declaration.name, declaration.filePath, position);
    }
}

export async function deleteAgentWithTriggers(
    rpcClient: BallerinaRpcClient,
    projectPath: string,
    agent: AgentRef,
    kind: DeletableAgentKind,
    { plan, scopes, chatServices }: AgentDeletion,
    cleanup: CleanupGroup[] = [],
    kept: Set<string> = new Set()
): Promise<void> {
    const removed = (usage: AgentUsage) => !kept.has(triggerKey(usage.trigger));
    const steps = plan.triggers.filter(removed).length + chatServices;
    let ref = agent;
    for (let step = 0; ; step++) {
        const model = await designModelOf(rpcClient, projectPath);
        const declaration = declarationOf(model, ref, kind);
        if (!declaration) {
            throw new Error(`${agent.symbol} not found in the design model`);
        }
        const chats = generatedChatServices(model, declaration.uuid).map((service) => triggerFor(model, service));
        const next = [...chats, ...planAgentDeletion(model, ref, kind, scopes).triggers.filter(removed).map((usage) => usage.trigger)][0];
        if (!next) {
            await deleteComponentAt(rpcClient, agent.symbol, declaration.location.filePath, toPosition(declaration.location));
            break;
        }
        if (step === steps) {
            throw new Error(`triggers of ${agent.symbol} remain after ${steps} deletions`);
        }
        await removeAgentTrigger(rpcClient, next, agentDeletionScope(next));
        // Lines may have shifted, so a stale location could now point at another declaration.
        ref = { ...agent, startLine: -1 };
    }
    for (const group of cleanup) {
        for (const declaration of group.declarations) {
            await deleteDeclaration(rpcClient, projectPath, group.key, declaration);
        }
    }
}
