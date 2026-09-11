/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

/** @jsxImportSource @emotion/react */
import { useState } from "react";
import { DiagramEngine } from "@projectstorm/react-diagrams";
import { NodeLinkModel } from "./NodeLinkModel";
import { ThemeColors } from "@wso2/ui-toolkit";
import { STRUCTURE_OPACITY } from "../../resources/constants";
interface NodeLinkWidgetProps {
    link: NodeLinkModel;
    engine: DiagramEngine;
}

export const NodeLinkWidget: React.FC<NodeLinkWidgetProps> = ({ link, engine }) => {
    const [isHovered, setIsHovered] = useState(false);

    const linkColor = link.visible
        ? link.broken
            ? ThemeColors.ERROR
            : isHovered
                ? ThemeColors.PRIMARY
                : ThemeColors.ON_SURFACE
        : "transparent";

    // Resting links dim ON_SURFACE via stroke-opacity rather than switching to a border token
    // (e.g. OUTLINE_VARIANT) - the same de-emphasis technique this package already uses for node
    // subtitles (see Description in EntryNode/components/styles.ts). A border token only has to
    // read against an adjacent filled surface, which some dark themes render close enough to the
    // canvas background to make a link spanning open (dotted) canvas nearly invisible. Dimming
    // the same foreground/background pair VS Code already keeps at a legible contrast for body
    // text keeps that guarantee in both themes. STRUCTURE_OPACITY is shared with NODE_BORDER_COLOR
    // (constants.ts) so a node's resting border dims by the same amount - links and borders read
    // as one consistent line style instead of two unrelated ones. Hover and broken states stay at
    // full opacity for clear, deliberate feedback.
    const isResting = link.visible && !link.broken && !isHovered;
    const linkOpacity = isResting ? STRUCTURE_OPACITY : 1;

    return (
        <g pointerEvents={"all"} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <path
                id={link.getID() + "-bg"}
                d={link.getSVGPath()}
                fill={"none"}
                stroke={"transparent"}
                strokeWidth={16}
            />
            <path
                id={link.getID()}
                d={link.getSVGPath()}
                fill={"none"}
                stroke={linkColor}
                strokeOpacity={linkOpacity}
                strokeWidth={1.5}
                strokeDasharray={link.broken || link.dashed ? "5 5" : undefined}
            />

            <defs>
                <marker
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    viewBox="0 0 8 8"
                    orient="auto"
                    id={`${link.getID()}-arrow-head-old`}
                >
                    <polygon points="0,8 0,0 6,4" fill={linkColor}></polygon>
                </marker>
            </defs>
            <defs>
                <marker
                    markerWidth="10"
                    markerHeight="10"
                    refX="5"
                    refY="5"
                    viewBox="0 0 10 10"
                    orient="auto"
                    id={`${link.getID()}-arrow-head`}
                >
                    <polyline
                        points="0,5 5,2.5 2,0"
                        fill="none"
                        strokeWidth="1.5"
                        stroke={linkColor}
                        strokeLinecap="round"
                        transform="matrix(1,0,0,1,1.5,2.5)"
                        strokeLinejoin="round"
                    ></polyline>
                </marker>
            </defs>
        </g>
    );
};
