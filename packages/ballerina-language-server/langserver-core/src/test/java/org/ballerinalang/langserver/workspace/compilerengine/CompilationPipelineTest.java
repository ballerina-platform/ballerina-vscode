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

import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.CancellationToken;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.ResolutionResult;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.workspacemanager.LockingMode;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.lang.annotation.Annotation;
import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import javax.annotation.Nonnull;

import static org.mockito.Mockito.mock;


/**
 * Tests for CancellationToken, CompileTask, and CompilationPipeline.
 *
 * @since 1.7.0
 */
public class CompilationPipelineTest {

    private static final PackageDescriptor TEST_DESCRIPTOR = createDescriptor("project");

    private CompilationPipeline pipeline;
    private EventSyncPubSubHolder eventBus;

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

    // ---- CancellationToken ----

    @Test
    public void token_initiallyNotCancelled() {
        CancellationToken token = new CancellationToken();
        Assert.assertFalse(token.isCancelled());
    }

    @Test
    public void token_cancelSetsFlagIrreversibly() {
        CancellationToken token = new CancellationToken();
        token.cancel();
        Assert.assertTrue(token.isCancelled());
    }

    @Test
    public void token_cancelIsIdempotent() {
        CancellationToken token = new CancellationToken();
        token.cancel();
        token.cancel();
        Assert.assertTrue(token.isCancelled());
    }

    @Test(expectedExceptions = CancellationException.class)
    public void token_checkCancelledThrowsAfterCancel() {
        CancellationToken token = new CancellationToken();
        token.cancel();
        token.checkCancelled();
    }

    @Test
    public void token_checkCancelledDoesNothingWhenNotCancelled() {
        CancellationToken token = new CancellationToken();
        token.checkCancelled(); // should not throw
    }

    @Test
    public void token_isThreadSafe() throws InterruptedException {
        CancellationToken token = new CancellationToken();
        int threadCount = 8;
        CountDownLatch ready = new CountDownLatch(threadCount);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);

        for (int i = 0; i < threadCount; i++) {
            int id = i;
            executor.submit(() -> {
                ready.countDown();
                try {
                    go.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                if (id == 0) {
                    token.cancel();
                }
                token.isCancelled();
            });
        }

        ready.await(5, TimeUnit.SECONDS);
        go.countDown();
        executor.shutdown();
        Assert.assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
        Assert.assertTrue(token.isCancelled());
    }

    // ---- CompileTask ----

    @Test
    public void task_startsAtPreParsePhase() {
        CompileTask task = createTask(new ContentVersion(1));
        Assert.assertEquals(task.currentPhase(), CompilationPhase.PRE_PARSE);
    }

    @Test
    public void task_advancePhaseUpdatesPhase() {
        CompileTask task = createTask(new ContentVersion(1));
        task.advancePhase(CompilationPhase.POST_PARSE);
        Assert.assertEquals(task.currentPhase(), CompilationPhase.POST_PARSE);
    }

    @Test(expectedExceptions = CancellationException.class)
    public void task_advancePhaseThrowsWhenCancelled() {
        CompileTask task = createTask(new ContentVersion(1));
        task.cancel();
        task.advancePhase(CompilationPhase.POST_PARSE);
    }

    @Test
    public void task_cancelDelegatesToToken() {
        CancellationToken token = new CancellationToken();
        CompileTask task = new CompileTask(testDescriptor(), new ContentVersion(1), token);
        task.cancel();
        Assert.assertTrue(token.isCancelled());
        Assert.assertTrue(task.isCancelled());
    }

    @Test
    public void task_bindsContentVersion() {
        ContentVersion version = new ContentVersion(42);
        CompileTask task = createTask(version);
        Assert.assertEquals(task.contentVersion(), version);
        Assert.assertNotNull(task.createdAt());
        Assert.assertNotNull(task.cancellationToken());
        Assert.assertEquals(task.descriptor(), testDescriptor());
    }

    @Test
    public void task_rejectsNullDescriptor() throws NoSuchMethodException {
        Constructor<CompileTask> ctor = CompileTask.class.getDeclaredConstructor(
                PackageDescriptor.class, ContentVersion.class, CancellationToken.class);
        Assert.assertTrue(hasNonnull(ctor.getParameterAnnotations()[0]),
                "descriptor parameter must be @Nonnull");
    }

    @Test
    public void task_rejectsNullContentVersion() throws NoSuchMethodException {
        Constructor<CompileTask> ctor = CompileTask.class.getDeclaredConstructor(
                PackageDescriptor.class, ContentVersion.class, CancellationToken.class);
        Assert.assertTrue(hasNonnull(ctor.getParameterAnnotations()[1]),
                "contentVersion parameter must be @Nonnull");
    }

    @Test
    public void task_rejectsNullCancellationToken() throws NoSuchMethodException {
        Constructor<CompileTask> ctor = CompileTask.class.getDeclaredConstructor(
                PackageDescriptor.class, ContentVersion.class, CancellationToken.class);
        Assert.assertTrue(hasNonnull(ctor.getParameterAnnotations()[2]),
                "cancellationToken parameter must be @Nonnull");
    }

    private static boolean hasNonnull(Annotation[] annotations) {
        return Arrays.stream(annotations).anyMatch(a -> a.annotationType() == Nonnull.class);
    }

    // ---- CompilationPipeline ----

    @Test
    public void pipeline_debounceCoalescesRapidRequests() throws InterruptedException {
        AtomicInteger compileCount = new AtomicInteger(0);
        CountDownLatch done = new CountDownLatch(1);
        List<ContentVersion> compiledVersions = Collections.synchronizedList(new ArrayList<>());
        // Pre-create snapshot on test thread to avoid Mockito issues on worker thread
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(5));

        pipeline = createPipeline(task -> {
            compileCount.incrementAndGet();
            compiledVersions.add(task.contentVersion());
            done.countDown();
            return snapshot;
        });

        // Fire 5 rapid requests — only the last should compile
        for (int i = 1; i <= 5; i++) {
            pipeline.requestCompilation(new ContentVersion(i));
        }

        Assert.assertTrue(done.await(3, TimeUnit.SECONDS), "Compilation did not complete");
        Thread.sleep(300);
        Assert.assertEquals(compileCount.get(), 1, "Debounce should coalesce to 1 compilation");
        Assert.assertEquals(compiledVersions.get(0), new ContentVersion(5));
    }

    @Test
    public void pipeline_lifoReplacementCancelsPreviousTask() throws InterruptedException {
        CountDownLatch firstStarted = new CountDownLatch(1);
        StableSnapshot snap2 = createMockSnapshot(new ContentVersion(2));
        CountDownLatch firstCancelled = new CountDownLatch(1);
        CountDownLatch allDone = new CountDownLatch(1);

        pipeline = createPipeline(task -> {
            if (task.contentVersion().equals(new ContentVersion(1))) {
                firstStarted.countDown();
                try {
                    // Block until interrupted by superseding request (ADR-018 Mandate 8)
                    new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    firstCancelled.countDown();
                    Thread.currentThread().interrupt();
                    throw new CancellationException("interrupted by superseding request");
                }
                throw new AssertionError("Should have been interrupted");
            } else {
                allDone.countDown();
                return snap2;
            }
        });

        // Request version 1 — will start and block on worker thread
        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "First compilation did not start");

        // Request version 2 — triggers LIFO cancellation + interrupt after 150ms debounce
        pipeline.requestCompilation(new ContentVersion(2));

        Assert.assertTrue(firstCancelled.await(3, TimeUnit.SECONDS),
                "First task should have been interrupted by superseding request");
        Assert.assertTrue(allDone.await(3, TimeUnit.SECONDS), "Second compilation did not complete");
    }

    @Test
    public void pipeline_publishesSnapshotOnSuccess() throws InterruptedException {
        DualSnapshotStore store = new DualSnapshotStore();
        CountDownLatch done = new CountDownLatch(1);
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));

        pipeline = createPipeline(store, task -> {
            done.countDown();
            return snapshot;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(done.await(3, TimeUnit.SECONDS));
        Thread.sleep(200);
        Assert.assertNotNull(store.getStable(testKey()));
    }

    @Test
    public void pipeline_emitsCEE1OnSuccessfulPublish() throws InterruptedException {
        CountDownLatch eventReceived = new CountDownLatch(1);
        List<EventKind> receivedKinds = Collections.synchronizedList(new ArrayList<>());
        List<DomainEvent> receivedEvents = Collections.synchronizedList(new ArrayList<>());
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_SNAPSHOT_PUBLISHED), event -> {
                    receivedKinds.add(event.eventKind());
                    receivedEvents.add(event);
                    eventReceived.countDown();
                });

        pipeline = createPipeline(eventBus, task -> snapshot);

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(eventReceived.await(3, TimeUnit.SECONDS));
        Assert.assertTrue(receivedKinds.contains(EventKind.COMPILER_SNAPSHOT_PUBLISHED));
        Assert.assertTrue(receivedEvents.get(0) instanceof CompilerEvent ce
                && "project".equals(ce.descriptorName()),
                "Event descriptor name must match the pipeline's source root identifier");
    }

    @Test
    public void pipeline_emitsCEE2OnFailure() throws InterruptedException {
        CountDownLatch eventReceived = new CountDownLatch(1);
        List<EventKind> receivedKinds = Collections.synchronizedList(new ArrayList<>());

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_COMPILATION_FAILED), event -> {
                    receivedKinds.add(event.eventKind());
                    eventReceived.countDown();
                });

        pipeline = createPipeline(eventBus, task -> {
            throw new RuntimeException("Compilation error");
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(eventReceived.await(3, TimeUnit.SECONDS));
        Assert.assertTrue(receivedKinds.contains(EventKind.COMPILER_COMPILATION_FAILED));
    }

    @Test
    public void pipeline_emitsCEE3OnCancellation() throws InterruptedException {
        CountDownLatch eventReceived = new CountDownLatch(1);
        List<EventKind> receivedKinds = Collections.synchronizedList(new ArrayList<>());

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_COMPILATION_CANCELLED), event -> {
                    receivedKinds.add(event.eventKind());
                    eventReceived.countDown();
                });

        pipeline = createPipeline(eventBus, task -> {
            throw new CancellationException("Cancelled");
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(eventReceived.await(3, TimeUnit.SECONDS));
        Assert.assertTrue(receivedKinds.contains(EventKind.COMPILER_COMPILATION_CANCELLED));
    }

    @Test
    public void pipeline_staleVersionNotPublished() throws InterruptedException {
        DualSnapshotStore store = new DualSnapshotStore();
        CountDownLatch v1Started = new CountDownLatch(1);
        CountDownLatch v2Requested = new CountDownLatch(1);
        CountDownLatch v1Done = new CountDownLatch(1);
        StableSnapshot snap1 = createMockSnapshot(new ContentVersion(1));
        StableSnapshot snap2 = createMockSnapshot(new ContentVersion(2));

        pipeline = createPipeline(store, task -> {
            if (task.contentVersion().equals(new ContentVersion(1))) {
                v1Started.countDown();
                v2Requested.await(5, TimeUnit.SECONDS);
                v1Done.countDown();
                return snap1;
            }
            return snap2;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(v1Started.await(3, TimeUnit.SECONDS));

        // Request version 2 — makes version 1 stale
        pipeline.requestCompilation(new ContentVersion(2));
        v2Requested.countDown();

        Assert.assertTrue(v1Done.await(3, TimeUnit.SECONDS));
        Thread.sleep(500);

        StableSnapshot snap = store.getStable(testKey());
        if (snap != null) {
            Assert.assertNotEquals(snap.contentVersion(), new ContentVersion(1),
                    "Stale version 1 should not be published");
        }
    }

    @Test
    public void pipeline_closeStopsAllWork() throws InterruptedException {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));

        pipeline = createPipeline(task -> {
            started.countDown();
            proceed.await(5, TimeUnit.SECONDS);
            return snapshot;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(started.await(3, TimeUnit.SECONDS));

        pipeline.close();

        // Further requests should be ignored
        pipeline.requestCompilation(new ContentVersion(2));
        proceed.countDown();

        Thread.sleep(300);
        Assert.assertFalse(pipeline.isCompiling());
    }

    @Test
    public void pipeline_closeIsIdempotent() {
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));
        pipeline = createPipeline(task -> snapshot);
        pipeline.close();
        pipeline.close(); // should not throw
    }

    @Test
    public void pipeline_isCompilingReflectsState() throws InterruptedException {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch proceed = new CountDownLatch(1);
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));

        pipeline = createPipeline(task -> {
            started.countDown();
            proceed.await(5, TimeUnit.SECONDS);
            return snapshot;
        });

        Assert.assertFalse(pipeline.isCompiling());

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(started.await(3, TimeUnit.SECONDS));
        Assert.assertTrue(pipeline.isCompiling());

        proceed.countDown();
        Thread.sleep(300);
        Assert.assertFalse(pipeline.isCompiling());
    }

    @Test(expectedExceptions = NullPointerException.class)
    public void pipeline_rejectsNullKey() {
        EventSyncPubSubHolder bus = new EventSyncPubSubHolder();
        try {
            new CompilationPipeline((CompilationKey) null, new DualSnapshotStore(), bus,
                    task -> createMockSnapshot(task.contentVersion()));
        } finally {
            bus.close();
        }
    }

    @Test
    public void pipeline_requestCompilationMarksContentVersionNonnull() throws NoSuchMethodException {
        Assert.assertTrue(hasNonnull(CompilationPipeline.class.getMethod("requestCompilation",
                        ContentVersion.class).getParameterAnnotations()[0]),
                "contentVersion parameter must be @Nonnull");
    }

    @Test
    public void pipeline_interruptsActiveWorkerOnSupersedingRequest() throws InterruptedException {
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch interrupted = new CountDownLatch(1);
        StableSnapshot snap2 = createMockSnapshot(new ContentVersion(2));

        pipeline = createPipeline(task -> {
            if (task.contentVersion().equals(new ContentVersion(1))) {
                firstStarted.countDown();
                try {
                    new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    interrupted.countDown();
                    Thread.currentThread().interrupt();
                    throw new CancellationException("interrupted");
                }
            }
            return snap2;
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "First compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));

        Assert.assertTrue(interrupted.await(3, TimeUnit.SECONDS),
                "Superseding request must interrupt the active worker thread (ADR-018 Mandate 8)");
    }

    @Test
    public void pipeline_emitsCEE3WhenCancelledTaskCompletesNormally() throws InterruptedException {
        CountDownLatch firstStarted = new CountDownLatch(1);
        CountDownLatch releaseCancelledTask = new CountDownLatch(1);
        CountDownLatch cancellationEvent = new CountDownLatch(1);
        List<EventKind> receivedKinds = Collections.synchronizedList(new ArrayList<>());

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-cancel-event", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_COMPILATION_CANCELLED), event -> {
                    receivedKinds.add(event.eventKind());
                    cancellationEvent.countDown();
                });

        pipeline = new CompilationPipeline(testKey(), new DualSnapshotStore(), eventBus, task -> {
            if (task.contentVersion().equals(new ContentVersion(1))) {
                firstStarted.countDown();
                releaseCancelledTask.await(5, TimeUnit.SECONDS);
            }
            return createMockSnapshot(task.contentVersion());
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(firstStarted.await(3, TimeUnit.SECONDS), "First compilation did not start");
        pipeline.requestCompilation(new ContentVersion(2));
        releaseCancelledTask.countDown();

        Assert.assertTrue(cancellationEvent.await(3, TimeUnit.SECONDS),
                "Cancelled task that completes normally must emit CE-E3 (COMPILER_COMPILATION_CANCELLED)");
        Assert.assertTrue(receivedKinds.contains(EventKind.COMPILER_COMPILATION_CANCELLED));
    }

    @Test
    public void pipeline_treatsInterruptedExceptionAsCancellation() throws InterruptedException {
        CountDownLatch eventReceived = new CountDownLatch(1);
        List<EventKind> receivedKinds = Collections.synchronizedList(new ArrayList<>());

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-sub", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_COMPILATION_CANCELLED), event -> {
                    receivedKinds.add(event.eventKind());
                    eventReceived.countDown();
                });

        pipeline = new CompilationPipeline(testKey(), new DualSnapshotStore(), eventBus, task -> {
            throw new InterruptedException("Thread interrupted during compilation");
        });

        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(eventReceived.await(3, TimeUnit.SECONDS),
                "InterruptedException must be treated as cancellation and emit CE-E3");
        Assert.assertTrue(receivedKinds.contains(EventKind.COMPILER_COMPILATION_CANCELLED));
    }

    @Test
    public void pipeline_resolutionSuccessPublishesCEE5BAndCompiles() throws InterruptedException {
        CountDownLatch diagnosticsReady = new CountDownLatch(1);
        CountDownLatch resolutionCalled = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-ce-e5b", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY), event -> diagnosticsReady.countDown());

        pipeline = createPipeline(eventBus, new CompilationPipeline.CompilationAction() {
            @Override
            public ResolutionResult resolve(CompileTask task) {
                resolutionCalled.countDown();
                return new ResolutionResult(task.descriptor(), List.of(), true);
            }

            @Override
            public StableSnapshot compile(CompileTask task) {
                compileCount.incrementAndGet();
                return snapshot;
            }
        });

        pipeline.requestCompilation(new ContentVersion(1));

        Assert.assertTrue(resolutionCalled.await(3, TimeUnit.SECONDS));
        Assert.assertTrue(diagnosticsReady.await(3, TimeUnit.SECONDS));
        Assert.assertEquals(compileCount.get(), 1, "Compilation should run after successful resolution");
    }

    @Test
    public void pipeline_nonQualifyingResolutionFailurePublishesCEE5AAndSkipsCompilation() throws InterruptedException {
        CountDownLatch resolutionDiagnosticsReady = new CountDownLatch(1);
        CountDownLatch compilationDiagnosticsReady = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-ce-e5a", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY), event -> resolutionDiagnosticsReady.countDown());
        eventBus.subscribe("test-no-ce-e5b", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY),
                event -> compilationDiagnosticsReady.countDown());

        pipeline = createPipeline(eventBus, new CompilationPipeline.CompilationAction() {
            @Override
            public ResolutionResult resolve(CompileTask task) {
                return new ResolutionResult(task.descriptor(),
                        List.of(new ResolutionResult.ResolutionDiagnostic(ResolutionResult.Severity.ERROR,
                                "syntax error", "/tmp/project/main.bal")), false);
            }

            @Override
            public StableSnapshot compile(CompileTask task) {
                compileCount.incrementAndGet();
                return createMockSnapshot(task.contentVersion());
            }
        });

        pipeline.requestCompilation(new ContentVersion(1));

        Assert.assertTrue(resolutionDiagnosticsReady.await(3, TimeUnit.SECONDS));
        Assert.assertFalse(compilationDiagnosticsReady.await(300, TimeUnit.MILLISECONDS),
                "Resolution failure must not publish CE-E5b");
        Assert.assertEquals(compileCount.get(), 0, "Compilation must be skipped on non-qualifying resolution failure");
    }

    @Test
    public void pipeline_birCompilationFailurePublishesRecoveredAndRecompiles() throws InterruptedException {
        CountDownLatch recovered = new CountDownLatch(1);
        CountDownLatch diagnosticsReady = new CountDownLatch(1);
        AtomicInteger compileCount = new AtomicInteger(0);
        AtomicInteger recoveryCalls = new AtomicInteger(0);
        StableSnapshot snapshot = createMockSnapshot(new ContentVersion(1));

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-recovered", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_RESOLUTION_RECOVERED), event -> recovered.countDown());
        eventBus.subscribe("test-e5b-after-recovery", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY), event -> diagnosticsReady.countDown());

        pipeline = createPipeline(eventBus, new CompilationPipeline.CompilationAction() {
            @Override
            public ResolutionResult resolve(CompileTask task) {
                return new ResolutionResult(task.descriptor(), List.of(), true);
            }

            @Override
            public StableSnapshot compile(CompileTask task) {
                if (compileCount.getAndIncrement() == 0) {
                    throw new RuntimeException("failed to load the module foo.bir");
                }
                return snapshot;
            }

            @Override
            public LockingMode currentLockingMode(CompileTask task) {
                return LockingMode.LOCKED;
            }

            @Override
            public CompilationPipeline.RecoveryResult recover(CompileTask task, LockingMode initialMode,
                                                              Throwable cause) {
                recoveryCalls.incrementAndGet();
                return CompilationPipeline.RecoveryResult.success();
            }
        });

        pipeline.requestCompilation(new ContentVersion(1));

        Assert.assertTrue(recovered.await(3, TimeUnit.SECONDS), "BIR failure should publish recovery event");
        Assert.assertTrue(diagnosticsReady.await(3, TimeUnit.SECONDS),
                "Recovered pipeline should trigger a new successful compilation cycle");
        Assert.assertEquals(recoveryCalls.get(), 1, "Recovery ladder should be invoked once");
        Assert.assertTrue(compileCount.get() >= 2, "Compilation should be retried after recovery");
    }

    @Test
    public void pipeline_birCompilationFailurePublishesExhaustedWhenRecoveryFails() throws InterruptedException {
        CountDownLatch exhausted = new CountDownLatch(1);
        CountDownLatch diagnosticsReady = new CountDownLatch(1);
        AtomicInteger recoveryCalls = new AtomicInteger(0);

        eventBus = new EventSyncPubSubHolder();
        eventBus.subscribe("test-exhausted", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_RESOLUTION_EXHAUSTED), event -> exhausted.countDown());
        eventBus.subscribe("test-no-e5b-after-exhausted", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY), event -> diagnosticsReady.countDown());

        pipeline = createPipeline(eventBus, new CompilationPipeline.CompilationAction() {
            @Override
            public ResolutionResult resolve(CompileTask task) {
                return new ResolutionResult(task.descriptor(), List.of(), true);
            }

            @Override
            public StableSnapshot compile(CompileTask task) {
                throw new RuntimeException("failed to load the module bar.bir");
            }

            @Override
            public LockingMode currentLockingMode(CompileTask task) {
                return LockingMode.HARD;
            }

            @Override
            public CompilationPipeline.RecoveryResult recover(CompileTask task, LockingMode initialMode,
                                                              Throwable cause) {
                recoveryCalls.incrementAndGet();
                return CompilationPipeline.RecoveryResult.exhausted();
            }
        });

        pipeline.requestCompilation(new ContentVersion(1));

        Assert.assertTrue(exhausted.await(3, TimeUnit.SECONDS), "BIR failure should publish exhaustion event");
        Assert.assertFalse(diagnosticsReady.await(300, TimeUnit.MILLISECONDS),
                "Exhausted recovery must not publish CE-E5b");
        Assert.assertEquals(recoveryCalls.get(), 1, "Recovery ladder should be invoked once");
    }

    // ---- Semaphore-based concurrency limit ----

    @Test
    // RED: this test should fail — CompilationPipeline does not yet acquire/release compilationPermits
    public void pipeline_sharedSemaphoreEnforcesSerialExecution() throws InterruptedException {
        Semaphore shared = new Semaphore(1, true);

        CountDownLatch aStarted = new CountDownLatch(1);
        CountDownLatch aCanFinish = new CountDownLatch(1);
        CountDownLatch bStarted = new CountDownLatch(1);
        AtomicBoolean overlap = new AtomicBoolean(false);
        AtomicBoolean aRunning = new AtomicBoolean(false);

        DualSnapshotStore storeA = new DualSnapshotStore();
        DualSnapshotStore storeB = new DualSnapshotStore();
        EventSyncPubSubHolder busA = new EventSyncPubSubHolder();
        EventSyncPubSubHolder busB = new EventSyncPubSubHolder();
        PackageDescriptor descA = createDescriptor("alpha");
        PackageDescriptor descB = createDescriptor("beta");

        StableSnapshot snapA = createMockSnapshot(new ContentVersion(1));
        StableSnapshot snapB = createMockSnapshot(new ContentVersion(1));

        CompilationPipeline pipelineA = new CompilationPipeline(testKey(descA, "/root/alpha"), storeA, busA,
                task -> {
                    aRunning.set(true);
                    aStarted.countDown();
                    aCanFinish.await(5, TimeUnit.SECONDS);
                    aRunning.set(false);
                    return snapA;
                }, shared);

        CompilationPipeline pipelineB = new CompilationPipeline(testKey(descB, "/root/beta"), storeB, busB,
                task -> {
                    if (aRunning.get()) {
                        overlap.set(true);
                    }
                    bStarted.countDown();
                    return snapB;
                }, shared);

        try {
            pipelineA.requestCompilation(new ContentVersion(1));
            Assert.assertTrue(aStarted.await(3, TimeUnit.SECONDS), "Pipeline A must start");

            pipelineB.requestCompilation(new ContentVersion(1));
            // B must NOT start while A holds the single permit
            Assert.assertFalse(bStarted.await(400, TimeUnit.MILLISECONDS),
                    "Pipeline B must not compile while A holds the semaphore");

            aCanFinish.countDown();
            Assert.assertTrue(bStarted.await(3, TimeUnit.SECONDS), "Pipeline B must start after A releases");
            Assert.assertFalse(overlap.get(), "Compilations must not overlap");
        } finally {
            pipelineA.close();
            pipelineB.close();
            busA.close();
            busB.close();
        }
    }

    @Test
    // RED: this test should fail — CompilationPipeline does not yet acquire compilationPermits,
    // so with Semaphore(0) the action would run immediately instead of blocking
    public void pipeline_closeWhileBlockedOnSemaphoreCompletesCleanly() throws InterruptedException {
        Semaphore noPermits = new Semaphore(0);
        AtomicBoolean compileActionCalled = new AtomicBoolean(false);

        DualSnapshotStore store = new DualSnapshotStore();
        EventSyncPubSubHolder bus = new EventSyncPubSubHolder();
        PackageDescriptor desc = createDescriptor("blocked-project");
        StableSnapshot snap = createMockSnapshot(new ContentVersion(1));

        CompilationPipeline blocked = new CompilationPipeline(testKey(desc, "/root/blocked"), store, bus,
                task -> {
                    compileActionCalled.set(true);
                    return snap;
                }, noPermits);

        try {
            blocked.requestCompilation(new ContentVersion(1));
            // Give the worker time to reach (and block on) the semaphore
            Thread.sleep(250);

            // Action must NOT have been called — worker is blocked waiting for a permit
            Assert.assertFalse(compileActionCalled.get(),
                    "Compile action must not run while worker is blocked on semaphore");

            // close() must complete without hanging
            CountDownLatch closeDone = new CountDownLatch(1);
            Thread closer = new Thread(() -> {
                blocked.close();
                closeDone.countDown();
            });
            closer.setDaemon(true);
            closer.start();
            Assert.assertTrue(closeDone.await(3, TimeUnit.SECONDS),
                    "close() must complete cleanly even when worker is blocked on semaphore");
        } finally {
            bus.close();
        }
    }

    @Test
    public void pipeline_defaultConstructorAllowsUnboundedConcurrency() throws InterruptedException {
        // Existing 4-param constructor must still work — no Semaphore injected, no limit
        CountDownLatch done = new CountDownLatch(1);
        StableSnapshot snap = createMockSnapshot(new ContentVersion(1));
        pipeline = createPipeline(task -> {
            done.countDown();
            return snap;
        });
        pipeline.requestCompilation(new ContentVersion(1));
        Assert.assertTrue(done.await(3, TimeUnit.SECONDS),
                "Pipeline created via default constructor must compile normally");
    }

    // ---- Helpers ----

    private static PackageDescriptor testDescriptor() {
        return TEST_DESCRIPTOR;
    }

    private static CompilationKey testKey() {
        return new CompilationKey("/test-root/project", TEST_DESCRIPTOR);
    }

    private static CompilationKey testKey(PackageDescriptor descriptor, String root) {
        return new CompilationKey(root, descriptor);
    }

    private CompileTask createTask(ContentVersion version) {
        return new CompileTask(testDescriptor(), version, new CancellationToken());
    }

    private CompilationPipeline createPipeline(CompilationPipeline.CompilationAction action) {
        eventBus = new EventSyncPubSubHolder();
        return new CompilationPipeline(testKey(), new DualSnapshotStore(), eventBus, action);
    }

    private CompilationPipeline createPipeline(DualSnapshotStore store,
                                               CompilationPipeline.CompilationAction action) {
        eventBus = new EventSyncPubSubHolder();
        return new CompilationPipeline(testKey(), store, eventBus, action);
    }

    private CompilationPipeline createPipeline(EventSyncPubSubHolder bus,
                                               CompilationPipeline.CompilationAction action) {
        this.eventBus = bus;
        return new CompilationPipeline(testKey(), new DualSnapshotStore(), bus, action);
    }

    private static StableSnapshot createMockSnapshot(ContentVersion version) {
        return new StableSnapshot(Map.of(), Map.of(), Map.of(),
                mock(PackageCompilation.class), version);
    }

    private static PackageDescriptor createDescriptor(String packageNameValue) {
        PackageDescriptor descriptor = mock(PackageDescriptor.class);
        PackageName packageName = mock(PackageName.class);
        org.mockito.Mockito.when(descriptor.name()).thenReturn(packageName);
        org.mockito.Mockito.when(packageName.value()).thenReturn(packageNameValue);
        return descriptor;
    }
}
