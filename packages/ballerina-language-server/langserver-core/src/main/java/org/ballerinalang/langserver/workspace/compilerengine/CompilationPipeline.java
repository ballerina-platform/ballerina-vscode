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

package org.ballerinalang.langserver.workspace.compilerengine;

import io.ballerina.projects.PackageDescriptor;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.CancellationToken;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.ResolutionResult;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.InProgressSnapshot;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.observability.DiagnosticLog;
import org.ballerinalang.langserver.workspace.observability.LogLevel;
import org.ballerinalang.langserver.workspace.observability.NoOpDiagnosticLog;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;

import java.net.URI;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import javax.annotation.Nonnull;

/**
 * Per-project compilation orchestrator with debounce, LIFO cancellation, and event emission.
 *
 * @since 1.7.0
 */
public class CompilationPipeline implements AutoCloseable {
    private static final long DEBOUNCE_MILLIS = 150;
    private static final long PERMIT_ACQUIRE_TIMEOUT_SECONDS = 30;
    private static final String SOURCE = "CompilationPipeline";

    /**
     * Strategy for performing the actual compilation work.
     */
    public interface CompilationAction {

        default ResolutionResult resolve(CompileTask task) throws Exception {
            return new ResolutionResult(task.descriptor(), List.of(), true);
        }

        StableSnapshot compile(CompileTask task) throws Exception;

        /**
         * Returns the package descriptor for the given source root path. Called once at pipeline creation time to
         * establish the PackageDescriptor index.
         *
         * @param sourceRootIdentifier the source root path
         * @return the package descriptor for the project at this path
         */
        default PackageDescriptor describe(String sourceRootIdentifier) throws Exception {
            throw new UnsupportedOperationException("describe() must be implemented");
        }
    }

    private final CompilationKey key;
    private final String descriptorName;
    private final URI sourceRootUri;
    private final DualSnapshotStore snapshotStore;
    private final EventSyncPubSubHolder eventBus;
    private final CompilationAction compilationAction;
    private final DiagnosticLog diagnosticLog;
    private final Semaphore compilationPermits;
    private final ScheduledExecutorService debounceScheduler;
    private final ExecutorService compilationWorker;
    private final AtomicReference<ScheduledFuture<?>> pendingDebounce;
    private final AtomicReference<InProgressSnapshot> pendingBridgeSnapshot;
    private final AtomicReference<CompileTask> inflightTask;
    private final AtomicReference<ContentVersion> latestRequestedVersion;
    private final AtomicReference<Thread> activeWorkerThread;
    private final AtomicBoolean closed;

    /**
     * Creates a compilation pipeline for the given compilation key.
     *
     * @param key               the compound key (source root + package descriptor)
     * @param snapshotStore     store to publish snapshots into
     * @param eventBus          event bus for domain event emission
     * @param compilationAction the actual compilation strategy
     */
    public CompilationPipeline(@Nonnull CompilationKey key, @Nonnull DualSnapshotStore snapshotStore,
                               @Nonnull EventSyncPubSubHolder eventBus,
                               @Nonnull CompilationAction compilationAction) {
        this(key, snapshotStore, eventBus, compilationAction, new Semaphore(Integer.MAX_VALUE, false));
    }

    /**
     * Creates a compilation pipeline with a shared semaphore for cross-pipeline concurrency limiting.
     *
     * <p>Pipelines sharing the same semaphore will collectively honour its permit count; at most
     * {@code compilationPermits.availablePermits()} compilations run simultaneously across the group.
     *
     * @param key                the compound key (source root + package descriptor)
     * @param snapshotStore      store to publish snapshots into
     * @param eventBus           event bus for domain event emission
     * @param compilationAction  the actual compilation strategy
     * @param compilationPermits shared semaphore controlling the maximum concurrent compilations
     */
    public CompilationPipeline(@Nonnull CompilationKey key, @Nonnull DualSnapshotStore snapshotStore,
                               @Nonnull EventSyncPubSubHolder eventBus,
                               @Nonnull CompilationAction compilationAction,
                               @Nonnull Semaphore compilationPermits) {
        this(key, snapshotStore, eventBus, compilationAction, compilationPermits, NoOpDiagnosticLog.INSTANCE);
    }

    /**
     * Creates a compilation pipeline with the given diagnostic log.
     *
     * @param key               the compound key (source root + package descriptor)
     * @param snapshotStore     store to publish snapshots into
     * @param eventBus          event bus for domain event emission
     * @param compilationAction the actual compilation strategy
     * @param diagnosticLog     diagnostic log for compilation diagnostics
     */
    public CompilationPipeline(@Nonnull CompilationKey key, @Nonnull DualSnapshotStore snapshotStore,
                               @Nonnull EventSyncPubSubHolder eventBus,
                               @Nonnull CompilationAction compilationAction,
                               @Nonnull DiagnosticLog diagnosticLog) {
        this(key, snapshotStore, eventBus, compilationAction, new Semaphore(Integer.MAX_VALUE, false), diagnosticLog);
    }

    /**
     * Creates a compilation pipeline with a shared semaphore and diagnostic log.
     *
     * @param key                the compound key (source root + package descriptor)
     * @param snapshotStore      store to publish snapshots into
     * @param eventBus           event bus for domain event emission
     * @param compilationAction  the actual compilation strategy
     * @param compilationPermits shared semaphore controlling the maximum concurrent compilations
     * @param diagnosticLog      diagnostic log for compilation diagnostics
     */
    public CompilationPipeline(@Nonnull CompilationKey key, @Nonnull DualSnapshotStore snapshotStore,
                               @Nonnull EventSyncPubSubHolder eventBus,
                               @Nonnull CompilationAction compilationAction,
                               @Nonnull Semaphore compilationPermits,
                               @Nonnull DiagnosticLog diagnosticLog) {
        this.key = key;
        this.descriptorName = descriptorName(key.descriptor());
        this.snapshotStore = snapshotStore;
        this.eventBus = eventBus;
        this.compilationAction = compilationAction;
        this.diagnosticLog = diagnosticLog;
        this.compilationPermits = compilationPermits;
        this.sourceRootUri = parseSourceRootUri(key.sourceRoot());

        this.debounceScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "compile-debounce-" + descriptorName);
            t.setDaemon(true);
            return t;
        });
        this.compilationWorker = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "compile-worker-" + descriptorName);
            t.setDaemon(true);
            return t;
        });
        this.pendingDebounce = new AtomicReference<>();
        this.pendingBridgeSnapshot = new AtomicReference<>();
        this.inflightTask = new AtomicReference<>();
        this.latestRequestedVersion = new AtomicReference<>();
        this.activeWorkerThread = new AtomicReference<>();
        this.closed = new AtomicBoolean(false);
    }

    /**
     * Requests compilation for the given content version. Debounces at 150ms.
     *
     * @param contentVersion the version to compile
     */
    public void requestCompilation(@Nonnull ContentVersion contentVersion) {
        if (closed.get()) {
            return;
        }

        // Fast-path: if we already compiled a version >= this one, ignore the request.
        // This prevents the async EventBus from triggering redundant debounces after forceCompilation().
        StableSnapshot stable = snapshotStore.getStable(key);
        if (stable != null && stable.contentVersion().compareTo(contentVersion) >= 0) {
            return;
        }

        latestRequestedVersion.set(contentVersion);

        // Bridge the debounce gap: ensure waiting threads have a Future to block on immediately
        if (snapshotStore.getInProgress(key) == null) {
            pendingBridgeSnapshot.set(snapshotStore.startCompilation(key));
        }

        ScheduledFuture<?> prev = pendingDebounce.getAndSet(
                debounceScheduler.schedule(() -> submitCompilation(contentVersion), DEBOUNCE_MILLIS,
                        TimeUnit.MILLISECONDS));
        if (prev != null) {
            prev.cancel(false);
        }
    }

    /**
     * Forces any pending debounced compilation to start immediately.
     * Called when a synchronous API (e.g. semantic model) is waiting for the result.
     */
    public void forceCompilation() {
        if (closed.get()) {
            return;
        }
        ScheduledFuture<?> prev = pendingDebounce.getAndSet(null);
        if (prev != null) {
            prev.cancel(false);
            ContentVersion latest = latestRequestedVersion.get();
            if (latest != null) {
                compilationWorker.execute(() -> submitCompilation(latest));
            }
        }
    }

    /**
     * Returns the compilation key (source root + package descriptor) for this pipeline.
     *
     * @return compilation key
     */
    public CompilationKey key() {
        return key;
    }

    /**
     * Returns the package descriptor this pipeline manages.
     *
     * @return package descriptor
     */
    public PackageDescriptor descriptor() {
        return key.descriptor();
    }

    /**
     * Returns whether a compilation is currently in flight.
     *
     * @return {@code true} if compiling
     */
    public boolean isCompiling() {
        return inflightTask.get() != null;
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        ScheduledFuture<?> pending = pendingDebounce.getAndSet(null);
        if (pending != null) {
            pending.cancel(false);
        }
        pendingBridgeSnapshot.set(null);
        CompileTask inflight = inflightTask.get();
        if (inflight != null) {
            inflight.cancel();
        }
        snapshotStore.cancelInProgress(key);
        debounceScheduler.shutdownNow();
        compilationWorker.shutdownNow();
    }

    private void submitCompilation(ContentVersion contentVersion) {
        if (closed.get()) {
            return;
        }
        // LIFO: cancel inflight task and interrupt worker thread (ADR-018 Mandate 8)
        CompileTask previous = inflightTask.get();
        if (previous != null) {
            previous.cancel();
            Thread workerThread = activeWorkerThread.get();
            if (workerThread != null) {
                workerThread.interrupt();
            }
        }

        // Staleness check: use latestRequestedVersion, not the debounced version
        ContentVersion latest = latestRequestedVersion.get();
        if (latest != null && latest.compareTo(contentVersion) > 0) {
            return;
        }

        CancellationToken token = new CancellationToken();
        CompileTask task = new CompileTask(key.descriptor(), key.sourceRoot(), contentVersion, token);
        InProgressSnapshot inProgressSnapshot = inProgressSnapshotForTask();
        inflightTask.set(task);

        compilationWorker.execute(() -> executeCompilation(task, inProgressSnapshot));
    }

    private InProgressSnapshot inProgressSnapshotForTask() {
        InProgressSnapshot bridge = pendingBridgeSnapshot.getAndSet(null);
        if (bridge != null && snapshotStore.getInProgress(key) == bridge) {
            return bridge;
        }
        return snapshotStore.startCompilation(key);
    }

    private void executeCompilation(CompileTask task, InProgressSnapshot inProgressSnapshot) {
        activeWorkerThread.set(Thread.currentThread());
        clearStaleInterrupt(task);
        boolean published = false;
        boolean permitAcquired = false;
        try {
            permitAcquired = compilationPermits.tryAcquire(PERMIT_ACQUIRE_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!permitAcquired) {
                diagnosticLog.log(LogLevel.WARN, SOURCE, "Timed out waiting for compilation permit for "
                        + descriptorName);
                emitEvent(EventKind.COMPILER_COMPILATION_FAILED);
                return;
            }
            // Re-check cancellation — task may have been superseded while waiting for a permit
            if (task.isCancelled()) {
                emitEvent(EventKind.COMPILER_COMPILATION_CANCELLED);
                return;
            }

            ResolutionResult resolutionResult = compilationAction.resolve(task);
            if (!resolutionResult.success()) {
                emitEvent(EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY);
                return;
            }

            StableSnapshot snapshot = compilationAction.compile(task);

            // Publication guard: discard result if cancelled or pipeline closed
            if (task.isCancelled() || closed.get()) {
                emitEvent(EventKind.COMPILER_COMPILATION_CANCELLED);
                return;
            }

            // Staleness guard before publish
            ContentVersion latest = latestRequestedVersion.get();
            if (latest != null && latest.compareTo(task.contentVersion()) > 0) {
                emitEvent(EventKind.COMPILER_COMPILATION_CANCELLED);
                return;
            }

            emitEvent(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY);
            // Final closed check — prevent orphaned snapshot publication after pipeline eviction.
            if (closed.get()) {
                emitEvent(EventKind.COMPILER_COMPILATION_CANCELLED);
                return;
            }
            snapshotStore.publishStable(key, snapshot, inProgressSnapshot);
            published = true;
            emitEvent(EventKind.COMPILER_SNAPSHOT_PUBLISHED);
        } catch (CancellationException e) {
            emitEvent(EventKind.COMPILER_COMPILATION_CANCELLED);
        } catch (InterruptedException e) {
            emitEvent(EventKind.COMPILER_COMPILATION_CANCELLED);
        } catch (Exception e) {
            diagnosticLog.log(LogLevel.WARN, SOURCE, "Compilation failed for " + descriptorName, e);
            emitEvent(EventKind.COMPILER_COMPILATION_FAILED);
        } finally {
            if (permitAcquired) {
                compilationPermits.release();
            }
            if (!published && snapshotStore.getInProgress(key) == inProgressSnapshot) {
                snapshotStore.cancelInProgress(key);
            }
            activeWorkerThread.compareAndSet(Thread.currentThread(), null);
            inflightTask.compareAndSet(task, null);
            // Clear interrupt flag so the worker thread can pick up the next task
            Thread.interrupted();
            // If a newer version is pending, submit it immediately (skip debounce)
            scheduleLatestIfPending(task.contentVersion());
        }
    }

    private void clearStaleInterrupt(CompileTask task) {
        if (!task.isCancelled() && Thread.currentThread().isInterrupted()) {
            Thread.interrupted();
        }
    }

    private void scheduleLatestIfPending(ContentVersion completedVersion) {
        if (closed.get()) {
            return;
        }
        ContentVersion latest = latestRequestedVersion.get();
        if (latest != null && latest.compareTo(completedVersion) > 0 && inflightTask.get() == null) {
            compilationWorker.execute(() -> {
                // Re-check to avoid duplicate work if debounce already fired
                if (!closed.get() && inflightTask.get() == null) {
                    submitCompilation(latest);
                }
            });
        }
    }

    private void emitEvent(EventKind kind) {
        if (closed.get()) {
            return;
        }
        boolean interrupted = Thread.interrupted();
        try {
            eventBus.publish(new CompilerEvent(kind, sourceRootUri, descriptorName));
        } catch (Exception e) {
            diagnosticLog.log(LogLevel.WARN, SOURCE, "Failed to emit event " + kind + " for " + descriptorName, e);
        } finally {
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private URI parseSourceRootUri(String sourceRootIdentifier) {
        if (sourceRootIdentifier == null || sourceRootIdentifier.isBlank()) {
            return null;
        }
        try {
            String trimmed = sourceRootIdentifier.trim();
            if (trimmed.startsWith("file:") || trimmed.startsWith("http:") || trimmed.startsWith("https:")) {
                return URI.create(trimmed);
            }
            return URI.create("file://" + trimmed);
        } catch (IllegalArgumentException e) {
            diagnosticLog.log(LogLevel.DEBUG, SOURCE, "Could not parse sourceRootIdentifier as URI: "
                    + sourceRootIdentifier);
            return null;
        }
    }

    private static String descriptorName(PackageDescriptor descriptor) {
        if (descriptor != null && descriptor.name() != null && descriptor.name().value() != null
                && !descriptor.name().value().isBlank()) {
            return descriptor.name().value();
        }
        return "unknown-package";
    }
}
