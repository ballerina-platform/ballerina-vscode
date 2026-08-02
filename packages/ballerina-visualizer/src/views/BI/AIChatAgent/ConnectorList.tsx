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

import { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Category as PanelCategory, Node as PanelNode } from "@wso2/ballerina-side-panel";
import { Codicon, SearchBox, ThemeColors, Typography } from "@wso2/ui-toolkit";

const POPULAR_CATEGORY = "Popular";

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 56px);
`;

const HeaderArea = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 16px 8px;
    flex-shrink: 0;
`;

const Description = styled.div`
    font-size: 13px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
`;

const SearchWrap = styled.div`
    display: contents;
`;

const FilterRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const CategorySelect = styled.select`
    flex: 1;
    min-width: 0;
    height: 26px;
    padding: 0 6px;
    font-family: inherit;
    font-size: 12px;
    color: var(--vscode-foreground);
    background-color: var(--vscode-dropdown-background, ${ThemeColors.SURFACE_DIM});
    border: 1px solid var(--vscode-dropdown-border, ${ThemeColors.OUTLINE_VARIANT});
    border-radius: 4px;
    cursor: pointer;

    &:focus-visible {
        outline: 1px solid ${ThemeColors.PRIMARY};
        outline-offset: -1px;
    }
`;

const ScrollArea = styled.div`
    flex: 1;
    overflow-y: auto;
    scrollbar-gutter: stable;
    margin-top: 12px;
    padding: 0 0 16px 16px;
    &::-webkit-scrollbar {
        width: 10px;
    }
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    &::-webkit-scrollbar-thumb {
        background: transparent;
        border-radius: 5px;
        border: 3px solid transparent;
        background-clip: content-box;
    }
    &:hover::-webkit-scrollbar-thumb {
        background: ${ThemeColors.OUTLINE_VARIANT};
        background-clip: content-box;
    }
`;

const Section = styled.div`
    background-color: rgba(255, 255, 255, 0.02);
    border-radius: 5px;
    margin-bottom: 16px;
`;

const SectionHeader = styled.div`
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 5px 5px 0 0;
    background: linear-gradient(rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.02)),
        ${ThemeColors.SURFACE_DIM};
    box-shadow: 0 -3px 0 3px ${ThemeColors.SURFACE_DIM};
`;

const SectionTitle = styled.div`
    font-size: 14px;
    font-family: GilmerBold;
    color: ${ThemeColors.ON_SURFACE};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const SectionTag = styled.div`
    flex-shrink: 0;
    padding: 1px 8px;
    border-radius: 4px;
    font-size: 10px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const SectionCount = styled.div`
    margin-left: auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const Row = styled.button`
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 12px;
    gap: 12px;
    align-items: start;
    width: 100%;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-bottom: none;
    background: transparent;
    color: ${ThemeColors.ON_SURFACE};
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover,
    &[data-active="true"] {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }

    &:focus-visible {
        outline: 1px solid ${ThemeColors.PRIMARY};
        outline-offset: -1px;
    }

    &:first-of-type {
        border-top: none;
    }

    &:last-of-type {
        border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 0 0 5px 5px;
    }
`;

const RowIcon = styled.div`
    width: 22px;
    height: 22px;
    margin-top: 1px;
    display: flex;
    align-items: center;
    justify-content: center;

    & > *,
    & svg,
    & img {
        width: 20px !important;
        height: 20px !important;
        font-size: 20px !important;
        object-fit: contain;
    }
`;

const RowText = styled.div`
    min-width: 0;
`;

const RowLabel = styled.div`
    font-size: 13px;
    font-weight: 500;
    color: ${ThemeColors.ON_SURFACE};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RowDescription = styled.div`
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--vscode-descriptionForeground);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
`;

const RowChevron = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 2px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    opacity: 0.7;
`;

const EmptyState = styled.div`
    padding: 32px 16px;
    text-align: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

interface Section {
    key: string;
    title: string;
    nodes: PanelNode[];
    category: string;
    tag?: string;
}

interface ConnectorListProps {
    connectionCategories: PanelCategory[];
    connectorCategories: PanelCategory[];
    extraCategories?: PanelCategory[];
    searchText: string;
    onSearchTextChange: (text: string) => void;
    onSelect: (nodeId: string, metadata?: any) => void;
    onSelectConnection?: (connectionName: string, actions: PanelNode[]) => void;
    description?: string;
}

const nodesOf = (category: PanelCategory): PanelNode[] =>
    (category.items ?? []).filter((item): item is PanelNode => "id" in item && !("items" in item));

const subCategoriesOf = (category: PanelCategory): PanelCategory[] =>
    (category.items ?? []).filter((item): item is PanelCategory => "items" in item);

const CONNECTION_ROW_ID = "__connection__";

const connectionRowsOf = (category: PanelCategory): PanelNode[] => {
    const subs = subCategoriesOf(category);
    if (!subs.length) {
        return nodesOf(category);
    }
    return subs
        .filter((sub) => (sub.items ?? []).length > 0)
        .map((sub) => {
            const actions = nodesOf(sub);
            return {
                id: CONNECTION_ROW_ID,
                label: sub.title,
                description: `${actions.length} action${actions.length === 1 ? "" : "s"}`,
                icon: sub.icon ?? actions[0]?.icon,
                metadata: { connectionActions: actions },
            } as PanelNode;
        });
};

const connectorKey = (node: PanelNode): string => {
    const c = node.metadata?.codedata;
    return c ? `${c.org}/${c.module}:${c.object}` : node.label;
};

const scoreNode = (node: PanelNode, category: string, query: string): number => {
    const label = (node.label ?? "").toLowerCase();
    if (label === query) return 0;
    if (label.startsWith(query)) return 1;
    if (label.includes(` ${query}`)) return 2;
    if (label.includes(query)) return 3;
    const module = (node.metadata?.codedata?.module ?? "").toLowerCase();
    if (module.includes(query)) return 4;
    if (category.toLowerCase().includes(query)) return 5;
    if ((node.description ?? "").toLowerCase().includes(query)) return 6;
    return -1;
};

export function ConnectorList(props: ConnectorListProps) {
    const {
        connectionCategories,
        connectorCategories,
        extraCategories,
        searchText,
        onSearchTextChange,
        onSelect,
        onSelectConnection,
        description,
    } = props;

    const [category, setCategory] = useState<string>("");
    const [activeIndex, setActiveIndex] = useState<number>(-1);
    const scrollRef = useRef<HTMLDivElement>(null);

    const query = searchText.trim().toLowerCase();

    const allConnectorSections = useMemo<Section[]>(
        () =>
            connectorCategories
                .map((c) => ({ key: c.title, title: c.title, category: c.title, nodes: nodesOf(c) }))
                .filter((s) => s.nodes.length > 0),
        [connectorCategories]
    );

    const popularSection = useMemo(() => {
        const found = allConnectorSections.find((s) => s.category === POPULAR_CATEGORY);
        return found ? { ...found, category: "" } : undefined;
    }, [allConnectorSections]);

    const connectorSections = useMemo(
        () => allConnectorSections.filter((s) => s.category !== POPULAR_CATEGORY),
        [allConnectorSections]
    );

    const connectionSections = useMemo<Section[]>(
        () =>
            connectionCategories
                .map((c) => ({
                    key: `conn-${c.title}`,
                    title: c.title,
                    category: c.title,
                    nodes: connectionRowsOf(c),
                    tag: "In this integration",
                }))
                .filter((s) => s.nodes.length > 0),
        [connectionCategories]
    );

    const totalConnectors = useMemo(
        () => connectorSections.reduce((sum, s) => sum + s.nodes.length, 0),
        [connectorSections]
    );

    const sections = useMemo<Section[]>(() => {
        if (query) {
            const pool = category
                ? connectorSections.filter((s) => s.category === category)
                : connectorSections;
            const ranked = [...connectionSections, ...pool]
                .flatMap((s) => s.nodes.map((node) => ({ node, s, score: scoreNode(node, s.category, query) })))
                .filter((x) => x.score >= 0)
                .sort((a, b) => a.score - b.score);

            const seen = new Set(ranked.map((x) => connectorKey(x.node)));
            const extras = (extraCategories ?? [])
                .flatMap(nodesOf)
                .filter((node) => !seen.has(connectorKey(node)));

            const results: Section[] = [];
            if (ranked.length) {
                results.push({ key: "results", title: "Results", category: "", nodes: ranked.map((x) => x.node) });
            }
            if (extras.length) {
                results.push({ key: "central", title: "More from Ballerina Central", category: "", nodes: extras });
            }
            return results;
        }

        if (category) {
            return connectorSections.filter((s) => s.category === category);
        }

        return [
            ...connectionSections,
            ...(popularSection ? [popularSection] : []),
            ...connectorSections,
        ];
    }, [query, category, connectionSections, connectorSections, popularSection, extraCategories]);

    const flatNodes = useMemo(
        () => sections.flatMap((s) => s.nodes.map((node) => ({ node, category: s.category }))),
        [sections]
    );

    useEffect(() => {
        setActiveIndex(-1);
    }, [query, category]);


    const handleSelect = (node: PanelNode, cat: string) => {
        if (node.id === CONNECTION_ROW_ID) {
            onSelectConnection?.(node.label, node.metadata?.connectionActions ?? []);
            return;
        }
        onSelect(node.id, { node: node.metadata, category: cat });
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next =
                event.key === "ArrowDown"
                    ? Math.min(activeIndex + 1, flatNodes.length - 1)
                    : Math.max(activeIndex - 1, 0);
            setActiveIndex(next);
            scrollRef.current
                ?.querySelector(`[data-index="${next}"]`)
                ?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            const target = flatNodes[activeIndex];
            if (target) {
                handleSelect(target.node, target.category);
            }
        }
    };

    let renderIndex = -1;

    return (
        <Container>
            <HeaderArea>
                {description && <Description>{description}</Description>}
                <SearchWrap onKeyDown={handleSearchKeyDown}>
                    <SearchBox
                        value={searchText}
                        placeholder={
                            totalConnectors ? `Search ${totalConnectors} connectors` : "Search connectors"
                        }
                        autoFocus={true}
                        onChange={onSearchTextChange}
                        sx={{ height: 30, width: "100%" }}
                    />
                </SearchWrap>
                {connectorSections.length > 1 && (
                    <FilterRow>
                        <CategorySelect
                            value={category}
                            aria-label="Filter by category"
                            onChange={(event) => setCategory(event.target.value)}
                        >
                            <option value="">All Categories ({totalConnectors})</option>
                            {connectorSections.map((s) => (
                                <option key={s.key} value={s.category}>
                                    {s.title} ({s.nodes.length})
                                </option>
                            ))}
                        </CategorySelect>
                    </FilterRow>
                )}
            </HeaderArea>

            <ScrollArea ref={scrollRef}>
                {sections.length === 0 ? (
                    <EmptyState>
                        <Typography variant="body3">
                            {query ? `No connectors match "${searchText.trim()}".` : "No connectors available."}
                        </Typography>
                    </EmptyState>
                ) : (
                    sections.map((section) => (
                        <Section key={section.key}>
                            <SectionHeader>
                                <SectionTitle>{section.title}</SectionTitle>
                                {section.tag && <SectionTag>{section.tag}</SectionTag>}
                                <SectionCount>{section.nodes.length}</SectionCount>
                            </SectionHeader>
                            {section.nodes.map((node) => {
                                renderIndex += 1;
                                const index = renderIndex;
                                return (
                                    <Row
                                        key={`${section.key}-${node.id}-${index}`}
                                        data-index={index}
                                        data-active={index === activeIndex}
                                        title={node.description || node.label}
                                        onClick={() => handleSelect(node, section.category)}
                                    >
                                        <RowIcon>{node.icon ?? <Codicon name="package" />}</RowIcon>
                                        <RowText>
                                            <RowLabel>{node.label}</RowLabel>
                                            {node.description && (
                                                <RowDescription>{node.description}</RowDescription>
                                            )}
                                        </RowText>
                                        <RowChevron>
                                            <Codicon name="chevron-right" sx={{ fontSize: 12 }} />
                                        </RowChevron>
                                    </Row>
                                );
                            })}
                        </Section>
                    ))
                )}
            </ScrollArea>

        </Container>
    );
}

export default ConnectorList;
