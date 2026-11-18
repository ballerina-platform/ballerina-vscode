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

import { useState, useMemo, ReactNode, useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { Icon } from "@wso2/ui-toolkit";
import { SearchInput } from "./SearchInput";
import { CollapsibleSection } from "./CollapsibleSection";
import { JsonViewer } from "./JsonViewer";
import { CopyButton } from "./CopyButton";
import { SpanData } from "../index";
import {
    extractUserErrorDetails,
    highlightText,
    textContainsSearch,
    getAttributeValue,
    formatDate,
    getSpanIconName,
    stripSpanPrefix
} from "../utils";
import {
    Highlight,
    CopyWrapper,
    ToggleGroup,
    ToggleButton,
    NoResultsContainer,
    NoResultsTitle,
    ClearSearchButton
} from "./shared-styles";

interface SpanDetailsProps {
    spanData: SpanData;
    spanName?: string;
    totalInputTokens?: number;
    totalOutputTokens?: number;
    includesSubAgents?: boolean;
}

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const SpanHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    position: relative;
`;

const SpanIcon = styled.span<{ type: string; spanKind?: string }>`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 3px;
    flex-shrink: 0;
    background-color: ${(props: { type: string; spanKind?: string }) => {
        // Only non-AI spans get background
        return props.type === 'other' ? 'var(--vscode-editor-background)' : 'transparent';
    }};
    border: ${(props: { type: string; spanKind?: string }) => {
        // Only non-AI spans get border
        return props.type === 'other' ? '1px solid var(--vscode-dropdown-border)' : 'none';
    }};
    color: ${(props: { type: string; spanKind?: string }) => {
        switch (props.type) {
            case 'invoke': return 'var(--vscode-terminal-ansiCyan)';
            case 'chat': return 'var(--vscode-terminalSymbolIcon-optionForeground)';
            case 'tool': return 'var(--vscode-terminal-ansiBrightMagenta)';
            case 'kb_retrieve': return 'var(--vscode-charts-purple)';
            case 'kb_ingest': return 'var(--vscode-charts-purple)';
            case 'embeddings': return 'var(--vscode-terminalSymbolIcon-optionForeground)';
            case 'generate_content': return 'var(--vscode-charts-green)';
            case 'other':
                // Use span kind colors for non-AI spans (matching TraceDetails)
                switch (props.spanKind?.toLowerCase()) {
                    case 'client': return 'var(--vscode-terminal-ansiBlue)';
                    case 'server': return 'var(--vscode-terminal-ansiGreen)';
                    default: return 'var(--vscode-foreground)';
                }
            default: return 'var(--vscode-badge-foreground)';
        }
    }};
`;

const SpanTitle = styled.h2`
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--vscode-foreground);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const IdButton = styled.button`
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    color: var(--vscode-foreground);
    transition: all 0.15s ease;
    gap: 4px;
    font-size: 12px;
    margin-left: auto;

    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }

    &:active {
        transform: scale(0.98);
    }
`;

const IdPopup = styled.div`
    position: absolute;
    top: calc(100% - 8px);
    right: 0;
    background-color: var(--vscode-editor-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-width: 300px;
    max-width: 400px;
    animation: popupFadeIn 0.1s ease-out;
    transform-origin: top right;

    @keyframes popupFadeIn {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
`;

const IdPopupTitle = styled.div`
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
`;

const IdRow = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    
    &:last-child {
        margin-bottom: 0;
    }
`;

const IdLabel = styled.div`
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.5px;
`;

const IdValueContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 8px 10px;
`;

const IdValue = styled.div`
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-foreground);
    word-break: break-all;
    flex: 1;
`;

const MetricsPills = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
`;

const MetricPill = styled.div`
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    background-color: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-editor-foreground);
    border-radius: 4px;
`;

const SectionContent = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const InputOutputGrid = styled.div`
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
`;

const SubSection = styled.div``;

const SubSectionTitle = styled.h4`
    margin: 0 0 8px 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    letter-spacing: 0.5px;
    display: flex;
    align-items: center;
    gap: 6px;
`;

const InputContentBlock = styled.div`
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--vscode-editor-foreground);
`;

const ErrorContent = styled.div`
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-errorForeground);
    border-radius: 4px;
    padding: 12px;
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--vscode-editor-foreground);
`;

const ErrorHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    color: var(--vscode-errorForeground);
`;

const ErrorHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
`;

const ErrorHeaderRight = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
`;

const NoResultsSubtitle = styled.div`
    font-size: 13px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
`;

// Advanced Details styles
const AdvancedDetailsContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const TechnicalIdsGrid = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const TechnicalRow = styled.div`
    display: flex;
    gap: 8px;
    font-size: 13px;
    line-height: 1.4;

    &:hover {
        & > span:last-child {
            opacity: 1;
        }
    }
`;

const TechnicalLabel = styled.span`
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
    flex-shrink: 0;
    width: 120px;
`;

const TechnicalValue = styled.span`
    color: var(--vscode-foreground);
    word-break: break-all;
`;

const AttributesList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const AttributeRow = styled.div`
    display: flex;
    gap: 8px;
    font-size: 13px;
    line-height: 1.4;

    &:hover {
        & > span:last-child {
            opacity: 1;
        }
    }
`;

const AttributeKey = styled.span`
    color: var(--vscode-textLink-foreground);
    white-space: nowrap;
    flex-shrink: 0;
`;

const AttributeValue = styled.span`
    color: var(--vscode-foreground);
    word-break: break-all;
`;

// Helper functions
function formatErrorText(rawText: string): string {
    if (typeof rawText !== "string") return rawText;

    const lines = rawText.split("\n");

    // Find where stack trace starts (first line with "at ")
    const stackTraceStartIndex = lines.findIndex(l => l.trim().startsWith("at "));

    let stackTrace: string[] = [];
    let nonStack: string;

    if (stackTraceStartIndex !== -1) {
        // Everything before stack trace
        nonStack = lines.slice(0, stackTraceStartIndex).join("\n");

        // Stack trace: from "at " line onwards (includes all subsequent indented lines)
        stackTrace = lines.slice(stackTraceStartIndex);
    } else {
        nonStack = lines.join("\n");
    }

    const output: string[] = [];

    output.push("Error Summary");
    output.push("=============");

    // Split summary and steps block
    const stepsIndex = nonStack.indexOf('{"steps":[');

    if (stepsIndex === -1) {
        output.push(nonStack.trim());
    } else {
        const summary = nonStack.slice(0, stepsIndex).trim();
        const stepsBlock = nonStack.slice(stepsIndex).trim();

        if (summary) output.push(summary);


        // ---- Error Details (extracted from embedded body JSON) ----
        const errorDetails = extractUserErrorDetails(rawText);

        if (errorDetails?.length) {
            output.push("");
            output.push("Error Details");
            output.push("=============");

            errorDetails.forEach((d, i) => {
                if (i > 0) output.push("");

                if (d.error_message) {
                    output.push(`Message: ${d.error_message}${d.code ? ` (${d.code})` : ""}`);
                }

                if (d.error_description) {
                    output.push(`Description: ${d.error_description}`);
                }
            });
        }

        // ---- Steps (verbatim) ----
        if (stepsBlock) {
            output.push("");
            output.push("Steps");
            output.push("=====");
            output.push(stepsBlock);
        }
    }

    // ---- Stack trace ----
    if (stackTrace.length) {
        output.push("");
        output.push("Stack Trace");
        output.push("===========");
        output.push(stackTrace.join("\n"));
    }

    return output.join("\n");
}

// Attributes to exclude from "Other Attributes" (shown elsewhere)
const EXCLUDED_ATTRIBUTE_KEYS = [
    'gen_ai.input.messages',
    'gen_ai.output.messages',
    'gen_ai.tool.arguments',
    'gen_ai.tool.output',
    'gen_ai.system_instructions',
    'gen_ai.input.tools',
    'gen_ai.input.content',
    'gen_ai.knowledge_base.ingest.input.chunks',
    'gen_ai.knowledge_base.retrieve.input.query',
    'gen_ai.knowledge_base.retrieve.output',
    'error.message'
];

export function SpanDetails({ spanData, spanName, totalInputTokens, totalOutputTokens, includesSubAgents }: SpanDetailsProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isIdPopupOpen, setIsIdPopupOpen] = useState(false);
    const [showRawError, setShowRawError] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Extract operation type
    const operationName = getAttributeValue(spanData.attributes, 'gen_ai.operation.name') || '';
    const spanType = useMemo(() => {
        if (operationName.startsWith('invoke_agent')) return 'invoke';
        if (operationName.startsWith('chat') || spanName?.toLowerCase().startsWith('chat')) return 'chat';
        if (operationName.startsWith('execute_tool') || spanName?.toLowerCase().startsWith('execute_tool')) return 'tool';
        if (operationName.startsWith('knowledge_base_retrieve') || spanName?.toLowerCase().startsWith('knowledge_base_retrieve')) return 'kb_retrieve';
        if (operationName.startsWith('knowledge_base_ingest') || spanName?.toLowerCase().startsWith('knowledge_base_ingest')) return 'kb_ingest';
        if (operationName.startsWith('embeddings') || spanName?.toLowerCase().startsWith('embeddings')) return 'embeddings';
        if (operationName.startsWith('generate_content') || spanName?.toLowerCase().startsWith('generate_content')) return 'generate_content';
        return 'other';
    }, [operationName, spanName]);

    // Get span kind for non-AI spans
    const spanKind = useMemo(() => {
        const kind = spanData.kind;
        if (typeof kind === 'string') {
            return kind;
        }
        const kindMap: { [key: number]: string } = {
            0: 'UNSPECIFIED',
            1: 'INTERNAL',
            2: 'SERVER',
            3: 'CLIENT',
            4: 'PRODUCER',
            5: 'CONSUMER'
        };
        return kindMap[kind] || `UNKNOWN(${kind})`;
    }, [spanData.kind]);

    // Extract metrics
    const metrics = useMemo(() => {
        const latencyMs = spanData.startTime && spanData.endTime
            ? new Date(spanData.endTime).getTime() - new Date(spanData.startTime).getTime()
            : null;

        const rawInput = parseInt(getAttributeValue(spanData.attributes, 'gen_ai.usage.input_tokens') || '0');
        const rawOutput = parseInt(getAttributeValue(spanData.attributes, 'gen_ai.usage.output_tokens') || '0');
        const inputTokens = Number.isFinite(rawInput) ? rawInput : 0;
        const outputTokens = Number.isFinite(rawOutput) ? rawOutput : 0;
        const temperature = getAttributeValue(spanData.attributes, 'gen_ai.request.temperature');
        const provider = getAttributeValue(spanData.attributes, 'gen_ai.provider.name');
        const model = getAttributeValue(spanData.attributes, 'gen_ai.request.model');
        const toolDescription = getAttributeValue(spanData.attributes, 'gen_ai.tool.description');

        return {
            latency: latencyMs !== null ? (latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(2)}s` : `${latencyMs}ms`) : null,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            temperature,
            provider,
            model,
            toolDescription,
            startTime: spanData.startTime ? formatDate(spanData.startTime) : null,
            endTime: spanData.endTime ? formatDate(spanData.endTime) : null
        };
    }, [spanData]);

    // Extract input/output data
    const inputData = useMemo(() => {
        const systemInstructions = getAttributeValue(spanData.attributes, 'gen_ai.system_instructions');
        const inputMessages = getAttributeValue(spanData.attributes, 'gen_ai.input.messages');
        const toolArguments = getAttributeValue(spanData.attributes, 'gen_ai.tool.arguments');
        const inputTools = getAttributeValue(spanData.attributes, 'gen_ai.input.tools');
        const inputContent = getAttributeValue(spanData.attributes, 'gen_ai.input.content');
        const kbIngestChunks = getAttributeValue(spanData.attributes, 'gen_ai.knowledge_base.ingest.input.chunks');
        const kbRetrieveQuery = getAttributeValue(spanData.attributes, 'gen_ai.knowledge_base.retrieve.input.query');

        return {
            systemInstructions,
            messages: inputMessages || toolArguments,
            messagesLabel: toolArguments ? 'Tool Arguments' : (operationName?.includes('invoke_agent') ? 'User' : 'Messages'),
            tools: inputTools,
            inputContent,
            kbIngestChunks,
            kbRetrieveQuery
        };
    }, [spanData.attributes, operationName]);

    const outputData = useMemo(() => {
        const outputMessages = getAttributeValue(spanData.attributes, 'gen_ai.output.messages');
        const toolOutput = getAttributeValue(spanData.attributes, 'gen_ai.tool.output');
        const errorMessage = getAttributeValue(spanData.attributes, 'error.message');
        const kbRetrieveOutput = getAttributeValue(spanData.attributes, 'gen_ai.knowledge_base.retrieve.output');

        return {
            messages: outputMessages || toolOutput,
            messagesLabel: toolOutput ? 'Tool Output' : 'Messages',
            error: errorMessage,
            kbRetrieveOutput
        };
    }, [spanData.attributes]);

    // Check if sections match search
    const inputMatches = useMemo(() => {
        if (!searchQuery) return true;
        return textContainsSearch(inputData.systemInstructions, searchQuery) ||
            textContainsSearch(inputData.messages, searchQuery) ||
            textContainsSearch(inputData.tools, searchQuery) ||
            textContainsSearch(inputData.inputContent, searchQuery) ||
            textContainsSearch(inputData.kbIngestChunks, searchQuery) ||
            textContainsSearch(inputData.kbRetrieveQuery, searchQuery);
    }, [searchQuery, inputData]);

    const outputMatches = useMemo(() => {
        if (!searchQuery) return true;
        return textContainsSearch(outputData.messages, searchQuery) ||
            textContainsSearch(outputData.error, searchQuery) ||
            textContainsSearch(outputData.kbRetrieveOutput, searchQuery);
    }, [searchQuery, outputData]);

    const metricsMatch = useMemo(() => {
        if (!searchQuery) return true;
        return textContainsSearch(metrics.latency, searchQuery) ||
            textContainsSearch(metrics.temperature, searchQuery) ||
            textContainsSearch(metrics.provider, searchQuery) ||
            textContainsSearch(metrics.model, searchQuery) ||
            textContainsSearch(metrics.toolDescription, searchQuery) ||
            textContainsSearch(String(metrics.inputTokens), searchQuery) ||
            textContainsSearch(String(metrics.outputTokens), searchQuery) ||
            textContainsSearch(String(totalInputTokens || ''), searchQuery) ||
            textContainsSearch(String(totalOutputTokens || ''), searchQuery) ||
            textContainsSearch(metrics.startTime, searchQuery) ||
            textContainsSearch(metrics.endTime, searchQuery) ||
            textContainsSearch('Latency', searchQuery) ||
            textContainsSearch('Temperature', searchQuery) ||
            textContainsSearch('Provider', searchQuery) ||
            textContainsSearch('Model', searchQuery) ||
            textContainsSearch('Tool Description', searchQuery) ||
            textContainsSearch('Input Tokens', searchQuery) ||
            textContainsSearch('Output Tokens', searchQuery) ||
            textContainsSearch('Total Input Tokens', searchQuery) ||
            textContainsSearch('Total Output Tokens', searchQuery) ||
            textContainsSearch('Start Time', searchQuery) ||
            textContainsSearch('End Time', searchQuery);
    }, [searchQuery, metrics, totalInputTokens, totalOutputTokens]);

    const subAgentsSuffix = includesSubAgents ? ' (Incl. Sub-Agents)' : '';

    // Advanced attributes (not shown in input/output)
    const advancedAttributes = useMemo(() => {
        return spanData.attributes?.filter(attr => !EXCLUDED_ATTRIBUTE_KEYS.includes(attr.key)) || [];
    }, [spanData.attributes]);

    // Filter advanced attributes based on search
    const filteredAdvancedAttributes = useMemo(() => {
        if (!searchQuery) return advancedAttributes;
        return advancedAttributes.filter(attr =>
            textContainsSearch(attr.key, searchQuery) ||
            textContainsSearch(attr.value, searchQuery)
        );
    }, [advancedAttributes, searchQuery]);

    // Check if technical IDs match search
    const technicalIdsMatch = useMemo(() => {
        if (!searchQuery) return true;
        return textContainsSearch(spanData.spanId, searchQuery) ||
            textContainsSearch(spanData.traceId, searchQuery) ||
            textContainsSearch(spanData.parentSpanId, searchQuery) ||
            textContainsSearch(spanData.startTime, searchQuery) ||
            textContainsSearch(spanData.endTime, searchQuery) ||
            textContainsSearch('Span ID', searchQuery) ||
            textContainsSearch('Trace ID', searchQuery) ||
            textContainsSearch('Parent Span ID', searchQuery) ||
            textContainsSearch('Start Time', searchQuery) ||
            textContainsSearch('End Time', searchQuery);
    }, [searchQuery, spanData]);

    // Check if advanced section has any matches
    const advancedMatches = useMemo(() => {
        if (!searchQuery) return true;
        return technicalIdsMatch || filteredAdvancedAttributes.length > 0;
    }, [searchQuery, technicalIdsMatch, filteredAdvancedAttributes]);

    const hasInput = inputData.systemInstructions || inputData.messages || inputData.tools || inputData.inputContent || inputData.kbIngestChunks || inputData.kbRetrieveQuery;
    const hasOutput = outputData.messages || outputData.error || outputData.kbRetrieveOutput;
    const hasError = !!outputData.error;
    const noMatches = searchQuery && !inputMatches && !outputMatches && !metricsMatch && !advancedMatches;

    // Close popup when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (isIdPopupOpen &&
                popupRef.current &&
                buttonRef.current &&
                !popupRef.current.contains(event.target as Node) &&
                !buttonRef.current.contains(event.target as Node)) {
                setIsIdPopupOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isIdPopupOpen]);

    return (
        <Container>
            {/* Span Header */}
            {spanName && (
                <SpanHeader>
                    <SpanIcon type={spanType} spanKind={spanKind}>
                        <Icon
                            name={getSpanIconName(spanType, spanKind)}
                            sx={{
                                fontSize: '24px',
                                width: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            iconSx={{
                                fontSize: "24px",
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        />
                    </SpanIcon>

                    <SpanTitle>
                        <span>
                            {spanType === 'invoke' && 'Invoke Agent - '}
                            {spanType === 'chat' && 'Chat - '}
                            {spanType === 'tool' && 'Execute Tool - '}
                            {spanType === 'kb_retrieve' && 'Knowledge Base Retrieve - '}
                            {spanType === 'kb_ingest' && 'Knowledge Base Ingest - '}
                            {spanType === 'embeddings' && 'Embeddings - '}
                            {spanType === 'generate_content' && 'Generate Content - '}
                            {spanType === 'other' && spanKind.toLowerCase() === 'server' && 'Server - '}
                            {spanType === 'other' && spanKind.toLowerCase() === 'client' && 'Client - '}
                        </span>
                        {stripSpanPrefix(spanName)}
                    </SpanTitle>

                    <IdButton
                        ref={buttonRef}
                        onClick={() => setIsIdPopupOpen(!isIdPopupOpen)}
                        title="View technical IDs"
                    >
                        <Icon
                            name="bi-link"
                            sx={{ fontSize: "16px", width: "16px", height: "16px" }}
                            iconSx={{ display: "flex" }}
                        />
                        ID
                    </IdButton>

                    {isIdPopupOpen && (
                        <IdPopup ref={popupRef}>
                            <IdPopupTitle>
                                <Icon
                                    name="bi-link"
                                    sx={{ fontSize: "16px", width: "16px", height: "16px" }}
                                    iconSx={{ display: "flex" }}
                                />
                                Technical IDs
                            </IdPopupTitle>

                            <IdRow>
                                <IdLabel>Trace ID</IdLabel>
                                <IdValueContainer>
                                    <IdValue>{spanData.traceId}</IdValue>
                                    <CopyButton text={spanData.traceId} size="small" />
                                </IdValueContainer>
                            </IdRow>

                            <IdRow>
                                <IdLabel>Span ID</IdLabel>
                                <IdValueContainer>
                                    <IdValue>{spanData.spanId}</IdValue>
                                    <CopyButton text={spanData.spanId} size="small" />
                                </IdValueContainer>
                            </IdRow>

                            {spanData.parentSpanId && spanData.parentSpanId !== '0000000000000000' && (
                                <IdRow>
                                    <IdLabel>Parent Span ID</IdLabel>
                                    <IdValueContainer>
                                        <IdValue>{spanData.parentSpanId}</IdValue>
                                        <CopyButton text={spanData.parentSpanId} size="small" />
                                    </IdValueContainer>
                                </IdRow>
                            )}
                        </IdPopup>
                    )}
                </SpanHeader>
            )}

            {/* Search Input */}
            <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search all sections..."
            />

            {/* Metrics Pills */}
            {metricsMatch && (
                <MetricsPills>
                    {metrics.latency && (
                        <MetricPill>
                            <Icon name="bi-clock" sx={{ marginRight: "4px", fontSize: "16px", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center" }} iconSx={{ display: "flex" }} />
                            {highlightText(`Latency: ${metrics.latency}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.inputTokens > 0 && (
                        <MetricPill>
                            {highlightText(`Input Tokens: ${metrics.inputTokens}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.outputTokens > 0 && (
                        <MetricPill>
                            {highlightText(`Output Tokens: ${metrics.outputTokens}`, searchQuery)}
                        </MetricPill>
                    )}
                    {spanType === 'invoke' && typeof totalInputTokens === 'number' && totalInputTokens > 0 && (
                        <MetricPill>
                            {highlightText(`Total Input Tokens${subAgentsSuffix}: ${totalInputTokens}`, searchQuery)}
                        </MetricPill>
                    )}
                    {spanType === 'invoke' && typeof totalOutputTokens === 'number' && totalOutputTokens > 0 && (
                        <MetricPill>
                            {highlightText(`Total Output Tokens${subAgentsSuffix}: ${totalOutputTokens}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.temperature && (
                        <MetricPill>
                            <Icon name="bi-thermostat" sx={{ marginRight: "4px", fontSize: "16px", width: "16px", height: "16px", display: "flex", alignItems: "center", justifyContent: "center" }} iconSx={{ display: "flex" }} />
                            {highlightText(`Temperature: ${metrics.temperature}`, searchQuery)}
                        </MetricPill>
                    )}
                    {/* An agent span's provider is the runtime, not a model vendor */}
                    {metrics.provider && spanType !== 'invoke' && (
                        <MetricPill>
                            {highlightText(`Provider: ${metrics.provider}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.model && (
                        <MetricPill>
                            {highlightText(`Model: ${metrics.model}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.toolDescription && (
                        <MetricPill>
                            {highlightText(`Tool Description: ${metrics.toolDescription}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.startTime && (
                        <MetricPill>
                            {highlightText(`Start Time: ${metrics.startTime}`, searchQuery)}
                        </MetricPill>
                    )}
                    {metrics.endTime && (
                        <MetricPill>
                            {highlightText(`End Time: ${metrics.endTime}`, searchQuery)}
                        </MetricPill>
                    )}
                </MetricsPills>
            )}

            {/* No Matches Message */}
            {noMatches && (
                <NoResultsContainer>
                    <NoResultsTitle>No results found</NoResultsTitle>
                    <NoResultsSubtitle>Try different keywords - or search by type, title, span ID</NoResultsSubtitle>
                    <ClearSearchButton onClick={() => setSearchQuery('')}>
                        <Icon
                            name="bi-close"
                            sx={{ fontSize: "16px", width: "16px", height: "16px" }}
                            iconSx={{ display: "flex" }}
                        />
                        Clear search
                    </ClearSearchButton>
                </NoResultsContainer>
            )}

            {/* Input and Output Sections in Responsive Grid */}
            {(hasInput && inputMatches) || (hasOutput && outputMatches) ? (
                <InputOutputGrid>
                    {/* Input Section */}
                    {hasInput && inputMatches && (
                        <CollapsibleSection
                            title="Input"
                            icon="bi-input"
                            defaultOpen={!hasError}
                            key={searchQuery ? 'input-search' : 'input'}
                        >
                            <SectionContent>
                                {inputData.systemInstructions && textContainsSearch(inputData.systemInstructions, searchQuery) && (
                                    <SubSection>
                                        <JsonViewer
                                            value={inputData.systemInstructions}
                                            title="System Instructions"
                                            searchQuery={searchQuery}
                                        />
                                    </SubSection>
                                )}
                                {inputData.messages && textContainsSearch(inputData.messages, searchQuery) && (
                                    <SubSection>
                                        <JsonViewer
                                            value={inputData.messages}
                                            title={inputData.messagesLabel}
                                            searchQuery={searchQuery}
                                            expandLastOnly={inputData.messagesLabel === 'Messages'}
                                        />
                                    </SubSection>
                                )}
                                {inputData.tools && textContainsSearch(inputData.tools, searchQuery) && (
                                    <SubSection>
                                        <JsonViewer
                                            value={inputData.tools}
                                            title="Available Tools"
                                            searchQuery={searchQuery}
                                            maxAutoExpandDepth={0}
                                        />
                                    </SubSection>
                                )}
                                {inputData.inputContent && textContainsSearch(inputData.inputContent, searchQuery) && (
                                    <SubSection>
                                        <SubSectionTitle>Input Content</SubSectionTitle>
                                        <InputContentBlock>
                                            {highlightText(inputData.inputContent, searchQuery)}
                                        </InputContentBlock>
                                    </SubSection>
                                )}
                                {inputData.kbRetrieveQuery && textContainsSearch(inputData.kbRetrieveQuery, searchQuery) && (
                                    <SubSection>
                                        <SubSectionTitle>Query</SubSectionTitle>
                                        <InputContentBlock>
                                            {highlightText(inputData.kbRetrieveQuery, searchQuery)}
                                        </InputContentBlock>
                                    </SubSection>
                                )}
                                {inputData.kbIngestChunks && textContainsSearch(inputData.kbIngestChunks, searchQuery) && (
                                    <SubSection>
                                        <JsonViewer
                                            value={inputData.kbIngestChunks}
                                            title="Input Chunks"
                                            searchQuery={searchQuery}
                                        />
                                    </SubSection>
                                )}
                            </SectionContent>
                        </CollapsibleSection>
                    )}

                    {/* Output Section */}
                    {hasOutput && outputMatches && (
                        <CollapsibleSection
                            title="Output"
                            icon="bi-output"
                            defaultOpen={true}
                            key={searchQuery ? 'output-search' : 'output'}
                        >
                            <SectionContent>
                                {outputData.error && textContainsSearch(outputData.error, searchQuery) && (
                                    <SubSection>
                                        <ErrorHeader>
                                            <ErrorHeaderLeft>
                                                <Icon name="bi-error" sx={{ fontSize: "16px", width: "16px", height: "16px" }} iconSx={{ display: "flex" }} />
                                                <SubSectionTitle style={{ margin: 0, color: 'var(--vscode-errorForeground)' }}>
                                                    Error
                                                </SubSectionTitle>
                                                <CopyButton text={outputData.error} size="small" />
                                            </ErrorHeaderLeft>
                                            <ErrorHeaderRight>
                                                <ToggleGroup>
                                                    <ToggleButton
                                                        active={!showRawError}
                                                        onClick={() => setShowRawError(false)}
                                                        title="Show formatted error"
                                                    >
                                                        Formatted
                                                    </ToggleButton>
                                                    <ToggleButton
                                                        active={showRawError}
                                                        onClick={() => setShowRawError(true)}
                                                        title="Show raw error"
                                                    >
                                                        Raw
                                                    </ToggleButton>
                                                </ToggleGroup>
                                            </ErrorHeaderRight>
                                        </ErrorHeader>
                                        <ErrorContent>
                                            {highlightText(showRawError ? outputData.error : formatErrorText(outputData.error), searchQuery)}
                                        </ErrorContent>
                                    </SubSection>
                                )}
                                {outputData.messages && textContainsSearch(outputData.messages, searchQuery) && (
                                    <SubSection>
                                        <JsonViewer
                                            value={outputData.messages}
                                            title={outputData.messagesLabel}
                                            searchQuery={searchQuery}
                                            expandLastOnly={outputData.messagesLabel === 'Messages'}
                                        />
                                    </SubSection>
                                )}
                                {outputData.kbRetrieveOutput && textContainsSearch(outputData.kbRetrieveOutput, searchQuery) && (
                                    <SubSection>
                                        <JsonViewer
                                            value={outputData.kbRetrieveOutput}
                                            title="Retrieved Results"
                                            searchQuery={searchQuery}
                                        />
                                    </SubSection>
                                )}
                            </SectionContent>
                        </CollapsibleSection>
                    )}
                </InputOutputGrid>
            ) : null}

            {/* Advanced Details Section */}
            {advancedMatches && (
                <CollapsibleSection
                    title="Advanced Details"
                    defaultOpen={spanType === 'other' || (!hasInput && !hasOutput) || (searchQuery && advancedMatches)}
                    key={searchQuery ? 'advanced-search' : 'advanced'}
                >
                    <AdvancedDetailsContainer>
                        {/* Technical IDs */}
                        {technicalIdsMatch && (
                            <SubSection>
                                <SubSectionTitle>Technical IDs</SubSectionTitle>
                                <TechnicalIdsGrid>
                                    <TechnicalRow>
                                        <TechnicalLabel>{highlightText("Span ID:", searchQuery)}</TechnicalLabel>
                                        <TechnicalValue>{highlightText(spanData.spanId, searchQuery)}</TechnicalValue>
                                        <CopyWrapper>
                                            <CopyButton text={spanData.spanId} size="small" />
                                        </CopyWrapper>
                                    </TechnicalRow>

                                    <TechnicalRow>
                                        <TechnicalLabel>{highlightText("Trace ID:", searchQuery)}</TechnicalLabel>
                                        <TechnicalValue>{highlightText(spanData.traceId, searchQuery)}</TechnicalValue>
                                        <CopyWrapper>
                                            <CopyButton text={spanData.traceId} size="small" />
                                        </CopyWrapper>
                                    </TechnicalRow>

                                    <TechnicalRow>
                                        <TechnicalLabel>{highlightText("Parent Span ID:", searchQuery)}</TechnicalLabel>
                                        <TechnicalValue>
                                            {spanData.parentSpanId && spanData.parentSpanId !== '0000000000000000'
                                                ? highlightText(spanData.parentSpanId, searchQuery)
                                                : 'Root Span'}
                                        </TechnicalValue>
                                        {spanData.parentSpanId && spanData.parentSpanId !== '0000000000000000' && (
                                            <CopyWrapper>
                                                <CopyButton text={spanData.parentSpanId} size="small" />
                                            </CopyWrapper>
                                        )}
                                    </TechnicalRow>

                                    {spanData.startTime && (
                                        <TechnicalRow>
                                            <TechnicalLabel>{highlightText("Start Time:", searchQuery)}</TechnicalLabel>
                                            <TechnicalValue>{highlightText(formatDate(spanData.startTime), searchQuery)}</TechnicalValue>
                                            <CopyWrapper>
                                                <CopyButton text={formatDate(spanData.startTime)} size="small" />
                                            </CopyWrapper>
                                        </TechnicalRow>
                                    )}

                                    {spanData.endTime && (
                                        <TechnicalRow>
                                            <TechnicalLabel>{highlightText("End Time:", searchQuery)}</TechnicalLabel>
                                            <TechnicalValue>{highlightText(formatDate(spanData.endTime), searchQuery)}</TechnicalValue>
                                            <CopyWrapper>
                                                <CopyButton text={formatDate(spanData.endTime)} size="small" />
                                            </CopyWrapper>
                                        </TechnicalRow>
                                    )}
                                </TechnicalIdsGrid>
                            </SubSection>
                        )}

                        {/* Other Attributes */}
                        {filteredAdvancedAttributes.length > 0 && (
                            <SubSection>
                                <SubSectionTitle>
                                    Other Attributes ({searchQuery ? `${filteredAdvancedAttributes.length} of ${advancedAttributes.length}` : advancedAttributes.length})
                                </SubSectionTitle>
                                <AttributesList>
                                    {filteredAdvancedAttributes.map((attr, index) => (
                                        <AttributeRow key={index}>
                                            <AttributeKey>{highlightText(`${attr.key}:`, searchQuery)}</AttributeKey>
                                            <AttributeValue>{highlightText(attr.value, searchQuery)}</AttributeValue>
                                            <CopyWrapper>
                                                <CopyButton text={`${attr.key}: ${attr.value}`} size="small" />
                                            </CopyWrapper>
                                        </AttributeRow>
                                    ))}
                                </AttributesList>
                            </SubSection>
                        )}
                    </AdvancedDetailsContainer>
                </CollapsibleSection>
            )}
        </Container>
    );
}
