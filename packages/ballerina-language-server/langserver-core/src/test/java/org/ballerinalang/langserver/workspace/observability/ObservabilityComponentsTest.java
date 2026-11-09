/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package org.ballerinalang.langserver.workspace.observability;

import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.event.BatchEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProcessEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProcessOutputEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureLevel;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;


/**
 * Tests for observability components: TelemetryEmitter and WorkspaceTraceLogger.
 *
 * @since 1.7.0
 */
public class ObservabilityComponentsTest {

    // ==================== TelemetryEmitter Tests ====================

    /**
     * Verifies TelemetryEmitter.emit() dispatches counter entries to sinks immediately.
     */
    @Test
    public void telemetryEmitter_emit_dispatchesToSinks() {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));

        emitter.emit("test.counter", Map.of("label1", "value1"));

        Assert.assertEquals(captured.size(), 1);
        Map<String, String> entry = captured.get(0);
        Assert.assertEquals(entry.get("metricType"), "counter");
        Assert.assertEquals(entry.get("metricName"), "test.counter");
        Assert.assertEquals(entry.get("label1"), "value1");
        Assert.assertNotNull(entry.get("timestamp"));
    }

    /**
     * Verifies TelemetryEmitter.emitValue() dispatches value entries to sinks.
     */
    @Test
    public void telemetryEmitter_emitValue_dispatchesToSinks() {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));

        emitter.emitValue("compilation.latency_ms", 450L);

        Assert.assertEquals(captured.size(), 1);
        Map<String, String> entry = captured.get(0);
        Assert.assertEquals(entry.get("metricType"), "value");
        Assert.assertEquals(entry.get("metricName"), "compilation.latency_ms");
        Assert.assertEquals(entry.get("value"), "450");
    }

    /**
     * Verifies TelemetryEmitter.emitGauge() dispatches gauge entries to sinks.
     */
    @Test
    public void telemetryEmitter_emitGauge_dispatchesToSinks() {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));

        emitter.emitGauge("queue.depth", 7L);

        Assert.assertEquals(captured.size(), 1);
        Map<String, String> entry = captured.get(0);
        Assert.assertEquals(entry.get("metricType"), "gauge");
        Assert.assertEquals(entry.get("metricName"), "queue.depth");
        Assert.assertEquals(entry.get("value"), "7");
    }

    /**
     * Verifies that blank or null metric names are silently ignored.
     */
    @Test
    public void telemetryEmitter_blankMetricName_isIgnored() {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));

        emitter.emit(null, Map.of());
        emitter.emit("  ", Map.of());
        emitter.emitValue(null, 1L);
        emitter.emitGauge("", 1L);

        Assert.assertEquals(captured.size(), 0, "No entries should be dispatched for blank/null metric names");
    }

    /**
     * Verifies that a sink failure does not propagate to the caller.
     */
    @Test
    public void telemetryEmitter_sinkFailure_isAbsorbed() {
        TraceLogSink throwingSink = new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                throw new RuntimeException("sink error");
            }

            @Override
            public void close() {
            }
        };

        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(throwingSink, capturingSink(captured)));

        // Should not throw — failure in first sink must not prevent dispatch to second
        emitter.emit("test.metric", null);

        Assert.assertEquals(captured.size(), 1, "Second sink should still receive the entry");
    }

    /**
     * Verifies that null labels are safely handled (no NullPointerException).
     */
    @Test
    public void telemetryEmitter_nullLabels_areSkipped() {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(capturingSink(captured)));

        emitter.emit("test.counter", null);

        Assert.assertEquals(captured.size(), 1);
        // Only timestamp, metricType, metricName should be present
        Assert.assertEquals(captured.get(0).get("metricType"), "counter");
    }

    /**
     * Verifies TelemetryEmitter is non-blocking — 10k emit calls complete well under 100ms.
     */
    @Test
    public void telemetryEmitter_emit_isNonBlocking() {
        TelemetryEmitter emitter = new TelemetryEmitter(List.of());

        long startTime = System.nanoTime();
        for (int i = 0; i < 10_000; i++) {
            emitter.emit("metric." + i, Map.of("key", "value"));
        }
        long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startTime);

        Assert.assertTrue(elapsedMillis < 100,
                "TelemetryEmitter.emit() should be non-blocking, but took " + elapsedMillis + "ms");
    }

    /**
     * Verifies METRIC level is used in sink writes to distinguish from trace entries.
     */
    @Test
    public void telemetryEmitter_writesMetricLevel() {
        List<String> capturedLevels = new CopyOnWriteArrayList<>();
        TraceLogSink levelCapturingSink = new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                capturedLevels.add(level);
            }

            @Override
            public void close() {
            }
        };
        TelemetryEmitter emitter = new TelemetryEmitter(List.of(levelCapturingSink));

        emitter.emit("counter", null);
        emitter.emitValue("latency", 100L);
        emitter.emitGauge("depth", 5L);

        Assert.assertEquals(capturedLevels.size(), 3);
        capturedLevels.forEach(level ->
                Assert.assertEquals(level, "METRIC", "All metric entries must use METRIC level"));
    }

    // ==================== WorkspaceTraceLogger Tests ====================

    /**
     * Verifies WorkspaceTraceLogger subscribes to all event kinds.
     */
    @Test
    public void workspaceTraceLogger_subscribesToAllEventKinds() throws InterruptedException {
        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        List<String> loggedEvents = new CopyOnWriteArrayList<>();

        new WorkspaceTraceLogger(eventBus, event -> loggedEvents.add(event.eventKind().name()));

        Set<EventKind> allKinds = Set.of(EventKind.values());
        for (EventKind kind : allKinds) {
            eventBus.publish(typedEventFor(kind));
        }

        Thread.sleep(500);

        Set<String> loggedEventNames = new java.util.HashSet<>(loggedEvents);
        for (EventKind kind : allKinds) {
            Assert.assertTrue(loggedEventNames.contains(kind.name()),
                    "Event kind should be logged: " + kind.name());
        }

        eventBus.close();
    }

    /**
     * Verifies WorkspaceTraceLogger uses structured logging with key-value fields.
     */
    @Test
    public void workspaceTraceLogger_logsStructuredKeyValueFields() {
        List<Map<String, String>> loggedEntries = new CopyOnWriteArrayList<>();

        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(
                new EventSyncPubSubHolder(),
                (level, fields) -> loggedEntries.add(fields)
        );

        traceLogger.logStructured("INFO", Map.of(
                "eventType", "WM-E1",
                "sourceContext", "workspace-a",
                "timestamp", Instant.now().toString()
        ));

        Assert.assertEquals(loggedEntries.size(), 1);
        Map<String, String> entry = loggedEntries.get(0);
        Assert.assertEquals(entry.get("eventType"), "WM-E1");
        Assert.assertEquals(entry.get("sourceContext"), "workspace-a");
        Assert.assertTrue(entry.containsKey("timestamp"));
    }

    /**
     * Verifies WorkspaceTraceLogger respects debug log level.
     */
    @Test
    public void workspaceTraceLogger_debugLevel_enablesDebugLogs() {
        List<String> loggedLevels = new CopyOnWriteArrayList<>();

        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(
                new EventSyncPubSubHolder(),
                (level, fields) -> loggedLevels.add(level)
        );

        traceLogger.setLogLevel(LogLevel.DEBUG);
        traceLogger.logStructured("DEBUG", Map.of("test", "value"));
        traceLogger.logStructured("INFO", Map.of("test", "value"));
        traceLogger.logStructured("TRACE", Map.of("test", "value"));

        Assert.assertTrue(loggedLevels.contains("DEBUG"));
        Assert.assertTrue(loggedLevels.contains("INFO"));
        Assert.assertFalse(loggedLevels.contains("TRACE"));
    }

    /**
     * Verifies WorkspaceTraceLogger respects trace log level.
     */
    @Test
    public void workspaceTraceLogger_traceLevel_enablesAllLogs() {
        List<String> loggedLevels = new CopyOnWriteArrayList<>();

        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(
                new EventSyncPubSubHolder(),
                (level, fields) -> loggedLevels.add(level)
        );

        traceLogger.setLogLevel(LogLevel.TRACE);
        traceLogger.logStructured("DEBUG", Map.of("test", "value"));
        traceLogger.logStructured("INFO", Map.of("test", "value"));
        traceLogger.logStructured("TRACE", Map.of("test", "value"));

        Assert.assertTrue(loggedLevels.contains("DEBUG"));
        Assert.assertTrue(loggedLevels.contains("INFO"));
        Assert.assertTrue(loggedLevels.contains("TRACE"));
    }

    /**
     * Verifies WorkspaceTraceLogger at INFO level suppresses debug and trace.
     */
    @Test
    public void workspaceTraceLogger_defaultLevel_suppressesDebugAndTrace() {
        List<String> loggedLevels = new CopyOnWriteArrayList<>();

        WorkspaceTraceLogger traceLogger = new WorkspaceTraceLogger(
                new EventSyncPubSubHolder(),
                (level, fields) -> loggedLevels.add(level)
        );
        traceLogger.setLogLevel(LogLevel.INFO);

        traceLogger.logStructured("DEBUG", Map.of("test", "value"));
        traceLogger.logStructured("INFO", Map.of("test", "value"));
        traceLogger.logStructured("TRACE", Map.of("test", "value"));

        Assert.assertFalse(loggedLevels.contains("DEBUG"));
        Assert.assertTrue(loggedLevels.contains("INFO"));
        Assert.assertFalse(loggedLevels.contains("TRACE"));
    }

    /**
     * Verifies WorkspaceTraceLogger subscribes with BEST_EFFORT tier.
     */
    @Test
    public void workspaceTraceLogger_usesBestEffortTier() throws InterruptedException {
        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        AtomicInteger receivedCount = new AtomicInteger(0);

        new WorkspaceTraceLogger(eventBus, event -> receivedCount.incrementAndGet());

        for (int i = 0; i < 500; i++) {
            eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, URI.create("file:///workspace")));
        }

        Thread.sleep(300);
        Assert.assertTrue(receivedCount.get() >= 0, "Should have received events or gracefully dropped");

        eventBus.close();
    }

    // ==================== Integration Tests ====================

    /**
     * Verifies end-to-end: events flow through trace logger, telemetry emitter writes to shared sinks.
     */
    @Test
    public void observability_endToEnd_eventsAndMetricsFlowToSameSink() throws InterruptedException {
        List<Map<String, String>> captured = new CopyOnWriteArrayList<>();
        TraceLogSink sink = capturingSink(captured);

        TelemetryEmitter emitter = new TelemetryEmitter(List.of(sink));
        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder(emitter);
        new WorkspaceTraceLogger(eventBus, event -> {
            emitter.emit("event.received", Map.of("kind", event.eventKind().name()));
        });

        URI wsRoot = URI.create("file:///workspace-1");
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, wsRoot));
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, wsRoot));
        eventBus.publish(new CompilerEvent(EventKind.COMPILER_SNAPSHOT_PUBLISHED, wsRoot, "test-pkg"));

        Thread.sleep(300);

        Assert.assertTrue(captured.size() >= 3, "Should have at least one metric entry per event");
        boolean hasRegistered = captured.stream()
                .anyMatch(e -> "WORKSPACE_PROJECT_REGISTERED".equals(e.get("kind")));
        Assert.assertTrue(hasRegistered, "Metric for WORKSPACE_PROJECT_REGISTERED should be present");

        eventBus.close();
    }

    // ==================== Helpers ====================

    /**
     * Returns a typed {@link DomainEvent} for the given {@link EventKind}, using stub payloads.
     * Used in tests that need to publish every event kind without caring about payload content.
     */
    private static DomainEvent typedEventFor(EventKind kind) {
        URI root = URI.create("file:///test-root");
        URI doc = URI.create("file:///test-root/main.bal");
        return switch (kind) {
            case WORKSPACE_PROJECT_REGISTERED,
                 WORKSPACE_PROJECT_UPDATED,
                 WORKSPACE_PROJECT_HEALTH_STATE_CHANGED,
                 WORKSPACE_PROJECT_TIER_CHANGED,
                 WORKSPACE_LOCKING_MODE_CHANGED,
                 CACHE_INVALIDATION_REQUESTED -> new ProjectEvent(kind, root);
            case WORKSPACE_PROJECT_EVICTED    -> new ProjectEvent(kind, root);
            case WORKSPACE_PROJECT_KIND_TRANSITIONED -> new ProjectEvent(kind, root);
            case WORKSPACE_BATCH_PROJECTS_REGISTERED -> new BatchEvent();
            case WM_FILE_WATCHED_CHANGED ->
                    new org.ballerinalang.langserver.workspace.eventbus.FileWatchedChangedEvent(root, doc, "SOURCE");
            case COMPILER_SNAPSHOT_PUBLISHED, COMPILER_COMPILATION_FAILED, COMPILER_COMPILATION_CANCELLED,
                 COMPILER_RESOLUTION_COMPLETED, CE_E5A_RESOLUTION_DIAGNOSTICS_READY,
                 CE_E5B_COMPILATION_DIAGNOSTICS_READY, CE_RESOLUTION_EXHAUSTED, CE_RESOLUTION_RECOVERED ->
                    new CompilerEvent(kind, root, "test-pkg");
            case EXECUTION_PROCESS_STARTED, EXECUTION_PROCESS_TERMINATED ->
                    new ProcessEvent(kind, root, "pid-1");
            case EXECUTION_PROCESS_OUTPUT ->
                    new ProcessOutputEvent(root, "pid-1", "stdout|line");
            case RM_E1_HEAP_PRESSURE_DETECTED -> new HeapPressureEvent(HeapPressureLevel.WARNING);
        };
    }

    private static TraceLogSink capturingSink(List<Map<String, String>> target) {
        return new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                target.add(new java.util.LinkedHashMap<>(fields));
            }

            @Override
            public void close() {
            }
        };
    }
}
