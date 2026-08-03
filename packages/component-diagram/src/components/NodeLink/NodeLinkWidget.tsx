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
                strokeWidth={1.5}
                strokeDasharray={link.broken ? "5 5" : undefined}
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
