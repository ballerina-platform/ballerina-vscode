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

import React from "react";
import styled from "@emotion/styled";
import { ThemeColors } from "@wso2/ui-toolkit";
import { FOCUS_FADE_MS, SPLIT_SIZE } from "../../resources/constants";
import { useTopologyContext } from "../AgentTopologyDiagram/TopologyContext";

// The flow diagram's loop container: a dashed rounded box around the body, with the loop node on its border.
const Box = styled.div<{ receded: boolean }>`
    position: absolute;
    box-sizing: border-box;
    border: 1.5px dashed ${ThemeColors.ON_SURFACE_VARIANT};
    border-radius: 10px;
    opacity: ${(props) => (props.receded ? 0.55 : 1)};
    transition: opacity ${FOCUS_FADE_MS}ms ease;
`;

// Top-left of the box; below the loop node when the node sits on the top border.
const Caption = styled.div<{ vertical: boolean }>`
    position: absolute;
    top: ${(props) => (props.vertical ? SPLIT_SIZE / 2 + 6 : 6)}px;
    left: 10px;
    right: 10px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-family: "GilmerRegular";
    font-size: 11px;
    line-height: 14px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
`;

const Header = styled.span`
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE};
`;

export function LoopBoxLayerWidget() {
    const { focus, orientation, loopBoxes } = useTopologyContext();
    return (
        <>
            {(loopBoxes ?? []).map(({ id, box, label, header }) => (
                <Box
                    key={id}
                    receded={focus !== undefined && !focus.nodes.has(id)}
                    style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
                >
                    <Caption vertical={orientation === "vertical"}>
                        <span>{label}</span>
                        {header && <Header>{header}</Header>}
                    </Caption>
                </Box>
            ))}
        </>
    );
}
