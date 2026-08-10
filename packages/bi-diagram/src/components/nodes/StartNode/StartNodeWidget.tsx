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

import React from "react";
import styled from "@emotion/styled";
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { StartNodeModel } from "./StartNodeModel";
import {
    NODE_BG_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_WIDTH,
    NODE_HEIGHT,
    NODE_PADDING,
    NODE_TEXT_COLOR,
    NODE_WIDTH,
} from "../../../resources/constants";
import { FlowNode } from "../../../utils/types";
import { Tooltip } from "@wso2/ui-toolkit";
import { getDiffContainerStyles, getDiffTitleStyles } from "../../../utils/node";
import { useDiagramContext } from "../../DiagramContext";
import { NodeNoteChip } from "../../NodeNoteChip";

export namespace NodeStyles {
    export type NodeStyleProp = {
        selected: boolean;
        hovered: boolean;
    };
    export const Node = styled.div<NodeStyleProp>`
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        width: ${NODE_WIDTH / 3}px;
        min-height: ${NODE_HEIGHT / 1.5}px;
        padding: 0 ${NODE_PADDING}px;
        border: ${NODE_BORDER_WIDTH}px solid ${NODE_BORDER_COLOR};
        border-radius: 40px;
        background-color: ${NODE_BG_COLOR};
        color: ${NODE_TEXT_COLOR};
        cursor: default;
        position: relative;
    `;

    export const TopPortWidget = styled(PortWidget)`
        margin-top: -3px;
    `;

    export const BottomPortWidget = styled(PortWidget)`
        margin-bottom: -2px;
    `;

    export const StyledText = styled.div`
        font-size: 14px;
    `;

    export const Title = styled(StyledText)`
        max-width: ${(NODE_WIDTH / 3) - 12}px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: "GilmerMedium";
    `;

    export const NoteChipWrapper = styled.div`
        position: absolute;
        top: -16px;
        right: -48px;
        display: flex;
        gap: 2px;
    `;
}

interface StartNodeWidgetProps {
    model: StartNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export interface NodeWidgetProps extends Omit<StartNodeWidgetProps, "children"> { }

export function StartNodeWidget(props: StartNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const [isHovered, setIsHovered] = React.useState(false);
    const { nodeComments } = useDiagramContext();
    const noteComments = nodeComments?.get(model.node.id) ?? [];

    return (
        <NodeStyles.Node
            selected={model.isSelected()}
            hovered={isHovered}
            style={getDiffContainerStyles(model.node)}
        // onMouseEnter={() => setIsHovered(true)}
        // onMouseLeave={() => setIsHovered(false)}
        >
            <NodeStyles.TopPortWidget port={model.getPort("in")!} engine={engine} />
            <Tooltip content={model.node.metadata.label || "Start"} containerSx={{ cursor: "default" }}>
                <NodeStyles.Title data-testid="start-node" style={getDiffTitleStyles(model.node)}>
                    {model.node.metadata.label || "Start"}
                </NodeStyles.Title>
            </Tooltip>
            {noteComments.length > 0 && (
                <NodeStyles.NoteChipWrapper>
                    {noteComments.map((comment) => (
                        <NodeNoteChip key={comment.id} commentNode={comment} engine={engine} />
                    ))}
                </NodeStyles.NoteChipWrapper>
            )}
            <NodeStyles.BottomPortWidget port={model.getPort("out")!} engine={engine} />
        </NodeStyles.Node>
    );
}
