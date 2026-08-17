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
import { Codicon, ProgressRing, SearchBox, ThemeColors, Typography } from "@wso2/ui-toolkit";
import {
    Container,
    EmptyState,
    HeaderArea as BaseHeaderArea,
    Row as BaseRow,
    RowChevron,
    RowDescription as BaseRowDescription,
    RowIcon,
    RowLabel as BaseRowLabel,
    RowText,
    ScrollArea as BaseScrollArea,
    Tag,
} from "./styles";

const POPULAR_CATEGORY = "Popular";

const HeaderArea = styled(BaseHeaderArea)`
    gap: 8px;
    padding-bottom: 8px;
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

const ScrollArea = styled(BaseScrollArea)`
    margin-top: 12px;
`;

const Section = styled.div`
    background-color: ${ThemeColors.SURFACE_DIM};
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
    background: ${ThemeColors.SURFACE_DIM};
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

const SectionCount = styled.div`
    margin-left: auto;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const Row = styled(BaseRow)`
    grid-template-columns: 22px minmax(0, 1fr) 12px;
    gap: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-bottom: none;

    &:first-of-type {
        border-top: none;
    }

    &:last-child {
        border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 0 0 5px 5px;
    }
`;

const RowLabel = styled(BaseRowLabel)`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RowDescription = styled(BaseRowDescription)`
    margin-top: 2px;
    -webkit-line-clamp: 1;
`;

const PendingRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-top: none;
    border-radius: 0 0 5px 5px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

interface ListSection {
    key: string;
    title: string;
    nodes: PanelNode[];
    category: string;
    tag?: string;
    pending?: boolean;
}

interface ConnectorListProps {
    connectionCategories: PanelCategory[];
    connectorCategories: PanelCategory[];
    extraCategories?: PanelCategory[];
    loadingExtras?: boolean;
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
        loadingExtras,
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

    const allConnectorSections = useMemo<ListSection[]>(
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

    const connectionSections = useMemo<ListSection[]>(
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

    const sections = useMemo<ListSection[]>(() => {
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

            const nodes = [...ranked.map((x) => x.node), ...extras];
            if (!nodes.length && !loadingExtras) {
                return [];
            }
            return [{ key: "results", title: "Results", category: "", nodes, pending: !!loadingExtras }];
        }

        if (category) {
            return connectorSections.filter((s) => s.category === category);
        }

        return [
            ...connectionSections,
            ...(popularSection ? [popularSection] : []),
            ...connectorSections,
        ];
    }, [query, category, connectionSections, connectorSections, popularSection, extraCategories, loadingExtras]);

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
                        placeholder="Search connectors"
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
                            <option value="">All Categories</option>
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
                                {section.tag && <Tag>{section.tag}</Tag>}
                                {!section.pending && <SectionCount>{section.nodes.length}</SectionCount>}
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
                                        <RowIcon box={22} icon={20} offset={1}>
                                            {node.icon ?? <Codicon name="package" />}
                                        </RowIcon>
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
                            {section.pending && (
                                <PendingRow>
                                    <ProgressRing sx={{ height: 14, width: 14 }} />
                                    <Typography variant="body3">Searching for more connectors…</Typography>
                                </PendingRow>
                            )}
                        </Section>
                    ))
                )}
            </ScrollArea>

        </Container>
    );
}

export default ConnectorList;
