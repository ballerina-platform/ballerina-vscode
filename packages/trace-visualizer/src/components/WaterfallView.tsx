/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import styled from '@emotion/styled';
import { SpanData } from '../index';
import { Codicon, Icon } from '@wso2/ui-toolkit';
import {
    doesSpanMatch,
    getSpanTypeBadge,
    getSpanLabel,
    getSpanKindLabel,
    HighlightText,
    getSpanTimeRange,
    formatDuration,
    stripSpanPrefix,
    getSpanTokens,
    getSpanColor
} from '../utils';
import { NoResultsContainer, NoResultsTitle, ClearSearchButton } from './shared-styles';

// --- Interfaces ---

interface WaterfallViewProps {
    spans: SpanData[];
    selectedSpanId: string | null;
    onSpanSelect: (spanId: string) => void;
    getChildSpans: (spanId: string) => SpanData[];
    traceStartTime: string;
    traceDuration: number;
    collapsedSpanIds: Set<string>;
    setCollapsedSpanIds: (ids: Set<string>) => void;
    searchQuery: string;
    onClearSearch?: () => void;
}

interface FlatSpan extends SpanData {
    status: any;
    level: number;
    startOffsetMs: number;
    durationMs: number;
    hasChildren: boolean;
    isCollapsed: boolean;
}

// --- Styled Components ---

const WaterfallContainer = styled.div`
    background-color: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: 0 8px;
    height: 100%;
    container-type: inline-size;
`;

const ZoomControlsBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 8px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
    gap: 8px;
`;

const ZoomControlsGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ZoomButton = styled.button`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: background-color 0.15s ease;
    height: 26px; /* Explicit height for consistency */

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:active {
        transform: scale(0.98);
    }
    
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const ZoomSlider = styled.input`
    width: 100px;
    height: 4px;
    appearance: none;
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 2px;
    cursor: pointer;
    outline: none;

    &::-webkit-slider-thumb {
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--vscode-button-background);
        cursor: pointer;
    }
`;

const ZoomLabel = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    min-width: 12px;
    text-align: right;
`;

const TimelineScrollArea = styled.div`
    flex: 1;
    overflow-x: auto;
    overflow-y: auto;
    position: relative;
    
    &::-webkit-scrollbar {
        width: 10px;
        height: 10px;
    }
    &::-webkit-scrollbar-thumb {
        background: var(--vscode-scrollbarSlider-background);
        border-radius: 5px;
    }
    &::-webkit-scrollbar-corner {
        background: transparent;
    }
`;

const TimelineContent = styled.div<{ widthPercent: number }>`
    width: ${(props: { widthPercent: number }) => props.widthPercent}%;
    min-width: 100%;
    position: relative;
    height: 100%;
`;

const TimeAxis = styled.div`
    position: sticky;
    top: 0;
    height: 24px;
    width: 100%;
    border-bottom: 1px solid var(--vscode-panel-border);
    background-color: var(--vscode-editorWidget-background);
    z-index: 10;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
`;

const TimeMarker = styled.div<{ left: number }>`
    position: absolute;
    left: ${(props: { left: number }) => props.left}%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
`;

const TimeMarkerTick = styled.div`
    width: 1px;
    height: 4px;
    background-color: var(--vscode-descriptionForeground);
`;

const TimeMarkerLabel = styled.span`
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
    white-space: nowrap;
`;

const SpansContainer = styled.div`
    position: relative;
    width: 100%;
    min-height: calc(100% - 24px); 
`;

const GridLinesContainer = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 0;
`;

const GridLineVertical = styled.div<{ left: number }>`
    position: absolute;
    left: ${(props: { left: number }) => props.left}%;
    top: 0;
    bottom: 0;
    width: 1px;
    background-color: var(--vscode-editor-lineHighlightBorder);
    opacity: 0.4;
`;

const SpanRow = styled.div<{ isSelected: boolean; level: number }>`
    position: relative;
    height: 44px;
    width: 100%;
    display: flex;
    align-items: center;
    background-color: ${(props: { isSelected: boolean }) => props.isSelected
        ? 'var(--vscode-list-inactiveSelectionBackground)'
        : 'transparent'};

    &:hover {
        background-color: ${(props: { isSelected: boolean }) => props.isSelected
        ? 'var(--vscode-list-inactiveSelectionBackground)'
        : 'var(--vscode-list-hoverBackground)'};
    }
`;

const HierarchyGuide = styled.div<{ level: number }>`
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: ${(props: { level: number }) => props.level * 12}px;
    border-right: 1px solid transparent;
    pointer-events: none;
    background: linear-gradient(90deg, transparent 95%, var(--vscode-tree-indentGuidesStroke) 100%);
    background-size: 12px 100%;
    opacity: 0.3;
    z-index: 0;
`;

interface SpanBarProps {
    type: string;
    left: number;
    width: number;
}

const SpanBar = styled.div<SpanBarProps>`
    position: absolute;
    top: 4px;
    height: 38px;
    left: ${(props: SpanBarProps) => props.left}%;
    width: ${(props: SpanBarProps) => Math.max(props.width, 0.1)}%; 
    box-sizing: border-box;
    
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 6px 6px;
    gap: 6px;
    overflow: visible;
    transition: opacity 0.15s ease;
    z-index: 2;

    border: 1px solid;
    border-color: ${(props: SpanBarProps) => getSpanColor(props.type)};
    background-color: ${(props: SpanBarProps) => getSpanBgColor(props.type)};

    &:hover {
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        z-index: 3;
    }
`;

const ChevronWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
    
    &:hover {
        background-color: rgba(255, 255, 255, 0.2);
    }
`;

const SpanBarIcon = styled.span<{ type: string }>`
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: ${(props: { type: string; }) => getSpanColor(props.type)};
`;

const SpanBarLabel = styled.span`
    font-size: 11px;
    white-space: nowrap;
    flex: 1;
    font-weight: 500;
    color: var(--vscode-foreground);
    mix-blend-mode: hard-light;
`;

const SpanBarDuration = styled.span`
    font-size: 10px;
    opacity: 0.8;
    flex-shrink: 0;
    margin-left: auto;
    padding-left: 4px;
`;

const Tooltip = styled.div<{ x: number; y: number }>`
    position: fixed;
    left: ${(props: { x: number; y: number }) => props.x}px;
    top: ${(props: { x: number; y: number }) => props.y}px;
    background-color: var(--vscode-editorHoverWidget-background);
    border: 1px solid var(--vscode-editorHoverWidget-border);
    border-radius: 4px;
    padding: 10px;
    z-index: 1000;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
    max-width: 320px;
    pointer-events: none;
`;

const TooltipHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 6px;
`;

const TooltipBadge = styled.span<{ type: string }>`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    background-color: ${(props: { type: string }) => getSpanColor(props.type)};
    color: var(--vscode-editor-background);
`;

const TooltipName = styled.span`
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
    word-break: break-all;
`;

const TooltipDetails = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const TooltipRow = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    justify-content: space-between;
    gap: 12px;

    span.value {
        color: var(--vscode-foreground);
        font-family: var(--vscode-editor-font-family);
    }
`;

// --- Helper Functions ---

const getSpanKindString = (kind: any): string => {
    if (kind === 3 || kind === 'CLIENT') return 'client';
    if (kind === 2 || kind === 'SERVER') return 'server';
    if (kind === 4 || kind === 'PRODUCER') return 'producer';
    if (kind === 5 || kind === 'CONSUMER') return 'consumer';
    return 'internal';
};

const getSpanBgColor = (type: string) => {
    return 'var(--vscode-editor-background)';
};

const getSpanType = (span: SpanData): 'invoke' | 'chat' | 'tool' | 'kb_retrieve' | 'kb_ingest' | 'embeddings' | 'generate_content' | 'error' | 'client' | 'server' | 'other' => {
    if (span.status?.code === 2) return 'error';

    const operationName = span.attributes?.find(attr => attr.key === 'gen_ai.operation.name')?.value || '';
    if (operationName.startsWith('invoke_agent')) return 'invoke';
    if (operationName.startsWith('chat') || span.name.toLowerCase().startsWith('chat')) return 'chat';
    if (operationName.startsWith('execute_tool') || span.name.toLowerCase().startsWith('execute_tool')) return 'tool';
    if (operationName.startsWith('knowledge_base_retrieve') || span.name.toLowerCase().startsWith('knowledge_base_retrieve')) return 'kb_retrieve';
    if (operationName.startsWith('knowledge_base_ingest') || span.name.toLowerCase().startsWith('knowledge_base_ingest')) return 'kb_ingest';
    if (operationName.startsWith('embeddings') || span.name.toLowerCase().startsWith('embeddings')) return 'embeddings';
    if (operationName.startsWith('generate_content') || span.name.toLowerCase().startsWith('generate_content')) return 'generate_content';

    const kind = getSpanKindString(span.kind);
    if (kind === 'client') return 'client';
    if (kind === 'server') return 'server';

    return 'other';
};

const getTypeLabel = (type: string): string => {
    switch (type) {
        case 'invoke': return 'Agent';
        case 'chat': return 'Model';
        case 'tool': return 'Tool';
        case 'kb_retrieve': return 'Knowledge Base Retrieve';
        case 'kb_ingest': return 'Knowledge Base Ingest';
        case 'embeddings': return 'Embeddings';
        case 'generate_content': return 'Generate Content';
        case 'error': return 'Error';
        case 'client': return 'Client';
        case 'server': return 'Server';
        default: return 'Span';
    }
};

const getTypeIcon = (type: string): string => {
    switch (type) {
        case 'invoke': return 'bi-ai-agent';
        case 'chat': return 'bi-chat';
        case 'tool': return 'bi-wrench';
        case 'kb_retrieve': return 'bi-ai-search';
        case 'kb_ingest': return 'bi-import';
        case 'embeddings': return 'bi-ai-model';
        case 'generate_content': return 'bi-doc';
        case 'error': return 'bi-error';
        case 'client': return 'bi-arrow-outward';
        case 'server': return 'bi-server';
        default: return 'bi-action';
    }
};

// --- Main Component ---

export function WaterfallView({
    spans,
    selectedSpanId,
    onSpanSelect,
    getChildSpans,
    traceStartTime,
    traceDuration,
    collapsedSpanIds,
    setCollapsedSpanIds,
    searchQuery,
    onClearSearch
}: WaterfallViewProps) {
    const [zoom, setZoom] = useState(1);
    const [hoveredSpan, setHoveredSpan] = useState<{ span: FlatSpan; x: number; y: number } | null>(null);
    const [isCompact, setIsCompact] = useState(false);
    const [scrollContainerWidth, setScrollContainerWidth] = useState(1000);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const traceStartMs = useMemo(() => new Date(traceStartTime).getTime(), [traceStartTime]);

    /**
     * EXTENDED MATCH LOGIC
     * Checks if span matches the query by Name, Attributes, Label, or Kind.
     */
    const extendedDoesSpanMatch = (span: SpanData): boolean => {
        if (!searchQuery) return true;

        // 1. Check existing match logic (Name, attributes, etc.)
        if (doesSpanMatch(span, searchQuery)) return true;

        // 2. Check Span Label (e.g. "LLM Call", "Tool", etc.)
        const badgeType = getSpanTypeBadge(span);
        const label = getSpanLabel(badgeType);
        if (label && label.toLowerCase().includes(searchQuery.toLowerCase())) return true;

        // 3. Check Span Kind (e.g. "CLIENT", "SERVER")
        const kind = getSpanKindLabel(span.kind);
        if (kind && kind.toLowerCase().includes(searchQuery.toLowerCase())) return true;

        return false;
    };

    // Resize Observer for Compact Mode
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // If width < 300px, switch to compact mode
                setIsCompact(entry.contentRect.width < 300);
                // Update scrollContainerWidth to trigger timelineLayout recalc
                if (scrollContainerRef.current) {
                    setScrollContainerWidth(scrollContainerRef.current.clientWidth);
                }
            }
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Helper to check if a span or any of its descendants match the search
    const spanOrDescendantMatches = useMemo(() => {
        const cache = new Map<string, boolean>();

        const checkMatch = (span: SpanData): boolean => {
            if (cache.has(span.spanId)) {
                return cache.get(span.spanId)!;
            }

            // Check if this span matches
            if (extendedDoesSpanMatch(span)) {
                cache.set(span.spanId, true);
                return true;
            }

            // Check if any child matches
            const children = getChildSpans(span.spanId);
            for (const child of children) {
                if (checkMatch(child)) {
                    cache.set(span.spanId, true);
                    return true;
                }
            }

            cache.set(span.spanId, false);
            return false;
        };

        return checkMatch;
    }, [searchQuery, spans, getChildSpans]);

    // Flatten Span Hierarchy with search filtering
    const flatSpans = useMemo(() => {
        const result: FlatSpan[] = [];
        const processed = new Set<string>();

        const processSpan = (span: SpanData, level: number) => {
            if (processed.has(span.spanId)) return;
            processed.add(span.spanId);

            // Skip this span if it doesn't match the search (and no descendants match)
            if (searchQuery && !spanOrDescendantMatches(span)) {
                return;
            }

            const range = getSpanTimeRange(span);
            const startOffsetMs = range ? Math.max(0, range.start - traceStartMs) : 0;
            const durationMs = range ? Math.max(0, range.end - range.start) : 0;

            // Check children presence and sort them
            let children = getChildSpans(span.spanId);
            children.sort((a, b) => {
                const aStart = getSpanTimeRange(a)?.start || 0;
                const bStart = getSpanTimeRange(b)?.start || 0;
                return aStart - bStart;
            });

            // Filter children based on search
            if (searchQuery) {
                children = children.filter(child => spanOrDescendantMatches(child));
            }

            const hasChildren = children.length > 0;
            // Auto-expand when searching
            const isCollapsed = searchQuery ? false : collapsedSpanIds.has(span.spanId);

            result.push({
                ...span,
                level,
                startOffsetMs,
                durationMs,
                hasChildren,
                isCollapsed
            });

            // Recurse only if not collapsed
            if (hasChildren && !isCollapsed) {
                children.forEach(child => processSpan(child, level + 1));
            }
        };

        const allSpanIds = new Set(spans.map(s => s.spanId));
        const roots = spans.filter(span =>
            !span.parentSpanId ||
            span.parentSpanId === '0000000000000000' ||
            !allSpanIds.has(span.parentSpanId)
        ).sort((a, b) => {
            const aStart = getSpanTimeRange(a)?.start || 0;
            const bStart = getSpanTimeRange(b)?.start || 0;
            return aStart - bStart;
        });

        roots.forEach(span => processSpan(span, 0));
        return result;
    }, [spans, getChildSpans, traceStartMs, collapsedSpanIds, searchQuery, spanOrDescendantMatches]);

    // Calculate actual content duration (longest span)
    const contentMaxDurationMs = useMemo(() => {
        let max = traceDuration;
        flatSpans.forEach(s => {
            if (s.startOffsetMs + s.durationMs > max) {
                max = s.startOffsetMs + s.durationMs;
            }
        });
        return max > 0 ? max : 1000;
    }, [flatSpans, traceDuration]);

    // Generate Layout Data: Ticks and View Duration
    const timelineLayout = useMemo(() => {
        const totalPixels = zoom * scrollContainerWidth;
        const targetTicks = Math.max(5, Math.floor(totalPixels / 150));

        const rawInterval = contentMaxDurationMs / targetTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)));
        const normalized = rawInterval / magnitude;

        let interval;
        if (normalized < 1.5) interval = 1 * magnitude;
        else if (normalized < 3) interval = 2 * magnitude;
        else if (normalized < 7.5) interval = 5 * magnitude;
        else interval = 10 * magnitude;

        const viewDuration = Math.ceil(contentMaxDurationMs / interval) * interval;
        const finalViewDuration = viewDuration < contentMaxDurationMs ? viewDuration + interval : viewDuration;

        const markers: number[] = [];
        for (let t = 0; t <= finalViewDuration; t += interval) {
            markers.push(t);
        }

        return {
            markers,
            viewDuration: finalViewDuration
        };
    }, [contentMaxDurationMs, zoom, scrollContainerWidth]);

    const formatTimeMarker = (ms: number): string => {
        if (ms === 0) return '0ms';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const handleSpanMouseEnter = (span: FlatSpan, event: React.MouseEvent) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const screenWidth = window.innerWidth;
        const x = Math.min(rect.left + rect.width / 2, screenWidth - 340);

        setHoveredSpan({
            span,
            x: Math.max(10, x),
            y: rect.top - 10
        });
    };

    // Collapse Actions
    const handleToggleCollapse = (spanId: string) => {
        const newSet = new Set(collapsedSpanIds);
        if (newSet.has(spanId)) {
            newSet.delete(spanId);
        } else {
            newSet.add(spanId);
        }
        setCollapsedSpanIds(newSet);
    };

    const handleToggleAll = () => {
        // If we have any collapsed spans, we expand all (clear set)
        // If nothing is collapsed, we collapse all parents
        if (collapsedSpanIds.size > 0) {
            setCollapsedSpanIds(new Set());
        } else {
            const allParentIds = new Set<string>();
            spans.forEach(s => {
                const children = getChildSpans(s.spanId);
                if (children.length > 0) {
                    allParentIds.add(s.spanId);
                }
            });
            setCollapsedSpanIds(allParentIds);
        }
    };

    // Determine icon for the "Toggle All" button
    const isAnyCollapsed = collapsedSpanIds.size > 0;

    // Check if we have no results
    const noResults = searchQuery && flatSpans.length === 0;

    return (
        <WaterfallContainer ref={containerRef}>
            {/* No Results Message */}
            {noResults && (
                <NoResultsContainer>
                    <NoResultsTitle>No results found</NoResultsTitle>
                    <ClearSearchButton onClick={() => onClearSearch?.()}>
                        <Icon
                            name="bi-close"
                            sx={{ fontSize: "16px", width: "16px", height: "16px" }}
                            iconSx={{ display: "flex" }}
                        />
                        Clear search
                    </ClearSearchButton>
                </NoResultsContainer>
            )}

            {/* Zoom Controls */}
            {!noResults && (
                <>
                    <ZoomControlsBar>
                        <ZoomControlsGroup>
                            <ZoomButton
                                onClick={() => setZoom(Math.max(1, zoom - 1))}
                                title="Zoom out"
                                disabled={zoom <= 1}
                            >
                                <Codicon name="zoom-out" />
                            </ZoomButton>
                            {!isCompact && (
                                <>
                                    <ZoomSlider
                                        type="range"
                                        min="1"
                                        max="20"
                                        step="0.5"
                                        value={zoom}
                                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                                    />
                                    <ZoomLabel>{zoom.toFixed(1)}x</ZoomLabel>
                                </>
                            )}
                            <ZoomButton
                                onClick={() => setZoom(Math.min(20, zoom + 1))}
                                title="Zoom in"
                                disabled={zoom >= 20}
                            >
                                <Codicon name="zoom-in" />
                            </ZoomButton>
                        </ZoomControlsGroup>
                    </ZoomControlsBar>

                    {/* Scroll Area */}
                    <TimelineScrollArea ref={scrollContainerRef}>
                        <TimelineContent widthPercent={zoom * 100}>
                            {/* Time Axis */}
                            <TimeAxis>
                                {timelineLayout.markers.map((ms) => (
                                    <TimeMarker key={ms} left={(ms / timelineLayout.viewDuration) * 100}>
                                        <TimeMarkerTick />
                                        <TimeMarkerLabel>{formatTimeMarker(ms)}</TimeMarkerLabel>
                                    </TimeMarker>
                                ))}
                            </TimeAxis>

                            <SpansContainer>
                                {/* Background Grid */}
                                <GridLinesContainer>
                                    {timelineLayout.markers.map((ms) => (
                                        <GridLineVertical
                                            key={ms}
                                            left={(ms / timelineLayout.viewDuration) * 100}
                                        />
                                    ))}
                                </GridLinesContainer>

                                {/* Span Rows */}
                                {flatSpans.map((span) => {
                                    const spanType = getSpanType(span);
                                    const isSelected = selectedSpanId === span.spanId;
                                    const leftPercent = (span.startOffsetMs / timelineLayout.viewDuration) * 100;
                                    const widthPercent = (span.durationMs / timelineLayout.viewDuration) * 100;

                                    return (
                                        <SpanRow
                                            key={span.spanId}
                                            isSelected={isSelected}
                                            level={span.level}
                                        >
                                            <HierarchyGuide level={span.level} />
                                            <SpanBar
                                                type={spanType}
                                                left={leftPercent}
                                                width={widthPercent}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSpanSelect(span.spanId);
                                                }}
                                                onMouseEnter={(e) => handleSpanMouseEnter(span, e)}
                                                onMouseLeave={() => setHoveredSpan(null)}
                                                style={{
                                                    backgroundColor: `color-mix(in srgb, ${getSpanColor(spanType)} 15%, transparent)`
                                                }}
                                            >
                                                {/* Expand/Collapse Chevron */}
                                                {span.hasChildren && (
                                                    <ChevronWrapper
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleToggleCollapse(span.spanId);
                                                        }}
                                                    >
                                                        <Codicon
                                                            name={span.isCollapsed ? "chevron-right" : "chevron-down"}
                                                            sx={{ fontSize: '12px' }}
                                                        />
                                                    </ChevronWrapper>
                                                )}

                                                <SpanBarIcon type={spanType}>
                                                    <Icon
                                                        name={getTypeIcon(spanType)}
                                                        sx={{
                                                            fontSize: '14px',
                                                            width: '14px',
                                                            height: '14px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}
                                                        iconSx={{
                                                            fontSize: '14px',
                                                            display: 'flex'
                                                        }}
                                                    />
                                                </SpanBarIcon>
                                                <SpanBarLabel>
                                                    <HighlightText text={stripSpanPrefix(span.name)} query={searchQuery} />
                                                </SpanBarLabel>
                                                <SpanBarDuration>{formatDuration(span.durationMs)}</SpanBarDuration>
                                            </SpanBar>
                                        </SpanRow>
                                    );
                                })}
                            </SpansContainer>
                        </TimelineContent>
                    </TimelineScrollArea>
                </>
            )}

            {/* Hover Tooltip */}
            {hoveredSpan && (
                <Tooltip x={hoveredSpan.x} y={hoveredSpan.y - 100}>
                    <TooltipHeader>
                        <TooltipBadge type={getSpanType(hoveredSpan.span)}>
                            {getTypeLabel(getSpanType(hoveredSpan.span))}
                        </TooltipBadge>
                        <TooltipName>{stripSpanPrefix(hoveredSpan.span.name)}</TooltipName>
                    </TooltipHeader>
                    <TooltipDetails>
                        <TooltipRow>
                            Start: <span className="value">+{formatDuration(hoveredSpan.span.startOffsetMs)}</span>
                        </TooltipRow>
                        <TooltipRow>
                            Duration: <span className="value">{formatDuration(hoveredSpan.span.durationMs)}</span>
                        </TooltipRow>
                        {getSpanTokens(hoveredSpan.span) > 0 && (
                            <TooltipRow>
                                Tokens: <span className="value">{getSpanTokens(hoveredSpan.span).toLocaleString()}</span>
                            </TooltipRow>
                        )}
                        <TooltipRow>
                            Status: <span className="value" style={{
                                color: hoveredSpan.span.status?.code === 2 ? 'var(--vscode-terminal-ansiRed)' : 'inherit'
                            }}>
                                {hoveredSpan.span.status?.code === 2 ? 'Error' : 'Success'}
                            </span>
                        </TooltipRow>
                    </TooltipDetails>
                </Tooltip>
            )}
        </WaterfallContainer>
    );
}
