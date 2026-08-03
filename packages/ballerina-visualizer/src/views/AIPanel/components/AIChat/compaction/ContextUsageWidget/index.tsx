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

import React, { useRef, useState } from "react";
import styled from "@emotion/styled";

/** Token budget the UI uses to compute context-usage percentages. Matches the model's 1M context window. */
export const MAX_CONTEXT_WINDOW = 1_000_000;
const TOOLTIP_SHOW_MS = 300;
const TOOLTIP_HIDE_MS = 200;

interface UsageBreakdown {
    systemInstructions: number;
    toolDefinitions: number;
    reservedOutput: number;
    files: number;
    messages: number;
    toolResults: number;
}

interface ContextUsageWidgetProps {
    percentage: number;
    inputTokens: number;
    breakdown?: UsageBreakdown;
}

// ---- Styled components ----

const WidgetContainer = styled.div`
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 4px;
    cursor: default;
    user-select: none;
`;

const Label = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    line-height: 1;
`;

const TooltipPopup = styled.div`
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    min-width: 210px;
    padding: 8px 12px 10px;
    background: var(--vscode-editorHoverWidget-background);
    border: 1px solid var(--vscode-editorHoverWidget-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    color: var(--vscode-editorHoverWidget-foreground);
    font-size: 12px;
    white-space: nowrap;

    /* Bridge the 8px gap so mouse moving from widget to tooltip doesn't trigger onMouseLeave */
    &::after {
        content: '';
        position: absolute;
        bottom: -8px;
        left: 0;
        right: 0;
        height: 8px;
    }
`;

const TooltipTitle = styled.div`
    font-weight: 600;
    margin-bottom: 3px;
    color: var(--vscode-editorHoverWidget-foreground);
`;

const TooltipSubtitle = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
`;

/* Container: just geometry, no opacity — so children's opacity is independent */
const ProgressBarContainer = styled.div`
    position: relative;
    height: 3px;
    border-radius: 2px;
    margin-bottom: 8px;
`;

/* Track: full-width background at low opacity — sibling of fill, NOT parent */
const ProgressTrack = styled.div`
    position: absolute;
    inset: 0;
    background: var(--vscode-progressBar-background);
    opacity: 0.2;
    border-radius: 2px;
`;

/* Fill: partial-width at full opacity — sibling of track, unaffected by track's opacity */
const ProgressFill = styled.div<{ $fillWidth: string }>`
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: ${({ $fillWidth }: { $fillWidth: string }) => $fillWidth};
    background: var(--vscode-progressBar-background);
    border-radius: 2px;
`;

const SectionLabel = styled.div`
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-top: 6px;
    margin-bottom: 2px;
`;

const CategoryRow = styled.div`
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--vscode-editorHoverWidget-foreground);
    padding: 1px 0 1px 8px;
`;

const CategoryName = styled.span`
    color: var(--vscode-descriptionForeground);
`;

const CategoryPct = styled.span`
    font-variant-numeric: tabular-nums;
`;

// ---- Helpers ----

function formatK(tokens: number): string {
    return (tokens / 1000).toFixed(1) + "K";
}

function toPct(tokens: number): string {
    return (tokens / MAX_CONTEXT_WINDOW * 100).toFixed(1) + "%";
}

// ---- Component ----

const ContextUsageWidget: React.FC<ContextUsageWidgetProps> = ({ percentage, inputTokens, breakdown }) => {
    const [visible, setVisible] = useState(false);
    const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clampedPct = Math.min(100, Math.max(0, percentage));

    // SVG ring geometry
    const size = 20;
    const cx = size / 2;
    const cy = size / 2;
    const r = 8;
    const circumference = 2 * Math.PI * r;
    const filled = (clampedPct / 100) * circumference;
    const gap = circumference - filled;

    const maxContextK = Math.round(MAX_CONTEXT_WINDOW / 1000000);

    const scheduleShow = () => {
        clearTimeout(hideTimer.current!);
        showTimer.current = setTimeout(() => setVisible(true), TOOLTIP_SHOW_MS);
    };

    const scheduleHide = () => {
        clearTimeout(showTimer.current!);
        hideTimer.current = setTimeout(() => setVisible(false), TOOLTIP_HIDE_MS);
    };

    return (
        <WidgetContainer onMouseEnter={scheduleShow} onMouseLeave={scheduleHide}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                aria-hidden="true"
            >
                {/* Background ring */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="var(--vscode-descriptionForeground)"
                    strokeOpacity={0.2}
                    strokeWidth={2}
                />
                {/* Filled arc */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="var(--vscode-descriptionForeground)"
                    strokeWidth={2}
                    strokeDasharray={`${filled} ${gap}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${cx} ${cy})`}
                />
            </svg>
            <Label>{clampedPct}%</Label>

            {visible && (
                <TooltipPopup onMouseEnter={scheduleShow} onMouseLeave={scheduleHide}>
                    <TooltipTitle>Context Window</TooltipTitle>
                    <TooltipSubtitle>
                        {formatK(inputTokens)} / {maxContextK}M tokens &bull; {clampedPct}%
                    </TooltipSubtitle>

                    <ProgressBarContainer>
                        <ProgressTrack />
                        <ProgressFill $fillWidth={`${clampedPct}%`} />
                    </ProgressBarContainer>

                    {breakdown && (
                        <>
                            <SectionLabel>System</SectionLabel>
                            <CategoryRow>
                                <CategoryName>System Instructions</CategoryName>
                                <CategoryPct>{toPct(breakdown.systemInstructions)}</CategoryPct>
                            </CategoryRow>
                            <CategoryRow>
                                <CategoryName>Tool Definitions</CategoryName>
                                <CategoryPct>{toPct(breakdown.toolDefinitions)}</CategoryPct>
                            </CategoryRow>

                            <SectionLabel>User Context</SectionLabel>
                            <CategoryRow>
                                <CategoryName>Project Files</CategoryName>
                                <CategoryPct>{toPct(breakdown.files)}</CategoryPct>
                            </CategoryRow>
                            <CategoryRow>
                                <CategoryName>Messages</CategoryName>
                                <CategoryPct>{toPct(breakdown.messages)}</CategoryPct>
                            </CategoryRow>
                            <CategoryRow>
                                <CategoryName>Tool Results</CategoryName>
                                <CategoryPct>{toPct(breakdown.toolResults)}</CategoryPct>
                            </CategoryRow>
                        </>
                    )}
                </TooltipPopup>
            )}
        </WidgetContainer>
    );
};

export default ContextUsageWidget;
