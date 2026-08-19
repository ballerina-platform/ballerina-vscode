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

package org.ballerinalang.langserver.workspace;

import org.ballerinalang.langserver.workspace.compilerengine.CompilationPipeline;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl;
import org.ballerinalang.langserver.workspace.observability.WorkspaceTraceLogger;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureDetected;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureMonitor;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectLoader;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeApplier;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

import javax.annotation.Nonnull;

/**
 * Central wiring configuration that constructs and connects all bounded context services
 * through the shared event bus. Ensures correct construction order and cross-context
 * event subscription wiring per domain-events.md specification.
 *
 * @since 1.7.0
 */
public final class WiringConfiguration implements AutoCloseable {
    private final EventSyncPubSubHolder eventBus;
    private final ChangeBuffer changeBuffer;
    private final ChangeApplier changeApplier;
    private final HeapPressureMonitor heapPressureMonitor;
    private final ProjectServiceImpl projectService;
    private final CompilationServiceImpl compilationService;
    private final ExecutionServiceImpl executionService;
    private final WorkspaceTraceLogger traceLogger;
    private final DualSnapshotStore snapshotStore;

    private WiringConfiguration(Builder builder) {
        this.eventBus = builder.eventBus;
        this.snapshotStore = builder.snapshotStore;

        // Construction order matters — services self-subscribe in constructors.
        // 1. Shared infrastructure: ChangeBuffer
        this.changeBuffer = new ChangeBuffer();

        // 2. HeapPressureMonitor — started immediately; publishes RM-E1 via lambda bridge
        Consumer<HeapPressureDetected> hpdPublisher = hpd ->
                eventBus.publish(new HeapPressureEvent(hpd.level()));
        this.heapPressureMonitor = new HeapPressureMonitor(hpdPublisher, builder.heapPressurePollIntervalMs);
        this.heapPressureMonitor.start();

        // 3. ProjectService (subscribes to CE and RM events, owns UriResolver and ChangeApplier)
        this.projectService = new ProjectServiceImpl(eventBus, builder.projectLoader, changeBuffer);
        this.changeApplier = projectService.changeApplier();

        // 4. CompilationService (subscribes to WM-E1, WM-E2, WM-E4, WM-E9, WM-E11)
        this.compilationService = builder.compilationAction != null
                ? new CompilationServiceImpl(builder.snapshotStore, eventBus, builder.compilationAction, 500L)
                : new CompilationServiceImpl(builder.snapshotStore, eventBus, this.projectService);

        // 5. ExecutionService (subscribes to WM-E2, WM-E4)
        this.executionService = new ExecutionServiceImpl(
                eventBus, builder.gracePeriod, builder.maxActiveProcesses);

        // 6. WorkspaceTraceLogger (subscribes to ALL event kinds with BEST_EFFORT)
        this.traceLogger = new WorkspaceTraceLogger(eventBus);

    }

    public static Builder builder() {
        return new Builder();
    }

    public ChangeBuffer changeBuffer() {
        return changeBuffer;
    }

    public ChangeApplier changeApplier() {
        return changeApplier;
    }

    public HeapPressureMonitor heapPressureMonitor() {
        return heapPressureMonitor;
    }

    public ProjectServiceImpl projectService() {
        return projectService;
    }

    public CompilationServiceImpl compilationService() {
        return compilationService;
    }

    public ExecutionServiceImpl executionService() {
        return executionService;
    }

    public WorkspaceTraceLogger traceLogger() {
        return traceLogger;
    }

    public DualSnapshotStore snapshotStore() {
        return snapshotStore;
    }

    /**
     * Shuts down every owned resource regardless of earlier failures.
     * <p>
     * Each shutdown action is wrapped in its own try/catch so that a throw from one
     * (e.g. {@code heapPressureMonitor.stop()} or {@code compilationService.close()}) never
     * aborts the remaining shutdowns — orphaning executors, project state, or event-bus
     * subscriptions. If more than one action fails, the first failure is rethrown with the
     * rest attached as suppressed exceptions, rather than only the first one winning.
     * <p>
     * Shutdown order is preserved (heap monitor → trace logger → compilation → execution →
     * project → event bus); only the short-circuit behaviour changes.
     */
    @Override
    public void close() throws Exception {
        List<Throwable> failures = new ArrayList<>();
        runShutdown(heapPressureMonitor::stop, failures);
        runShutdown(traceLogger::close, failures);
        runShutdown(compilationService::close, failures);
        runShutdown(executionService::shutdown, failures);
        runShutdown(projectService::shutdown, failures);
        runShutdown(eventBus::close, failures);
        rethrowAggregated(failures);
    }

    /**
     * Runs a single shutdown action, recording (not short-circuiting on) any thrown failure.
     *
     * @param action   shutdown action ({@code stop()}, {@code close()}, or {@code shutdown()})
     * @param failures accumulator for thrown exceptions
     */
    private static void runShutdown(AutoCloseable action, List<Throwable> failures) {
        try {
            action.close();
        } catch (Throwable t) {
            failures.add(t);
        }
    }

    /**
     * Rethrows the first collected failure with any additional failures attached as
     * suppressed exceptions; does nothing if every shutdown action succeeded.
     */
    private static void rethrowAggregated(List<Throwable> failures) throws Exception {
        if (failures.isEmpty()) {
            return;
        }
        Throwable primary = failures.get(0);
        for (int i = 1; i < failures.size(); i++) {
            primary.addSuppressed(failures.get(i));
        }
        if (primary instanceof Exception) {
            throw (Exception) primary;
        }
        if (primary instanceof Error) {
            throw (Error) primary;
        }
        throw new Exception(primary);
    }

    /**
     * Builder for constructing a fully-wired configuration.
     */
    public static final class Builder {

        private EventSyncPubSubHolder eventBus;
        private DualSnapshotStore snapshotStore;
        private ProjectLoader projectLoader;
        private Duration gracePeriod;
        private int maxActiveProcesses = 5;
        private long heapPressurePollIntervalMs = 5000L;
        private CompilationPipeline.CompilationAction compilationAction;

        public Builder eventBus(@Nonnull EventSyncPubSubHolder eventBus) {
            this.eventBus = eventBus;
            return this;
        }

        public Builder snapshotStore(@Nonnull DualSnapshotStore snapshotStore) {
            this.snapshotStore = snapshotStore;
            return this;
        }

        public Builder projectLoader(@Nonnull ProjectLoader projectLoader) {
            this.projectLoader = projectLoader;
            return this;
        }

        public Builder gracePeriod(@Nonnull Duration gracePeriod) {
            this.gracePeriod = gracePeriod;
            return this;
        }

        public Builder maxActiveProcesses(int maxActiveProcesses) {
            this.maxActiveProcesses = maxActiveProcesses;
            return this;
        }

        public Builder heapPressurePollIntervalMs(long heapPressurePollIntervalMs) {
            this.heapPressurePollIntervalMs = heapPressurePollIntervalMs;
            return this;
        }

        /**
         * Overrides the compilation action with a test double; intended for unit tests only.
         *
         * @param compilationAction test-specific compilation strategy
         * @return this builder
         */
        public Builder compilationAction(CompilationPipeline.CompilationAction compilationAction) {
            this.compilationAction = compilationAction;
            return this;
        }

        public WiringConfiguration build() {
            if (eventBus == null || snapshotStore == null || projectLoader == null || gracePeriod == null) {
                throw new IllegalStateException("eventBus, snapshotStore, projectLoader, and gracePeriod are required");
            }
            return new WiringConfiguration(this);
        }
    }
}
