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
import org.ballerinalang.langserver.workspace.compilerengine.CompilationPhase;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationPipeline;
import org.ballerinalang.langserver.workspace.compilerengine.CompileTask;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.CancellationToken;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;


/**
 * Acceptance tests translating async-compilation-pipeline.feature scenarios into executable assertions.
 *
 * @since 1.7.0
 */
public class AsyncCompilationPipelineTest {

    private static final Path TEST_ROOT_PATH = Path.of("/tmp/acceptance-async-pipeline")
            .toAbsolutePath().normalize();
    private static final String TEST_ROOT_ID = TEST_ROOT_PATH.toUri().toString();
    private static final PackageDescriptor TEST_ROOT = descriptor("acceptance-async-pipeline");

    private CompilationPipeline pipeline;
    private EventSyncPubSubHolder eventBus;

    /**
     * Closes per-test resources.
     */
    @AfterMethod
    public void tearDown() {
        if (pipeline != null) {
            pipeline.close();
            pipeline = null;
        }
        if (eventBus != null) {
            eventBus.close();
            eventBus = null;
        }
    }

    /**
     * Verifies compilation executes on the dedicated background worker, not the request thread.
     *
     * @throws Exception if the test orchestration fails
     */
    @Test
    public void compilationRequest_runsOnBackgroundWorkerInsteadOfRequestThread() throws Exception {
        // RED: this test should fail — cancellation/worker orchestration must honor ADR-007 worker isolation
        CountDownLatch compiled = new CountDownLatch(1);
        AtomicReference<String> compilationThreadName = new AtomicReference<>();
        String requestThreadName = "lsp-request-1";
        StableSnapshot snapshot = createSnapshot(new ContentVersion(1));

        pipeline = createPipeline(new DualSnapshotStore(), task -> {
            compilationThreadName.set(Thread.currentThread().getName());
            compiled.countDown();
            return snapshot;
        });

        Thread requester = new Thread(() -> pipeline.requestCompilation(new ContentVersion(1)), requestThreadName);
        requester.start();
        requester.join();

        Assert.assertTrue(compiled.await(3, TimeUnit.SECONDS), "Compilation never reached the worker thread");
        Assert.assertTrue(compilationThreadName.get().startsWith("compile-worker-")
                        && !requestThreadName.equals(compilationThreadName.get()),
                "Compilation must run on a dedicated compile-worker thread");
    }

    /**
     * Verifies a newer pending request replaces older superseded pending work.
     */
    @Test
    public void supersededPendingRequests_executeOnlyLatestCompilation() throws Exception {
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch latestExecuted = new CountDownLatch(1);
        List<Integer> executedVersions = new CopyOnWriteArrayList<>();
        StableSnapshot latestSnapshot = createSnapshot(new ContentVersion(3));

        pipeline = createPipeline(new DualSnapshotStore(), task -> {
            int version = task.contentVersion().value();
            if (version == 1) {
                firstStarted.countDown();
                releaseFirst.await(5, TimeUnit.SECONDS);
                throw new CancellationException("superseded");
            }
            executedVersions.add(version);
            if (version == 3) {
                latestExecuted.countDown();
            }
            return latestSnapshot;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");

        pipeline.requestCompilation(new ContentVersion(2));
        pipeline.requestCompilation(new ContentVersion(3));
        releaseFirst.countDown();

        Assert.assertTrue(latestExecuted.await(3, TimeUnit.SECONDS), "Latest compilation did not execute");
        Assert.assertEquals(executedVersions, List.of(3), "Only the latest superseding request may execute");
    }

    /**
     * Verifies successful compilation publishes an immutable snapshot to the snapshot store.
     */
    @Test
    public void successfulCompilation_publishesSnapshotToDualSnapshotStore() {
        DualSnapshotStore snapshotStore = new DualSnapshotStore();
        StableSnapshot expectedSnapshot = createSnapshot(new ContentVersion(42));

        pipeline = createPipeline(snapshotStore, task -> expectedSnapshot);
        pipeline.requestCompilation(new ContentVersion(42));

        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .until(() -> snapshotStore.getStable(testKey()) != null);
        Assert.assertSame(snapshotStore.getStable(testKey()), expectedSnapshot,
                "Successful compilation must publish the completed snapshot atomically");
    }

    /**
     * Verifies stale compilation results are discarded and the newest version is eventually published.
     */
    @Test
    public void staleCompilationResult_isDiscardedInFavorOfLatestVersion() throws Exception {
        DualSnapshotStore snapshotStore = new DualSnapshotStore();
        CountDownLatch oldVersionStarted = new CountDownLatch(1);
        CountDownLatch releaseOldVersion = new CountDownLatch(1);
        CountDownLatch latestPublished = new CountDownLatch(1);
        Map<Integer, StableSnapshot> snapshots = Map.of(
                10, createSnapshot(new ContentVersion(10)),
                11, createSnapshot(new ContentVersion(11))
        );

        pipeline = createPipeline(snapshotStore, task -> {
            if (task.contentVersion().value() == 10) {
                oldVersionStarted.countDown();
                releaseOldVersion.await(5, TimeUnit.SECONDS);
            } else if (task.contentVersion().value() == 11) {
                latestPublished.countDown();
            }
            return snapshots.get(task.contentVersion().value());
        });

        pipeline.requestCompilation(new ContentVersion(10));
        Assert.assertTrue(oldVersionStarted.await(3, TimeUnit.SECONDS), "Old compilation never started");

        pipeline.requestCompilation(new ContentVersion(11));
        releaseOldVersion.countDown();

        Assert.assertTrue(latestPublished.await(3, TimeUnit.SECONDS), "Latest compilation never completed");
        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertEquals(snapshotStore.getStable(testKey()).contentVersion(),
                        new ContentVersion(11), "Only the latest content version may remain published"));
    }

    /**
     * Verifies rapid didChange requests within the debounce window coalesce into one compilation.
     */
    @Test
    public void rapidTypingWithinDebounceWindow_coalescesToSingleCompilation() {
        AtomicInteger compileCount = new AtomicInteger();
        StableSnapshot latestSnapshot = createSnapshot(new ContentVersion(10));

        pipeline = createPipeline(new DualSnapshotStore(), task -> {
            compileCount.incrementAndGet();
            return latestSnapshot;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        pipeline.requestCompilation(new ContentVersion(2));
        pipeline.requestCompilation(new ContentVersion(3));
        pipeline.requestCompilation(new ContentVersion(4));
        pipeline.requestCompilation(new ContentVersion(5));
        pipeline.requestCompilation(new ContentVersion(6));
        pipeline.requestCompilation(new ContentVersion(7));
        pipeline.requestCompilation(new ContentVersion(8));
        pipeline.requestCompilation(new ContentVersion(9));
        pipeline.requestCompilation(new ContentVersion(10));

        Awaitility.await().pollDelay(300, TimeUnit.MILLISECONDS).atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertEquals(compileCount.get(), 1,
                        "Ten rapid didChange events should coalesce to a single compilation"));
    }

    /**
     * Verifies cancellation is checked at compilation phase boundaries.
     */
    @Test
    public void cancelledCompileTask_throwsAtPhaseBoundaryCheckpoint() {
        CompileTask task = new CompileTask(TEST_ROOT, TEST_ROOT_ID, new ContentVersion(7), new CancellationToken());
        task.cancel();

        Assert.assertThrows(CancellationException.class,
                () -> task.advancePhase(CompilationPhase.POST_PARSE));
    }

    private CompilationPipeline createPipeline(DualSnapshotStore snapshotStore,
                                               CompilationPipeline.CompilationAction action) {
        eventBus = new EventSyncPubSubHolder();
        return new CompilationPipeline(testKey(), snapshotStore, eventBus, action);
    }

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

    /** Returns the {@link CompilationKey} used by all tests in this class. */
    private static CompilationKey testKey() {
        return new CompilationKey(TEST_ROOT_ID, TEST_ROOT);
    }
}
