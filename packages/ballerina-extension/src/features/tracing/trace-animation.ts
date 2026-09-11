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

const FADE_OUT_DELAY_MS = 3000;
const SAFETY_TIMEOUT_MS = 5000;
const EVENT_STAGGER_DELAY_MS = 400;
const MAX_PENDING_TOOL_SPANS = 100;
const PENDING_TOOL_SPAN_TTL_MS = 30_000; // 30 seconds

function getSpanAttribute(span: Span, key: string): string | undefined {
    return span.attributes?.find(a => a.key === key)?.value;
}

const activeSpans = new Map<string, { timer: NodeJS.Timeout; event: TraceAnimationEvent }>();
let unsubscribe: (() => void) | undefined;

const processedSpanIds = new Set<string>();
const eventQueue: Array<{ event: TraceAnimationEvent; span: Span }> = [];
let eventQueueTimer: NodeJS.Timeout | undefined;
let lastEventActivationTime = 0;

// Track the last chat span so tools can extend its lifetime
let lastChatSpanId: string | undefined;

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

function scheduleDeactivation(spanId: string, event: TraceAnimationEvent, delay = FADE_OUT_DELAY_MS) {
    // Clear any existing timer
    const existing = activeSpans.get(spanId);
    if (existing) {
        clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
        activeSpans.delete(spanId);
        if (spanId === lastChatSpanId) {
            lastChatSpanId = undefined;
        }
        sendAnimationEvent({ ...event, active: false });
    }, delay);

    activeSpans.set(spanId, { timer, event });
}

function extendChatSpanLifetime() {
    if (!lastChatSpanId || !activeSpans.has(lastChatSpanId)) { return; }
    const { event } = activeSpans.get(lastChatSpanId)!;
    scheduleDeactivation(lastChatSpanId, event, SAFETY_TIMEOUT_MS);
}

function deactivateAllTools() {
    for (const [spanId, { timer, event }] of activeSpans.entries()) {
        if (event.type === 'execute_tool') {
            clearTimeout(timer);
            activeSpans.delete(spanId);
            sendAnimationEvent({ ...event, active: false });
        }
    }
}

function processNextEvent() {
    eventQueueTimer = undefined;
    if (eventQueue.length === 0) {
        return;
    }

    const { event, span } = eventQueue.shift()!;
    lastEventActivationTime = Date.now();

    // Type-specific pre-activation logic
    if (event.type === 'chat') {
        // LLM is thinking again → deactivate any lingering tools
        deactivateAllTools();
        lastChatSpanId = span.spanId;
    } else if (event.type === 'execute_tool') {
        // Tool starting → keep the chat span alive so model re-glows after tools
        extendChatSpanLifetime();
    }

    sendAnimationEvent(event);

    // Schedule deactivation
    if (span.endTime) {
        scheduleDeactivation(span.spanId, event);
    } else {
        scheduleDeactivation(span.spanId, event, SAFETY_TIMEOUT_MS);
    }

    // Process next event after stagger delay
    if (eventQueue.length > 0) {
        eventQueueTimer = setTimeout(processNextEvent, EVENT_STAGGER_DELAY_MS);
    }
}

function enqueueEvent(event: TraceAnimationEvent, span: Span) {
    // Insert in sorted order by startTime
    const spanTime = span.startTime ? new Date(span.startTime).getTime() : Infinity;
    let insertIdx = eventQueue.length;
    for (let i = 0; i < eventQueue.length; i++) {
        const qTime = eventQueue[i].span.startTime
            ? new Date(eventQueue[i].span.startTime!).getTime()
            : Infinity;
        if (spanTime < qTime) {
            insertIdx = i;
            break;
        }
    }
    eventQueue.splice(insertIdx, 0, { event, span });

    // Start processing if queue was idle
    if (!eventQueueTimer) {
        const elapsed = Date.now() - lastEventActivationTime;
        if (elapsed >= EVENT_STAGGER_DELAY_MS || lastEventActivationTime === 0) {
            processNextEvent();
        } else {
            eventQueueTimer = setTimeout(processNextEvent, EVENT_STAGGER_DELAY_MS - elapsed);
        }
    }
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
 * Try to enqueue a tool span using resolved ancestor info.
 * Returns true if successfully resolved and enqueued, false if still pending.
 */
function tryResolveAndEnqueueToolSpan(span: Span, activeToolName?: string, activeToolKitName?: string): boolean {
    const info = resolveAncestorInfo(span.spanId);
    if (!info) {
        return false;
    }
    const entrypoint = getEntrypointForTrace(span.traceId);
    const event: TraceAnimationEvent = {
        type: 'execute_tool',
        toolNames: info.toolNames,
        activeToolName,
        activeToolKitName,
        spanId: span.spanId,
        active: true,
        systemInstructions: info.systemInstructions,
        entrypointServiceName: entrypoint?.serviceName,
        entrypointFunctionName: entrypoint?.functionName,
    };
    enqueueEvent(event, span);
    return true;
}

/**
 * Drain pending tool spans — called after parentMap or ancestorInfoMap is updated.
 */
function drainPendingToolSpans() {
    prunePendingToolSpans();
    for (let i = pendingToolSpans.length - 1; i >= 0; i--) {
        const { span, activeToolName, activeToolKitName } = pendingToolSpans[i];
        if (tryResolveAndEnqueueToolSpan(span, activeToolName, activeToolKitName)) {
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

function processSpans(spans: Span[]) {
    // Phase 1: Register ALL spans in parentMap and extract entrypoint info (regardless of type)
    for (const span of spans) {
        if (span.parentSpanId) {
            parentMap.set(span.spanId, span.parentSpanId);
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
            // If span now has endTime and is still active, update its deactivation timer
            if (span.endTime && activeSpans.has(span.spanId)) {
                const { event } = activeSpans.get(span.spanId)!;
                scheduleDeactivation(span.spanId, event);
            }
            continue;
        }
        processedSpanIds.add(span.spanId);

        const spanType = getSpanType(span.name);
        if (!spanType) {
            continue;
        }

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

            const entrypoint = getEntrypointForTrace(span.traceId);
            const event: TraceAnimationEvent = {
                type: spanType,
                toolNames,
                spanId: span.spanId,
                active: true,
                systemInstructions,
                entrypointServiceName: entrypoint?.serviceName,
                entrypointFunctionName: entrypoint?.functionName,
            };
            enqueueEvent(event, span);
        } else if (spanType === 'execute_tool') {
            const activeToolName = getSpanAttribute(span, 'gen_ai.tool.name');
            const activeToolKitName = getSpanAttribute(span, 'gen_ai.tool.toolkit.name');

            // Try to resolve via ancestor chain immediately
            if (!tryResolveAndEnqueueToolSpan(span, activeToolName, activeToolKitName)) {
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
    // Emit deactivation events for all currently active spans before cleanup
    for (const [, { timer, event }] of activeSpans.entries()) {
        clearTimeout(timer);
        sendAnimationEvent({ ...event, active: false });
    }
    activeSpans.clear();
    // Clear event queue
    if (eventQueueTimer) {
        clearTimeout(eventQueueTimer);
        eventQueueTimer = undefined;
    }
    eventQueue.length = 0;
    lastEventActivationTime = 0;
    lastChatSpanId = undefined;
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
