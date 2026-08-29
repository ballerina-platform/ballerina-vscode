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

import React, { useEffect, useState } from "react";
import { Button, Codicon, ProgressRing, SearchBox, SidePanelBody, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { BackIcon, CloseIcon, LogIcon } from "../../resources";
import { Category, Item, Node } from "../NodeList/types";
import { cloneDeep, debounce } from "lodash";

namespace S {
    export const Container = styled.div<{}>`
        width: 100%;
    `;

    export const HeaderContainer = styled.div<{}>`
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px;
    `;

    export const PanelBody = styled(SidePanelBody)`
        height: calc(100vh - 100px);
        padding-top: 0;
        overflow-y: auto;
    `;

    export const StyledSearchInput = styled(SearchBox)`
        height: 30px;
    `;

    export const CategorySection = styled.div<{}>`
        display: flex;
        flex-direction: column;
        width: 100%;
        margin-bottom: 24px;
    `;

    export const CategoryTitle = styled.div<{}>`
        font-size: 14px;
        font-family: GilmerBold;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

    export const CategoryDescription = styled.div<{}>`
        font-size: 12px;
        opacity: 0.7;
        margin-bottom: 16px;
    `;

    export const CardsContainer = styled.div<{}>`
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    `;

    export const Card = styled.div<{ enabled?: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 8px;
        cursor: ${({ enabled }) => (enabled ? "pointer" : "not-allowed")};
        transition: all 0.2s ease;
        background-color: ${ThemeColors.SURFACE};
        min-height: 60px;
        user-select: none;
        -webkit-user-select: none;

        ${({ enabled }) => !enabled && "opacity: 0.5;"}

        &:hover {
            ${({ enabled }) =>
            enabled &&
            `
                background-color: ${ThemeColors.PRIMARY_CONTAINER};
                border: 1px solid ${ThemeColors.PRIMARY};
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            `}
        }
    `;

    export const CardIcon = styled.div`
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 6px;
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        flex-shrink: 0;

        & svg {
            height: 20px;
            width: 20px;
        }

        & img {
            height: 20px;
            width: 20px;
            border-radius: 2px;
        }
    `;

    export const CardContent = styled.div`
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        min-width: 0;
    `;

    export const CardTitle = styled.div`
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
        color: ${ThemeColors.ON_SURFACE};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    export const CardDescription = styled.div`
        font-size: 12px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        opacity: 0.8;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    `;

    export const GroupContainer = styled.div<{ expanded?: boolean }>`
        display: flex;
        flex-direction: column;
        border: 1px solid ${({ expanded }) => (expanded ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
        border-radius: 8px;
        background-color: ${ThemeColors.SURFACE};
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;

        ${({ expanded }) => expanded && `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);`}

        ${({ expanded }) =>
            !expanded &&
            `
            &:hover {
                background-color: ${ThemeColors.PRIMARY_CONTAINER};
                border-color: ${ThemeColors.PRIMARY};
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
        `}
    `;

    export const GroupHeader = styled.div`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding: 12px;
        min-height: 60px;
        cursor: pointer;
        background-color: transparent;

        &:focus {
            outline: none;
        }

        &:focus-visible {
            outline: 1px solid var(--vscode-focusBorder, ${ThemeColors.PRIMARY});
            outline-offset: -2px;
        }
    `;

    export const CountPill = styled.span`
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 500;
        line-height: 1;
        padding: 3px 8px;
        border-radius: 999px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        background-color: ${ThemeColors.SURFACE_CONTAINER};
        border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        white-space: nowrap;
    `;

    export const ChevronWrapper = styled.div<{ expanded?: boolean }>`
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        transition: transform 0.2s ease;
        transform: rotate(${({ expanded }) => (expanded ? "180deg" : "0deg")});
    `;

    export const GroupBody = styled.div`
        display: flex;
        flex-direction: column;
        border-top: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        background-color: ${ThemeColors.SURFACE_DIM};
        animation: groupBodyIn 0.18s ease;

        @keyframes groupBodyIn {
            from {
                opacity: 0;
                transform: translateY(-4px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `;

    export const ChildCard = styled.div<{ enabled?: boolean }>`
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 15px;
        padding: 12px 16px;
        cursor: ${({ enabled }) => (enabled ? "pointer" : "not-allowed")};
        transition: background-color 0.15s ease;

        &:not(:last-child) {
            border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        }

        ${({ enabled }) => enabled === false && "opacity: 0.5;"}

        &:hover {
            ${({ enabled }) =>
            enabled !== false &&
            `background-color: var(--vscode-list-hoverBackground, ${ThemeColors.SURFACE_CONTAINER});`}
        }
    `;

    export const ChildIcon = styled.div`
        position: relative;
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
    `;

    export const ChildIconMain = styled.div`
        display: flex;
        align-items: center;
        justify-content: center;

        & svg,
        & img {
            width: 18px !important;
            height: 18px !important;
            border-radius: 3px;
        }
    `;

    export const ChildIconBadge = styled.div`
        position: absolute;
        right: -3px;
        bottom: -3px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 4px;
        overflow: hidden;
        background-color: ${ThemeColors.SURFACE};
        box-shadow: 0 0 0 1px ${ThemeColors.OUTLINE_VARIANT};

        & svg,
        & img {
            width: 12px !important;
            height: 12px !important;
            border-radius: 2px;
        }
    `;

    export const ChildContent = styled.div`
        display: flex;
        flex-direction: column;
        flex-grow: 1;
        min-width: 0;
    `;

    export const ChildTitle = styled.div`
        font-size: 13px;
        font-weight: 600;
        color: ${ThemeColors.ON_SURFACE};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    export const ChildDescription = styled.div`
        font-size: 12px;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        opacity: 0.8;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    `;

    export const Row = styled.div<{}>`
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        margin-bottom: 4px;
        width: 100%;
    `;

    export const LeftAlignRow = styled(Row)`
        justify-content: flex-start;
    `;

    export const BackButton = styled(Button)`
        border-radius: 5px;
    `;

    export const CloseButton = styled(Button)`
        position: absolute;
        right: 10px;
        border-radius: 5px;
    `;

    export const EmptyState = styled.div`
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 16px;
        text-align: center;
        color: ${ThemeColors.ON_SURFACE_VARIANT};
        opacity: 0.7;
    `;

    export const EmptyStateText = styled.div`
        font-size: 14px;
        margin-bottom: 8px;
    `;

    export const EmptyStateSubText = styled.div`
        font-size: 12px;
        opacity: 0.8;
    `;

    export const AddButton = styled(Button)`
        border-radius: 5px;
    `;
}

export interface CardListProps {
    categories: Category[];
    title?: string;
    searchPlaceholder?: string;
    onSelect: (id: string, metadata?: any) => void;
    onSearch?: (text: string) => void;
    onBack?: () => void;
    onClose?: () => void;
    // Supply both to keep a group expanded across view switches (e.g. returning from a form).
    expandedGroupId?: string | null;
    onExpandedGroupChange?: (groupId: string | null) => void;
    // Optional extra content rendered below the categories (e.g. a WSO2 Cloud section).
    extraSection?: React.ReactNode;
}

function CardList(props: CardListProps) {
    const { categories, title, searchPlaceholder, onSelect, onSearch, onBack, onClose,
        expandedGroupId: controlledExpandedGroupId, onExpandedGroupChange, extraSection } = props;

    const [searchText, setSearchText] = useState<string>("");
    const [isSearching, setIsSearching] = useState(false);
    const [localExpandedGroupId, setLocalExpandedGroupId] = useState<string | null>(null);

    const isControlled = onExpandedGroupChange !== undefined;
    const expandedGroupId = isControlled ? controlledExpandedGroupId ?? null : localExpandedGroupId;
    const setExpandedGroupId = isControlled ? onExpandedGroupChange : setLocalExpandedGroupId;

    useEffect(() => {
        if (onSearch) {
            setIsSearching(true);
            debouncedSearch(searchText);
            return () => debouncedSearch.cancel();
        }
    }, [searchText]);

    const handleSearch = (text: string) => {
        if (onSearch) {
            onSearch(text);
        }
    };

    const debouncedSearch = debounce(handleSearch, 500);

    const handleOnSearch = (text: string) => {
        setSearchText(text);
    };

    useEffect(() => {
        setIsSearching(false);
    }, [categories]);

    useEffect(() => {
        if (!isControlled) {
            setLocalExpandedGroupId(null);
        }
    }, [categories]);

    const handleCardClick = (node: Node) => {
        onSelect(node.id, { node: node.metadata });
    };

    const getGroupId = (category: Category) => `${category.title}:${category.description}`;

    const handleGroupClick = (category: Category) => {
        const groupId = getGroupId(category);
        setExpandedGroupId(expandedGroupId === groupId ? null : groupId);
    };

    // Filter items based on search text (only if no onSearch prop - local filtering)
    const filterItems = (items: Item[]): Item[] => {
        if (!items || onSearch) return items || []; // If onSearch is provided, don't filter locally

        return items
            .filter((item) => item != null)
            .map((item) => {
                if ("items" in item && "title" in item) {
                    // This is a Category
                    const filteredItems = filterItems(item.items);
                    const categoryMatches =
                        item.title.toLowerCase().includes(searchText.toLowerCase()) ||
                        (item.description?.toLowerCase() || "").includes(searchText.toLowerCase());

                    if (categoryMatches || filteredItems.length > 0) {
                        return {
                            ...item,
                            items: categoryMatches ? item.items : filteredItems,
                        };
                    }
                    return null;
                } else if ("id" in item && "label" in item) {
                    // This is a Node
                    const lowerCaseTitle = item.label.toLowerCase();
                    const lowerCaseDescription = item.description?.toLowerCase() || "";
                    const lowerCaseSearchText = searchText.toLowerCase();

                    if (
                        lowerCaseTitle.includes(lowerCaseSearchText) ||
                        lowerCaseDescription.includes(lowerCaseSearchText)
                    ) {
                        return item;
                    }
                    return null;
                }
                return null;
            })
            .filter(Boolean) as Item[];
    };

    const renderGroupChildren = (items: Item[], groupIcon?: JSX.Element) => {
        return items
            .filter((item): item is Node | Category => item != null)
            .map((item, index) => {
                // Not expected inside a group, but fall back gracefully.
                if ("items" in item && "title" in item) {
                    return <React.Fragment key={item.title + index}>{renderCards([item])}</React.Fragment>;
                }

                const node = item as Node;
                return (
                    <S.ChildCard
                        key={node.id + index}
                        enabled={node.enabled}
                        onClick={() => node.enabled !== false && handleCardClick(node)}
                        onKeyDown={(event) => {
                            if (node.enabled !== false && (event.key === "Enter" || event.key === " ")) {
                                event.preventDefault();
                                handleCardClick(node);
                            }
                        }}
                        role="button"
                        tabIndex={node.enabled !== false ? 0 : -1}
                        title={node.description}
                    >
                        <S.ChildIcon>
                            <S.ChildIconMain>{groupIcon ? groupIcon : node.icon ? node.icon : <LogIcon />}</S.ChildIconMain>
                            {groupIcon && node.icon && <S.ChildIconBadge>{node.icon}</S.ChildIconBadge>}
                        </S.ChildIcon>
                        <S.ChildContent>
                            <S.ChildTitle>{node.label}</S.ChildTitle>
                            {node.description && <S.ChildDescription>{node.description}</S.ChildDescription>}
                        </S.ChildContent>
                    </S.ChildCard>
                );
            });
    };

    const renderCards = (items: Item[]) => {
        const cards = items.filter((item): item is Node | Category => item != null && (
            ("id" in item && "label" in item) || ("items" in item && "title" in item)
        ));

        if (cards.length === 0) {
            return (
                <S.EmptyState>
                    <S.EmptyStateText>No items found</S.EmptyStateText>
                    <S.EmptyStateSubText>Try adjusting your search or explore different categories</S.EmptyStateSubText>
                </S.EmptyState>
            );
        }

        return (
            <S.CardsContainer>
                {cards.map((item, index) => {
                    if ("id" in item && "label" in item) {
                        const node = item as Node;
                        return (
                            <S.Card key={node.id + index} enabled={node.enabled} onClick={() => handleCardClick(node)} title={node.description}>
                                <S.CardIcon>{node.icon ? node.icon : <LogIcon />}</S.CardIcon>
                                <S.CardContent>
                                    <S.CardTitle>{node.label}</S.CardTitle>
                                    {node.description && <S.CardDescription>{node.description}</S.CardDescription>}
                                </S.CardContent>
                            </S.Card>
                        );
                    }

                    const category = item as Category;
                    const itemCount = category.items.length;
                    const countLabel = `${itemCount} ${itemCount === 1 ? "option" : "options"}`;
                    const groupId = getGroupId(category);
                    const isExpanded = Boolean(searchText) || expandedGroupId === groupId;
                    const groupChildrenId = `group-${category.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-${index}`;
                    return (
                        <S.GroupContainer key={category.title + index} expanded={isExpanded}>
                            <S.GroupHeader
                                onClick={() => handleGroupClick(category)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        handleGroupClick(category);
                                    }
                                }}
                                role="button"
                                tabIndex={0}
                                aria-expanded={isExpanded}
                                aria-controls={groupChildrenId}
                                title={category.description}
                            >
                                <S.CardIcon>{category.icon ? category.icon : <LogIcon />}</S.CardIcon>
                                <S.CardContent>
                                    <S.CardTitle>{category.title}</S.CardTitle>
                                    {category.description && (
                                        <S.CardDescription>{category.description}</S.CardDescription>
                                    )}
                                </S.CardContent>
                                <S.CountPill>{countLabel}</S.CountPill>
                                <S.ChevronWrapper expanded={isExpanded} aria-hidden="true">
                                    <Codicon name="chevron-down" sx={{ fontSize: 16 }} />
                                </S.ChevronWrapper>
                            </S.GroupHeader>
                            {isExpanded && (
                                <S.GroupBody id={groupChildrenId}>
                                    {renderGroupChildren(category.items, category.icon)}
                                </S.GroupBody>
                            )}
                        </S.GroupContainer>
                    );
                })}
            </S.CardsContainer>
        );
    };

    const filteredCategories = onSearch
        ? categories
        : cloneDeep(categories).map((category) => {
            if (!category || !category.items) {
                return category;
            }
            category.items = filterItems(category.items) || [];
            return category;
        });

    const hasContent = filteredCategories.some((category) => category?.items && category.items.length > 0);
    const headerTitle = title;
    const canGoBack = Boolean(onBack);
    const shouldShowHeaderActions = (canGoBack && headerTitle) || onClose;
    return (
        <S.Container>
            <S.HeaderContainer>
                {shouldShowHeaderActions && (
                    <S.Row>
                        {canGoBack && headerTitle && (
                            <S.LeftAlignRow>
                                <S.BackButton appearance="icon" onClick={() => onBack?.()}>
                                    <BackIcon />
                                </S.BackButton>
                                {headerTitle}
                            </S.LeftAlignRow>
                        )}
                        {onClose && (
                            <S.CloseButton appearance="icon" onClick={onClose}>
                                <CloseIcon />
                            </S.CloseButton>
                        )}
                    </S.Row>
                )}
                <S.Row>
                    <S.StyledSearchInput
                        value={searchText}
                        placeholder={searchPlaceholder || "Search"}
                        autoFocus={true}
                        onChange={handleOnSearch}
                        size={60}
                    />
                </S.Row>
            </S.HeaderContainer>

            {isSearching && (
                <S.PanelBody>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                        <ProgressRing />
                    </div>
                </S.PanelBody>
            )}

            {!isSearching && (
                <S.PanelBody>
                    {!hasContent && !extraSection ? (
                        <S.EmptyState>
                            <S.EmptyStateText>No results found</S.EmptyStateText>
                            <S.EmptyStateSubText>Try adjusting your search terms</S.EmptyStateSubText>
                        </S.EmptyState>
                    ) : (
                        <>
                            {filteredCategories.map((category, index) => {
                                if (!category?.items || category.items.length === 0) {
                                    return null;
                                }

                                return (
                                    <S.CategorySection key={category.title + index}>
                                        <S.CategoryTitle>{category.title}</S.CategoryTitle>
                                        {category.description && (
                                            <S.CategoryDescription>{category.description}</S.CategoryDescription>
                                        )}
                                        {renderCards(category.items)}
                                    </S.CategorySection>
                                );
                            })}
                            {extraSection}
                        </>
                    )}
                </S.PanelBody>
            )}
        </S.Container>
    );
}

export { CardList };
export default CardList;
