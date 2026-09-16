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
import { Button, Item, Menu, MenuItem, Popover, ThemeColors } from "@wso2/ui-toolkit";
import { MoreVertIcon } from "../../../resources/icons/nodes/MoreVertIcon";
import { ServiceNodeModel, rowPortName } from "./ServiceNodeModel";
import {
    ENTRY_CARD_WIDTH,
    ENTRY_FOOTER_HEIGHT,
    ENTRY_HEADER_HEIGHT,
    ENTRY_ROW_HEIGHT,
    FOCUS_FADE_MS,
    NODE_BG_HOVER_COLOR,
    NODE_BORDER_COLOR,
    NODE_BORDER_WIDTH,
} from "../../../resources/constants";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";
import { EntrySelection, TopologyEntryNode, TopologyHandler } from "../../AgentTopologyDiagram/types";
import { useOpenableNode } from "../../AgentTopologyDiagram/useOpenableNode";
import { rowPortOffset } from "../../AgentTopologyDiagram/topologyLayout";
import { TriggerGlyph } from "../../AgentTopologyDiagram/TriggerGlyph";
import { colors as methodColors } from "../EntryNode/components/styles";

// Same palette as the Service Designer's resource list, so a method pill reads the same everywhere.
const DEFAULT_METHOD_COLOR = "#876036";
const methodColor = (accessor: string) => methodColors[accessor?.toUpperCase() as keyof typeof methodColors] ?? DEFAULT_METHOD_COLOR;

const Card = styled.div<{ receded: boolean }>`
    width: ${ENTRY_CARD_WIDTH}px;
    box-sizing: border-box;
    border-radius: 10px;
    border: ${NODE_BORDER_WIDTH}px solid ${NODE_BORDER_COLOR};
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
    padding: 0 8px 0 12px;
    cursor: ${(props) => (props.clickable ? "pointer" : "default")};
    background-color: ${(props) => (props.hovered ? NODE_BG_HOVER_COLOR : "transparent")};
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
    background-color: ${(props) => (props.hovered ? NODE_BG_HOVER_COLOR : "transparent")};
    transition: opacity ${FOCUS_FADE_MS}ms ease, background-color 0.15s ease;
`;

const Accessor = styled.span<{ method: string }>`
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 9.5px;
    letter-spacing: 0.04em;
    color: #fff;
    background-color: ${(props) => methodColor(props.method)};
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
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    cursor: pointer;
    transition: color 0.15s ease, background-color 0.15s ease;
    &:hover {
        color: ${ThemeColors.PRIMARY};
        background-color: ${NODE_BG_HOVER_COLOR};
    }
`;

const RowPort = styled(PortWidget)<{ offset: number }>`
    position: absolute;
    right: -6px;
    top: ${(props) => props.offset}px;
    transform: translateY(-50%);
`;

// The card's own port, for the rows folded away: level with the header left to right, the bottom edge's centre top to bottom.
const CardPort = styled(PortWidget)<{ vertical: boolean }>`
    position: absolute;
    ${(props) => (props.vertical ? `bottom: -6px; left: ${ENTRY_CARD_WIDTH / 2}px;` : `right: -6px; top: ${ENTRY_HEADER_HEIGHT / 2}px;`)}
    transform: ${(props) => (props.vertical ? "translateX(-50%)" : "translateY(-50%)")};
`;

const MenuButton = styled(Button)`
    flex: none;
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
    const open = () => onTriggerSelect({ filePath: handler.filePath, position: handler.position, endPosition: handler.endPosition });
    const { hovered, handlers } = useOpenableNode(open, {
        readonly,
        onHoverChange: (isHovered) => setHovered?.(isHovered ? handler.id : undefined),
    });

    return (
        <RowBox
            hovered={hovered}
            dimmed={dimmed}
            title={`Open ${handler.accessor ? `${handler.accessor} ` : ""}${handler.label}`}
            {...handlers}
        >
            {handler.accessor && <Accessor method={handler.accessor}>{handler.accessor}</Accessor>}
            <RowLabel hovered={hovered}>{handler.label}</RowLabel>
        </RowBox>
    );
}

function footerLabel(hidden: number, unfolded: boolean | undefined): string | undefined {
    if (hidden > 0) {
        return `Show ${hidden} more`;
    }
    return unfolded ? "Show fewer" : undefined;
}

function entrySelection(entry: TopologyEntryNode): EntrySelection {
    return {
        filePath: entry.filePath,
        position: entry.position,
        endPosition: entry.endPosition,
        label: entry.title,
        handlerCount: entry.handlers.length,
    };
}

function useCardMenu(entry: TopologyEntryNode) {
    const { readonly, onConfigureEntry, onDeleteEntry } = useTopologyContext();
    const [anchor, setAnchor] = useState<HTMLElement | SVGSVGElement>(null);
    const enabled = !readonly && Boolean(onConfigureEntry && onDeleteEntry);
    const items: Item[] = enabled
        ? [
              { id: "configure", label: "Configure", onClick: () => onConfigureEntry!(entrySelection(entry)) },
              { id: "delete", label: "Delete", onClick: () => onDeleteEntry!(entrySelection(entry)) },
          ]
        : [];
    return { enabled, anchor, setAnchor, items };
}

type CardMenuState = ReturnType<typeof useCardMenu>;

function CardMenuButton({ menu }: { menu: CardMenuState }) {
    if (!menu.enabled) {
        return null;
    }
    const stop = (event: React.MouseEvent) => event.stopPropagation();

    return (
        <MenuButton
            appearance="icon"
            tooltip="More options"
            onMouseDown={stop}
            onMouseUp={stop}
            onClick={(event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
                event.stopPropagation();
                menu.setAnchor(event.currentTarget);
            }}
        >
            <MoreVertIcon />
        </MenuButton>
    );
}

function CardMenuPopover({ menu }: { menu: CardMenuState }) {
    if (!menu.enabled) {
        return null;
    }
    return (
        <Popover
            open={Boolean(menu.anchor)}
            anchorEl={menu.anchor}
            handleClose={() => menu.setAnchor(null)}
            sx={{ padding: 0, borderRadius: 4 }}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
            <Menu>
                {menu.items.map((item) => (
                    <MenuItem key={item.id} item={item} onClick={() => menu.setAnchor(null)} />
                ))}
            </Menu>
        </Popover>
    );
}

export function ServiceNodeWidget(props: ServiceNodeWidgetProps) {
    const { model, engine } = props;
    const { onTriggerSelect, readonly, orientation, focus, setHovered, visibleRows, unfolded, onToggleEntry } = useTopologyContext();
    const vertical = orientation === "vertical";
    const entry = model.node;
    const shown = Math.min(visibleRows?.[entry.id] ?? entry.handlers.length, entry.handlers.length);
    const hidden = entry.handlers.length - shown;
    const rows = entry.handlers.slice(0, shown);
    const footer = footerLabel(hidden, unfolded?.has(entry.id));
    const isService = entry.kind === "service";

    const target = isService ? entry : entry.handlers[0];
    const openHeader = () => onTriggerSelect({ filePath: target.filePath, position: target.position, endPosition: target.endPosition });
    const { hovered: headerHovered, handlers: headerHandlers } = useOpenableNode(openHeader, {
        readonly,
        onHoverChange: (isHovered) => setHovered?.(isHovered ? entry.id : undefined),
    });

    const receded = focus !== undefined && !focus.nodes.has(entry.id);
    const rowDimmed = (handler: TopologyHandler): boolean =>
        focus !== undefined && focus.nodes.has(entry.id) && !focus.nodes.has(handler.id);
    const menu = useCardMenu(entry);

    return (
        <Card receded={receded}>
            <Header
                hovered={headerHovered}
                clickable={!readonly}
                title={isService ? `Open ${entry.title}` : "Open main"}
                {...headerHandlers}
            >
                <TriggerGlyph glyphType={entry.glyphType} icon={entry.icon} size={22} />
                <Titles>
                    <Title hovered={headerHovered}>{entry.title}</Title>
                    <Subtitle>{entry.subtitle}</Subtitle>
                </Titles>
                {isService && <CardMenuButton menu={menu} />}
            </Header>
            {isService && <CardMenuPopover menu={menu} />}
            {isService &&
                rows.map((handler) => <HandlerRow key={handler.id} handler={handler} dimmed={rowDimmed(handler)} />)}
            {footer && <Footer onClick={() => onToggleEntry?.(entry.id)}>{footer}</Footer>}
            {isService &&
                rows.map((handler, index) => (
                    <RowPort key={`port-${handler.id}`} port={model.getPort(rowPortName(handler.id))!} engine={engine} offset={rowPortOffset(index)} />
                ))}
            <CardPort port={model.getOutPort()!} engine={engine} vertical={vertical} />
        </Card>
    );
}
