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
package org.ballerinalang.langserver.workspace.test.acceptance;

import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import org.awaitility.Awaitility;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationKey;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.InProgressSnapshot;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;


/**
 * Acceptance tests for the dual-snapshot access pattern (ADR-042).
 * <p>
 * Verifies that StableSnapshot provides low-latency synchronous access while
 * InProgressSnapshot provides asynchronous await for in-flight compilations.
 *
 * @since 1.7.0
 */
public class DualSnapshotAcceptanceTest {

    private static final String TEST_SOURCE_ROOT = "/test/acceptance-dual-snapshot";
    private static final CompilationKey TEST_ROOT = new CompilationKey(TEST_SOURCE_ROOT,
            descriptor("acceptance-dual-snapshot"));
    private static final long LATENCY_THRESHOLD_MS = 5;

    private DualSnapshotStore store;
    private ExecutorService executor;

    /**
     * Cleans up per-test resources.
     */
    @AfterMethod
    public void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
        store = null;
    }

    // ========================================================================
    // StableSnapshot Latency Tests
    // ========================================================================

    /**
     * Verifies getStable() returns immediately without blocking.
     * <p>
     * This is the core latency guarantee: syntax-tier features must never wait
     * for compilation to complete.
     */
    @Test
    public void getStable_isNonBlocking_returnsWithin5ms() {
        store = new DualSnapshotStore();
        StableSnapshot snapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, snapshot);

        // Measure latency of getStable() call
        long startNs = System.nanoTime();
        StableSnapshot result = store.getStable(TEST_ROOT);
        long elapsedNs = System.nanoTime() - startNs;
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(elapsedNs);

        Assert.assertSame(result, snapshot, "getStable() must return the published snapshot");
        Assert.assertTrue(elapsedMs < LATENCY_THRESHOLD_MS,
                "getStable() must return within " + LATENCY_THRESHOLD_MS + "ms, took " + elapsedMs + "ms");
    }

    /**
     * Verifies getStable() returns null immediately when no snapshot has been published.
     */
    @Test
    public void getStable_whenNoSnapshotPublished_returnsNullImmediately() {
        store = new DualSnapshotStore();

        long startNs = System.nanoTime();
        StableSnapshot result = store.getStable(TEST_ROOT);
        long elapsedNs = System.nanoTime() - startNs;
        long elapsedMs = TimeUnit.NANOSECONDS.toMillis(elapsedNs);

        Assert.assertNull(result, "getStable() must return null when no snapshot published");
        Assert.assertTrue(elapsedMs < LATENCY_THRESHOLD_MS,
                "getStable() must return within " + LATENCY_THRESHOLD_MS + "ms even when returning null");
    }

    // ========================================================================
    // InProgressSnapshot Await Tests
    // ========================================================================

    /**
     * Verifies InProgressSnapshot.compilation() blocks until compilation completes.
     * <p>
     * When publishStable() is called, the in-progress compilation future must complete
     * with the package compilation.
     */
    @Test
    public void inProgress_compilation_blocksUntilPublishStable() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);
        Assert.assertNotNull(inProgress, "startCompilation() must return an InProgressSnapshot");

        CompletableFuture<PackageCompilation> compilationFuture = inProgress.compilation(() -> { });

        // Future should not be complete yet
        Assert.assertFalse(compilationFuture.isDone(), "Compilation future must not be complete before publishStable");

        // Publish stable snapshot
        StableSnapshot newSnapshot = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, newSnapshot);

        // Now the future should complete
        PackageCompilation compilation = compilationFuture.get(3, TimeUnit.SECONDS);
        Assert.assertSame(compilation, newSnapshot.compilation(),
                "Compilation future must complete with the new snapshot's compilation");
    }

    /**
     * Verifies InProgressSnapshot.compilation() with timeout throws TimeoutException
     * when compilation does not complete within the deadline.
     */
    @Test
    public void inProgress_compilationWithTimeout_throwsTimeoutException() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);
        CompletableFuture<PackageCompilation> compilationFuture = inProgress.compilation(() -> { });

        // Do NOT publish stable - future should timeout
        Assert.assertThrows(TimeoutException.class,
                () -> compilationFuture.get(100, TimeUnit.MILLISECONDS));
    }

    /**
     * Verifies InProgressSnapshot.semanticModel() blocks until compilation completes.
     */
    @Test
    public void inProgress_semanticModel_blocksUntilPublishStable() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);

        CompletableFuture<?> semanticFuture = inProgress.semanticModel(
                Mockito.mock(io.ballerina.projects.ModuleId.class), () -> { });

        // Future should not be complete yet
        Assert.assertFalse(semanticFuture.isDone(), "Semantic model future must not be complete before publishStable");

        // Publish stable snapshot
        StableSnapshot newSnapshot = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, newSnapshot);

        // Now the future should complete
        semanticFuture.get(3, TimeUnit.SECONDS);
        Assert.assertTrue(semanticFuture.isDone(), "Semantic model future must complete after publishStable");
    }

    // ========================================================================
    // InProgressSnapshot Cancellation Tests
    // ========================================================================

    /**
     * Verifies cancelInProgress() makes the compilation future throw CancellationException.
     */
    @Test
    public void inProgress_cancel_makesCompilationFutureThrowCancellationException() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);
        CompletableFuture<PackageCompilation> compilationFuture = inProgress.compilation(() -> { });

        // Cancel the in-progress compilation
        store.cancelInProgress(TEST_ROOT);

        // Future should be cancelled
        Assert.assertTrue(compilationFuture.isCancelled(),
                "Compilation future must be cancelled after cancelInProgress()");

        // Getting the future should throw CancellationException directly
        Assert.expectThrows(CancellationException.class,
                () -> compilationFuture.get(3, TimeUnit.SECONDS));
    }

    /**
     * Verifies cancelInProgress() makes the semantic model future throw CancellationException.
     */
    @Test
    public void inProgress_cancel_makesSemanticModelFutureThrowCancellationException() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);
        CompletableFuture<?> semanticFuture = inProgress.semanticModel(
                Mockito.mock(io.ballerina.projects.ModuleId.class), () -> { });

        // Cancel the in-progress compilation
        store.cancelInProgress(TEST_ROOT);

        // Future should be cancelled
        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertTrue(semanticFuture.isCancelled(),
                        "Semantic model future must be cancelled after cancelInProgress()"));
    }

    /**
     * Verifies startCompilation() cancels any previous in-progress snapshot.
     */
    @Test
    public void startCompilation_cancelsPreviousInProgress() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        // Start first compilation
        InProgressSnapshot firstInProgress = store.startCompilation(TEST_ROOT);
        CompletableFuture<PackageCompilation> firstFuture = firstInProgress.compilation(() -> { });

        // Start second compilation (should cancel the first)
        InProgressSnapshot secondInProgress = store.startCompilation(TEST_ROOT);

        // First future should be cancelled
        Assert.assertTrue(firstFuture.isCancelled(),
                "Previous compilation future must be cancelled when new compilation starts");

        // Second in-progress should be accessible
        Assert.assertNotNull(secondInProgress, "New compilation must return an InProgressSnapshot");
    }

    // ========================================================================
    // Full Lifecycle Tests
    // ========================================================================

    /**
     * Verifies the complete lifecycle: startCompilation → getInProgress → publishStable → getStable.
     */
    @Test
    public void fullLifecycle_startToPublish() throws Exception {
        store = new DualSnapshotStore();

        // Initial state: no stable snapshot
        Assert.assertNull(store.getStable(TEST_ROOT), "Initially, no stable snapshot should exist");

        // Publish initial stable snapshot
        StableSnapshot initialSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, initialSnapshot);
        Assert.assertSame(store.getStable(TEST_ROOT), initialSnapshot,
                "getStable() must return the initial published snapshot");

        // Start a new compilation
        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);
        Assert.assertNotNull(inProgress, "startCompilation() must return an InProgressSnapshot");
        Assert.assertSame(store.getInProgress(TEST_ROOT), inProgress,
                "getInProgress() must return the started snapshot");

        // getStable() should still return the previous snapshot
        Assert.assertSame(store.getStable(TEST_ROOT), initialSnapshot,
                "getStable() must return previous snapshot during compilation");

        // Publish new stable snapshot
        StableSnapshot newSnapshot = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, newSnapshot);

        // Now getStable() should return the new snapshot
        Assert.assertSame(store.getStable(TEST_ROOT), newSnapshot,
                "getStable() must return the new snapshot after publishStable");

        // InProgress should be cleared after publish
        Assert.assertNull(store.getInProgress(TEST_ROOT),
                "getInProgress() must return null after publishStable");

        // In-progress futures should be completed
        CompletableFuture<PackageCompilation> compilationFuture = inProgress.compilation(() -> { });
        Assert.assertTrue(compilationFuture.isDone(), "Compilation future must be done after publishStable");
    }

    /**
     * Verifies lifecycle with multiple compilation cycles.
     */
    @Test
    public void fullLifecycle_multipleCycles() throws Exception {
        store = new DualSnapshotStore();

        // Cycle 1
        StableSnapshot snapshot1 = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, snapshot1);
        Assert.assertSame(store.getStable(TEST_ROOT), snapshot1);

        // Cycle 2
        InProgressSnapshot inProgress2 = store.startCompilation(TEST_ROOT);
        StableSnapshot snapshot2 = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, snapshot2);
        Assert.assertSame(store.getStable(TEST_ROOT), snapshot2);

        // Cycle 3
        InProgressSnapshot inProgress3 = store.startCompilation(TEST_ROOT);
        StableSnapshot snapshot3 = createSnapshot(new ContentVersion(3));
        store.publishStable(TEST_ROOT, snapshot3);
        Assert.assertSame(store.getStable(TEST_ROOT), snapshot3);

        // Verify all compilations completed
        Assert.assertTrue(inProgress2.compilation(() -> { }).isDone());
        Assert.assertTrue(inProgress3.compilation(() -> { }).isDone());
    }

    // ========================================================================
    // Concurrent Access Tests
    // ========================================================================

    /**
     * Verifies multiple consumers calling getStable() during compilation get the previous stable snapshot.
     */
    @Test
    public void concurrentGetStable_duringCompilation_returnsPreviousStable() throws Exception {
        store = new DualSnapshotStore();

        // Publish initial stable snapshot
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        // Start a compilation (but don't publish yet)
        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);

        // Multiple threads reading getStable() concurrently
        int numThreads = 10;
        int iterationsPerThread = 100;
        executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(numThreads);
        AtomicInteger successCount = new AtomicInteger();
        AtomicReference<Throwable> error = new AtomicReference<>();

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < iterationsPerThread; j++) {
                        StableSnapshot snapshot = store.getStable(TEST_ROOT);
                        if (snapshot != previousSnapshot && snapshot.contentVersion().value() != 2) {
                            throw new AssertionError("Unexpected snapshot version: " + snapshot.contentVersion());
                        }
                        if (snapshot == previousSnapshot) {
                            successCount.incrementAndGet();
                        }
                    }
                } catch (Throwable t) {
                    error.compareAndSet(null, t);
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        // Start all threads
        startLatch.countDown();

        // Wait a bit for concurrent reads, then publish new snapshot
        Thread.sleep(50);
        StableSnapshot newSnapshot = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, newSnapshot);

        // Wait for all threads to complete
        Assert.assertTrue(doneLatch.await(5, TimeUnit.SECONDS), "Threads must complete within timeout");

        // Verify no errors and at least some reads saw the previous snapshot
        if (error.get() != null) {
            throw new AssertionError("Concurrent access error", error.get());
        }
        Assert.assertTrue(successCount.get() > 0,
                "At least some concurrent reads must see the previous stable snapshot during compilation");
    }

    /**
     * Verifies getStable() is thread-safe and never returns null after initial publish.
     */
    @Test
    public void concurrentGetStable_afterPublish_neverReturnsNull() throws Exception {
        store = new DualSnapshotStore();

        StableSnapshot snapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, snapshot);

        int numThreads = 10;
        int iterationsPerThread = 1000;
        executor = Executors.newFixedThreadPool(numThreads);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(numThreads);
        AtomicInteger nullCount = new AtomicInteger();

        for (int i = 0; i < numThreads; i++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < iterationsPerThread; j++) {
                        StableSnapshot result = store.getStable(TEST_ROOT);
                        if (result == null) {
                            nullCount.incrementAndGet();
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        Assert.assertTrue(doneLatch.await(5, TimeUnit.SECONDS), "Threads must complete within timeout");

        Assert.assertEquals(nullCount.get(), 0,
                "getStable() must never return null after initial publish");
    }

    // ========================================================================
    // Ownership-Aware publishStable (Stale-Worker Race) Tests
    // ========================================================================

    /**
     * Verifies the ownership-aware publishStable completes the in-progress
     * futures and updates the stable slot when the calling worker still owns
     * the active in-progress snapshot. Positive control for the discard test.
     */
    @Test
    public void publishStable_withOwnership_completesWhenOwnerStillCurrent() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        InProgressSnapshot inProgress = store.startCompilation(TEST_ROOT);
        CompletableFuture<PackageCompilation> future = inProgress.compilation(() -> { });
        Assert.assertFalse(future.isDone(), "Compilation future must not be complete before publishStable");

        StableSnapshot newSnapshot = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, newSnapshot, inProgress);

        Assert.assertTrue(future.isDone(), "Compilation future must complete when owner is still current");
        Assert.assertSame(future.get(3, TimeUnit.SECONDS), newSnapshot.compilation(),
                "Compilation future must complete with the new snapshot's compilation");
        Assert.assertSame(store.getStable(TEST_ROOT), newSnapshot,
                "Stable slot must be updated when owner is still current");
        Assert.assertNull(store.getInProgress(TEST_ROOT),
                "In-progress slot must be cleared after ownership-aware publish");
    }

    /**
     * Regression for the stale-worker-completes-newer-snapshot race
     * (PR #674 review comment r3781526303).
     * <p>
     * A worker compiling for an older content version must not be able to
     * complete the futures of an in-progress snapshot a newer compilation
     * started. Starts compilation N, lets N+1 supersede it in the store, then
     * completes N — asserts the store's current in-progress snapshot (started
     * for N+1) is untouched by N's stale result: its compilation future is
     * still incomplete, it is still the active in-progress snapshot, and the
     * stable slot still holds the previous snapshot rather than N's discarded
     * stale result.
     */
    @Test
    public void publishStable_withOwnership_discardsStaleSupersededPublish() throws Exception {
        store = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(1));
        store.publishStable(TEST_ROOT, previousSnapshot);

        // Worker N starts compilation from the previous stable snapshot
        InProgressSnapshot inProgressN = store.startCompilation(TEST_ROOT);
        CompletableFuture<PackageCompilation> futureN = inProgressN.compilation(() -> { });
        Assert.assertFalse(futureN.isDone(), "N compilation future must not be complete before supersede");

        // N+1 supersedes N in the store (e.g., a debounce-triggered startCompilation)
        InProgressSnapshot inProgressN1 = store.startCompilation(TEST_ROOT);
        Assert.assertNotSame(inProgressN1, inProgressN,
                "N+1 must produce a distinct in-progress snapshot");
        Assert.assertTrue(futureN.isCancelled(),
                "Superseded N compilation future must be cancelled when N+1 starts");

        // A waiter awaiting N+1's compilation result
        CompletableFuture<PackageCompilation> futureN1 = inProgressN1.compilation(() -> { });
        Assert.assertFalse(futureN1.isDone(), "N+1 compilation future must not be complete yet");

        // N completes and attempts to publish its (now stale) result via the
        // ownership-aware overload — must be discarded entirely.
        StableSnapshot staleSnapshot = createSnapshot(new ContentVersion(2));
        store.publishStable(TEST_ROOT, staleSnapshot, inProgressN);

        // N+1's in-progress snapshot must be untouched by N's stale publish
        Assert.assertFalse(futureN1.isDone(),
                "N+1 compilation future must NOT be completed by N's stale publish");
        Assert.assertSame(store.getInProgress(TEST_ROOT), inProgressN1,
                "N+1 in-progress snapshot must still be the active one after N's stale publish");
        // The stable slot must not be overwritten with N's discarded stale result
        Assert.assertSame(store.getStable(TEST_ROOT), previousSnapshot,
                "Stable slot must retain the previous snapshot, not N's discarded stale result");
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    private static StableSnapshot createSnapshot(ContentVersion version) {
        return new StableSnapshot(Map.of(), Map.of(), Map.of(),
                Mockito.mock(PackageCompilation.class), version);
    }

    private static PackageDescriptor descriptor(String packageNameValue) {
        PackageDescriptor descriptor = Mockito.mock(PackageDescriptor.class);
        PackageName packageName = Mockito.mock(PackageName.class);
        Mockito.when(descriptor.name()).thenReturn(packageName);
        Mockito.when(packageName.value()).thenReturn(packageNameValue);
        return descriptor;
    }
}
