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


import { useCallback, useMemo, useRef, useState } from "react";
import { AgentNodeActions } from "@wso2/bi-diagram";
import { EVENT_TYPE, FlowNode, MACHINE_VIEW, NodeMetadata, NodePosition, ToolData } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { findFunctionByName } from "../FlowDiagram/utils";
import {
    findFlowNode,
    findFlowNodeByModuleVarName,
    refreshNodeLineRangeFromArtifacts,
    removeToolFromAgentNode,
} from "./utils";

export type AgentEditorView =
    | "NONE" | "MEMORY" | "ADD_TOOL" | "NEW_TOOL_CUSTOM" | "NEW_TOOL_CONNECTION"
    | "NEW_TOOL_FUNCTION" | "NEW_TOOL_AGENT" | "NEW_TOOL_AGENT_FORM" | "ADD_MCP" | "EDIT_MCP";

export interface AgentEditorHost {
    projectPath: string;
    filePath?: string;
    onModelSelect(node: FlowNode): void;
    onRefresh(position?: NodePosition): void | Promise<void>;
    onSelectionChange?(node?: FlowNode): void;
    onLoadingChange?(loading: boolean): void;
    onChat?(node: FlowNode): void;
    onAgentCreated?(): void;
    resolveAgentNode?(node: FlowNode): FlowNode;
}

export interface AgentEditorController {
    view: AgentEditorView;
    agentNode?: FlowNode;
    memoryNode?: FlowNode;
    memoryPropertyKey: string;
    selectedTool?: ToolData;
    selectedAgentName: string;
    diagramCallbacks: AgentNodeActions;
    onAgentCreated?: () => void;
    openView(view: AgentEditorView): void;
    selectAgent(name: string): void;
    close(position?: NodePosition): void;
    back(): void;
}

const memoryKeyOf = (node?: FlowNode): string =>
    (node?.metadata?.data as NodeMetadata)?.agentInfo?.memory?.propertyKey || "memory";

export function useAgentEditorController(host: AgentEditorHost): AgentEditorController {
    const { rpcClient } = useRpcContext();
    const [view, setView] = useState<AgentEditorView>("NONE");
    const [agentNode, setAgentNode] = useState<FlowNode>();
    const [memoryNode, setMemoryNode] = useState<FlowNode>();
    const [selectedTool, setSelectedTool] = useState<ToolData>();
    const [selectedAgentName, setSelectedAgentName] = useState("");
    const activeAgent = useRef<FlowNode>();

    const activate = useCallback((node: FlowNode) => {
        activeAgent.current = node;
        setAgentNode(node);
        host.onSelectionChange?.(node);
    }, [host]);

    const setLoading = (loading: boolean) => host.onLoadingChange?.(loading);

    const close = useCallback((position?: NodePosition) => {
        setView("NONE");
        setMemoryNode(undefined);
        setSelectedTool(undefined);
        setSelectedAgentName("");
        activeAgent.current = undefined;
        setAgentNode(undefined);
        host.onSelectionChange?.(undefined);
        void host.onRefresh(position);
    }, [host]);

    const resolveToolFunction = useCallback(async (toolName: string, agentNode?: FlowNode) => {
        const agentFileName = (agentNode ?? activeAgent.current)?.codedata?.lineRange?.fileName || "agents.bal";
        const response = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
            functionName: toolName,
            fileName: agentFileName,
            projectPath: host.projectPath,
        });
        const lineRange = response?.functionDefinition?.codedata?.lineRange;
        if (lineRange) {
            const { filePath: documentUri } = await rpcClient
                .getVisualizerRpcClient()
                .joinProjectPath({ segments: [lineRange.fileName] });
            return { documentUri, lineRange };
        }
        const project = await rpcClient.getBIDiagramRpcClient().getProjectComponents();
        const found: any = project?.components ? findFunctionByName(project.components, toolName) : null;
        if (!found) {
            return null;
        }
        return {
            documentUri: found.filePath,
            lineRange: {
                fileName: found.filePath,
                startLine: { line: found.startLine, offset: found.startColumn },
                endLine: { line: found.endLine, offset: found.endColumn },
            },
        };
    }, [host.projectPath, rpcClient]);

    const selectMemory = useCallback(async (node: FlowNode) => {
        activate(node);
        const value = (node.properties as any)?.[memoryKeyOf(node)]?.value;
        let existing: FlowNode | undefined;
        if (typeof value === "string" && value.trim() && value.trim() !== "()") {
            const start = node.codedata?.lineRange?.startLine;
            const nodes = await findFlowNode(rpcClient, host.filePath, start, {
                kind: "MEMORY", exactMatch: value.trim(),
            });
            existing = nodes?.[0];
        }
        setMemoryNode(existing);
        setView("MEMORY");
    }, [activate, host.filePath, rpcClient]);

    const deleteMemory = useCallback(async (node: FlowNode) => {
        activate(node);
        setLoading(true);
        let nextPosition: NodePosition | undefined;
        try {
            const memoryKey = memoryKeyOf(node);
            const name = node.properties?.variable?.value as string;
            const memory = (node.properties as any)?.[memoryKey]?.value;
            const updated = structuredClone(node);
            if (typeof memory === "string" && memory.trim() && memory.trim() !== "()") {
                const memoryVar = await findFlowNodeByModuleVarName(memory.trim(), rpcClient);
                if (memoryVar) {
                    const path = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                        segments: [memoryVar.codedata.lineRange.fileName],
                    })).filePath;
                    const response = await rpcClient.getBIDiagramRpcClient().deleteFlowNode({
                        filePath: path, flowNode: memoryVar,
                    });
                    refreshNodeLineRangeFromArtifacts(updated, response?.artifacts, name);
                }
            }
            (updated.properties as any)[memoryKey].value = "()";
            const path = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [updated.codedata.lineRange.fileName],
            })).filePath;
            const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: path, flowNode: updated });
            nextPosition = response?.artifacts?.find((artifact) => artifact.name === name)?.position;
        } finally {
            setLoading(false);
            close(nextPosition);
        }
    }, [activate, close, rpcClient]);

    const openTool = useCallback(async (tool: ToolData, node: FlowNode, form: boolean) => {
        if (!tool?.name) {
            return;
        }
        const resolved = await resolveToolFunction(tool.name, node);
        if (!resolved) {
            return;
        }
        const toolPosition = {
            startLine: resolved.lineRange.startLine.line, startColumn: resolved.lineRange.startLine.offset,
            endLine: resolved.lineRange.endLine.line, endColumn: resolved.lineRange.endLine.offset,
        };
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: form ? {
                documentUri: resolved.documentUri,
                identifier: tool.name,
                position: toolPosition,
                view: MACHINE_VIEW.AIAgentToolForm,
            } : {
                documentUri: resolved.documentUri,
                position: toolPosition,
            },
        });
    }, [resolveToolFunction, rpcClient]);

    const deleteTool = useCallback(async (tool: ToolData, node: FlowNode) => {
        activate(node);
        setLoading(true);
        try {
            const updated = await removeToolFromAgentNode(node, tool.name);
            if (updated) {
                const path = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [node.codedata.lineRange.fileName],
                })).filePath;
                await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: path, flowNode: updated });
            }
            const resolved = await resolveToolFunction(tool.name, node);
            if (resolved) {
                await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
                    filePath: resolved.documentUri,
                    component: {
                        name: tool.name, filePath: resolved.documentUri,
                        startLine: resolved.lineRange.startLine.line, startColumn: resolved.lineRange.startLine.offset,
                        endLine: resolved.lineRange.endLine.line, endColumn: resolved.lineRange.endLine.offset,
                        resources: [],
                    },
                });
            }
        } finally {
            setLoading(false);
            close();
        }
    }, [activate, close, resolveToolFunction, rpcClient]);

    const resolve = useCallback(
        (node: FlowNode) => (host.resolveAgentNode ? host.resolveAgentNode(node) : node),
        [host]);

    const diagramCallbacks = useMemo<AgentNodeActions>(() => ({
        onModelSelect: (node) => { const n = resolve(node); activate(n); host.onModelSelect(n); },
        onAddTool: (node) => { activate(resolve(node)); setView("ADD_TOOL"); },
        onAddMcpServer: (node) => { activate(resolve(node)); setSelectedTool(undefined); setView("ADD_MCP"); },
        onSelectTool: (tool, node) => void openTool(tool, resolve(node), true),
        onSelectMcpToolkit: (tool, node) => { activate(resolve(node)); setSelectedTool(tool); setView("EDIT_MCP"); },
        onDeleteTool: (tool, node) => void deleteTool(tool, resolve(node)),
        goToTool: (tool, node) => void openTool(tool, resolve(node), false),
        onSelectMemoryManager: (node) => void selectMemory(resolve(node)),
        onDeleteMemoryManager: (node) => void deleteMemory(resolve(node)),
        onChatWithAgent: host.onChat,
    }), [activate, deleteMemory, deleteTool, host, openTool, resolve, selectMemory]);

    const back = () => setView(view === "NEW_TOOL_AGENT_FORM" ? "NEW_TOOL_AGENT" : "ADD_TOOL");
    const selectAgent = (name: string) => { setSelectedAgentName(name); setView("NEW_TOOL_AGENT_FORM"); };

    return {
        view, agentNode, memoryNode, memoryPropertyKey: memoryKeyOf(agentNode), selectedTool, selectedAgentName,
        diagramCallbacks, onAgentCreated: host.onAgentCreated,
        openView: setView, selectAgent, close, back,
    };
}
