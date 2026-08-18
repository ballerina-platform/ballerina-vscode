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

import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.observability.WorkspaceTraceLogger;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureMonitor;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Regression tests for {@link WiringConfiguration#close()} resilience: a throw from any one
 * shutdown call must not abort the remaining shutdowns, and multiple failures must be
 * surfaced (suppressed causes) rather than silently dropped.
 *
 * <p>The five owned shutdown calls (heap monitor → trace logger → compilation → execution →
 * project) plus the event-bus close are exercised by swapping mocks into the private final
 * fields via reflection, so production code is not opened up for testability.
 *
 * @since 1.7.0
 */
public class WiringConfigurationCloseResilienceTest {

    private WiringConfiguration wiring;

    // Real services created by the constructor are captured so tearDown can release them,
    // since close() is driven against mocks in these tests.
    private HeapPressureMonitor realHeapPressureMonitor;
    private WorkspaceTraceLogger realTraceLogger;
    private org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl
            realCompilationService;
    private org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl
            realExecutionService;
    private org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl
            realProjectService;
    private EventSyncPubSubHolder realEventBus;
    private Path tempDir;

    @BeforeMethod
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("cr015-resilience");
        Files.writeString(tempDir.resolve("Ballerina.toml"),
                "[package]\norg = \"test\"\nname = \"resilient\"\n");
        Files.writeString(tempDir.resolve("main.bal"), "public function main() {}\n");

        EventSyncPubSubHolder eventBus = new EventSyncPubSubHolder();
        StableSnapshot mockSnapshot = new StableSnapshot(Map.of(), Map.of(), Map.of(),
                mock(PackageCompilation.class),
                new org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion(1));

        wiring = WiringConfiguration.builder()
                .eventBus(eventBus)
                .snapshotStore(new DualSnapshotStore())
                .compilationAction(new org.ballerinalang.langserver.workspace.compilerengine.CompilationPipeline
                        .CompilationAction() {
                    @Override
                    public StableSnapshot compile(
                            org.ballerinalang.langserver.workspace.compilerengine.CompileTask task) {
                        return mockSnapshot;
                    }

                    @Override
                    public PackageDescriptor describe(String sourceRootIdentifier) {
                        PackageDescriptor descriptor = mock(PackageDescriptor.class);
                        PackageName packageName = mock(PackageName.class);
                        org.mockito.Mockito.when(descriptor.name()).thenReturn(packageName);
                        org.mockito.Mockito.when(packageName.value())
                                .thenReturn(tempDir.getFileName().toString());
                        return descriptor;
                    }
                })
                .projectLoader((root, kind) -> mock(io.ballerina.projects.Project.class))
                .gracePeriod(Duration.ofMillis(1000))
                .maxActiveProcesses(5)
                .heapPressurePollIntervalMs(60000L)
                .build();

        // Capture the real, constructor-created services so tearDown can clean them up.
        realHeapPressureMonitor = getField(wiring, "heapPressureMonitor", HeapPressureMonitor.class);
        realTraceLogger = getField(wiring, "traceLogger", WorkspaceTraceLogger.class);
        realCompilationService = getField(wiring, "compilationService",
                org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl.class);
        realExecutionService = getField(wiring, "executionService",
                org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl.class);
        realProjectService = getField(wiring, "projectService",
                org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl.class);
        realEventBus = getField(wiring, "eventBus", EventSyncPubSubHolder.class);
    }

    @AfterMethod
    public void tearDown() {
        // Best-effort release of the real services the constructor started, independent of
        // whatever mocks the individual tests swapped in.
        try {
            realHeapPressureMonitor.stop();
        } catch (Exception ignored) {
        }
        try {
            realTraceLogger.close();
        } catch (Exception ignored) {
        }
        try {
            realCompilationService.close();
        } catch (Exception ignored) {
        }
        try {
            realExecutionService.shutdown();
        } catch (Exception ignored) {
        }
        try {
            realProjectService.shutdown();
        } catch (Exception ignored) {
        }
        try {
            realEventBus.close();
        } catch (Exception ignored) {
        }
        deleteRecursive(tempDir);
    }

    /**
     * When the <em>first</em> shutdown call (heapPressureMonitor.stop()) throws, every
     * remaining shutdown call — trace logger, compilation, execution, project — and the
     * event-bus close must still execute.
     */
    @Test
    public void close_firstShutdownThrows_remainingShutdownsStillAttempted() throws Exception {
        HeapPressureMonitor heapMock = mock(HeapPressureMonitor.class);
        WorkspaceTraceLogger traceMock = mock(WorkspaceTraceLogger.class);
        org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl compMock =
                mock(org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl.class);
        org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl execMock =
                mock(org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl.class);
        org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl projMock =
                mock(org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl.class);
        EventSyncPubSubHolder busMock = mock(EventSyncPubSubHolder.class);

        doThrow(new RuntimeException("heap monitor exploded")).when(heapMock).stop();

        swapShutdownMocks(heapMock, traceMock, compMock, execMock, projMock, busMock);

        Exception thrown = null;
        try {
            wiring.close();
        } catch (Exception e) {
            thrown = e;
        }

        Assert.assertNotNull(thrown, "close() must propagate the heapPressureMonitor failure");
        Assert.assertEquals(thrown.getMessage(), "heap monitor exploded");

        verify(heapMock).stop();
        verify(traceMock).close();
        verify(compMock).close();
        verify(execMock).shutdown();
        verify(projMock).shutdown();
        verify(busMock).close();
    }

    /**
     * When a <em>middle</em> shutdown call (compilationService.close()) throws, both the
     * shutdown calls before it (already proven in the first test) and the ones after it
     * (execution, project) plus the event-bus close must still execute.
     */
    @Test
    public void close_middleShutdownThrows_subsequentShutdownsStillAttempted() throws Exception {
        HeapPressureMonitor heapMock = mock(HeapPressureMonitor.class);
        WorkspaceTraceLogger traceMock = mock(WorkspaceTraceLogger.class);
        org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl compMock =
                mock(org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl.class);
        org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl execMock =
                mock(org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl.class);
        org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl projMock =
                mock(org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl.class);
        EventSyncPubSubHolder busMock = mock(EventSyncPubSubHolder.class);

        doThrow(new RuntimeException("compilation close exploded")).when(compMock).close();

        swapShutdownMocks(heapMock, traceMock, compMock, execMock, projMock, busMock);

        Exception thrown = null;
        try {
            wiring.close();
        } catch (Exception e) {
            thrown = e;
        }

        Assert.assertNotNull(thrown, "close() must propagate the compilationService failure");
        Assert.assertEquals(thrown.getMessage(), "compilation close exploded");

        verify(heapMock).stop();
        verify(traceMock).close();
        verify(compMock).close();
        verify(execMock).shutdown();
        verify(projMock).shutdown();
        verify(busMock).close();
    }

    /**
     * When two shutdown calls fail, the first failure is rethrown with the second attached as a
     * suppressed cause, rather than only the first one winning.
     */
    @Test
    public void close_multipleShutdownsFail_aggregatedAsSuppressedCauses() throws Exception {
        HeapPressureMonitor heapMock = mock(HeapPressureMonitor.class);
        WorkspaceTraceLogger traceMock = mock(WorkspaceTraceLogger.class);
        org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl compMock =
                mock(org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl.class);
        org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl execMock =
                mock(org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl.class);
        org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl projMock =
                mock(org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl.class);
        EventSyncPubSubHolder busMock = mock(EventSyncPubSubHolder.class);

        RuntimeException heapFailure = new RuntimeException("heap monitor exploded");
        RuntimeException compFailure = new RuntimeException("compilation close exploded");
        doThrow(heapFailure).when(heapMock).stop();
        doThrow(compFailure).when(compMock).close();

        swapShutdownMocks(heapMock, traceMock, compMock, execMock, projMock, busMock);

        Exception thrown = null;
        try {
            wiring.close();
        } catch (Exception e) {
            thrown = e;
        }

        Assert.assertNotNull(thrown, "close() must rethrow when shutdowns fail");
        Assert.assertSame(thrown, heapFailure,
                "the first failure should be the primary rethrown exception");

        // The second failure must be surfaced, not dropped.
        Throwable[] suppressed = thrown.getSuppressed();
        Assert.assertTrue(suppressed.length >= 1,
                "additional failures must be attached as suppressed causes");
        boolean foundCompFailure = false;
        for (Throwable s : suppressed) {
            if (s == compFailure) {
                foundCompFailure = true;
                break;
            }
        }
        Assert.assertTrue(foundCompFailure,
                "the compilationService failure must be attached as a suppressed cause");

        // Every shutdown was still attempted despite two failures.
        verify(heapMock).stop();
        verify(traceMock).close();
        verify(compMock).close();
        verify(execMock).shutdown();
        verify(projMock).shutdown();
        verify(busMock).close();
    }

    /**
     * When every shutdown call succeeds, close() completes normally and calls each one exactly
     * once — the resilience refactor must not change the happy-path behaviour.
     */
    @Test
    public void close_allShutdownsSucceed_callsEachExactlyOnce() throws Exception {
        HeapPressureMonitor heapMock = mock(HeapPressureMonitor.class);
        WorkspaceTraceLogger traceMock = mock(WorkspaceTraceLogger.class);
        org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl compMock =
                mock(org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl.class);
        org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl execMock =
                mock(org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl.class);
        org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl projMock =
                mock(org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl.class);
        EventSyncPubSubHolder busMock = mock(EventSyncPubSubHolder.class);

        swapShutdownMocks(heapMock, traceMock, compMock, execMock, projMock, busMock);

        wiring.close();

        verify(heapMock).stop();
        verify(traceMock).close();
        verify(compMock).close();
        verify(execMock).shutdown();
        verify(projMock).shutdown();
        verify(busMock).close();
    }

    // ---- Helpers -----------------------------------------------------------------------

    private void swapShutdownMocks(
            HeapPressureMonitor heapMock,
            WorkspaceTraceLogger traceMock,
            org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl compMock,
            org.ballerinalang.langserver.workspace.execution.ExecutionServiceImpl execMock,
            org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl projMock,
            EventSyncPubSubHolder busMock) throws Exception {
        setField(wiring, "heapPressureMonitor", heapMock);
        setField(wiring, "traceLogger", traceMock);
        setField(wiring, "compilationService", compMock);
        setField(wiring, "executionService", execMock);
        setField(wiring, "projectService", projMock);
        setField(wiring, "eventBus", busMock);
    }

    private static void setField(Object target, String fieldName, Object value) throws Exception {
        Field field = WiringConfiguration.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static <T> T getField(Object target, String fieldName, Class<T> type) throws Exception {
        Field field = WiringConfiguration.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        return type.cast(field.get(target));
    }

    private static void deleteRecursive(Path path) {
        if (path == null || !Files.exists(path)) {
            return;
        }
        try {
            Files.walk(path)
                    .sorted(java.util.Comparator.reverseOrder())
                    .forEach(candidate -> {
                        try {
                            Files.deleteIfExists(candidate);
                        } catch (IOException ignored) {
                        }
                    });
        } catch (IOException ignored) {
        }
    }
}
