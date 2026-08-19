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

import { useMemo, useState } from "react";
import styled from "@emotion/styled";
import { AvailableNode } from "@wso2/ballerina-core";
import { Codicon, SearchBox, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { ConnectorIcon, NodeIcon } from "@wso2/bi-diagram";
import { MarkdownDescription } from "@wso2/ballerina-side-panel";
import { actionDisplayLabel, formatResourceSignature } from "./connectorActions";
import {
    Container,
    EmptyState,
    HeaderArea,
    Row as BaseRow,
    RowChevron,
    RowDescription,
    RowIcon,
    RowLabel as BaseRowLabel,
    RowText,
    ScrollArea,
    Tag,
} from "./styles";

const isResourceAction = (action: AvailableNode): boolean =>
    action.codedata?.node === "RESOURCE_ACTION_CALL" && Boolean(action.codedata?.resourcePath);

const InfoCard = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
`;

const InfoIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    flex-shrink: 0;

    & > * {
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        font-size: 22px;
    }

    & svg,
    & img {
        width: 22px;
        height: 22px;
        object-fit: contain;
    }
`;

const InfoContent = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const InfoTitleRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const InfoName = styled.div`
    font-size: 14px;
    font-weight: 700;
    color: ${ThemeColors.ON_SURFACE};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const InfoDescription = styled(MarkdownDescription)`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin: 0;
    overflow: hidden;

    p {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
`;

const RowList = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 5px;
    overflow: hidden;
`;

const Row = styled(BaseRow)`
    grid-template-columns: 20px minmax(0, 1fr) 12px;
    gap: 16px;
    border: none;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};

    &:last-of-type {
        border-bottom: none;
    }

    &:hover .action-badge,
    &:focus-visible .action-badge {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }
`;

const RowBadge = styled.span`
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background-color: ${ThemeColors.SURFACE};
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s ease;

    & svg {
        width: 10px;
        height: 10px;
    }
`;

const RowLabel = styled(BaseRowLabel)`
    margin-bottom: 4px;
`;

const RowSignature = styled.div`
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    word-break: break-word;
`;

interface ConnectorActionListProps {
    connector: AvailableNode;
    actions: AvailableNode[];
    category?: string;
    onSelect: (action: AvailableNode) => void;
}

export function ConnectorActionList(props: ConnectorActionListProps) {
    const { connector, actions, category, onSelect } = props;
    const [searchText, setSearchText] = useState<string>("");

    const filteredActions = useMemo(() => {
        const query = searchText.trim().toLowerCase();
        if (!query) {
            return actions;
        }
        return actions.filter((action) => {
            const label = `${action.metadata?.label ?? ""} ${actionDisplayLabel(action.metadata?.label)}`
                .toLowerCase();
            const description = action.metadata?.description?.toLowerCase() ?? "";
            const symbol = action.codedata?.symbol?.toLowerCase() ?? "";
            const resourcePath = action.codedata?.resourcePath?.toLowerCase() ?? "";
            return (
                label.includes(query) ||
                description.includes(query) ||
                symbol.includes(query) ||
                resourcePath.includes(query)
            );
        });
    }, [actions, searchText]);

    const searchPlaceholder = actions.length > 0
        ? `Search ${actions.length} action${actions.length === 1 ? "" : "s"}`
        : "Search actions";

    return (
        <Container>
            <HeaderArea>
                <InfoCard>
                    <InfoIcon>
                        {connector.metadata?.icon ? (
                            <ConnectorIcon url={connector.metadata.icon} />
                        ) : (
                            <Codicon name="package" />
                        )}
                    </InfoIcon>
                    <InfoContent>
                        <InfoTitleRow>
                            <InfoName>{connector.metadata?.label ?? "Connector"}</InfoName>
                            {category && <Tag>{category}</Tag>}
                        </InfoTitleRow>
                        {connector.metadata?.description && (
                            <InfoDescription description={connector.metadata.description} />
                        )}
                    </InfoContent>
                </InfoCard>

                <SearchBox
                    value={searchText}
                    placeholder={searchPlaceholder}
                    autoFocus={true}
                    onChange={setSearchText}
                    sx={{ height: 30, width: "100%" }}
                />
            </HeaderArea>

            <ScrollArea>
                {filteredActions.length === 0 ? (
                    <EmptyState>
                        <Typography variant="body3">
                            {searchText.trim()
                                ? `No actions match "${searchText.trim()}".`
                                : "No actions available."}
                        </Typography>
                    </EmptyState>
                ) : (
                    <RowList>
                        {filteredActions.map((action) => (
                            <Row
                                key={`${action.codedata?.node}-${action.codedata?.symbol}-${action.codedata?.resourcePath ?? ""}`}
                                onClick={() => onSelect(action)}
                                title={action.metadata?.description || undefined}
                            >
                                <RowIcon box={20} icon={18} offset={2}>
                                    {action.metadata?.icon ? (
                                        <ConnectorIcon url={action.metadata.icon} />
                                    ) : (
                                        <Codicon name="package" />
                                    )}
                                    <RowBadge className="action-badge">
                                        <NodeIcon type={action.codedata?.node} size={10} />
                                    </RowBadge>
                                </RowIcon>
                                <RowText>
                                    <RowLabel>{actionDisplayLabel(action.metadata?.label)}</RowLabel>
                                    {isResourceAction(action) ? (
                                        <RowSignature>
                                            {formatResourceSignature(
                                                action.codedata?.symbol ?? "",
                                                action.codedata?.resourcePath ?? ""
                                            )}
                                        </RowSignature>
                                    ) : (
                                        action.metadata?.description && (
                                            <RowDescription>{action.metadata.description}</RowDescription>
                                        )
                                    )}
                                </RowText>
                                <RowChevron>
                                    <Codicon name="chevron-right" sx={{ fontSize: 12 }} />
                                </RowChevron>
                            </Row>
                        ))}
                    </RowList>
                )}
            </ScrollArea>
        </Container>
    );
}

export default ConnectorActionList;
