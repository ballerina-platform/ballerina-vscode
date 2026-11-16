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

import { ReactNode } from "react";
import { SpanData } from './index';
import { Highlight } from './components/shared-styles';

export const getSpanTimeRange = (span: SpanData): { start: number; end: number } | null => {
  if (!span.startTime || !span.endTime) return null;
  return {
    start: new Date(span.startTime).getTime(),
    end: new Date(span.endTime).getTime()
  };
};

export const timeContainsSpan = (parentSpan: SpanData, childSpan: SpanData): boolean => {
  const parentRange = getSpanTimeRange(parentSpan);
  const childRange = getSpanTimeRange(childSpan);

  if (!parentRange || !childRange) return false;

  // Parent contains child if it starts before/at and ends after/at, but they're not identical
  return parentRange.start <= childRange.start &&
    parentRange.end >= childRange.end &&
    (parentRange.start < childRange.start || parentRange.end > childRange.end);
};

const findSmallestContainingSpan = (span: SpanData, candidates: SpanData[]): SpanData | undefined => {
  let smallest: SpanData | undefined;
  let smallestDuration = Infinity;
  for (const candidate of candidates) {
    const range = getSpanTimeRange(candidate);
    if (candidate.spanId === span.spanId || !range || !timeContainsSpan(candidate, span)) continue;
    if (range.end - range.start < smallestDuration) {
      smallest = candidate;
      smallestDuration = range.end - range.start;
    }
  }
  return smallest;
};

// Parallel siblings overlap in time, so time containment is only a fallback for a broken parent chain.
const findAIParentId = (span: SpanData, spansById: Map<string, SpanData>, aiSpans: SpanData[]): string | undefined => {
  const seen = new Set([span.spanId]);
  let parentId = span.parentSpanId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = spansById.get(parentId);
    if (!parent) {
      return findSmallestContainingSpan(span, aiSpans)?.spanId;
    }
    if (isAISpan(parent)) {
      return parent.spanId;
    }
    parentId = parent.parentSpanId;
  }
  return undefined;
};

/** Maps each AI span ID to the ID of its nearest AI ancestor, or undefined for a root AI span. */
export const buildAIParentMap = (spans: SpanData[]): Map<string, string | undefined> => {
  const spansById = new Map(spans.map(span => [span.spanId, span]));
  const aiSpans = spans.filter(isAISpan);
  return new Map(aiSpans.map(span => [span.spanId, findAIParentId(span, spansById, aiSpans)]));
};

export const getAIChildSpansFrom = (spans: SpanData[], aiParents: Map<string, string | undefined>, spanId: string): SpanData[] =>
  spans
    .filter(span => aiParents.has(span.spanId) && aiParents.get(span.spanId) === spanId)
    .sort((a, b) => (getSpanTimeRange(a)?.start ?? 0) - (getSpanTimeRange(b)?.start ?? 0));

const tokenCount = (span: SpanData, key: string): number =>
  parseInt(span.attributes?.find(attr => attr.key === key)?.value || '0') || 0;

/** Input and output tokens of a span and every span beneath it. */
export const getSubtreeTokenTotals = (spans: SpanData[], rootSpanId: string | null) => {
  const childrenOf = new Map<string, SpanData[]>();
  spans.forEach(span => {
    const siblings = childrenOf.get(span.parentSpanId ?? '') ?? [];
    siblings.push(span);
    childrenOf.set(span.parentSpanId ?? '', siblings);
  });
  const totals = { totalInputTokens: 0, totalOutputTokens: 0, includesSubAgents: false };
  // An agent span that reports its own usage already covers its children, as in the Agent Flow model
  const queue = spans.filter(span => span.spanId === rootSpanId).map(span => ({ span, covered: false }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const { span, covered } = queue.pop()!;
    if (seen.has(span.spanId)) continue;
    seen.add(span.spanId);
    const isAgent = getSpanTypeBadge(span) === 'invoke';
    const input = tokenCount(span, 'gen_ai.usage.input_tokens');
    const output = tokenCount(span, 'gen_ai.usage.output_tokens');
    totals.includesSubAgents ||= span.spanId !== rootSpanId && isAgent;
    if (!covered) {
      totals.totalInputTokens += input;
      totals.totalOutputTokens += output;
    }
    const childrenCovered = covered || (isAgent && input + output > 0);
    queue.push(...(childrenOf.get(span.spanId) ?? []).map(child => ({ span: child, covered: childrenCovered })));
  }
  return totals;
};

export const sortSpansByUmbrellaFirst = (spans: SpanData[]): SpanData[] => {
  return [...spans].sort((a, b) => {
    const aRange = getSpanTimeRange(a);
    const bRange = getSpanTimeRange(b);

    if (!aRange || !bRange) return 0;

    const aContainsB = timeContainsSpan(a, b);
    const bContainsA = timeContainsSpan(b, a);

    if (aContainsB) return -1; // a comes first (umbrella)
    if (bContainsA) return 1;  // b comes first (umbrella)

    // Neither contains the other, sort by start time
    return aRange.start - bRange.start;
  });
};

export const formatDuration = (durationMs: number): string => {
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
};

export const getSpanDuration = (span: SpanData): number | null => {
  const range = getSpanTimeRange(span);
  return range ? range.end - range.start : null;
};

export const formatStartTime = (dateString: string | undefined): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

export const getSpanKindLabel = (kind: string | number): string => {
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
};

export const stripSpanPrefix = (spanName: string): string => {
  const prefixes = ['invoke_agent ', 'execute_tool ', 'chat ', 'knowledge_base_retrieve ', 'knowledge_base_ingest ', 'embeddings ', 'generate_content '];
  for (const prefix of prefixes) {
    if (spanName.startsWith(prefix)) {
      return spanName.substring(prefix.length);
    }
  }
  return spanName;
};

export const getSpanTypeBadge = (span: SpanData): 'invoke' | 'chat' | 'tool' | 'kb_retrieve' | 'kb_ingest' | 'embeddings' | 'generate_content' | 'other' => {
  const operationName = span.attributes?.find(attr => attr.key === 'gen_ai.operation.name')?.value || '';
  if (operationName.startsWith('invoke_agent')) return 'invoke';
  if (operationName.startsWith('chat') || span.name.toLowerCase().startsWith('chat')) return 'chat';
  if (operationName.startsWith('execute_tool') || span.name.toLowerCase().startsWith('execute_tool')) return 'tool';
  if (operationName.startsWith('knowledge_base_retrieve') || span.name.toLowerCase().startsWith('knowledge_base_retrieve')) return 'kb_retrieve';
  if (operationName.startsWith('knowledge_base_ingest') || span.name.toLowerCase().startsWith('knowledge_base_ingest')) return 'kb_ingest';
  if (operationName.startsWith('embeddings') || span.name.toLowerCase().startsWith('embeddings')) return 'embeddings';
  if (operationName.startsWith('generate_content') || span.name.toLowerCase().startsWith('generate_content')) return 'generate_content';
  return 'other';
};

export const spanHasError = (span: SpanData): boolean => {
  return span.attributes?.some(attr => attr.key === 'error.message' && attr.value) || false;
};

export const getSpanTokens = (span: SpanData): number => {
  const inputRaw = span.attributes?.find(attr => attr.key === 'gen_ai.usage.input_tokens')?.value || '0';
  const outputRaw = span.attributes?.find(attr => attr.key === 'gen_ai.usage.output_tokens')?.value || '0';
  const inputTokens = Number.parseInt(inputRaw);
  const outputTokens = Number.parseInt(outputRaw);
  const safeInput = Number.isFinite(inputTokens) && !Number.isNaN(inputTokens) ? inputTokens : 0;
  const safeOutput = Number.isFinite(outputTokens) && !Number.isNaN(outputTokens) ? outputTokens : 0;
  return safeInput + safeOutput;
};

export const isAISpan = (span: SpanData): boolean => {
  return span.attributes?.some(attr => attr.key === 'span.type' && attr.value === 'ai') || false;
};

export const extractUserErrorDetails = (text: string | null) => {
  if (typeof text !== "string") return null;

  const results = [];

  // Match body="...json..."
  const bodyRegex = /body="(\{[\s\S]*?\})"/g;
  let match;

  while ((match = bodyRegex.exec(text)) !== null) {
    try {
      // Unescape embedded quotes
      const jsonText = match[1].replace(/\\"/g, '"');
      const parsed = JSON.parse(jsonText);

      results.push({
        error_message: parsed.error_message,
        code: parsed.code,
        error_description: parsed.error_description,
        raw: parsed
      });
    } catch {
      // Ignore malformed bodies
    }
  }

  return results.length ? results : null;
}

export function fixJSONEscapes(str: string): string {
  // Escape all backslashes
  let result = str.replace(/\\/g, '\\\\');

  // Unescape valid JSON escape sequences
  // Valid: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
  result = result.replace(/\\\\\\(["\\/@bfnrt])/g, '\\$1');
  result = result.replace(/\\\\\\u([0-9a-fA-F]{4})/g, '\\u$1');

  return result;
}

export function tryParseJSON(str: string): any {
  const strategies = [
    // Strategy 1: Direct parse
    () => JSON.parse(str),

    // Strategy 2: With fixJSONEscapes
    () => JSON.parse(fixJSONEscapes(str)),

    // Strategy 3: Parse as relaxed JSON5-style (handles trailing commas, unquoted keys, etc)
    // This uses a simple technique: wrap in eval with proper safeguards
    () => {
      // Only try this if it looks like valid JSON structure
      if (!str.trim().match(/^[\[{]/)) throw new Error('Not JSON-like');

      // Use Function constructor as safer alternative to eval
      // This handles some relaxed JSON formats
      return JSON.parse(str
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/\n/g, '\\n')         // Escape literal newlines
        .replace(/\r/g, '\\r')         // Escape literal carriage returns
        .replace(/\t/g, '\\t')         // Escape literal tabs
      );
    }
  ];

  let lastError: any;
  for (const strategy of strategies) {
    try {
      return strategy();
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  throw lastError;
}

export function isJSONString(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();

  // Check for direct JSON objects/arrays
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      tryParseJSON(trimmed);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

export function parseNestedJSON(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isJSONString(trimmed)) {
      try {
        const parsed = tryParseJSON(trimmed);
        return parseNestedJSON(parsed);
      } catch (e) {
        return value;
      }
    }
  }
  if (Array.isArray(value)) {
    return value.map(item => parseNestedJSON(item));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = parseNestedJSON(val);
    }
    return result;
  }
  return value;
}

export const getSpanLabel = (type: string) => {
  switch (type) {
    case 'invoke': return 'Invoke Agent';
    case 'chat': return 'Chat';
    case 'tool': return 'Execute Tool';
    case 'kb_retrieve': return 'Knowledge Base Retrieve';
    case 'kb_ingest': return 'Knowledge Base Ingest';
    case 'embeddings': return 'Embeddings';
    case 'generate_content': return 'Generate Content';
    default: return 'Operation';
  }
};

export const doesSpanMatch = (span: SpanData, query: string): boolean => {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();

  // Search in Name
  if (span.name.toLowerCase().includes(lowerQuery)) return true;

  // Search in Span Kind (optional, good for advanced view)
  if (getSpanKindLabel(span.kind).toLowerCase().includes(lowerQuery)) return true;

  return false;
};

export const HighlightText = ({ text, query }: { text: string; query: string }) => {
  if (!query || !text) return <>{text}</>;

  // Escape regex characters in query
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));

  return (
    <>
      {
        parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase()
            ? <Highlight key={i}>{part}</Highlight>
            : part
        )}
    </>
  );
};

/**
 * Highlights text that matches a search query.
 * Returns a ReactNode with highlighted portions.
 */
export function highlightText(text: string, searchQuery: string): ReactNode {
  if (!searchQuery) return text;
  const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  const parts = text.split(regex);
  // One element, so a flex parent lays the text out as a single item instead of one column per part
  return <span>{parts.map((part, i) =>
    i % 2 === 1 ? <Highlight key={i}>{part}</Highlight> : part
  )}</span>;
}

/**
 * Checks if text contains a search query (case-insensitive)
 */
export function textContainsSearch(text: string | undefined, searchQuery: string): boolean {
  if (!searchQuery) return true; // No search query = show everything
  if (!text) return false; // No text to search = no match
  return text.toLowerCase().includes(searchQuery.toLowerCase());
}

/**
 * Gets an attribute value from a span's attributes array
 */
export function getAttributeValue(attributes: Array<{ key: string; value: string }> | undefined, key: string): string | undefined {
  return attributes?.find(a => a.key === key)?.value;
}

/**
 * Formats a date string to a readable format
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
}

/**
 * Gets the appropriate icon name for a span type
 */
export function getSpanIconName(spanType: 'invoke' | 'chat' | 'tool' | 'kb_retrieve' | 'kb_ingest' | 'embeddings' | 'generate_content' | 'other', spanKind?: string): string {
  switch (spanType) {
    case 'invoke':
      return 'bi-ai-agent';
    case 'chat':
      return 'bi-chat';
    case 'tool':
      return 'bi-wrench';
    case 'kb_retrieve':
      return 'bi-ai-search';
    case 'kb_ingest':
      return 'bi-import';
    case 'embeddings':
      return 'bi-ai-model';
    case 'generate_content':
      return 'bi-doc';
    case 'other':
      // For non-AI spans, use icons based on span kind (server/client)
      switch (spanKind?.toLowerCase()) {
        case 'client':
          return 'bi-arrow-outward';
        case 'server':
          return 'bi-server';
        default:
          return 'bi-action';
      }
    default:
      return 'bi-action';
  }
}

/**
 * Gets the color for a span type
 */
export function getSpanColor(type: string): string {
  switch (type) {
    case 'invoke':
      return 'var(--vscode-terminal-ansiCyan)';
    case 'chat':
      return 'var(--vscode-terminalSymbolIcon-optionForeground)';
    case 'tool':
      return 'var(--vscode-terminal-ansiBrightMagenta)';
    case 'kb_retrieve':
      return 'var(--vscode-charts-purple)';
    case 'kb_ingest':
      return 'var(--vscode-charts-purple)';
    case 'embeddings':
      return 'var(--vscode-terminalSymbolIcon-optionForeground)';
    case 'generate_content':
      return 'var(--vscode-charts-green)';
    case 'error':
      return 'var(--vscode-terminal-ansiRed)';
    case 'client':
      return 'var(--vscode-terminal-ansiBlue)';
    case 'server':
      return 'var(--vscode-terminal-ansiGreen)';
    case 'other':
      return 'var(--vscode-foreground)';
    default:
      return 'var(--vscode-badge-background)';
  }
}

/**
 * Extracts the session ID from a trace
 */
export function getSessionId(span: SpanData): string | undefined {
  return getAttributeValue(span.attributes, 'gen_ai.conversation.id');
}

/**
 * Extracts the user message from an invoke_agent span
 */
export function extractUserMessage(span: SpanData): string {
  const inputMessages = getAttributeValue(span.attributes, 'gen_ai.input.messages');
  if (!inputMessages) return '';
  return inputMessages;
}

/**
 * Extracts the agent response from an invoke_agent span
 */
export function extractAgentResponse(span: SpanData): string {
  const outputMessages = getAttributeValue(span.attributes, 'gen_ai.output.messages');
  if (!outputMessages) return '';
  return outputMessages;
}

/**
 * Calculates total input tokens from all spans with "Chat" operation
 */
export function calculateTotalInputTokens(spans: SpanData[]): number {
  return spans.reduce((total, span) => {
    const operationName = getAttributeValue(span.attributes, 'gen_ai.operation.name');
    if (operationName?.toLowerCase().includes('chat')) {
      const inputRaw = getAttributeValue(span.attributes, 'gen_ai.usage.input_tokens') || '0';
      const inputTokens = Number.parseInt(inputRaw);
      const safeInput = Number.isFinite(inputTokens) && !Number.isNaN(inputTokens) ? inputTokens : 0;
      return total + safeInput;
    }
    return total;
  }, 0);
}

/**
 * Calculates total output tokens from all spans with "Chat" operation
 */
export function calculateTotalOutputTokens(spans: SpanData[]): number {
  return spans.reduce((total, span) => {
    const operationName = getAttributeValue(span.attributes, 'gen_ai.operation.name');
    if (operationName?.toLowerCase().includes('chat')) {
      const outputRaw = getAttributeValue(span.attributes, 'gen_ai.usage.output_tokens') || '0';
      const outputTokens = Number.parseInt(outputRaw);
      const safeOutput = Number.isFinite(outputTokens) && !Number.isNaN(outputTokens) ? outputTokens : 0;
      return total + safeOutput;
    }
    return total;
  }, 0);
}

/**
 * Calculates the total latency of a trace (from first span start to last span end)
 */
export function calculateTraceLatency(spans: SpanData[]): number | null {
  if (spans.length === 0) return null;

  let earliestStart: number | null = null;
  let latestEnd: number | null = null;

  for (const span of spans) {
    const range = getSpanTimeRange(span);
    if (range) {
      if (earliestStart === null || range.start < earliestStart) {
        earliestStart = range.start;
      }
      if (latestEnd === null || range.end > latestEnd) {
        latestEnd = range.end;
      }
    }
  }

  if (earliestStart === null || latestEnd === null) return null;
  return latestEnd - earliestStart;
}

/**
 * Formats a number with comma separators for thousands
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}
