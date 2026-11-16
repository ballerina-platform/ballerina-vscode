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

import React, { useState, useSyncExternalStore, RefObject } from "react";
import { Flow, FlowNode, Branch, LineRange, ToolData } from "../utils/types";
import { CompletionItem, FormExpressionEditorRef, HelperPaneHeight } from "@wso2/ui-toolkit";
import { ExpressionProperty, JoinProjectPathRequest, JoinProjectPathResponse, RecordTypeField, TextEdit, TraceAnimationEvent, VisualizerLocation, webviewAssistantName } from "@wso2/ballerina-core";
import { HelperpaneOnChangeOptions, InputMode } from "@wso2/ballerina-side-panel";
import { AgentNodeActions } from "./AgentNodeActions";

type CompletionConditionalProps = {
    completions: CompletionItem[];
    triggerCharacters: readonly string[];
    retrieveCompletions: (
        value: string,
        property: ExpressionProperty,
        offset: number,
        triggerCharacter?: string
    ) => Promise<void>;
} | {
    completions?: never;
    triggerCharacters?: never;
    retrieveCompletions?: never;
}

export type GetHelperPaneFunction = (
    fieldKey: string,
    exprRef: RefObject<FormExpressionEditorRef>,
    anchorRef: RefObject<HTMLDivElement>,
    defaultValue: string,
    value: string,
    onChange: (value: string, options?: HelperpaneOnChangeOptions) => void,
    changeHelperPaneState: (isOpen: boolean) => void,
    helperPaneHeight: HelperPaneHeight,
    recordTypeField?: RecordTypeField,
    isAssignIdentifier?: boolean,
    valueTypeConstraint?: string | string[],
    inputMode?: InputMode
) => JSX.Element;

export type ExpressionContextProps = CompletionConditionalProps & {
    onCompletionItemSelect?: (value: string, additionalTextEdits?: TextEdit[]) => Promise<void>;
    onFocus?: () => void | Promise<void>;
    onBlur?: () => void | Promise<void>;
    onCancel?: () => void;
    getHelperPane?: GetHelperPaneFunction;
    getExpressionTokens?: (
        expression: string,
        filePath: string,
        position: { line: number; offset: number }
    ) => Promise<number[]>;
}

export interface DiagramPromptOptions {
    autoSubmit?: boolean;
    planMode?: boolean;
}

export interface DiagramContextState {
    flow: Flow;
    componentPanel: {
        visible: boolean;
        show(): void;
        hide(): void;
    };
    showErrorFlow: boolean;
    expandedErrorHandler?: string;
    toggleErrorHandlerExpansion?: (nodeId: string) => void;
    onAddNode?: (parent: FlowNode | Branch, target: LineRange) => void;
    onAddNodePrompt?: (parent: FlowNode | Branch, target: LineRange, prompt: string, options?: DiagramPromptOptions) => void;
    onDeleteNode?: (node: FlowNode) => void;
    onAddComment?: (comment: string, target: LineRange) => void;
    onNodeSelect?: (node: FlowNode) => void;
    onNodeSave?: (node: FlowNode) => void;
    addBreakpoint?: (node: FlowNode) => void;
    removeBreakpoint?: (node: FlowNode) => void;
    onConnectionSelect?: (connectionName: string) => void;
    goToSource: (node: FlowNode) => void;
    openView: (location: VisualizerLocation) => void;
    goToAgent?: (node: FlowNode) => void;
    goToA2aHandler?: (node: FlowNode) => void;
    goToAgentDefinition?: (node: FlowNode) => void;
    getAgentDefinitionLocation?: (node: FlowNode) => Promise<VisualizerLocation | undefined>;
    draftNode?: {
        override: boolean;
        showSpinner?: boolean;
        description?: string;
    };
    selectedNodeId?: string;
    agentNode?: AgentNodeActions;
    aiNodes?: {
        onModelSelect: (node: FlowNode) => void;
    };
    suggestions?: {
        fetching: boolean;
        onAccept(): void;
        onDiscard(): void;
    };
    project?: {
        org: string;
        path: string;
        getProjectPath?: (props: JoinProjectPathRequest) => Promise<JoinProjectPathResponse>;
        getFunctionLocation?: (functionName: string) => Promise<VisualizerLocation | undefined>;
    };
    readOnly?: boolean;
    lockCanvas?: boolean;
    setLockCanvas?: (lock: boolean) => void;
    isUserAuthenticated?: boolean;
    aiAssistantName: string;
    expressionContext: ExpressionContextProps;
    nodeComments?: Map<string, FlowNode[]>;
    entrypointContext?: {
        serviceName?: string;
        functionName?: string;
    };
}

export const DiagramContext = React.createContext<DiagramContextState>({
    flow: { fileName: "", nodes: [], connections: [] },
    componentPanel: {
        visible: false,
        show: () => { },
        hide: () => { },
    },
    showErrorFlow: false,
    expandedErrorHandler: undefined,
    toggleErrorHandlerExpansion: () => { },
    onAddNode: () => { },
    onAddNodePrompt: () => { },
    onDeleteNode: () => { },
    onAddComment: () => { },
    onNodeSelect: () => { },
    onConnectionSelect: () => { },
    goToSource: () => { },
    addBreakpoint: () => { },
    removeBreakpoint: () => { },
    openView: () => { },
    goToAgent: () => { },
    goToA2aHandler: () => { },
    goToAgentDefinition: () => { },
    getAgentDefinitionLocation: () => Promise.resolve(undefined),
    draftNode: {
        override: true,
        showSpinner: false,
        description: "",
    },
    selectedNodeId: undefined,
    agentNode: undefined,
    aiNodes: {
        onModelSelect: () => { },
    },
    suggestions: {
        fetching: false,
        onAccept: () => { },
        onDiscard: () => { },
    },
    project: {
        org: "",
        path: "",
        getProjectPath: () => Promise.resolve({ filePath: "", projectPath: "" }),
        getFunctionLocation: () => Promise.resolve(undefined),
    },
    readOnly: false,
    aiAssistantName: webviewAssistantName(),
    lockCanvas: false,
    setLockCanvas: (_lock: boolean) => { },
    isUserAuthenticated: false,
    expressionContext: {
        completions: [],
        triggerCharacters: [],
        retrieveCompletions: () => Promise.resolve(),
    }
});

export const useDiagramContext = () => React.useContext(DiagramContext);

export function DiagramContextProvider(props: { children: React.ReactNode; value: DiagramContextState }) {
    const [lockCanvas, setLockCanvas] = useState(false);

    const ctx = {
        ...props.value,
        lockCanvas,
        setLockCanvas,
    };

    return <DiagramContext.Provider value={ctx}>{props.children}</DiagramContext.Provider>;
}

export type AnimationPhase = 'active' | 'fading-out';

export type TraceAnimationEntry = {
    type: 'invoke_agent' | 'chat' | 'execute_tool';
    toolName?: string;
    toolKitName?: string;
    // The owning agent's prompt; nested agents share this state, so entries are matched per agent
    systemInstructions?: string;
    toolCallId?: string;
    traceId?: string;
    agentToolNames: string[];
    phase: AnimationPhase;
};

type TraceAnimationEntryRef = Pick<TraceAnimationEntry, 'type' | 'toolName' | 'systemInstructions' | 'toolCallId' | 'traceId'>;

export type TraceAnimationState = {
    entries: TraceAnimationEntry[];
    entrypointServiceName?: string;
    entrypointFunctionName?: string;
} | undefined;

const FADE_OUT_DURATION_MS = 400;
const STALE_ENTRY_TIMEOUT_MS = 60_000; // Safety: auto-deactivate entries older than 60s

let traceAnimationState: TraceAnimationState = undefined;
const traceAnimationListeners = new Set<() => void>();
const fadeOutTimers = new Map<string, ReturnType<typeof setTimeout>>();
const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getTraceAnimationSnapshot(): TraceAnimationState {
    return traceAnimationState;
}

function subscribeTraceAnimation(listener: () => void): () => void {
    traceAnimationListeners.add(listener);
    return () => traceAnimationListeners.delete(listener);
}

function notifyListeners() {
    traceAnimationListeners.forEach(l => { l(); });
}

function entryKey(entry: TraceAnimationEntryRef): string {
    return [entry.type, entry.toolName, entry.toolCallId, entry.traceId, entry.systemInstructions].map(part => part ?? '').join(':');
}

function entryFromEvent(event: TraceAnimationEvent): TraceAnimationEntry {
    return {
        type: event.type,
        toolName: event.activeToolName,
        toolKitName: event.activeToolKitName,
        systemInstructions: event.systemInstructions,
        toolCallId: event.toolCallId,
        traceId: event.traceId,
        agentToolNames: event.toolNames,
        phase: 'active',
    };
}

function cleanupFadedEntries(keyToClean: string) {
    fadeOutTimers.delete(keyToClean);
    if (!traceAnimationState) return;
    const remaining = traceAnimationState.entries.filter(
        e => !(entryKey(e) === keyToClean && e.phase === 'fading-out')
    );
    if (remaining.length === 0) {
        traceAnimationState = undefined;
    } else {
        traceAnimationState = { ...traceAnimationState, entries: remaining };
    }
    notifyListeners();
}

function scheduleFadeOut(key: string) {
    if (!fadeOutTimers.has(key)) {
        fadeOutTimers.set(key, setTimeout(() => cleanupFadedEntries(key), FADE_OUT_DURATION_MS));
    }
}

function scheduleStaleCleanup(key: string, entry: TraceAnimationEntryRef) {
    const existing = staleTimers.get(key);
    if (existing) {
        clearTimeout(existing);
    }
    staleTimers.set(key, setTimeout(() => {
        staleTimers.delete(key);
        // Force-deactivate if still active
        deactivateEntry(entry);
    }, STALE_ENTRY_TIMEOUT_MS));
}

function clearStaleTimer(key: string) {
    const existing = staleTimers.get(key);
    if (existing) {
        clearTimeout(existing);
        staleTimers.delete(key);
    }
}

// A new chat ends the same agent's tool calls; a new chat or run replaces the same agent's previous one
function isSupersededBy(entry: TraceAnimationEntry, next: TraceAnimationEntry): boolean {
    const replacesTool = next.type === 'chat' && entry.type === 'execute_tool';
    const replacesTurn = next.type !== 'execute_tool' && entry.type === next.type;
    const sameRun = entry.systemInstructions === next.systemInstructions && entry.traceId === next.traceId;
    return entry.phase === 'active' && sameRun && (replacesTool || replacesTurn);
}

export function setTraceAnimationActive(event: TraceAnimationEvent) {
    const next = entryFromEvent(event);
    const key = entryKey(next);

    // Clear any pending fade-out timer for this entry
    const existing = fadeOutTimers.get(key);
    if (existing) {
        clearTimeout(existing);
        fadeOutTimers.delete(key);
    }

    const updatedEntries = (traceAnimationState?.entries || [])
        .filter(e => entryKey(e) !== key) // remove exact duplicate
        .map(e => {
            if (!isSupersededBy(e, next)) {
                return e;
            }
            scheduleFadeOut(entryKey(e));
            return { ...e, phase: 'fading-out' as const };
        });
    updatedEntries.push(next);
    scheduleStaleCleanup(key, next);

    traceAnimationState = {
        entries: updatedEntries,
        entrypointServiceName: event.entrypointServiceName ?? traceAnimationState?.entrypointServiceName,
        entrypointFunctionName: event.entrypointFunctionName ?? traceAnimationState?.entrypointFunctionName,
    };
    notifyListeners();
}

export function setTraceAnimationInactive(event: TraceAnimationEvent) {
    deactivateEntry(entryFromEvent(event));
}

function deactivateEntry(entry: TraceAnimationEntryRef) {
    if (!traceAnimationState) return;

    const key = entryKey(entry);
    clearStaleTimer(key);

    // Mark matching entry as fading-out
    const updatedEntries = traceAnimationState.entries.map(e => {
        if (entryKey(e) === key && e.phase === 'active') {
            return { ...e, phase: 'fading-out' as const };
        }
        return e;
    });

    traceAnimationState = { ...traceAnimationState, entries: updatedEntries };
    notifyListeners();
    scheduleFadeOut(key);
}

export function useTraceAnimation(): TraceAnimationState {
    return useSyncExternalStore(subscribeTraceAnimation, getTraceAnimationSnapshot);
}
