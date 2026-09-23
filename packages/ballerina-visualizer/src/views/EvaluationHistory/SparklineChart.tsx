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

import React, { useRef, useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { EvaluationRunDataPoint } from "./types";

const PAD_X = 16;
const PAD_Y = 12;
const DOT_R = 4.5;
const CHART_HEIGHT = 90;

interface TooltipData {
    x: number;
    y: number;
    run: EvaluationRunDataPoint;
}

const Container = styled.div`
    flex: 1;
    height: ${CHART_HEIGHT}px;
    min-width: 0;

    svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
    }
`;

const Tooltip = styled.div`
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--vscode-editorHoverWidget-background, #252526);
    border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.6;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: 220px;
`;

const TtDate = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
`;

const TtRate = styled.div<{ isPassed: boolean }>`
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 2px;
    color: ${(p: { isPassed: boolean }) =>
        p.isPassed
            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
            : "var(--vscode-editorGutter-deletedBackground, #f85149)"};
`;

const TtSep = styled.span`
    opacity: 0.4;
    margin: 0 3px;
    font-weight: 400;
    font-size: 12px;
`;

const TtStatus = styled.div<{ isPassed: boolean }>`
    font-size: 11px;
    font-weight: 600;
    color: ${(p: { isPassed: boolean }) =>
        p.isPassed
            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
            : "var(--vscode-editorGutter-deletedBackground, #f85149)"};
`;

const TtOutcomes = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 2px;
`;

const TtGit = styled.div`
    font-size: 10px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
    font-family: var(--vscode-editor-font-family, monospace);
`;

const TtDirtyIndicator = styled.span`
    color: var(--vscode-editorWarning-foreground, #cca700);
    margin-left: 4px;
`;

function formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

interface SparklineChartProps {
    runs: EvaluationRunDataPoint[];
    onDotClick?: (run: EvaluationRunDataPoint) => void;
}

export function SparklineChart({ runs, onDotClick }: SparklineChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(400);
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        if (w > 0) setWidth(w);

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newW = entry.contentRect.width;
                if (newW > 0) setWidth(newW);
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const handleMouseEnter = useCallback(
        (e: React.MouseEvent, run: EvaluationRunDataPoint) => {
            setTooltip({ x: e.clientX, y: e.clientY, run });
        },
        []
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (tooltip) {
                setTooltip((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
            }
        },
        [tooltip]
    );

    const handleMouseLeave = useCallback(() => {
        setTooltip(null);
    }, []);

    if (!runs.length) return <Container ref={containerRef} />;

    const scaleX = (i: number) =>
        runs.length === 1
            ? width / 2
            : PAD_X + (i / (runs.length - 1)) * (width - PAD_X * 2);

    const scaleY = (v: number) =>
        PAD_Y + (1 - v) * (CHART_HEIGHT - PAD_Y * 2);

    const targetPoints = runs
        .map((run, i) => `${scaleX(i).toFixed(1)},${scaleY(run.targetPassRate).toFixed(1)}`)
        .join(" ");
    const firstTargetY = scaleY(runs[0].targetPassRate);
    const firstTargetPct = Math.round(runs[0].targetPassRate * 100);

    const points = runs
        .map((_, i) => `${scaleX(i).toFixed(1)},${scaleY(runs[i].passRate).toFixed(1)}`)
        .join(" ");

    const areaPoints =
        points +
        ` ${scaleX(runs.length - 1).toFixed(1)},${(CHART_HEIGHT - PAD_Y).toFixed(1)}` +
        ` ${scaleX(0).toFixed(1)},${(CHART_HEIGHT - PAD_Y).toFixed(1)}`;

    const gradId = `sparkGrad-${Math.random().toString(36).slice(2)}`;

    const TOOLTIP_OFFSET = 14;
    const TOOLTIP_MAX_WIDTH = 220;
    const tooltipX = tooltip
        ? (tooltip.x + TOOLTIP_OFFSET + TOOLTIP_MAX_WIDTH > window.innerWidth
            ? tooltip.x - TOOLTIP_OFFSET - TOOLTIP_MAX_WIDTH
            : tooltip.x + TOOLTIP_OFFSET)
        : 0;
    const tooltipY = tooltip ? (tooltip.y - 10) : 0;

    return (
        <Container ref={containerRef}>
            <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--vscode-charts-blue)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--vscode-charts-blue)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <polygon points={areaPoints} fill={`url(#${gradId})`} />
                <polyline
                    points={targetPoints}
                    fill="none"
                    stroke="var(--vscode-terminal-ansiCyan, #0598bc)"
                    strokeWidth={1.5}
                    strokeDasharray="5,4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                <text
                    x={PAD_X}
                    y={firstTargetY - 4}
                    fontSize={9}
                    fill="var(--vscode-terminal-ansiCyan, #0598bc)"
                >
                    {firstTargetPct}% min
                </text>
                <polyline
                    points={points}
                    fill="none"
                    stroke="var(--vscode-charts-blue)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                {runs.map((run, i) => {
                    const cx = scaleX(i);
                    const cy = scaleY(run.passRate);
                    const isPassed = run.passRate >= run.targetPassRate;
                    return (
                        <circle
                            key={i}
                            cx={cx}
                            cy={cy}
                            r={DOT_R}
                            fill={
                                isPassed
                                    ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
                                    : "var(--vscode-editorGutter-deletedBackground, #f85149)"
                            }
                            style={{ cursor: "pointer", transition: "r 0.1s" }}
                            onClick={() => onDotClick?.(run)}
                            onMouseEnter={(e) => handleMouseEnter(e, run)}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        />
                    );
                })}
            </svg>

            {tooltip && (
                <Tooltip style={{ left: tooltipX, top: tooltipY }}>
                    <TtDate>{formatDate(tooltip.run.date)}</TtDate>
                    <TtRate isPassed={tooltip.run.passRate >= tooltip.run.targetPassRate}>
                        {(tooltip.run.passRate * 100).toFixed(0)}%
                        <TtSep>(min {(tooltip.run.targetPassRate * 100).toFixed(0)}%)</TtSep>
                    </TtRate>
                    <TtStatus isPassed={tooltip.run.passRate >= tooltip.run.targetPassRate}>
                        {tooltip.run.passRate >= tooltip.run.targetPassRate ? "\u2713 Passed" : "\u2717 Failed"}
                    </TtStatus>
                    <TtOutcomes>
                        {tooltip.run.evaluationRuns.reduce(
                            (s, r) => s + r.outcomes.filter((o) => o.passed).length,
                            0
                        )}{" "}
                        /{" "}
                        {tooltip.run.evaluationRuns.reduce(
                            (s, r) => s + r.outcomes.length,
                            0
                        )}{" "}
                        outcomes passed
                    </TtOutcomes>
                    {tooltip.run.gitState?.commitSha && (
                        <TtGit>
                            {tooltip.run.gitState.isDirty ? "Snapshot" : "Committed"}
                            {tooltip.run.gitState.isDirty && (
                                <TtDirtyIndicator> (unsaved changes)</TtDirtyIndicator>
                            )}
                        </TtGit>
                    )}
                </Tooltip>
            )}
        </Container>
    );
}
