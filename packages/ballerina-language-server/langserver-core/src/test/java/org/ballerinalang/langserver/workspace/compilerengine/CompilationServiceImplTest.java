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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.Project;
import org.ballerinalang.langserver.commons.CompilerCompilationGuard;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.ResolutionResult;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.InProgressSnapshot;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.SnapshotView;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureLevel;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import javax.annotation.Nonnull;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;


/**
 * Tests for CompilationServiceImpl covering event routing, circuit breaker, and LSP query methods.
 *
 * @since 1.7.0
 */
public class CompilationServiceImplTest {

    private CompilationServiceImpl service;
    private EventSyncPubSubHolder eventBus;
    private DualSnapshotStore snapshotStore;
    private StableSnapshot mockSnapshot;
    private PackageDescriptor mockDescriptor;
    private Project mockProject;
    private Path workspaceDir;
    private DocumentUri testRoot;

    @BeforeMethod
    public void setUp() throws Exception {
        eventBus = new EventSyncPubSubHolder();
        snapshotStore = new DualSnapshotStore();
        workspaceDir = Files.createTempDirectory("compilation-service-test").toAbsolutePath().normalize();
        testRoot = new DocumentUri.FileUri(workspaceDir.toUri());
        mockDescriptor = createDescriptor(workspaceDir.getFileName().toString());
        mockProject = mock(Project.class);
        when(mockProject.sourceRoot()).thenReturn(workspaceDir);
        // Pre-create mock snapshot to avoid Mockito initialization issues across tests
        mockSnapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(1));
    }

    @AfterMethod
    public void tearDown() throws InterruptedException {
        if (service != null) {
            service.close();
            service = null;
        }
        // Give background tasks time to complete before closing eventBus
        Thread.sleep(100);
        if (eventBus != null) {
            eventBus.close();
            eventBus = null;
        }
        // Clean up any entries this test inserted into the shared static compiler-guard lock map.
        clearGuardLockMap();
    }

    // ---- Constructor Contracts ----

    @Test
    public void service_constructor_marksReferenceParametersNonnull() throws NoSuchMethodException {
        Constructor<CompilationServiceImpl> constructor = CompilationServiceImpl.class.getConstructor(
                DualSnapshotStore.class, EventSyncPubSubHolder.class,
                CompilationPipeline.CompilationAction.class, long.class, long.class);

        Assert.assertTrue(constructor.getParameters()[0].isAnnotationPresent(Nonnull.class));
        Assert.assertTrue(constructor.getParameters()[1].isAnnotationPresent(Nonnull.class));
        Assert.assertTrue(constructor.getParameters()[2].isAnnotationPresent(Nonnull.class));
    }

    // ---- Workspace Events ----

    @Test
    public void wme1_createsPipelineAndTriggersInitialCompilation() throws InterruptedException {
        CountDownLatch compiled = new CountDownLatch(1);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compiled.countDown();
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);

        Assert.assertTrue(compiled.await(3, TimeUnit.SECONDS),
                "WM-E1 should trigger initial compilation");
    }

    @Test
    public void wme2_evictsPipeline() throws InterruptedException {
        CountDownLatch compiled = new CountDownLatch(1);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compiled.countDown();
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(compiled.await(3, TimeUnit.SECONDS), "Pipeline should be created");
        Thread.sleep(200);

        // Verify pipeline exists
        Assert.assertNotNull(snapshotStore.getStable(mockKey()), "Snapshot should exist");

        publishWmE2(testRoot);
        Thread.sleep(200);

        // Verify pipeline is evicted
        Assert.assertNull(snapshotStore.getStable(mockKey()),
                "WM-E2 should evict pipeline and snapshot");
    }

    @Test
    public void wme2_evictsCompilerCompilationGuardLockEvenWithoutPipeline() throws Exception {
        // Regression (task 05): WM-E2 must evict the shared compiler-guard lock for the project's
        // source root even when no compilation pipeline was ever registered for it. The guard may
        // be used directly (WorkspaceRunService / WorkspaceManagerFacadeImpl) without a pipeline,
        // so eviction must not be gated on pipeline existence.
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(
                task -> mockSnapshot), 50);

        Path registered = workspaceDir;
        putGuardLock(registered);
        Assert.assertTrue(guardLockMap().containsKey(registered),
                "precondition: guard lock should be registered for the project root");

        publishWmE2(testRoot);
        Thread.sleep(200);

        Assert.assertFalse(guardLockMap().containsKey(registered),
                "WM-E2 should evict the compiler-guard lock even with no pipeline");
    }

    @Test
    public void wme2_evictsCompilerCompilationGuardLockWhenPipelineExists() throws Exception {
        CountDownLatch compiled = new CountDownLatch(1);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compiled.countDown();
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(compiled.await(3, TimeUnit.SECONDS), "Pipeline should be created");

        Path registered = workspaceDir;
        putGuardLock(registered);
        Assert.assertTrue(guardLockMap().containsKey(registered));

        publishWmE2(testRoot);
        Thread.sleep(200);

        Assert.assertFalse(guardLockMap().containsKey(registered),
                "WM-E2 should evict the compiler-guard lock when a pipeline existed");
    }

    @Test
    public void wme3_evictsThenRecreatesPipeline() throws InterruptedException {
        AtomicInteger compileCount = new AtomicInteger(0);
        CountDownLatch firstComplete = new CountDownLatch(1);
        CountDownLatch secondStart = new CountDownLatch(1);
        // Use pre-created mockSnapshot
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            if (compileCount.incrementAndGet() == 1) {
                firstComplete.countDown();
            } else {
                secondStart.countDown();
            }
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(firstComplete.await(3, TimeUnit.SECONDS), "First compilation");

        publishWmE3(testRoot);
        Assert.assertTrue(secondStart.await(3, TimeUnit.SECONDS),
                "WM-E3 should evict and recreate pipeline");
        Assert.assertEquals(compileCount.get(), 2, "Should compile twice");
    }

    // ---- Project Updated Events ----

    @Test
    public void wmProjectUpdated_requestsCompilation() throws InterruptedException {
        CountDownLatch firstCompiled = new CountDownLatch(1);
        CountDownLatch secondCompiled = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            int count = compileCount.incrementAndGet();
            if (count == 1) {
                firstCompiled.countDown();
            } else if (count == 2) {
                secondCompiled.countDown();
            }
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(firstCompiled.await(3, TimeUnit.SECONDS), "Initial compilation");

        publishWmE4(testRoot);
        Assert.assertTrue(secondCompiled.await(3, TimeUnit.SECONDS),
                "WORKSPACE_PROJECT_UPDATED should request compilation");
    }

    @Test
    public void rmE1_throttlesProjectUpdatedTriggeredCompilationUntilWindowExpires() throws InterruptedException {
        CountDownLatch firstCompiled = new CountDownLatch(1);
        CountDownLatch throttledCompilation = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            int count = compileCount.incrementAndGet();
            if (count == 1) {
                firstCompiled.countDown();
            } else if (count == 2) {
                throttledCompilation.countDown();
            }
            return mockSnapshot;
        }), 50L, 300L);

        publishWmE1(testRoot);
        Assert.assertTrue(firstCompiled.await(3, TimeUnit.SECONDS), "Initial compilation");

        eventBus.publish(new HeapPressureEvent(HeapPressureLevel.WARNING));
        publishWmE4(testRoot);

        Assert.assertFalse(throttledCompilation.await(150, TimeUnit.MILLISECONDS),
                "RM-E1 should throttle immediate project-updated recompilation");
        Assert.assertTrue(throttledCompilation.await(2, TimeUnit.SECONDS),
                "Compilation should resume after the throttle window");
    }

    // ---- LSP Query Methods ----

    @Test
    public void service_stableSnapshot_returnsSnapshotWhenSnapshotExists() throws InterruptedException {
        CountDownLatch compiled = new CountDownLatch(1);
        StableSnapshot snapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(1));
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compiled.countDown();
            return snapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(compiled.await(3, TimeUnit.SECONDS));

        StableSnapshot stableSnapshot = service.stableSnapshot(mockProject, mockDescriptor, null);
        Assert.assertNotNull(stableSnapshot);
        Assert.assertSame(stableSnapshot, snapshot);
    }

    @Test
    public void service_stableSnapshot_returnsNull_whenNoSnapshot() {
        // Use pre-created mockSnapshot
        service = new CompilationServiceImpl(snapshotStore, eventBus, task -> mockSnapshot, 50);

        StableSnapshot snapshot = service.stableSnapshot(mockProject, mockDescriptor, null);
        Assert.assertNull(snapshot, "Should return null when no snapshot exists");
    }

    @Test
    public void service_latestSnapshot_returnsStableSnapshotWhenOnlyStableExists() throws InterruptedException {
        CountDownLatch compiled = new CountDownLatch(1);
        StableSnapshot snapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(7));
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compiled.countDown();
            return snapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(compiled.await(3, TimeUnit.SECONDS));
        Thread.sleep(250);

        SnapshotView latestSnapshot = service.latestSnapshot(mockProject, mockDescriptor, null);
        Assert.assertSame(latestSnapshot, snapshot);
    }

    @Test
    public void service_latestSnapshot_returnsInProgressSnapshotWhenCompilationIsRunning() throws Exception {
        CountDownLatch firstCompiled = new CountDownLatch(1);
        CountDownLatch secondCompileStarted = new CountDownLatch(1);
        CountDownLatch allowSecondCompileToFinish = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);
        StableSnapshot firstSnapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(8));
        StableSnapshot secondSnapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(9));
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            int invocation = compileCount.incrementAndGet();
            if (invocation == 1) {
                firstCompiled.countDown();
                return firstSnapshot;
            }
            secondCompileStarted.countDown();
            Assert.assertTrue(allowSecondCompileToFinish.await(3, TimeUnit.SECONDS),
                    "Test should release second compilation");
            return secondSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(firstCompiled.await(3, TimeUnit.SECONDS), "Initial stable snapshot should exist");

        publishWmE4(testRoot);
        Assert.assertTrue(secondCompileStarted.await(3, TimeUnit.SECONDS), "Second compilation should start");

        InProgressSnapshot inProgressSnapshot = snapshotStore.getInProgress(mockKey());
        Assert.assertNotNull(inProgressSnapshot, "In-progress snapshot should be published while compiling");
        Assert.assertSame(service.latestSnapshot(mockProject, mockDescriptor, null), inProgressSnapshot);

        allowSecondCompileToFinish.countDown();
    }

    @Test
    public void service_stableSnapshot_blocksUntilNextSnapshotIsPublished() throws Exception {
        CountDownLatch compileStarted = new CountDownLatch(1);
        CountDownLatch allowCompileToFinish = new CountDownLatch(1);
        StableSnapshot snapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(2));
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compileStarted.countDown();
            Assert.assertTrue(allowCompileToFinish.await(3, TimeUnit.SECONDS),
                    "Test should release compile action");
            return snapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(compileStarted.await(3, TimeUnit.SECONDS), "Compilation should start");

        CompletableFuture<StableSnapshot> future = CompletableFuture.supplyAsync(
                () -> service.stableSnapshot(mockProject, mockDescriptor, null));
        Thread.sleep(150);
        Assert.assertFalse(future.isDone(), "stableSnapshot should wait while compilation is in progress");

        allowCompileToFinish.countDown();

        Assert.assertSame(future.get(3, TimeUnit.SECONDS), snapshot,
                "stableSnapshot should return the newly published stable snapshot");
    }

    // ---- Retry-on-Cancellation Tests (debounce/coalescing window null-return fix) ----

    @Test
    public void service_stableSnapshot_retriesPastCoalescedCancellation_returnsSuccessfulResult() throws Exception {
        CountDownLatch firstCompileStarted = new CountDownLatch(1);
        CountDownLatch firstCompileInterrupted = new CountDownLatch(1);
        CountDownLatch secondCompileStarted = new CountDownLatch(1);
        StableSnapshot finalSnapshot = createStableSnapshot(mock(SyntaxTree.class), mock(SemanticModel.class),
                mock(PackageCompilation.class), new ContentVersion(2));

        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            if (task.contentVersion().equals(new ContentVersion(1))) {
                firstCompileStarted.countDown();
                try {
                    // Block so the request below observes this version's in-progress snapshot
                    // while it is still the current one — then gets superseded (ADR-018 Mandate 8).
                    new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    firstCompileInterrupted.countDown();
                    Thread.currentThread().interrupt();
                    throw new CancellationException("interrupted by superseding edit");
                }
                throw new AssertionError("Should have been interrupted by the superseding edit");
            }
            secondCompileStarted.countDown();
            return finalSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(firstCompileStarted.await(3, TimeUnit.SECONDS), "First compilation should start");

        // A request (e.g. completion/hover) arrives while the first compile is in flight and
        // captures its in-progress snapshot — the exact snapshot the review found gets cancelled
        // out from under the waiter with no retry.
        CompletableFuture<StableSnapshot> waiter = CompletableFuture.supplyAsync(
                () -> service.stableSnapshot(mockProject, mockDescriptor, null));
        // Let the waiter's own forceCompilation() call settle before the second edit registers its
        // debounce — otherwise forceCompilation() can steal the still-pending debounce and re-queue
        // it directly on the (currently busy) compile worker, which is a separate pre-existing
        // CompilationPipeline timing hazard unrelated to the retry-on-cancellation fix under test.
        Thread.sleep(50);

        // A second edit lands before the first compile finishes, superseding it (LIFO coalescing).
        publishWmE4(testRoot);

        Assert.assertTrue(firstCompileInterrupted.await(3, TimeUnit.SECONDS),
                "Superseding edit should cancel the in-flight compile the waiter captured");
        Assert.assertTrue(secondCompileStarted.await(3, TimeUnit.SECONDS),
                "The superseding compilation should still run and succeed");

        Assert.assertSame(waiter.get(3, TimeUnit.SECONDS), finalSnapshot,
                "stableSnapshot must retry past its own coalesced cancellation and return the successful "
                        + "result instead of null, even though the exact snapshot it first captured was cancelled");
    }

    @Test
    public void service_stableSnapshot_terminatesWithNull_whenCircuitBreakerOpensDuringWait() throws Exception {
        CountDownLatch compileStarted = new CountDownLatch(1);
        CountDownLatch allowCompileToFail = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);

        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compileCount.incrementAndGet();
            compileStarted.countDown();
            Assert.assertTrue(allowCompileToFail.await(3, TimeUnit.SECONDS), "Test should release the compile");
            // PERSISTENT failure class — opens the circuit breaker immediately, with no further retry.
            throw new IllegalArgumentException("persistent source error");
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(compileStarted.await(3, TimeUnit.SECONDS), "Compilation should start");

        // A request captures the in-progress snapshot for the doomed compile.
        CompletableFuture<StableSnapshot> waiter = CompletableFuture.supplyAsync(
                () -> service.stableSnapshot(mockProject, mockDescriptor, null));
        Thread.sleep(50);
        Assert.assertFalse(waiter.isDone(), "Should still be waiting on the in-progress compile");

        allowCompileToFail.countDown();

        // Without a termination check tied to the circuit breaker, this would spin forever
        // re-requesting compilation and re-hitting the now-permanently-open circuit — never
        // returning at all. A bounded 3s wait proves the retry loop actually terminates.
        StableSnapshot result = waiter.get(3, TimeUnit.SECONDS);
        Assert.assertNull(result,
                "A persistent, non-retryable failure must terminate with null once the circuit opens, "
                        + "not hang or busy-spin forever retrying a doomed compile");
    }

    // ---- Circuit Breaker Tests ----

    @Test
    public void circuit_transientFailureSchedulesRetry() throws InterruptedException {
        AtomicInteger callCount = new AtomicInteger(0);
        CountDownLatch secondCall = new CountDownLatch(1);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            if (callCount.incrementAndGet() < 2) {
                throw new java.io.IOException("transient network error");
            }
            secondCall.countDown();
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);
        Assert.assertTrue(secondCall.await(3, TimeUnit.SECONDS),
                "Transient failure should be retried");
        Assert.assertEquals(callCount.get(), 2, "Should attempt compilation twice");
    }

    @Test
    public void circuit_persistentFailureOpensBreakerAndEmitsCEE6() throws InterruptedException {
        CountDownLatch recoveryExhausted = new CountDownLatch(1);
        List<EventKind> receivedEvents = Collections.synchronizedList(new ArrayList<>());
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            throw new IllegalArgumentException("persistent source error");
        }), 50);

        // Subscribe to CE-E6 event
        eventBus.subscribe("test-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_RESOLUTION_EXHAUSTED), event -> {
                    receivedEvents.add(event.eventKind());
                    recoveryExhausted.countDown();
                });

        publishWmE1(testRoot);
        Assert.assertTrue(recoveryExhausted.await(3, TimeUnit.SECONDS),
                "Persistent failure should emit CE-E6");
        Assert.assertTrue(receivedEvents.contains(EventKind.CE_RESOLUTION_EXHAUSTED));
    }

    @Test
    public void circuit_fatalFailureOpensBreakerAndEmitsCEE6() throws InterruptedException {
        CountDownLatch recoveryExhausted = new CountDownLatch(1);
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            throw new AssertionError("compiler bug");
        }), 50);

        eventBus.subscribe("test-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_RESOLUTION_EXHAUSTED), event -> {
                    recoveryExhausted.countDown();
                });

        publishWmE1(testRoot);
        Assert.assertTrue(recoveryExhausted.await(3, TimeUnit.SECONDS),
                "Fatal failure should emit CE-E6");
    }

    // ---- Close Behavior ----

    @Test
    public void service_closeIdempotent() {
        // Use pre-created mockSnapshot
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> mockSnapshot), 50);
        service.close();
        service.close(); // Should not throw
    }

    @Test
    public void service_closeShutdownsRetryScheduler() throws InterruptedException {
        // Use pre-created mockSnapshot
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> mockSnapshot), 50);
        service.close();
        Thread.sleep(100);
        // Verify no leaked threads (observable via graceful close)
    }

    @Test
    public void service_multipleProjects_managedIndependently() throws InterruptedException {
        DocumentUri root2 = new DocumentUri.FileUri(
                Path.of("/tmp/test-project-2").toAbsolutePath().normalize().toUri());
        AtomicInteger compileCount = new AtomicInteger(0);
        CountDownLatch twoCompiles = new CountDownLatch(2);
        // Use pre-created mockSnapshot
        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            compileCount.incrementAndGet();
            twoCompiles.countDown();
            return mockSnapshot;
        }), 50);

        publishWmE1(testRoot);
        publishWmE1(root2);

        Assert.assertTrue(twoCompiles.await(3, TimeUnit.SECONDS),
                "Both projects should compile independently");
        Assert.assertEquals(compileCount.get(), 2);
    }

    // ---- Concurrency Limit ----

    @Test
    // RED: this test should fail — no 6-param constructor with maxConcurrentCompilations exists yet
    public void service_concurrencyLimitOf1_enforcesSerialCompilation() throws InterruptedException {
        DocumentUri root2 = new DocumentUri.FileUri(
                Path.of("/tmp/test-project-concurrency-2").toAbsolutePath().normalize().toUri());

        AtomicInteger concurrentCount = new AtomicInteger(0);
        AtomicInteger maxConcurrent = new AtomicInteger(0);
        CountDownLatch allDone = new CountDownLatch(2);

        service = new CompilationServiceImpl(snapshotStore, eventBus, actionWithDescribe(task -> {
            int current = concurrentCount.incrementAndGet();
            maxConcurrent.updateAndGet(m -> Math.max(m, current));
            Thread.sleep(150);
            concurrentCount.decrementAndGet();
            allDone.countDown();
            return mockSnapshot;
        }), 50L, 250L, 1);

        publishWmE1(testRoot);
        publishWmE1(root2);

        Assert.assertTrue(allDone.await(8, TimeUnit.SECONDS),
                "Both projects must eventually compile");
        Assert.assertTrue(maxConcurrent.get() <= 1,
                "At most 1 compilation must run at a time with maxConcurrentCompilations=1");
    }

    @Test(expectedExceptions = IllegalArgumentException.class)
    // RED: this test should fail — no 6-param constructor exists yet
    public void service_constructorRejectsZeroConcurrencyLimit() {
        new CompilationServiceImpl(snapshotStore, eventBus,
                actionWithDescribe(task -> mockSnapshot), 50L, 250L, 0);
    }

    @Test
    // RED: this test should fail — no 6-param constructor exists yet
    public void service_constructorAcceptsOneAsConcurrencyLimit() {
        // BVA: 1 is the valid lower bound — must not throw
        service = new CompilationServiceImpl(snapshotStore, eventBus,
                actionWithDescribe(task -> mockSnapshot), 50L, 250L, 1);
        Assert.assertNotNull(service);
    }

    // ---- Helper Methods ----

    /**
     * Wraps a compile-only lambda so that {@code describe()} returns {@link #mockDescriptor},
     * satisfying the pipeline creation contract in {@code createPipelineIfAbsent}.
     */
    private CompilationPipeline.CompilationAction actionWithDescribe(
            CompilationPipeline.CompilationAction base) {
        return new CompilationPipeline.CompilationAction() {
            @Override
            public ResolutionResult resolve(CompileTask task) throws Exception {
                return base.resolve(task);
            }
            @Override
            public StableSnapshot compile(CompileTask task) throws Exception {
                return base.compile(task);
            }
            @Override
            public PackageDescriptor describe(String sourceRootIdentifier) {
                if (workspaceDir.toString().equals(sourceRootIdentifier)) {
                    return mockDescriptor;
                }
                String sanitized = sourceRootIdentifier.replaceAll("[^A-Za-z0-9_-]", "-");
                return createDescriptor(sanitized);
            }
        };
    }

    private void publishWmE1(DocumentUri sr) {
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, sr.uri()));
    }

    private void publishWmE2(DocumentUri sr) {
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_EVICTED, sr.uri()));
    }

    private void publishWmE3(DocumentUri sr) {
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED, sr.uri()));
    }

    private void publishWmE4(DocumentUri sr) {
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, sr.uri()));
    }

    /**
     * Inserts a lock entry into the static {@code CompilerCompilationGuard.PROJECT_LOCKS} map for
     * the given (already-normalized) source root, simulating a prior guarded compilation.
     */
    @SuppressWarnings("unchecked")
    private static void putGuardLock(Path sourceRoot) throws Exception {
        Field field = CompilerCompilationGuard.class.getDeclaredField("PROJECT_LOCKS");
        field.setAccessible(true);
        java.util.Map<Path, Object> locks =
                (java.util.Map<Path, Object>) field.get(null);
        locks.computeIfAbsent(sourceRoot.toAbsolutePath().normalize(),
                root -> new java.util.concurrent.locks.ReentrantLock());
    }

    /**
     * Reads the static {@code CompilerCompilationGuard.PROJECT_LOCKS} map for assertions.
     */
    @SuppressWarnings("unchecked")
    private static java.util.Map<Path, Object> guardLockMap() throws Exception {
        Field field = CompilerCompilationGuard.class.getDeclaredField("PROJECT_LOCKS");
        field.setAccessible(true);
        return (java.util.Map<Path, Object>) field.get(null);
    }

    /**
     * Clears the static {@code CompilerCompilationGuard.PROJECT_LOCKS} map so tests do not leak
     * entries into one another (the map is process-wide).
     */
    private static void clearGuardLockMap() {
        try {
            Field field = CompilerCompilationGuard.class.getDeclaredField("PROJECT_LOCKS");
            field.setAccessible(true);
            ((java.util.Map<?, ?>) field.get(null)).clear();
        } catch (Exception e) {
            // Best-effort cleanup; never fail a test on tearDown.
        }
    }

    private StableSnapshot createStableSnapshot(SyntaxTree syntaxTree, SemanticModel semanticModel,
                                                PackageCompilation compilation, ContentVersion version) {
        DocumentId documentId = mock(DocumentId.class);
        ModuleId moduleId = mock(ModuleId.class);
        when(documentId.moduleId()).thenReturn(moduleId);
        return new StableSnapshot(Map.of(documentId, syntaxTree),
                Map.of(workspaceDir.resolve("main.bal").normalize(), documentId),
                Map.of(moduleId, semanticModel), compilation, version);
    }

    private CompilationKey mockKey() {
        return new CompilationKey(workspaceDir.toString(), mockDescriptor);
    }

    private PackageDescriptor createDescriptor(String packageNameValue) {
        PackageDescriptor descriptor = mock(PackageDescriptor.class);
        PackageName packageName = mock(PackageName.class);
        when(descriptor.name()).thenReturn(packageName);
        when(packageName.value()).thenReturn(packageNameValue);
        return descriptor;
    }

}
