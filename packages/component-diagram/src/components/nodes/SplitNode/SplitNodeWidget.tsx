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
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { ThemeColors } from "@wso2/ui-toolkit";
import { SplitNodeModel } from "./SplitNodeModel";
import { FOCUS_FADE_MS, SPLIT_SIZE } from "../../../resources/constants";
import { SplitGlyph } from "../../AgentTopologyDiagram/SplitGlyph";
import { SPLIT_LABEL } from "../../AgentTopologyDiagram/types";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";

const Box = styled.div<{ receded: boolean }>`
    opacity: ${(props) => (props.receded ? 0.3 : 1)};
    transition: opacity ${FOCUS_FADE_MS}ms ease;
    position: relative;
    width: ${SPLIT_SIZE}px;
    height: ${SPLIT_SIZE}px;
    display: flex;
    align-items: center;
    justify-content: center;
`;

// Under the glyph when edges leave sideways; beside it when they leave downwards.
const Label = styled.div<{ vertical: boolean }>`
    position: absolute;
    top: ${(props) => (props.vertical ? "50%" : "100%")};
    left: ${(props) => (props.vertical ? "100%" : "50%")};
    transform: ${(props) => (props.vertical ? "translateY(-50%)" : "translateX(-50%)")};
    margin-top: ${(props) => (props.vertical ? 0 : 4)}px;
    margin-left: ${(props) => (props.vertical ? 6 : 0)}px;
    display: flex;
    flex-direction: column;
    align-items: ${(props) => (props.vertical ? "flex-start" : "center")};
    font-family: "GilmerRegular";
    font-size: 11px;
    line-height: 14px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    pointer-events: none;
`;

const Header = styled.div`
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE};
`;

const LeftPortWidget = styled(PortWidget)`
    position: absolute;
    left: -4px;
    top: 50%;
    transform: translateY(-50%);
`;

const RightPortWidget = styled(PortWidget)`
    position: absolute;
    right: -4px;
    top: 50%;
    transform: translateY(-50%);
`;

const TopPortWidget = styled(PortWidget)`
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
`;

const BottomPortWidget = styled(PortWidget)`
    position: absolute;
    bottom: -4px;
    left: 50%;
    transform: translateX(-50%);
`;


interface SplitNodeWidgetProps {
    model: SplitNodeModel;
    engine: DiagramEngine;
}

export function SplitNodeWidget({ model, engine }: SplitNodeWidgetProps) {
    const { orientation, focus, loopBoxes } = useTopologyContext();
    const vertical = orientation === "vertical";
    const InPort = vertical ? TopPortWidget : LeftPortWidget;
    const OutPort = vertical ? BottomPortWidget : RightPortWidget;
    // A boxed loop's caption names it; the node keeps only the glyph.
    const boxed = loopBoxes?.some((view) => view.id === model.getID()) ?? false;
    return (
        <Box receded={focus !== undefined && !focus.nodes.has(model.getID())} title={[SPLIT_LABEL[model.node.kind], model.node.header].filter(Boolean).join(" · ")}>
            <InPort port={model.getInPort()} engine={engine} />
            <OutPort port={model.getOutPort()} engine={engine} />
            <SplitGlyph kind={model.node.kind} size={SPLIT_SIZE} />
            {!boxed && (
                <Label vertical={vertical}>
                    {SPLIT_LABEL[model.node.kind]}
                    {model.node.header && <Header>{model.node.header}</Header>}
                </Label>
            )}
        </Box>
    );
}
