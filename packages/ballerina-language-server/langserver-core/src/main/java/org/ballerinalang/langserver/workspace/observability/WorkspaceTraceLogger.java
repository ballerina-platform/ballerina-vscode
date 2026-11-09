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
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;

import java.io.IOException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Subscribes to all domain events and emits structured trace logs.
 * 
 * <p>The trace logger uses BEST_EFFORT delivery tier to ensure observability
 * never blocks domain operations. It supports configurable log levels
 * (--debug, --trace flags) and structured logging with key-value fields.
 *
 * @since 1.7.0
 */
public class WorkspaceTraceLogger implements AutoCloseable {
    private static final String SUBSCRIBER_ID = "workspace-trace-logger";
    private static final Set<EventKind> ALL_EVENT_KINDS = EnumSet.allOf(EventKind.class);
    private final EventSyncPubSubHolder eventBus;
    private final AtomicReference<LogLevel> logLevel;
    private final List<TraceLogSink> sinks;
    private final BiConsumer<String, Map<String, String>> logConsumer;
    private final Consumer<DomainEvent> eventConsumer;
    private volatile boolean subscribed = false;

    /**
     * Creates a trace logger that logs to the default sinks.
     *
     * @param eventBus the event bus to subscribe to
     */
    public WorkspaceTraceLogger(EventSyncPubSubHolder eventBus) {
        this(eventBus, LogLevel.TRACE, defaultSinks());
    }

    /**
     * Creates a trace logger with a custom event consumer for testing.
     *
     * @param eventBus the event bus to subscribe to
     * @param eventConsumer consumer for received events
     */
    public WorkspaceTraceLogger(EventSyncPubSubHolder eventBus, Consumer<DomainEvent> eventConsumer) {
        this(eventBus, LogLevel.TRACE, eventConsumer);
    }

    /**
     * Creates a trace logger with custom log consumer for testing structured logging.
     *
     * @param eventBus the event bus to subscribe to
     * @param logConsumer consumer for structured log entries (level, fields)
     */
    @Deprecated(forRemoval = true)
    public WorkspaceTraceLogger(EventSyncPubSubHolder eventBus,
                                BiConsumer<String, Map<String, String>> logConsumer) {
        this(eventBus, LogLevel.TRACE, logConsumer != null ? List.of(asSink(logConsumer)) : defaultSinks());
    }

    /**
     * Creates a trace logger with the specified level and sinks.
     *
     * @param eventBus the event bus to subscribe to
     * @param initialLevel the initial log level
     * @param sinks trace sinks that receive structured entries
     */
    public WorkspaceTraceLogger(EventSyncPubSubHolder eventBus, LogLevel initialLevel,
                                List<TraceLogSink> sinks) {
        this.eventBus = eventBus;
        this.logLevel = new AtomicReference<>(initialLevel != null ? initialLevel : LogLevel.TRACE);
        this.sinks = List.copyOf(sinks);
        this.eventConsumer = null;
        this.logConsumer = this::dispatchToSinks;
        subscribe();
    }

    /**
     * Creates a trace logger with specified log level and consumer.
     *
     * @param eventBus the event bus to subscribe to
     * @param initialLevel the initial log level
     * @param eventConsumer custom event consumer (null for default sink logging)
     */
    public WorkspaceTraceLogger(EventSyncPubSubHolder eventBus, LogLevel initialLevel,
                                Consumer<DomainEvent> eventConsumer) {
        this.eventBus = eventBus;
        this.logLevel = new AtomicReference<>(initialLevel != null ? initialLevel : LogLevel.INFO);
        this.sinks = eventConsumer != null ? List.of() : defaultSinks();
        this.eventConsumer = eventConsumer;

        this.logConsumer = eventConsumer != null ?
                (level, fields) -> { } : // Consumer handles events directly
                this::dispatchToSinks;

        subscribe();
    }

    /**
     * Subscribes to all domain events with BEST_EFFORT tier.
     */
    private void subscribe() {
        if (subscribed) {
            return;
        }
        
        eventBus.subscribe(SUBSCRIBER_ID, SubscriberTier.BEST_EFFORT, ALL_EVENT_KINDS, this::handleEvent);
        subscribed = true;
    }

    /**
     * Handles incoming domain events.
     */
    private void handleEvent(DomainEvent event) {
        if (event == null) {
            return;
        }

        LogLevel currentLevel = logLevel.get();
        
        // Route to appropriate handler based on log level
        if (eventConsumer != null) {
            eventConsumer.accept(event);
        } else {
            logEvent(event, currentLevel);
        }
    }

    /**
     * Logs an event at the appropriate level.
     */
    private void logEvent(DomainEvent event, LogLevel currentLevel) {
        String level = determineLogLevel(event);
        
        if (!shouldLog(level, currentLevel)) {
            return;
        }

        Map<String, String> fields = eventToFields(event);
        logConsumer.accept(level, fields);
    }

    private void dispatchToSinks(String level, Map<String, String> fields) {
        for (TraceLogSink sink : sinks) {
            try {
                sink.write(level, fields);
            } catch (RuntimeException ignored) {
                // Best-effort logging must not affect event processing.
            }
        }
    }

    /**
     * Determines the appropriate log level for an event type.
     */
    private String determineLogLevel(DomainEvent event) {
        return switch (event.eventKind()) {
            case WORKSPACE_PROJECT_REGISTERED,
                 WORKSPACE_PROJECT_EVICTED,
                 WORKSPACE_PROJECT_HEALTH_STATE_CHANGED,
                  WORKSPACE_PROJECT_KIND_TRANSITIONED,
                  COMPILER_COMPILATION_FAILED,
                  CE_RESOLUTION_EXHAUSTED,
                  EXECUTION_PROCESS_STARTED,
                  EXECUTION_PROCESS_TERMINATED -> "INFO";
            case WORKSPACE_PROJECT_UPDATED,
                 WM_FILE_WATCHED_CHANGED,
                 COMPILER_SNAPSHOT_PUBLISHED,
                 COMPILER_COMPILATION_CANCELLED -> "DEBUG";
            case COMPILER_RESOLUTION_COMPLETED,
                  CE_E5A_RESOLUTION_DIAGNOSTICS_READY,
                  CE_E5B_COMPILATION_DIAGNOSTICS_READY,
                  CE_RESOLUTION_RECOVERED,
                  WORKSPACE_PROJECT_TIER_CHANGED,
                  WORKSPACE_BATCH_PROJECTS_REGISTERED,
                  WORKSPACE_LOCKING_MODE_CHANGED,
                  EXECUTION_PROCESS_OUTPUT,
                  CACHE_INVALIDATION_REQUESTED,
                  RM_E1_HEAP_PRESSURE_DETECTED -> "TRACE";
            default -> "TRACE";
        };
    }

    /**
     * Checks if a log entry should be emitted based on current level.
     * Higher priority levels are more restrictive (ERROR > WARN > INFO > DEBUG > TRACE).
     */
    private boolean shouldLog(String entryLevel, LogLevel currentLevel) {
        LogLevel entry = LogLevel.fromString(entryLevel);
        // Entry is logged if its priority is >= current level priority
        // e.g., if current is DEBUG (1), log DEBUG (1), INFO (2), WARN (3), ERROR (4)
        return entry.priority >= currentLevel.priority;
    }

    /**
     * Converts a domain event to structured fields via {@link DomainEvent#serialize()}.
     */
    private Map<String, String> eventToFields(DomainEvent event) {
        return event.serialize();
    }

    static String formatLogEntry(String level, Map<String, String> fields) {
        StringBuilder sb = new StringBuilder();
        sb.append("[").append(level).append("] ");
        
        // Add timestamp first
        String timestamp = fields.get("timestamp");
        if (timestamp != null) {
            sb.append(timestamp).append(" ");
        }
        
        // Add event type
        String eventType = fields.get("eventType");
        if (eventType != null) {
            sb.append(eventType);
        }
        
        // Add remaining fields as key=value
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            String key = entry.getKey();
            if (key.equals("timestamp") || key.equals("eventType")) {
                continue;
            }
            sb.append(" ").append(key).append("=").append(entry.getValue());
        }
        
        return sb.toString();
    }

    private static List<TraceLogSink> defaultSinks() {
        List<TraceLogSink> defaultSinks = new ArrayList<>();
        try {
            defaultSinks.add(new FileTraceLogSink());
        } catch (IOException ignored) {
            // Degrade gracefully if file logging is unavailable.
        }
        return defaultSinks;
    }

    private static TraceLogSink asSink(BiConsumer<String, Map<String, String>> logConsumer) {
        return new TraceLogSink() {
            @Override
            public void write(String level, Map<String, String> fields) {
                logConsumer.accept(level, fields);
            }

            @Override
            public void close() {
                // No-op.
            }
        };
    }

    /**
     * Sets the log level.
     *
     * @param level the new log level
     */
    public void setLogLevel(LogLevel level) {
        this.logLevel.set(level != null ? level : LogLevel.INFO);
    }

    /**
     * Gets the current log level.
     *
     * @return the current log level
     */
    public LogLevel getLogLevel() {
        return logLevel.get();
    }

    /**
     * Logs a structured entry at the specified level.
     * 
     * <p>This method is primarily for testing purposes.
     *
     * @param level the log level
     * @param fields the structured fields
     */
    public void logStructured(String level, Map<String, String> fields) {
        if (shouldLog(level, logLevel.get())) {
            logConsumer.accept(level, fields);
        }
    }

    @Override
    public void close() {
        // Note: We cannot unsubscribe from EventSyncPubSubHolder directly,
        // but we can set log level to OFF to stop processing
        logLevel.set(LogLevel.OFF);
        for (TraceLogSink sink : sinks) {
            try {
                sink.close();
            } catch (RuntimeException ignored) {
                // Best-effort cleanup.
            }
        }
    }
}
