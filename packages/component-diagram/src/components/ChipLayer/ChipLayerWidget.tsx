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
import { FOCUS_FADE, RECEDED_OPACITY } from "../NodeLink/TopologyLinkWidget";
import { useTopologyContext } from "../AgentTopologyDiagram/TopologyContext";

const CHIP_BOX_WIDTH = 260;
const CHIP_BOX_HEIGHT = 32;

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
    width: 24px;
    height: 24px;
    box-sizing: border-box;
    border-radius: 50%;
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
function stepRow(step: number, steps: string[]): PopoverRow {
    const prefix = step === 1 ? "Runs before" : "Runs after";
    const other = step === 1 ? steps[1] : steps[step - 2];
    return { key: "step", glyph: <StepCircle>{step}</StepCircle>, prefix, label: other };
}

function SequenceChip({ point, text, steps, zoom }: { point: Point; text: string; steps: string[]; zoom: number }) {
    const [anchor, setAnchor] = useState<DOMRect>();
    const rows = steps.length >= 2 ? [stepRow(Number(text), steps)] : [];
    return (
        <foreignObject x={point.x - CHIP_BOX_HEIGHT / 2} y={point.y - CHIP_BOX_HEIGHT / 2} width={CHIP_BOX_HEIGHT} height={CHIP_BOX_HEIGHT}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: CHIP_BOX_HEIGHT }}>
                <StepCircle
                    style={{ pointerEvents: "auto" }}
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
                const { chipPoint, pillPoint } = linkRoute(link);
                const opacity = focus && !focus.edges.has(link.edgeId) ? RECEDED_OPACITY : 1;
                return (
                    <g key={link.getID()} style={{ opacity, transition: `opacity ${FOCUS_FADE}` }}>
                        {link.chips.slice(0, 2).map((chip, index) =>
                            chip.kind === "sequence" ? (
                                <SequenceChip key={index} point={chipPoint} text={chip.text} steps={chip.steps ?? []} zoom={zoom} />
                            ) : (
                                <ConditionChip key={index} point={pillPoint} text={chip.text} color={ThemeColors.ON_SURFACE} />
                            )
                        )}
                    </g>
                );
            })}
        </g>
    );
}
