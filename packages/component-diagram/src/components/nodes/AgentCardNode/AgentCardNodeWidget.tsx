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
import { NodeIcon } from "@wso2/bi-diagram";
import { resolveBrandIconFromUrl } from "@wso2/ballerina-core";
import { AgentCardNodeModel } from "./AgentCardNodeModel";
import { AGENT_CARD_WIDTH, NODE_BORDER_WIDTH } from "../../../resources/constants";
import { useTopologyContext } from "../../AgentTopologyDiagram/TopologyContext";
import { useClickWithDragTolerance } from "../../../hooks/useClickWithDragTolerance";
import { ToolChip } from "../../AgentTopologyDiagram/types";

const WARNING_COLOR = "var(--vscode-editorWarning-foreground, #cca700)";
const CHIP_SIZE = 22;
const CHIP_ICON_SIZE = 14;

const Card = styled.div<{ hovered: boolean; orphan: boolean; readonly?: boolean }>`
    display: flex;
    flex-direction: column;
    width: ${AGENT_CARD_WIDTH}px;
    box-sizing: border-box;
    padding: 14px 16px 12px;
    gap: 2px;
    border-radius: 10px;
    border-width: ${NODE_BORDER_WIDTH}px;
    border-style: ${(props) => (props.orphan ? "dashed" : "solid")};
    border-color: ${(props) => (props.hovered ? ThemeColors.SECONDARY : props.orphan ? WARNING_COLOR : ThemeColors.OUTLINE_VARIANT)};
    background-color: ${ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    cursor: ${(props) => (props.readonly ? "default" : "pointer")};
    position: relative;
    transition: border-color 0.2s ease-out;

    &:focus-visible {
        outline: 2px solid ${ThemeColors.HIGHLIGHT};
        outline-offset: 2px;
    }
`;

const HeaderRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
`;

const HeaderText = styled.div`
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
`;

const Name = styled.div`
    font-family: "GilmerMedium";
    font-size: 14px;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Role = styled.div`
    font-family: "GilmerRegular";
    font-size: 12px;
    line-height: 16px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Footer = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    min-height: ${CHIP_SIZE}px;
`;

const ChipRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
`;

const Chip = styled.div`
    width: ${CHIP_SIZE}px;
    height: ${CHIP_SIZE}px;
    box-sizing: border-box;
    border-radius: 6px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: none;

    img {
        width: ${CHIP_ICON_SIZE}px;
        height: ${CHIP_ICON_SIZE}px;
        object-fit: contain;
    }
`;

const ToolCount = styled.div`
    font-family: monospace;
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin-left: auto;
    white-space: nowrap;
`;

const OrphanFooter = styled.div`
    margin-top: 10px;
    font-size: 11px;
    color: ${WARNING_COLOR};
    font-family: "GilmerRegular";

    u {
        cursor: pointer;
        outline: none;
    }
    u:focus-visible {
        outline: 1px solid ${WARNING_COLOR};
        outline-offset: 2px;
    }
`;

const OpenHint = styled.div`
    position: absolute;
    top: 10px;
    right: 12px;
    font-size: 11px;
    color: ${ThemeColors.SECONDARY};
`;

const TypedBadge = styled.span`
    display: inline-flex;
    align-items: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    flex: none;
`;

const LeftPortWidget = styled(PortWidget)`
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
`;

const RightPortWidget = styled(PortWidget)`
    position: absolute;
    right: -6px;
    top: 50%;
    transform: translateY(-50%);
`;

const TopPortWidget = styled(PortWidget)`
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
`;

const BottomPortWidget = styled(PortWidget)`
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
`;

function chipGlyph(chip: ToolChip): React.ReactNode {
    const url = chip.icon ?? "";
    const iconSx = { width: CHIP_ICON_SIZE, height: CHIP_ICON_SIZE, fontSize: CHIP_ICON_SIZE };
    if (url.includes("ballerina_http_")) {
        return <Icon name="bi-globe" sx={iconSx} iconSx={{ fontSize: CHIP_ICON_SIZE }} />;
    }
    if (url.includes("mcp")) {
        return <Icon name="bi-mcp" sx={iconSx} iconSx={{ fontSize: CHIP_ICON_SIZE }} />;
    }
    const brand = resolveBrandIconFromUrl(url);
    if (brand) {
        const color = brand.color ? { color: brand.color } : {};
        return <Icon name={brand.glyph} sx={{ ...iconSx, ...color }} iconSx={{ fontSize: CHIP_ICON_SIZE, ...color }} />;
    }
    if (url) {
        return <img src={url} alt="" />;
    }
    return <Icon name="bi-connection" sx={iconSx} iconSx={{ fontSize: CHIP_ICON_SIZE }} />;
}

interface AgentCardNodeWidgetProps {
    model: AgentCardNodeModel;
    engine: DiagramEngine;
}

export function AgentCardNodeWidget(props: AgentCardNodeWidgetProps) {
    const { model, engine } = props;
    const { onAgentSelect, onAddTrigger, readonly, orientation } = useTopologyContext();
    const vertical = orientation === "vertical";
    const InPort = vertical ? TopPortWidget : LeftPortWidget;
    const OutPort = vertical ? BottomPortWidget : RightPortWidget;
    const [isHovered, setIsHovered] = useState(false);

    const selection = () => ({
        path: model.node.filePath,
        startLine: model.node.position.line,
        name: model.node.name,
        moduleName: model.node.moduleName,
    });
    const handleClick = () => onAgentSelect(selection());
    const handleAddTrigger = (event: React.SyntheticEvent) => {
        event.stopPropagation();
        (onAddTrigger ?? onAgentSelect)(selection());
    };

    const { handleMouseDown, handleMouseUp } = useClickWithDragTolerance(handleClick);

    const { toolCount } = model.node;
    const toolLabel = toolCount === 0 ? "No tools" : toolCount === 1 ? "1 tool" : `${toolCount} tools`;

    return (
        <Card
            hovered={isHovered}
            orphan={model.node.orphan}
            readonly={readonly}
            tabIndex={0}
            onMouseEnter={() => !readonly && setIsHovered(true)}
            onMouseLeave={() => !readonly && setIsHovered(false)}
            onMouseDown={!readonly ? handleMouseDown : undefined}
            onMouseUp={!readonly ? handleMouseUp : undefined}
            onKeyDown={(event) => {
                if (!readonly && (event.key === "Enter" || event.key === " ")) {
                    handleClick();
                }
            }}
        >
            <InPort port={model.getPort("in")!} engine={engine} />
            <OutPort port={model.getPort("out")!} engine={engine} />
            {isHovered && !readonly && <OpenHint>Open ↗</OpenHint>}
            <HeaderRow>
                <NodeIcon type="AGENT" size={24} />
                <HeaderText>
                    <Name title={model.node.name}>{model.node.name}</Name>
                    <Role title={model.node.role}>{model.node.role || "AI Agent"}</Role>
                </HeaderText>
                {model.node.typed && (
                    <TypedBadge title="Instance of an agent definition">
                        <Icon name="symbol-class" isCodicon={true} sx={{ width: 14, height: 14, fontSize: 14 }} />
                    </TypedBadge>
                )}
            </HeaderRow>
            <Footer>
                <ChipRow>
                    {model.node.chips.map((chip) => (
                        <Chip key={chip.key} title={chip.label}>
                            {chipGlyph(chip)}
                        </Chip>
                    ))}
                </ChipRow>
                <ToolCount>{toolLabel}</ToolCount>
            </Footer>
            {model.node.orphan && (
                <OrphanFooter>
                    No trigger yet ·{" "}
                    <u
                        role="button"
                        tabIndex={readonly ? -1 : 0}
                        onMouseDown={(event) => event.stopPropagation()}
                        onMouseUp={(event) => event.stopPropagation()}
                        onClick={readonly ? undefined : handleAddTrigger}
                        onKeyDown={(event) => !readonly && (event.key === "Enter" || event.key === " ") && handleAddTrigger(event)}
                    >
                        Add Trigger
                    </u>
                </OrphanFooter>
            )}
        </Card>
    );
}
