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

/**
 * Derived, UI-only model for the multi-agent Agents view.
 *
 * This builds an agent-run / handoff graph from raw `TraceData.spans`.
 * Parentage is taken from `parentSpanId` ancestry only (never timestamps),
 * so this stays a reliable semantic source for both Graph and Sequence views.
 *
 * The name/ancestry inference lives entirely here so future explicit agent
 * telemetry (ballerina.agent.*) can replace it without touching the views.
 */

import { SpanData, TraceData } from "../../index";
import {
    getAttributeValue,
    getSpanTypeBadge,
    getSpanTimeRange,
    getSpanTokens,
    isAISpan,
    spanHasError,
    stripSpanPrefix,
} from "../../utils";

const ROOT_PARENT = "0000000000000000";

export type OpKind = ReturnType<typeof getSpanTypeBadge>;

export type RunStatus = "success" | "error" | "running";

/** A non-agent span (model/tool/retrieval/...) owned by an agent run. */
export interface InternalOp {
    span: SpanData;
    kind: OpKind;
    label: string;
    durationMs: number | null;
    startMs: number | null;
    hasError: boolean;
    /** true for AI-instrumented spans; false for raw internal spans (http, etc.). */
    isAI: boolean;
    /** true when this tool span is actually an agent delegation (wraps invoke_agent). */
    isDelegation: boolean;
    /** for delegation ops: the invoked agent's display name. */
    targetAgentName: string | null;
    /** for delegation ops: the global call sequence number of the invocation. */
    seq: number | null;
}

/** One `invoke_agent` span. Each invocation is a distinct run. */
export interface AgentRun {
    runId: string;
    span: SpanData;
    agentName: string;
    /** Delegation depth: root runs are 0. */
    depth: number;
    startMs: number | null;
    endMs: number | null;
    durationMs: number | null;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    status: RunStatus;
    hasError: boolean;
    /** Caller run id, or null for a root / unknown-origin run. */
    parentRunId: string | null;
    childRunIds: string[];
    internalOps: InternalOp[];
    /** color assigned to the agent identity (same name -> same color). */
    color: string;
    /** global chronological order of this invocation among all delegations (1-based); null for roots. */
    seq: number | null;
    /** id of the AgentNode this run is grouped under. */
    nodeId: string;
}

/**
 * A graph node: all invocations of one agent identity under one caller.
 * The same agent invoked N times by the same parent is a single node with
 * N runs (rendered with a ×N badge and an expandable per-call list).
 */
export interface AgentNode {
    nodeId: string;
    agentName: string;
    color: string;
    depth: number;
    parentNodeId: string | null;
    childNodeIds: string[];
    /** invocations of this agent under this parent, sorted by start time. */
    runs: AgentRun[];
    callCount: number;
    /** summed duration across all runs (time spent in this agent); null if unknown. */
    totalDurationMs: number | null;
    totalTokens: number;
    hasError: boolean;
    status: RunStatus;
}

/** A graph edge: one caller node delegating to one child node (possibly N calls). */
export interface NodeEdge {
    id: string;
    fromNodeId: string | null;
    toNodeId: string;
    /** tool label (from the representative run's execute_tool), or "Delegate". */
    toolLabel: string;
    callCount: number;
    /** global sequence numbers of the calls this edge represents, ascending. */
    seqNumbers: number[];
    /** representative execute_tool span for inspector selection. */
    toolSpan: SpanData | null;
    /** representative target invoke_agent span. */
    targetSpan: SpanData;
}

/** Connects a caller run to an invoked child run. */
export interface Handoff {
    id: string;
    fromRunId: string | null;
    toRunId: string;
    /** The intervening execute_tool span, if any. */
    toolSpan: SpanData | null;
    /** Target invoke_agent span (inspector fallback when no tool span). */
    targetSpan: SpanData;
    label: string;
}

export interface AgentFlowModel {
    runs: AgentRun[];
    runsById: Map<string, AgentRun>;
    handoffs: Handoff[];
    /** graph nodes (agent identity grouped per caller). */
    nodes: AgentNode[];
    nodesById: Map<string, AgentNode>;
    /** graph edges (one per non-root node). */
    nodeEdges: NodeEdge[];
    /** agent name -> stable display color. */
    agentColors: Map<string, string>;
    /** ordered unique agent identities (first-seen order). */
    agentNames: string[];
    /** true when the trace has >= 2 agent invocations. */
    isMultiAgent: boolean;
}

// The top-level agent always uses the standard agent cyan (matching invoke_agent
// spans elsewhere in the trace UI). Kept as a theme variable for consistency.
const ROOT_AGENT_COLOR = "var(--vscode-terminal-ansiCyan)";

// Vivid, high-chroma palette for sub-agent identities. Fixed hues (not theme
// variables) so colours stay saturated on both light and dark backgrounds, and
// ordered so consecutive entries are from different hue families. Blue/cyan/teal
// are excluded (reserved for the root cyan), and pure red is avoided so a colour
// never reads as an error state — a pinkish rose is used instead.
const SUB_AGENT_PALETTE = [
    "#10B981", // emerald
    "#F59E0B", // amber
    "#A855F7", // violet
    "#84CC16", // lime
    "#EC4899", // pink
    "#F97316", // orange
    "#F43F5E", // rose (pinkish red)
    "#D946EF", // fuchsia
];

const isInvoke = (span: SpanData): boolean => getSpanTypeBadge(span) === "invoke";

const getAgentName = (span: SpanData): string => {
    const explicit = getAttributeValue(span.attributes, "gen_ai.agent.name");
    if (explicit) return explicit;
    const stripped = stripSpanPrefix(span.name).trim();
    return stripped || "Agent";
};

const getToolLabel = (span: SpanData): string => {
    const toolName = getAttributeValue(span.attributes, "gen_ai.tool.name");
    return (toolName || stripSpanPrefix(span.name)).trim() || "Delegate";
};

export function buildAgentFlowModel(trace: TraceData): AgentFlowModel {
    const spans = trace?.spans ?? [];
    const spanMap = new Map<string, SpanData>();
    spans.forEach((s) => spanMap.set(s.spanId, s));

    const isRootId = (id?: string): boolean =>
        !id || id === ROOT_PARENT || id === "" || !spanMap.has(id);

    // Walk parentSpanId chain, cycle-safe, returning ancestors nearest-first.
    const ancestorsOf = (span: SpanData): SpanData[] => {
        const out: SpanData[] = [];
        const seen = new Set<string>([span.spanId]);
        let pid = span.parentSpanId;
        while (!isRootId(pid) && !seen.has(pid)) {
            const parent = spanMap.get(pid)!;
            out.push(parent);
            seen.add(pid);
            pid = parent.parentSpanId;
        }
        return out;
    };

    const invokeSpans = spans.filter(isInvoke);

    // Unique agent identities in first-seen order. Colours are assigned later,
    // once run depth (root vs sub-agent) is known.
    const agentNames: string[] = [];
    const seenNames = new Set<string>();
    invokeSpans.forEach((span) => {
        const name = getAgentName(span);
        if (!seenNames.has(name)) {
            seenNames.add(name);
            agentNames.push(name);
        }
    });
    const agentColors = new Map<string, string>();

    const runsById = new Map<string, AgentRun>();

    invokeSpans.forEach((span) => {
        const range = getSpanTimeRange(span);
        const name = getAgentName(span);
        const inputTokens = parseInt(
            getAttributeValue(span.attributes, "gen_ai.usage.input_tokens") || "0",
            10
        );
        const outputTokens = parseInt(
            getAttributeValue(span.attributes, "gen_ai.usage.output_tokens") || "0",
            10
        );
        const hasError = spanHasError(span) || span.status?.code === 2;
        const status: RunStatus = hasError
            ? "error"
            : !span.endTime
                ? "running"
                : "success";

        runsById.set(span.spanId, {
            runId: span.spanId,
            span,
            agentName: name,
            depth: 0,
            startMs: range?.start ?? null,
            endMs: range?.end ?? null,
            durationMs: range ? range.end - range.start : null,
            inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
            outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
            totalTokens: 0,
            status,
            hasError,
            parentRunId: null,
            childRunIds: [],
            internalOps: [],
            color: ROOT_AGENT_COLOR,
            seq: null,
            nodeId: "",
        });
    });

    const handoffs: Handoff[] = [];

    // Wire delegation edges from parentSpanId ancestry.
    invokeSpans.forEach((span) => {
        const run = runsById.get(span.spanId)!;
        let parentInvoke: SpanData | null = null;
        let toolSpan: SpanData | null = null;
        for (const anc of ancestorsOf(span)) {
            if (isInvoke(anc)) {
                parentInvoke = anc;
                break;
            }
            if (!toolSpan && getSpanTypeBadge(anc) === "tool") {
                toolSpan = anc;
            }
        }

        run.parentRunId = parentInvoke ? parentInvoke.spanId : null;
        if (parentInvoke) {
            runsById.get(parentInvoke.spanId)!.childRunIds.push(span.spanId);
        }

        handoffs.push({
            id: `handoff-${span.spanId}`,
            fromRunId: run.parentRunId,
            toRunId: run.runId,
            toolSpan,
            targetSpan: span,
            label: toolSpan ? getToolLabel(toolSpan) : "Delegate",
        });
    });

    // Global chronological order of all delegations (non-root runs), so callers
    // can read the sequence across different subagents. 1-based.
    Array.from(runsById.values())
        .filter((r) => r.parentRunId && runsById.has(r.parentRunId))
        .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
        .forEach((r, i) => {
            r.seq = i + 1;
        });

    // Map each handoff tool span -> the delegation it represents, so the caller's
    // internal op list can mark it as a delegation (not an ordinary tool).
    const delegationBySpanId = new Map<string, { targetAgentName: string; seq: number | null }>();
    handoffs.forEach((h) => {
        if (!h.toolSpan) return;
        const childRun = runsById.get(h.toRunId);
        delegationBySpanId.set(h.toolSpan.spanId, {
            targetAgentName: childRun?.agentName ?? stripSpanPrefix(h.targetSpan.name),
            seq: childRun?.seq ?? null,
        });
    });

    // Assign each non-agent span to its closest ancestor agent run.
    spans.forEach((span) => {
        if (isInvoke(span)) return;
        const owner = ancestorsOf(span).find(isInvoke);
        if (!owner) return;
        const range = getSpanTimeRange(span);
        const deleg = delegationBySpanId.get(span.spanId);
        runsById.get(owner.spanId)!.internalOps.push({
            span,
            kind: getSpanTypeBadge(span),
            label: stripSpanPrefix(span.name),
            durationMs: range ? range.end - range.start : null,
            startMs: range?.start ?? null,
            hasError: spanHasError(span) || span.status?.code === 2,
            isAI: isAISpan(span),
            isDelegation: !!deleg,
            targetAgentName: deleg?.targetAgentName ?? null,
            seq: deleg?.seq ?? null,
        });
    });

    // Sort internal ops by start time; compute token totals.
    runsById.forEach((run) => {
        run.internalOps.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
        run.childRunIds.sort((a, b) => {
            const ra = runsById.get(a)?.startMs ?? 0;
            const rb = runsById.get(b)?.startMs ?? 0;
            return ra - rb;
        });
        const invokeTokens = getSpanTokens(run.span);
        run.totalTokens = invokeTokens > 0
            ? invokeTokens
            : run.internalOps.reduce((sum, op) => sum + getSpanTokens(op.span), 0);
    });

    // Compute delegation depth, cycle-safe.
    const depthOf = (runId: string, seen: Set<string>): number => {
        const run = runsById.get(runId);
        if (!run || !run.parentRunId || seen.has(runId)) return 0;
        seen.add(runId);
        return 1 + depthOf(run.parentRunId, seen);
    };
    runsById.forEach((run) => {
        run.depth = depthOf(run.runId, new Set());
    });

    // Assign colours: any identity that appears as a root run is the top-level
    // agent (cyan); the rest step through the sub-agent palette in first-seen
    // order so distinct agents always get visually distinct hues.
    const rootNames = new Set<string>();
    runsById.forEach((run) => {
        if (!run.parentRunId || !runsById.has(run.parentRunId)) rootNames.add(run.agentName);
    });
    let subIndex = 0;
    agentNames.forEach((name) => {
        if (rootNames.has(name)) {
            agentColors.set(name, ROOT_AGENT_COLOR);
        } else {
            agentColors.set(name, SUB_AGENT_PALETTE[subIndex % SUB_AGENT_PALETTE.length]);
            subIndex++;
        }
    });
    runsById.forEach((run) => {
        run.color = agentColors.get(run.agentName) || ROOT_AGENT_COLOR;
    });

    const runs = Array.from(runsById.values()).sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return (a.startMs ?? 0) - (b.startMs ?? 0);
    });

    // Group runs into nodes: (caller node, agent name) => one node. Assign node
    // ids parents-first so a child's node id can reference its caller's node.
    const runsByDepth = [...runsById.values()].sort((a, b) => a.depth - b.depth);
    const parentNodeIdOf = (run: AgentRun): string | null => {
        if (!run.parentRunId || !runsById.has(run.parentRunId)) return null;
        return runsById.get(run.parentRunId)!.nodeId;
    };
    runsByDepth.forEach((run) => {
        const parentKey = parentNodeIdOf(run) ?? "ROOT";
        run.nodeId = `${parentKey}::${run.agentName}`;
    });

    const nodesById = new Map<string, AgentNode>();
    runsByDepth.forEach((run) => {
        let node = nodesById.get(run.nodeId);
        if (!node) {
            node = {
                nodeId: run.nodeId,
                agentName: run.agentName,
                color: run.color,
                depth: run.depth,
                parentNodeId: parentNodeIdOf(run),
                childNodeIds: [],
                runs: [],
                callCount: 0,
                totalDurationMs: null,
                totalTokens: 0,
                hasError: false,
                status: "success",
            };
            nodesById.set(run.nodeId, node);
        }
        node.runs.push(run);
    });

    nodesById.forEach((node) => {
        node.runs.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
        node.callCount = node.runs.length;
        let dur = 0;
        let durSeen = false;
        let running = false;
        node.runs.forEach((r) => {
            if (r.durationMs != null) {
                dur += r.durationMs;
                durSeen = true;
            }
            node.totalTokens += r.totalTokens;
            if (r.hasError) node.hasError = true;
            if (r.status === "running") running = true;
        });
        node.totalDurationMs = durSeen ? dur : null;
        node.status = node.hasError ? "error" : running ? "running" : "success";
        if (node.parentNodeId) nodesById.get(node.parentNodeId)?.childNodeIds.push(node.nodeId);
    });

    // Order children by first invocation time for a stable layout.
    nodesById.forEach((node) => {
        node.childNodeIds.sort((a, b) => {
            const sa = nodesById.get(a)?.runs[0]?.startMs ?? 0;
            const sb = nodesById.get(b)?.runs[0]?.startMs ?? 0;
            return sa - sb;
        });
    });

    const handoffByRun = new Map<string, Handoff>();
    handoffs.forEach((h) => handoffByRun.set(h.toRunId, h));

    const nodeEdges: NodeEdge[] = [];
    nodesById.forEach((node) => {
        if (!node.parentNodeId) return;
        const rep = node.runs[0];
        const repHandoff = handoffByRun.get(rep.runId);
        nodeEdges.push({
            id: `edge-${node.nodeId}`,
            fromNodeId: node.parentNodeId,
            toNodeId: node.nodeId,
            toolLabel: repHandoff?.label ?? "Delegate",
            callCount: node.callCount,
            seqNumbers: node.runs
                .map((r) => r.seq)
                .filter((s): s is number => s != null)
                .sort((a, b) => a - b),
            toolSpan: repHandoff?.toolSpan ?? null,
            targetSpan: rep.span,
        });
    });

    const nodes = Array.from(nodesById.values()).sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return (a.runs[0]?.startMs ?? 0) - (b.runs[0]?.startMs ?? 0);
    });

    return {
        runs,
        runsById,
        handoffs,
        nodes,
        nodesById,
        nodeEdges,
        agentColors,
        agentNames,
        isMultiAgent: invokeSpans.length >= 2,
    };
}

/** Internal ops to display: AI spans only, unless raw internal spans are shown. */
export const visibleOps = (run: AgentRun, showInternal: boolean): InternalOp[] =>
    showInternal ? run.internalOps : run.internalOps.filter((op) => op.isAI);

/**
 * Compact summary of a run's internal work. Delegations (agent-invoking tool
 * calls) are counted separately from ordinary tools so they aren't conflated.
 */
export function summarizeInternal(run: AgentRun): string {
    let model = 0;
    let tools = 0;
    let retrieval = 0;
    let delegations = 0;
    for (const op of run.internalOps) {
        if (op.isDelegation) delegations++;
        else if (op.kind === "tool") tools++;
        else if (op.kind === "kb_retrieve" || op.kind === "kb_ingest") retrieval++;
        else if (op.kind === "chat" || op.kind === "generate_content" || op.kind === "embeddings") model++;
    }
    const parts: string[] = [];
    if (model) parts.push(`${model} model call${model > 1 ? "s" : ""}`);
    if (delegations) parts.push(`${delegations} agent call${delegations > 1 ? "s" : ""}`);
    if (tools) parts.push(`${tools} tool${tools > 1 ? "s" : ""}`);
    if (retrieval) parts.push(`${retrieval} retrieval${retrieval > 1 ? "s" : ""}`);
    return parts.join(" · ");
}

/** True when a run, its handoff tool, or an internal op matches the query. */
export function runMatchesQuery(run: AgentRun, handoff: Handoff | undefined, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    if (run.agentName.toLowerCase().includes(q)) return true;
    if (handoff?.label.toLowerCase().includes(q)) return true;
    return run.internalOps.some((op) => op.label.toLowerCase().includes(q));
}

/** True when any of a node's runs (or its incoming edge tool label) match the query. */
export function nodeMatchesQuery(node: AgentNode, edge: NodeEdge | undefined, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    if (node.agentName.toLowerCase().includes(q)) return true;
    if (edge?.toolLabel.toLowerCase().includes(q)) return true;
    return node.runs.some((r) => r.internalOps.some((op) => op.label.toLowerCase().includes(q)));
}
