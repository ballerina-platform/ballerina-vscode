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

import React, { useState, useMemo } from "react";
import styled from "@emotion/styled";
import { Icon } from "@wso2/ui-toolkit";
import { SpanData, TraceData } from "./index";
import { formatDate, getAttributeValue, extractUserMessage, extractAgentResponse, calculateTotalInputTokens, calculateTotalOutputTokens, calculateTraceLatency, formatDuration, formatNumber } from "./utils";
import { SearchInput } from "./components/SearchInput";
import { ExportDropdown } from "./components/ExportDropdown";

interface SessionOverviewProps {
    sessionTraces: TraceData[];
    sessionId: string;
    onSelectTrace: (traceId: string) => void;
    onExportSession: () => void;
}

interface TraceRowData {
    traceId: string;
    timestamp: string;
    userMessage: string;
    agentResponse: string;
    latency: number | null;
    inputTokens: number;
    outputTokens: number;
}

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    overflow: hidden;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 24px 16px 24px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const HeaderLeft = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Title = styled.h1`
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--vscode-foreground);
    display: flex;
    align-items: center;
    gap: 8px;
`;

const TraceCount = styled.span`
    font-size: 14px;
    color: var(--vscode-descriptionForeground);
    font-weight: 400;
`;

const SessionTitle = styled.span`
    color: var(--vscode-textLink-activeForeground);
`;

const Subtitle = styled.div`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
`;

const HeaderRight = styled.div`
    display: flex;
    gap: 8px;
`;

const ExportButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--vscode-button-border);
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

const SearchContainer = styled.div`
    padding: 16px 24px;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const TableContainer = styled.div`
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
`;

const TableHead = styled.thead`
    position: sticky;
    top: 0;
    background-color: var(--vscode-editor-background);
    z-index: 1;
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const TableHeader = styled.th`
    text-align: left;
    padding: 12px 24px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--vscode-panel-border);
    white-space: nowrap;
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid var(--vscode-panel-border);

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:active {
        background-color: var(--vscode-list-activeSelectionBackground);
    }
`;

const TableCell = styled.td`
    padding: 12px 24px;
    color: var(--vscode-foreground);
    vertical-align: top;
    max-width: 400px;
`;

const TimestampCell = styled(TableCell)`
    white-space: nowrap;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const TraceIdCell = styled(TableCell)`
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-textLink-foreground);
    white-space: nowrap;
`;

const MessageCell = styled(TableCell)`
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const NumericCell = styled(TableCell)`
    white-space: nowrap;
    text-align: right;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--vscode-descriptionForeground);
    padding: 48px;
`;

const EmptyStateIcon = styled.div`
    font-size: 48px;
    opacity: 0.5;
`;

const EmptyStateTitle = styled.div`
    font-size: 16px;
    font-weight: 600;
`;

const EmptyStateSubtitle = styled.div`
    font-size: 13px;
`;

export function SessionOverview({ sessionTraces, sessionId, onSelectTrace, onExportSession }: SessionOverviewProps) {
    const [searchQuery, setSearchQuery] = useState("");

    const handleExportAsEvalset = () => {
        // Use the traceVisualizerAPI if available
        if (window.traceVisualizerAPI?.exportSessionAsEvalset) {
            window.traceVisualizerAPI.exportSessionAsEvalset(sessionTraces, sessionId);
        }
    };

    // Extract trace row data
    const traceRows: TraceRowData[] = useMemo(() => {
        return sessionTraces.map(trace => {
            // Spans arrive as they end, so a sub-agent's invoke_agent comes before its caller's; the root starts first
            const startOf = (span: SpanData) => Date.parse(span.startTime ?? '') || 0;
            const byStart = [...trace.spans].sort((a, b) => startOf(a) - startOf(b));
            const invokeSpan = byStart.find(span =>
                getAttributeValue(span.attributes, 'gen_ai.operation.name')?.startsWith('invoke_agent'));

            const timestamp = byStart[0]?.startTime || trace.firstSeen;
            const userMessage = invokeSpan ? extractUserMessage(invokeSpan) : '';
            const agentResponse = invokeSpan ? extractAgentResponse(invokeSpan) : '';

            // Calculate latency and token counts
            const latency = calculateTraceLatency(trace.spans);
            const inputTokens = calculateTotalInputTokens(trace.spans);
            const outputTokens = calculateTotalOutputTokens(trace.spans);

            return {
                traceId: trace.traceId,
                timestamp,
                userMessage,
                agentResponse,
                latency,
                inputTokens,
                outputTokens
            };
        });
    }, [sessionTraces]);

    // Filter traces based on search query
    const filteredRows = useMemo(() => {
        if (!searchQuery) return traceRows;

        const query = searchQuery.toLowerCase();
        return traceRows.filter(row =>
            row.traceId.toLowerCase().includes(query) ||
            row.userMessage.toLowerCase().includes(query) ||
            row.agentResponse.toLowerCase().includes(query)
        );
    }, [traceRows, searchQuery]);

    // Extract session title from first trace's attributes
    const sessionTitle = useMemo(() => {
        if (sessionTraces.length === 0) return null;

        // Look for a session name attribute
        const firstTrace = sessionTraces[0];
        for (const span of firstTrace.spans) {
            const title = getAttributeValue(span.attributes, 'gen_ai.conversation.name');
            if (title) return title;
        }

        return null;
    }, [sessionTraces]);

    return (
        <Container>
            <Header>
                <HeaderLeft>
                    <Title>
                        Session Traces
                        <TraceCount>({sessionTraces.length} traces)</TraceCount>
                        {sessionTitle && (
                            <>
                                <SessionTitle>{sessionTitle}</SessionTitle>
                            </>
                        )}
                    </Title>
                    <Subtitle>Session ID: {sessionId}</Subtitle>
                </HeaderLeft>
                <HeaderRight>
                    <ExportDropdown
                        onExportJson={onExportSession}
                        onExportEvalset={handleExportAsEvalset}
                        buttonText="Export"
                        showIcon={true}
                        compact={false}
                    />
                </HeaderRight>
            </Header>

            <SearchContainer>
                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search traces by message or ID..."
                />
            </SearchContainer>

            <TableContainer>
                {filteredRows.length === 0 ? (
                    <EmptyState>
                        <EmptyStateIcon>
                            <Icon
                                name="bi-search"
                                sx={{ fontSize: '48px', width: '48px', height: '48px' }}
                                iconSx={{ display: 'flex' }}
                            />
                        </EmptyStateIcon>
                        <EmptyStateTitle>
                            {searchQuery ? 'No traces found' : 'No traces in this session'}
                        </EmptyStateTitle>
                        <EmptyStateSubtitle>
                            {searchQuery ? 'Try different keywords' : 'Traces will appear here when available'}
                        </EmptyStateSubtitle>
                    </EmptyState>
                ) : (
                    <Table>
                        <TableHead>
                            <tr>
                                <TableHeader>Timestamp</TableHeader>
                                <TableHeader>Trace ID</TableHeader>
                                <TableHeader>Input</TableHeader>
                                <TableHeader>Output</TableHeader>
                                <TableHeader style={{ textAlign: 'right' }}>Latency</TableHeader>
                                <TableHeader style={{ textAlign: 'right' }}>Input Tokens</TableHeader>
                                <TableHeader style={{ textAlign: 'right' }}>Output Tokens</TableHeader>
                            </tr>
                        </TableHead>
                        <TableBody>
                            {filteredRows.map(row => (
                                <TableRow key={row.traceId} onClick={() => onSelectTrace(row.traceId)}>
                                    <TimestampCell>{formatDate(row.timestamp)}</TimestampCell>
                                    <TraceIdCell>{row.traceId}</TraceIdCell>
                                    <MessageCell title={row.userMessage}>{row.userMessage || '-'}</MessageCell>
                                    <MessageCell title={row.agentResponse}>{row.agentResponse || '-'}</MessageCell>
                                    <NumericCell>{row.latency !== null ? formatDuration(row.latency) : '-'}</NumericCell>
                                    <NumericCell>{formatNumber(row.inputTokens)}</NumericCell>
                                    <NumericCell>{formatNumber(row.outputTokens)}</NumericCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </TableContainer>
        </Container>
    );
}
