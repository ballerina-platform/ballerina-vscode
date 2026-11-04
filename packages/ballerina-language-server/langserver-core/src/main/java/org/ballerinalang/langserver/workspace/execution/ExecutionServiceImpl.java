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

package org.ballerinalang.langserver.workspace.execution;

import org.ballerinalang.langserver.commons.workspace.RunContext;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.ProjectEvictedEvent;
import org.ballerinalang.langserver.workspace.eventbus.ProjectKindTransitionedEvent;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProcessEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProcessOutputEvent;
import org.ballerinalang.langserver.workspace.executionmanager.ExecutionService;
import org.ballerinalang.langserver.workspace.executionmanager.ProcessId;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import javax.annotation.Nonnull;

/**
 * Implementation of {@link ExecutionService} that manages process execution.
 * Publishes EM-E1, EM-E2, EM-E3 events and subscribes to WM-E2, WM-E4.
 *
 * @since 1.7.0
 */
public final class ExecutionServiceImpl implements ExecutionService {
    private final EventSyncPubSubHolder eventBus;
    private final Duration defaultGracePeriod;
    private final ProcessRegistry processRegistry;
    private final ExecutorService virtualThreadExecutor;
    private final Consumer<Boolean> virtualThreadUsageTracker;
    private final ConcurrentHashMap<ProcessId, ExecutionProcess> activeProcesses = new ConcurrentHashMap<>();
    /**
     * Creates a new execution service.
     *
     * @param eventBus the event bus for publishing/subscribing
     * @param defaultGracePeriod default grace period for process termination
     * @param maxActiveProcesses maximum number of concurrent active processes
     */
    public ExecutionServiceImpl(EventSyncPubSubHolder eventBus,
                                Duration defaultGracePeriod,
                                int maxActiveProcesses) {
        this(eventBus, defaultGracePeriod, maxActiveProcesses, ignored -> { });
    }

    /**
     * Creates a new execution service with a virtual thread usage tracker.
     *
     * @param eventBus the event bus for publishing/subscribing
     * @param defaultGracePeriod default grace period for process termination
     * @param maxActiveProcesses maximum number of concurrent active processes
     * @param virtualThreadUsageTracker consumer to track virtual thread usage (for testing)
     */
    ExecutionServiceImpl(@Nonnull EventSyncPubSubHolder eventBus,
                         @Nonnull Duration defaultGracePeriod,
                         int maxActiveProcesses,
                         @Nonnull Consumer<Boolean> virtualThreadUsageTracker) {
        this.eventBus = eventBus;
        this.defaultGracePeriod = defaultGracePeriod;
        this.processRegistry = new ProcessRegistry(maxActiveProcesses);
        this.virtualThreadExecutor = Executors.newVirtualThreadPerTaskExecutor();
        this.virtualThreadUsageTracker = virtualThreadUsageTracker;

        subscribeToDomainEvents();
    }

    @Override
    public ProcessId run(@Nonnull RunContext context) {
        Path sourcePath = context.balSourcePath();
        if (sourcePath == null) {
            throw new IllegalArgumentException("balSourcePath must not be null");
        }

        DocumentUri sourceRoot = resolveSourceUri(sourcePath);
        ProcessId processId = new ProcessId(UUID.randomUUID().toString());

        try {
            ProcessBuilder pb = createProcessBuilder(context);
            Process process = pb.start();

            ExecutionProcess executionProcess = new ExecutionProcess(
                    processId,
                    sourceRoot,
                    resolveExecutionMode(context),
                    sourcePath,
                    defaultGracePeriod,
                    process,
                    streamSource -> {
                    });

            executionProcess.markRunning();
            processRegistry.register(executionProcess);
            activeProcesses.put(processId, executionProcess);

            publish(EventKind.EXECUTION_PROCESS_STARTED, sourceRoot.uri(), processId.value(), null);

            startOutputStreaming(processId, process, sourceRoot);

            return processId;

        } catch (IOException e) {
            throw new RuntimeException("Failed to start process", e);
        }
    }

    @Override
    public void stop(@Nonnull DocumentUri sourceRoot) {
        processRegistry.cleanup(sourceRoot, ExecutionProcess.TerminationReason.USER_REQUESTED);
    }

    /**
     * Stops a specific execution by process ID.
     *
     * @param processId the process ID to stop
     * @throws NullPointerException if processId is null
     */
    public void stopExecution(@Nonnull ProcessId processId) {
        Optional<ExecutionProcess> process = processRegistry.find(processId);
        process.ifPresent(p -> {
            p.terminate(ExecutionProcess.TerminationReason.USER_REQUESTED);
            processRegistry.remove(processId);
            activeProcesses.remove(processId);
        });
    }

    /**
     * Queries the current execution status of a process.
     *
     * @param processId the process ID to query
     * @return the current process state, or null if not found
     */
    public ExecutionProcess.ProcessState queryExecutionStatus(@Nonnull ProcessId processId) {
        return processRegistry.find(processId)
                .map(ExecutionProcess::state)
                .orElse(null);
    }

    /**
     * Shuts down the execution service and terminates all active processes.
     */
    public void shutdown() {
        virtualThreadExecutor.shutdown();
        try {
            if (!virtualThreadExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                virtualThreadExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            virtualThreadExecutor.shutdownNow();
        }

        activeProcesses.values().forEach(p -> {
            try {
                p.terminate(ExecutionProcess.TerminationReason.USER_REQUESTED);
            } catch (RuntimeException ignored) {
            }
        });
        activeProcesses.clear();
    }

    private void subscribeToDomainEvents() {
        String subscriberId = "execution-service-" + System.identityHashCode(this);

        eventBus.subscribe(subscriberId + "-eviction",
                SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_EVICTED),
                this::onProjectEvicted);

        eventBus.subscribe(subscriberId + "-kind-transition",
                SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED),
                this::onProjectKindTransitioned);
    }

    private void onProjectEvicted(DomainEvent event) {
        if (!(event instanceof ProjectEvictedEvent pee)) {
            return;
        }
        try {
            DocumentUri sourceRoot = new DocumentUri.FileUri(pee.sourceRoot());
            processRegistry.cleanup(sourceRoot, ExecutionProcess.TerminationReason.EVICTION_CLEANUP);
        } catch (RuntimeException ignored) {
        }
    }

    private void onProjectKindTransitioned(DomainEvent event) {
        if (!(event instanceof ProjectKindTransitionedEvent pkte)) {
            return;
        }
        ProjectKind newKind = pkte.newKind();
        if (isSupportedProjectKind(newKind)) {
            return;
        }
        try {
            DocumentUri sourceRoot = new DocumentUri.FileUri(pkte.sourceRoot());
            processRegistry.cleanup(sourceRoot, ExecutionProcess.TerminationReason.PROJECT_KIND_TRANSITIONED);
        } catch (RuntimeException ignored) {
        }
    }

    private boolean isSupportedProjectKind(ProjectKind kind) {
        return kind == ProjectKind.SINGLE_FILE || kind == ProjectKind.BUILD;
    }

    private void startOutputStreaming(ProcessId processId, Process process, DocumentUri sourceRoot) {
        virtualThreadExecutor.execute(() -> {
            virtualThreadUsageTracker.accept(Thread.currentThread().isVirtual());
            streamOutput(processId, process, sourceRoot, process.getInputStream(), true);
        });

        virtualThreadExecutor.execute(() -> {
            virtualThreadUsageTracker.accept(Thread.currentThread().isVirtual());
            streamOutput(processId, process, sourceRoot, process.getErrorStream(), false);
        });

        virtualThreadExecutor.execute(() -> {
            virtualThreadUsageTracker.accept(Thread.currentThread().isVirtual());
            try {
                process.waitFor();
                ExecutionProcess execProcess = activeProcesses.get(processId);
                if (execProcess != null) {
                    try {
                        execProcess.terminate(ExecutionProcess.TerminationReason.USER_REQUESTED);
                    } catch (IllegalStateException e) {
                        // Process already terminated, ignore
                    }
                }
                publish(EventKind.EXECUTION_PROCESS_TERMINATED, sourceRoot.uri(), processId.value(), null);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }

    private void streamOutput(ProcessId processId, Process process, DocumentUri sourceRoot,
                              InputStream stream, boolean isStdout) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!process.isAlive()) {
                    break;
                }
                String outputLine = (isStdout ? "stdout" : "stderr") + "|" + line;
                publish(EventKind.EXECUTION_PROCESS_OUTPUT, sourceRoot.uri(), processId.value(), outputLine);
            }
        } catch (IOException ignored) {
        }
    }

    private ProcessBuilder createProcessBuilder(RunContext context) {
        ProcessBuilder pb = new ProcessBuilder();
        pb.command().add(context.javaCmd());
        pb.command().addAll(context.programArgs());
        pb.environment().putAll(context.env());
        return pb;
    }

    private DocumentUri resolveSourceUri(Path balSourcePath) {
        Path normalized = balSourcePath.toAbsolutePath().normalize();
        Path sourceRoot = normalized.getParent();
        return new DocumentUri.FileUri((sourceRoot != null ? sourceRoot : normalized).toUri());
    }

    private ExecutionProcess.ExecutionMode resolveExecutionMode(RunContext context) {
        if (context.debugPort() != null && context.debugPort() > 0) {
            return ExecutionProcess.ExecutionMode.DEBUG;
        }
        return ExecutionProcess.ExecutionMode.RUN;
    }

    /**
     * Publishes a process-related domain event.
     *
     * @param eventKind   the event kind
     * @param sourceRoot  the source root URI
     * @param processId   the process identifier string
     * @param output      the output string for {@link EventKind#EXECUTION_PROCESS_OUTPUT}, or {@code null}
     */
    private void publish(EventKind eventKind, URI sourceRoot, String processId, String output) {
        if (eventKind == EventKind.EXECUTION_PROCESS_OUTPUT && output != null) {
            eventBus.publish(new ProcessOutputEvent(sourceRoot, processId, output));
        } else {
            eventBus.publish(new ProcessEvent(eventKind, sourceRoot, processId));
        }
    }
}
