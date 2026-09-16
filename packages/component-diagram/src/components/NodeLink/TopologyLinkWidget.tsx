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
import { linkRoute, roundedPath } from "./topologyRoute";
import { useTopologyContext } from "../AgentTopologyDiagram/TopologyContext";
import { roleLabel } from "../AgentTopologyDiagram/roleLabel";
import { CardPopover, PopoverRow } from "../AgentTopologyDiagram/CardPopover";
import { EVENT_COLOR, FOCUS_FADE_MS, WARNING_COLOR } from "../../resources/constants";

export const RECEDED_OPACITY = 0.15;
export const FOCUS_FADE = `${FOCUS_FADE_MS}ms ease`;

interface TopologyLinkWidgetProps {
    link: TopologyLinkModel;
    engine: DiagramEngine;
}

const ARROW_SIZE = 8;
const LOCK_RADIUS = 10;
const DASH: Record<TopologyLinkModel["kind"], string | undefined> = { trigger: undefined, event: "2 4", delegation: "6 5" };

type LockHover = Pick<React.SVGAttributes<SVGGElement>, "onMouseEnter" | "onMouseLeave">;

// The lock a gated hand-off wears, at the pill point of the link's final run; the legend draws the same mark.
// It keeps its own colours when the edge lights up, and its whole face answers the hover, not just the ring.
export function LockChip({ at, ...hover }: { at: { x: number; y: number } } & LockHover) {
    return (
        <g transform={`translate(${at.x}, ${at.y})`} pointerEvents="all" style={{ transition: `opacity ${FOCUS_FADE}` }} {...hover}>
            <circle r={LOCK_RADIUS} fill={ThemeColors.SURFACE} stroke={WARNING_COLOR} strokeWidth={1.5} />
            <rect x={-3.5} y={-1} width={7} height={5.5} rx={1} fill={ThemeColors.ON_SURFACE} />
            <path d="M -2 -1 V -2.5 A 2 2 0 0 1 2 -2.5 V -1" fill="none" stroke={ThemeColors.ON_SURFACE} strokeWidth={1.2} />
        </g>
    );
}

// The lock's popover, in the card popover's grammar: "Released by Finance".
function lockRows(gatedBy: string[]): PopoverRow[] {
    return gatedBy.length
        ? [{ key: "released", prefix: "Released by", label: gatedBy.map(roleLabel).join(", ") }]
        : [{ key: "released", label: "Released by a person", muted: true }];
}

export function TopologyLinkWidget({ link, engine }: TopologyLinkWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [lockAnchor, setLockAnchor] = useState<DOMRect>();
    const { focus } = useTopologyContext();
    const focused = focus?.edges.has(link.edgeId) ?? false;
    // An event edge keeps its purple when lit: the rest receding is enough, and blue would read as a run.
    const lit = isHovered || focused;
    const color = link.kind === "event" ? EVENT_COLOR : lit ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE;
    const opacity = focus && !focused ? RECEDED_OPACITY : 1;

    const route = linkRoute(link);
    const path = roundedPath(route.points);
    const markerId = `${link.getID()}-arrow`;

    return (
        <g pointerEvents="stroke" style={{ opacity, transition: `opacity ${FOCUS_FADE}` }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
            <path
                id={link.getID()}
                d={path}
                fill="none"
                style={{ stroke: color, transition: `stroke ${FOCUS_FADE}` }}
                strokeWidth={1.5}
                strokeDasharray={DASH[link.kind]}
                markerEnd={`url(#${markerId})`}
            />
            {link.gated && (
                <LockChip
                    at={route.pillPoint}
                    onMouseEnter={(event) => setLockAnchor(event.currentTarget.getBoundingClientRect())}
                    onMouseLeave={() => setLockAnchor(undefined)}
                />
            )}
            {lockAnchor && <CardPopover rows={lockRows(link.gatedBy)} anchor={lockAnchor} zoom={engine.getModel().getZoomLevel() / 100} />}
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
                    <polygon points={`0,0 0,${ARROW_SIZE} ${ARROW_SIZE},${ARROW_SIZE / 2}`} style={{ fill: color, transition: `fill ${FOCUS_FADE}` }} />
                </marker>
            </defs>
        </g>
    );
}
