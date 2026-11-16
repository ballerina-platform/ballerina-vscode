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

import { TraceAnimationEvent, traceAnimationChanged } from '@wso2/ballerina-core';
import { RPCLayer } from '../../RPCLayer';
import { VisualizerWebview } from '../../views/visualizer/webview';
import { Span, TraceServer } from './trace-server';

// Spans are exported when they end, so a tool that ran for 1 ms would otherwise only flash
const MIN_TOOL_GLOW_MS = 600;
const SAFETY_TIMEOUT_MS = 60_000;
const MAX_PENDING_TOOL_SPANS = 100;
const PENDING_TOOL_SPAN_TTL_MS = 30_000; // 30 seconds

function getSpanAttribute(span: Span, key: string): string | undefined {
    return span.attributes?.find(a => a.key === key)?.value;
}

type ActiveEntry = { event: TraceAnimationEvent; activatedAt: number; timer: NodeJS.Timeout };

// Keyed by chatKey(agent prompt) or the tool call ID
const activeEntries = new Map<string, ActiveEntry>();
let unsubscribe: (() => void) | undefined;

const processedSpanIds = new Set<string>();
// MCP tool calls in a chat response carry no toolkit name; execute_tool spans do
const toolKitByToolName = new Map<string, string>();

type RunStartInfo = { event: TraceAnimationEvent; traceId: string; startTime: number };
// The first chat of the latest trace per entrypoint path, used to light the model before any span arrives
const runStartByEntrypoint = new Map<string, RunStartInfo>();

// --- Parent-chain ancestry maps for agent disambiguation ---
//
// Real span hierarchy (from trace data):
//   invoke_agent
//   ├── Wso2ModelProvider:chat → chat gpt-4o-mini   (branch A)
//   ├── execute_tool                                  (branch B — sibling!)
//   └── Wso2ModelProvider:chat → chat gpt-4o-mini   (branch C)
//
// execute_tool and chat are SIBLINGS under invoke_agent, not parent-child.
// With SimpleSpanProcessor, execute_tool arrives BEFORE invoke_agent.
// So we propagate chat's info UP the parent chain to the shared ancestor,
// making it available when execute_tool walks up to the same ancestor.

// Maps every spanId to its parentSpanId (built for ALL incoming spans)
const parentMap = new Map<string, string>();
// Maps spanId → agent info. Populated directly on chat/invoke_agent spans
// AND propagated up from chat spans to their ancestors.
const ancestorInfoMap = new Map<string, { systemInstructions: string; toolNames: string[] }>();
// Buffered execute_tool spans waiting for their ancestor chain to be completed
const pendingToolSpans: Array<{ span: Span; activeToolName?: string; activeToolKitName?: string; addedAt: number }> = [];
let pendingToolSpansCleanupTimer: NodeJS.Timeout | undefined;

// Maps traceId → entrypoint info extracted from any span carrying these attributes
const traceEntrypointMap = new Map<string, { serviceName?: string; functionName?: string }>();

/**
 * Walk the parentMap from a given spanId upward, looking for a hit in ancestorInfoMap.
 * Returns the agent info if found, or undefined if the chain is incomplete.
 */
function resolveAncestorInfo(spanId: string): { systemInstructions: string; toolNames: string[] } | undefined {
    let current = spanId;
    const maxDepth = 20; // safety limit
    for (let i = 0; i < maxDepth; i++) {
        const info = ancestorInfoMap.get(current);
        if (info) {
            return info;
        }
        const parent = parentMap.get(current);
        if (!parent) {
            return undefined; // chain incomplete — parent span hasn't arrived yet
        }
        current = parent;
    }
    return undefined;
}

/**
 * Propagate agent info UP the parent chain from a span.
 * This ensures sibling branches (like execute_tool) can find
 * the info by walking up to the shared ancestor.
 *
 * Stops when: parentMap chain ends, or an ancestor already has info
 * (prevents cross-agent overwrite at shared ancestors like the root span).
 */
function propagateAncestorInfo(spanId: string, info: { systemInstructions: string; toolNames: string[] }) {
    let current = spanId;
    const maxDepth = 20;
    for (let i = 0; i < maxDepth; i++) {
        const parent = parentMap.get(current);
        if (!parent) {
            break; // chain ends — parent span hasn't arrived yet
        }
        if (ancestorInfoMap.has(parent)) {
            break; // ancestor already has info — don't overwrite (could be different agent)
        }
        ancestorInfoMap.set(parent, info);
        current = parent;
    }
}

function extractToolNamesFromChatSpan(span: Span): string[] {
    const toolsAttr = span.attributes?.find(a => a.key === 'gen_ai.input.tools');
    if (!toolsAttr?.value) {
        return [];
    }
    try {
        const tools = JSON.parse(toolsAttr.value);
        if (Array.isArray(tools)) {
            return tools
                .map((t: any) => t.function?.name || t.name || '')
                .filter(Boolean)
                .sort();
        }
    } catch {
        // Not valid JSON, ignore
    }
    return [];
}

function extractSystemInstructions(span: Span): string | undefined {
    // invoke_agent: direct attribute
    const directAttr = span.attributes?.find(a => a.key === 'gen_ai.system_instructions')?.value;
    if (directAttr) {
        return directAttr;
    }
    // chat: extract from gen_ai.input.messages (first element with role "system")
    const inputMessages = span.attributes?.find(a => a.key === 'gen_ai.input.messages')?.value;
    if (inputMessages) {
        try {
            const messages = JSON.parse(inputMessages);
            if (Array.isArray(messages)) {
                const systemMsg = messages.find((m: any) => m.role === 'system');
                if (systemMsg?.content) {
                    return systemMsg.content;
                }
            }
        } catch {
            // Not valid JSON, ignore
        }
    }
    return undefined;
}

/**
 * Determine span type from span name.
 */
function getSpanType(name: string): TraceAnimationEvent['type'] | null {
    if (name.startsWith('invoke_agent')) {
        return 'invoke_agent';
    }
    if (name.startsWith('chat')) {
        return 'chat';
    }
    if (name.startsWith('execute_tool')) {
        return 'execute_tool';
    }
    return null;
}

function sendAnimationEvent(event: TraceAnimationEvent) {
    try {
        RPCLayer._messenger.sendNotification(
            traceAnimationChanged,
            { type: 'webview', webviewType: VisualizerWebview.viewType },
            event
        );
    } catch (err) {
        console.error('[TraceAnim] Failed to send notification:', err);
    }
}

type ToolCall = { id?: string; name: string };

function extractToolCalls(span: Span): ToolCall[] {
    const output = getSpanAttribute(span, 'gen_ai.output.messages');
    if (!output) {
        return [];
    }
    try {
        const message = JSON.parse(output);
        const toolCalls = (Array.isArray(message) ? message[message.length - 1] : message)?.toolCalls;
        return Array.isArray(toolCalls) ? toolCalls.filter((call: ToolCall) => call?.name) : [];
    } catch {
        return [];
    }
}

function activate(key: string, event: TraceAnimationEvent) {
    clearTimeout(activeEntries.get(key)?.timer);
    sendAnimationEvent(event);
    const timer = setTimeout(() => deactivate(key), SAFETY_TIMEOUT_MS);
    activeEntries.set(key, { event, activatedAt: Date.now(), timer });
}

function deactivate(key: string) {
    const entry = activeEntries.get(key);
    if (!entry) {
        return;
    }
    clearTimeout(entry.timer);
    const delay = entry.event.type === 'execute_tool'
        ? Math.max(0, entry.activatedAt + MIN_TOOL_GLOW_MS - Date.now())
        : 0;
    entry.timer = setTimeout(() => {
        activeEntries.delete(key);
        sendAnimationEvent({ ...entry.event, active: false });
    }, delay);
}

function chatKey(traceId: string | undefined, systemInstructions?: string): string {
    return `chat:${traceId ?? ''}:${systemInstructions ?? ''}`;
}

// The chat span's tool calls and the later tool spans must land on the same key, with or without call IDs
function toolKey(traceId: string, toolName?: string, toolCallId?: string, systemInstructions?: string): string {
    return `tool:${traceId}:${toolCallId ?? `${systemInstructions ?? ''}:${toolName ?? ''}`}`;
}

// A final answer or finished run ends only that agent's turn in that trace, so a sub-agent leaves its caller lit
function endAgentTurn(traceId: string, systemInstructions?: string) {
    [...activeEntries.entries()]
        .filter(([, { event }]) => event.systemInstructions === systemInstructions
            && (event.traceId === traceId || event.traceId === undefined))
        .forEach(([key]) => deactivate(key));
}

/**
 * Remove expired and excess entries from pendingToolSpans.
 * Called at push time, before draining, and by periodic cleanup.
 */
function prunePendingToolSpans() {
    const now = Date.now();
    // Remove TTL-expired entries (iterate backwards to splice safely)
    for (let i = pendingToolSpans.length - 1; i >= 0; i--) {
        if (pendingToolSpans[i].addedAt + PENDING_TOOL_SPAN_TTL_MS < now) {
            pendingToolSpans.splice(i, 1);
        }
    }
    // Trim to most recent MAX_PENDING_TOOL_SPANS (drop oldest from front)
    if (pendingToolSpans.length > MAX_PENDING_TOOL_SPANS) {
        const excess = pendingToolSpans.length - MAX_PENDING_TOOL_SPANS;
        pendingToolSpans.splice(0, excess);
    }
}

/**
 * Show a finished tool for at least MIN_TOOL_GLOW_MS, unless its chat span already lit it.
 * Returns false while the ancestor chain is incomplete.
 */
function tryShowFinishedToolSpan(span: Span, activeToolName?: string, activeToolKitName?: string): boolean {
    const info = resolveAncestorInfo(span.spanId);
    if (!info) {
        return false;
    }
    const toolCallId = getSpanAttribute(span, 'gen_ai.tool.call.id');
    const key = toolKey(span.traceId, activeToolName, toolCallId, info.systemInstructions);
    const lit = activeEntries.get(key);
    if (!lit || lit.event.activeToolKitName !== activeToolKitName) {
        const entrypoint = getEntrypointForTrace(span.traceId);
        activate(key, {
            type: 'execute_tool',
            toolNames: info.toolNames,
            activeToolName,
            activeToolKitName,
            toolCallId,
            traceId: span.traceId,
            spanId: span.spanId,
            active: true,
            systemInstructions: info.systemInstructions,
            entrypointServiceName: entrypoint?.serviceName,
            entrypointFunctionName: entrypoint?.functionName,
        });
    }
    deactivate(key);
    return true;
}

/**
 * Drain pending tool spans — called after parentMap or ancestorInfoMap is updated.
 */
function drainPendingToolSpans() {
    prunePendingToolSpans();
    for (let i = pendingToolSpans.length - 1; i >= 0; i--) {
        const { span, activeToolName, activeToolKitName } = pendingToolSpans[i];
        if (tryShowFinishedToolSpan(span, activeToolName, activeToolKitName)) {
            pendingToolSpans.splice(i, 1);
        }
    }
}

function extractEntrypointInfo(span: Span): { serviceName?: string; functionName?: string } | undefined {
    const serviceName = span.attributes?.find(a => a.key === 'entrypoint.service.name')?.value;
    const functionName = span.attributes?.find(a => a.key === 'entrypoint.function.name')?.value;
    if (serviceName !== undefined || functionName !== undefined) {
        return { serviceName, functionName };
    }
    return undefined;
}

function getEntrypointForTrace(traceId: string): { serviceName?: string; functionName?: string } | undefined {
    return traceEntrypointMap.get(traceId);
}

/**
 * A chat span ends when the model has chosen its tools, so they start running now.
 * The chat entry stays active, so the model glows again once those tools finish.
 */
function showToolCalls(span: Span, toolCalls: ToolCall[], toolNames: string[], systemInstructions?: string) {
    const entrypoint = getEntrypointForTrace(span.traceId);
    const base = {
        toolNames,
        traceId: span.traceId,
        spanId: span.spanId,
        active: true,
        systemInstructions,
        entrypointServiceName: entrypoint?.serviceName,
        entrypointFunctionName: entrypoint?.functionName,
    };
    activate(chatKey(span.traceId, systemInstructions), { ...base, type: 'chat' });
    for (const call of toolCalls) {
        activate(toolKey(span.traceId, call.name, call.id, systemInstructions), {
            ...base,
            type: 'execute_tool',
            activeToolName: call.name,
            toolCallId: call.id,
            activeToolKitName: toolKitByToolName.get(call.name),
        });
    }
}

function entrypointPath(serviceName = '', functionName = ''): string {
    return `/${serviceName}/${functionName}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
}

function rememberRunStart(span: Span, toolNames: string[], systemInstructions?: string) {
    const entrypoint = getEntrypointForTrace(span.traceId);
    if (!entrypoint || !systemInstructions) {
        return;
    }
    const key = entrypointPath(entrypoint.serviceName, entrypoint.functionName);
    const startTime = span.startTime ? new Date(span.startTime).getTime() : Infinity;
    const known = runStartByEntrypoint.get(key);
    if (known?.traceId === span.traceId && known.startTime <= startTime) {
        return;
    }
    runStartByEntrypoint.set(key, {
        traceId: span.traceId,
        startTime,
        event: {
            type: 'chat',
            toolNames,
            spanId: span.spanId,
            active: true,
            systemInstructions,
            entrypointServiceName: entrypoint.serviceName,
            entrypointFunctionName: entrypoint.functionName,
        },
    });
}

function chatEndpointPath(chatEndpoint: string): string | undefined {
    try {
        return entrypointPath(new URL(chatEndpoint).pathname);
    } catch {
        return undefined;
    }
}

/** Lights the model when Agent Chat sends a request; spans only arrive once the first LLM call ends. */
export function showAgentChatRunStart(chatEndpoint: string) {
    const path = chatEndpointPath(chatEndpoint);
    const runStart = unsubscribe && path && runStartByEntrypoint.get(path);
    if (runStart) {
        // The new run's trace ID is not known yet
        activate(chatKey(undefined, runStart.event.systemInstructions), { ...runStart.event, traceId: undefined });
    }
}

/** Ends what an Agent Chat request lit, leaving runs on other entrypoints alone. */
export function endAgentChatRun(chatEndpoint: string) {
    const path = chatEndpointPath(chatEndpoint);
    [...activeEntries.entries()]
        .filter(([, { event }]) => entrypointPath(event.entrypointServiceName, event.entrypointFunctionName) === path)
        .forEach(([key]) => deactivate(key));
}

function processSpans(spans: Span[]) {
    // Phase 1: Register ALL spans in parentMap and extract entrypoint info (regardless of type)
    for (const span of spans) {
        if (span.parentSpanId) {
            parentMap.set(span.spanId, span.parentSpanId);
            // A child chat span can arrive first and leave its info here, before this link existed
            const info = ancestorInfoMap.get(span.spanId);
            if (info) {
                propagateAncestorInfo(span.spanId, info);
            }
        }
        // Extract entrypoint info from any span that carries it (typically the root span)
        if (!traceEntrypointMap.has(span.traceId)) {
            const entrypoint = extractEntrypointInfo(span);
            if (entrypoint) {
                traceEntrypointMap.set(span.traceId, entrypoint);
            }
        }
    }

    // Sort by startTime to ensure chronological order within a batch
    const sorted = [...spans].sort((a, b) => {
        if (!a.startTime || !b.startTime) {
            return 0;
        }
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    // Phase 2: Process typed spans (chat, invoke_agent, execute_tool)
    for (const span of sorted) {
        // Skip spans already processed (handles OTLP retries / duplicate delivery)
        if (processedSpanIds.has(span.spanId)) {
            continue;
        }
        processedSpanIds.add(span.spanId);

        const spanType = getSpanType(span.name);
        if (spanType === 'chat' || spanType === 'invoke_agent') {
            const systemInstructions = extractSystemInstructions(span);
            const toolNames = spanType === 'chat' ? extractToolNamesFromChatSpan(span) : [];

            if (systemInstructions) {
                // Don't overwrite richer info (chat has toolNames, invoke_agent doesn't)
                if (!ancestorInfoMap.has(span.spanId)) {
                    ancestorInfoMap.set(span.spanId, { systemInstructions, toolNames });
                }
                // Propagate info UP the parent chain so sibling branches
                // (like execute_tool) can find it at the shared ancestor
                propagateAncestorInfo(span.spanId, { systemInstructions, toolNames });
            }

            if (spanType === 'chat') {
                rememberRunStart(span, toolNames, systemInstructions);
            }
            const toolCalls = spanType === 'chat' ? extractToolCalls(span) : [];
            if (toolCalls.length === 0) {
                endAgentTurn(span.traceId, systemInstructions);
                continue;
            }
            showToolCalls(span, toolCalls, toolNames, systemInstructions);
        } else if (spanType === 'execute_tool') {
            const activeToolName = getSpanAttribute(span, 'gen_ai.tool.name');
            const activeToolKitName = getSpanAttribute(span, 'gen_ai.tool.toolkit.name');
            if (activeToolName && activeToolKitName) {
                toolKitByToolName.set(activeToolName, activeToolKitName);
            }

            // Try to resolve via ancestor chain immediately
            if (!tryShowFinishedToolSpan(span, activeToolName, activeToolKitName)) {
                // Chain incomplete — buffer until ancestor arrives
                pendingToolSpans.push({ span, activeToolName, activeToolKitName, addedAt: Date.now() });
                prunePendingToolSpans();
            }
        }
    }

    // Phase 3: New spans may have completed chains for previously buffered tools
    drainPendingToolSpans();
}

export function initTraceAnimation() {
    disposeTraceAnimation();
    unsubscribe = TraceServer.onNewSpans(processSpans);
    // Periodic GC for idle periods where new spans never arrive to trigger draining
    pendingToolSpansCleanupTimer = setInterval(prunePendingToolSpans, PENDING_TOOL_SPAN_TTL_MS);
}

export function disposeTraceAnimation() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = undefined;
    }
    // Emit deactivation events for all currently active entries before cleanup
    for (const { timer, event } of activeEntries.values()) {
        clearTimeout(timer);
        sendAnimationEvent({ ...event, active: false });
    }
    activeEntries.clear();
    toolKitByToolName.clear();
    runStartByEntrypoint.clear();
    processedSpanIds.clear();
    // Clear periodic pending-spans cleanup timer
    if (pendingToolSpansCleanupTimer) {
        clearInterval(pendingToolSpansCleanupTimer);
        pendingToolSpansCleanupTimer = undefined;
    }
    // Clear ancestry maps and pending buffer
    parentMap.clear();
    ancestorInfoMap.clear();
    pendingToolSpans.length = 0;
    traceEntrypointMap.clear();
}
