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

import React, { useState } from "react";
import styled from "@emotion/styled";
import { DiagramEngine } from "@projectstorm/react-diagrams";
import { ThemeColors } from "@wso2/ui-toolkit";
import { CardPopover, PopoverRow } from "../AgentTopologyDiagram/CardPopover";
import { TopologyLinkModel } from "../NodeLink/TopologyLinkModel";
import { Point, linkRoute } from "../NodeLink/topologyRoute";
import { EdgeChip } from "../AgentTopologyDiagram/types";
import { FOCUS_FADE, RECEDED_OPACITY } from "../NodeLink/TopologyLinkWidget";
import { useTopologyContext } from "../AgentTopologyDiagram/TopologyContext";

const CHIP_BOX_WIDTH = 260;
const CHIP_BOX_HEIGHT = 32;
// Two handlers numbering the same edge: their chips sit side by side along the run.
const SEQUENCE_CHIP_PITCH = 30;

function alongRun(run: [Point, Point], from: Point, distance: number): Point {
    const length = Math.hypot(run[1].x - run[0].x, run[1].y - run[0].y) || 1;
    return { x: from.x + ((run[1].x - run[0].x) / length) * distance, y: from.y + ((run[1].y - run[0].y) / length) * distance };
}

// The edge's numbers grouped by value, in order; two handlers that agree on a number share one circle.
function sequenceGroups(chips: EdgeChip[]): EdgeChip[][] {
    const byText = new Map<string, EdgeChip[]>();
    chips.filter((chip) => chip.kind === "sequence").forEach((chip) => byText.set(chip.text, [...(byText.get(chip.text) ?? []), chip]));
    return [...byText.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, group]) => group);
}

// Same pill the flow diagram paints on its branch links (NodeLinkWidget): 1.5 px border, 20 px radius,
// 2/10 padding, 13 px text; the foreignObject is taller than the pill so no border edge gets clipped.
function ConditionChip({ point, text, color }: { point: Point; text: string; color: string }) {
    return (
        <foreignObject x={point.x - CHIP_BOX_WIDTH / 2} y={point.y - CHIP_BOX_HEIGHT / 2} width={CHIP_BOX_WIDTH} height={CHIP_BOX_HEIGHT}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: CHIP_BOX_HEIGHT }}>
                <div
                    title={text}
                    style={{
                        pointerEvents: "auto",
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 20,
                        border: `1.5px solid ${color}`,
                        backgroundColor: ThemeColors.SURFACE_BRIGHT,
                        padding: "2px 10px",
                        boxSizing: "border-box",
                        width: "fit-content",
                    }}
                >
                    <span
                        style={{
                            color,
                            fontSize: 13,
                            lineHeight: "18px",
                            userSelect: "none",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: CHIP_BOX_WIDTH - 40,
                            display: "inline-block",
                        }}
                    >
                        {text}
                    </span>
                </div>
            </div>
        </foreignObject>
    );
}

const StepCircle = styled.div`
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    border: 1.5px solid ${ThemeColors.ON_SURFACE};
    color: ${ThemeColors.ON_SURFACE};
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    user-select: none;
`;

// The first step names what follows it; every later step names what ran before it.
// One handler's reading of the number: what runs before or after, then which handler and how many steps.
function stepRows(chip: EdgeChip): PopoverRow[] {
    const steps = chip.steps ?? [];
    const outer = chip.text.split(".");
    const step = Number(outer.pop());
    if (steps.length < 2) {
        return [];
    }
    const prefix = step === 1 ? "Runs before" : "Runs after";
    const other = step === 1 ? steps[1] : steps[step - 2];
    const within = outer.length ? ` within step ${outer.join(".")}` : "";
    const where = chip.handler ? ` in ${chip.handler}` : "";
    return [
        { key: `${chip.triggerId}-step`, glyph: <StepCircle>{chip.text}</StepCircle>, prefix, label: other },
        { key: `${chip.triggerId}-where`, label: `Step ${step} of ${steps.length}${within}${where}`, muted: true },
    ];
}

// Chips that share a number on one edge draw as one circle; the popover lists each handler's reading.
function SequenceChip({ point, chips, faded, zoom }: { point: Point; chips: EdgeChip[]; faded: boolean; zoom: number }) {
    const [anchor, setAnchor] = useState<DOMRect>();
    const rows = chips.flatMap(stepRows);
    const text = chips[0].text;
    const width = Math.max(CHIP_BOX_HEIGHT, text.length * 8 + 16);
    return (
        <foreignObject x={point.x - width / 2} y={point.y - CHIP_BOX_HEIGHT / 2} width={width} height={CHIP_BOX_HEIGHT}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: CHIP_BOX_HEIGHT }}>
                <StepCircle
                    style={{ pointerEvents: "auto", opacity: faded ? RECEDED_OPACITY : 1, transition: `opacity ${FOCUS_FADE}` }}
                    onMouseEnter={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
                    onMouseLeave={() => setAnchor(undefined)}
                >
                    {text}
                </StepCircle>
            </div>
            {anchor && rows.length > 0 && <CardPopover rows={rows} anchor={anchor} zoom={zoom} />}
        </foreignObject>
    );
}

interface ChipLayerWidgetProps {
    engine: DiagramEngine;
}

export function ChipLayerWidget({ engine }: ChipLayerWidgetProps) {
    const { focus } = useTopologyContext();
    const zoom = engine.getModel().getZoomLevel() / 100;
    const links = engine.getModel().getLinks().filter((link): link is TopologyLinkModel => link instanceof TopologyLinkModel);
    return (
        <g>
            {links.map((link) => {
                const { chipPoint, pillPoint, run } = linkRoute(link);
                const opacity = focus && !focus.edges.has(link.edgeId) ? RECEDED_OPACITY : 1;
                const groups = sequenceGroups(link.chips);
                const pill = link.chips.find((chip) => chip.kind === "condition");
                // While a flow is lit, numbers that belong to a handler outside it recede with the other edges.
                const faded = (group: EdgeChip[]): boolean => Boolean(focus) && !group.some((chip) => !chip.triggerId || focus.nodes.has(chip.triggerId));
                return (
                    <g key={link.getID()} style={{ opacity, transition: `opacity ${FOCUS_FADE}` }}>
                        {groups.map((group, index) => (
                            <SequenceChip
                                key={group[0].text}
                                point={alongRun(run, chipPoint, (index - (groups.length - 1) / 2) * SEQUENCE_CHIP_PITCH)}
                                chips={group}
                                faded={faded(group)}
                                zoom={zoom}
                            />
                        ))}
                        {pill && <ConditionChip point={pillPoint} text={pill.text} color={ThemeColors.ON_SURFACE} />}
                    </g>
                );
            })}
        </g>
    );
}
