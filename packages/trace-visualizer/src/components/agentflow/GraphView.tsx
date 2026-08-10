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

import React, { useMemo, useRef, useState, useCallback, useImperativeHandle, forwardRef, useEffect } from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";
import { Codicon, Icon, ThemeColors } from "@wso2/ui-toolkit";
import { AgentFlowModel, AgentNode, InternalOp, NodeEdge, summarizeInternal, nodeMatchesQuery, visibleOps } from "./model";
import { formatDuration, getSpanIconName, getSpanColor, formatNumber } from "../../utils";

// --- Layout constants ---
const CARD_W = 264;
const CARD_BASE_H = 86;
const OP_ROW_H = 26;
const OPS_HEADER_H = 1;
const H_GAP = 44;
const V_GAP = 150;
const TOP_PAD = 32;
const REPLAY_CYAN = "var(--vscode-terminal-ansiCyan)";
// The initial view favours legible cards over showing every wide branch at once.
// Users can still use Fit to see the complete graph.
const READABLE_INITIAL_SCALE = 0.62;

export interface GraphViewHandle {
    zoomIn: () => void;
    zoomOut: () => void;
    fit: () => void;
    reset: () => void;
}

interface GraphViewProps {
    model: AgentFlowModel;
    selectedSpanId: string | null;
    onSelectSpan: (spanId: string) => void;
    /** ids of expanded nodes. */
    expandedRuns: Set<string>;
    onToggleExpand: (nodeId: string) => void;
    searchQuery: string;
    showInternalSpans: boolean;
    /** The delegation currently being replayed in chronological call order. */
    replayRunId: string | null;
}

interface PositionedNode {
    node: AgentNode;
    x: number;
    y: number;
    height: number;
}

// --- Cascade-in intro animations ---
const CASCADE_STEP = 120; // ms between depth levels
const nodeIn = keyframes`
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
`;
const fadeIn = keyframes`
    from { opacity: 0; }
    to { opacity: 1; }
`;
// Mirrors the active-agent treatment in AgentCallNodeWidget: a separate, soft
// breathing outline plus a travelling dash on the active connection. Keeping
// these overlays separate avoids fighting the layout and intro animations.
const replayGlow = keyframes`
    0% { box-shadow: 0 0 3px color-mix(in srgb, ${REPLAY_CYAN} 20%, transparent); }
    100% { box-shadow: 0 0 10px color-mix(in srgb, ${REPLAY_CYAN} 50%, transparent), 0 0 20px color-mix(in srgb, ${REPLAY_CYAN} 20%, transparent); }
`;
const replayFlowDash = keyframes`
    to { stroke-dashoffset: -18; }
`;

// --- Styled ---

const Viewport = styled.div`
    position: absolute;
    inset: 0;
    overflow: visible;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    background-image: radial-gradient(${ThemeColors.SURFACE_CONTAINER} 1px, transparent 1px);
    background-size: 20px 20px;
    cursor: grab;

    &.panning {
        cursor: grabbing;
    }
`;

const World = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
`;

const Card = styled.div<{ selected: boolean; error: boolean; dim: boolean; introDelay: number | null }>`
    position: absolute;
    width: ${CARD_W}px;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1.5px solid ${(p: { error: boolean; selected: boolean }) =>
        p.error ? ThemeColors.ERROR : p.selected ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    box-shadow: ${(p: { selected: boolean }) => (p.selected ? `0 0 0 1px ${ThemeColors.PRIMARY}` : "none")};
    opacity: ${(p: { dim: boolean }) => (p.dim ? 0.32 : 1)};
    transition: opacity 0.15s ease, box-shadow 0.1s ease, border-color 0.1s ease,
        top 0.2s ease, left 0.2s ease;
    overflow: hidden;
    cursor: pointer;

    animation-name: ${(p: { introDelay: number | null }) => (p.introDelay != null ? nodeIn : "none")};
    animation-duration: 0.34s;
    animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    animation-fill-mode: both;
    animation-delay: ${(p: { introDelay: number | null }) => p.introDelay ?? 0}ms;

    &:hover {
        border-color: ${(p: { error: boolean }) => (p.error ? ThemeColors.ERROR : ThemeColors.PRIMARY)};
        box-shadow: 0 0 4px 1px ${ThemeColors.PRIMARY};
    }
`;

const ReplayCardPulse = styled.div<{ active: boolean }>`
    position: absolute;
    inset: 0;
    border: 2px solid ${REPLAY_CYAN};
    border-radius: 10px;
    opacity: ${(p: { active: boolean }) => (p.active ? 1 : 0)};
    transition: opacity 0.24s ease-out;
    animation: ${(p: { active: boolean }) => (p.active ? `${replayGlow} 1.35s ease-in-out infinite alternate` : "none")};
    pointer-events: none;
    z-index: 3;
`;

const EdgePath = styled.path<{ introDelay: number | null }>`
    animation-name: ${(p: { introDelay: number | null }) => (p.introDelay != null ? fadeIn : "none")};
    animation-duration: 0.3s;
    animation-timing-function: ease;
    animation-fill-mode: both;
    animation-delay: ${(p: { introDelay: number | null }) => p.introDelay ?? 0}ms;
`;

const ReplayEdgePath = styled.path`
    pointer-events: none;
    animation: ${replayFlowDash} 0.9s linear infinite;
`;

const CardHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 2px;
    cursor: pointer;
`;

const IconBox = styled.span<{ color: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex-shrink: 0;
    border-radius: 8px;
    line-height: 0;
    color: ${(p: { color: string }) => p.color};
    background-color: color-mix(in srgb, ${(p: { color: string }) => p.color} 3%, transparent);
    border: 1px solid color-mix(in srgb, ${(p: { color: string }) => p.color} 38%, transparent);
`;

const AgentName = styled.span`
    font-size: 13px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
`;

const CountBadge = styled.span<{ color: string }>`
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 9px;
    font-size: 10.5px;
    font-weight: 700;
    color: ${(p: { color: string }) => p.color};
    background-color: color-mix(in srgb, ${(p: { color: string }) => p.color} 16%, transparent);
    border: 1px solid color-mix(in srgb, ${(p: { color: string }) => p.color} 40%, transparent);
`;

const MetaRow = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px 10px 50px;
    font-size: 11.5px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const MetaItem = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 4px;
`;

const ErrorText = styled.span`
    color: ${ThemeColors.ERROR};
    display: inline-flex;
    align-items: center;
    gap: 4px;
`;

const SummaryRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    cursor: pointer;

    &:hover {
        color: ${ThemeColors.ON_SURFACE};
    }
`;

const Chevron = styled.span<{ expanded: boolean }>`
    display: flex;
    align-items: center;
    transition: transform 0.2s ease;
    transform: rotate(${(p: { expanded: boolean }) => (p.expanded ? "180deg" : "0deg")});
`;

const OpsReveal = styled.div<{ expanded: boolean }>`
    display: grid;
    grid-template-rows: ${(p: { expanded: boolean }) => (p.expanded ? "1fr" : "0fr")};
    transition: grid-template-rows 0.2s ease;
`;

const OpsInner = styled.div`
    overflow: hidden;
    min-height: 0;
`;

const OpsList = styled.div`
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const OpRow = styled.div<{ selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    height: ${OP_ROW_H}px;
    padding: 0 12px;
    font-size: 11.5px;
    cursor: pointer;
    background-color: ${(p: { selected: boolean }) => (p.selected ? ThemeColors.SURFACE_CONTAINER : "transparent")};

    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const OpLabel = styled.span`
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: ${ThemeColors.ON_SURFACE};
`;

const OpTarget = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    flex-shrink: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const OpDuration = styled.span`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
`;

const EdgeLabel = styled.div<{ dim: boolean; highlight: boolean; replay: boolean; introDelay: number | null }>`
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10.5px;
    white-space: nowrap;
    max-width: 190px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border: 1px solid ${(p: { highlight: boolean; replay: boolean }) => p.replay ? REPLAY_CYAN : p.highlight ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT};
    color: ${(p: { highlight: boolean }) => (p.highlight ? ThemeColors.ON_SURFACE : ThemeColors.ON_SURFACE_VARIANT)};
    opacity: ${(p: { dim: boolean }) => (p.dim ? 0.25 : 1)};
    cursor: pointer;
    z-index: 2;
    transition: left 0.2s ease, top 0.2s ease, opacity 0.15s ease, border-color 0.1s ease;

    animation-name: ${(p: { introDelay: number | null }) => (p.introDelay != null ? fadeIn : "none")};
    animation-duration: 0.3s;
    animation-timing-function: ease;
    animation-fill-mode: both;
    animation-delay: ${(p: { introDelay: number | null }) => p.introDelay ?? 0}ms;
`;

const EdgeToolName = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
`;

const EmptyHint = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 13px;
`;

// --- Layout ---

// Number of content rows currently visible below the card header, given which
// nodes/calls are expanded. Multi-call nodes show one row per call, plus that
// call's internal ops when the call itself is expanded.
function visibleRowCount(node: AgentNode, showInternalSpans: boolean, expanded: Set<string>): number {
    if (!expanded.has(node.nodeId)) return 0;
    if (node.callCount > 1) {
        let rows = node.callCount;
        node.runs.forEach((r) => {
            if (expanded.has(r.runId)) rows += visibleOps(r, showInternalSpans).length;
        });
        return rows;
    }
    return visibleOps(node.runs[0], showInternalSpans).length;
}

function layoutNodes(model: AgentFlowModel, expanded: Set<string>, showInternalSpans: boolean): {
    positioned: Map<string, PositionedNode>;
    width: number;
    height: number;
} {
    const { nodesById } = model;
    const positioned = new Map<string, PositionedNode>();

    const cardHeight = (node: AgentNode): number => {
        const rows = visibleRowCount(node, showInternalSpans, expanded);
        if (rows > 0) {
            return CARD_BASE_H + OPS_HEADER_H + rows * OP_ROW_H;
        }
        return CARD_BASE_H;
    };

    const roots = model.nodes.filter((n) => !n.parentNodeId || !nodesById.has(n.parentNodeId));

    // Tidy-tree horizontal slots.
    let nextLeaf = 0;
    const slotOf = new Map<string, number>();
    const assignSlot = (nodeId: string, seen: Set<string>): number => {
        if (seen.has(nodeId)) return nextLeaf++;
        seen.add(nodeId);
        const node = nodesById.get(nodeId)!;
        const kids = node.childNodeIds.filter((c) => nodesById.has(c));
        if (kids.length === 0) {
            const slot = nextLeaf++;
            slotOf.set(nodeId, slot);
            return slot;
        }
        const kidSlots = kids.map((c) => assignSlot(c, seen));
        const slot = (Math.min(...kidSlots) + Math.max(...kidSlots)) / 2;
        slotOf.set(nodeId, slot);
        return slot;
    };
    roots.forEach((r) => assignSlot(r.nodeId, new Set()));

    const maxDepth = Math.max(0, ...model.nodes.map((n) => n.depth));
    const layerHeight: number[] = new Array(maxDepth + 1).fill(0);
    model.nodes.forEach((n) => {
        layerHeight[n.depth] = Math.max(layerHeight[n.depth], cardHeight(n));
    });
    const layerY: number[] = [];
    let acc = TOP_PAD;
    for (let d = 0; d <= maxDepth; d++) {
        layerY[d] = acc;
        acc += layerHeight[d] + V_GAP;
    }

    const colStep = CARD_W + H_GAP;
    let maxX = 0;
    model.nodes.forEach((node) => {
        const slot = slotOf.get(node.nodeId) ?? 0;
        const x = slot * colStep;
        positioned.set(node.nodeId, { node, x, y: layerY[node.depth], height: cardHeight(node) });
        maxX = Math.max(maxX, x + CARD_W);
    });

    const width = Math.max(maxX, CARD_W) + TOP_PAD;
    const height = acc - V_GAP + TOP_PAD;
    return { positioned, width, height };
}

// Orthogonal link with rounded elbows, top-to-bottom.
function orthPath(x1: number, y1: number, x2: number, y2: number): string {
    if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const midY = (y1 + y2) / 2;
    const r = 10;
    const dir = x2 > x1 ? 1 : -1;
    return [
        `M ${x1} ${y1}`,
        `L ${x1} ${midY - r}`,
        `Q ${x1} ${midY} ${x1 + dir * r} ${midY}`,
        `L ${x2 - dir * r} ${midY}`,
        `Q ${x2} ${midY} ${x2} ${midY + r}`,
        `L ${x2} ${y2}`,
    ].join(" ");
}

// --- Component ---

export const GraphView = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
    { model, selectedSpanId, onSelectSpan, expandedRuns, onToggleExpand, searchQuery, showInternalSpans, replayRunId },
    ref
) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [tx, setTx] = useState(24);
    const [ty, setTy] = useState(16);
    const [panning, setPanning] = useState(false);
    const [introing, setIntroing] = useState(false);
    const [cascading, setCascading] = useState(false);
    const [ready, setReady] = useState(false);
    const panState = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
    const didFitRef = useRef(false);
    // Mirror of the current transform so the native (non-passive) wheel handler
    // always reads live values without being re-bound every render.
    const viewRef = useRef({ scale, tx, ty });
    viewRef.current = { scale, tx, ty };

    const { positioned, width, height } = useMemo(
        () => layoutNodes(model, expandedRuns, showInternalSpans),
        [model, expandedRuns, showInternalSpans]
    );

    const edgeByTo = useMemo(() => {
        const m = new Map<string, NodeEdge>();
        model.nodeEdges.forEach((e) => m.set(e.toNodeId, e));
        return m;
    }, [model.nodeEdges]);

    // Map any span id (run or internal op) to the node it belongs to.
    const spanToNodeId = useMemo(() => {
        const m = new Map<string, string>();
        model.nodes.forEach((node) => {
            node.runs.forEach((run) => {
                m.set(run.span.spanId, node.nodeId);
                run.internalOps.forEach((op) => m.set(op.span.spanId, node.nodeId));
            });
        });
        return m;
    }, [model.nodes]);

    // Map a delegation's execute_tool span -> the CHILD node it delegates to, so
    // selecting a handoff highlights that specific edge (not the whole caller).
    const toolSpanToChildNode = useMemo(() => {
        const m = new Map<string, string>();
        model.handoffs.forEach((h) => {
            if (!h.toolSpan) return;
            const child = model.runsById.get(h.toRunId);
            if (child) m.set(h.toolSpan.spanId, child.nodeId);
        });
        return m;
    }, [model.handoffs, model.runsById]);

    const query = searchQuery.trim();
    // A selected handoff (edge) takes precedence over node selection.
    const selectedEdgeChildId = selectedSpanId ? toolSpanToChildNode.get(selectedSpanId) ?? null : null;
    const selectedNodeId = selectedEdgeChildId
        ? null
        : selectedSpanId ? spanToNodeId.get(selectedSpanId) ?? null : null;
    const replayNodeId = replayRunId ? model.runsById.get(replayRunId)?.nodeId ?? null : null;
    const replaySourceNodeId = replayNodeId ? model.nodesById.get(replayNodeId)?.parentNodeId ?? null : null;

    const isNodeActive = useCallback(
        (node: AgentNode): boolean => {
            if (query) return nodeMatchesQuery(node, edgeByTo.get(node.nodeId), query);
            if (replayNodeId) return node.nodeId === replayNodeId || node.nodeId === replaySourceNodeId;
            if (selectedEdgeChildId) {
                const child = model.nodesById.get(selectedEdgeChildId);
                return node.nodeId === selectedEdgeChildId || node.nodeId === child?.parentNodeId;
            }
            // Plain node selection does not dim anything — only the clicked node is
            // visually marked (via its selected border).
            return true;
        },
        [query, selectedEdgeChildId, replayNodeId, replaySourceNodeId, model, edgeByTo]
    );

    // Dimming applies for search and edge selection only, not plain node selection.
    const anyFocus = !!query || !!selectedEdgeChildId || !!replayNodeId;

    const computeFit = useCallback((minScale = 0.2): { scale: number; tx: number; ty: number } | null => {
        const vp = viewportRef.current;
        if (!vp || width === 0 || height === 0 || vp.clientWidth === 0 || vp.clientHeight === 0) return null;
        const pad = 48;
        const s = Math.min((vp.clientWidth - pad) / width, (vp.clientHeight - pad) / height, 1.15);
        const scale = Math.max(minScale, s);
        return {
            scale,
            tx: (vp.clientWidth - width * scale) / 2,
            ty: Math.max(16, (vp.clientHeight - height * scale) / 2),
        };
    }, [width, height]);

    const applyView = useCallback((v: { scale: number; tx: number; ty: number }) => {
        viewRef.current = v;
        setScale(v.scale);
        setTx(v.tx);
        setTy(v.ty);
        setReady(true);
    }, []);

    const doFit = useCallback(() => {
        const f = computeFit();
        if (f) {
            setIntroing(false);
            setCascading(false);
            applyView(f);
        }
    }, [computeFit, applyView]);

    // Cinematic first open: start zoomed in on the root, then ease out to the fitted
    // view so the crew "unfolds" beneath the top-level agent.
    const runIntro = useCallback(() => {
        const vp = viewportRef.current;
        const target = computeFit(READABLE_INITIAL_SCALE);
        if (!vp || !target) return;
        const root = model.nodes.find((n) => !n.parentNodeId) ?? model.nodes[0];
        const rp = root && positioned.get(root.nodeId);
        if (!rp) {
            doFit();
            return;
        }
        const startScale = Math.min(2, Math.max(target.scale * 2.2, 1.4));
        const rcx = rp.x + CARD_W / 2;
        const rcy = rp.y + rp.height / 2;
        const start = {
            scale: startScale,
            tx: vp.clientWidth / 2 - rcx * startScale,
            ty: vp.clientHeight * 0.42 - rcy * startScale,
        };
        const maxDepth = Math.max(0, ...model.nodes.map((n) => n.depth));
        setIntroing(false);
        setCascading(true);
        applyView(start);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                setIntroing(true);
                applyView(target);
            })
        );
        window.setTimeout(() => setIntroing(false), 720);
        window.setTimeout(() => setCascading(false), maxDepth * CASCADE_STEP + 500);
    }, [computeFit, applyView, doFit, model.nodes, positioned]);

    useImperativeHandle(ref, () => ({
        zoomIn: () => { setIntroing(false); setCascading(false); setScale((s) => Math.min(2.5, s + 0.15)); },
        zoomOut: () => { setIntroing(false); setCascading(false); setScale((s) => Math.max(0.2, s - 0.15)); },
        fit: doFit,
        reset: () => {
            setIntroing(false);
            setCascading(false);
            applyView({ scale: 1, tx: 24, ty: 16 });
        },
    }), [doFit, applyView]);

    useEffect(() => {
        if (didFitRef.current) return;
        const vp = viewportRef.current;
        if (width > 0 && height > 0 && vp && vp.clientWidth > 0 && vp.clientHeight > 0) {
            runIntro();
            didFitRef.current = true;
            return;
        }
        const t = setTimeout(() => {
            const v = viewportRef.current;
            if (!didFitRef.current && v && v.clientWidth > 0 && v.clientHeight > 0) {
                runIntro();
                didFitRef.current = true;
            }
        }, 60);
        return () => clearTimeout(t);
    }, [width, height, runIntro]);

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.target !== viewportRef.current && !(e.target as HTMLElement).dataset?.canvas) return;
        setIntroing(false);
        setCascading(false);
        setPanning(true);
        panState.current = { startX: e.clientX, startY: e.clientY, ox: tx, oy: ty };
    };

    useEffect(() => {
        if (!panning) return;
        const move = (e: MouseEvent) => {
            if (!panState.current) return;
            setTx(panState.current.ox + (e.clientX - panState.current.startX));
            setTy(panState.current.oy + (e.clientY - panState.current.startY));
        };
        const up = () => setPanning(false);
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
        return () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
        };
    }, [panning]);

    // Trackpad/wheel navigation matching the BI flow diagram: plain two-finger
    // scroll pans (dominant axis), pinch / ctrl+cmd wheel zooms cursor-anchored.
    // Uses a native non-passive listener so preventDefault stops the webview from
    // scrolling the page.
    useEffect(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const onWheelNative = (e: WheelEvent) => {
            e.preventDefault();
            setIntroing(false);
            setCascading(false);
            const { scale: s, tx: cx, ty: cy } = viewRef.current;
            if (e.ctrlKey || e.metaKey) {
                const rect = vp.getBoundingClientRect();
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;
                const next = Math.max(0.2, Math.min(2.5, s + -e.deltaY / 300));
                if (next === s) return;
                const worldX = (px - cx) / s;
                const worldY = (py - cy) / s;
                const ntx = px - worldX * next;
                const nty = py - worldY * next;
                viewRef.current = { scale: next, tx: ntx, ty: nty };
                setScale(next);
                setTx(ntx);
                setTy(nty);
            } else {
                const ax = Math.abs(e.deltaX);
                const ay = Math.abs(e.deltaY);
                if (ay < ax && ax > 8) {
                    const ntx = cx - e.deltaX;
                    viewRef.current = { ...viewRef.current, tx: ntx };
                    setTx(ntx);
                } else {
                    const nty = cy - e.deltaY;
                    viewRef.current = { ...viewRef.current, ty: nty };
                    setTy(nty);
                }
            }
        };
        vp.addEventListener("wheel", onWheelNative, { passive: false });
        return () => vp.removeEventListener("wheel", onWheelNative);
    }, []);

    const renderOpRow = (op: InternalOp, indent: boolean) => (
        <OpRow
            key={op.span.spanId}
            selected={selectedSpanId === op.span.spanId}
            style={indent ? { paddingLeft: "34px" } : undefined}
            onClick={(ev) => { ev.stopPropagation(); onSelectSpan(op.span.spanId); }}
        >
            {op.isDelegation ? (
                <span style={{ display: "flex", color: ThemeColors.ON_SURFACE_VARIANT }}>
                    <Icon
                        name="bi-ai-agent"
                        sx={{ fontSize: "12px", width: "12px", height: "12px" }}
                        iconSx={{ fontSize: "12px" }}
                    />
                </span>
            ) : (
                <span style={{ display: "flex", color: op.hasError ? ThemeColors.ERROR : getSpanColor(op.kind) }}>
                    <Icon
                        name={op.hasError ? "bi-error" : getSpanIconName(op.kind)}
                        sx={{ fontSize: "12px", width: "12px", height: "12px" }}
                        iconSx={{ fontSize: "12px" }}
                    />
                </span>
            )}
            <OpLabel title={op.label}>{op.label}</OpLabel>
            {op.isDelegation && op.targetAgentName && (
                <OpTarget title={op.targetAgentName}>→ {op.targetAgentName}</OpTarget>
            )}
            {op.durationMs != null && <OpDuration>{formatDuration(op.durationMs)}</OpDuration>}
        </OpRow>
    );

    return (
        <Viewport
            ref={viewportRef}
            className={panning ? "panning" : ""}
            onMouseDown={onMouseDown}
            data-canvas="true"
        >
            {model.nodes.length === 0 && <EmptyHint>No agent runs in this trace.</EmptyHint>}
            <World
                style={{
                    transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                    width,
                    height,
                    opacity: ready ? 1 : 0,
                    transition: introing
                        ? "transform 0.6s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.25s ease"
                        : "opacity 0.2s ease",
                }}
                data-canvas="true"
            >
                <svg
                    width={width}
                    height={height}
                    style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", overflow: "visible" }}
                >
                    <defs>
                        <marker id="af-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                            <polygon points="0,0 6,3 0,6" fill={ThemeColors.ON_SURFACE_VARIANT} />
                        </marker>
                        <marker id="af-arrow-hl" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                            <polygon points="0,0 6,3 0,6" fill={ThemeColors.PRIMARY} />
                        </marker>
                        <marker id="af-arrow-replay" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
                            <polygon points="0,0 6,3 0,6" fill={REPLAY_CYAN} />
                        </marker>
                    </defs>

                    {model.nodeEdges.map((e) => {
                        if (!e.fromNodeId) return null;
                        const from = positioned.get(e.fromNodeId);
                        const to = positioned.get(e.toNodeId);
                        if (!from || !to) return null;
                        const isSelectedEdge = selectedEdgeChildId === e.toNodeId;
                        const isReplayedEdge = replayNodeId === e.toNodeId;
                        const active =
                            !anyFocus ||
                            isSelectedEdge ||
                            (isNodeActive(from.node) && isNodeActive(to.node)) ||
                            selectedNodeId === e.fromNodeId ||
                            selectedNodeId === e.toNodeId;
                        // Strong highlight only for an explicitly selected handoff.
                        const highlight = isSelectedEdge || isReplayedEdge;
                        return (
                            <React.Fragment key={e.id}>
                                <EdgePath
                                    introDelay={cascading ? to.node.depth * CASCADE_STEP + 60 : null}
                                    d={orthPath(from.x + CARD_W / 2, from.y + from.height, to.x + CARD_W / 2, to.y)}
                                    fill="none"
                                stroke={isReplayedEdge ? REPLAY_CYAN : highlight ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE_VARIANT}
                                strokeWidth={highlight ? 2 : 1.5}
                                markerEnd={isReplayedEdge ? "url(#af-arrow-replay)" : highlight ? "url(#af-arrow-hl)" : "url(#af-arrow)"}
                                    opacity={active ? 1 : 0.18}
                                    style={{ transition: "d 0.2s ease, opacity 0.15s ease" }}
                                />
                                {isReplayedEdge && (
                                    <ReplayEdgePath
                                        d={orthPath(from.x + CARD_W / 2, from.y + from.height, to.x + CARD_W / 2, to.y)}
                                        fill="none"
                                        stroke={REPLAY_CYAN}
                                        strokeWidth={2.5}
                                        strokeDasharray="6 6"
                                        markerEnd="url(#af-arrow-replay)"
                                    />
                                )}
                            </React.Fragment>
                        );
                    })}
                </svg>

                {/* Tool label on the child's vertical drop. Call order is kept in the toolbar strip. */}
                {model.nodeEdges.map((e) => {
                    if (!e.fromNodeId) return null;
                    const from = positioned.get(e.fromNodeId);
                    const to = positioned.get(e.toNodeId);
                    if (!from || !to) return null;
                    const mx = to.x + CARD_W / 2;
                    const midY = (from.y + from.height + to.y) / 2;
                    const my = (midY + to.y) / 2;
                    const isSelectedEdge = selectedEdgeChildId === e.toNodeId;
                    const isReplayedEdge = replayNodeId === e.toNodeId;
                    const active =
                        !anyFocus || isSelectedEdge || (isNodeActive(from.node) && isNodeActive(to.node)) ||
                        selectedNodeId === e.fromNodeId || selectedNodeId === e.toNodeId;
                    return (
                        <EdgeLabel
                            key={`lbl-${e.id}`}
                            style={{ left: mx, top: my }}
                            dim={!active}
                            highlight={isSelectedEdge || isReplayedEdge}
                            replay={isReplayedEdge}
                            introDelay={cascading ? to.node.depth * CASCADE_STEP + 60 : null}
                            title={`${e.toolLabel}${e.callCount > 1 ? ` (×${e.callCount})` : ""}`}
                            onClick={(ev) => {
                                ev.stopPropagation();
                                onSelectSpan(e.toolSpan ? e.toolSpan.spanId : e.targetSpan.spanId);
                            }}
                        >
                            <EdgeToolName>{e.toolLabel}</EdgeToolName>
                        </EdgeLabel>
                    );
                })}

                {/* Agent nodes */}
                {model.nodes.map((node) => {
                    const p = positioned.get(node.nodeId);
                    if (!p) return null;
                    const expanded = expandedRuns.has(node.nodeId);
                    const multi = node.callCount > 1;
                    const rep = node.runs[0];
                    const summary = multi ? `${node.callCount} calls` : summarizeInternal(rep);
                    const ops = multi ? [] : visibleOps(rep, showInternalSpans);
                    const hasExpandable = multi ? node.callCount > 0 : ops.length > 0;
                    const dim = anyFocus && !isNodeActive(node);
                    const selected = selectedNodeId === node.nodeId || selectedEdgeChildId === node.nodeId;
                    return (
                        <Card
                            key={node.nodeId}
                            selected={selected}
                            error={node.hasError}
                            dim={dim}
                            introDelay={cascading ? node.depth * CASCADE_STEP : null}
                            style={{ left: p.x, top: p.y }}
                            onClick={() => onSelectSpan(rep.span.spanId)}
                        >
                            <ReplayCardPulse active={replayNodeId === node.nodeId} />
                            <CardHeader>
                                <IconBox color={node.color}>
                                    <Icon
                                        name="bi-ai-agent"
                                        sx={{ fontSize: "16px", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}
                                        iconSx={{ fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                    />
                                </IconBox>
                                <AgentName title={node.agentName}>{node.agentName}</AgentName>
                                {multi && <CountBadge color={node.color}>×{node.callCount}</CountBadge>}
                            </CardHeader>
                            <MetaRow>
                                <MetaItem>
                                    <Icon name="bi-clock" sx={{ fontSize: "11px", width: "11px", height: "11px" }} iconSx={{ fontSize: "11px" }} />
                                    {node.totalDurationMs != null
                                        ? `${formatDuration(node.totalDurationMs)}${multi ? " total" : ""}`
                                        : node.status === "running" ? "running" : "time unavailable"}
                                </MetaItem>
                                {node.totalTokens > 0 && <MetaItem>{formatNumber(node.totalTokens)} tokens</MetaItem>}
                                {node.hasError && (
                                    <ErrorText>
                                        <Icon name="bi-error" sx={{ fontSize: "11px", width: "11px", height: "11px" }} iconSx={{ fontSize: "11px" }} />
                                        error
                                    </ErrorText>
                                )}
                            </MetaRow>
                            {hasExpandable && (
                                <>
                                    <SummaryRow onClick={(ev) => { ev.stopPropagation(); onToggleExpand(node.nodeId); }}>
                                        <span>{summary || `${node.callCount} calls`}</span>
                                        <Chevron expanded={expanded}>
                                            <Codicon name="chevron-down" sx={{ fontSize: "12px" }} />
                                        </Chevron>
                                    </SummaryRow>
                                    <OpsReveal expanded={expanded}>
                                        <OpsInner>
                                            <OpsList>
                                                {multi
                                                    ? node.runs.map((run, i) => {
                                                        const callExpanded = expandedRuns.has(run.runId);
                                                        const callOps = visibleOps(run, showInternalSpans);
                                                        return (
                                                            <React.Fragment key={run.runId}>
                                                                <OpRow
                                                                    selected={selectedSpanId === run.span.spanId}
                                                                    onClick={(ev) => { ev.stopPropagation(); onSelectSpan(run.span.spanId); }}
                                                                >
                                                                    <OpLabel>Call {i + 1}</OpLabel>
                                                                    <OpTarget>{summarizeInternal(run)}</OpTarget>
                                                                    {run.durationMs != null && <OpDuration>{formatDuration(run.durationMs)}</OpDuration>}
                                                                    {callOps.length > 0 && (
                                                                        <Chevron
                                                                            expanded={callExpanded}
                                                                            style={{ cursor: "pointer" }}
                                                                            onClick={(ev) => { ev.stopPropagation(); onToggleExpand(run.runId); }}
                                                                        >
                                                                            <Codicon name="chevron-down" sx={{ fontSize: "11px" }} />
                                                                        </Chevron>
                                                                    )}
                                                                </OpRow>
                                                                <OpsReveal expanded={callExpanded}>
                                                                    <OpsInner>
                                                                        {callOps.map((op) => renderOpRow(op, true))}
                                                                    </OpsInner>
                                                                </OpsReveal>
                                                            </React.Fragment>
                                                        );
                                                    })
                                                    : ops.map((op) => renderOpRow(op, false))}
                                            </OpsList>
                                        </OpsInner>
                                    </OpsReveal>
                                </>
                            )}
                        </Card>
                    );
                })}
            </World>
        </Viewport>
    );
});
