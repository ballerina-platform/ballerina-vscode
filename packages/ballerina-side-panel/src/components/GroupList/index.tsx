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

import React, { useState } from "react";
import { Button, Codicon, ThemeColors, Tooltip } from "@wso2/ui-toolkit";
import ReactMarkdown from "react-markdown";
import styled from "@emotion/styled";
import { CallIcon, LogIcon } from "../../resources";
import { Category, Node } from "./../NodeList/types";
import { stripHtmlTags } from "../Form/utils";
import { ConnectionListItem } from "@wso2/wso2-platform-core";
import { DownloadIcon } from "../../resources/icons/nodes/DownloadIcon";
import { formatMethodName } from "../../utils/formatMethodName";


namespace S {
    export const Card = styled.div<{}>`
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        padding: 8px 0;
        border-radius: 5px;
        background-color: ${ThemeColors.SURFACE_DIM_2};
    `;

    export const DevantInputCard = styled(Card)`
        opacity: 0.8;
    `;

    export const Row = styled.div<{}>`
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        margin-bottom: 4px;
        width: 100%;
    `;

    export const TitleRow = styled(Row)<{}>`
        cursor: pointer;
        padding: 0 5px;
    `;

    export const DevantPullTitleRow = styled(TitleRow)<{}>`
        cursor: unset;
    `;

    export const Title = styled.div<{}>`
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
    `;

    export const BodyText = styled.div<{}>`
        font-size: 11px;
        opacity: 0.5;
        padding: 0 8px;
    `;

    export const Grid = styled.div<{ columns: number }>`
        display: grid;
        grid-template-columns: repeat(${({ columns }) => columns}, 1fr);
        gap: 8px;
        width: 100%;
        margin-top: 8px;
        padding: 0 8px;
    `;

    export const CardAction = styled.div<{}>`
        padding: 0 8px;
        margin-left: auto;
    `;

    export const Component = styled.div<{ enabled?: boolean }>`
        display: flex;
        flex-direction: row;
        gap: 5px;
        padding: 7px 5px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 5px;
        height: 36px;
        cursor: ${({ enabled }) => (enabled ? "pointer" : "not-allowed")};
        font-size: 14px;
        ${({ enabled }) => !enabled && "opacity: 0.5;"}
        &:hover {
            ${({ enabled }) =>
                enabled &&
                `
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border: 1px solid ${ThemeColors.PRIMARY};
    `}
        }
    `;

    export const ComponentContent = styled.div`
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        width: 280px;
        overflow-wrap: break-word;
        display: flex;
        flex-direction: column;
        gap: 2px;
    `;

    export const TooltipMarkdown = styled.div`
        font-size: 12px;
        line-height: 1.4;
        font-family: var(--vscode-font-family);

        p {
            margin: 0 0 6px 0;
        }

        p:last-of-type {
            margin-bottom: 0;
        }

        pre {
            display: none;
        }

        code {
            display: inline;
        }

        ul,
        ol {
            margin: 6px 0;
            padding-left: 18px;
        }

        li {
            margin: 2px 0;
        }
    `;

    export const CardIcon = styled.div`
        padding: 0 8px;
        display: flex;
        justify-content: center;
        align-items: center;
        & svg {
            height: 16px;
            width: 16px;
            fill: ${ThemeColors.ON_SURFACE};
            stroke: ${ThemeColors.ON_SURFACE};
        }
    `;

    export const ComponentIcon = styled(CardIcon)`
        height: 24px;
    `;

    export const ComponentTitle = styled.div<{}>`
        color: ${ThemeColors.ON_SURFACE};
    `;

    export const OriginBadge = styled.div`
        flex-shrink: 0;
        padding: 2px 6px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        background-color: ${ThemeColors.SURFACE_CONTAINER};
        border-radius: 3px;
        font-size: 11px;
    `;
}

interface GroupListProps {
    category: Category;
    expand?: boolean;
    onToggle?: (isOpen: boolean) => void;
    onSelect: (node: Node, category: string) => void;
    enableSingleNodeDirectNav?: boolean;
    onImportDevantConn?: (devantConn: ConnectionListItem) => void;
}

export function GroupList(props: GroupListProps) {
    const { category, expand, onToggle, onSelect, enableSingleNodeDirectNav, onImportDevantConn } = props;

    const [showList, setShowList] = useState(expand ?? false);

    const nodes = category.items as Node[];
    const openList = expand !== undefined ? expand : showList;
    const enabledNodes = nodes.filter((node) => node.enabled);
    const isSingleNode = enabledNodes.length === 1 && enableSingleNodeDirectNav;

    const handleToggleList = () => {
        if (isSingleNode) {
            onSelect(enabledNodes[0], category.title);
        } else {
            if (expand !== undefined) {
                onToggle?.(!expand);
            } else {
                setShowList(!showList);
            }
        }
    };

    if (category.devant && category.unusedDevantConn) {
        return (
            <UnusedDevantCard
                title={category.title}
                devantConn={category.devant}
                onImportDevantConn={onImportDevantConn}
            />
        );
    }

    if (nodes.length === 0) {
        return null;
    }

    return (
        <S.Card>
            <S.TitleRow onClick={handleToggleList}>
                <S.CardIcon>{category.icon || <LogIcon />}</S.CardIcon>
                <S.Title>{category.title}</S.Title>
                {category.origin && (
                    <S.OriginBadge>
                        {category.origin === "dependency" ? "Parameter" : "Built in"}
                    </S.OriginBadge>
                )}
                {category.tooltip && (
                    <Codicon
                        sx={{ color: category.tooltip?.color }}
                        name={category.tooltip?.icon || "info"}
                        tooltip={category.tooltip?.text}
                    />
                )}
                <S.CardAction>
                    {isSingleNode ? (
                        <Codicon name={"chevron-right"} />
                    ) : openList ? (
                        <Codicon name={"chevron-up"} />
                    ) : (
                        <Codicon name={"chevron-down"} />
                    )}
                </S.CardAction>
            </S.TitleRow>
            {openList && !isSingleNode && (
                <>
                    <S.BodyText>{category.description}</S.BodyText>
                    <S.Grid columns={1}>
                        {enabledNodes.map((node, index) => (
                            <Tooltip
                                key={`${node.id}-${index}`}
                                content={renderTooltipContent(getComponentDescription(node))}
                                position="bottom"
                                offset={{ top: 16, left: 20 }}
                                sx={{ maxWidth: "280px", whiteSpace: "normal", wordWrap: "break-word", overflowWrap: "break-word" }}
                            >
                                <S.Component
                                    enabled={node.enabled}
                                    onClick={() => onSelect(node, category.title)}
                                >
                                    <S.ComponentIcon>
                                        {node.icon || <CallIcon />}
                                    </S.ComponentIcon>
                                    <S.ComponentContent>
                                        <S.ComponentTitle>{getComponentTitle(node)}</S.ComponentTitle>
                                    </S.ComponentContent>
                                </S.Component>
                            </Tooltip>
                        ))}
                    </S.Grid>
                </>
            )}
        </S.Card>
    );
}

const UnusedDevantCard = (props: {
    title: string;
    devantConn: ConnectionListItem;
    onImportDevantConn?: (devantConn: ConnectionListItem) => void;
}) => {
    const { title, devantConn, onImportDevantConn } = props;
    return (
        <S.DevantInputCard>
            <S.DevantPullTitleRow>
                <S.CardIcon>{<DownloadIcon />}</S.CardIcon>
                <S.Title>{title || devantConn?.name}</S.Title>
                <Codicon name="info" tooltip="Unused WSO2 Cloud Connection" />
                <S.CardAction>
                    <Button
                        tooltip="Import and use this WSO2 Cloud connection"
                        appearance="icon"
                        onClick={onImportDevantConn ? () => onImportDevantConn(devantConn) : undefined}
                    >
                        Import
                    </Button>
                </S.CardAction>
            </S.DevantPullTitleRow>
        </S.DevantInputCard>
    );
};

export default GroupList;

function renderTooltipContent(description?: string): React.ReactNode | undefined {
    const cleaned = stripHtmlTags(description || "").trim();
    if (!cleaned) {
        return undefined;
    }
    return (
        <S.TooltipMarkdown>
            <ReactMarkdown>{cleaned}</ReactMarkdown>
        </S.TooltipMarkdown>
    );
}

function getComponentTitle(node: Node) {
    if (node.id === "RESOURCE_ACTION_CALL" && node.description) {
        return stripHtmlTags(node.description);
    }

    const label = stripHtmlTags(node.label);
    return formatMethodName(label);
}

function getComponentDescription(node: Node) {
    if (node.id === "RESOURCE_ACTION_CALL") {
        return "";
    }

    return stripHtmlTags(node.description);
}
