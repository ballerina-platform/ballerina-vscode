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

import React, { useEffect, useMemo, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Icon, ThemeColors } from "@wso2/ui-toolkit";
import { TraceData } from "../index";
import { SpanDetails } from "./SpanDetails";
import { SearchInput } from "./SearchInput";
import { ExportDropdown } from "./ExportDropdown";
import { AgentRun, buildAgentFlowModel } from "./agentflow/model";
import { GraphView, GraphViewHandle } from "./agentflow/GraphView";

interface AgentFlowProps {
    traceData: TraceData;
    selectedSpanId: string | null;
    onSelectSpan: (spanId: string) => void;
    totalInputTokens: number;
    totalOutputTokens: number;
    showInternalSpans: boolean;
    onClose: () => void;
    onExportJson: () => void;
    onExportEvalset: () => void;
}

const PANEL_DEFAULT_W = 600;
const PANEL_MIN_W = 360;
const PANEL_MAX_W = 900;
const REPLAY_STEP_MS = 1500;
const REPLAY_CYAN = "var(--vscode-terminal-ansiCyan)";

const Root = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
`;

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    flex-shrink: 0;
`;

const SideGroup = styled.div<{ align: "left" | "right" }>`
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    justify-content: ${(p: { align: "left" | "right" }) => (p.align === "right" ? "flex-end" : "flex-start")};
`;

const BackButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    background: transparent;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 5px;
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    flex-shrink: 0;

    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
        border-color: ${ThemeColors.PRIMARY};
    }
`;

const Title = styled.span`
    font-size: 15px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    flex-shrink: 0;
`;

const SearchWrap = styled.div`
    width: 260px;
    flex-shrink: 1;
    min-width: 120px;
`;

// Floating playback dock over the canvas (top-left), keeps the toolbar uncluttered.
const ReplayDock = styled.div`
    position: absolute;
    top: 14px;
    left: 14px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 8px;
`;

// Shared compact button for Replay / Call order (opaque so it reads over the canvas).
const ToolButton = styled.button<{ active?: boolean }>`
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 12px;
    flex-shrink: 0;
    border: 1px solid ${(p: { active?: boolean }) => (p.active ? ThemeColors.PRIMARY : ThemeColors.OUTLINE_VARIANT)};
    border-radius: 5px;
    background-color: ${(p: { active?: boolean }) => (p.active ? ThemeColors.SURFACE_CONTAINER : ThemeColors.SURFACE)};
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);

    &:hover:not(:disabled) {
        border-color: ${ThemeColors.PRIMARY};
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }

    &:disabled {
        cursor: default;
        opacity: 0.5;
    }
`;

// Small count pill inside the Call order button (and replay progress).
const CountPill = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 10.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
`;

// Live "now running" chip shown while a call-order replay is playing.
const ReplayStatus = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 12px;
    flex-shrink: 1;
    min-width: 0;
    max-width: 240px;
    border-radius: 5px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    background-color: ${ThemeColors.SURFACE};
    color: ${ThemeColors.ON_SURFACE};
    font-size: 13px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
`;

const ReplayStatusName = styled.span`
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
`;

const ReplayStatusStep = styled.span`
    flex-shrink: 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-variant-numeric: tabular-nums;
`;

const CallOrderAnchor = styled.div`
    position: relative;
    flex-shrink: 0;
`;

const Popover = styled.div`
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 40;
    width: 280px;
    max-height: min(60vh, 460px);
    overflow-y: auto;
    padding: 6px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
`;

const PopoverCaption = styled.div`
    padding: 4px 8px 6px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const StepItem = styled.button<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 34px;
    padding: 5px 8px;
    border: none;
    border-radius: 6px;
    background-color: ${(p: { active: boolean }) => (p.active ? ThemeColors.SURFACE_CONTAINER : "transparent")};
    color: ${ThemeColors.ON_SURFACE};
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: 12.5px;
    text-align: left;

    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const StepNum = styled.span<{ active: boolean }>`
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: ${(p: { active: boolean }) => (p.active ? "var(--vscode-button-foreground)" : ThemeColors.ON_SURFACE)};
    background-color: ${(p: { active: boolean }) => (p.active ? REPLAY_CYAN : ThemeColors.SURFACE_CONTAINER)};
    border: 1px solid ${(p: { active: boolean }) => (p.active ? REPLAY_CYAN : ThemeColors.OUTLINE_VARIANT)};
`;

const StepDot = styled.span<{ color: string }>`
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${(p: { color: string }) => p.color};
`;

const StepName = styled.span`
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const Stage = styled.div`
    position: relative;
    flex: 1;
    overflow: hidden;
`;

// Floating zoom controls, integrator style.
const Controls = styled.div`
    position: absolute;
    bottom: 20px;
    left: 20px;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const ControlGroup = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 5px;
    overflow: hidden;

    & > *:not(:last-child) {
        border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    }
`;

const ControlButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background-color: ${ThemeColors.SURFACE};
    color: ${ThemeColors.ON_SURFACE};
    border: none;
    cursor: pointer;

    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
    }
`;

const Backdrop = styled.div<{ open: boolean }>`
    position: absolute;
    inset: 0;
    z-index: 25;
    background-color: rgba(0, 0, 0, 0.35);
    opacity: ${(p: { open: boolean }) => (p.open ? 1 : 0)};
    visibility: ${(p: { open: boolean }) => (p.open ? "visible" : "hidden")};
    transition: opacity 0.2s ease, visibility 0.2s ease;
`;

const Panel = styled.div<{ open: boolean; width: number }>`
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: ${(p: { width: number }) => p.width}px;
    max-width: 90%;
    display: flex;
    flex-direction: column;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    border-left: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    box-shadow: ${(p: { open: boolean }) => (p.open ? "-8px 0 24px rgba(0, 0, 0, 0.28)" : "none")};
    transform: translate3d(${(p: { open: boolean }) => (p.open ? "0, 0, 0" : "101%, 0, 0")});
    transition: transform 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
    /* Promote to its own compositor layer so the slide is a pure GPU transform
       (avoids repainting the blurred shadow each frame — janky on Retina). */
    will-change: transform;
    backface-visibility: hidden;
    z-index: 30;
`;

const PanelResizer = styled.div<{ active: boolean }>`
    position: absolute;
    top: 0;
    left: -3px;
    bottom: 0;
    width: 7px;
    cursor: col-resize;
    z-index: 31;
    background-color: ${(p: { active: boolean }) => (p.active ? ThemeColors.PRIMARY : "transparent")};
    opacity: ${(p: { active: boolean }) => (p.active ? 0.5 : 1)};

    &:hover {
        background-color: ${ThemeColors.PRIMARY};
        opacity: 0.4;
    }
`;

const PanelHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 8px 10px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    flex-shrink: 0;
`;

const CloseButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    cursor: pointer;

    &:hover {
        background-color: ${ThemeColors.SURFACE_CONTAINER};
        color: ${ThemeColors.ON_SURFACE};
    }
`;

const PanelBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px 16px;
`;

export function AgentFlow({
    traceData,
    selectedSpanId,
    onSelectSpan,
    totalInputTokens,
    totalOutputTokens,
    showInternalSpans,
    onClose,
    onExportJson,
    onExportEvalset,
}: AgentFlowProps) {
    const model = useMemo(() => buildAgentFlowModel(traceData), [traceData]);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_W);
    const [isResizing, setIsResizing] = useState(false);
    const [isReplaying, setIsReplaying] = useState(false);
    const [replayIndex, setReplayIndex] = useState(-1);
    const [callOrderOpen, setCallOrderOpen] = useState(false);
    const stageRef = useRef<HTMLDivElement>(null);
    const graphRef = useRef<GraphViewHandle>(null);
    const callOrderRef = useRef<HTMLDivElement>(null);
    const orderedCalls = useMemo(
        () => model.runs
            .filter((run): run is AgentRun & { seq: number } => run.seq != null)
            .sort((a, b) => a.seq - b.seq),
        [model.runs]
    );
    const currentReplayRun = isReplaying && replayIndex >= 0 ? orderedCalls[replayIndex] ?? null : null;
    const replayRunId = currentReplayRun?.runId ?? null;

    useEffect(() => {
        if (!callOrderOpen) return;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (callOrderRef.current && !callOrderRef.current.contains(event.target as Node)) {
                setCallOrderOpen(false);
            }
        };
        document.addEventListener("mousedown", closeOnOutsideClick);
        return () => document.removeEventListener("mousedown", closeOnOutsideClick);
    }, [callOrderOpen]);

    const selectedSpan = useMemo(
        () => traceData.spans.find((s) => s.spanId === selectedSpanId) || null,
        [traceData.spans, selectedSpanId]
    );

    // The canvas only reflects a selection while the details panel is open.
    const activeSelection = panelOpen ? selectedSpanId : null;

    const handleSelect = (spanId: string) => {
        // Any manual inspection takes over from the guided replay.
        setIsReplaying(false);
        setReplayIndex(-1);
        onSelectSpan(spanId);
        setPanelOpen(true);
    };

    const startReplay = () => {
        if (isReplaying) {
            setIsReplaying(false);
            setReplayIndex(-1);
            return;
        }
        setPanelOpen(false);
        setReplayIndex(0);
        setIsReplaying(true);
    };

    // Advance one call at a time, leaving each delegation highlighted long enough
    // to read the card and its incoming edge before moving to the next step.
    useEffect(() => {
        if (!isReplaying || orderedCalls.length === 0) return;
        const timer = window.setTimeout(() => {
            if (replayIndex >= orderedCalls.length - 1) {
                setIsReplaying(false);
                setReplayIndex(-1);
            } else {
                setReplayIndex((index) => index + 1);
            }
        }, REPLAY_STEP_MS);
        return () => window.clearTimeout(timer);
    }, [isReplaying, replayIndex, orderedCalls.length]);

    // Panel resize (drag the left edge).
    useEffect(() => {
        if (!isResizing) return;
        const move = (e: MouseEvent) => {
            const rect = stageRef.current?.getBoundingClientRect();
            if (!rect) return;
            const fromRight = rect.right - e.clientX;
            setPanelWidth(Math.max(PANEL_MIN_W, Math.min(fromRight, PANEL_MAX_W, rect.width - 120)));
        };
        const up = () => setIsResizing(false);
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        return () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", up);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isResizing]);

    const toggleExpand = (runId: string) => {
        setExpandedRuns((prev) => {
            const next = new Set(prev);
            if (next.has(runId)) next.delete(runId);
            else next.add(runId);
            return next;
        });
    };

    return (
        <Root>
            <Toolbar>
                <SideGroup align="left">
                    <BackButton onClick={onClose} title="Back to trace">
                        <Icon name="bi-arrow-back" sx={{ fontSize: "14px", width: "14px", height: "14px" }} iconSx={{ fontSize: "14px" }} />
                        Back
                    </BackButton>
                    <Title>Agent Flow</Title>
                </SideGroup>

                <SideGroup align="right">
                    <SearchWrap>
                        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Filter agents and tools…" />
                    </SearchWrap>
                    <ExportDropdown
                        onExportJson={onExportJson}
                        onExportEvalset={onExportEvalset}
                        buttonText=""
                        showIcon={true}
                        compact={true}
                    />
                </SideGroup>
            </Toolbar>

            <Stage ref={stageRef}>
                <GraphView
                    ref={graphRef}
                    model={model}
                    selectedSpanId={activeSelection}
                    onSelectSpan={handleSelect}
                    expandedRuns={expandedRuns}
                    onToggleExpand={toggleExpand}
                    searchQuery={searchQuery}
                    showInternalSpans={showInternalSpans}
                    replayRunId={replayRunId}
                />

                {orderedCalls.length > 0 && (
                    <ReplayDock>
                        <ToolButton
                            active={isReplaying}
                            onClick={startReplay}
                            title={isReplaying ? "Stop call-order replay" : "Replay agent calls in order"}
                        >
                            <Icon
                                isCodicon
                                name={isReplaying ? "debug-stop" : "play"}
                                sx={{ fontSize: "13px", width: "13px", height: "13px" }}
                                iconSx={{ fontSize: "13px" }}
                            />
                            {isReplaying ? "Stop" : "Replay"}
                        </ToolButton>

                        {currentReplayRun && (
                            <ReplayStatus title={`Running: ${currentReplayRun.agentName}`}>
                                <StepDot color={currentReplayRun.color} />
                                <ReplayStatusName>{currentReplayRun.agentName}</ReplayStatusName>
                                <ReplayStatusStep>{replayIndex + 1}/{orderedCalls.length}</ReplayStatusStep>
                            </ReplayStatus>
                        )}

                        <CallOrderAnchor ref={callOrderRef}>
                            <ToolButton
                                active={callOrderOpen}
                                onClick={() => setCallOrderOpen((open) => !open)}
                                title="Show agent call order"
                                aria-expanded={callOrderOpen}
                            >
                                <Icon isCodicon name="list-ordered" sx={{ fontSize: "13px", width: "13px", height: "13px" }} iconSx={{ fontSize: "13px" }} />
                                Call order
                                <CountPill>{orderedCalls.length}</CountPill>
                                <Icon isCodicon name="chevron-down" sx={{ fontSize: "12px" }} iconSx={{ fontSize: "12px" }} />
                            </ToolButton>

                            {callOrderOpen && (
                                <Popover role="menu" aria-label="Agent call order">
                                    <PopoverCaption>Call order</PopoverCaption>
                                    {orderedCalls.map((run) => {
                                        const active = replayRunId === run.runId || activeSelection === run.span.spanId;
                                        return (
                                            <StepItem
                                                key={run.runId}
                                                role="menuitem"
                                                active={active}
                                                title={`Step ${run.seq}: ${run.agentName}`}
                                                onClick={() => {
                                                    setCallOrderOpen(false);
                                                    handleSelect(run.span.spanId);
                                                }}
                                            >
                                                <StepNum active={active}>{run.seq}</StepNum>
                                                <StepDot color={run.color} />
                                                <StepName>{run.agentName}</StepName>
                                            </StepItem>
                                        );
                                    })}
                                </Popover>
                            )}
                        </CallOrderAnchor>
                    </ReplayDock>
                )}

                <Controls>
                    <ControlGroup>
                        <ControlButton title="Fit to canvas" onClick={() => graphRef.current?.fit()}>
                            <Icon name="bi-fit-screen" sx={{ fontSize: "16px", width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                        </ControlButton>
                    </ControlGroup>
                    <ControlGroup>
                        <ControlButton title="Zoom in" onClick={() => graphRef.current?.zoomIn()}>
                            <Icon name="bi-plus" sx={{ fontSize: "16px", width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                        </ControlButton>
                        <ControlButton title="Zoom out" onClick={() => graphRef.current?.zoomOut()}>
                            <Icon name="bi-minus" sx={{ fontSize: "16px", width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                        </ControlButton>
                    </ControlGroup>
                </Controls>

                <Backdrop open={panelOpen} onClick={() => setPanelOpen(false)} />

                <Panel open={panelOpen} width={panelWidth}>
                    <PanelResizer active={isResizing} onMouseDown={() => setIsResizing(true)} />
                    <PanelHeader>
                        <CloseButton title="Close details" onClick={() => setPanelOpen(false)}>
                            <Icon name="bi-close" sx={{ fontSize: "16px", width: "16px", height: "16px" }} iconSx={{ fontSize: "16px" }} />
                        </CloseButton>
                    </PanelHeader>
                    <PanelBody>
                        {selectedSpan && (
                            <SpanDetails
                                spanData={selectedSpan}
                                spanName={selectedSpan.name}
                                totalInputTokens={totalInputTokens}
                                totalOutputTokens={totalOutputTokens}
                            />
                        )}
                    </PanelBody>
                </Panel>
            </Stage>
        </Root>
    );
}
