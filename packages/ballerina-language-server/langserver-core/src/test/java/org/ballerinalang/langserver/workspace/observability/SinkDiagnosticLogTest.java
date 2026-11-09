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

import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Tests for {@link SinkDiagnosticLog} dispatch, field formatting, and failure isolation.
 *
 * @since 1.7.0
 */
public class SinkDiagnosticLogTest {

    /**
     * Verifies a diagnostic is dispatched to every configured sink with the expected fields.
     */
    @Test
    public void log_dispatchesToAllSinks() {
        RecordingTraceLogSink first = new RecordingTraceLogSink();
        RecordingTraceLogSink second = new RecordingTraceLogSink();
        SinkDiagnosticLog diagnosticLog = new SinkDiagnosticLog(List.of(first, second));

        diagnosticLog.log(LogLevel.WARN, "CompilationServiceImpl", "Failed to describe project");

        Assert.assertEquals(first.entries.size(), 1);
        Assert.assertEquals(second.entries.size(), 1);
        Map<String, String> fields = first.entries.get(0);
        Assert.assertEquals(fields.get("source"), "CompilationServiceImpl");
        Assert.assertEquals(fields.get("message"), "Failed to describe project");
        Assert.assertFalse(fields.containsKey("exception"));
        Assert.assertNotNull(fields.get("timestamp"));
    }

    /**
     * Verifies the three-argument overload delegates without attaching a throwable.
     */
    @Test
    public void log_threeArgOverload_omitsExceptionField() {
        RecordingTraceLogSink sink = new RecordingTraceLogSink();
        SinkDiagnosticLog diagnosticLog = new SinkDiagnosticLog(List.of(sink));

        diagnosticLog.log(LogLevel.DEBUG, "DualSnapshotStore", "LRU eviction");

        Map<String, String> fields = sink.entries.get(0);
        Assert.assertFalse(fields.containsKey("exception"));
        Assert.assertEquals(fields.get("message"), "LRU eviction");
    }

    /**
     * Verifies a throwable is flattened to a single {@code exception} field with escaped newlines.
     */
    @Test
    public void log_withThrowable_flattensStackTrace() {
        RecordingTraceLogSink sink = new RecordingTraceLogSink();
        SinkDiagnosticLog diagnosticLog = new SinkDiagnosticLog(List.of(sink));

        RuntimeException cause = new RuntimeException("bad path");
        diagnosticLog.log(LogLevel.WARN, "CompilationServiceImpl", "Failed to describe project", cause);

        String exception = sink.entries.get(0).get("exception");
        Assert.assertNotNull(exception);
        Assert.assertTrue(exception.startsWith("java.lang.RuntimeException: bad path"));
        Assert.assertTrue(exception.contains("\\n"), "stack trace newlines must be escaped");
        Assert.assertFalse(exception.contains("\n"), "stack trace must not contain literal newlines");
    }

    /**
     * Verifies a failing sink does not prevent dispatch to the remaining sinks.
     */
    @Test
    public void log_sinkFailure_doesNotBreakOtherSinks() {
        TraceLogSink failingSink = new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                throw new RuntimeException("expected failure");
            }

            @Override
            public void close() {
            }
        };
        RecordingTraceLogSink recordingSink = new RecordingTraceLogSink();
        SinkDiagnosticLog diagnosticLog = new SinkDiagnosticLog(List.of(failingSink, recordingSink));

        diagnosticLog.log(LogLevel.INFO, "source", "message");

        Assert.assertEquals(recordingSink.entries.size(), 1);
    }

    /**
     * Verifies entries are tagged with the {@code DIAG} level marker.
     */
    @Test
    public void log_usesDiagLevelTag() {
        RecordingTraceLogSink sink = new RecordingTraceLogSink();
        SinkDiagnosticLog diagnosticLog = new SinkDiagnosticLog(List.of(sink));

        diagnosticLog.log(LogLevel.WARN, "source", "message");

        Assert.assertEquals(sink.levels.get(0), "DIAG WARN");
    }

    private static final class RecordingTraceLogSink implements TraceLogSink {

        private final List<Map<String, String>> entries = new CopyOnWriteArrayList<>();
        private final List<String> levels = new CopyOnWriteArrayList<>();
        private final AtomicBoolean closed = new AtomicBoolean(false);

        @Override
        public void write(String level, Map<String, String> fields) {
            levels.add(level);
            entries.add(Map.copyOf(fields));
        }

        @Override
        public void close() {
            closed.set(true);
        }
    }
}
