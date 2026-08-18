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
import org.ballerinalang.langserver.workspace.executionmanager.ProcessId;
import org.ballerinalang.langserver.workspace.workspacemanager.project.EvictionReason;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.ballerinalang.langserver.workspace.execution.ExecutionProcess.ExecutionMode;
import static org.ballerinalang.langserver.workspace.execution.ExecutionProcess.ProcessState;


/**
 * Tests execution manager aggregate/service behavior for T-013.
 *
 * @since 1.7.0
 */
public class ExecutionManagerComponentsTest {

    private EventSyncPubSubHolder eventBus;
    private Path tempDir;

    @BeforeMethod
    public void setUp() throws Exception {
        this.eventBus = new EventSyncPubSubHolder();
        this.tempDir = Files.createTempDirectory("execution-manager-test");
    }

    @AfterMethod
    public void tearDown() throws Exception {
        eventBus.close();
        Files.walk(tempDir)
                .sorted((left, right) -> right.compareTo(left))
                .forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (Exception ignored) {
                    }
                });
    }

    /**
     * Verifies valid FSM transitions emit structured transition events.
     */
    @Test
    public void executionProcess_validTransitions_emitStructuredEvents() {
        Path sourceRootPath = sourceRootPath(tempDir.resolve("project-a"));
        DocumentUri sourceRoot = sourceRoot(sourceRootPath);
        FakeProcess fake = new FakeProcess(true);

        ExecutionProcess process = new ExecutionProcess(new ProcessId("p-1"), sourceRoot, ExecutionMode.RUN,
                sourceRootPath, Duration.ofMillis(25), fake, streamSource -> {
        });

        process.markRunning();
        process.terminate(ExecutionProcess.TerminationReason.USER_REQUESTED);

        Assert.assertEquals(process.state(), ProcessState.TERMINATED);
        Assert.assertEquals(process.transitionEvents().size(), 3);
        Assert.assertEquals(process.transitionEvents().get(0).fromState(), ProcessState.STARTING);
        Assert.assertEquals(process.transitionEvents().get(0).toState(), ProcessState.RUNNING);
        Assert.assertEquals(process.transitionEvents().get(1).fromState(), ProcessState.RUNNING);
        Assert.assertEquals(process.transitionEvents().get(1).toState(), ProcessState.TERMINATING);
        Assert.assertEquals(process.transitionEvents().get(2).fromState(), ProcessState.TERMINATING);
        Assert.assertEquals(process.transitionEvents().get(2).toState(), ProcessState.TERMINATED);
        Assert.assertNotNull(process.transitionEvents().get(0).eventId());
        Assert.assertNotNull(process.transitionEvents().get(0).timestamp());
    }

    /**
     * Verifies invalid FSM transition throws IllegalStateException.
     */
    @Test(expectedExceptions = IllegalStateException.class)
    public void executionProcess_invalidTransition_throws() {
        Path sourceRootPath = sourceRootPath(tempDir.resolve("project-b"));
        DocumentUri sourceRoot = sourceRoot(sourceRootPath);
        FakeProcess fake = new FakeProcess(true);

        ExecutionProcess process = new ExecutionProcess(new ProcessId("p-2"), sourceRoot, ExecutionMode.RUN,
                sourceRootPath, Duration.ofMillis(25), fake, streamSource -> {
        });

        process.terminate(ExecutionProcess.TerminationReason.USER_REQUESTED);
    }

    /**
     * Verifies shutdown sequence performs TERM then KILL on timeout.
     */
    @Test
    public void executionProcess_shutdownSequence_termThenKillOnTimeout() {
        Path sourceRootPath = sourceRootPath(tempDir.resolve("project-c"));
        DocumentUri sourceRoot = sourceRoot(sourceRootPath);
        FakeProcess fake = new FakeProcess(false);
        List<String> sequence = new ArrayList<>();

        ExecutionProcess process = new ExecutionProcess(new ProcessId("p-3"), sourceRoot, ExecutionMode.RUN,
                sourceRootPath, Duration.ofMillis(10), fake, streamSource -> {
        }, ignored -> {
            sequence.add("TERM");
            fake.destroy();
        }, ignored -> {
            sequence.add("KILL");
            fake.destroyForcibly();
        });

        process.markRunning();
        process.terminate(ExecutionProcess.TerminationReason.USER_REQUESTED);

        Assert.assertEquals(sequence, List.of("TERM", "KILL"));
    }

    /**
     * Verifies project cleanup stops and removes all matching processes.
     */
    @Test
    public void processRegistry_cleanup_stopsAndRemovesProjectProcesses() {
        DocumentUri sourceRootA = sourceRoot(tempDir.resolve("project-d"));
        DocumentUri sourceRootB = sourceRoot(tempDir.resolve("project-e"));
        ProcessRegistry registry = new ProcessRegistry(4);

        ExecutionProcess p1 = runningProcess("p-4", sourceRootA);
        ExecutionProcess p2 = runningProcess("p-5", sourceRootA);
        ExecutionProcess p3 = runningProcess("p-6", sourceRootB);

        registry.register(p1);
        registry.register(p2);
        registry.register(p3);

        List<ProcessId> removed = registry.cleanup(sourceRootA, ExecutionProcess.TerminationReason.EVICTION_CLEANUP);

        Assert.assertEquals(removed.size(), 2);
        Assert.assertEquals(registry.activeProcessCount(), 1);
        Assert.assertTrue(registry.find(new ProcessId("p-6")).isPresent());
    }

    /**
     * Verifies registry enforces the configured active-process bound.
     */
    @Test(expectedExceptions = IllegalStateException.class)
    public void processRegistry_enforcesBoundedActiveCount() {
        DocumentUri sourceRoot = sourceRoot(tempDir.resolve("project-f"));
        ProcessRegistry registry = new ProcessRegistry(1);

        registry.register(runningProcess("p-7", sourceRoot));
        registry.register(runningProcess("p-8", sourceRoot));
    }

    /**
     * Verifies run publishes EM-E1/EM-E2 and output streaming uses virtual threads.
     */
    @Test(timeOut = 15000)
    public void executionService_run_publishesStartAndOutput_usingVirtualThreads() throws Exception {
        skipOnWindows();
        List<EventKind> events = new CopyOnWriteArrayList<>();
        List<Boolean> virtualThreadFlags = new CopyOnWriteArrayList<>();
        CountDownLatch latch = new CountDownLatch(3);

        subscribe(Set.of(EventKind.EXECUTION_PROCESS_STARTED, EventKind.EXECUTION_PROCESS_OUTPUT), event -> {
            events.add(event.eventKind());
            latch.countDown();
        });

        ExecutionServiceImpl service = new ExecutionServiceImpl(eventBus, Duration.ofMillis(200),
                8, virtualThreadFlags::add);

        Path sourceRootPath = Files.createDirectories(tempDir.resolve("project-g")).toAbsolutePath().normalize();
        Path sourceFile = sourceRootPath.resolve("main.bal");
        Files.writeString(sourceFile, "function main() {}");

        RunContext context = new RunContext(
                "/bin/sh",
                sourceFile,
                List.of("-c", "printf 'out-line\\n'; printf 'err-line\\n' 1>&2; sleep 2"),
                Map.of(),
                null);

        ProcessId processId = service.run(context);
        Assert.assertTrue(latch.await(6, TimeUnit.SECONDS));
        Assert.assertTrue(events.contains(EventKind.EXECUTION_PROCESS_STARTED));
        Assert.assertTrue(events.contains(EventKind.EXECUTION_PROCESS_OUTPUT));
        Assert.assertFalse(virtualThreadFlags.isEmpty());
        Assert.assertTrue(virtualThreadFlags.stream().allMatch(Boolean::booleanValue));

        service.stopExecution(processId);
    }

    /**
     * Verifies WM-E2 and WM-E4 subscriptions trigger expected process cleanup behavior.
     */
    @Test(timeOut = 15000)
    public void executionService_subscriptions_cleanupOnEvictionAndUnsupportedKind() throws Exception {
        skipOnWindows();
        AtomicInteger terminatedCount = new AtomicInteger();
        CountDownLatch terminationLatch = new CountDownLatch(2);

        subscribe(Set.of(EventKind.EXECUTION_PROCESS_TERMINATED), event -> {
            terminatedCount.incrementAndGet();
            terminationLatch.countDown();
        });

        ExecutionServiceImpl service = new ExecutionServiceImpl(eventBus, Duration.ofMillis(200),
                8, ignored -> {
        });

        Path sourceRootPath = Files.createDirectories(tempDir.resolve("project-h")).toAbsolutePath().normalize();
        Path sourceFile = sourceRootPath.resolve("service.bal");
        Files.writeString(sourceFile, "service / on new http:Listener(8080) {}");
        DocumentUri sourceRoot = new DocumentUri.FileUri(sourceRootPath.toUri());
        ProcessId running = service.run(
                new RunContext("/bin/sh", sourceFile, List.of("-c", "sleep 10"), Map.of(), null));

        eventBus.publish(new ProjectKindTransitionedEvent(sourceRoot.uri(), ProjectKind.BUILD));
        TimeUnit.MILLISECONDS.sleep(250);
        Assert.assertNotEquals(service.queryExecutionStatus(running), ProcessState.TERMINATED);

        eventBus.publish(new ProjectKindTransitionedEvent(sourceRoot.uri(), ProjectKind.BALA));
        TimeUnit.MILLISECONDS.sleep(500);

        Path sourceRootPath2 = Files.createDirectories(tempDir.resolve("project-i")).toAbsolutePath().normalize();
        Path sourceFile2 = sourceRootPath2.resolve("run.bal");
        Files.writeString(sourceFile2, "function main() {}");
        DocumentUri sourceRoot2 = new DocumentUri.FileUri(sourceRootPath2.toUri());
        service.run(new RunContext("/bin/sh", sourceFile2, List.of("-c", "sleep 10"), Map.of(), null));

        eventBus.publish(new ProjectEvictedEvent(sourceRoot2.uri(), EvictionReason.DOCUMENT_CLOSED));

        Assert.assertTrue(terminationLatch.await(8, TimeUnit.SECONDS));
        Assert.assertEquals(terminatedCount.get(), 2);
    }

    private ExecutionProcess runningProcess(String id, DocumentUri sourceRoot) {
        ExecutionProcess process = new ExecutionProcess(new ProcessId(id), sourceRoot, ExecutionMode.RUN,
                Path.of(sourceRoot.uri()), Duration.ofMillis(25), new FakeProcess(true),
                streamSource -> {
        });
        process.markRunning();
        return process;
    }

    private DocumentUri sourceRoot(Path path) {
        return new DocumentUri.FileUri(sourceRootPath(path).toUri());
    }

    private Path sourceRootPath(Path path) {
        return path.toAbsolutePath().normalize();
    }

    private void subscribe(Set<EventKind> kinds, java.util.function.Consumer<DomainEvent> consumer) {
        eventBus.subscribe("execution-test-" + System.nanoTime(), SubscriberTier.CRITICAL, kinds, consumer);
    }

    /**
     * These tests spawn a POSIX shell ({@code /bin/sh}) to simulate a long-running process with
     * interleaved stdout/stderr output. There is no equivalent shell available by that path on
     * Windows, so the scenario is skipped there rather than shipped with an unverified cmd.exe
     * translation.
     * TODO: Support the test for windows.
     */
    private static void skipOnWindows() {
        if (System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win")) {
            throw new SkipException("Requires a POSIX shell (/bin/sh), not available on Windows");
        }
    }

    private static final class FakeProcess extends Process {

        private final boolean exitsGracefully;
        private final InputStream stdout = new ByteArrayInputStream(new byte[0]);
        private final InputStream stderr = new ByteArrayInputStream(new byte[0]);
        private final OutputStream stdin = new ByteArrayOutputStream();
        private volatile boolean alive = true;

        private FakeProcess(boolean exitsGracefully) {
            this.exitsGracefully = exitsGracefully;
        }

        @Override
        public OutputStream getOutputStream() {
            return stdin;
        }

        @Override
        public InputStream getInputStream() {
            return stdout;
        }

        @Override
        public InputStream getErrorStream() {
            return stderr;
        }

        @Override
        public int waitFor() {
            alive = false;
            return 0;
        }

        @Override
        public boolean waitFor(long timeout, TimeUnit unit) {
            if (exitsGracefully) {
                alive = false;
                return true;
            }
            return false;
        }

        @Override
        public int exitValue() {
            return alive ? -1 : 0;
        }

        @Override
        public void destroy() {
            if (exitsGracefully) {
                alive = false;
            }
        }

        @Override
        public Process destroyForcibly() {
            alive = false;
            return this;
        }

        @Override
        public boolean isAlive() {
            return alive;
        }
    }
}
