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

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nonnull;

/**
 * {@link DiagnosticLog} implementation that dispatches free-text/exception diagnostics to a
 * list of {@link TraceLogSink}s.
 *
 * <p>Entries are tagged with a {@code DIAG} level marker to distinguish them from the
 * {@code EVENT} domain-event traces that share the same sinks. Stack traces are flattened to a
 * single {@code exception} field with escaped newlines, preserving the one-record-per-line
 * invariant of the backing sinks.
 *
 * @since 1.7.0
 */
public final class SinkDiagnosticLog implements DiagnosticLog {
    private static final String LEVEL_PREFIX = "DIAG ";

    private final List<TraceLogSink> sinks;

    /**
     * Creates a diagnostic log that dispatches to the given sinks.
     *
     * @param sinks the sinks to write diagnostic entries to
     */
    public SinkDiagnosticLog(@Nonnull List<TraceLogSink> sinks) {
        this.sinks = List.copyOf(sinks);
    }

    @Override
    public void log(LogLevel level, String source, String message) {
        log(level, source, message, null);
    }

    @Override
    public void log(LogLevel level, String source, String message, Throwable t) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("timestamp", Instant.now().toString());
        fields.put("source", source == null ? "" : source);
        fields.put("message", message == null ? "" : message);
        if (t != null) {
            fields.put("exception", stackTraceAsString(t));
        }

        LogLevel effectiveLevel = level == null ? LogLevel.INFO : level;
        String levelTag = LEVEL_PREFIX + effectiveLevel.name();
        for (TraceLogSink sink : sinks) {
            try {
                sink.write(levelTag, fields);
            } catch (RuntimeException ignored) {
                // Best-effort — diagnostics must never affect the caller.
            }
        }
    }

    /**
     * Returns the sinks this diagnostic log dispatches to.
     *
     * @return an immutable view of the configured sinks
     */
    public List<TraceLogSink> sinks() {
        return sinks;
    }

    private static String stackTraceAsString(Throwable t) {
        StringWriter buffer = new StringWriter();
        t.printStackTrace(new PrintWriter(buffer));
        return buffer.toString().replace("\n", "\\n").replace("\r", "\\r");
    }
}
