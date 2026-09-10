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
import { TriggerNodeModel } from "../nodes/TriggerNode";
import { generateTopologyEngine } from "./engine";
import { buildTopology } from "./topologyModel";
import { layoutTopology } from "./topologyLayout";
import { describeTopology } from "./topologyDescribe";
import { focusAround } from "./topologyFocus";
import { TopologyContextProvider } from "./TopologyContext";
import { Legend } from "./Legend";
import { FlowList } from "./FlowList";
import { Bounds, focusBounds } from "./topologyBounds";
import { AgentSelection, TopologyEdge, TopologyGraph, TopologyInput, TopologyLayout, TopologyOrientation, TopologyTriggerNode, TriggerSelection } from "./types";

export interface AgentTopologyDiagramProps {
    input: TopologyInput;
    onAgentSelect: (agent: AgentSelection) => void;
    onTriggerSelect: (trigger: TriggerSelection) => void;
    onAddTrigger?: (agent: AgentSelection) => void;
    readonly?: boolean;
}

const FIT_MARGIN = 40;
const GLIDE_MS = 240;
const HOVER_FOCUS_DELAY_MS = 60;
// Ports are re-measured only once the nodes have finished gliding.
const SETTLE_MS = GLIDE_MS + 60;

// Remembered across remounts so drilling into an agent and back keeps the chosen layout.
let lastOrientation: TopologyOrientation = "horizontal";

type TopologyNodeModel = AgentCardNodeModel | TriggerNodeModel;

function createLink(edge: TopologyEdge, nodeModels: Map<string, TopologyNodeModel>): TopologyLinkModel | null {
    const sourceNode = nodeModels.get(edge.sourceId);
    const targetNode = nodeModels.get(edge.targetId);
    if (!sourceNode || !targetNode || targetNode instanceof TriggerNodeModel) {
        return null;
    }
    const sourcePort = sourceNode.getOutPort();
    const targetPort = targetNode.getInPort();
    if (!sourcePort || !targetPort) {
        return null;
    }
    const link = new TopologyLinkModel({ edgeId: edge.id, dashed: edge.kind === "delegation" });
    link.setSourcePort(sourcePort);
    link.setTargetPort(targetPort);
    sourcePort.addLink(link);
    return link;
}

const Root = styled.div`
    position: relative;
    width: 100%;
    height: 100%;
`;

// Triggers sit at the left, so the top-left corner is the one place a card cannot be.
const TopLeft = styled.div`
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
`;

const TopRight = styled.div`
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1000;
`;

// While an orientation change settles, nodes and the canvas glide to their new places and the loop boxes and svg
// layers (links, then chips) are hidden until the ports are re-measured. Layers paint in order: loop boxes, links
// (lifted to z-index 1 so they run over the cards), nodes, chips above everything and letting clicks through.
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
    const { input, onAgentSelect, onTriggerSelect, onAddTrigger, readonly } = props;
    const [diagramEngine] = useState(() => generateTopologyEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel | null>(null);
    const [legendKinds, setLegendKinds] = useState<ReturnType<typeof buildTopology>["legendKinds"]>([]);
    const [hoveredId, setHoveredId] = useState<string>();
    const [triggers, setTriggers] = useState<TopologyTriggerNode[]>([]);
    const [pinnedId, setPinnedId] = useState<string>();
    const [flowsOpen, setFlowsOpen] = useState(false);
    const pinnedRef = useRef<string>();
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();
    const [wiredNothing, setWiredNothing] = useState(false);
    const [previousNodeKey, setPreviousNodeKey] = useState<string>("");
    const [orientation, setOrientation] = useState<TopologyOrientation>(lastOrientation);
    const [settling, setSettling] = useState(false);
    const layoutRef = useRef<TopologyLayout>();
    const graphRef = useRef<TopologyGraph>();
    const lastDescriptionRef = useRef<string>();
    const nodeModelsRef = useRef(new Map<string, TopologyNodeModel>());
    const linkModelsRef = useRef(new Map<string, TopologyLinkModel>());
    const fittingRef = useRef(false);
    const userAdjustedRef = useRef(false);

    const canvasWidth = useCallback((): number | undefined => {
        const rect = diagramEngine.getCanvas()?.getBoundingClientRect();
        return rect && rect.width > 0 ? rect.width : undefined;
    }, [diagramEngine]);

    // Positions come from the layout for the canvas width we have right now; re-run when it changes.
    const applyLayout = useCallback(() => {
        const graph = graphRef.current;
        if (!graph) {
            return;
        }
        const layoutOptions = { availableWidth: canvasWidth(), orientation };
        const layout = layoutTopology(graph, layoutOptions);
        layoutRef.current = layout;
        // A pasteable picture of the canvas for debugging, once per distinct layout, at the verbose level so DevTools hides it by default.
        const description = describeTopology(input.model, graph, layout, layoutOptions);
        if (description !== lastDescriptionRef.current) {
            lastDescriptionRef.current = description;
            console.debug(description);
        }
        const place = (positions: Record<string, { x: number; y: number }>) =>
            Object.entries(positions).forEach(([id, position]) => nodeModelsRef.current.get(id)?.setPosition(position.x, position.y));
        place(layout.agentPositions);
        place(layout.triggerPositions);
        linkModelsRef.current.forEach((link, edgeId) => {
            link.via = layout.edgeVias[edgeId] ?? [];
            link.bow = layout.edgeBows[edgeId] ?? 0;
            link.vertical = orientation === "vertical";
        });
    }, [canvasWidth, orientation, input.model]);

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
            fitToBounds(focusBounds(layoutRef.current, focusAround(graphRef.current, pinned), orientation));
            return;
        }
        fitToLayout();
    }, [fitToBounds, fitToLayout, orientation]);

    useEffect(() => {
        const graph = buildTopology(input);
        graphRef.current = graph;
        setLegendKinds(graph.legendKinds);
        setTriggers(graph.triggers);
        if (pinnedRef.current && !graph.triggers.some((trigger) => trigger.id === pinnedRef.current)) {
            pinnedRef.current = undefined;
            setPinnedId(undefined);
        }
        setWiredNothing(graph.wiredNothing);

        const nodeModels = new Map<string, TopologyNodeModel>();
        graph.agents.forEach((agentNode) => nodeModels.set(agentNode.id, new AgentCardNodeModel(agentNode)));
        graph.triggers.forEach((triggerNode) => nodeModels.set(triggerNode.id, new TriggerNodeModel(triggerNode)));
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

    // Pin a flow from the entry-points list: it stays lit and the canvas fits it until it is unpinned.
    const unpin = useCallback(() => {
        if (!pinnedRef.current) {
            return;
        }
        pinnedRef.current = undefined;
        setPinnedId(undefined);
        userAdjustedRef.current = false;
        fitToLayout();
    }, [fitToLayout]);

    // Pinning folds the list back to its chip and drops the row's own hover so the pin alone drives the focus.
    const pin = useCallback(
        (id: string) => {
            setFlowsOpen(false);
            setHovered(undefined);
            if (pinnedRef.current === id) {
                unpin();
                return;
            }
            pinnedRef.current = id;
            setPinnedId(id);
            userAdjustedRef.current = false;
            refit();
        },
        [unpin, refit, setHovered]
    );

    // Esc folds the list first, then clears the pin.
    useEffect(() => {
        if (!pinnedId && !flowsOpen) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }
            if (flowsOpen) {
                setFlowsOpen(false);
            } else {
                unpin();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [pinnedId, flowsOpen, unpin]);

    // A click on the bare canvas, not on a node, link or chip, folds the list and clears the pin.
    const onCanvasClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (!(event.target as HTMLElement).closest(".node, svg, foreignObject")) {
                setFlowsOpen(false);
                unpin();
            }
        },
        [unpin]
    );


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
            focus: (hoveredId ?? pinnedId) && graphRef.current ? focusAround(graphRef.current, hoveredId ?? pinnedId) : undefined,
            setHovered,
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [readonly, orientation, onAgentSelect, onTriggerSelect, onAddTrigger, hoveredId, pinnedId, input, setHovered]
    );

    return (
        <Root>
            <Controls engine={diagramEngine} orientation={orientation} onToggleOrientation={toggleOrientation} />
            <TopLeft>
                <Legend kinds={legendKinds} />
                {wiredNothing && (
                    <EmptyNote>No triggers yet. Agents only run when a trigger calls them. Select Add Trigger on an agent card.</EmptyNote>
                )}
            </TopLeft>
            {triggers.length >= 2 && (
                <TopRight>
                    <FlowList
                        triggers={triggers}
                        pinnedId={pinnedId}
                        open={flowsOpen}
                        onToggle={setFlowsOpen}
                        onPreview={setHovered}
                        onPin={pin}
                        onOpen={(trigger) => onTriggerSelect({ filePath: trigger.filePath, position: trigger.position, endPosition: trigger.endPosition })}
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
