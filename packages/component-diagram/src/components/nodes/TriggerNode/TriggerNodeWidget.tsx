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
import { DiagramEngine, PortWidget } from "@projectstorm/react-diagrams-core";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";
import { resolveBrandIcon, resolveEntryTypeGlyph } from "@wso2/ballerina-core";
import { ConnectorIcon } from "@wso2/bi-diagram";
import { TriggerNodeModel } from "./TriggerNodeModel";
import {
    FOCUS_FADE_MS,
    NODE_BORDER_WIDTH,
    TRIGGER_LABEL_GAP,
    TRIGGER_LABEL_WIDTH,
    TRIGGER_NODE_WIDTH,
    TRIGGER_SIZE,
    TRIGGER_STACKED_HEIGHT,
} from "../../../resources/constants";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";
import { LogicBadge } from "../../AgentTopologyDiagram/LogicBadge";
import { useClickWithDragTolerance } from "../../../hooks/useClickWithDragTolerance";

// The label is part of the node box so zoom-to-fit and the layout account for it. It sits left of
// the square when the flow runs left to right and above it when the flow runs top to bottom.
const Wrapper = styled.div<{ readonly?: boolean; vertical: boolean; receded: boolean }>`
    display: flex;
    opacity: ${(props) => (props.receded ? 0.3 : 1)};
    transition: opacity ${FOCUS_FADE_MS}ms ease;
    flex-direction: ${(props) => (props.vertical ? "column" : "row")};
    align-items: center;
    justify-content: ${(props) => (props.vertical ? "flex-end" : "flex-start")};
    gap: ${TRIGGER_LABEL_GAP}px;
    width: ${(props) => (props.vertical ? TRIGGER_LABEL_WIDTH : TRIGGER_NODE_WIDTH)}px;
    height: ${(props) => (props.vertical ? TRIGGER_STACKED_HEIGHT : TRIGGER_SIZE)}px;
    cursor: ${(props) => (props.readonly ? "default" : "pointer")};
    outline: none;
`;

const Square = styled.div<{ hovered: boolean; focused: boolean }>`
    position: relative;
    flex: none;
    width: ${TRIGGER_SIZE}px;
    height: ${TRIGGER_SIZE}px;
    box-sizing: border-box;
    border-radius: 10px;
    border: ${NODE_BORDER_WIDTH}px solid ${(props) => (props.hovered ? ThemeColors.SECONDARY : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s ease-out;
    outline: ${(props) => (props.focused ? `2px solid ${ThemeColors.HIGHLIGHT}` : "none")};
    outline-offset: 2px;
`;

const LabelBlock = styled.div<{ vertical: boolean }>`
    width: ${TRIGGER_LABEL_WIDTH}px;
    min-width: 0;
    text-align: ${(props) => (props.vertical ? "center" : "right")};
`;

const Label1 = styled.div`
    font-family: "GilmerMedium";
    font-size: 14px;
    line-height: 18px;
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

// The badge sits under the labels, on the side they are aligned to.
const LogicRow = styled.div<{ vertical: boolean }>`
    display: flex;
    justify-content: ${(props) => (props.vertical ? "center" : "flex-end")};
    margin-top: 3px;
`;

const Label2 = styled.div`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 16px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RightPortWidget = styled(PortWidget)`
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
`;

const BottomPortWidget = styled(PortWidget)`
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
`;

interface TriggerNodeWidgetProps {
    model: TriggerNodeModel;
    engine: DiagramEngine;
}

// Same order as the focus diagram's usage tile: entry kind, brand glyph, the module's Central icon, then the globe.
export function TriggerGlyph({ glyphType, icon, size = 24 }: { glyphType: string; icon?: string; size?: number }) {
    const sx = { width: size, height: size, fontSize: size, display: "flex", alignItems: "center", justifyContent: "center" };
    const entryGlyph = resolveEntryTypeGlyph(glyphType);
    if (entryGlyph) {
        return <Icon name={entryGlyph.glyph} isCodicon={entryGlyph.isCodicon} sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    }
    const brandGlyph = resolveBrandIcon(glyphType);
    if (brandGlyph) {
        return <Icon name={brandGlyph.glyph} sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    }
    const globe = <Icon name="bi-globe" sx={sx} iconSx={{ fontSize: size, lineHeight: 1 }} />;
    return icon ? <ConnectorIcon url={icon} style={sx} fallbackIcon={globe} /> : globe;
}

export function TriggerNodeWidget(props: TriggerNodeWidgetProps) {
    const { model, engine } = props;
    const { onTriggerSelect, readonly, orientation, focus, setHovered } = useTopologyContext();
    const vertical = orientation === "vertical";
    const OutPort = vertical ? BottomPortWidget : RightPortWidget;
    const [isHovered, setIsHovered] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const handleClick = () => {
        onTriggerSelect({ filePath: model.node.filePath, position: model.node.position, endPosition: model.node.endPosition });
    };

    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(handleClick);
    const tooltip = [model.node.label1, model.node.label2].filter(Boolean).join(" — ");

    return (
        <Wrapper
            readonly={readonly}
            vertical={vertical}
            receded={focus !== undefined && !focus.nodes.has(model.getID())}
            tabIndex={0}
            title={tooltip}
            onMouseEnter={() => {
                setHovered?.(model.getID());
                if (!readonly) {
                    setIsHovered(true);
                }
            }}
            onMouseLeave={() => {
                setHovered?.(undefined);
                if (!readonly) {
                    setIsHovered(false);
                }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onMouseDown={!readonly ? handleMouseDown : undefined}
            onMouseUp={!readonly ? handleMouseUp : undefined}
            onKeyDown={(event) => {
                if (!readonly && (event.key === "Enter" || event.key === " ")) {
                    handleClick();
                }
            }}
        >
            <LabelBlock vertical={vertical}>
                <Label1>{model.node.label1}</Label1>
                {model.node.label2 && <Label2>{model.node.label2}</Label2>}
                {model.node.logic.length > 0 && (
                    <LogicRow vertical={vertical}>
                        <LogicBadge kinds={model.node.logic} constructs={model.node.constructs} />
                    </LogicRow>
                )}
            </LabelBlock>
            <Square hovered={isHovered} focused={isFocused}>
                <TriggerGlyph glyphType={model.node.glyphType} icon={model.node.icon} />
                <OutPort port={model.getPort("out")!} engine={engine} />
            </Square>
        </Wrapper>
    );
}
