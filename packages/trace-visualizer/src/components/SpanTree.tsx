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

import React, { useMemo, useState } from "react";
import styled from "@emotion/styled";
import { TraceData, SpanData } from "../index";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { AIBadge } from "./AIBadge";
import {
    formatDuration,
    getSpanDuration,
    getSpanKindLabel,
    stripSpanPrefix,
    getSpanTypeBadge,
    spanHasError,
    isAISpan,
    getSpanLabel,
    doesSpanMatch,
    HighlightText,
    buildAIParentMap,
    getAIChildSpansFrom
} from "../utils";
import { NoResultsContainer, NoResultsTitle, ClearSearchButton } from "./shared-styles";

// ============================================================================
// STYLES
// ============================================================================

export const AISpanTreeContainer = styled.div`
    background-color: var(--vscode-editor-background);
    flex: 1;
    overflow-y: hidden;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 0;
`;

// New Scrollable Area for the tree itself
const TreeScrollArea = styled.div`
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 0 0 12px;
`;

const TreeNodeContainer = styled.div<{ isLast?: boolean }>`
    position: relative;
    display: flex;
    flex-direction: column;
    
    &::before {
        content: '';
        position: absolute;
        left: -13px;
        width: 1px;
        background-color: var(--vscode-tree-indentGuidesStroke);
        top: 0;
        height: ${(props: { isLast?: boolean }) => props.isLast ? '16px' : '100%'};
        z-index: 1;
    }
`;

const TreeNodeChildren = styled.div`
    margin-left: 6px; 
    padding-left: 12px;
    position: relative;

    &::before {
        content: '';
        position: absolute;
        top: -16px; 
        left: -1px; 
        width: 1px;
        height: 20px;
        background-color: var(--vscode-tree-indentGuidesStroke);
    }
`;

const ConnectorCurve = styled.div`
    position: absolute;
    left: -13px; 
    top: 0;
    width: 8px;
    height: 16px;
    border-bottom: 1px solid var(--vscode-tree-indentGuidesStroke);
    border-left: 1px solid var(--vscode-tree-indentGuidesStroke);
    pointer-events: none;
`;

// AI rows have two text lines, so the curve ends at the row's centre rather than a fixed 16px
const AIConnectorCurve = styled(ConnectorCurve)`
    top: -4px;
    height: calc(50% + 3.5px);
`;

const AISpanTreeItem = styled.div<{ isSelected: boolean }>`
    display: flex;
    flex-direction: column;
    padding: 4px 8px 4px 0; 
    margin: 4px 0;
    cursor: pointer;
    border-radius: 0; 
    gap: 6px;
    z-index: 0; 
    
    position: relative;
    min-height: 32px;

    &::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        left: -100vw; 
        z-index: -1; 
        
        background-color: ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-list-inactiveSelectionBackground)' : 'transparent'};
        transition: background-color 0.15s ease;
    }

    &:hover::before {
        background-color: ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-list-inactiveSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

const AISpanLabel = styled.span`
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex: 1;
    min-width: 0;

    > span:first-of-type {
        flex-shrink: 0;
    }

    > span:nth-of-type(2) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }
`;

const AISpanTopRow = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
`;

const ChevronToggleWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin-left: auto;
    flex-shrink: 0;
    color: var(--vscode-descriptionForeground);

    &:hover {
        color: var(--vscode-foreground);
    }
`;

const AISpanDuration = styled.span`
    font-size: 10px;
    color: inherit;
    display: flex;
    align-items: center;
    gap: 3px;
`;

const AISpanTokenCount = styled.span`
    font-size: 10px;
    color: inherit;
    display: inline;
`;

const AISpanMetadataGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-left: 0;
    margin-top: 2px;
`;

const AISpanMetadataPill = styled.span`
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 4px;
    background-color: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-editor-foreground);
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-weight: 300;
`;

const AISpanErrorIcon = styled.span`
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--vscode-errorForeground);
    flex-shrink: 0;
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
    max-width: 280px;
    pointer-events: none;
`;

const TooltipRow = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0;

    span.value {
        color: var(--vscode-foreground);
        font-family: var(--vscode-editor-font-family);
        font-weight: 500;
    }
`;

const TooltipDivider = styled.div`
    height: 1px;
    background-color: var(--vscode-panel-border);
    margin: 6px 0;
`;

// ============================================================================
// ADVANCED MODE STYLES
// ============================================================================

const AdvancedSpanGroup = styled.div`
    margin-top: 4px;
    margin-bottom: 4px;
`;

const AdvancedSpanGroupHeader = styled.div<{ isExpanded: boolean }>`
    display: flex;
    align-items: center;
    padding: 6px 8px;
    cursor: pointer;
    border-radius: 3px;
    gap: 8px;
    background-color: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
    font-size: 12px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

const AdvancedSpanGroupContent = styled.div`
    margin-left: 16px;
    border-left: 1px solid var(--vscode-tree-indentGuidesStroke);
    padding-left: 8px;
`;

const AdvancedSpanItem = styled.div<{ isSelected: boolean }>`
    display: flex;
    flex-direction: column;
    padding: 4px 8px 4px 0; 
    margin: 4px 0;
    cursor: pointer;
    border-radius: 0; 
    gap: 6px;
    z-index: 0; 
    
    position: relative;
    min-height: 32px;

    &::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        left: -100vw; 
        z-index: -1;
        
        background-color: ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-list-inactiveSelectionBackground)' : 'transparent'};
        transition: background-color 0.15s ease;
    }

    &:hover::before {
        background-color: ${(props: { isSelected: boolean }) =>
        props.isSelected ? 'var(--vscode-list-inactiveSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

const NonAISpanTopRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
`;

const NonAISpanLabel = styled.span`
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    flex: 1;
    min-width: 0;

    > span:first-of-type {
        flex-shrink: 0;
    }

    > span:nth-of-type(2) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }
`;

const NonAISpanIcon = styled.span<{ spanKind: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 3px;
    flex-shrink: 0;
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-dropdown-border);
    color: ${(props: { spanKind: string }) => {
        switch (props.spanKind.toLowerCase()) {
            case 'client': return 'var(--vscode-terminal-ansiBlue)';
            case 'server': return 'var(--vscode-terminal-ansiGreen)';
            default: return 'var(--vscode-foreground)';
        }
    }};
`;

// ============================================================================
// COMPONENT
// ============================================================================

interface SpanTreeProps {
    traceData: TraceData;
    rootAISpans: SpanData[];
    sortedRootSpans: SpanData[];
    isAdvancedMode: boolean;
    expandedSpans: Set<string>;
    selectedSpanId: string | null;
    expandedAdvancedSpanGroups: Set<string>;
    onSelectSpan: (spanId: string) => void;
    onToggleSpanExpansion: (spanId: string) => void;
    setExpandedAdvancedSpanGroups: (groups: Set<string>) => void;
    getChildSpans: (spanId: string) => SpanData[];
    containerWidth: number;
    searchQuery: string;
    onClearSearch?: () => void;
}

export function SpanTree({
    traceData,
    rootAISpans,
    sortedRootSpans,
    isAdvancedMode,
    expandedSpans,
    selectedSpanId,
    expandedAdvancedSpanGroups,
    onSelectSpan,
    onToggleSpanExpansion,
    setExpandedAdvancedSpanGroups,
    getChildSpans,
    containerWidth,
    searchQuery,
    onClearSearch
}: SpanTreeProps) {

    const [hoveredTokenInfo, setHoveredTokenInfo] = useState<{
        input: number;
        output: number;
        total: number;
        includesSubAgents: boolean;
        x: number;
        y: number;
    } | null>(null);

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

    // Helper functions moved from TraceDetails
    const aiParents = useMemo(() => buildAIParentMap(traceData.spans), [traceData.spans]);
    const getAIChildSpans = (spanId: string): SpanData[] => getAIChildSpansFrom(traceData.spans, aiParents, spanId);

    const hasSubAgent = (spanId: string): boolean =>
        getAIChildSpans(spanId).some(child => getSpanTypeBadge(child) === 'invoke' || hasSubAgent(child.spanId));

    const calculateTokenBreakdown = (spanId: string): { input: number; output: number } => {
        const span = traceData.spans.find(s => s.spanId === spanId);
        if (!span) return { input: 0, output: 0 };
        let input = parseInt(span.attributes?.find(attr => attr.key === 'gen_ai.usage.input_tokens')?.value || '0');
        let output = parseInt(span.attributes?.find(attr => attr.key === 'gen_ai.usage.output_tokens')?.value || '0');
        if (isNaN(input)) input = 0;
        if (isNaN(output)) output = 0;
        const children = getAIChildSpans(spanId);
        children.forEach(child => {
            const childTokens = calculateTokenBreakdown(child.spanId);
            input += childTokens.input;
            output += childTokens.output;
        });
        return { input, output };
    };

    const getNonAIChildSpans = (parentSpanId: string): SpanData[] => {
        const parentSpan = traceData.spans.find(s => s.spanId === parentSpanId);
        if (!parentSpan || !parentSpan.startTime || !parentSpan.endTime) return [];
        const parentStart = new Date(parentSpan.startTime).getTime();
        const parentEnd = new Date(parentSpan.endTime).getTime();
        const nonAISpans = traceData.spans.filter(span =>
            !span.attributes?.some(attr => attr.key === 'span.type' && attr.value === 'ai')
        );
        const containedSpans: SpanData[] = [];
        nonAISpans.forEach(span => {
            if (!span.startTime || !span.endTime) return;
            const spanStart = new Date(span.startTime).getTime();
            const spanEnd = new Date(span.endTime).getTime();
            if (spanStart >= parentStart && spanEnd <= parentEnd) {
                const aiChildren = getAIChildSpans(parentSpanId);
                let isDirectChild = true;
                for (const aiChild of aiChildren) {
                    if (!aiChild.startTime || !aiChild.endTime) continue;
                    const aiChildStart = new Date(aiChild.startTime).getTime();
                    const aiChildEnd = new Date(aiChild.endTime).getTime();
                    if (spanStart >= aiChildStart && spanEnd <= aiChildEnd) {
                        isDirectChild = false;
                        break;
                    }
                }
                if (isDirectChild) containedSpans.push(span);
            }
        });
        return containedSpans.sort((a, b) => {
            const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
            const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
            return aTime - bTime;
        });
    };

    const groupNonAISpans = (spans: SpanData[]): Map<string, SpanData[]> => {
        const groups = new Map<string, SpanData[]>();
        spans.forEach(span => {
            const kind = getSpanKindLabel(span.kind);
            let category = 'Other';
            const httpAttr = span.attributes?.find(attr => attr.key.toLowerCase().includes('http') || attr.key.toLowerCase().includes('url'));
            const dbAttr = span.attributes?.find(attr => attr.key.toLowerCase().includes('db') || attr.key.toLowerCase().includes('sql'));

            if (httpAttr || span.name.toLowerCase().includes('http')) category = 'HTTP Calls';
            else if (dbAttr || span.name.toLowerCase().includes('db') || span.name.toLowerCase().includes('sql')) category = 'Database Operations';
            else if (kind === 'CLIENT') category = 'Client Calls';
            else if (kind === 'SERVER') category = 'Server Operations';

            if (!groups.has(category)) groups.set(category, []);
            groups.get(category)!.push(span);
        });
        return groups;
    };

    const getChildSpansFromList = (parentSpanId: string, spanList: SpanData[]): SpanData[] => {
        const children = spanList.filter(s => s.parentSpanId === parentSpanId);
        return children.sort((a, b) => {
            const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
            const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
            return aTime - bTime;
        });
    };

    const renderExpandChevron = (hasChildren: boolean, isExpanded: boolean, onClick: (e: React.MouseEvent) => void) => {
        if (!hasChildren) return null;
        return (
            <ChevronToggleWrapper onClick={onClick} style={{ cursor: 'pointer' }}>
                <Codicon name={isExpanded ? 'chevron-down' : 'chevron-right'} />
            </ChevronToggleWrapper>
        );
    };

    const renderAISpanContent = (span: SpanData, isSelected: boolean, hasChildren: boolean, isExpanded: boolean, onToggle: (e: React.MouseEvent) => void, showConnector: boolean = false) => {
        const badgeType = getSpanTypeBadge(span);
        const duration = getSpanDuration(span);
        const isVeryNarrow = containerWidth < 500;
        let inputTokens = 0;
        let outputTokens = 0;

        if (badgeType === 'invoke' && hasChildren) {
            const breakdown = calculateTokenBreakdown(span.spanId);
            inputTokens = breakdown.input;
            outputTokens = breakdown.output;
        } else {
            inputTokens = parseInt(span.attributes?.find(attr => attr.key === 'gen_ai.usage.input_tokens')?.value || '0') || 0;
            outputTokens = parseInt(span.attributes?.find(attr => attr.key === 'gen_ai.usage.output_tokens')?.value || '0') || 0;
        }
        const totalTokens = inputTokens + outputTokens;

        return (
            <AISpanTreeItem isSelected={isSelected} onClick={() => onSelectSpan(span.spanId)} data-span-id={span.spanId}>
                <AISpanTopRow>
                    {showConnector && <AIConnectorCurve />}
                    <AIBadge type={badgeType} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', minWidth: 0 }}>
                            <AISpanLabel>
                                <span style={{ fontWeight: 600 }}>
                                    {/* Updated to highlight label */}
                                    <HighlightText text={getSpanLabel(badgeType)} query={searchQuery} />
                                </span>
                                <span title={span.name}>
                                    <HighlightText text={stripSpanPrefix(span.name)} query={searchQuery} />
                                </span>
                            </AISpanLabel>
                            {spanHasError(span) && (
                                <AISpanErrorIcon>
                                    <Icon name="bi-error" sx={{ fontSize: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} iconSx={{ fontSize: "16px", display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                                </AISpanErrorIcon>
                            )}
                        </div>
                        <AISpanMetadataGroup>
                            {duration !== null && (
                                <AISpanMetadataPill>
                                    <AISpanDuration>
                                        <Icon name="bi-clock" sx={{ fontSize: '12px', width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} iconSx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                                        {formatDuration(duration)}
                                    </AISpanDuration>
                                </AISpanMetadataPill>
                            )}
                            {!isVeryNarrow && totalTokens > 0 && (
                                <AISpanMetadataPill>
                                    <AISpanTokenCount
                                        style={{ cursor: 'help' }}
                                        onMouseEnter={(e: React.MouseEvent) => {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const screenWidth = window.innerWidth;
                                            const screenHeight = window.innerHeight;
                                            const tooltipWidth = 280;
                                            const tooltipHeight = 100;

                                            let x = rect.left + rect.width / 2;
                                            let y = rect.bottom + 8;

                                            // Adjust horizontal position if tooltip would overflow
                                            if (x + tooltipWidth / 2 > screenWidth - 10) {
                                                x = screenWidth - tooltipWidth / 2 - 10;
                                            }
                                            if (x - tooltipWidth / 2 < 10) {
                                                x = tooltipWidth / 2 + 10;
                                            }

                                            // Adjust vertical position if tooltip would overflow
                                            if (y + tooltipHeight > screenHeight - 10) {
                                                y = rect.top - tooltipHeight - 8;
                                            }

                                            setHoveredTokenInfo({
                                                input: inputTokens,
                                                output: outputTokens,
                                                total: totalTokens,
                                                includesSubAgents: badgeType === 'invoke' && hasSubAgent(span.spanId),
                                                x,
                                                y
                                            });
                                        }}
                                        onMouseLeave={() => setHoveredTokenInfo(null)}
                                    >
                                        {totalTokens.toLocaleString()} Tokens
                                    </AISpanTokenCount>
                                </AISpanMetadataPill>
                            )}
                        </AISpanMetadataGroup>
                    </div>
                    {renderExpandChevron(hasChildren, isExpanded, onToggle)}
                </AISpanTopRow>
            </AISpanTreeItem>
        );
    };

    const renderNonAISpanContent = (span: SpanData, isSelected: boolean, hasChildren: boolean, isExpanded: boolean, onToggle: (e: React.MouseEvent) => void, showConnector: boolean = false) => {
        const duration = getSpanDuration(span);
        const spanKind = getSpanKindLabel(span.kind);
        const spanKindIcon = (() => {
            switch (spanKind.toLowerCase()) {
                case 'client': return 'bi-arrow-outward';
                case 'server': return 'bi-server';
                default: return 'bi-action';
            }
        })();

        return (
            <AdvancedSpanItem isSelected={isSelected} onClick={() => onSelectSpan(span.spanId)} data-span-id={span.spanId}>
                {showConnector && <ConnectorCurve />}
                <NonAISpanTopRow>
                    <NonAISpanIcon spanKind={spanKind}>
                        <Icon name={spanKindIcon} sx={{ fontSize: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} iconSx={{ fontSize: "16px", display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                    </NonAISpanIcon>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', minWidth: 0 }}>
                            <NonAISpanLabel>
                                <span style={{ fontWeight: 500, fontSize: '11px', textTransform: 'uppercase', opacity: 0.7 }}>
                                    {/* Updated to highlight span kind */}
                                    <HighlightText text={spanKind} query={searchQuery} />
                                </span>
                                <span title={span.name}>
                                    <HighlightText text={span.name} query={searchQuery} />
                                </span>
                            </NonAISpanLabel>
                            {spanHasError(span) && (
                                <AISpanErrorIcon>
                                    <Icon name="bi-error" sx={{ fontSize: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} iconSx={{ fontSize: "16px", display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                                </AISpanErrorIcon>
                            )}
                        </div>
                        {duration !== null && (
                            <AISpanMetadataGroup>
                                <AISpanMetadataPill>
                                    <AISpanDuration>
                                        <Icon name="bi-clock" sx={{ fontSize: '12px', width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} iconSx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                                        {formatDuration(duration)}
                                    </AISpanDuration>
                                </AISpanMetadataPill>
                            </AISpanMetadataGroup>
                        )}
                    </div>
                    {renderExpandChevron(hasChildren, isExpanded, onToggle)}
                </NonAISpanTopRow>
            </AdvancedSpanItem>
        );
    };

    // Recursive render function for non-AI tree items (filtering included)
    const renderNonAISpanTreeItem = (span: SpanData, spanList: SpanData[], isFirstChild: boolean = false, isLastChild: boolean = false): React.ReactNode => {
        const children = getChildSpansFromList(span.spanId, spanList);

        // Filter children based on search query
        const visibleChildren = children.map(child => ({
            node: child,
            element: renderNonAISpanTreeItem(child, spanList, false, false) // We don't care about isFirst/isLast for index yet
        })).filter(item => item.element !== null);

        // Uses extended match
        const isMatch = extendedDoesSpanMatch(span);

        // If span doesn't match and has no visible children, don't render it
        if (!isMatch && visibleChildren.length === 0) {
            return null;
        }

        const hasChildren = visibleChildren.length > 0;
        // Auto-expand if searching and matches found, otherwise use default expanded state
        const isExpanded = searchQuery ? true : expandedSpans.has(span.spanId);
        const isSelected = selectedSpanId === span.spanId;

        return (
            <TreeNodeContainer key={span.spanId} isLast={isLastChild}>
                {renderNonAISpanContent(
                    span,
                    isSelected,
                    hasChildren,
                    isExpanded,
                    (e) => {
                        e.stopPropagation();
                        if (hasChildren) onToggleSpanExpansion(span.spanId);
                    },
                    !isFirstChild
                )}
                {hasChildren && isExpanded && (
                    <TreeNodeChildren>
                        {visibleChildren.map((child, index) =>
                            // Re-render to ensure styling props (isFirst/isLast) are correct for filtered list
                            renderNonAISpanTreeItem(child.node, spanList, index === 0, index === visibleChildren.length - 1)
                        )}
                    </TreeNodeChildren>
                )}
            </TreeNodeContainer>
        );
    };

    // Recursive render function for Mixed tree items (Advanced Mode root)
    const renderMixedSpanTreeItem = (span: SpanData, isFirstChild: boolean = false, isLastChild: boolean = false, isRoot: boolean = false): React.ReactNode => {
        const isAI = isAISpan(span);
        const children = getChildSpans(span.spanId);

        const visibleChildren = children.map(child => ({
            node: child,
            element: renderMixedSpanTreeItem(child, false, false, false)
        })).filter(item => item.element !== null);

        // Uses extended match
        const isMatch = extendedDoesSpanMatch(span);

        if (!isMatch && visibleChildren.length === 0) {
            return null;
        }

        const hasChildren = visibleChildren.length > 0;
        const isExpanded = searchQuery ? true : expandedSpans.has(span.spanId);
        const isSelected = selectedSpanId === span.spanId;

        const handleToggle = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (hasChildren) onToggleSpanExpansion(span.spanId);
        };

        return (
            <TreeNodeContainer key={span.spanId} isLast={isLastChild}>
                {isAI ? (
                    renderAISpanContent(span, isSelected, hasChildren, isExpanded, handleToggle, !isRoot)
                ) : (
                    renderNonAISpanContent(span, isSelected, hasChildren, isExpanded, handleToggle, !isRoot)
                )}
                {hasChildren && isExpanded && (
                    <TreeNodeChildren>
                        {visibleChildren.map((child, index) =>
                            renderMixedSpanTreeItem(child.node, index === 0, index === visibleChildren.length - 1, false)
                        )}
                    </TreeNodeChildren>
                )}
            </TreeNodeContainer>
        );
    };

    // Recursive render function for AI Tree items (Simple View)
    const renderAISpanTreeItem = (span: SpanData, isFirstChild: boolean = false, isLastChild: boolean = false, isRoot: boolean = false): React.ReactNode => {
        const children = getAIChildSpans(span.spanId);
        const isSelected = selectedSpanId === span.spanId;
        const nonAISpans = isAdvancedMode ? getNonAIChildSpans(span.spanId) : [];
        const groupedNonAISpans = isAdvancedMode ? groupNonAISpans(nonAISpans) : new Map();

        // 1. Process AI Children
        const visibleAIChildren = children.map(child => ({
            node: child,
            element: renderAISpanTreeItem(child, false, false, false)
        })).filter(item => item.element !== null);

        // 2. Process Advanced Groups (Non-AI children)
        const visibleGroups: React.ReactNode[] = [];

        if (isAdvancedMode && groupedNonAISpans.size > 0) {
            const groupKey = `${span.spanId}-advanced`;

            Array.from(groupedNonAISpans.entries()).forEach(([category, spans]) => {
                // Filter the spans within this group
                const visibleSpansInGroup = spans.filter((s: SpanData) => {
                    // This is a simplified check. Ideally, we recursively check children of these spans too.
                    // Reusing renderNonAISpanTreeItem logic to determine visibility
                    return renderNonAISpanTreeItem(s, spans) !== null;
                });

                if (visibleSpansInGroup.length > 0) {
                    const categoryKey = `${groupKey}-${category}`;
                    const isExpanded = searchQuery ? true : expandedAdvancedSpanGroups.has(categoryKey);

                    const spanIdsInCategory = new Set(spans.map((s: SpanData) => s.spanId));
                    const rootSpansInCategory = visibleSpansInGroup.filter((s: SpanData) =>
                        !s.parentSpanId ||
                        s.parentSpanId === '0000000000000000' ||
                        !spanIdsInCategory.has(s.parentSpanId)
                    );
                    rootSpansInCategory.sort((a: SpanData, b: SpanData) => {
                        const aStart = a.startTime ? new Date(a.startTime).getTime() : 0;
                        const bStart = b.startTime ? new Date(b.startTime).getTime() : 0;
                        return aStart - bStart;
                    });

                    visibleGroups.push(
                        <div key={categoryKey}>
                            <AdvancedSpanGroupHeader
                                isExpanded={isExpanded}
                                onClick={() => {
                                    const newExpanded = new Set(expandedAdvancedSpanGroups);
                                    if (isExpanded) newExpanded.delete(categoryKey);
                                    else newExpanded.add(categoryKey);
                                    setExpandedAdvancedSpanGroups(newExpanded);
                                }}
                            >
                                <Codicon name={isExpanded ? 'chevron-down' : 'chevron-right'} />
                                <span>{category} ({visibleSpansInGroup.length})</span>
                            </AdvancedSpanGroupHeader>
                            {isExpanded && (
                                <AdvancedSpanGroupContent>
                                    {rootSpansInCategory.map((rootSpan: SpanData, index: number) =>
                                        renderNonAISpanTreeItem(rootSpan, spans, index === 0, index === rootSpansInCategory.length - 1)
                                    )}
                                </AdvancedSpanGroupContent>
                            )}
                        </div>
                    );
                }
            });
        }

        // Uses extended match
        const isMatch = extendedDoesSpanMatch(span);

        // Visibility Check: Show if span matches, OR has visible AI children, OR has visible Non-AI groups
        if (!isMatch && visibleAIChildren.length === 0 && visibleGroups.length === 0) {
            return null;
        }

        const hasAnyChildren = visibleAIChildren.length > 0 || visibleGroups.length > 0;
        const isExpanded = searchQuery ? true : expandedSpans.has(span.spanId);

        const handleToggle = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (hasAnyChildren) onToggleSpanExpansion(span.spanId);
        };
        return (
            <TreeNodeContainer key={span.spanId} isLast={isLastChild}>
                {renderAISpanContent(span, isSelected, visibleAIChildren.length > 0, isExpanded, handleToggle, !isRoot)}
                {hasAnyChildren && isExpanded && (
                    <TreeNodeChildren>
                        {visibleGroups.length > 0 && (
                            <AdvancedSpanGroup>
                                {visibleGroups}
                            </AdvancedSpanGroup>
                        )}
                        {visibleAIChildren.map((child, index) =>
                            renderAISpanTreeItem(child.node, index === 0 && visibleGroups.length === 0, index === visibleAIChildren.length - 1, false)
                        )}
                    </TreeNodeChildren>
                )}
            </TreeNodeContainer>
        );
    };

    // Calculate visible spans for "no results" detection
    const visibleSpans = useMemo(() => {
        const spans = isAdvancedMode || rootAISpans.length === 0 ? sortedRootSpans : rootAISpans;
        return spans.map(span => {
            if (isAdvancedMode || rootAISpans.length === 0) {
                return renderMixedSpanTreeItem(span, true, false, true);
            } else {
                return renderAISpanTreeItem(span, true, false, true);
            }
        }).filter(element => element !== null);
    }, [isAdvancedMode, rootAISpans, sortedRootSpans, searchQuery, traceData]);

    const noResults = searchQuery && visibleSpans.length === 0;

    return (
        <AISpanTreeContainer>
            <TreeScrollArea>
                {noResults ? (
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
                ) : (
                    <>
                        {isAdvancedMode || rootAISpans.length === 0
                            ? sortedRootSpans.map((span, index) => renderMixedSpanTreeItem(span, index === 0, index === sortedRootSpans.length - 1, true))
                            : rootAISpans.map((span, index) => renderAISpanTreeItem(span, index === 0, index === rootAISpans.length - 1, true))
                        }
                    </>
                )}
            </TreeScrollArea>

            {/* Token Breakdown Tooltip */}
            {hoveredTokenInfo && (
                <Tooltip x={hoveredTokenInfo.x} y={hoveredTokenInfo.y}>
                    <TooltipRow>
                        <span>Input:</span>
                        <span className="value">{hoveredTokenInfo.input.toLocaleString()}</span>
                    </TooltipRow>
                    <TooltipRow>
                        <span>Output:</span>
                        <span className="value">{hoveredTokenInfo.output.toLocaleString()}</span>
                    </TooltipRow>
                    <TooltipDivider />
                    <TooltipRow>
                        <span>Total:</span>
                        <span className="value">{hoveredTokenInfo.total.toLocaleString()}</span>
                    </TooltipRow>
                    {hoveredTokenInfo.includesSubAgents && <TooltipRow>Includes tokens of sub-agents.</TooltipRow>}
                </Tooltip>
            )}
        </AISpanTreeContainer>
    );
}
