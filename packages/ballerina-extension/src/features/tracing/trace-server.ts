/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import express from 'express';
import { EventEmitter } from 'events';


export interface Trace {
    traceId: string;
    spans: Span[];
    resource: Resource;
    scope: Scope;
    firstSeen: Date;
    lastSeen: Date;
}

export interface Span {
    spanId: string;
    traceId: string;
    parentSpanId: string;
    name: string;
    kind: string;
    startTime?: string;
    endTime?: string;
    attributes?: Attribute[];
}

export interface Resource {
    name: string;
    attributes: Attribute[];
}

export interface Scope {
    name: string;
    version?: string;
    attributes?: Attribute[];
}

export interface Attribute {
    key: string;
    value: string;
}

export interface TraceServer {
    start(port: number): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    getTraces(): Trace[];
    clearTraces(): void;
    getTrace(traceId: string): Trace;
    getTraceBySpanId(spanId: string): Trace;
    getTraceByResource(resource: string): Trace;
    getTraceByScope(scope: string): Trace;
    getTraceByFirstSeen(firstSeen: Date): Trace;
    getTraceByLastSeen(lastSeen: Date): Trace;
    onTracesUpdated(callback: () => void): () => void;
    onTracesCleared(callback: () => void): () => void;
    onNewSpans(callback: (spans: Span[]) => void): () => void;
    getTracesBySessionId(sessionId: string): Trace[];
    getSessionIds(): string[];
}


const app = express();
let server: ReturnType<typeof app.listen> | undefined;

// Parse both JSON and Protobuf
app.use(express.json());
app.use(express.raw({ type: 'application/x-protobuf', limit: '10mb' }));

// In-memory trace storage with LRU eviction
const MAX_TRACES = 100;
const traceStore = new Map(); // Map<traceId, { traceId, spans: [], resource, scope, firstSeen, lastSeen }>

// Event emitter for trace updates
const traceEvents = new EventEmitter();

// Enforce trace limit with LRU eviction
function enforceTraceLimit(): void {
    if (traceStore.size > MAX_TRACES) {
        // Convert to array and sort by lastSeen (oldest first)
        const traces = Array.from(traceStore.entries()).sort((a, b) =>
            a[1].lastSeen.getTime() - b[1].lastSeen.getTime()
        );

        // Remove oldest traces until we're at the limit
        const numToRemove = traceStore.size - MAX_TRACES;
        for (let i = 0; i < numToRemove; i++) {
            traceStore.delete(traces[i][0]);
        }
    }
}

// Color codes for better readability
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m'
};

function bytesToHex(bytes) {
    if (!bytes) { return 'N/A'; }
    if (typeof bytes === 'string') { return bytes; }
    return Buffer.from(bytes).toString('hex');
}

// REST API endpoint to get traces as JSON
app.get('/api/traces', (req, res) => {
    const traces = Array.from(traceStore.values()).sort((a, b) => b.lastSeen - a.lastSeen);

    // Convert to JSON-friendly format with hex IDs
    const tracesData = traces.map(trace => ({
        traceId: trace.traceId,
        spans: trace.spans.map(span => ({
            ...span,
            traceId: bytesToHex(span.traceId),
            spanId: bytesToHex(span.spanId),
            parentSpanId: bytesToHex(span.parentSpanId)
        })),
        resource: trace.resource,
        scope: trace.scope,
        firstSeen: trace.firstSeen,
        lastSeen: trace.lastSeen
    }));

    res.json({ traces: tracesData });
});

// OTLP/HTTP endpoint for traces
app.post('/v1/traces', async (req, res) => {
    const contentType = req.headers['content-type'] || '';

    try {
        let resourceSpans;

        // Handle Protobuf format (default from Java SDK)
        if (contentType.includes('application/x-protobuf') || Buffer.isBuffer(req.body)) {

            // The @opentelemetry/otlp-transformer can decode protobuf
            // But it's complex, so let's use a simpler approach with protobufjs
            const { default: protobuf } = await import('protobufjs');

            // Define the complete OTLP protobuf schema inline
            const root = protobuf.Root.fromJSON({
                nested: {
                    opentelemetry: {
                        nested: {
                            proto: {
                                nested: {
                                    trace: {
                                        nested: {
                                            v1: {
                                                nested: {
                                                    TracesData: {
                                                        fields: {
                                                            resourceSpans: {
                                                                rule: 'repeated',
                                                                type: 'ResourceSpans',
                                                                id: 1
                                                            }
                                                        }
                                                    },
                                                    ResourceSpans: {
                                                        fields: {
                                                            resource: { type: 'Resource', id: 1 },
                                                            scopeSpans: { rule: 'repeated', type: 'ScopeSpans', id: 2 },
                                                            schemaUrl: { type: 'string', id: 3 }
                                                        }
                                                    },
                                                    Resource: {
                                                        fields: {
                                                            attributes: { rule: 'repeated', type: 'KeyValue', id: 1 },
                                                            droppedAttributesCount: { type: 'uint32', id: 2 }
                                                        }
                                                    },
                                                    ScopeSpans: {
                                                        fields: {
                                                            scope: { type: 'InstrumentationScope', id: 1 },
                                                            spans: { rule: 'repeated', type: 'Span', id: 2 },
                                                            schemaUrl: { type: 'string', id: 3 }
                                                        }
                                                    },
                                                    InstrumentationScope: {
                                                        fields: {
                                                            name: { type: 'string', id: 1 },
                                                            version: { type: 'string', id: 2 },
                                                            attributes: { rule: 'repeated', type: 'KeyValue', id: 3 },
                                                            droppedAttributesCount: { type: 'uint32', id: 4 }
                                                        }
                                                    },
                                                    Span: {
                                                        fields: {
                                                            traceId: { type: 'bytes', id: 1 },
                                                            spanId: { type: 'bytes', id: 2 },
                                                            traceState: { type: 'string', id: 3 },
                                                            parentSpanId: { type: 'bytes', id: 4 },
                                                            name: { type: 'string', id: 5 },
                                                            kind: { type: 'SpanKind', id: 6 },
                                                            startTimeUnixNano: { type: 'fixed64', id: 7 },
                                                            endTimeUnixNano: { type: 'fixed64', id: 8 },
                                                            attributes: { rule: 'repeated', type: 'KeyValue', id: 9 },
                                                            droppedAttributesCount: { type: 'uint32', id: 10 },
                                                            events: { rule: 'repeated', type: 'Event', id: 11 },
                                                            droppedEventsCount: { type: 'uint32', id: 12 },
                                                            links: { rule: 'repeated', type: 'Link', id: 13 },
                                                            droppedLinksCount: { type: 'uint32', id: 14 },
                                                            status: { type: 'Status', id: 15 },
                                                            flags: { type: 'fixed32', id: 16 }
                                                        }
                                                    },
                                                    Event: {
                                                        fields: {
                                                            timeUnixNano: { type: 'fixed64', id: 1 },
                                                            name: { type: 'string', id: 2 },
                                                            attributes: { rule: 'repeated', type: 'KeyValue', id: 3 },
                                                            droppedAttributesCount: { type: 'uint32', id: 4 }
                                                        }
                                                    },
                                                    Link: {
                                                        fields: {
                                                            traceId: { type: 'bytes', id: 1 },
                                                            spanId: { type: 'bytes', id: 2 },
                                                            traceState: { type: 'string', id: 3 },
                                                            attributes: { rule: 'repeated', type: 'KeyValue', id: 4 },
                                                            droppedAttributesCount: { type: 'uint32', id: 5 },
                                                            flags: { type: 'fixed32', id: 6 }
                                                        }
                                                    },
                                                    KeyValue: {
                                                        fields: {
                                                            key: { type: 'string', id: 1 },
                                                            value: { type: 'AnyValue', id: 2 }
                                                        }
                                                    },
                                                    AnyValue: {
                                                        fields: {
                                                            stringValue: { type: 'string', id: 1 },
                                                            boolValue: { type: 'bool', id: 2 },
                                                            intValue: { type: 'int64', id: 3 },
                                                            doubleValue: { type: 'double', id: 4 },
                                                            arrayValue: { type: 'ArrayValue', id: 5 },
                                                            kvlistValue: { type: 'KeyValueList', id: 6 },
                                                            bytesValue: { type: 'bytes', id: 7 }
                                                        }
                                                    },
                                                    ArrayValue: {
                                                        fields: {
                                                            values: { rule: 'repeated', type: 'AnyValue', id: 1 }
                                                        }
                                                    },
                                                    KeyValueList: {
                                                        fields: {
                                                            values: { rule: 'repeated', type: 'KeyValue', id: 1 }
                                                        }
                                                    },
                                                    Status: {
                                                        fields: {
                                                            message: { type: 'string', id: 2 },
                                                            code: { type: 'StatusCode', id: 3 }
                                                        }
                                                    },
                                                    SpanKind: {
                                                        values: {
                                                            SPAN_KIND_UNSPECIFIED: 0,
                                                            SPAN_KIND_INTERNAL: 1,
                                                            SPAN_KIND_SERVER: 2,
                                                            SPAN_KIND_CLIENT: 3,
                                                            SPAN_KIND_PRODUCER: 4,
                                                            SPAN_KIND_CONSUMER: 5
                                                        }
                                                    },
                                                    StatusCode: {
                                                        values: {
                                                            STATUS_CODE_UNSET: 0,
                                                            STATUS_CODE_OK: 1,
                                                            STATUS_CODE_ERROR: 2
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const TracesData = root.lookupType('opentelemetry.proto.trace.v1.TracesData');
            const decoded = TracesData.decode(req.body);
            const traceData = TracesData.toObject(decoded, {
                longs: String,
                bytes: Array
            });

            resourceSpans = traceData.resourceSpans;
        }
        // Handle JSON format
        else {
            resourceSpans = req.body.resourceSpans;
        }

        if (resourceSpans && Array.isArray(resourceSpans)) {
            // Group spans by traceId to show trace structure
            const traceMap = new Map();
            let totalSpans = 0;
            const now = new Date();

            // Helper function to extract string value from OTLP AnyValue
            const extractValue = (anyValue: any): string => {
                if (!anyValue) { return ''; }
                if (typeof anyValue === 'string') { return anyValue; }
                if (anyValue.stringValue !== undefined) { return String(anyValue.stringValue); }
                if (anyValue.intValue !== undefined) { return String(anyValue.intValue); }
                if (anyValue.doubleValue !== undefined) { return String(anyValue.doubleValue); }
                if (anyValue.boolValue !== undefined) { return String(anyValue.boolValue); }
                return '';
            };

            // Helper function to extract resource name from attributes
            const extractResourceName = (resource: any): string => {
                if (resource.name) { return resource.name; }
                if (resource.attributes) {
                    const serviceNameAttr = resource.attributes.find((attr: any) =>
                        attr.key === 'service.name' || attr.key === 'service_name'
                    );
                    if (serviceNameAttr) {
                        return extractValue(serviceNameAttr.value);
                    }
                }
                return 'Unknown Resource';
            };

            // Helper function to process resource attributes
            const processAttributes = (attributes: any[]): Array<{ key: string; value: string }> => {
                if (!attributes || !Array.isArray(attributes)) { return []; }
                return attributes.map((attr: any) => ({
                    key: attr.key || '',
                    value: extractValue(attr.value)
                }));
            };

            // Collect all spans and group by traceId
            resourceSpans.forEach(resourceSpan => {
                if (resourceSpan.scopeSpans) {
                    resourceSpan.scopeSpans.forEach(scopeSpan => {
                        if (scopeSpan.spans) {
                            scopeSpan.spans.forEach(span => {
                                const traceId = bytesToHex(span.traceId);
                                if (!traceMap.has(traceId)) {
                                    // Process resource and scope
                                    const resourceName = extractResourceName(resourceSpan.resource);
                                    const scopeName = scopeSpan.scope?.name || 'Unknown Scope';

                                    traceMap.set(traceId, {
                                        spans: [],
                                        resource: {
                                            name: resourceName,
                                            attributes: processAttributes(resourceSpan.resource?.attributes)
                                        },
                                        scope: {
                                            name: scopeName,
                                            version: scopeSpan.scope?.version,
                                            attributes: processAttributes(scopeSpan.scope?.attributes)
                                        }
                                    });
                                }
                                // Convert span IDs to hex strings to match interface
                                // Convert timestamps from nanoseconds to ISO strings
                                const startTime = span.startTimeUnixNano
                                    ? new Date(Number(span.startTimeUnixNano) / 1_000_000).toISOString()
                                    : undefined;
                                const endTime = span.endTimeUnixNano
                                    ? new Date(Number(span.endTimeUnixNano) / 1_000_000).toISOString()
                                    : undefined;

                                const processedSpan = {
                                    ...span,
                                    spanId: bytesToHex(span.spanId),
                                    traceId: traceId,
                                    parentSpanId: bytesToHex(span.parentSpanId || ''),
                                    startTime,
                                    endTime,
                                    attributes: processAttributes(span.attributes)
                                };
                                traceMap.get(traceId).spans.push(processedSpan);
                                totalSpans++;
                            });
                        }
                    });
                }
            });

            // Store traces in memory
            traceMap.forEach((traceData, traceId) => {
                if (traceStore.has(traceId)) {
                    // Update existing trace
                    const existing = traceStore.get(traceId);
                    existing.spans.push(...traceData.spans);
                    existing.lastSeen = now;
                } else {
                    // Add new trace
                    traceStore.set(traceId, {
                        traceId,
                        spans: traceData.spans,
                        resource: traceData.resource,
                        scope: traceData.scope,
                        firstSeen: now,
                        lastSeen: now
                    });
                }
            });

            // Enforce LRU eviction if we exceed the limit
            enforceTraceLimit();

            // Collect all new processed spans for animation notifications
            const allNewSpans: Span[] = [];
            traceMap.forEach((traceData) => {
                allNewSpans.push(...traceData.spans);
            });

            // Emit event for trace updates
            traceEvents.emit('tracesUpdated');
            traceEvents.emit('newSpans', allNewSpans);

            // Simple logging - just show received data
            console.log(`${colors.cyan}📨 Received ${totalSpans} span(s) across ${traceMap.size} trace(s) | Total stored: ${traceStore.size} trace(s)${colors.reset}`);
        } else {
            console.log(`${colors.red}⚠️  Invalid OTLP payload - no resourceSpans found${colors.reset}`);
        }

        res.status(200).json({ partialSuccess: {} });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error(`${colors.red}Error processing traces:${colors.reset}`, message);
        if (stack) { console.error(stack); }
        res.status(500).json({ error: message });
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'devtrace-otlp-server' });
});




export const TraceServer: TraceServer = {
    start: (port: number) => new Promise((resolve, reject) => {
        if (server) {
            // Server already running
            resolve();
            return;
        }

        server = app.listen(port, () => {
            resolve();
        });
        server.on('error', (error) => {
            reject(error);
        });
    }),
    stop: () => new Promise((resolve, reject) => {
        if (!server) {
            resolve();
            return;
        }
        server.close((error) => {
            if (error) {
                reject(error);
            } else {
                server = undefined;
                resolve();
            }
        });
    }),
    isRunning: () => {
        return server?.listening ?? false;
    },
    getTraces: () => {
        return Array.from(traceStore.values());
    },
    clearTraces: () => {
        traceStore.clear();
        traceEvents.emit('tracesCleared');
    },
    getTrace: (traceId: string) => {
        return traceStore.get(traceId);
    },
    getTraceBySpanId: (spanId: string) => {
        return Array.from(traceStore.values()).find(trace => trace.spans.some(span => span.spanId === spanId));
    },
    getTraceByResource: (resource: string) => {
        return Array.from(traceStore.values()).find(trace => trace.resource.name === resource);
    },
    getTraceByScope: (scope: string) => {
        return Array.from(traceStore.values()).find(trace => trace.scope.name === scope);
    },
    getTraceByFirstSeen: (firstSeen: Date) => {
        return Array.from(traceStore.values()).find(trace => trace.firstSeen === firstSeen);
    },
    getTraceByLastSeen: (lastSeen: Date) => {
        return Array.from(traceStore.values()).find(trace => trace.lastSeen === lastSeen);
    },
    onTracesUpdated: (callback: () => void) => {
        traceEvents.on('tracesUpdated', callback);
        return () => traceEvents.off('tracesUpdated', callback);
    },
    onTracesCleared: (callback: () => void) => {
        traceEvents.on('tracesCleared', callback);
        return () => traceEvents.off('tracesCleared', callback);
    },
    onNewSpans: (callback: (spans: Span[]) => void) => {
        traceEvents.on('newSpans', callback);
        return () => traceEvents.off('newSpans', callback);
    },
    getTracesBySessionId: (sessionId: string) => {
        return Array.from(traceStore.values()).filter(trace =>
            trace.spans.some(span => {
                const conversationId = span.attributes?.find(
                    attr => attr.key === 'gen_ai.conversation.id'
                )?.value;
                return conversationId === sessionId;
            })
        );
    },
    getSessionIds: () => {
        const sessionIds = new Set<string>();
        for (const trace of traceStore.values()) {
            for (const span of trace.spans) {
                const conversationId = span.attributes?.find(
                    attr => attr.key === 'gen_ai.conversation.id'
                )?.value;
                if (conversationId) {
                    sessionIds.add(conversationId);
                }
            }
        }
        return Array.from(sessionIds);
    }
};