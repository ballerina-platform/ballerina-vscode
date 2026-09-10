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
import { ThemeColors } from "@wso2/ui-toolkit";
import { ServiceNodeModel, rowPortName } from "./ServiceNodeModel";
import {
    ENTRY_CARD_WIDTH,
    ENTRY_FOOTER_HEIGHT,
    ENTRY_HEADER_HEIGHT,
    ENTRY_ROW_HEIGHT,
    FOCUS_FADE_MS,
    NODE_BORDER_WIDTH,
} from "../../../resources/constants";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";
import { TopologyHandler } from "../../AgentTopologyDiagram/types";
import { useClickWithDragTolerance } from "../../../hooks/useClickWithDragTolerance";
import { rowCrossOffset } from "../../AgentTopologyDiagram/topologyLayout";
import { TriggerGlyph } from "../../AgentTopologyDiagram/TriggerGlyph";

const Card = styled.div<{ receded: boolean }>`
    width: ${ENTRY_CARD_WIDTH}px;
    box-sizing: border-box;
    border-radius: 10px;
    border: ${NODE_BORDER_WIDTH}px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE_DIM};
    opacity: ${(props) => (props.receded ? 0.3 : 1)};
    transition: opacity ${FOCUS_FADE_MS}ms ease;
    overflow: hidden;
    position: relative;
`;

const Header = styled.div<{ hovered: boolean; clickable: boolean }>`
    height: ${ENTRY_HEADER_HEIGHT}px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    cursor: ${(props) => (props.clickable ? "pointer" : "default")};
    background-color: ${(props) => (props.hovered ? ThemeColors.SURFACE_BRIGHT : "transparent")};
    transition: background-color 0.15s ease;
`;

const Titles = styled.div`
    min-width: 0;
    flex: 1;
`;

const Title = styled.div<{ hovered: boolean }>`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13.5px;
    line-height: 18px;
    color: ${(props) => (props.hovered ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE)};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Subtitle = styled.div`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    line-height: 15px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RowBox = styled.div<{ hovered: boolean; dimmed: boolean }>`
    height: ${ENTRY_ROW_HEIGHT}px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 12px;
    cursor: pointer;
    position: relative;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    opacity: ${(props) => (props.dimmed ? 0.3 : 1)};
    background-color: ${(props) => (props.hovered ? ThemeColors.SURFACE_BRIGHT : "transparent")};
    transition: opacity ${FOCUS_FADE_MS}ms ease, background-color 0.15s ease;
`;

const Accessor = styled.span`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 9.5px;
    letter-spacing: 0.04em;
    color: ${ThemeColors.ON_SURFACE};
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 3px;
    padding: 1px 5px;
    flex: none;
`;

const RowLabel = styled.span<{ hovered: boolean }>`
    min-width: 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12.5px;
    color: ${(props) => (props.hovered ? ThemeColors.PRIMARY : ThemeColors.ON_SURFACE)};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Footer = styled.div`
    height: ${ENTRY_FOOTER_HEIGHT}px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    font-family: "GilmerRegular";
    font-size: 11.5px;
    color: ${ThemeColors.PRIMARY};
    cursor: pointer;
`;

// Left to right a port sits on the card's right edge level with its row; top to bottom every port sits on the
// bottom edge, spread across the width. The layout offsets each row's edges by the same rule.
const RowPort = styled(PortWidget)<{ offset: number; vertical: boolean }>`
    position: absolute;
    ${(props) => (props.vertical ? `bottom: -6px; left: ${props.offset}px;` : `right: -6px; top: ${props.offset}px;`)}
    transform: ${(props) => (props.vertical ? "translateX(-50%)" : "translateY(-50%)")};
`;

interface ServiceNodeWidgetProps {
    model: ServiceNodeModel;
    engine: DiagramEngine;
}

interface RowProps {
    handler: TopologyHandler;
    dimmed: boolean;
}

function HandlerRow({ handler, dimmed }: RowProps) {
    const { onTriggerSelect, readonly, setHovered } = useTopologyContext();
    const [isHovered, setIsHovered] = useState(false);
    const open = () => onTriggerSelect({ filePath: handler.filePath, position: handler.position, endPosition: handler.endPosition });
    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(open);

    return (
        <RowBox
            hovered={!readonly && isHovered}
            dimmed={dimmed}
            title={`Open ${handler.accessor ? `${handler.accessor} ` : ""}${handler.label}`}
            tabIndex={0}
            onMouseEnter={() => {
                setHovered?.(handler.id);
                setIsHovered(true);
            }}
            onMouseLeave={() => {
                setHovered?.(undefined);
                setIsHovered(false);
            }}
            onMouseDown={!readonly ? handleMouseDown : undefined}
            onMouseUp={!readonly ? handleMouseUp : undefined}
            onKeyDown={(event) => {
                if (!readonly && (event.key === "Enter" || event.key === " ")) {
                    open();
                }
            }}
        >
            {handler.accessor && <Accessor>{handler.accessor}</Accessor>}
            <RowLabel hovered={!readonly && isHovered}>{handler.label}</RowLabel>
        </RowBox>
    );
}

export function ServiceNodeWidget(props: ServiceNodeWidgetProps) {
    const { model, engine } = props;
    const { onTriggerSelect, readonly, orientation, focus, setHovered, visibleRows, onExpandEntry } = useTopologyContext();
    const vertical = orientation === "vertical";
    const [headerHovered, setHeaderHovered] = useState(false);
    const entry = model.node;
    const shown = Math.min(visibleRows?.[entry.id] ?? entry.handlers.length, entry.handlers.length);
    const hidden = entry.handlers.length - shown;
    const rows = entry.handlers.slice(0, shown);
    const isService = entry.kind === "service";

    // An automation is a single handler with no rows, so its card opens that handler; a service card opens the
    // service itself and leaves its handlers to the rows.
    const target = isService ? entry : entry.handlers[0];
    const openHeader = () => onTriggerSelect({ filePath: target.filePath, position: target.position, endPosition: target.endPosition });
    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(openHeader);

    const receded = focus !== undefined && !focus.nodes.has(entry.id);
    const rowDimmed = (handler: TopologyHandler): boolean =>
        focus !== undefined && focus.nodes.has(entry.id) && !focus.nodes.has(handler.id);

    return (
        <Card receded={receded}>
            <Header
                hovered={!readonly && headerHovered}
                clickable={!readonly}
                title={isService ? `Open ${entry.title}` : "Open main"}
                tabIndex={0}
                onMouseEnter={() => {
                    setHovered?.(entry.id);
                    setHeaderHovered(true);
                }}
                onMouseLeave={() => {
                    setHovered?.(undefined);
                    setHeaderHovered(false);
                }}
                onMouseDown={!readonly ? handleMouseDown : undefined}
                onMouseUp={!readonly ? handleMouseUp : undefined}
                onKeyDown={(event) => {
                    if (!readonly && (event.key === "Enter" || event.key === " ")) {
                        openHeader();
                    }
                }}
            >
                <TriggerGlyph glyphType={entry.glyphType} icon={entry.icon} size={22} />
                <Titles>
                    <Title hovered={!readonly && headerHovered}>{entry.title}</Title>
                    <Subtitle>{entry.subtitle}</Subtitle>
                </Titles>
            </Header>
            {isService &&
                rows.map((handler) => <HandlerRow key={handler.id} handler={handler} dimmed={rowDimmed(handler)} />)}
            {hidden > 0 && <Footer onClick={() => onExpandEntry?.(entry.id)}>{`Show ${hidden} more`}</Footer>}
            {isService &&
                rows.map((handler, index) => (
                    <RowPort
                        key={`port-${handler.id}`}
                        port={model.getPort(rowPortName(handler.id))!}
                        engine={engine}
                        offset={rowCrossOffset(index, rows.length, vertical)}
                        vertical={vertical}
                    />
                ))}
            <RowPort port={model.getOutPort()!} engine={engine} offset={vertical ? ENTRY_CARD_WIDTH / 2 : ENTRY_HEADER_HEIGHT / 2} vertical={vertical} />
        </Card>
    );
}
