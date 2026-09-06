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
import { ChipLayerModel } from "../ChipLayer";
import { TopologyLinkModel } from "../NodeLink";
import { AgentCardNodeModel } from "../nodes/AgentCardNode";
import { TriggerNodeModel } from "../nodes/TriggerNode";
import { SplitNodeModel } from "../nodes/SplitNode";
import { generateTopologyEngine } from "./engine";
import { buildTopology } from "./topologyModel";
import { layoutTopology } from "./topologyLayout";
import { TopologyContextProvider } from "./TopologyContext";
import { Legend } from "./Legend";
import { AgentSelection, TopologyEdge, TopologyGraph, TopologyInput, TopologyLayout, TopologyOrientation, TriggerSelection } from "./types";

export interface AgentTopologyDiagramProps {
    input: TopologyInput;
    onAgentSelect: (agent: AgentSelection) => void;
    onTriggerSelect: (trigger: TriggerSelection) => void;
    readonly?: boolean;
}

const FIT_MARGIN = 40;
const GLIDE_MS = 240;
// Ports are re-measured only once the nodes have finished gliding.
const SETTLE_MS = GLIDE_MS + 60;

// Remembered across remounts so drilling into an agent and back keeps the chosen layout.
let lastOrientation: TopologyOrientation = "horizontal";

type TopologyNodeModel = AgentCardNodeModel | TriggerNodeModel | SplitNodeModel;

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
    const link = new TopologyLinkModel({ dashed: edge.kind === "delegation", arrow: edge.kind !== "stem", chips: edge.chips, bow: edge.bow });
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

// While an orientation change settles, nodes and the canvas glide to their new places and the svg layers (links,
// then chips) are hidden until the ports are re-measured. The canvas lifts the link svg to z-index 1, so the chip
// svg goes above it and lets clicks through.
const Glide = styled.div<{ settling: boolean }>`
    height: 100%;
    & .node {
        transition: ${(props) => (props.settling ? `top ${GLIDE_MS}ms ease-in-out, left ${GLIDE_MS}ms ease-in-out` : "none")};
    }
    & > div > div > * {
        transition: ${(props) => (props.settling ? `transform ${GLIDE_MS}ms ease-in-out` : "none")};
    }
    & > div > div > svg {
        opacity: ${(props) => (props.settling ? 0 : 1)};
        transition: ${(props) => (props.settling ? "none" : "opacity 160ms ease-out")};
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
    const { input, onAgentSelect, onTriggerSelect, readonly } = props;
    const [diagramEngine] = useState(() => generateTopologyEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel | null>(null);
    const [legendKinds, setLegendKinds] = useState<ReturnType<typeof buildTopology>["legendKinds"]>([]);
    const [wiredNothing, setWiredNothing] = useState(false);
    const [previousNodeKey, setPreviousNodeKey] = useState<string>("");
    const [orientation, setOrientation] = useState<TopologyOrientation>(lastOrientation);
    const [settling, setSettling] = useState(false);
    const layoutRef = useRef<TopologyLayout>();
    const graphRef = useRef<TopologyGraph>();
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
        const layout = layoutTopology(graph, { availableWidth: canvasWidth(), orientation });
        layoutRef.current = layout;
        const place = (positions: Record<string, { x: number; y: number }>) =>
            Object.entries(positions).forEach(([id, position]) => nodeModelsRef.current.get(id)?.setPosition(position.x, position.y));
        place(layout.agentPositions);
        place(layout.triggerPositions);
        place(layout.splitPositions);
        linkModelsRef.current.forEach((link, edgeId) => {
            link.via = layout.edgeVias[edgeId] ?? [];
            link.vertical = orientation === "vertical";
        });
    }, [canvasWidth, orientation]);

    // Centre the laid-out graph in the canvas from its own bounds, so the first paint does not
    // depend on when the nodes were measured; capped at 1:1 so small graphs are not blown up.
    const fitToLayout = useCallback(() => {
        const layout = layoutRef.current;
        const canvas = diagramEngine.getCanvas();
        if (!layout || !canvas || layout.width <= 0 || layout.height <= 0) {
            return;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        const zoom = Math.min(1, (rect.width - 2 * FIT_MARGIN) / layout.width, (rect.height - 2 * FIT_MARGIN) / layout.height);
        const model = diagramEngine.getModel();
        fittingRef.current = true;
        model.setZoomLevel(zoom * 100);
        model.setOffset((rect.width - layout.width * zoom) / 2 - layout.left * zoom, (rect.height - layout.height * zoom) / 2);
        fittingRef.current = false;
        diagramEngine.repaintCanvas();
    }, [diagramEngine]);

    useEffect(() => {
        const graph = buildTopology(input);
        graphRef.current = graph;
        setLegendKinds(graph.legendKinds);
        setWiredNothing(graph.wiredNothing);

        const nodeModels = new Map<string, TopologyNodeModel>();
        graph.agents.forEach((agentNode) => nodeModels.set(agentNode.id, new AgentCardNodeModel(agentNode)));
        graph.triggers.forEach((triggerNode) => nodeModels.set(triggerNode.id, new TriggerNodeModel(triggerNode)));
        graph.splits.forEach((splitNode) => nodeModels.set(splitNode.id, new SplitNodeModel(splitNode)));
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
        newModel.addLayer(new ChipLayerModel());
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
                fitToLayout();
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
                fitToLayout();
            }
        });
        observer.observe(canvas);
        return () => observer.disconnect();
    }, [diagramEngine, diagramModel, applyLayout, fitToLayout]);

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
        fitToLayout();
        const timer = setTimeout(() => {
            reportPorts();
            setSettling(false);
        }, SETTLE_MS);
        return () => clearTimeout(timer);
    }, [orientation, applyLayout, reportPorts, fitToLayout]);

    const context = useMemo(
        () => ({ readonly, orientation, onAgentSelect, onTriggerSelect }),
        [readonly, orientation, onAgentSelect, onTriggerSelect]
    );

    return (
        <Root>
            <Controls engine={diagramEngine} orientation={orientation} onToggleOrientation={toggleOrientation} />
            <TopLeft>
                <Legend kinds={legendKinds} />
                {wiredNothing && (
                    <EmptyNote>Nothing runs yet. Add a trigger to an agent, or make one agent a tool of another.</EmptyNote>
                )}
            </TopLeft>
            {diagramEngine && diagramModel && (
                <TopologyContextProvider value={context}>
                    <Glide settling={settling}>
                        <DiagramCanvas>
                            <CanvasWidget engine={diagramEngine} />
                        </DiagramCanvas>
                    </Glide>
                </TopologyContextProvider>
            )}
        </Root>
    );
}
