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
import { EvaluationRun } from "./types";

const PAD_X = 40;
const PAD_Y = 16;
const DOT_R = 5;
const CHART_HEIGHT = 120;

interface TooltipData {
    x: number;
    y: number;
    run: EvaluationRun;
}

const Container = styled.div`
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

const TtRate = styled.div<{ isPassed: boolean }>`
    font-size: 14px;
    font-weight: 700;
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

interface RunPassRateChartProps {
    runs: EvaluationRun[];
    targetPassRate: number;
}

export function RunPassRateChart({ runs, targetPassRate }: RunPassRateChartProps) {
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
        (e: React.MouseEvent, run: EvaluationRun) => {
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

    if (runs.length <= 1) return null;

    const scaleX = (i: number) =>
        PAD_X + (i / (runs.length - 1)) * (width - PAD_X * 2);

    const scaleY = (v: number) =>
        PAD_Y + (1 - v) * (CHART_HEIGHT - PAD_Y * 2);

    const ty = scaleY(targetPassRate);
    const targetPct = Math.round(targetPassRate * 100);

    const avgPassRate = runs.reduce((sum, r) => sum + r.passRate, 0) / runs.length;
    const ay = scaleY(avgPassRate);
    const avgPct = Math.round(avgPassRate * 100);

    const points = runs
        .map((_, i) => `${scaleX(i).toFixed(1)},${scaleY(runs[i].passRate).toFixed(1)}`)
        .join(" ");

    const areaPoints =
        points +
        ` ${scaleX(runs.length - 1).toFixed(1)},${(CHART_HEIGHT - PAD_Y).toFixed(1)}` +
        ` ${PAD_X},${(CHART_HEIGHT - PAD_Y).toFixed(1)}`;

    const gradId = `runGrad-${Math.random().toString(36).slice(2)}`;

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
                {/* Target pass rate line */}
                <line
                    x1={PAD_X}
                    y1={ty}
                    x2={width - PAD_X}
                    y2={ty}
                    stroke="var(--vscode-terminal-ansiCyan, #0598bc)"
                    strokeWidth={1.5}
                    strokeDasharray="5,4"
                />
                <text
                    x={PAD_X}
                    y={ty - 4}
                    fontSize={9}
                    fill="var(--vscode-terminal-ansiCyan, #0598bc)"
                >
                    needs {targetPct}%
                </text>
                {/* Average observed pass rate line */}
                <line
                    x1={PAD_X}
                    y1={ay}
                    x2={width - PAD_X}
                    y2={ay}
                    stroke={
                        avgPassRate >= targetPassRate
                            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
                            : "var(--vscode-editorGutter-deletedBackground, #f85149)"
                    }
                    strokeWidth={1.5}
                    strokeDasharray="3,3"
                    opacity={0.7}
                />
                <text
                    x={width - PAD_X}
                    y={ay - 4}
                    fontSize={9}
                    fill={
                        avgPassRate >= targetPassRate
                            ? "var(--vscode-editorGutter-addedBackground, #2ea043)"
                            : "var(--vscode-editorGutter-deletedBackground, #f85149)"
                    }
                    textAnchor="end"
                >
                    {avgPct}% avg
                </text>
                {/* Line connecting dots */}
                <polyline
                    points={points}
                    fill="none"
                    stroke="var(--vscode-charts-blue)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                {/* X-axis run labels */}
                {runs.map((_, i) => (
                    <text
                        key={`label-${i}`}
                        x={scaleX(i)}
                        y={CHART_HEIGHT - 2}
                        fontSize={9}
                        fill="var(--vscode-descriptionForeground)"
                        textAnchor="middle"
                    >
                        Run {runs[i].id}
                    </text>
                ))}
                {/* Dots */}
                {runs.map((run, i) => {
                    const cx = scaleX(i);
                    const cy = scaleY(run.passRate);
                    const isPassed = run.passRate >= targetPassRate;
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
                            onMouseEnter={(e) => handleMouseEnter(e, run)}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        />
                    );
                })}
            </svg>

            {tooltip && (
                <Tooltip style={{ left: tooltipX, top: tooltipY }}>
                    <TtRate isPassed={tooltip.run.passRate >= targetPassRate}>
                        Run {tooltip.run.id}: {(tooltip.run.passRate * 100).toFixed(0)}%
                    </TtRate>
                    <TtOutcomes>
                        {tooltip.run.outcomes.filter((o) => o.passed).length}
                        {" / "}
                        {tooltip.run.outcomes.length}
                        {" outcomes passed"}
                    </TtOutcomes>
                </Tooltip>
            )}
        </Container>
    );
}
