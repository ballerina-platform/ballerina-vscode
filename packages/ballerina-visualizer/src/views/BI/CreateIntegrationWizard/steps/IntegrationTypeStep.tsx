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

import { useMemo, useState, type KeyboardEvent } from "react";
import styled from "@emotion/styled";
import { Codicon, SearchBox, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { TriggerModelsResponse } from "@wso2/ballerina-core";
import ButtonCard from "../../../../components/ButtonCard";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { Chip, ChipRow, FilterBarBase, SearchSlot } from "../../components/ChipFilterBar.styles";
import { cardMatchesSearch } from "../../ComponentListView/componentListUtils";
import { useContainerWidth } from "../hooks/useContainerWidth";
import {
    ARTIFACT_CATEGORIES,
    ArtifactCard,
    ArtifactCategory,
    ArtifactCategoryKey,
    DynamicCardSource,
    DynamicTriggerType,
    triggersToCards,
} from "../artifactCatalog";

/** Below this container width the rail collapses into a horizontal chip row. */
const NARROW_WIDTH = 560;
/** The synthetic "show every category" rail entry. */
const ALL_KEY = "all";

/** A rail/chip entry: a real category, or the synthetic "All". */
type RailKey = typeof ALL_KEY | ArtifactCategoryKey;

/** Rail/chip entries: a synthetic "All" plus one per category. */
const RAIL_KEYS: RailKey[] = [ALL_KEY, ...ARTIFACT_CATEGORIES.map((category) => category.key)];

const StepRoot = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const Body = styled.div`
    display: flex;
    gap: 20px;
    align-items: flex-start;
`;

const LeftColumn = styled.div`
    position: sticky;
    top: 0;
    flex-shrink: 0;
    width: 200px;
    display: flex;
    flex-direction: column;
    gap: 12px;
`;

const Rail = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const RailItem = styled.button<{ active?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    background-color: ${(props: { active?: boolean }) =>
        props.active ? "var(--vscode-list-activeSelectionBackground)" : "transparent"};
    color: ${(props: { active?: boolean }) =>
        props.active ? "var(--vscode-list-activeSelectionForeground)" : "var(--vscode-foreground)"};
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    &:hover {
        background-color: ${(props: { active?: boolean }) =>
            props.active ? "var(--vscode-list-activeSelectionBackground)" : "var(--vscode-list-hoverBackground)"};
    }
    &:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: -1px;
    }
`;

const RailLabel = styled.span`
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
`;

const RailCount = styled.span`
    flex-shrink: 0;
    font-size: 11px;
    opacity: 0.7;
`;

// Chip/ChipRow/SearchSlot are shared with the Add-Artifact component list panel
// (ComponentListView/styles.ts) via ChipFilterBar.styles.ts. Only this bar's own
// padding differs between the two call sites.
const NarrowHeader = styled(FilterBarBase)`
    padding-bottom: 10px;
`;

const GridPane = styled.div`
    flex: 1;
    min-width: 0;
    padding: 4px 0 0 0;
`;

const CategorySection = styled.div`
    & + & {
        margin-top: 24px;
    }
`;

const CategoryHeader = styled.div`
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 2px;
`;

const CategoryTitle = styled(Typography)`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
`;

const CategoryCount = styled.span`
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const CategoryDescription = styled(Typography)`
    margin: 0 0 12px 0;
    font-size: 11px;
    line-height: 1.4;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const CardGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
    gap: 12px;

    /* Align the artifact cards with the chooser's type cards: softer 8px corners
       and a touch more breathing room than the component's dense defaults. */
    div[data-testid^="function-card-"] {
        border-radius: 8px;
        padding: 14px 16px;
    }

    /* Keep card titles subordinate to the section headings (13px/600):
       the card root carries the function-card testid; its only <p> is the title. */
    div[data-testid^="function-card-"] p {
        font-size: 12px;
        font-weight: 500;
    }
`;

const LoaderRow = styled.div`
    display: flex;
    align-items: center;
    padding: 8px 0;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 24px 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 13px;
`;

const ClearButton = styled.button`
    padding: 0;
    border: none;
    background: none;
    color: var(--vscode-textLink-foreground);
    font-size: 13px;
    cursor: pointer;
    &:hover {
        text-decoration: underline;
    }
`;

const ARROW_KEY_DELTAS: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
};

/** A category with its dynamic markers resolved into concrete cards. */
interface ResolvedCategory {
    category: ArtifactCategory;
    cards: ArtifactCard[];
    loading: boolean;
}

interface IntegrationTypeStepProps {
    /** Trigger models fetched once by the wizard root; null while loading. */
    triggers: TriggerModelsResponse | null;
    selection: ArtifactCard | null;
    onSelect: (card: ArtifactCard) => void;
    /**
     * Force the single-column layout (search + horizontal category chips above a
     * card grid) regardless of width. Used inside the unified Create flow so the
     * picker reads as one calm column, consistent with the chooser, instead of the
     * denser two-pane rail.
     */
    compact?: boolean;
}

/**
 * The Integration Type picker. A category rail (or a chip row in
 * narrow/compact panels) filters a searchable grid of artifact cards; selecting a
 * card chooses the artifact and drives the Configure step. Selecting a category is navigation
 * only — it never chooses the artifact, so the two highlights stay distinct.
 */
export function IntegrationTypeStep({ triggers, selection, onSelect, compact = false }: IntegrationTypeStepProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategoryKey, setActiveCategoryKey] = useState<RailKey>(ALL_KEY);
    const { ref, isNarrow } = useContainerWidth<HTMLDivElement>(NARROW_WIDTH);
    // Compact mode always uses the single-column (chip) layout.
    const useSingleColumn = compact || isNarrow;

    // Resolve dynamic trigger markers into concrete cards, per category.
    const resolvedCategories = useMemo<ResolvedCategory[]>(() => {
        const resolveCards = (cards: (ArtifactCard | DynamicCardSource)[]) => {
            const resolved: ArtifactCard[] = [];
            let loading = false;
            for (const entry of cards) {
                if (typeof entry === "string") {
                    if (!triggers) {
                        loading = true;
                        continue;
                    }
                    const type = entry.split(":")[1] as DynamicTriggerType;
                    resolved.push(...triggersToCards(triggers, type));
                } else {
                    resolved.push(entry);
                }
            }
            return { resolved, loading };
        };
        return ARTIFACT_CATEGORIES.map((category) => {
            const { resolved, loading } = resolveCards(category.cards);
            return { category, cards: resolved, loading };
        });
    }, [triggers]);

    const query = searchQuery.trim();

    // Search-filtered cards per category (independent of the active category, so
    // rail/chip counts always show where matches are). `globalMatchCount` counts
    // matches across every category, letting us tell "no matches at all" apart
    // from "no matches in this category, but some elsewhere".
    const { searchFiltered, searchFilteredByKey, totalCount, globalMatchCount } = useMemo(() => {
        const filtered = resolvedCategories.map(({ category, cards, loading }) => ({
            category,
            loading,
            cards: cards.filter((card) =>
                cardMatchesSearch(card.displayName, query, card.artifactInfo?.packageName, card.artifactInfo?.moduleName)
            ),
        }));
        const matchCount = filtered.reduce((sum, entry) => sum + entry.cards.length, 0);
        return {
            searchFiltered: filtered,
            searchFilteredByKey: new Map(filtered.map((entry) => [entry.category.key, entry])),
            totalCount: filtered.some((entry) => entry.loading) ? undefined : matchCount,
            globalMatchCount: matchCount,
        };
    }, [resolvedCategories, query]);

    const countFor = (entry?: { cards: ArtifactCard[]; loading: boolean }) =>
        entry && !entry.loading ? entry.cards.length : undefined;

    // Categories rendered in the grid: all, or just the selected one.
    const visibleCategories =
        activeCategoryKey === ALL_KEY
            ? searchFiltered
            : searchFiltered.filter((entry) => entry.category.key === activeCategoryKey);
    const visibleCards = visibleCategories.flatMap((entry) => entry.cards);
    const anyVisibleLoading = visibleCategories.some((entry) => entry.loading);

    /** Move focus across visible cards (including across sections) on arrow keys. */
    const handleGridKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const delta = ARROW_KEY_DELTAS[event.key];
        if (delta === undefined || visibleCards.length === 0) {
            return;
        }
        const currentId = (event.target as HTMLElement)?.id;
        const currentIndex = visibleCards.findIndex((card) => card.id === currentId);
        if (currentIndex === -1) {
            return;
        }
        event.preventDefault();
        const nextIndex = (currentIndex + delta + visibleCards.length) % visibleCards.length;
        document.getElementById(visibleCards[nextIndex].id)?.focus();
    };

    /** Up/Down move between rail entries and activate the focused one. */
    const handleRailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
            return;
        }
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const currentIndex = RAIL_KEYS.indexOf(activeCategoryKey);
        const nextKey = RAIL_KEYS[(currentIndex + delta + RAIL_KEYS.length) % RAIL_KEYS.length];
        event.preventDefault();
        setActiveCategoryKey(nextKey);
        document.getElementById(`rail-${nextKey}`)?.focus();
    };

    const renderCategorySection = (entry: (typeof searchFiltered)[number], showHeader: boolean) => {
        const { category, cards, loading } = entry;
        if (!loading && cards.length === 0) {
            return null;
        }
        const count = countFor(entry);
        return (
            <CategorySection key={category.key}>
                {showHeader && (
                    <>
                        <CategoryHeader>
                            <CategoryTitle variant="h4">{category.title}</CategoryTitle>
                            {count !== undefined && <CategoryCount>({count})</CategoryCount>}
                        </CategoryHeader>
                        <CategoryDescription variant="body3">{category.description}</CategoryDescription>
                    </>
                )}
                {cards.length > 0 && (
                    <CardGrid>
                        {cards.map((card) => (
                            <ButtonCard
                                key={card.id}
                                id={card.id}
                                title={card.displayName}
                                icon={card.icon}
                                isBeta={card.isBeta}
                                active={selection?.id === card.id}
                                truncate={true}
                                onClick={() => onSelect(card)}
                            />
                        ))}
                    </CardGrid>
                )}
                {/* Only stand in for a section that has nothing to show yet. A category
                    that mixes static cards with dynamic trigger cards is already legible
                    while the triggers load, so a trailing spinner there would just read as
                    a stray loader wedged above the next section's heading. */}
                {loading && cards.length === 0 && (
                    <LoaderRow>
                        <RelativeLoader />
                    </LoaderRow>
                )}
            </CategorySection>
        );
    };

    const activeCategoryTitle =
        activeCategoryKey === ALL_KEY
            ? null
            : ARTIFACT_CATEGORIES.find((item) => item.key === activeCategoryKey)?.title;

    const renderEmptyMessage = () => {
        if (!query) {
            return <span>No integration types available.</span>;
        }
        if (activeCategoryTitle && globalMatchCount > 0) {
            return (
                <>
                    <span>
                        No matches in &ldquo;{activeCategoryTitle}&rdquo;. Try another category or clear the search.
                    </span>
                    <ClearButton onClick={() => setActiveCategoryKey(ALL_KEY)}>Show all categories</ClearButton>
                </>
            );
        }
        return (
            <>
                <span>No integration types match &ldquo;{searchQuery.trim()}&rdquo;.</span>
                <ClearButton onClick={() => setSearchQuery("")}>Clear search</ClearButton>
            </>
        );
    };

    const grid =
        !anyVisibleLoading && visibleCards.length === 0 ? (
            <EmptyState>{renderEmptyMessage()}</EmptyState>
        ) : (
            <GridPane onKeyDown={handleGridKeyDown}>
                {/* Always show category headers so each group stays labelled. */}
                {visibleCategories.map((entry) => renderCategorySection(entry, true))}
            </GridPane>
        );

    const searchBox = (
        <SearchBox
            value={searchQuery}
            placeholder="Search integration types"
            iconPosition="end"
            autoFocus={true}
            onChange={setSearchQuery}
            sx={{ width: "100%" }}
        />
    );

    const railCount = (key: RailKey) =>
        key === ALL_KEY ? totalCount : countFor(searchFilteredByKey.get(key));

    const railLabel = (key: RailKey) => {
        if (key === ALL_KEY) {
            return "All";
        }
        const category = ARTIFACT_CATEGORIES.find((item) => item.key === key);
        return category?.shortTitle ?? category?.title ?? key;
    };

    const railIcon = (key: RailKey) => {
        if (key === ALL_KEY) {
            return "layers";
        }
        return ARTIFACT_CATEGORIES.find((item) => item.key === key)?.icon;
    };

    return (
        <StepRoot ref={ref}>
            {useSingleColumn ? (
                <>
                    <NarrowHeader>
                        <ChipRow role="tablist" aria-label="Integration categories">
                            {RAIL_KEYS.map((key) => {
                                const count = railCount(key);
                                return (
                                    <Chip
                                        key={key}
                                        role="tab"
                                        aria-selected={activeCategoryKey === key}
                                        active={activeCategoryKey === key}
                                        onClick={() => setActiveCategoryKey(key)}
                                    >
                                        {railLabel(key)}
                                        {count !== undefined && <RailCount>{count}</RailCount>}
                                    </Chip>
                                );
                            })}
                        </ChipRow>
                        <SearchSlot>{searchBox}</SearchSlot>
                    </NarrowHeader>
                    {grid}
                </>
            ) : (
                <Body>
                    <LeftColumn>
                        {searchBox}
                        <Rail role="tablist" aria-label="Integration categories" onKeyDown={handleRailKeyDown}>
                            {RAIL_KEYS.map((key) => {
                                const count = railCount(key);
                                const icon = railIcon(key);
                                return (
                                    <RailItem
                                        key={key}
                                        id={`rail-${key}`}
                                        role="tab"
                                        aria-selected={activeCategoryKey === key}
                                        tabIndex={activeCategoryKey === key ? 0 : -1}
                                        active={activeCategoryKey === key}
                                        onClick={() => setActiveCategoryKey(key)}
                                    >
                                        {icon && <Codicon name={icon} />}
                                        <RailLabel>{railLabel(key)}</RailLabel>
                                        {count !== undefined && <RailCount>{count}</RailCount>}
                                    </RailItem>
                                );
                            })}
                        </Rail>
                    </LeftColumn>
                    {grid}
                </Body>
            )}
        </StepRoot>
    );
}
