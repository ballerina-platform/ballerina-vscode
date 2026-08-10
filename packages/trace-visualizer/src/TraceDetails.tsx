/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useState, useEffect, useRef, useMemo } from "react";
import styled from "@emotion/styled";
import { TraceData, SpanData } from "./index";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { SpanDetails } from "./components/SpanDetails";
import { WaterfallView } from "./components/WaterfallView";
import { TraceEmptyState } from "./components/TraceEmptyState";
import { SpanTree, AISpanTreeContainer } from "./components/SpanTree";
import { SearchInput } from "./components/SearchInput";
import { ExportDropdown } from "./components/ExportDropdown";
import { AgentFlow } from "./components/AgentFlow";
import {
    timeContainsSpan,
    sortSpansByUmbrellaFirst,
    isAISpan,
    getAttributeValue
} from "./utils";

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_SIDEBAR_WIDTH = 260;
const SNAP_THRESHOLD = 100;
const MIN_DETAILS_PANEL_WIDTH = 250;
const MAX_INITIAL_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_PERCENTAGE = 0.6;

interface TraceDetailsProps {
    traceData: TraceData;
    isAgentChat: boolean;
    focusSpanId?: string;
    onViewSession?: () => void;
    showSidebar?: boolean;
}

// ============================================================================
// BASE LAYOUT STYLES
// ============================================================================

const Container = styled.div`
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-size: 13px;
    line-height: 1.5;
    height: 100%;
    overflow: hidden;
`;

const TraceLogsContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: stretch;
    height: 100%;
    overflow: hidden;
`;

const SpanViewContainer = styled.div<{ width: number; isResizing?: boolean }>`
    width: ${(props: { width: number }) => props.width}px;
    display: flex;
    flex-direction: column;
    position: relative;
    height: 100%;
    overflow: hidden;
    flex-shrink: 0;

    &::after {
        content: '';
        position: absolute;
        top: 0;
        right: -4px;
        bottom: 0;
        width: 8px;
        cursor: col-resize;
        z-index: 10;
        background-color: ${(props: { isResizing?: boolean }) =>
        props.isResizing ? 'var(--vscode-focusBorder, var(--vscode-panel-border))' : 'transparent'};
        opacity: ${(props: { isResizing?: boolean }) => props.isResizing ? '0.5' : '0'};
        transition: ${(props: { isResizing?: boolean }) =>
        props.isResizing ? 'none' : 'opacity 0.2s ease, background-color 0.2s ease'};
    }
`;

const DetailsPanelContainer = styled.div`
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--vscode-panel-border);
    overflow: hidden;
`;

// ============================================================================
// NAVIGATION & CONTROLS
// ============================================================================

const NavigationBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 24px;
    margin-bottom: 8px;
    padding: 0 8px;
`;

const ModeToggleButton = styled.button<{ isSelected?: boolean; }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: ${(props: { isSelected?: boolean }) => props.isSelected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-foreground);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: background-color 0.15s ease;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:active {
        transform: scale(0.98);
    }
`;

const ButtonGroup = styled.div`
    display: flex;
    gap: 4px;
    align-items: center;
`;

// ============================================================================
// DETAILS PANEL
// ============================================================================

const DetailsPanel = styled.div`
    background-color: var(--vscode-editor-background);
    height: 100%;
    overflow-y: auto;
    padding: 0;
    display: flex;
    flex-direction: column;
`;

const BreadcrumbContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    background-color: var(--vscode-editor-background);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
`;

const BreadcrumbItem = styled.button<{ isClickable?: boolean }>`
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: none;
    padding: 0;
    color: ${(props: { isClickable: boolean; }) => props.isClickable ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-foreground)'};
    cursor: ${(props: { isClickable: boolean; }) => props.isClickable ? 'pointer' : 'default'};
    font-size: 12px;
    font-family: var(--vscode-font-family);

    &:hover {
        ${(props: { isClickable: boolean; }) => props.isClickable && `
            text-decoration: underline;
            color: var(--vscode-textLink-activeForeground);
        `}

        i::before {
            text-decoration: none;
        }
    }
`;

const BreadcrumbSeparator = styled.span`
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const DetailsPanelContent = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 24px 16px;
`;

// ============================================================================
// SEARCH INPUT
// ============================================================================

const SearchInputWrapper = styled.div`
    padding: 8px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    position: sticky;
    top: 0;
    z-index: 10;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    gap: 6px;
    align-items: center;
`;

const ActionButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--vscode-input-border);
    color: var(--vscode-foreground);
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
        border-color: var(--vscode-focusBorder);
    }
`;

const AgentFlowEntryButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 8px;
    padding: 8px 12px;
    background-color: transparent;
    border: 1px solid var(--vscode-focusBorder);
    border-radius: 6px;
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    font-family: var(--vscode-font-family);
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:active {
        transform: scale(0.99);
    }
`;

// ============================================================================
// COMPONENT DEFINITIONS
// ============================================================================

export function TraceDetails({ traceData, isAgentChat, focusSpanId, onViewSession, showSidebar }: TraceDetailsProps) {
    const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
    const [showFullTrace] = useState<boolean>(false);

    // Rename state to capture user preference specifically
    const [userAdvancedModePreference, setUserAdvancedModePreference] = useState<boolean>(false);

    const [viewMode, setViewMode] = useState<'tree' | 'timeline' | 'agents'>('tree');
    const [preAgentMode, setPreAgentMode] = useState<'tree' | 'timeline'>('tree');
    const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(
        showSidebar !== undefined ? showSidebar : !(isAgentChat && focusSpanId !== undefined)
    );

    const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());
    const [expandedAdvancedSpanGroups, setExpandedAdvancedSpanGroups] = useState<Set<string>>(new Set());
    const [waterfallCollapsedSpanIds, setWaterfallCollapsedSpanIds] = useState<Set<string>>(new Set());

    const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);
    const [spanViewWidth, setSpanViewWidth] = useState<number>(0);
    const [isResizing, setIsResizing] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const hasAutoExpandedRef = useRef<boolean>(false);
    const lastFocusedSpanIdRef = useRef<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Calculate total span counts (memoized for immediate availability)
    const totalSpanCounts = useMemo(() => {
        // Fallback to manual check in case isAISpan utility behaves unexpectedly
        const aiSpans = traceData.spans.filter(span =>
            isAISpan(span) ||
            span.attributes?.some(attr => attr.key === 'span.type' && attr.value === 'ai')
        );
        const aiCount = aiSpans.length;
        const nonAiCount = traceData.spans.length - aiCount;
        return { aiCount, nonAiCount };
    }, [traceData.spans]);

    // DERIVED STATE: Determine if we should show advanced mode
    // - If opened from trace tree view (!isAgentChat), always show all spans (advanced mode)
    // - If opened from agent chat (isAgentChat):
    //   - If there are NO AI spans, force Advanced Mode (Show Hidden/Raw Spans)
    //   - If there ARE AI spans, use the user's preference
    const hasAISpans = totalSpanCounts.aiCount > 0;
    const isAdvancedMode = !isAgentChat || !hasAISpans || userAdvancedModePreference;

    // Show the Agents mode when the trace has at least two agent invocations.
    const hasMultiAgent = useMemo(() => {
        const invokeCount = traceData.spans.filter(span =>
            (getAttributeValue(span.attributes, 'gen_ai.operation.name') || '').startsWith('invoke_agent')
        ).length;
        return invokeCount >= 2;
    }, [traceData.spans]);

    // Helper to get immediate AI children of a span (defined early for reuse)
    const getAIChildSpans = (spanId: string): SpanData[] => {
        const parentSpan = traceData.spans.find(s => s.spanId === spanId);
        if (!parentSpan || !parentSpan.startTime || !parentSpan.endTime) return [];

        const parentStart = new Date(parentSpan.startTime).getTime();
        const parentEnd = new Date(parentSpan.endTime).getTime();
        const aiSpans = traceData.spans.filter(span =>
            span.attributes?.some(attr => attr.key === 'span.type' && attr.value === 'ai')
        );

        const children: SpanData[] = [];

        aiSpans.forEach(potentialChild => {
            if (potentialChild.spanId === spanId) return;
            if (!potentialChild.startTime || !potentialChild.endTime) return;
            const childStart = new Date(potentialChild.startTime).getTime();
            const childEnd = new Date(potentialChild.endTime).getTime();
            const parentContainsChild = parentStart <= childStart && parentEnd >= childEnd &&
                (parentStart < childStart || parentEnd > childEnd);

            if (!parentContainsChild) return;

            let hasIntermediateParent = false;
            aiSpans.forEach(intermediateSpan => {
                if (intermediateSpan.spanId === spanId || intermediateSpan.spanId === potentialChild.spanId) return;
                if (!intermediateSpan.startTime || !intermediateSpan.endTime) return;
                const intStart = new Date(intermediateSpan.startTime).getTime();
                const intEnd = new Date(intermediateSpan.endTime).getTime();
                const intermediateContainsChild = intStart <= childStart && intEnd >= childEnd &&
                    (intStart < childStart || intEnd > childEnd);
                const parentContainsIntermediate = parentStart <= intStart && parentEnd >= intEnd &&
                    (parentStart < intStart || parentEnd > intEnd);

                if (intermediateContainsChild && parentContainsIntermediate) {
                    hasIntermediateParent = true;
                }
            });

            if (!hasIntermediateParent) children.push(potentialChild);
        });

        return children.sort((a, b) => {
            const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
            const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
            return aTime - bTime;
        });
    };

    // Auto-expand invoke agent spans and their immediate children (1 level) by default
    const hasAutoExpandedAIRef = useRef<boolean>(false);
    useEffect(() => {
        if (!isAdvancedMode && !hasAutoExpandedAIRef.current && expandedSpans.size === 0) {
            const spansToExpand = new Set<string>();

            // Find all invoke agent spans
            const invokeSpans = traceData.spans.filter(span => {
                const operationName = span.attributes?.find(attr => attr.key === 'gen_ai.operation.name')?.value || '';
                return operationName.startsWith('invoke_agent');
            });

            // Expand each invoke span and its immediate children
            invokeSpans.forEach(span => {
                spansToExpand.add(span.spanId);
                // Reuse existing getAIChildSpans logic to find immediate children
                const children = getAIChildSpans(span.spanId);
                children.forEach(child => spansToExpand.add(child.spanId));
            });

            setExpandedSpans(spansToExpand);
            hasAutoExpandedAIRef.current = true;
        }
    }, [isAdvancedMode, traceData.spans, expandedSpans.size]);

    const handleToggleAll = () => {
        const getParentsForCurrentView = () => {
            const parentIds = new Set<string>();

            // Standard Trace Parents (always include)
            const existingIds = new Set(traceData.spans.map(s => s.spanId));
            traceData.spans.forEach(s => {
                if (s.parentSpanId && existingIds.has(s.parentSpanId)) {
                    parentIds.add(s.parentSpanId);
                }
            });

            // If in simple tree view, check for AI spans that contain other AI spans
            if (viewMode === 'tree' && !isAdvancedMode) {
                const aiSpans = traceData.spans.filter(span =>
                    span.attributes?.some(attr => attr.key === 'span.type' && attr.value === 'ai')
                );

                // Helper to check time containment (re-using logic from getAIChildSpans)
                const containsTime = (parent: SpanData, child: SpanData) => {
                    const pStart = new Date(parent.startTime).getTime();
                    const pEnd = new Date(parent.endTime).getTime();
                    const cStart = new Date(child.startTime).getTime();
                    const cEnd = new Date(child.endTime).getTime();
                    return pStart <= cStart && pEnd >= cEnd;
                };

                aiSpans.forEach(parent => {
                    if (parentIds.has(parent.spanId)) return; // Already added

                    const hasChild = aiSpans.some(child =>
                        child.spanId !== parent.spanId && containsTime(parent, child)
                    );

                    if (hasChild) parentIds.add(parent.spanId);
                });
            }

            return parentIds;
        };

        if (viewMode === 'tree') {
            // If any are expanded, collapse all. Otherwise, expand calculated parents.
            if (expandedSpans.size > 0) {
                setExpandedSpans(new Set());
            } else {
                setExpandedSpans(getParentsForCurrentView());
            }
        } else {
            // Waterfall Logic
            if (waterfallCollapsedSpanIds.size > 0) {
                setWaterfallCollapsedSpanIds(new Set());
            } else {
                setWaterfallCollapsedSpanIds(getParentsForCurrentView());
            }
        }
    };

    const getToggleState = () => {
        if (viewMode === 'tree') {
            const isAnyExpanded = expandedSpans.size > 0;
            return {
                icon: isAnyExpanded ? 'bi-collapse-item' : 'bi-expand-item',
                tooltip: isAnyExpanded ? 'Collapse All' : 'Expand All'
            };
        } else {
            const isAnyCollapsed = waterfallCollapsedSpanIds.size > 0;
            return {
                icon: isAnyCollapsed ? 'bi-expand-item' : 'bi-collapse-item',
                tooltip: isAnyCollapsed ? 'Expand All' : 'Collapse All'
            };
        }
    };

    const toggleState = getToggleState();

    // Initialize span view width intelligently
    useEffect(() => {
        if (containerRef.current && spanViewWidth === 0) {
            const currentContainerWidth = containerRef.current.offsetWidth;
            let targetWidth = currentContainerWidth * 0.3;

            if (targetWidth > MAX_INITIAL_SIDEBAR_WIDTH) {
                targetWidth = MAX_INITIAL_SIDEBAR_WIDTH;
            }

            if (targetWidth < MIN_SIDEBAR_WIDTH) {
                targetWidth = MIN_SIDEBAR_WIDTH;
            }

            const maxAllowedWidth = currentContainerWidth - MIN_DETAILS_PANEL_WIDTH;

            if (targetWidth > maxAllowedWidth) {
                targetWidth = Math.max(150, maxAllowedWidth);
                if (maxAllowedWidth < 100) {
                    setIsSidebarVisible(false);
                }
            }

            setSpanViewWidth(targetWidth);
        }
    }, []);

    // Track container width for responsive behavior
    useEffect(() => {
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = entry.contentRect.width;
                setContainerWidth(newWidth);

                // If the sidebar is open, ensure it doesn't violate boundaries on window resize
                if (isSidebarVisible && spanViewWidth > 0) {
                    const maxAllowed = newWidth - MIN_DETAILS_PANEL_WIDTH;
                    if (spanViewWidth > maxAllowed) {
                        setSpanViewWidth(Math.max(MIN_SIDEBAR_WIDTH, maxAllowed));
                    }
                }
            }
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [spanViewWidth, isSidebarVisible]);

    // Fall back to Tree if Agents mode is active but the trace isn't multi-agent.
    useEffect(() => {
        if (viewMode === 'agents' && !hasMultiAgent) {
            setViewMode('tree');
        }
    }, [viewMode, hasMultiAgent]);

    const toggleSpanExpansion = (spanId: string) => {
        const newExpanded = new Set(expandedSpans);
        if (newExpanded.has(spanId)) {
            newExpanded.delete(spanId);
        } else {
            newExpanded.add(spanId);
        }
        setExpandedSpans(newExpanded);
    };

    const selectSpan = (spanId: string) => {
        setSelectedSpanId(spanId);
        // Auto-expand parent spans
        expandParentSpans(spanId);
    };

    const expandParentSpans = (spanId: string) => {
        const span = traceData.spans.find(s => s.spanId === spanId);
        if (!span) return;

        const newExpanded = new Set(expandedSpans);
        let currentParentId = span.parentSpanId;

        while (currentParentId && currentParentId !== '0000000000000000') {
            const parentSpan = traceData.spans.find(s => s.spanId === currentParentId);
            if (parentSpan) {
                newExpanded.add(currentParentId);
                currentParentId = parentSpan.parentSpanId;
            } else {
                break;
            }
        }

        setExpandedSpans(newExpanded);
    };

    // Compute actual start/end from span data for accurate timeline positioning
    let earliestStart = Infinity;
    let latestEnd = -Infinity;
    traceData.spans.forEach(span => {
        if (span.startTime) {
            const start = new Date(span.startTime).getTime();
            if (isFinite(start)) {
                if (start < earliestStart) earliestStart = start;
                if (start > latestEnd) latestEnd = start;
            }
        }
        if (span.endTime) {
            const end = new Date(span.endTime).getTime();
            if (isFinite(end)) {
                if (end > latestEnd) latestEnd = end;
                if (end < earliestStart) earliestStart = end;
            }
        }
    });
    // Fall back to envelope times if no valid span timestamps were found
    if (!isFinite(earliestStart)) {
        const fallback = new Date(traceData.firstSeen).getTime();
        earliestStart = isFinite(fallback) ? fallback : 0;
    }
    if (!isFinite(latestEnd)) {
        const fallback = new Date(traceData.lastSeen).getTime();
        latestEnd = isFinite(fallback) ? fallback : earliestStart;
    }
    const traceStartTime = new Date(earliestStart).toISOString();
    const duration = Math.max(0, latestEnd - earliestStart);

    // Build span hierarchy
    const spanMap = new Map<string, SpanData>();
    const rootSpans: SpanData[] = [];

    traceData.spans.forEach(span => {
        spanMap.set(span.spanId, span);
    });

    traceData.spans.forEach(span => {
        const parentSpanId = span.parentSpanId || '';
        if (!parentSpanId ||
            parentSpanId === '0000000000000000' ||
            parentSpanId === '' ||
            !spanMap.has(parentSpanId)) {
            rootSpans.push(span);
        }
    });

    // Sort root spans: umbrella spans (those that contain others) come first, then by start time
    const sortedRootSpans = sortSpansByUmbrellaFirst(rootSpans);

    const getChildSpans = (spanId: string): SpanData[] => {
        const children = traceData.spans.filter(s => s.parentSpanId === spanId);
        return sortSpansByUmbrellaFirst(children);
    };

    // Auto-expand first 3 levels of spans in advanced mode (only once)
    useEffect(() => {
        if (!isAdvancedMode || hasAutoExpandedRef.current || sortedRootSpans.length === 0) return;

        const spansToExpand = new Set<string>();

        const expandRecursively = (spanId: string, currentLevel: number) => {
            if (currentLevel >= 3) return;

            const children = getChildSpans(spanId);
            if (children.length > 0) {
                spansToExpand.add(spanId);
                children.forEach(child => expandRecursively(child.spanId, currentLevel + 1));
            }
        };

        // Start from root spans
        sortedRootSpans.forEach(rootSpan => {
            expandRecursively(rootSpan.spanId, 0);
        });

        setExpandedSpans(spansToExpand);
        hasAutoExpandedRef.current = true;
    }, [sortedRootSpans, isAdvancedMode]);

    // Auto-focus on specific span if focusSpanId is provided
    useEffect(() => {
        // If focusSpanId is undefined, clear the last focused ref to allow normal auto-selection
        if (!focusSpanId) {
            lastFocusedSpanIdRef.current = null;
            return;
        }

        if (traceData.spans.length > 0 && focusSpanId !== lastFocusedSpanIdRef.current) {
            setExpandedSpans(prev => {
                // Expand all parent spans to make the focused span visible FIRST
                const span = traceData.spans.find(s => s.spanId === focusSpanId);
                if (!span) {
                    return prev;
                }
                const newExpanded = new Set(prev);
                let currentParentId = span.parentSpanId;
                while (currentParentId && currentParentId !== '0000000000000000') {
                    const parentSpan = traceData.spans.find(s => s.spanId === currentParentId);
                    if (parentSpan) {
                        newExpanded.add(currentParentId);
                        currentParentId = parentSpan.parentSpanId;
                    } else {
                        break;
                    }
                }
                return newExpanded;
            });
            setSelectedSpanId(focusSpanId);
            const timeoutId = setTimeout(() => {
                const spanElement = document.querySelector(`[data-span-id="${focusSpanId}"]`);
                if (spanElement) {
                    spanElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    console.error('[TraceDetails] Could not find span element to scroll to');
                }
            }, 500);
            lastFocusedSpanIdRef.current = focusSpanId;

            return () => clearTimeout(timeoutId);
        }
    }, [focusSpanId, traceData.spans.length]);

    const selectedSpan = selectedSpanId ? spanMap.get(selectedSpanId) : null;

    // Extract session ID from trace data
    const sessionId = useMemo(() => {
        for (const span of traceData.spans) {
            const conversationId = span.attributes?.find(attr => attr.key === 'gen_ai.conversation.id')?.value;
            if (conversationId) {
                return conversationId;
            }
        }
        return null;
    }, [traceData.spans]);

    // Check if there's an invoke_agent span with gen_ai.conversation.id attribute
    const hasInvokeAgentWithConversationId = useMemo(() => {
        return traceData.spans.some(span => {
            const operationName = span.attributes?.find(attr => attr.key === 'gen_ai.operation.name')?.value || '';
            const hasConversationId = span.attributes?.some(attr => attr.key === 'gen_ai.conversation.id');
            return operationName.startsWith('invoke_agent') && hasConversationId;
        });
    }, [traceData.spans]);

    // Handle resize drag
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        const isInResizeArea = e.clientX >= rect.right - 8;

        if (isInResizeArea) {
            e.preventDefault();
            setIsResizing(true);
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const rawWidth = e.clientX - containerRect.left;

            if (isSidebarVisible) {
                if (rawWidth < SNAP_THRESHOLD) {
                    setIsSidebarVisible(false);
                } else {
                    const minWidth = MIN_SIDEBAR_WIDTH;
                    // Constraint 1: Must leave space for the details panel
                    const limitByPanel = containerRect.width - MIN_DETAILS_PANEL_WIDTH;
                    // Constraint 2: Max 70% of the screen
                    const limitByPercentage = containerRect.width * MAX_SIDEBAR_PERCENTAGE;
                    // The actual max width is the stricter (smaller) of the two limits
                    const maxWidth = Math.min(limitByPanel, limitByPercentage);

                    const newWidth = Math.max(minWidth, Math.min(rawWidth, maxWidth));
                    setSpanViewWidth(newWidth);
                }
            } else {
                // Wake up logic
                if (rawWidth > SNAP_THRESHOLD) {
                    setIsSidebarVisible(true);
                    setSpanViewWidth(MIN_SIDEBAR_WIDTH);
                }
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, isSidebarVisible]);

    /**
     * Builds a hierarchy of AI spans based on time containment.
     * Uses temporal relationships to determine parent-child structure.
     * For each span, finds the smallest containing span as its parent.
     * @returns Root AI spans (those with no time-based parent) sorted by start time
     */
    const buildAISpanHierarchy = () => {
        // First, identify all AI spans
        const aiSpans = traceData.spans.filter(span =>
            span.attributes?.some(attr => attr.key === 'span.type' && attr.value === 'ai')
        );

        // Use the helper function to check if span A contains span B based on time
        const timeContains = timeContainsSpan;

        // For each AI span, find its time-based parent (the smallest span that contains it)
        const timeBasedParents = new Map<string, string>();

        aiSpans.forEach(span => {
            let smallestParent: SpanData | null = null;
            let smallestParentDuration = Infinity;

            aiSpans.forEach(potentialParent => {
                if (potentialParent.spanId === span.spanId) return;

                if (timeContains(potentialParent, span)) {
                    const parentStart = new Date(potentialParent.startTime!).getTime();
                    const parentEnd = new Date(potentialParent.endTime!).getTime();
                    const parentDuration = parentEnd - parentStart;

                    // Find the smallest containing span (most immediate parent)
                    if (parentDuration < smallestParentDuration) {
                        smallestParent = potentialParent;
                        smallestParentDuration = parentDuration;
                    }
                }
            });

            if (smallestParent) {
                timeBasedParents.set(span.spanId, smallestParent.spanId);
            }
        });

        // Find root AI spans (those with no time-based parent)
        const rootAISpans = aiSpans.filter(span => !timeBasedParents.has(span.spanId));

        return rootAISpans.sort((a, b) => {
            const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
            const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
            return aTime - bTime;
        });
    };

    const rootAISpans = buildAISpanHierarchy();

    // Select first AI span when in agent chat view, or fallback to first generic span
    useEffect(() => {
        // Don't auto-select if we have a focusSpanId or are focusing - let the focus effect handle it
        if (focusSpanId || lastFocusedSpanIdRef.current) {
            return;
        }

        // 1. Try to select the first AI span if available
        if (isAgentChat && !showFullTrace && rootAISpans.length > 0) {
            setSelectedSpanId(rootAISpans[0].spanId);
        }
        // 2. If no AI spans (or in advanced mode), select the first generic span
        else if ((!isAgentChat || rootAISpans.length === 0) && !selectedSpanId && sortedRootSpans.length > 0) {
            setSelectedSpanId(sortedRootSpans[0].spanId);
        }
    }, [isAgentChat, showFullTrace, rootAISpans.length, sortedRootSpans.length, focusSpanId]);

    // Totals across the trace (input/output separately)
    const { totalInputTokens, totalOutputTokens } = React.useMemo(() => {
        let inTotal = 0;
        let outTotal = 0;
        traceData.spans.forEach(span => {
            const inT = parseInt(span.attributes?.find(attr => attr.key === 'gen_ai.usage.input_tokens')?.value || '0');
            const outT = parseInt(span.attributes?.find(attr => attr.key === 'gen_ai.usage.output_tokens')?.value || '0');
            if (!isNaN(inT)) inTotal += inT;
            if (!isNaN(outT)) outTotal += outT;
        });
        return { totalInputTokens: inTotal, totalOutputTokens: outTotal };
    }, [traceData.spans]);

    // Render Trace Logs view
    const handleExportTrace = () => {
        // Dispatch custom event to communicate with webview script
        window.dispatchEvent(new CustomEvent('exportTrace', {
            detail: { traceData }
        }));
    };

    const handleExportAsEvalset = () => {
        // Use the traceVisualizerAPI if available
        if (window.traceVisualizerAPI?.exportTraceAsEvalset) {
            window.traceVisualizerAPI.exportTraceAsEvalset(traceData);
        }
    };

    const renderTraceLogs = () => {
        if (traceData.spans.length === 0) {
            return (
                <TraceEmptyState
                    icon="comment-discussion"
                    title="No trace data found"
                    subtitle="Spans will appear here"
                />
            );
        }

        // isAdvancedMode is now a calculated value based on content + user preference
        const shouldShowAdvancedView = isAdvancedMode;

        // Agents mode: dedicated multi-agent flow canvas + shared inspector.
        if (viewMode === 'agents' && hasMultiAgent) {
            return (
                <AgentFlow
                    traceData={traceData}
                    selectedSpanId={selectedSpanId}
                    onSelectSpan={selectSpan}
                    totalInputTokens={totalInputTokens}
                    totalOutputTokens={totalOutputTokens}
                    showInternalSpans={shouldShowAdvancedView}
                    onClose={() => setViewMode(preAgentMode)}
                    onExportJson={handleExportTrace}
                    onExportEvalset={handleExportAsEvalset}
                />
            );
        }

        return (
            <TraceLogsContainer>
                <SpanViewContainer width={isSidebarVisible ? spanViewWidth : 48} isResizing={isResizing} onMouseDown={isSidebarVisible ? handleMouseDown : undefined}>
                    <NavigationBar>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ModeToggleButton
                                onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                                title={isSidebarVisible ? "Hide sidebar" : "Show sidebar"}
                            >
                                <Icon
                                    name={isSidebarVisible ? 'bi-left-panel-close' : 'bi-left-panel-open'}
                                    sx={{ fontSize: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    iconSx={{ fontSize: "16px", display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                            </ModeToggleButton>
                            <span style={{ fontSize: '16px', fontWeight: '600' }}>Trace</span>
                        </div>
                        {isSidebarVisible && (
                            <>
                                <ButtonGroup>
                                    <ModeToggleButton
                                        onClick={() => setViewMode(viewMode === 'tree' ? 'timeline' : 'tree')}
                                        title={viewMode === 'timeline' ? "Switch to Tree View" : "Switch to Timeline View"}
                                        isSelected={viewMode === 'timeline'}
                                    >
                                        Timeline
                                    </ModeToggleButton>
                                    <ExportDropdown
                                        onExportJson={handleExportTrace}
                                        onExportEvalset={handleExportAsEvalset}
                                        buttonText=""
                                        showIcon={true}
                                        compact={true}
                                    />
                                    {isAgentChat && hasAISpans && (
                                        <ModeToggleButton
                                            onClick={() => setUserAdvancedModePreference(!userAdvancedModePreference)}
                                            title={isAdvancedMode ? "Hide internal spans" : "Show all spans"}
                                        >
                                            <Codicon name={isAdvancedMode ? 'eye-closed' : 'eye'} />
                                        </ModeToggleButton>
                                    )}
                                </ButtonGroup>
                            </>
                        )}
                    </NavigationBar>
                    {isSidebarVisible && (
                        <>
                            <SearchInputWrapper>
                                <SearchInput
                                    value={searchQuery}
                                    onChange={setSearchQuery}
                                    placeholder="Filter spans..."
                                />
                                <ActionButton
                                    onClick={handleToggleAll}
                                    title={toggleState.tooltip}
                                >
                                    <Icon
                                        name={toggleState.icon}
                                        sx={{ fontSize: "14px", width: "14px", height: "14px" }}
                                        iconSx={{ display: "flex" }}
                                    />
                                </ActionButton>
                            </SearchInputWrapper>

                            {hasMultiAgent && (
                                <AgentFlowEntryButton
                                    onClick={() => {
                                        setPreAgentMode(viewMode === 'timeline' ? 'timeline' : 'tree');
                                        setViewMode('agents');
                                    }}
                                    title="Visualize how agents delegate work across this trace"
                                >
                                    <Icon
                                        name="bi-ai-agent"
                                        sx={{ fontSize: '16px', width: '16px', height: '16px' }}
                                        iconSx={{ fontSize: '16px' }}
                                    />
                                    View Agent Flow
                                </AgentFlowEntryButton>
                            )}

                            {viewMode === 'tree' && (
                                <AISpanTreeContainer>
                                    <SpanTree
                                        traceData={traceData}
                                        rootAISpans={rootAISpans}
                                        sortedRootSpans={sortedRootSpans}
                                        isAdvancedMode={shouldShowAdvancedView}
                                        expandedSpans={expandedSpans}
                                        selectedSpanId={selectedSpanId}
                                        expandedAdvancedSpanGroups={expandedAdvancedSpanGroups}
                                        onSelectSpan={setSelectedSpanId}
                                        onToggleSpanExpansion={toggleSpanExpansion}
                                        setExpandedAdvancedSpanGroups={setExpandedAdvancedSpanGroups}
                                        getChildSpans={getChildSpans}
                                        containerWidth={containerWidth}
                                        searchQuery={searchQuery}
                                        onClearSearch={() => setSearchQuery('')}
                                    />
                                </AISpanTreeContainer>
                            )}
                            {viewMode === 'timeline' && (
                                <WaterfallView
                                    spans={shouldShowAdvancedView ? traceData.spans : rootAISpans}
                                    selectedSpanId={selectedSpanId}
                                    onSpanSelect={selectSpan}
                                    getChildSpans={shouldShowAdvancedView ? getChildSpans : getAIChildSpans}
                                    traceStartTime={traceStartTime}
                                    traceDuration={duration}
                                    collapsedSpanIds={waterfallCollapsedSpanIds}
                                    setCollapsedSpanIds={setWaterfallCollapsedSpanIds}
                                    searchQuery={searchQuery}
                                    onClearSearch={() => setSearchQuery('')}
                                />
                            )}
                        </>
                    )}
                </SpanViewContainer>
                {selectedSpan && (
                    <DetailsPanelContainer>
                        <DetailsPanel>
                            {onViewSession && hasInvokeAgentWithConversationId && (
                                <BreadcrumbContainer>
                                    <BreadcrumbItem isClickable onClick={onViewSession}>
                                        <Icon name="bi-back" sx={{ fontSize: '12px', width: '12px', height: '12px' }} iconSx={{ fontSize: "12px" }} />
                                        Session Traces
                                    </BreadcrumbItem>
                                    <BreadcrumbSeparator>/</BreadcrumbSeparator>
                                    <BreadcrumbItem isClickable={false}>
                                        Trace: {traceData.traceId}
                                    </BreadcrumbItem>
                                </BreadcrumbContainer>
                            )}
                            <DetailsPanelContent>
                                <SpanDetails
                                    spanData={selectedSpan}
                                    spanName={selectedSpan.name}
                                    totalInputTokens={totalInputTokens}
                                    totalOutputTokens={totalOutputTokens}
                                />
                            </DetailsPanelContent>
                        </DetailsPanel>
                    </DetailsPanelContainer>
                )}
            </TraceLogsContainer>
        );
    }

    return (
        <Container ref={containerRef}>
            {renderTraceLogs()}
        </Container>
    );
}
