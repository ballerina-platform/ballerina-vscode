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
import { DiagramEngine } from "@projectstorm/react-diagrams-core";
import { ThemeColors } from "@wso2/ui-toolkit";
import { TopologyLinkModel } from "./TopologyLinkModel";

interface TopologyLinkWidgetProps {
    link: TopologyLinkModel;
    engine: DiagramEngine;
}

interface Point {
    x: number;
    y: number;
}

const ARROW_SIZE = 8;
const MIN_HANDLE = 40;
const BOW_PX = 44;
const PILL_END_OFFSET = 28;

// Ports face each other along the flow axis, so the curve leaves and arrives flat; a bow lifts the middle.
function controlPoints(source: Point, target: Point, bow: number, vertical: boolean): [Point, Point] {
    if (vertical) {
        const handle = Math.max(MIN_HANDLE, Math.abs(target.y - source.y) * 0.45);
        return [
            { x: source.x + bow, y: source.y + handle },
            { x: target.x + bow, y: target.y - handle },
        ];
    }
    const handle = Math.max(MIN_HANDLE, Math.abs(target.x - source.x) * 0.45);
    return [
        { x: source.x + handle, y: source.y + bow },
        { x: target.x - handle, y: target.y + bow },
    ];
}

function routePath(points: Point[], bow: number, vertical: boolean): string {
    const curves = points.slice(1).map((point, index) => {
        const [c1, c2] = controlPoints(points[index], point, bow, vertical);
        return `C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${point.x} ${point.y}`;
    });
    return `M ${points[0].x} ${points[0].y} ${curves.join(" ")}`;
}

function pointOnCurve(t: number, source: Point, target: Point, bow: number, vertical: boolean): Point {
    const [c1, c2] = controlPoints(source, target, bow, vertical);
    const u = 1 - t;
    const x = u * u * u * source.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * target.x;
    const y = u * u * u * source.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * target.y;
    return { x, y };
}

// t runs over the whole route, so with one lane t = 0.5 lands exactly on the lane.
function pointOnRoute(t: number, points: Point[], bow: number, vertical: boolean): Point {
    const segments = points.length - 1;
    const index = Math.min(Math.floor(t * segments), segments - 1);
    return pointOnCurve(t * segments - index, points[index], points[index + 1], bow, vertical);
}

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

function SequenceChip({ point, text, color }: { point: Point; text: string; color: string }) {
    return (
        <foreignObject x={point.x - CHIP_BOX_HEIGHT / 2} y={point.y - CHIP_BOX_HEIGHT / 2} width={CHIP_BOX_HEIGHT} height={CHIP_BOX_HEIGHT}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: CHIP_BOX_HEIGHT }}>
                <div
                    style={{
                        width: 24,
                        height: 24,
                        boxSizing: "border-box",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: ThemeColors.SURFACE_BRIGHT,
                        border: `1.5px solid ${color}`,
                        fontSize: 12,
                        fontWeight: 700,
                        lineHeight: 1,
                        color,
                        userSelect: "none",
                    }}
                >
                    {text}
                </div>
            </div>
        </foreignObject>
    );
}

export function TopologyLinkWidget({ link }: TopologyLinkWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const color = isHovered ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE;

    const points = [link.getFirstPoint().getPosition(), ...link.via, link.getLastPoint().getPosition()];
    const bow = link.bow * BOW_PX;
    const path = routePath(points, bow, link.vertical);
    const chips = link.chips.slice(0, 2);
    const ts = chips.length >= 2 ? [0.38, 0.62] : [0.5];
    const markerId = `${link.getID()}-arrow`;

    return (
        <g pointerEvents="all" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
            <path
                id={link.getID()}
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={link.dashed ? "6 5" : undefined}
                markerEnd={link.arrow ? `url(#${markerId})` : undefined}
            />
            <defs>
                <marker
                    markerWidth={ARROW_SIZE}
                    markerHeight={ARROW_SIZE}
                    refX={ARROW_SIZE - 1}
                    refY={ARROW_SIZE / 2}
                    viewBox={`0 0 ${ARROW_SIZE} ${ARROW_SIZE}`}
                    orient="auto"
                    id={markerId}
                >
                    <polygon points={`0,0 0,${ARROW_SIZE} ${ARROW_SIZE},${ARROW_SIZE / 2}`} fill={color} />
                </marker>
            </defs>
            {chips.map((chip, index) => {
                // Sibling branches are only a card pitch apart when the flow runs downwards, so a pill
                // halfway along would overlap its neighbour; it sits on the vertical run into its card instead.
                const target = points[points.length - 1];
                const point =
                    link.vertical && chip.kind === "condition"
                        ? { x: target.x, y: target.y - PILL_END_OFFSET }
                        : pointOnRoute(ts[index] ?? 0.5, points, bow, link.vertical);
                return chip.kind === "sequence" ? (
                    <SequenceChip key={index} point={point} text={chip.text} color={color} />
                ) : (
                    <ConditionChip key={index} point={point} text={chip.text} color={color} />
                );
            })}
        </g>
    );
}
