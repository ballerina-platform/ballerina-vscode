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

import { useState } from "react";
import styled from "@emotion/styled";
import { Codicon, Icon } from "@wso2/ui-toolkit";
import { ExecutionStep } from "@wso2/ballerina-core";

interface ExecutionTimelineProps {
    steps: ExecutionStep[];
    traceId: string;
    onViewInTrace: (traceId: string, spanId: string) => void;
}

const TimelineContainer = styled.div`
    max-width: 600px;
    margin: 12px 0 0 36px;
`;

const TimelineTitle = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    letter-spacing: 0.5px;
`;

const TimelineHeader = styled.button`
    display: flex;
    align-items: center;
    gap: 2px;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
`;

const ToggleIcon = styled.span<{ isOpen: boolean }>`
    color: var(--vscode-descriptionForeground);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease;
    transform: ${(props: { isOpen: boolean }) => (props.isOpen ? "rotate(90deg)" : "rotate(0deg)")};
`;

const TimelineList = styled.div`
    margin-top: 8px;
    margin-bottom: 4px;
    display: flex;
    flex-direction: column;
    gap: 0;
`;

const TimelineItem = styled.div`
    display: flex;
    align-items: flex-start;
    position: relative;
    margin-bottom: 8px;

    &:last-of-type {
        margin-bottom: 0;
    }
`;

const ConnectorColumn = styled.div<{ isLast: boolean }>`
    width: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    flex-shrink: 0;
    padding-top: 4px;

    &::after {
        content: '';
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        width: 1px;
        height: calc(100% + 8px);
        background-color: var(--vscode-panel-border);
        display: ${(props: { isLast: boolean }) => props.isLast ? 'none' : 'block'};
    }
`;

const Dot = styled.div<{ operationType: string }>`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--vscode-panel-border);
    z-index: 1;
    flex-shrink: 0;
`;

const ContentCard = styled.div`
    width: 60%;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const CardContent = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const IconBadge = styled.div<{ operationType: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${(props: { operationType: string; }) => {
        switch (props.operationType) {
            case 'invoke': return 'var(--vscode-terminal-ansiCyan)';
            case 'chat': return 'var(--vscode-terminalSymbolIcon-optionForeground)';
            case 'tool': return 'var(--vscode-terminal-ansiBrightMagenta)';
            default: return 'var(--vscode-badge-foreground)';
        }
    }};
    flex-shrink: 0;
`;

const OperationLabel = styled.span<{ operationType: string }>`
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
`;

const SpanName = styled.span`
    font-size: 12px;
    color: var(--vscode-foreground);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const DEPTH_INDENT_PX = 16;

const Duration = styled.span`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
    margin-left: auto;
`;

export function ExecutionTimeline({ steps, traceId, onViewInTrace }: ExecutionTimelineProps) {
    const [open, setOpen] = useState(false);

    // Filter out steps with invoke operation type
    const filteredSteps = steps.filter(step => step.operationType !== 'invoke');

    if (!filteredSteps || filteredSteps.length === 0) {
        return null;
    }

    const getIconName = (operationType: string) => {
        switch (operationType) {
            case 'invoke': return 'bi-ai-agent';
            case 'chat': return 'bi-chat';
            case 'tool': return 'bi-wrench';
            default: return 'bi-action';
        }
    };

    const getOperationLabel = (operationType: string) => {
        switch (operationType) {
            case 'invoke': return 'Agent';
            case 'chat': return 'Chat';
            case 'tool': return 'Execute Tool';
            default: return 'Other';
        }
    };

    const formatDuration = (ms: number) => {
        if (ms < 1000) {
            return `${Math.round(ms)}ms`;
        }
        return `${(ms / 1000).toFixed(2)}s`;
    };

    return (
        <TimelineContainer>
            <TimelineHeader onClick={() => setOpen(!open)} aria-expanded={open}>
                <TimelineTitle>Execution Steps ({filteredSteps.length})</TimelineTitle>
                <ToggleIcon isOpen={open}>
                    <Codicon name="chevron-right" sx={{ fontSize: "14px", width: "14px", height: "14px", display: "flex", alignItems: "center", justifyContent: "center" }} iconSx={{ display: "flex" }} />
                </ToggleIcon>
            </TimelineHeader>
            {open && (
                <TimelineList>
                    {filteredSteps.map((step, index) => {
                        // A tool that runs another agent reads as that agent; the tool name stays in the tooltip
                        const kind = step.delegatesTo ? 'invoke' : step.operationType;
                        return (
                        <TimelineItem key={step.spanId}>
                            <ConnectorColumn isLast={index === filteredSteps.length - 1}>
                                <Dot operationType={step.operationType} />
                            </ConnectorColumn>
                            <ContentCard
                                onClick={() => onViewInTrace(traceId, step.spanId)}
                                title={step.delegatesTo ? `${step.name} → ${step.delegatesTo}` : step.fullName}
                                style={{ marginLeft: (step.depth ?? 0) * DEPTH_INDENT_PX }}
                            >
                                <CardContent>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                        <IconBadge operationType={kind}>
                                            <Icon
                                                name={getIconName(kind)}
                                                sx={{
                                                    fontSize: '14px',
                                                    width: '14px',
                                                    height: '14px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                iconSx={{
                                                    fontSize: "14px",
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                            />
                                        </IconBadge>
                                        <OperationLabel operationType={kind}>
                                            {getOperationLabel(kind)}
                                        </OperationLabel>
                                    </div>
                                    <SpanName>{step.delegatesTo ?? step.name}</SpanName>
                                    <Duration>{formatDuration(step.duration)}</Duration>
                                    <Codicon name="chevron-right" />
                                </CardContent>
                            </ContentCard>
                        </TimelineItem>
                        );
                    })}
                </TimelineList>
            )}
        </TimelineContainer>
    );
}
