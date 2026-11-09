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
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.InProgressSnapshot;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;


/**
 * Acceptance tests translating cancellation-model.feature scenarios into executable assertions.
 *
 * @since 1.7.0
 */
public class CancellationModelTest {

    private static final Path TEST_ROOT_PATH = Path.of("/tmp/acceptance-cancellation-model")
            .toAbsolutePath().normalize();
    private static final String TEST_ROOT_ID = TEST_ROOT_PATH.toString();
    private static final PackageDescriptor TEST_DESCRIPTOR = descriptor("acceptance-cancellation-model");
    private static final CompilationKey TEST_KEY = new CompilationKey(TEST_ROOT_ID, TEST_DESCRIPTOR);

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
     * Verifies a superseding request interrupts the running compilation thread.
     */
    @Test
    public void supersedingDidChange_interruptsInProgressCompilationThread() throws Exception {
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch interrupted = new CountDownLatch(1);
        Map<Integer, StableSnapshot> snapshots = Map.of(
                1, createSnapshot(new ContentVersion(1)),
                2, createSnapshot(new ContentVersion(2))
        );

        pipeline = createPipeline(new DualSnapshotStore(), task -> {
            if (task.contentVersion().value() == 1) {
                firstStarted.countDown();
                try {
                    new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    interrupted.countDown();
                    Thread.currentThread().interrupt();
                    throw new CancellationException("interrupted");
                }
            }
            return snapshots.get(task.contentVersion().value());
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));

        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertTrue(interrupted.getCount() == 0 || !pipeline.isCompiling(),
                        "Superseding didChange must interrupt or cancel the running compilation thread"));
    }

    /**
     * Verifies an interrupted compilation does not publish its partial result.
     */
    @Test
    public void interruptedCompilation_discardsPartialResultWithoutPublishingSnapshot() throws Exception {
        DualSnapshotStore snapshotStore = new DualSnapshotStore();
        CountDownLatch firstStarted = new CountDownLatch(1);
        Map<Integer, StableSnapshot> snapshots = Map.of(
                1, createSnapshot(new ContentVersion(1)),
                2, createSnapshot(new ContentVersion(2))
        );

        pipeline = createPipeline(snapshotStore, task -> {
            if (task.contentVersion().value() == 1) {
                firstStarted.countDown();
                try {
                    new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new CancellationException("interrupted");
                }
            }
            return snapshots.get(task.contentVersion().value());
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));

        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .until(() -> snapshotStore.getStable(TEST_KEY) != null);
        Assert.assertEquals(snapshotStore.getStable(TEST_KEY).contentVersion(), new ContentVersion(2),
                "Interrupted compilation must never publish a partial snapshot");
    }

    /**
     * Verifies the cancellation guard emits the cancellation event even if the compiler returns a result.
     */
    @Test
    public void cancelledTask_beforePublish_emitsCancellationEvent() throws Exception {
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch releaseCancelledTask = new CountDownLatch(1);
        CountDownLatch cancellationEvent = new CountDownLatch(1);
        Map<Integer, StableSnapshot> snapshots = Map.of(
                1, createSnapshot(new ContentVersion(1)),
                2, createSnapshot(new ContentVersion(2))
        );

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("cancelled-task-listener", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_COMPILATION_CANCELLED), event -> cancellationEvent.countDown());
        pipeline = new CompilationPipeline(TEST_KEY, new DualSnapshotStore(), eventBus, task -> {
            if (task.contentVersion().value() == 1) {
                firstStarted.countDown();
                releaseCancelledTask.await(5, TimeUnit.SECONDS);
            }
            return snapshots.get(task.contentVersion().value());
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));
        releaseCancelledTask.countDown();

        Assert.assertTrue(cancellationEvent.await(3, TimeUnit.SECONDS),
                "Cancelled compilations must emit CE-E3 before publication is skipped");
    }

    /**
     * Verifies the publication guard prevents cancelled results from overwriting the latest snapshot.
     */
    @Test
    public void cancelledTask_publicationGuardPreventsStaleSnapshotOverwrite() throws Exception {
        DualSnapshotStore snapshotStore = new DualSnapshotStore();
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch releaseCancelledTask = new CountDownLatch(1);
        Map<Integer, StableSnapshot> snapshots = Map.of(
                1, createSnapshot(new ContentVersion(1)),
                2, createSnapshot(new ContentVersion(2))
        );

        pipeline = createPipeline(snapshotStore, task -> {
            if (task.contentVersion().value() == 1) {
                firstStarted.countDown();
                releaseCancelledTask.await(5, TimeUnit.SECONDS);
            }
            return snapshots.get(task.contentVersion().value());
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));
        releaseCancelledTask.countDown();

        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertEquals(snapshotStore.getStable(TEST_KEY).contentVersion(),
                        new ContentVersion(2), "Cancellation guard must prevent stale snapshots from being published"));
    }

    /**
     * Verifies a superseded compilation does not cancel the replacement in-progress snapshot.
     */
    @Test
    public void supersededCompilation_keepsReplacementInProgressSnapshotVisibleUntilPublish() throws Exception {
        DualSnapshotStore snapshotStore = new DualSnapshotStore();
        StableSnapshot previousSnapshot = createSnapshot(new ContentVersion(0));
        StableSnapshot replacementSnapshot = createSnapshot(new ContentVersion(2));
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch replacementStarted = new CountDownLatch(1);
        CountDownLatch releaseReplacement = new CountDownLatch(1);
        snapshotStore.publishStable(TEST_KEY, previousSnapshot);

        pipeline = createPipeline(snapshotStore, task -> {
            if (task.contentVersion().value() == 1) {
                firstStarted.countDown();
                try {
                    new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new CancellationException("interrupted");
                }
                throw new AssertionError("Superseded compilation should be interrupted");
            }
            replacementStarted.countDown();
            releaseReplacement.await(5, TimeUnit.SECONDS);
            return replacementSnapshot;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");

        pipeline.requestCompilation(new ContentVersion(2));
        Assert.assertTrue(replacementStarted.await(3, TimeUnit.SECONDS), "Replacement compilation did not start");

        Assert.assertSame(snapshotStore.getStable(TEST_KEY), previousSnapshot,
                "Consumers calling getStable() during replacement compilation must still see the last published "
                        + "snapshot");
        InProgressSnapshot inProgressSnapshot = snapshotStore.getInProgress(TEST_KEY);
        Assert.assertNotNull(inProgressSnapshot,
                "Replacement compilation must remain visible through getInProgress() until it publishes");
        Assert.assertFalse(inProgressSnapshot.compilation(() -> {
        }).isDone(), "Replacement in-progress compilation future must stay pending while compilation is running");

        releaseReplacement.countDown();

        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertEquals(snapshotStore.getStable(TEST_KEY).contentVersion(),
                        new ContentVersion(2), "Replacement compilation must publish the new stable snapshot"));
    }

    /**
     * Verifies every compilation phase boundary observes cancellation.
     *
     * @param phase phase boundary under test
     */
    @Test(dataProvider = "phaseBoundaries")
    public void cancelledCompileTask_throwsAtEveryPhaseBoundary(CompilationPhase phase) {
        CompileTask task = new CompileTask(TEST_DESCRIPTOR, TEST_ROOT_ID, new ContentVersion(5),
                new CancellationToken());
        task.cancel();

        Assert.assertThrows(CancellationException.class,
                () -> task.advancePhase(phase));
    }

    /**
     * Verifies rapid file switching keeps at most one active compilation per project worker.
     */
    @Test
    public void rapidFileSwitching_keepsAtMostOneActiveCompilationPerProject() throws Exception {
        AtomicInteger activeCompilations = new AtomicInteger();
        AtomicInteger maxConcurrentCompilations = new AtomicInteger();
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        Map<Integer, StableSnapshot> snapshots = Map.of(
                1, createSnapshot(new ContentVersion(1)),
                2, createSnapshot(new ContentVersion(2)),
                3, createSnapshot(new ContentVersion(3)),
                4, createSnapshot(new ContentVersion(4)),
                5, createSnapshot(new ContentVersion(5))
        );

        pipeline = createPipeline(new DualSnapshotStore(), task -> {
            int activeNow = activeCompilations.incrementAndGet();
            maxConcurrentCompilations.updateAndGet(previous -> Math.max(previous, activeNow));
            try {
                if (task.contentVersion().value() == 1) {
                    firstStarted.countDown();
                    releaseFirst.await(5, TimeUnit.SECONDS);
                }
                return snapshots.get(task.contentVersion().value());
            } finally {
                activeCompilations.decrementAndGet();
            }
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "Initial compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));
        pipeline.requestCompilation(new ContentVersion(3));
        pipeline.requestCompilation(new ContentVersion(4));
        pipeline.requestCompilation(new ContentVersion(5));
        releaseFirst.countDown();

        Awaitility.await().atMost(3, TimeUnit.SECONDS)
                .untilAsserted(() -> Assert.assertEquals(maxConcurrentCompilations.get(), 1,
                        "Only one compilation may be active at any time per project worker"));
    }

    /**
     * Provides all compilation phase boundaries.
     *
     * @return phase boundary test data
     */
    @DataProvider(name = "phaseBoundaries")
    public Object[][] phaseBoundaries() {
        return new Object[][]{
                {CompilationPhase.POST_PARSE},
                {CompilationPhase.POST_TYPE_CHECK},
                {CompilationPhase.POST_DIAGNOSTICS}
        };
    }

    private CompilationPipeline createPipeline(DualSnapshotStore snapshotStore,
                                               CompilationPipeline.CompilationAction action) {
        eventBus = new EventSyncPubSubHolder();
        return new CompilationPipeline(TEST_KEY, snapshotStore, eventBus, action);
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
}
