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

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nonnull;

/**
 * Fire-and-forget telemetry emitter that writes structured metric entries directly to {@link TraceLogSink}s.
 *
 * <p>No metric data is retained in memory after the sink write returns. Each call to
 * {@link #emit}, {@link #emitValue}, or {@link #emitGauge} formats the metric as structured
 * key-value fields and dispatches immediately to all registered sinks. Sink failures are
 * absorbed silently — telemetry must never affect the caller.
 *
 * <p>Metric entries use log level {@code METRIC} to distinguish them from domain event
 * traces in the output stream.
 *
 * @since 1.7.0
 */
public class TelemetryEmitter {
    private static final String LEVEL = "METRIC";

    private final List<TraceLogSink> sinks;

    /**
     * Creates a telemetry emitter that dispatches to the given sinks.
     *
     * @param sinks the sinks to write metric entries to
     */
    public TelemetryEmitter(@Nonnull List<TraceLogSink> sinks) {
        this.sinks = List.copyOf(sinks);
    }

    /**
     * Emits a counter metric event with associated labels.
     *
     * <p>This method is non-blocking and returns immediately after dispatching to sinks.
     *
     * @param metricName the name of the metric
     * @param labels     key-value labels associated with the event; may be null or empty
     */
    public void emit(String metricName, Map<String, String> labels) {
        if (metricName == null || metricName.isBlank()) {
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("timestamp", Instant.now().toString());
        fields.put("metricType", "counter");
        fields.put("metricName", metricName);
        if (labels != null && !labels.isEmpty()) {
            labels.forEach((k, v) -> {
                if (k != null && !k.isBlank() && v != null) {
                    fields.put(k, v);
                }
            });
        }

        dispatch(fields);
    }

    /**
     * Emits a value metric event with a numeric measurement.
     *
     * @param metricName the name of the metric
     * @param value      the numeric value to record
     */
    public void emitValue(String metricName, long value) {
        if (metricName == null || metricName.isBlank()) {
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("timestamp", Instant.now().toString());
        fields.put("metricType", "value");
        fields.put("metricName", metricName);
        fields.put("value", Long.toString(value));

        dispatch(fields);
    }

    /**
     * Emits a gauge metric event with a point-in-time value.
     *
     * @param metricName the name of the metric
     * @param value      the gauge value
     */
    public void emitGauge(String metricName, long value) {
        if (metricName == null || metricName.isBlank()) {
            return;
        }

        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("timestamp", Instant.now().toString());
        fields.put("metricType", "gauge");
        fields.put("metricName", metricName);
        fields.put("value", Long.toString(value));

        dispatch(fields);
    }

    private void dispatch(Map<String, String> fields) {
        for (TraceLogSink sink : sinks) {
            try {
                sink.write(LEVEL, fields);
            } catch (RuntimeException ignored) {
                // Best-effort — telemetry must never affect the caller.
            }
        }
    }
}
