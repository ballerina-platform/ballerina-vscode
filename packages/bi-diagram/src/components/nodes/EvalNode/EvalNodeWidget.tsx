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
import {
    Button, DefaultLlmIcon, Icon, Item, Menu, MenuItem, Popover, ThemeColors, getAIModuleIcon,
} from "@wso2/ui-toolkit";
import { EvalNodeModel } from "./EvalNodeModel";
import {
    NODE_BORDER_WIDTH, NODE_HEIGHT, NODE_PADDING, NODE_WIDTH,
} from "../../../resources/constants";
import { MoreVertIcon } from "../../../resources/icons";
import { FlowNode } from "../../../utils/types";
import { DiagnosticsPopUp } from "../../DiagnosticsPopUp";
import { nodeHasError } from "../../../utils/node";
import { BreakpointMenu } from "../../BreakNodeMenu/BreakNodeMenu";
import { getAIColor, ThemeListener } from "../../NodeIcon";
import { useDiagramContext } from "../../DiagramContext";
import {
    DESCRIPTION_HEIGHT,
    DESCRIPTION_LINES, DESCRIPTION_LINE_HEIGHT, DESCRIPTION_MARGIN_Y, ICON_BOX_SIZE,
    HEADER_MARGIN_TOP, HEADER_PADDING_Y, SUBTITLE_LINE_HEIGHT,
    SUBTITLE_MARGIN_TOP, TITLE_HEIGHT, TITLE_SUBTITLE_GAP, ROLE_ROW_GAP, ROLE_ROW_HEIGHT,
    ROLE_SUMMARY_MARGIN_BOTTOM, ROLE_SUMMARY_PADDING, getEvalPresentation,
} from "./evalNodePresentation";

const Node = styled.div<{ readOnly: boolean }>`
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    cursor: ${(props: { readOnly: boolean }) => (props.readOnly ? "default" : "pointer")};
`;

type BoxProps = { hovered: boolean; hasError: boolean; isActiveBreakpoint: boolean; isSelected: boolean };

const Box = styled.div<BoxProps>`
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    width: ${NODE_WIDTH}px;
    min-height: ${NODE_HEIGHT}px;
    padding: 0 ${NODE_PADDING}px;
    border: ${NODE_BORDER_WIDTH}px solid
        ${(props: BoxProps) =>
        props.hasError
            ? ThemeColors.ERROR
            : props.isSelected || props.hovered
                ? ThemeColors.SECONDARY
                : ThemeColors.OUTLINE_VARIANT};
    border-radius: 10px;
    background-color: ${(props: BoxProps) =>
        props.isActiveBreakpoint ? ThemeColors.DEBUGGER_BREAKPOINT_BACKGROUND : ThemeColors.SURFACE_DIM};
    color: ${ThemeColors.ON_SURFACE};
    transition: border-color 0.4s ease-out;
`;

const Column = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    height: 100%;
    overflow: hidden;
`;

const HeaderRow = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
    z-index: 2;
`;

const IconBox = styled.div`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 4px;
`;

const Header = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: ${TITLE_SUBTITLE_GAP}px;
    flex: 1;
    min-width: 0;
    padding: ${HEADER_PADDING_Y}px;
    margin-top: ${HEADER_MARGIN_TOP}px;
`;

const Title = styled.div`
    font-size: 14px;
    height: ${TITLE_HEIGHT}px;
    font-family: "GilmerMedium";
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Subtitle = styled.div`
    width: 100%;
    font-size: 12px;
    line-height: ${SUBTITLE_LINE_HEIGHT}px;
    margin-top: ${SUBTITLE_MARGIN_TOP}px;
    font-family: "GilmerRegular";
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
`;

const JudgeBadge = styled.span`
    flex-shrink: 0;
    margin-right: 4px;
    padding: 2px 6px;
    border-radius: 3px;
    background-color: ${ThemeColors.SECONDARY_CONTAINER};
    color: ${ThemeColors.ON_SURFACE};
    font-family: "GilmerMedium";
    font-size: 9px;
    letter-spacing: 0.02em;
`;

const Divider = styled.div`
    width: 100%;
    border-top: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
`;

const Description = styled.div`
    width: 100%;
    margin: ${DESCRIPTION_MARGIN_Y}px 0;
    padding: 0 4px;
    height: ${DESCRIPTION_HEIGHT}px;
    font-size: 12px;
    line-height: ${DESCRIPTION_LINE_HEIGHT}px;
    font-family: "GilmerRegular";
    color: ${ThemeColors.ON_SURFACE};
    opacity: 0.7;
    display: -webkit-box;
    -webkit-line-clamp: ${DESCRIPTION_LINES};
    -webkit-box-orient: vertical;
    overflow: hidden;
    z-index: 2;
`;

const RoleSummary = styled.div`
    display: flex;
    flex-direction: column;
    gap: ${ROLE_ROW_GAP}px;
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 ${ROLE_SUMMARY_MARGIN_BOTTOM}px;
    padding: ${ROLE_SUMMARY_PADDING}px;
    border: 1px dashed ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 4px;
    z-index: 2;
`;

const RoleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: ${ROLE_ROW_HEIGHT}px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
`;

const RoleDetails = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
`;

const RoleLabel = styled.div`
    color: ${ThemeColors.ON_SURFACE};
    font-family: "GilmerMedium";
    font-size: 10px;
    line-height: 12px;
    margin-bottom: 3px;
    opacity: 0.65;
`;

const RoleValue = styled.div`
    display: block;
    width: 100%;
    min-width: 0;
    font-family: monospace;
    font-size: 11px;
    line-height: 15px;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const MenuButton = styled(Button)`
    border-radius: 5px;
`;

const TopPortWidget = styled(PortWidget)`
    margin-top: -3px;
    z-index: 2;
`;

const BottomPortWidget = styled(PortWidget)`
    margin-bottom: -2px;
    z-index: 2;
`;

interface EvalNodeWidgetProps {
    model: EvalNodeModel;
    engine: DiagramEngine;
    onClick?: (node: FlowNode) => void;
}

export function EvalNodeWidget(props: EvalNodeWidgetProps) {
    const { model, engine, onClick } = props;
    const node = model.node;
    const { onNodeSelect, goToSource, onDeleteNode, addBreakpoint, removeBreakpoint, readOnly, selectedNodeId } =
        useDiagramContext();
    const [isBoxHovered, setIsBoxHovered] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement | null>(null);
    const [menuButtonElement, setMenuButtonElement] = useState<HTMLElement | null>(null);
    const [aiColor, setAiColor] = useState(() => getAIColor());
    const isSelected = selectedNodeId === node.id;
    const isMenuOpen = Boolean(anchorEl);
    const hasBreakpoint = model.hasBreakpoint();
    const isActiveBreakpoint = model.isActiveBreakpoint();
    const handleThemeChange = () => setAiColor(getAIColor());
    const presentation = getEvalPresentation(node);
    const hasError = nodeHasError(node);

    const onNodeClick = () => {
        onClick?.(node);
        onNodeSelect?.(node);
        setAnchorEl(null);
    };

    const handleOnClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (readOnly) {
            return;
        }
        if (event.metaKey) {
            onGoToSource();
        } else {
            onNodeClick();
        }
    };

    const onGoToSource = () => {
        goToSource?.(node);
        setAnchorEl(null);
    };

    const handleOnMenuClick = (event: React.MouseEvent<HTMLElement | SVGSVGElement>) => {
        if (readOnly) {
            return;
        }
        event.stopPropagation();
        setAnchorEl(event.currentTarget);
    };

    const menuItems: Item[] = [
        { id: "edit", label: "Edit", onClick: () => onNodeClick() },
        { id: "goToSource", label: "Source", onClick: () => onGoToSource() },
        { id: "delete", label: "Delete", onClick: () => { onDeleteNode?.(node); setAnchorEl(null); } },
    ];

    return (
        <Node data-testid="eval-node" readOnly={readOnly}>
            <Box
                hovered={isBoxHovered}
                hasError={hasError}
                isActiveBreakpoint={isActiveBreakpoint}
                isSelected={isSelected}
                onMouseEnter={() => setIsBoxHovered(true)}
                onMouseLeave={() => setIsBoxHovered(false)}
                onClick={!readOnly ? handleOnClick : undefined}
                onContextMenu={
                    !readOnly
                        ? (event: React.MouseEvent<HTMLDivElement>) => {
                            event.preventDefault();
                            setAnchorEl(menuButtonElement || event.currentTarget);
                        }
                        : undefined
                }
                title="Configure evaluation"
            >
                {hasBreakpoint && (
                    <div
                        data-testid={
                            isActiveBreakpoint ? "breakpoint-indicator-diagram-active" : "breakpoint-indicator-diagram"
                        }
                        style={{
                            position: "absolute",
                            left: -5,
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            backgroundColor: "red",
                            zIndex: 2,
                        }}
                    />
                )}
                <TopPortWidget port={model.getPort("in")!} engine={engine} />
                <Column style={{ height: `${node.viewState?.ch}px` }}>
                    <HeaderRow>
                        <IconBox>
                            <Icon
                                name={presentation.icon.name}
                                isCodicon
                                iconSx={{ fontSize: `${presentation.icon.size}px` }}
                                sx={{
                                    width: ICON_BOX_SIZE,
                                    height: ICON_BOX_SIZE,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: ThemeColors.PRIMARY,
                                }}
                            />
                        </IconBox>
                        <Header>
                            <Title>AI evaluation</Title>
                            <Subtitle title={presentation.subtitle}>{presentation.subtitle}</Subtitle>
                        </Header>
                        <HeaderActions>
                            {presentation.judgeModel && <JudgeBadge>LLM-as-judge</JudgeBadge>}
                            {hasError && <DiagnosticsPopUp node={node} />}
                            <MenuButton
                                ref={setMenuButtonElement}
                                buttonSx={readOnly ? { cursor: "not-allowed" } : {}}
                                appearance="icon"
                                onClick={handleOnMenuClick}
                            >
                                <MoreVertIcon />
                            </MenuButton>
                        </HeaderActions>
                    </HeaderRow>
                    <Popover
                        open={isMenuOpen}
                        anchorEl={anchorEl}
                        handleClose={() => { setAnchorEl(null); setIsBoxHovered(false); }}
                        sx={{ padding: 0, borderRadius: 0 }}
                    >
                        <Menu>
                            <>
                                {menuItems.map((item) => (
                                    <MenuItem key={item.id} item={item} />
                                ))}
                                <BreakpointMenu
                                    hasBreakpoint={hasBreakpoint}
                                    onAddBreakpoint={() => { addBreakpoint?.(node); setAnchorEl(null); }}
                                    onRemoveBreakpoint={() => { removeBreakpoint?.(node); setAnchorEl(null); }}
                                />
                            </>
                        </Menu>
                    </Popover>

                    {presentation.description && (
                        <>
                            <Divider />
                            <Description title={presentation.description}>{presentation.description}</Description>
                        </>
                    )}

                    {(presentation.agentName || presentation.judgeModel) && (
                        <RoleSummary>
                            {presentation.agentName && (
                                <RoleRow>
                                    <Icon
                                        name="bi-ai-agent"
                                        iconSx={{ fontSize: "20px" }}
                                        sx={{ width: 20, height: 20, color: aiColor }}
                                    />
                                    <RoleDetails>
                                        <RoleLabel>Target agent</RoleLabel>
                                        <RoleValue title={presentation.agentName}>{presentation.agentName}</RoleValue>
                                    </RoleDetails>
                                </RoleRow>
                            )}
                            {presentation.judgeModel && (
                                <RoleRow>
                                    {presentation.judgeModel.isDefault ? (
                                        <Icon name="bi-wso2" sx={{ fontSize: 20, width: 20, height: 20 }} />
                                    ) : (
                                        getAIModuleIcon(presentation.judgeModel.type, 20)
                                        ?? (presentation.judgeModel.iconUrl
                                            ? <img src={presentation.judgeModel.iconUrl} style={{ width: 20, height: 20 }} alt="" />
                                            : <DefaultLlmIcon size={20} />)
                                    )}
                                    <RoleDetails>
                                        <RoleLabel>Judge model</RoleLabel>
                                        <RoleValue title={presentation.judgeModel.label}>
                                            {presentation.judgeModel.label}
                                        </RoleValue>
                                    </RoleDetails>
                                </RoleRow>
                            )}
                        </RoleSummary>
                    )}
                </Column>
                <BottomPortWidget port={model.getPort("out")!} engine={engine} />
            </Box>
            <ThemeListener onThemeChange={handleThemeChange} />
        </Node>
    );
}
