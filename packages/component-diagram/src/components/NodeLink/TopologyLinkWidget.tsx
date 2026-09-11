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
import { FOCUS_FADE_MS } from "../../resources/constants";

export const RECEDED_OPACITY = 0.15;
export const FOCUS_FADE = `${FOCUS_FADE_MS}ms ease`;

interface TopologyLinkWidgetProps {
    link: TopologyLinkModel;
    engine: DiagramEngine;
}

const ARROW_SIZE = 8;

export function TopologyLinkWidget({ link }: TopologyLinkWidgetProps) {
    const [isHovered, setIsHovered] = useState(false);
    const { focus } = useTopologyContext();
    const focused = focus?.edges.has(link.edgeId) ?? false;
    const color = isHovered || focused ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE;
    const opacity = focus && !focused ? RECEDED_OPACITY : 1;

    const path = roundedPath(linkRoute(link).points);
    const markerId = `${link.getID()}-arrow`;

    // Hit-test the stroke only: a back edge that wraps around the cards encloses them, and "all" would let that interior swallow their clicks.
    return (
        <g pointerEvents="stroke" style={{ opacity, transition: `opacity ${FOCUS_FADE}` }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <path d={path} fill="none" stroke="transparent" strokeWidth={16} />
            <path
                id={link.getID()}
                d={path}
                fill="none"
                style={{ stroke: color, transition: `stroke ${FOCUS_FADE}` }}
                strokeWidth={1.5}
                strokeDasharray={link.dashed ? "6 5" : undefined}
                markerEnd={`url(#${markerId})`}
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
                    <polygon points={`0,0 0,${ARROW_SIZE} ${ARROW_SIZE},${ARROW_SIZE / 2}`} style={{ fill: color, transition: `fill ${FOCUS_FADE}` }} />
                </marker>
            </defs>
        </g>
    );
}
