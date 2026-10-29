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

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    Category as PanelCategory,
    DrillPath,
    flattenLeaves,
    getCountLabel,
    getGroupId,
    GROUP_PATH_SEPARATOR,
    isCategory,
    Item as PanelItem,
    Node as PanelNode,
    pathSegments,
    resolveDrillPath,
    subgroupChain,
} from "@wso2/ballerina-side-panel";
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

const Row = styled(BaseRow)<{ nested?: boolean }>`
    grid-template-columns: 22px minmax(0, 1fr) 12px;
    gap: 12px;
    padding-left: ${({ nested }: { nested?: boolean }) => (nested ? 24 : 12)}px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-bottom: none;

    &:first-of-type {
        border-top: none;
    }

    &:last-child {
        border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
        border-radius: 0 0 5px 5px;
    }

    &:hover .action-badge,
    &[data-active="true"] .action-badge {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
    }
`;

const ChildBadge = styled.div`
    position: absolute;
    right: -4px;
    bottom: -4px;
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
    }
`;

const GroupRow = styled(Row)`
    grid-template-columns: 22px minmax(0, 1fr) auto 12px;
    align-items: center;
`;

const CountPill = styled.span`
    font-size: 11px;
    line-height: 1;
    padding: 3px 8px;
    border-radius: 999px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    white-space: nowrap;
`;

const BackButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: none;
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;

    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground, ${ThemeColors.SURFACE_CONTAINER});
    }
`;

const RowCaption = styled.div`
    margin-top: 2px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

type NodeRow = { kind: "node"; node: PanelNode; groupIcon?: ReactNode; caption?: string; nested?: boolean };
type GroupRowData = {
    kind: "group" | "subgroup";
    group: PanelCategory;
    id: string;
    title: string;
    expanded?: boolean;
    nested?: boolean;
};
type ListRow = NodeRow | GroupRowData;

interface ListSection {
    key: string;
    title: string;
    // Every option in the section, flat, for search and counts.
    leaves: NodeRow[];
    rows: ListRow[];
    category: string;
    tag?: string;
    pending?: boolean;
    level?: { group: PanelCategory; parent: { title: string; id: string } };
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
    searchPlaceholder?: string;
    // Rendered after the last section, inside the scroll area.
    extraSection?: ReactNode;
    // Supply both to keep the open group across remounts (e.g. returning from the action list).
    expandedGroupId?: string | null;
    onExpandedGroupChange?: (groupId: string | null) => void;
}

const nodesOf = (category: PanelCategory): PanelNode[] =>
    (category.items ?? []).filter((item): item is PanelNode => "id" in item && !("items" in item));

const subCategoriesOf = (category: PanelCategory): PanelCategory[] =>
    (category.items ?? []).filter((item): item is PanelCategory => "items" in item);

const nodeRow = (node: PanelNode): NodeRow => ({ kind: "node", node });

const leafRowsOf = (category: PanelCategory): NodeRow[] =>
    (category.items ?? []).flatMap((item) => isCategory(item)
        ? flattenLeaves(item.items, [item.title]).map(({ node, path }): NodeRow =>
            ({ kind: "node", node, groupIcon: item.icon, caption: path.join(GROUP_PATH_SEPARATOR) }))
        : [nodeRow(item)]);

const subgroupRow = (subgroup: PanelCategory, parentId: string, nested: boolean): GroupRowData => {
    const chain = subgroupChain(subgroup);
    return {
        kind: "subgroup",
        group: chain[chain.length - 1],
        id: chain.reduce((id, group) => getGroupId(group, id), parentId),
        title: chain.map((group) => group.title).join(GROUP_PATH_SEPARATOR),
        nested,
    };
};

const childRowsOf = (items: PanelItem[], parentId: string, groupIcon: ReactNode, nested: boolean): ListRow[] =>
    items.map((item) => isCategory(item)
        ? subgroupRow(item, parentId, nested)
        : { kind: "node", node: item, groupIcon, nested });

// Package groups expand in place, one at a time; their subgroups open as a level of their own.
const browseRowsOf = (items: PanelItem[], expandedGroupId: string | null): ListRow[] =>
    items.flatMap((item): ListRow[] => {
        if (!isCategory(item)) {
            return [nodeRow(item)];
        }
        const id = getGroupId(item);
        const expanded = id === expandedGroupId;
        const header: GroupRowData = { kind: "group", group: item, id, title: item.title, expanded };
        return expanded ? [header, ...childRowsOf(item.items, id, item.icon, true)] : [header];
    });

const levelSectionOf = (drill: DrillPath): ListSection => {
    const group = drill.trail[drill.trail.length - 1];
    const id = drill.ids[drill.ids.length - 1];
    const segments = pathSegments(drill);
    return {
        key: id,
        title: segments[segments.length - 1].title,
        leaves: [],
        rows: childRowsOf(group.items, id, drill.trail[0].icon, false),
        category: drill.section.title,
        level: { group, parent: segments[segments.length - 2] },
    };
};

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

const rowKey = (row: ListRow): string => (row.kind === "node" ? `${connectorKey(row.node)}:${row.node.label}` : row.id);

const scoreNode = (node: PanelNode, category: string, query: string, caption = ""): number => {
    const label = (node.label ?? "").toLowerCase();
    if (label === query) return 0;
    if (label.startsWith(query)) return 1;
    if (label.includes(` ${query}`)) return 2;
    if (label.includes(query)) return 3;
    const module = (node.metadata?.codedata?.module ?? "").toLowerCase();
    if (module.includes(query)) return 4;
    if (category.toLowerCase().includes(query) || caption.toLowerCase().includes(query)) return 5;
    if ((node.description ?? "").toLowerCase().includes(query)) return 6;
    return -1;
};

interface LevelHeaderProps {
    title: string;
    level: NonNullable<ListSection["level"]>;
    onBack: () => void;
}

function LevelHeader({ title, level, onBack }: LevelHeaderProps) {
    return (
        <SectionHeader>
            <BackButton aria-label={`Back to ${level.parent.title}`} onClick={onBack}>
                <Codicon name="chevron-left" sx={{ fontSize: 14 }} />
            </BackButton>
            {level.group.icon && <RowIcon box={20} icon={18}>{level.group.icon}</RowIcon>}
            <SectionTitle title={title}>{title}</SectionTitle>
            <SectionCount>{getCountLabel(level.group)}</SectionCount>
        </SectionHeader>
    );
}

interface RowViewProps<T extends ListRow> {
    row: T;
    index: number;
    active: boolean;
    onActivate: () => void;
}

function GroupRowView({ row, index, active, onActivate }: RowViewProps<GroupRowData>) {
    const chevron = row.kind === "subgroup" ? "chevron-right" : row.expanded ? "chevron-up" : "chevron-down";
    return (
        <GroupRow
            data-index={index}
            data-active={active}
            nested={row.nested}
            aria-expanded={row.kind === "group" ? row.expanded : undefined}
            title={row.group.description || row.title}
            onClick={onActivate}
        >
            <RowIcon box={22} icon={20}>{row.group.icon ?? <Codicon name="layers" />}</RowIcon>
            <RowText>
                <RowLabel>{row.title}</RowLabel>
                {row.group.description && <RowDescription>{row.group.description}</RowDescription>}
            </RowText>
            <CountPill>{getCountLabel(row.group)}</CountPill>
            <RowChevron>
                <Codicon name={chevron} sx={{ fontSize: 12 }} />
            </RowChevron>
        </GroupRow>
    );
}

function NodeRowView({ row, index, active, onActivate }: RowViewProps<NodeRow>) {
    const { node, caption } = row;
    const groupIcon = node.contextIcon ?? row.groupIcon;
    return (
        <Row
            data-index={index}
            data-active={active}
            nested={row.nested}
            title={node.description || node.label}
            onClick={onActivate}
        >
            <RowIcon box={22} icon={20} offset={1}>
                {groupIcon ?? node.icon ?? <Codicon name="package" />}
                {groupIcon && node.icon && <ChildBadge className="action-badge">{node.icon}</ChildBadge>}
            </RowIcon>
            <RowText>
                <RowLabel>{node.label}</RowLabel>
                {caption && <RowCaption>{caption}</RowCaption>}
                {node.description && <RowDescription>{node.description}</RowDescription>}
            </RowText>
            <RowChevron>
                <Codicon name="chevron-right" sx={{ fontSize: 12 }} />
            </RowChevron>
        </Row>
    );
}

function ListRowView({ row, ...rest }: RowViewProps<ListRow>) {
    return row.kind === "node" ? <NodeRowView row={row} {...rest} /> : <GroupRowView row={row} {...rest} />;
}

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
        searchPlaceholder = "Search connectors",
        extraSection,
        expandedGroupId: controlledExpandedGroupId,
        onExpandedGroupChange,
    } = props;

    const [category, setCategory] = useState<string>("");
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const [localExpandedGroupId, setLocalExpandedGroupId] = useState<string | null>(null);
    const isControlled = onExpandedGroupChange !== undefined;
    const expandedGroupId = isControlled ? controlledExpandedGroupId ?? null : localExpandedGroupId;
    const setExpandedGroupId = isControlled ? onExpandedGroupChange : setLocalExpandedGroupId;
    const scrollRef = useRef<HTMLDivElement>(null);

    const query = searchText.trim().toLowerCase();

    const catalogSections = useMemo(
        () =>
            connectorCategories
                .map((c) => ({
                    key: c.title,
                    title: c.title,
                    category: c.title,
                    leaves: leafRowsOf(c),
                    items: c.items ?? [],
                }))
                .filter((s) => s.leaves.length > 0),
        [connectorCategories]
    );

    const allConnectorSections = useMemo<ListSection[]>(
        () => catalogSections.map(({ items, ...s }) => ({ ...s, rows: browseRowsOf(items, expandedGroupId) })),
        [catalogSections, expandedGroupId]
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
                .map((c) => {
                    const leaves = connectionRowsOf(c).map(nodeRow);
                    return {
                        key: `conn-${c.title}`,
                        title: c.title,
                        category: c.title,
                        leaves,
                        rows: leaves,
                        tag: "In this integration",
                    };
                })
                .filter((s) => s.leaves.length > 0),
        [connectionCategories]
    );

    const sections = useMemo<ListSection[]>(() => {
        if (query) {
            const pool = category
                ? connectorSections.filter((s) => s.category === category)
                : connectorSections;
            const ranked = [...connectionSections, ...pool]
                .flatMap((s) => s.leaves.map((row) => ({
                    row,
                    score: scoreNode(row.node, s.category, query, row.caption),
                })))
                .filter((x) => x.score >= 0)
                .sort((a, b) => a.score - b.score);

            const seen = new Set(ranked.map((x) => connectorKey(x.row.node)));
            const extras = (extraCategories ?? [])
                .flatMap(nodesOf)
                .filter((node) => !seen.has(connectorKey(node)))
                .map(nodeRow);

            const leaves = [...ranked.map((x) => x.row), ...extras];
            if (!leaves.length && !loadingExtras) {
                return [];
            }
            return [{ key: "results", title: "Results", category: "", leaves, rows: leaves, pending: !!loadingExtras }];
        }

        const drill = resolveDrillPath(connectorCategories, expandedGroupId);
        if (drill) {
            return [levelSectionOf(drill)];
        }

        if (category) {
            return connectorSections.filter((s) => s.category === category);
        }

        return [
            ...connectionSections,
            ...(popularSection ? [popularSection] : []),
            ...connectorSections,
        ];
    }, [
        query,
        category,
        connectionSections,
        connectorSections,
        popularSection,
        extraCategories,
        loadingExtras,
        connectorCategories,
        expandedGroupId,
    ]);

    const flatRows = useMemo(
        () => sections.flatMap((s) =>
            s.rows.map((row) => ({ row, category: s.category, key: `${s.key}|${rowKey(row)}` }))),
        [sections]
    );
    const activeIndex = flatRows.findIndex((entry) => entry.key === activeKey);
    const level = sections[0]?.level;

    useEffect(() => {
        setActiveKey(null);
    }, [query, category]);


    const handleSelect = (node: PanelNode, cat: string) => {
        if (node.id === CONNECTION_ROW_ID) {
            onSelectConnection?.(node.label, node.metadata?.connectionActions ?? []);
            return;
        }
        onSelect(node.id, { node: node.metadata, category: cat });
    };

    const openLevel = (groupId: string) => {
        setExpandedGroupId(groupId);
        setActiveKey(null);
    };

    const activate = (row: ListRow, cat: string) => {
        if (row.kind === "node") {
            handleSelect(row.node, cat);
        } else if (row.kind === "subgroup") {
            openLevel(row.id);
        } else {
            setExpandedGroupId(row.expanded ? null : row.id);
        }
    };

    const handleSearchKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const next =
                event.key === "ArrowDown"
                    ? Math.min(activeIndex + 1, flatRows.length - 1)
                    : Math.max(activeIndex - 1, 0);
            setActiveKey(flatRows[next]?.key ?? null);
            scrollRef.current
                ?.querySelector(`[data-index="${next}"]`)
                ?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            const target = flatRows[activeIndex];
            if (target) {
                activate(target.row, target.category);
            }
        }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (level && event.altKey && event.key === "ArrowLeft") {
            event.preventDefault();
            openLevel(level.parent.id);
        }
    };

    let renderIndex = -1;

    return (
        <Container onKeyDown={handleKeyDown}>
            <HeaderArea>
                {description && <Description>{description}</Description>}
                <SearchWrap onKeyDown={handleSearchKeyDown}>
                    <SearchBox
                        value={searchText}
                        placeholder={searchPlaceholder}
                        autoFocus={true}
                        onChange={onSearchTextChange}
                        sx={{ height: 30, width: "100%" }}
                    />
                </SearchWrap>
                {connectorSections.length > 1 && !level && (
                    <FilterRow>
                        <CategorySelect
                            value={category}
                            aria-label="Filter by category"
                            onChange={(event) => setCategory(event.target.value)}
                        >
                            <option value="">All Categories</option>
                            {connectorSections.map((s) => (
                                <option key={s.key} value={s.category}>
                                    {s.title} ({s.leaves.length})
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
                            {section.level ? (
                                <LevelHeader
                                    title={section.title}
                                    level={section.level}
                                    onBack={() => openLevel(section.level.parent.id)}
                                />
                            ) : (
                                <SectionHeader>
                                    <SectionTitle>{section.title}</SectionTitle>
                                    {section.tag && <Tag>{section.tag}</Tag>}
                                    {!section.pending && <SectionCount>{section.leaves.length}</SectionCount>}
                                </SectionHeader>
                            )}
                            {section.rows.map((row) => {
                                renderIndex += 1;
                                const index = renderIndex;
                                return (
                                    <ListRowView
                                        key={`${section.key}-${row.kind === "node" ? row.node.id : row.id}-${index}`}
                                        row={row}
                                        index={index}
                                        active={index === activeIndex}
                                        onActivate={() => activate(row, section.category)}
                                    />
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
                {extraSection}
            </ScrollArea>

        </Container>
    );
}

export default ConnectorList;
