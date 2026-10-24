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
import { AgentUsage, EVENT_TYPE, Flow, FlowNode, MACHINE_VIEW, NodeMetadata, NodePosition, ProjectStructureArtifactResponse, SearchNodesQuery, ToolData }
    from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { findClassByName, findFunctionByName } from "../FlowDiagram/utils";
import {
    AddingTool,
    DeletingTool,
    drawsAgentTool,
    findAgentScopedNode as findAgentScopedNodeAt,
    findFlowNodeByModuleVarName,
    isToolUsedByOtherAgent,
    refreshAgentNodeLineRange,
    removeMcpServerFromAgentNode,
    removeToolFromAgentNode,
    resolveAgentNodePosition,
    serializeAgentToolsEdit,
    withCurrentAgentTools,
} from "./utils";
import { getExistingToolNames } from "./toolForm";

export type AgentEditorView =
    | "NONE" | "MEMORY" | "MEMORY_STORE" | "ADD_TOOL" | "NEW_TOOL_CUSTOM" | "NEW_TOOL_CONNECTION"
    | "NEW_TOOL_FUNCTION" | "NEW_TOOL_AGENT" | "NEW_TOOL_AGENT_FORM" | "NEW_TOOL_KNOWLEDGE_BASE"
    | "ADD_MCP" | "EDIT_MCP";

export interface AgentEditorHost {
    projectPath: string;
    filePath?: string;
    onModelSelect(node: FlowNode): void;
    onRefresh(position?: NodePosition): void | Promise<void>;
    onSelectionChange?(node?: FlowNode): void;
    onLoadingChange?(loading: boolean): void;
    // Tool deletions save in the background without the loading state; true while any are queued or saving.
    onBackgroundSaveChange?(saving: boolean): void;
    onChat?(node: FlowNode): void;
    onAddTrigger?(node: FlowNode): void;
    onDeleteTrigger?(usage: AgentUsage, node: FlowNode): void;
    onTryTrigger?(usage: AgentUsage, node: FlowNode): void;
    resolveAgentNode?(node: FlowNode): FlowNode;
}

export interface AgentEditorController {
    view: AgentEditorView;
    projectPath: string;
    agentNode?: FlowNode;
    memoryNode?: FlowNode;
    memoryStoreNode?: FlowNode;
    memoryPropertyKey: string;
    selectedTool?: ToolData;
    selectedAgentName: string;
    diagramCallbacks: AgentNodeActions;
    openView(view: AgentEditorView): void;
    selectAgent(name: string): void;
    close(position?: NodePosition): void;
    cancel(): void;
    back(): void;
    setBackHandler(handler: (() => void) | null): void;
    // Tool edits on their way to the source; hosts draw them over the model (drawToolEdits) until it catches up.
    deletingTools: DeletingTool[];
    addingTools: AddingTool[];
    // Hosts pass each flow they fetch, so a finished edit stops being drawn over the model once the source shows it.
    syncToolEdits(flow?: Flow): void;
    // Closes the panel and shows the tool at once; `save` runs in the tool-edit queue and returns the agent's position.
    addToolInBackground(tool: ToolData, save: () => Promise<NodePosition | undefined>): void;
}

type ToolEditOutcome = { ok: boolean; position?: NodePosition };

const memoryKeyOf = (node?: FlowNode): string =>
    (node?.metadata?.data as NodeMetadata)?.agentInfo?.memory?.propertyKey || "memory";

const memoryStoreNameOf = (node?: FlowNode): string | undefined =>
    (node?.metadata?.data as NodeMetadata)?.agentInfo?.memory?.presentation?.store?.name;

export function useAgentEditorController(host: AgentEditorHost): AgentEditorController {
    const { rpcClient } = useRpcContext();
    const [view, setView] = useState<AgentEditorView>("NONE");
    const [agentNode, setAgentNode] = useState<FlowNode>();
    const [memoryNode, setMemoryNode] = useState<FlowNode>();
    const [memoryStoreNode, setMemoryStoreNode] = useState<FlowNode>();
    const [selectedTool, setSelectedTool] = useState<ToolData>();
    const [selectedAgentName, setSelectedAgentName] = useState("");
    const [backOverride, setBackOverride] = useState<(() => void) | null>(null);
    const [deletingTools, setDeletingTools] = useState<DeletingTool[]>([]);
    const [addingTools, setAddingTools] = useState<AddingTool[]>([]);
    const queuedEdits = useRef(0);
    const lastEditPosition = useRef<NodePosition>();
    // A save that finishes after the user opened another panel must not close that panel.
    const sessionRef = useRef(0);
    const [session, setSession] = useState(0);
    const startSession = useCallback(() => {
        sessionRef.current += 1;
        setSession(sessionRef.current);
    }, []);
    const activate = useCallback((node: FlowNode) => {
        setAgentNode(node);
        host.onSelectionChange?.(node);
    }, [host]);

    const setLoading = (loading: boolean) => host.onLoadingChange?.(loading);

    const resetView = useCallback(() => {
        setBackOverride(null);
        setView("NONE");
        setMemoryNode(undefined);
        setMemoryStoreNode(undefined);
        setSelectedTool(undefined);
        setSelectedAgentName("");
        setAgentNode(undefined);
        host.onSelectionChange?.(undefined);
        startSession();
    }, [host, startSession]);

    const close = useCallback((position?: NodePosition) => {
        if (session === sessionRef.current) {
            resetView();
        }
        void host.onRefresh(position);
    }, [resetView, host, session]);

    const cancel = useCallback(() => {
        resetView();
    }, [resetView]);

    const resolveToolComponent = useCallback(async (toolName: string) => {
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
    }, [rpcClient]);

    const resolveToolFunction = useCallback(async (toolName: string, agentNode: FlowNode) => {
        const agentFileName = agentNode.codedata?.lineRange?.fileName || "agents.bal";
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
        return resolveToolComponent(toolName);
    }, [host.projectPath, resolveToolComponent, rpcClient]);

    const findAgentScopedNode = useCallback((
        node: FlowNode, kind: SearchNodesQuery["kind"], name?: string
    ): Promise<FlowNode | undefined> => findAgentScopedNodeAt(rpcClient, node, kind, name, host.filePath),
    [host.filePath, rpcClient]);

    const selectMemory = useCallback(async (node: FlowNode) => {
        activate(node);
        const value = (node.properties as any)?.[memoryKeyOf(node)]?.value;
        setMemoryNode(await findAgentScopedNode(node, "MEMORY", typeof value === "string" ? value : undefined));
        setBackOverride(null);
        startSession();
        setView("MEMORY");
    }, [activate, findAgentScopedNode, startSession]);

    const selectMemoryStore = useCallback(async (node: FlowNode) => {
        activate(node);
        const store = await findAgentScopedNode(node, "SHORT_TERM_MEMORY_STORE", memoryStoreNameOf(node));
        if (!store) {
            console.error("Memory store declaration not found");
            return;
        }
        setMemoryStoreNode(store);
        setBackOverride(null);
        startSession();
        setView("MEMORY_STORE");
    }, [activate, findAgentScopedNode, startSession]);

    const deleteMemory = useCallback(async (node: FlowNode) => {
        activate(node);
        setLoading(true);
        let nextPosition: NodePosition | undefined;
        // After any queued tool deletions, and from the agent's tools as they are now, so none of them come back.
        await serializeAgentToolsEdit(async () => {
            try {
                await rpcClient.getVisualizerRpcClient().beginUndoGroup();
                const memoryKey = memoryKeyOf(node);
                const name = node.properties?.variable?.value as string;
                const memory = (node.properties as any)?.[memoryKey]?.value;
                const updated = structuredClone((await withCurrentAgentTools(node, rpcClient)).node);
                let deleteArtifacts: ProjectStructureArtifactResponse[] | undefined;
                if (typeof memory === "string" && memory.trim() && memory.trim() !== "()") {
                    const memoryVar = await findAgentScopedNode(node, "MEMORY", memory.trim());
                    if (memoryVar) {
                        const path = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                            segments: [memoryVar.codedata.lineRange.fileName],
                        })).filePath;
                        const response = await rpcClient.getBIDiagramRpcClient().deleteFlowNode({
                            filePath: path, flowNode: memoryVar,
                        });
                        deleteArtifacts = response?.artifacts;
                    }
                }
                await refreshAgentNodeLineRange(updated, rpcClient, deleteArtifacts);
                (updated.properties as any)[memoryKey].value = "()";
                const path = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [updated.codedata.lineRange.fileName],
                })).filePath;
                const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: path, flowNode: updated });
                nextPosition = response?.artifacts?.find((artifact) => artifact.name === name)?.position
                    ?? await resolveAgentNodePosition(updated, rpcClient);
            } catch (error) {
                console.error("Failed to delete memory", error);
                await rpcClient.getCommonRpcClient().showErrorMessage({
                    message: "Failed to delete memory. The deletion may be partially applied.",
                });
            } finally {
                await rpcClient.getVisualizerRpcClient().endUndoGroup("Memory Deletion").catch((): undefined => undefined);
            }
        });
        setLoading(false);
        close(nextPosition);
    }, [activate, close, findAgentScopedNode, rpcClient]);

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
            location: {
                documentUri: resolved.documentUri,
                identifier: tool.name,
                position: toolPosition,
                view: form ? MACHINE_VIEW.AIAgentToolForm : MACHINE_VIEW.BIDiagram,
            },
        });
    }, [resolveToolFunction, rpcClient]);

    const deleteMcpVariableAndClass = useCallback(async (tool: ToolData) => {
        const variableNodes = await rpcClient.getBIDiagramRpcClient().getModuleNodes();
        const mcpVariable = variableNodes.flowModel?.variables?.find(
            (variable) => variable.codedata?.node === "MCP_TOOL_KIT" && variable.properties.variable?.value === tool.name
        );
        if (!mcpVariable) {
            return;
        }

        const className = mcpVariable.properties?.toolKitName?.value as string | undefined;
        const mcpVariableFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
            segments: [mcpVariable.codedata.lineRange.fileName],
        })).filePath;
        await rpcClient.getBIDiagramRpcClient().deleteFlowNode({
            filePath: mcpVariableFilePath,
            flowNode: mcpVariable,
        });

        if (mcpVariable.properties?.type?.value === "ai:McpToolKit" || !className) {
            return;
        }
        const project = await rpcClient.getBIDiagramRpcClient().getProjectComponents();
        const classInfo: any = project?.components ? findClassByName(project.components, className) : null;
        if (!classInfo) {
            return;
        }
        await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
            filePath: classInfo.filePath,
            component: {
                name: "CLASS",
                filePath: classInfo.filePath,
                startLine: classInfo.startLine,
                startColumn: classInfo.startColumn,
                endLine: classInfo.endLine,
                endColumn: classInfo.endColumn,
            },
        });
    }, [rpcClient]);

    // The canvas already shows the edit's outcome, so nothing waits on it; one refresh follows once the queue empties.
    const runToolEdit = useCallback((edit: () => Promise<ToolEditOutcome>, settle: (ok: boolean) => void) => {
        queuedEdits.current += 1;
        if (queuedEdits.current === 1) {
            host.onBackgroundSaveChange?.(true);
        }
        void serializeAgentToolsEdit(edit)
            .catch((): ToolEditOutcome => ({ ok: false }))
            .then(async ({ ok, position }) => {
                settle(ok);
                lastEditPosition.current = position ?? lastEditPosition.current;
                queuedEdits.current -= 1;
                if (queuedEdits.current > 0) {
                    return;
                }
                host.onBackgroundSaveChange?.(false);
                const refreshAt = lastEditPosition.current;
                lastEditPosition.current = undefined;
                const refreshed = host.onRefresh(refreshAt);
                if (refreshed) {
                    // The model now comes from the source, so settled edits need no more drawing over it.
                    await refreshed.catch((): undefined => undefined);
                    setDeletingTools((current) => current.filter((item) => !item.settled));
                    setAddingTools((current) => current.filter((item) => !item.settled));
                }
            });
    }, [host]);

    // Runs in the tool-list queue, so it reads the agent and the function as the previous edits left them.
    const removeToolFromSource = useCallback(async (tool: ToolData, node: FlowNode): Promise<ToolEditOutcome> => {
        let nextPosition: NodePosition | undefined;
        const write = async (flowNode: FlowNode) => {
            const path = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [flowNode.codedata.lineRange.fileName],
            })).filePath;
            const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: path, flowNode });
            if (response?.error) {
                throw new Error(response.error);
            }
            return response;
        };
        try {
            await rpcClient.getVisualizerRpcClient().beginUndoGroup();
            if (tool.type?.includes("MCP Server")) {
                const latest = await withCurrentAgentTools(node, rpcClient);
                const updated = removeMcpServerFromAgentNode(latest.node, tool.name);
                if (updated) {
                    await write(updated);
                }
                await deleteMcpVariableAndClass(tool);
                // Deleting the toolkit class can drop an import above the agent and move it.
                return { ok: true, position: await resolveAgentNodePosition(node, rpcClient) };
            }
            const agentVarName = node.properties?.variable?.value as string;
            const agentPosition = (artifacts?: ProjectStructureArtifactResponse[]) =>
                artifacts?.find((artifact) => artifact.name === agentVarName)?.position;
            // One read serves both the agent's current tool list and the check on the other agents below.
            const moduleNodes = (await rpcClient.getBIDiagramRpcClient().getModuleNodes()).flowModel;
            const latest = await withCurrentAgentTools(node, rpcClient, moduleNodes);
            const updated = await removeToolFromAgentNode(latest.node, tool.name);
            if (updated) {
                if (!latest.current) {
                    const current = await findFlowNodeByModuleVarName(agentVarName, rpcClient, moduleNodes);
                    if (current?.codedata?.lineRange) {
                        updated.codedata.lineRange = current.codedata.lineRange;
                    }
                }
                nextPosition = agentPosition((await write(updated))?.artifacts);
            }
            // Another agent may still list the tool; deleting its function would break that agent.
            const resolved = isToolUsedByOtherAgent(moduleNodes, agentVarName, tool.name)
                ? null
                : await resolveToolComponent(tool.name);
            if (resolved) {
                const response = await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
                    filePath: resolved.documentUri,
                    component: {
                        name: tool.name, filePath: resolved.documentUri,
                        startLine: resolved.lineRange.startLine.line, startColumn: resolved.lineRange.startLine.offset,
                        endLine: resolved.lineRange.endLine.line, endColumn: resolved.lineRange.endLine.offset,
                        resources: [],
                    },
                });
                // Deleting the function can shift the agent, so only this edit's artifacts tell where it is now.
                nextPosition = agentPosition(response?.artifacts);
            }
            nextPosition ??= await resolveAgentNodePosition(node, rpcClient);
            return { ok: true, position: nextPosition };
        } catch (error) {
            console.error("Failed to delete tool", error);
            await rpcClient.getCommonRpcClient().showErrorMessage({
                message: `Failed to delete the tool ${tool.name}. The deletion may be partially applied.`,
            });
            return { ok: false };
        } finally {
            await rpcClient.getVisualizerRpcClient().endUndoGroup(`Tool Deletion - ${tool.name}`)
                .catch((): undefined => undefined);
        }
    }, [deleteMcpVariableAndClass, resolveToolComponent, rpcClient]);

    // The tool disappears at once and its edits queue up, so deleting several tools in a row never waits on a save.
    const deleteTool = useCallback((tool: ToolData, node: FlowNode, drawn?: FlowNode) => {
        const entry: DeletingTool = {
            nodeId: drawn?.id,
            agentName: typeof node.properties?.variable?.value === "string" ? node.properties.variable.value : undefined,
            name: tool.name,
        };
        setDeletingTools((current) => [...current, entry]);
        if (view === "EDIT_MCP" && selectedTool?.name === tool.name) {
            resetView();
        }
        // A failed deletion leaves the tool in the source, so it shows again at once.
        runToolEdit(() => removeToolFromSource(tool, node), (ok) => setDeletingTools((current) => ok
            ? current.map((item) => (item === entry ? { ...item, settled: true } : item))
            : current.filter((item) => item !== entry)));
    }, [removeToolFromSource, resetView, runToolEdit, selectedTool, view]);

    const addToolInBackground = useCallback((tool: ToolData, save: () => Promise<NodePosition | undefined>) => {
        const agentName = agentNode?.properties?.variable?.value;
        const entry: AddingTool = { agentName: typeof agentName === "string" ? agentName : undefined, name: tool.name, tool };
        setAddingTools((current) => [...current, entry]);
        resetView();
        const saveTool = async (): Promise<ToolEditOutcome> => {
            try {
                // The form checked the name against the source, which an earlier queued add may not have reached yet.
                if (agentNode && getExistingToolNames((await withCurrentAgentTools(agentNode, rpcClient)).node).includes(tool.name)) {
                    throw new Error("A tool with this name is already on the agent.");
                }
                await rpcClient.getVisualizerRpcClient().beginUndoGroup();
                try {
                    return { ok: true, position: await save() };
                } finally {
                    await rpcClient.getVisualizerRpcClient().endUndoGroup().catch((): undefined => undefined);
                }
            } catch (error) {
                console.error("Failed to add tool", error);
                await rpcClient.getCommonRpcClient().showErrorMessage({
                    message: `Failed to add the tool ${tool.name}. ${error instanceof Error ? error.message : ""}`.trim(),
                });
                return { ok: false };
            }
        };
        // A failed addition is not in the source, so it disappears at once.
        runToolEdit(saveTool, (ok) => setAddingTools((current) => ok
            ? current.map((item) => (item === entry ? { ...item, settled: true } : item))
            : current.filter((item) => item !== entry)));
    }, [agentNode, resetView, rpcClient, runToolEdit]);

    const syncToolEdits = useCallback((flow?: Flow) => {
        setDeletingTools((current) => {
            const kept = current.filter((item) => !item.settled || drawsAgentTool(flow, item));
            return kept.length === current.length ? current : kept;
        });
        setAddingTools((current) => {
            const kept = current.filter((item) => !item.settled || !drawsAgentTool(flow, item));
            return kept.length === current.length ? current : kept;
        });
    }, []);

    const resolve = useCallback(
        (node: FlowNode) => (host.resolveAgentNode ? host.resolveAgentNode(node) : node),
        [host]);

    const diagramCallbacks = useMemo<AgentNodeActions>(() => ({
        onModelSelect: (node) => { const n = resolve(node); activate(n); host.onModelSelect(n); },
        onAddTool: (node) => { setBackOverride(null); activate(resolve(node)); startSession(); setView("ADD_TOOL"); },
        onAddMcpServer: (node) => {
            setBackOverride(null); activate(resolve(node)); setSelectedTool(undefined); startSession(); setView("ADD_MCP");
        },
        onSelectTool: (tool, node) => void openTool(tool, resolve(node), true),
        onSelectMcpToolkit: (tool, node) => {
            setBackOverride(null); activate(resolve(node)); setSelectedTool(tool); startSession(); setView("EDIT_MCP");
        },
        onDeleteTool: (tool, node) => deleteTool(tool, resolve(node), node),
        goToTool: (tool, node) => void openTool(tool, resolve(node), false),
        onSelectMemoryManager: (node) => void selectMemory(resolve(node)),
        onSelectMemoryStore: (node) => void selectMemoryStore(resolve(node)),
        onDeleteMemoryManager: (node) => void deleteMemory(resolve(node)),
        onChatWithAgent: host.onChat && ((node) => host.onChat(resolve(node))),
        onAddTrigger: host.onAddTrigger && ((node) => host.onAddTrigger(resolve(node))),
        onDeleteTrigger: host.onDeleteTrigger && ((usage, node) => host.onDeleteTrigger(usage, resolve(node))),
        onTryTrigger: host.onTryTrigger && ((usage, node) => host.onTryTrigger(usage, resolve(node))),
    }), [activate, deleteMemory, deleteTool, host, openTool, resolve, selectMemory, selectMemoryStore, startSession]);

    const setBackHandler = useCallback(
        (handler: (() => void) | null) => setBackOverride(() => handler),
        []
    );

    const back = () => {
        if (backOverride) {
            backOverride();
            return;
        }
        if (view === "NEW_TOOL_AGENT_FORM") {
            setView("NEW_TOOL_AGENT");
            return;
        }
        setView("ADD_TOOL");
    };

    const openView = useCallback((next: AgentEditorView) => {
        setBackOverride(null);
        setView(next);
    }, []);

    const selectAgent = (name: string) => {
        setBackOverride(null);
        setSelectedAgentName(name);
        setView("NEW_TOOL_AGENT_FORM");
    };

    return {
        view, projectPath: host.projectPath, agentNode, memoryNode, memoryStoreNode, memoryPropertyKey: memoryKeyOf(agentNode),
        selectedTool, selectedAgentName,
        diagramCallbacks,
        openView, selectAgent, close, cancel, back, setBackHandler,
        deletingTools, addingTools, syncToolEdits, addToolInBackground,
    };
}
