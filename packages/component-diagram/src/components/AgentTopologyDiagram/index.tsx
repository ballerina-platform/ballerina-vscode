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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { CanvasWidget, DiagramModel } from "@projectstorm/react-diagrams";
import { ThemeColors } from "@wso2/ui-toolkit";
import { Controls } from "../Controls";
import { DiagramCanvas } from "../DiagramCanvas";
import { OverlayLayerModel } from "../OverlayLayer";
import { TopologyLinkModel } from "../NodeLink";
import { AgentCardNodeModel } from "../nodes/AgentCardNode";
import { ServiceNodeModel } from "../nodes/ServiceNode";
import { getNodeChartColor } from "@wso2/bi-diagram";
import { generateTopologyEngine } from "./engine";
import { buildTopology } from "./topologyModel";
import { defaultVisibleRows, layoutTopology } from "./topologyLayout";
import { describeTopology } from "./topologyDescribe";
import { focusAround, isolateGraph } from "./topologyFocus";
import { TopologyContextProvider } from "./TopologyContext";
import { Legend } from "./Legend";
import { FindPanel } from "./FindPanel";
import { PinBanner } from "./PinBanner";
import { buildFindRows, FindFacet, FindRow, findableCount, focusKind } from "./findRows";
import { Bounds, focusBounds } from "./topologyBounds";
import {
    ENTRY_FOOTER_HEIGHT,
    ENTRY_HEADER_HEIGHT,
    ENTRY_ROW_BAND,
    ENTRY_ROW_HEIGHT,
    EVENT_COLOR_VAR,
    LAYOUT_FIT_MARGIN,
    TOPOLOGY_GAP_Y,
} from "../../resources/constants";
import { AgentSelection, EntrySelection, TopologyEdge, TopologyFocus, TopologyGraph, TopologyInput, TopologyLayout, TopologyOrientation, TriggerSelection } from "./types";

export interface AgentTopologyDiagramProps {
    input: TopologyInput;
    onAgentSelect: (agent: AgentSelection) => void;
    onTriggerSelect: (trigger: TriggerSelection) => void;
    onAddTrigger?: (agent: AgentSelection) => void;
    onConfigureEntry?: (entry: EntrySelection) => void;
    onDeleteEntry?: (entry: EntrySelection) => void;
    readonly?: boolean;
}

const FIT_MARGIN = 40;
const GLIDE_MS = 240;
const HOVER_FOCUS_DELAY_MS = 60;
// Ports are re-measured only once the nodes have finished gliding.
const SETTLE_MS = GLIDE_MS + 60;

// Remembered across remounts so drilling into an agent and back keeps the chosen layout.
let lastOrientation: TopologyOrientation = "horizontal";

type TopologyNodeModel = AgentCardNodeModel | ServiceNodeModel;

function createLink(edge: TopologyEdge, nodeModels: Map<string, TopologyNodeModel>): TopologyLinkModel | null {
    const sourceNode = nodeModels.get(edge.sourceId);
    const targetNode = nodeModels.get(edge.targetId);
    if (!sourceNode || !targetNode || targetNode instanceof ServiceNodeModel) {
        return null;
    }
    const sourcePort = sourceNode instanceof ServiceNodeModel ? sourceNode.getRowPort(edge.handlerId) : sourceNode.getOutPort();
    const targetPort = edge.kind === "event" ? targetNode.getInletPort(edge.channel) : targetNode.getInPort();
    if (!sourcePort || !targetPort) {
        return null;
    }
    const link = new TopologyLinkModel({ edgeId: edge.id, kind: edge.kind, gated: edge.gated, gatedBy: edge.gatedBy });
    link.setSourcePort(sourcePort);
    link.setTargetPort(targetPort);
    sourcePort.addLink(link);
    return link;
}

function sameRows(a: Record<string, number> | undefined, b: Record<string, number>): boolean {
    const ids = Object.keys(b);
    return a !== undefined && Object.keys(a).length === ids.length && ids.every((id) => a[id] === b[id]);
}

const Root = styled.div`
    position: relative;
    width: 100%;
    height: 100%;
`;

const TopLeft = styled.div`
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
`;

const TopRight = styled.div`
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 3;
`;

const TopCenter = styled.div`
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
`;

const Glide = styled.div<{ settling: boolean }>`
    height: 100%;
    & .node {
        transition: ${(props) => (props.settling ? `top ${GLIDE_MS}ms ease-in-out, left ${GLIDE_MS}ms ease-in-out` : "none")};
    }
    & > div > div > * {
        transition: ${(props) => (props.settling ? `transform ${GLIDE_MS}ms ease-in-out` : "none")};
    }
    & > div > div > svg,
    & > div > div > div:first-child {
        opacity: ${(props) => (props.settling ? 0 : 1)};
        transition: ${(props) => (props.settling ? "none" : "opacity 160ms ease-out")};
    }
    & > div > div > svg:first-of-type {
        z-index: 1;
    }
    & > div > div > svg:nth-of-type(2) {
        z-index: 2;
        pointer-events: none;
    }
`;

const EmptyNote = styled.div`
    max-width: 320px;
    padding: 10px 12px;
    border-radius: 6px;
    background-color: ${ThemeColors.SURFACE};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: "GilmerRegular";
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE};
`;

export function AgentTopologyDiagram(props: AgentTopologyDiagramProps) {
    const { input, onAgentSelect, onTriggerSelect, onAddTrigger, onConfigureEntry, onDeleteEntry, readonly } = props;
    const [diagramEngine] = useState(() => generateTopologyEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel | null>(null);
    const [legendKinds, setLegendKinds] = useState<ReturnType<typeof buildTopology>["legendKinds"]>([]);
    const [hoveredId, setHoveredId] = useState<string>();
    const [graph, setGraph] = useState<TopologyGraph>();
    // Entry cards whose rows the user has unfolded; cleared whenever the model changes.
    const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
    // The row budget the last layout drew with, held as state so the cards re-render when it changes.
    const [visibleRows, setVisibleRows] = useState<Record<string, number>>();
    // The Find chip is worth drawing from two things to find: wired handlers and agent cards together.
    const findable = graph ? findableCount(graph) : 0;
    const [pinnedId, setPinnedId] = useState<string>();
    const [findOpen, setFindOpen] = useState(false);
    // Isolated: the canvas shows only the pinned story, laid out on its own.
    const [isolated, setIsolated] = useState(false);
    // A kind chip under the pointer lights every flow of that kind instead of one node's.
    const [facetFocus, setFacetFocus] = useState<TopologyFocus>();
    const pinnedRef = useRef<string>();
    const isolatedRef = useRef(false);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const [wiredNothing, setWiredNothing] = useState(false);
    const [hasAgentCards, setHasAgentCards] = useState(false);
    const [previousNodeKey, setPreviousNodeKey] = useState<string>("");
    const [orientation, setOrientation] = useState<TopologyOrientation>(lastOrientation);
    const [settling, setSettling] = useState(false);
    const layoutRef = useRef<TopologyLayout>();
    const graphRef = useRef<TopologyGraph>();
    // What the canvas draws right now: the whole graph, or the pinned story while isolated.
    const shownGraphRef = useRef<TopologyGraph>();
    const graphSignatureRef = useRef<string>();
    const lastDescriptionRef = useRef<string>();
    const nodeModelsRef = useRef(new Map<string, TopologyNodeModel>());
    const linkModelsRef = useRef(new Map<string, TopologyLinkModel>());
    const fittingRef = useRef(false);
    const userAdjustedRef = useRef(false);

    const canvasSize = useCallback((): { width?: number; height?: number } => {
        const rect = diagramEngine.getCanvas()?.getBoundingClientRect();
        return { width: rect && rect.width > 0 ? rect.width : undefined, height: rect && rect.height > 0 ? rect.height : undefined };
    }, [diagramEngine]);

    // How many rows each card can draw before the rest fold behind "Show N more". Left to right the cards stack in
    // one column and share its height; top to bottom they sit side by side, so each may use the band the entry row
    // is allowed. Within that a card draws its wired rows (`defaultVisibleRows`); an unfolded card draws all of them.
    const rowBudget = useCallback((graph: TopologyGraph, height: number | undefined, vertical: boolean, unfoldedNow: Set<string>): Record<string, number> => {
        const budget: Record<string, number> = {};
        const wanting = graph.entries.filter((entry) => entry.handlers.length > 1);
        if (wanting.length === 0) {
            return budget;
        }
        const usable = (height ?? 0) - 2 * LAYOUT_FIT_MARGIN;
        const share = vertical
            ? usable * ENTRY_ROW_BAND - ENTRY_HEADER_HEIGHT - ENTRY_FOOTER_HEIGHT
            : (usable - (wanting.length - 1) * TOPOLOGY_GAP_Y) / wanting.length - ENTRY_HEADER_HEIGHT - ENTRY_FOOTER_HEIGHT;
        const fits = Math.floor(share / ENTRY_ROW_HEIGHT);
        wanting.forEach((entry) => (budget[entry.id] = unfoldedNow.has(entry.id) ? entry.handlers.length : defaultVisibleRows(entry, fits)));
        return budget;
    }, []);

    // Positions come from the layout for the canvas width we have right now; re-run when it changes.
    const applyLayout = useCallback((unfoldedNow: Set<string> = unfolded) => {
        const graph = shownGraphRef.current ?? graphRef.current;
        if (!graph) {
            return;
        }
        const { width, height } = canvasSize();
        const vertical = orientation === "vertical";
        const layoutOptions = { availableWidth: width, orientation, visibleRows: rowBudget(graph, height, vertical, unfoldedNow), unfolded: unfoldedNow };
        const layout = layoutTopology(graph, layoutOptions);
        layoutRef.current = layout;
        setVisibleRows((current) => (sameRows(current, layout.visibleRows) ? current : layout.visibleRows));
        // A pasteable picture of the canvas for debugging, once per distinct layout, at the verbose level so DevTools hides it by default.
        const description = describeTopology(input.model, graph, layout, layoutOptions);
        if (description !== lastDescriptionRef.current) {
            lastDescriptionRef.current = description;
            console.debug(description);
        }
        const place = (positions: Record<string, { x: number; y: number }>) =>
            Object.entries(positions).forEach(([id, position]) => nodeModelsRef.current.get(id)?.setPosition(position.x, position.y));
        place(layout.agentPositions);
        place(layout.entryPositions);
        linkModelsRef.current.forEach((link, edgeId) => {
            link.via = layout.edgeVias[edgeId] ?? [];
            link.bow = layout.edgeBows[edgeId] ?? 0;
            link.lane = layout.edgeLanes[edgeId];
            link.vertical = orientation === "vertical";
        });
    }, [canvasSize, rowBudget, orientation, input.model, unfolded]);

    // Centre the laid-out graph in the canvas from its own bounds, so the first paint does not
    // depend on when the nodes were measured; capped at 1:1 so small graphs are not blown up.
    const fitToBounds = useCallback((bounds: Bounds | undefined) => {
        const canvas = diagramEngine.getCanvas();
        if (!bounds || !canvas || bounds.width <= 0 || bounds.height <= 0) {
            return;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        const zoom = Math.min(1, (rect.width - 2 * FIT_MARGIN) / bounds.width, (rect.height - 2 * FIT_MARGIN) / bounds.height);
        const model = diagramEngine.getModel();
        fittingRef.current = true;
        model.setZoomLevel(zoom * 100);
        model.setOffset((rect.width - bounds.width * zoom) / 2 - bounds.left * zoom, (rect.height - bounds.height * zoom) / 2 - bounds.top * zoom);
        fittingRef.current = false;
        diagramEngine.repaintCanvas();
    }, [diagramEngine]);

    const fitToLayout = useCallback(() => {
        const layout = layoutRef.current;
        if (layout) {
            fitToBounds({ left: layout.left, top: 0, width: layout.width, height: layout.height });
        }
    }, [fitToBounds]);

    // A pinned flow is fitted on its own; anything else fits the whole graph.
    const refit = useCallback(() => {
        const pinned = pinnedRef.current;
        if (pinned && layoutRef.current && graphRef.current) {
            fitToBounds(focusBounds(layoutRef.current, focusAround(graphRef.current, pinned)));
            return;
        }
        fitToLayout();
    }, [fitToBounds, fitToLayout, orientation]);

    // Folding or unfolding a card changes its height, so the graph is laid out again around it right away.
    const onToggleEntry = useCallback(
        (entryId: string) => {
            const next = new Set(unfolded);
            if (!next.delete(entryId)) {
                next.add(entryId);
            }
            setUnfolded(next);
            applyLayout(next);
            if (!userAdjustedRef.current) {
                refit();
            }
            diagramEngine.repaintCanvas();
        },
        [unfolded, applyLayout, refit, diagramEngine]
    );

    // Build the node and link models for a graph, lay it out and hand the engine a fresh model; a graph with a
    // different node set is fitted once its nodes have measured, one with the same set keeps the camera.
    const installGraph = useCallback((graph: TopologyGraph) => {
        shownGraphRef.current = graph;
        const nodeModels = new Map<string, TopologyNodeModel>();
        graph.agents.forEach((agentNode) => nodeModels.set(agentNode.id, new AgentCardNodeModel(agentNode)));
        graph.entries.forEach((entryNode) => nodeModels.set(entryNode.id, new ServiceNodeModel(entryNode)));
        nodeModelsRef.current = nodeModels;

        const linkModels = new Map<string, TopologyLinkModel>();
        graph.edges.forEach((edgeData) => {
            const link = createLink(edgeData, nodeModels);
            if (link) {
                linkModels.set(edgeData.id, link);
            }
        });
        linkModelsRef.current = linkModels;
        applyLayout();

        const newModel = new DiagramModel();
        const markUserAdjusted = () => {
            if (!fittingRef.current) {
                userAdjustedRef.current = true;
            }
        };
        newModel.registerListener({ zoomUpdated: markUserAdjusted, offsetUpdated: markUserAdjusted });
        newModel.addLayer(new OverlayLayerModel());
        newModel.addAll(...nodeModels.values(), ...linkModels.values());

        const nodeKey = [...nodeModels.keys()].sort().join(",");
        const sameNodeSet = nodeKey === previousNodeKey && nodeKey.length > 0;
        if (sameNodeSet) {
            const previousModel = diagramEngine.getModel();
            newModel.setZoomLevel(previousModel.getZoomLevel());
            newModel.setOffset(previousModel.getOffsetX(), previousModel.getOffsetY());
        }
        setPreviousNodeKey(nodeKey);

        diagramEngine.setModel(newModel);
        setDiagramModel(newModel);

        setTimeout(() => {
            const overlayLayer = diagramEngine
                .getModel()
                .getLayers()
                .find((layer) => layer instanceof OverlayLayerModel);
            if (overlayLayer) {
                diagramEngine.getModel().removeLayer(overlayLayer);
            }
            applyLayout();
            if (!sameNodeSet) {
                userAdjustedRef.current = false;
                refit();
            }
            diagramEngine.repaintCanvas();
        }, 200);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [applyLayout, diagramEngine, previousNodeKey, refit]);

    useEffect(() => {
        const graph = buildTopology(input);
        // The design model carries a fresh uuid per request, so an unchanged package arrives as a new input.
        const signature = JSON.stringify(graph);
        if (signature === graphSignatureRef.current) {
            return;
        }
        graphSignatureRef.current = signature;
        graphRef.current = graph;
        setGraph(graph);
        setLegendKinds(graph.legendKinds);
        setUnfolded(new Set());
        const stillThere = (id: string) => graph.handlers.some((handler) => handler.id === id) || graph.agents.some((agent) => agent.id === id);
        if (pinnedRef.current && !stillThere(pinnedRef.current)) {
            pinnedRef.current = undefined;
            setPinnedId(undefined);
        }
        isolatedRef.current = false;
        setIsolated(false);
        setWiredNothing(graph.wiredNothing);
        setHasAgentCards(graph.agents.length > 0);
        installGraph(graph);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input]);

    // A canvas that appears or resizes later (lazy mount, side panel opening) re-centres the graph
    // until the user has panned or zoomed it themselves.
    useEffect(() => {
        const canvas = diagramEngine.getCanvas();
        if (!canvas || typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(() => {
            if (!userAdjustedRef.current) {
                applyLayout();
                refit();
            }
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [diagramEngine, diagramModel, applyLayout, refit]);

    // Passing the pointer over a card on the way elsewhere should not make the canvas flicker.
    const setHovered = useCallback((id?: string) => {
        clearTimeout(hoverTimerRef.current);
        if (id === undefined) {
            setHoveredId(undefined);
            return;
        }
        hoverTimerRef.current = setTimeout(() => setHoveredId(id), HOVER_FOCUS_DELAY_MS);
    }, []);
    useEffect(() => () => clearTimeout(hoverTimerRef.current), []);

    // Leaving isolation puts the whole graph back; `installGraph` fits it once the nodes have measured.
    const showEverything = useCallback(() => {
        if (!isolatedRef.current || !graphRef.current) {
            return false;
        }
        isolatedRef.current = false;
        setIsolated(false);
        installGraph(graphRef.current);
        return true;
    }, [installGraph]);

    // Pin a story from the Find list: it stays lit and the canvas fits it until it is unpinned.
    const unpin = useCallback(() => {
        if (!pinnedRef.current) {
            return;
        }
        pinnedRef.current = undefined;
        setPinnedId(undefined);
        userAdjustedRef.current = false;
        if (!showEverything()) {
            fitToLayout();
        }
    }, [fitToLayout, showEverything]);

    // Pinning folds the panel back to its chip and drops the row's own hover so the pin alone drives the focus.
    const pin = useCallback(
        (id: string) => {
            setFindOpen(false);
            setHovered(undefined);
            if (pinnedRef.current === id) {
                unpin();
                return;
            }
            pinnedRef.current = id;
            setPinnedId(id);
            userAdjustedRef.current = false;
            if (!showEverything()) {
                refit();
            }
        },
        [unpin, refit, setHovered, showEverything]
    );

    // Isolate the pinned story: only its cards and lit edges stay, laid out on their own.
    const isolate = useCallback(
        (on: boolean) => {
            const whole = graphRef.current;
            const pinned = pinnedRef.current;
            if (!whole || !pinned || isolatedRef.current === on) {
                return;
            }
            setFindOpen(false);
            if (!on) {
                showEverything();
                return;
            }
            isolatedRef.current = true;
            setIsolated(true);
            installGraph(isolateGraph(whole, focusAround(whole, pinned)));
        },
        [installGraph, showEverything]
    );

    const previewFacet = useCallback((facet?: FindFacet) => {
        setFacetFocus(facet && graphRef.current ? focusKind(graphRef.current, facet) : undefined);
    }, []);

    // The ↗ on a row does what clicking the trigger square or the agent card does.
    const openRow = useCallback(
        (row: FindRow) => {
            if (row.handler) {
                onTriggerSelect({ filePath: row.handler.filePath, position: row.handler.position, endPosition: row.handler.endPosition });
            } else if (row.agent) {
                onAgentSelect({ path: row.agent.filePath, startLine: row.agent.position.line, name: row.agent.name, moduleName: row.agent.moduleName });
            }
        },
        [onTriggerSelect, onAgentSelect]
    );

    // "/" opens Find (not while typing elsewhere); Esc folds the panel, then leaves isolation, then clears the pin.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
            if (event.key === "/" && !typing && findable >= 2) {
                event.preventDefault();
                setFindOpen(true);
                return;
            }
            if (event.key !== "Escape") {
                return;
            }
            if (findOpen) {
                setFindOpen(false);
            } else if (!showEverything()) {
                unpin();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [findOpen, findable, showEverything, unpin]);

    // A click on the bare canvas, not on a node, link or chip, folds the panel; the pin stays.
    const onCanvasClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
        if (!(event.target as HTMLElement).closest(".node, svg, foreignObject")) {
            setFindOpen(false);
        }
    }, []);

    const pinnedRow = useMemo(() => {
        if (!graph || !pinnedId) {
            return undefined;
        }
        const rows = buildFindRows(graph, "");
        return [...rows.entries, ...rows.agents].find((row) => row.id === pinnedId);
    }, [graph, pinnedId]);


    const toggleOrientation = useCallback(() => {
        setSettling(true);
        setOrientation((current) => (current === "vertical" ? "horizontal" : "vertical"));
    }, []);

    // The trigger node changes size with the orientation, and react-diagrams then re-measures its ports
    // from a DOM that may still show the old position; measure every port again once the canvas has repainted.
    const reportPorts = useCallback(() => {
        nodeModelsRef.current.forEach((node) =>
            Object.values(node.getPorts()).forEach((port) => {
                try {
                    port.updateCoords(diagramEngine.getPortCoords(port));
                } catch {
                    // The node is not in the DOM yet; the port reports itself on mount.
                }
            })
        );
    }, [diagramEngine]);

    useEffect(() => {
        if (orientation === lastOrientation) {
            return;
        }
        lastOrientation = orientation;
        applyLayout();
        userAdjustedRef.current = false;
        refit();
        const timer = setTimeout(() => {
            reportPorts();
            setSettling(false);
        }, SETTLE_MS);
        return () => clearTimeout(timer);
    }, [orientation, applyLayout, reportPorts, refit]);

    const context = useMemo(
        () => ({
            readonly,
            orientation,
            onAgentSelect,
            onTriggerSelect,
            onAddTrigger,
            onConfigureEntry,
            onDeleteEntry,
            focus: facetFocus ?? ((hoveredId ?? pinnedId) && graphRef.current ? focusAround(graphRef.current, hoveredId ?? pinnedId) : undefined),
            setHovered,
            visibleRows,
            unfolded,
            onToggleEntry,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [readonly, orientation, onAgentSelect, onTriggerSelect, onAddTrigger, onConfigureEntry, onDeleteEntry, hoveredId, pinnedId, facetFocus, input, setHovered, visibleRows, unfolded, onToggleEntry]
    );

    return (
        <Root style={{ [EVENT_COLOR_VAR]: getNodeChartColor("WAIT_DATA") } as React.CSSProperties}>
            <Controls engine={diagramEngine} orientation={orientation} onToggleOrientation={toggleOrientation} />
            <TopLeft>
                <Legend kinds={legendKinds} />
                {wiredNothing && hasAgentCards && (
                    <EmptyNote>No triggers yet. Agents only run when a trigger calls them. Select Add Trigger on an agent card.</EmptyNote>
                )}
            </TopLeft>
            {graph && pinnedRow && (
                <TopCenter>
                    <PinBanner
                        row={pinnedRow}
                        isolated={isolated}
                        onIsolate={() => isolate(true)}
                        onExitIsolation={() => isolate(false)}
                        onUnpin={unpin}
                    />
                </TopCenter>
            )}
            {graph && findable >= 2 && (
                <TopRight>
                    <FindPanel
                        graph={graph}
                        pinnedId={pinnedId}
                        open={findOpen}
                        onToggle={setFindOpen}
                        onPreview={setHovered}
                        onPreviewFacet={previewFacet}
                        onPin={pin}
                        onOpen={openRow}
                    />
                </TopRight>
            )}
            {diagramEngine && diagramModel && (
                <TopologyContextProvider value={context}>
                    <Glide settling={settling} onClick={onCanvasClick}>
                        <DiagramCanvas>
                            <CanvasWidget engine={diagramEngine} />
                        </DiagramCanvas>
                    </Glide>
                </TopologyContextProvider>
            )}
        </Root>
    );
}
