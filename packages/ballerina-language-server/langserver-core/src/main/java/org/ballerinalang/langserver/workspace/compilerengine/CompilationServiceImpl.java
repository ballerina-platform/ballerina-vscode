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
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.commons.CompilerCompilationGuard;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.FailureClass;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.ResolutionResult;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.InProgressSnapshot;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.SnapshotView;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.workspacemanager.LockingMode;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.net.URI;
import java.nio.file.Path;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.logging.Level;
import java.util.logging.Logger;

import javax.annotation.Nonnull;

/**
 * Service entry point for the compilation engine, managing per-project pipelines and circuit breaker.
 *
 * <p>Handles stable snapshot queries and manages the lifecycle of per-project
 * CompilationPipeline instances in response to workspace and document events.
 * Implements a circuit breaker pattern per ADR-033 to prevent recovery loops on transient failures.
 *
 * @since 1.7.0
 */
public class CompilationServiceImpl implements CompilationService, AutoCloseable {
    private static final Logger LOG = Logger.getLogger(CompilationServiceImpl.class.getName());
    private static final int INITIAL_REQUEST_VERSION = 1;

    private final DualSnapshotStore snapshotStore;
    private final EventSyncPubSubHolder eventBus;
    private final CompilationPipeline.CompilationAction baseAction;
    private final long retryDelayMs;
    private final long heapPressureThrottleMs;
    private final Semaphore compilationPermits;
    private final ScheduledExecutorService retryScheduler;
    private final Map<CompilationKey, CompilationPipeline> pipelines;
    private final Map<CompilationKey, CircuitBreakerAction> circuitActions;
    private final Map<CompilationKey, ScheduledFuture<?>> throttledRequests;
    private final Map<String, Set<CompilationKey>> sourceRootIndex;
    private final AtomicInteger versionCounter;
    private final AtomicLong throttledUntilNanos;
    private final AtomicBoolean closed;

    /**
     * Creates a compilation service with default retry delay (500ms).
     *
     * @param snapshotStore snapshot store for publishing compiled snapshots
     * @param eventBus event bus for publishing/subscribing to domain events
     * @param projectService the project service
     */
    public CompilationServiceImpl(DualSnapshotStore snapshotStore, EventSyncPubSubHolder eventBus,
                                  ProjectServiceImpl projectService) {
        this(snapshotStore, eventBus, projectService, 500L, 250L);
    }

    /**
     * Creates a compilation service with configurable retry delay.
     *
     * @param snapshotStore snapshot store for publishing compiled snapshots
     * @param eventBus event bus for publishing/subscribing to domain events
     * @param projectService the project service
     * @param retryDelayMs delay in milliseconds before retrying a transient failure
     */
    public CompilationServiceImpl(DualSnapshotStore snapshotStore, EventSyncPubSubHolder eventBus,
                                  ProjectServiceImpl projectService, long retryDelayMs) {
        this(snapshotStore, eventBus, projectService, retryDelayMs, 250L);
    }

    /**
     * Creates a compilation service with configurable retry delay and RM-E1 throttle window.
     *
     * @param snapshotStore snapshot store for publishing compiled snapshots
     * @param eventBus event bus for publishing/subscribing to domain events
     * @param projectService the project service
     * @param retryDelayMs delay in milliseconds before retrying a transient failure
     * @param heapPressureThrottleMs delay in milliseconds to defer document-triggered recompilation after RM-E1
     */
    public CompilationServiceImpl(@Nonnull DualSnapshotStore snapshotStore, @Nonnull EventSyncPubSubHolder eventBus,
                                  @Nonnull ProjectServiceImpl projectService, long retryDelayMs,
                                  long heapPressureThrottleMs) {
        this(snapshotStore, eventBus, projectService, retryDelayMs, heapPressureThrottleMs,
                Runtime.getRuntime().availableProcessors());
    }

    /**
     * Creates a compilation service with configurable retry delay, RM-E1 throttle window, and concurrency limit.
     *
     * @param snapshotStore              snapshot store for publishing compiled snapshots
     * @param eventBus                   event bus for publishing/subscribing to domain events
     * @param projectService             the project service
     * @param retryDelayMs               delay in milliseconds before retrying a transient failure
     * @param heapPressureThrottleMs     delay in milliseconds to defer recompilation after RM-E1
     * @param maxConcurrentCompilations  maximum number of concurrent compilations across all pipelines; must be >= 1
     */
    public CompilationServiceImpl(@Nonnull DualSnapshotStore snapshotStore, @Nonnull EventSyncPubSubHolder eventBus,
                                  @Nonnull ProjectServiceImpl projectService, long retryDelayMs,
                                  long heapPressureThrottleMs, int maxConcurrentCompilations) {
        this(snapshotStore, eventBus, new CompilationActionImpl(projectService), retryDelayMs,
                heapPressureThrottleMs, buildSemaphore(maxConcurrentCompilations), projectService);
    }

    /**
     * Test constructor: uses a custom compilation action with default retry settings.
     *
     * @param snapshotStore     snapshot store for publishing compiled snapshots
     * @param eventBus          event bus for publishing/subscribing to domain events
     * @param compilationAction the compilation strategy (typically a test double)
     * @param retryDelayMs      delay in milliseconds before retrying a transient failure
     */
    public CompilationServiceImpl(@Nonnull DualSnapshotStore snapshotStore, @Nonnull EventSyncPubSubHolder eventBus,
                                  @Nonnull CompilationPipeline.CompilationAction compilationAction,
                                  long retryDelayMs) {
        this(snapshotStore, eventBus, compilationAction, retryDelayMs, 250L);
    }

    /**
     * Test constructor: uses a custom compilation action with explicit retry and throttle settings.
     *
     * @param snapshotStore          snapshot store for publishing compiled snapshots
     * @param eventBus               event bus for publishing/subscribing to domain events
     * @param compilationAction      the compilation strategy (typically a test double)
     * @param retryDelayMs           delay in milliseconds before retrying a transient failure
     * @param heapPressureThrottleMs delay in milliseconds to defer recompilation after RM-E1
     */
    public CompilationServiceImpl(@Nonnull DualSnapshotStore snapshotStore, @Nonnull EventSyncPubSubHolder eventBus,
                                  @Nonnull CompilationPipeline.CompilationAction compilationAction,
                                  long retryDelayMs, long heapPressureThrottleMs) {
        this(snapshotStore, eventBus, compilationAction, retryDelayMs, heapPressureThrottleMs,
                new Semaphore(Integer.MAX_VALUE, false), null);
    }

    /**
     * Test constructor: uses a custom compilation action with explicit retry, throttle, and concurrency limit.
     *
     * @param snapshotStore              snapshot store for publishing compiled snapshots
     * @param eventBus                   event bus for publishing/subscribing to domain events
     * @param compilationAction          the compilation strategy (typically a test double)
     * @param retryDelayMs               delay in milliseconds before retrying a transient failure
     * @param heapPressureThrottleMs     delay in milliseconds to defer recompilation after RM-E1
     * @param maxConcurrentCompilations  maximum number of concurrent compilations across all pipelines; must be >= 1
     */
    public CompilationServiceImpl(@Nonnull DualSnapshotStore snapshotStore, @Nonnull EventSyncPubSubHolder eventBus,
                                  @Nonnull CompilationPipeline.CompilationAction compilationAction,
                                  long retryDelayMs, long heapPressureThrottleMs, int maxConcurrentCompilations) {
        this(snapshotStore, eventBus, compilationAction, retryDelayMs, heapPressureThrottleMs,
                buildSemaphore(maxConcurrentCompilations), null);
    }

    /**
     * Primary constructor: all public constructors delegate to this one.
     */
    private CompilationServiceImpl(DualSnapshotStore snapshotStore, EventSyncPubSubHolder eventBus,
                                   CompilationPipeline.CompilationAction compilationAction, long retryDelayMs,
                                   long heapPressureThrottleMs, Semaphore compilationPermits,
                                   ProjectServiceImpl projectService) {
        this.snapshotStore = snapshotStore;
        this.eventBus = eventBus;
        this.baseAction = compilationAction;
        this.retryDelayMs = retryDelayMs;
        this.heapPressureThrottleMs = heapPressureThrottleMs;
        this.compilationPermits = compilationPermits;
        this.pipelines = new ConcurrentHashMap<>();
        this.circuitActions = new ConcurrentHashMap<>();
        this.throttledRequests = new ConcurrentHashMap<>();
        this.sourceRootIndex = new ConcurrentHashMap<>();
        this.versionCounter = new AtomicInteger(INITIAL_REQUEST_VERSION);
        this.throttledUntilNanos = new AtomicLong(0L);
        this.closed = new AtomicBoolean(false);
        this.retryScheduler = Executors.newScheduledThreadPool(1, r -> {
            Thread t = new Thread(r, "ce-retry-scheduler");
            t.setDaemon(true);
            return t;
        });

        // Register LRU eviction listener: when a stable snapshot is evicted from the
        // store, also evict the corresponding project from ProjectService so the shared
        // PackageCompilation reference becomes eligible for GC.
        if (projectService != null) {
            snapshotStore.setEvictionListener(evictedKey -> {
                try {
                    Path path = projectService.resolvePathFromIdentifier(evictedKey.sourceRoot());
                    projectService.evictProject(path);
                } catch (Exception e) {
                    LOG.fine(() -> "Failed to evict project for LRU-evicted snapshot: "
                            + evictedKey.sourceRoot() + " - " + e.getMessage());
                }
            });
        }

        subscribeToEvents();
    }

    @Override
    public StableSnapshot stableSnapshot(@Nonnull Project project, @Nonnull PackageDescriptor descriptor,
                                         CancelChecker cancelChecker) {
        CompilationKey key = keyOf(project, descriptor);
        while (true) {
            if (cancelChecker != null) {
                cancelChecker.checkCanceled();
            }
            InProgressSnapshot inProgress = snapshotStore.getInProgress(key);
            if (inProgress instanceof DualSnapshotStore.StoreInProgressSnapshot storeInProgress) {
                CompilationPipeline pipeline = pipelines.get(key);
                if (pipeline != null) {
                    pipeline.forceCompilation();
                }
                AwaitPublishedResult awaited = awaitPublished(key, storeInProgress, cancelChecker);
                if (awaited.snapshot() != null) {
                    return awaited.snapshot();
                }
                if (awaited.retryable() && !hasSettledWithoutProgress(key)) {
                    continue;
                }
                return null;
            }
            StableSnapshot stable = snapshotStore.getStable(key);
            if (stable != null) {
                return stable;
            }
            if (!pipelines.containsKey(key)) {
                if (!awaitOrBootstrapPipeline(key, project, cancelChecker)) {
                    return null;
                }
                continue;
            }
            // Pipeline exists but no stable/inProgress snapshot yet — the event bus
            // hasn't delivered WORKSPACE_PROJECT_UPDATED to trigger compilation.
            // Kick compilation directly rather than sleeping.
            CompilationPipeline existingPipeline = pipelines.get(key);
            if (existingPipeline != null) {
                requestCompilation(existingPipeline);
                continue;
            }
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
    }

    /**
     * Waits briefly for async event delivery to register the pipeline, then bootstraps it directly if needed.
     *
     * @param key compilation key for the requested package
     * @param project project owning the compilation request
     * @param cancelChecker cancellation checker for the waiting thread
     * @return true if the pipeline exists after waiting or bootstrapping, false if interrupted or closed
     */
    private boolean awaitOrBootstrapPipeline(CompilationKey key, Project project, CancelChecker cancelChecker) {
        if (closed.get()) {
            return false;
        }
        createPipelineIfAbsent(project.sourceRoot().toAbsolutePath().normalize().toString());
        return pipelines.containsKey(key);
    }

    @Override
    public SnapshotView latestSnapshot(@Nonnull Project project, @Nonnull PackageDescriptor descriptor,
                                       CancelChecker cancelChecker) {
        CompilationKey key = keyOf(project, descriptor);
        InProgressSnapshot inProgressSnapshot = snapshotStore.getInProgress(key);
        if (inProgressSnapshot != null) {
            return inProgressSnapshot;
        }
        return snapshotStore.getStable(key);
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        pipelines.values().forEach(CompilationPipeline::close);
        pipelines.keySet().forEach(snapshotStore::remove);
        throttledRequests.values().forEach(future -> future.cancel(false));
        pipelines.clear();
        circuitActions.clear();
        throttledRequests.clear();
        sourceRootIndex.clear();
        retryScheduler.shutdownNow();
    }

    // ---- Private Methods ----

    private void subscribeToEvents() {
        eventBus.subscribe("ce-control-events", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED,
                       EventKind.WORKSPACE_PROJECT_EVICTED,
                       EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED,
                       EventKind.WORKSPACE_PROJECT_UPDATED,
                       EventKind.RM_E1_HEAP_PRESSURE_DETECTED),
                this::handleControlEvent);
    }

    private void handleControlEvent(DomainEvent event) {
        if (event.eventKind() == EventKind.RM_E1_HEAP_PRESSURE_DETECTED) {
            handleHeapPressureEvent(event);
            return;
        }
        handleWorkspaceEvent(event);
    }

    private void handleWorkspaceEvent(DomainEvent event) {
        String sourceRootIdentifier = sourceRootIdentifier(event);
        if (sourceRootIdentifier == null) {
            return;
        }

        switch (event.eventKind()) {
            case WORKSPACE_PROJECT_REGISTERED -> createPipelineIfAbsent(sourceRootIdentifier);
            case WORKSPACE_PROJECT_EVICTED -> evictPipeline(sourceRootIdentifier);
            case WORKSPACE_PROJECT_KIND_TRANSITIONED -> {
                evictPipeline(sourceRootIdentifier);
                createPipelineIfAbsent(sourceRootIdentifier);
            }
            case WORKSPACE_PROJECT_UPDATED -> handleProjectUpdated(event);
            default -> {
                // No-op for unexpected event kinds
            }
        }
    }

    private void handleProjectUpdated(DomainEvent event) {
        Set<CompilationKey> keys = resolveKeys(event);
        if (keys != null) {
            keys.forEach(this::requestCompilationWithThrottle);
        }
    }

    private void handleHeapPressureEvent(DomainEvent event) {
        if (!(event instanceof HeapPressureEvent hpe)) {
            return;
        }
        switch (hpe.pressureLevel()) {
            case WARNING -> {
                if (heapPressureThrottleMs > 0) {
                    throttledUntilNanos.set(
                            System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(heapPressureThrottleMs));
                }
            }
            case CRITICAL -> {
                if (heapPressureThrottleMs > 0) {
                    throttledUntilNanos.set(
                            System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(heapPressureThrottleMs));
                }
                evictCircuitOpenSnapshots();
            }
            case EMERGENCY -> {
                if (heapPressureThrottleMs > 0) {
                    throttledUntilNanos.set(
                            System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(heapPressureThrottleMs));
                }
                evictAllStableSnapshots();
            }
            case NORMAL -> throttledUntilNanos.set(0L);
        }
    }

    /**
     * Releases stable snapshots for pipelines whose circuit breaker is open, freeing
     * the symbol graph memory held by stale compilations that cannot recover.
     */
    private void evictCircuitOpenSnapshots() {
        for (Map.Entry<CompilationKey, CircuitBreakerAction> entry : circuitActions.entrySet()) {
            if (entry.getValue().isOpen()) {
                snapshotStore.clearStable(entry.getKey());
                LOG.fine(() -> "Evicted stale snapshot for circuit-open pipeline: "
                        + descriptorName(entry.getKey().descriptor()));
            }
        }
    }

    /**
     * Releases ALL stable snapshots to reclaim symbol graph memory under emergency
     * heap pressure. Snapshots are recomputed on the next request via the compilation
     * pipeline, so this is safe — it trades latency for memory.
     */
    private void evictAllStableSnapshots() {
        int cleared = snapshotStore.clearAllStable();
        LOG.info(() -> "Emergency heap pressure: cleared " + cleared + " stable snapshots"
                + " (store size=" + snapshotStore.size() + ", pipelines=" + pipelines.size() + ")");
    }

    private void requestCompilationWithThrottle(CompilationKey key) {
        CompilationPipeline pipeline = pipelines.get(key);
        if (pipeline == null) {
            return;
        }

        long delayNanos = throttledUntilNanos.get() - System.nanoTime();
        if (delayNanos <= 0) {
            cancelThrottledRequest(key);
            requestCompilation(pipeline);
            return;
        }

        ScheduledFuture<?> existing = throttledRequests.remove(key);
        if (existing != null) {
            existing.cancel(false);
        }

        ScheduledFuture<?> scheduled = retryScheduler.schedule(() -> {
            throttledRequests.remove(key);
            CompilationPipeline activePipeline = pipelines.get(key);
            if (activePipeline != null && !closed.get()) {
                requestCompilation(activePipeline);
            }
        }, TimeUnit.NANOSECONDS.toMillis(delayNanos), TimeUnit.MILLISECONDS);
        throttledRequests.put(key, scheduled);
    }

    private void requestCompilation(CompilationPipeline pipeline) {
        ContentVersion nextVersion = nextContentVersion(pipeline.key());
        pipeline.requestCompilation(nextVersion);
    }

    private ContentVersion nextContentVersion(CompilationKey key) {
        return nextContentVersion(versionCounter, snapshotStore, key);
    }

    private static ContentVersion nextContentVersion(AtomicInteger versionCounter, DualSnapshotStore snapshotStore,
                                                     CompilationKey key) {
        StableSnapshot stableSnapshot = snapshotStore.getStable(key);
        int minimumVersion = stableSnapshot == null ? INITIAL_REQUEST_VERSION : stableSnapshot.contentVersion()
                .next()
                .value();
        int requestedVersion = versionCounter.getAndUpdate(currentVersion ->
                Math.max(incrementVersion(currentVersion), incrementVersion(minimumVersion)));
        return new ContentVersion(Math.max(requestedVersion, minimumVersion));
    }

    private static int incrementVersion(int version) {
        if (version == Integer.MAX_VALUE) {
            throw new IllegalStateException("content version overflow");
        }
        return version + 1;
    }

    private void cancelThrottledRequest(CompilationKey key) {
        ScheduledFuture<?> pendingRequest = throttledRequests.remove(key);
        if (pendingRequest != null) {
            pendingRequest.cancel(false);
        }
    }

    private void createPipelineIfAbsent(String sourceRootIdentifier) {
        // Guard: if a pipeline already exists for this source root, skip.
        // PackageDescriptor may use identity equality, so checking sourceRootIndex
        // (keyed by normalized path string) is the only reliable dedup check.
        if (sourceRootIndex.containsKey(sourceRootIdentifier)) {
            return;
        }
        PackageDescriptor descriptor;
        try {
            descriptor = baseAction.describe(sourceRootIdentifier);
        } catch (NoSuchElementException e) {
            LOG.fine(() -> "Skipping compilation pipeline for project without packages at " + sourceRootIdentifier);
            return;
        } catch (Exception e) {
            LOG.log(Level.WARNING, "Failed to describe project at " + sourceRootIdentifier, e);
            return;
        }
        CompilationKey key = new CompilationKey(sourceRootIdentifier, descriptor);
        if (pipelines.containsKey(key)) {
            return;
        }
        CircuitBreakerAction circuitAction = new CircuitBreakerAction(key, baseAction, snapshotStore, eventBus,
                pipelines, retryScheduler, versionCounter, retryDelayMs);
        CompilationPipeline pipeline = new CompilationPipeline(key, snapshotStore, eventBus,
                circuitAction, compilationPermits);
        CompilationPipeline existing = pipelines.putIfAbsent(key, pipeline);
        if (existing != null) {
            pipeline.close();
            return;
        }
        sourceRootIndex.computeIfAbsent(sourceRootIdentifier, k -> ConcurrentHashMap.newKeySet()).add(key);
        circuitActions.put(key, circuitAction);
        requestCompilation(pipeline);
    }

    private void evictPipeline(String sourceRootIdentifier) {
        // Evict the shared compiler-guard lock for this source root regardless of whether a
        // pipeline was ever created: the guard may have been used directly (WorkspaceRunService,
        // WorkspaceManagerFacadeImpl) without a pipeline being registered, and the lock map must
        // not retain entries for closed/evicted projects (WM-E2).
        CompilerCompilationGuard.evictProjectLock(Path.of(sourceRootIdentifier));
        Set<CompilationKey> keys = sourceRootIndex.remove(sourceRootIdentifier);
        if (keys == null) {
            return;
        }
        for (CompilationKey key : keys) {
            CompilationPipeline pipeline = pipelines.remove(key);
            circuitActions.remove(key);
            ScheduledFuture<?> pendingRequest = throttledRequests.remove(key);
            if (pendingRequest != null) {
                pendingRequest.cancel(false);
            }
            if (pipeline != null) {
                pipeline.close();
                snapshotStore.remove(key);
            }
        }
    }

    private AwaitPublishedResult awaitPublished(CompilationKey key,
                                                DualSnapshotStore.StoreInProgressSnapshot storeInProgress,
                                                CancelChecker cancelChecker) {
        while (true) {
            if (cancelChecker != null) {
                cancelChecker.checkCanceled();
            }
            try {
                StableSnapshot snapshot = storeInProgress.publishedStableSnapshot().get(10, TimeUnit.MILLISECONDS);
                return AwaitPublishedResult.published(snapshot);
            } catch (TimeoutException e) {
                // Keep waiting until the next stable snapshot is published.
            } catch (CancellationException e) {
                return AwaitPublishedResult.retryableCancellation();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return AwaitPublishedResult.terminalFailure();
            } catch (ExecutionException e) {
                return AwaitPublishedResult.terminalFailure();
            }
        }
    }

    /**
     * Determines whether a cancelled wait should stop retrying instead of re-fetching and re-awaiting
     * the current in-progress snapshot. A cancellation is only worth retrying while the pipeline can
     * still make forward progress: once its circuit breaker has opened (ADR-033 recovery exhausted) or
     * the key has been evicted (WM-E2), every future compile attempt for this key fails or is
     * unreachable, so retrying would busy-loop with no chance of ever observing a published result.
     *
     * @param key the compilation key whose retry eligibility is being checked
     * @return {@code true} if retrying is futile and the caller should return {@code null} instead
     */
    private boolean hasSettledWithoutProgress(CompilationKey key) {
        if (!pipelines.containsKey(key)) {
            return true;
        }
        CircuitBreakerAction circuitAction = circuitActions.get(key);
        return circuitAction != null && circuitAction.isOpen();
    }

    private record AwaitPublishedResult(StableSnapshot snapshot, boolean retryable) {
        private static AwaitPublishedResult published(StableSnapshot snapshot) {
            return new AwaitPublishedResult(snapshot, false);
        }

        private static AwaitPublishedResult retryableCancellation() {
            return new AwaitPublishedResult(null, true);
        }

        private static AwaitPublishedResult terminalFailure() {
            return new AwaitPublishedResult(null, false);
        }
    }

    private Set<CompilationKey> resolveKeys(DomainEvent event) {
        String sourceRootIdentifier = sourceRootIdentifier(event);
        return sourceRootIdentifier == null ? null : sourceRootIndex.get(sourceRootIdentifier);
    }

    private CompilationKey keyOf(Project project, PackageDescriptor descriptor) {
        String sourceRoot = project.sourceRoot().toAbsolutePath().normalize().toString();
        return new CompilationKey(sourceRoot, descriptor);
    }

    private String sourceRootIdentifier(DomainEvent event) {
        URI uri = switch (event) {
            case ProjectEvent pe    -> pe.sourceRoot();
            case CompilerEvent ce   -> ce.sourceRoot();
            default                 -> null;
        };
        return uri == null ? null : UriResolver.pathOf(uri);
    }

    private static Semaphore buildSemaphore(int maxConcurrentCompilations) {
        if (maxConcurrentCompilations < 1) {
            throw new IllegalArgumentException(
                    "maxConcurrentCompilations must be >= 1, got: " + maxConcurrentCompilations);
        }
        return new Semaphore(maxConcurrentCompilations, true);
    }

    private static String descriptorName(PackageDescriptor descriptor) {
        if (descriptor != null && descriptor.name() != null && descriptor.name().value() != null
                && !descriptor.name().value().isBlank()) {
            return descriptor.name().value();
        }
        return "unknown-package";
    }

    // ---- Inner Class: CircuitBreakerAction ----

    /**
     * Wraps the base compilation action with retry/circuit-breaker logic.
     *
     * <p>Static inner class to avoid retaining the enclosing {@code CompilationServiceImpl}
     * via an implicit {@code this$0} reference. All required collaborators are passed explicitly
     * so that a leaked pipeline reference does not pin the entire service and its maps.
     *
     * <p>Classifies failures into TRANSIENT (retryable), PERSISTENT (user fix required),
     * and FATAL (compiler bug). Retries once on TRANSIENT; opens circuit and emits
     * CE-E6 (recovery exhausted) otherwise.
     */
    private static class CircuitBreakerAction implements CompilationPipeline.CompilationAction {

        private final CompilationKey key;
        private final CompilationPipeline.CompilationAction baseAction;
        private final DualSnapshotStore snapshotStore;
        private final EventSyncPubSubHolder eventBus;
        private final Map<CompilationKey, CompilationPipeline> pipelines;
        private final ScheduledExecutorService retryScheduler;
        private final AtomicInteger versionCounter;
        private final long retryDelayMs;
        private final AtomicInteger retryCount;
        private final AtomicBoolean circuitOpen;
        private volatile ScheduledFuture<?> retryTask;

        CircuitBreakerAction(CompilationKey key, CompilationPipeline.CompilationAction baseAction,
                             DualSnapshotStore snapshotStore, EventSyncPubSubHolder eventBus,
                             Map<CompilationKey, CompilationPipeline> pipelines,
                             ScheduledExecutorService retryScheduler, AtomicInteger versionCounter,
                             long retryDelayMs) {
            this.key = key;
            this.baseAction = baseAction;
            this.snapshotStore = snapshotStore;
            this.eventBus = eventBus;
            this.pipelines = pipelines;
            this.retryScheduler = retryScheduler;
            this.versionCounter = versionCounter;
            this.retryDelayMs = retryDelayMs;
            this.retryCount = new AtomicInteger(0);
            this.circuitOpen = new AtomicBoolean(false);
        }

        @Override
        public ResolutionResult resolve(CompileTask task) throws Exception {
            return baseAction.resolve(task);
        }

        @Override
        public StableSnapshot compile(CompileTask task) throws Exception {
            if (circuitOpen.get()) {
                throw new IllegalStateException("Circuit breaker is open for " + descriptorName(key.descriptor()));
            }

            try {
                StableSnapshot result = baseAction.compile(task);
                retryCount.set(0);
                return result;
            } catch (Throwable e) {
                if (task.isCancelled() || Thread.currentThread().isInterrupted() || causedByInterruptedException(e)) {
                    throw new CancellationException("Compilation cancelled");
                }
                FailureClass failureClass = classifyFailure(e);
                scheduleRetryOrOpenCircuit(failureClass);
                if (e instanceof Exception) {
                    throw (Exception) e;
                } else {
                    throw new RuntimeException(e);
                }
            }
        }

        private static boolean causedByInterruptedException(Throwable throwable) {
            Throwable current = throwable;
            while (current != null) {
                if (current instanceof InterruptedException) {
                    return true;
                }
                current = current.getCause();
            }
            return false;
        }

        @Override
        public LockingMode currentLockingMode(CompileTask task) {
            return baseAction.currentLockingMode(task);
        }

        @Override
        public CompilationPipeline.RecoveryResult recover(CompileTask task, LockingMode initialMode,
                                                          Throwable cause) throws Exception {
            return baseAction.recover(task, initialMode, cause);
        }

        boolean isOpen() {
            return circuitOpen.get();
        }

        void reset() {
            circuitOpen.set(false);
            retryCount.set(0);
            if (retryTask != null) {
                retryTask.cancel(false);
                retryTask = null;
            }
        }

        private void scheduleRetryOrOpenCircuit(FailureClass failureClass) {
            if (failureClass == FailureClass.TRANSIENT && retryCount.getAndIncrement() < 1) {
                CompilationPipeline pipeline = pipelines.get(key);
                if (pipeline != null) {
                    retryTask = retryScheduler.schedule(() -> {
                        ContentVersion nextVersion = nextContentVersion(versionCounter, snapshotStore, key);
                        pipeline.requestCompilation(nextVersion);
                    }, retryDelayMs, TimeUnit.MILLISECONDS);
                }
            } else {
                // Open circuit, release stale snapshot to free symbol graph memory, and emit recovery exhausted event
                circuitOpen.set(true);
                snapshotStore.clearStable(key);
                emitRecoveryExhausted();
            }
        }

        private void emitRecoveryExhausted() {
            try {
                URI uri = parseSourceRootUri(key.sourceRoot());
                eventBus.publish(new CompilerEvent(EventKind.CE_RESOLUTION_EXHAUSTED, uri,
                        descriptorName(key.descriptor())));
            } catch (Exception e) {
                LOG.log(Level.WARNING, "Failed to emit CE-E6 for " + descriptorName(key.descriptor()), e);
            }
        }

        private static URI parseSourceRootUri(String identifier) {
            if (identifier == null || identifier.isBlank()) {
                return null;
            }
            try {
                String trimmed = identifier.trim();
                if (trimmed.startsWith("file:") || trimmed.startsWith("http:") || trimmed.startsWith("https:")) {
                    return URI.create(trimmed);
                }
                return URI.create("file://" + trimmed);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        private static FailureClass classifyFailure(Throwable e) {
            if (e instanceof java.io.IOException) {
                return FailureClass.TRANSIENT;
            } else if (e instanceof IllegalArgumentException || e instanceof IllegalStateException) {
                return FailureClass.PERSISTENT;
            } else {
                return FailureClass.FATAL;
            }
        }
    }
}
