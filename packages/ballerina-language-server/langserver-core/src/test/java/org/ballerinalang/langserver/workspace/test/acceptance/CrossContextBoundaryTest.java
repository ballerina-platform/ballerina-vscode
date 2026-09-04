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
import org.ballerinalang.langserver.workspace.compilerengine.CompilationPipeline;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationServiceImpl;
import org.ballerinalang.langserver.workspace.compilerengine.CompileTask;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.DualSnapshotStore;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureLevel;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectLoader;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.project.Project;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectHealthState;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;


/**
 * Acceptance tests for cross-context boundaries after project-cache consolidation.
 *
 * @since 1.7.0
 */
public class CrossContextBoundaryTest {

    private EventSyncPubSubHolder eventBus;
    private ChangeBuffer changeBuffer;
    private ProjectServiceImpl projectService;
    private CompilationServiceImpl compilationService;
    private Path tempDir;

    @BeforeMethod
    public void setUp() throws IOException {
        eventBus = new EventSyncPubSubHolder();
        changeBuffer = new ChangeBuffer();
        tempDir = Files.createTempDirectory("cross-context-boundary");
        Files.writeString(tempDir.resolve("Ballerina.toml"), "[package]\norg = \"test\"\nname = \"cross\"\n");
        Files.writeString(tempDir.resolve("main.bal"), "public function main() {}\n");
    }

    @AfterMethod
    public void tearDown() throws Exception {
        if (compilationService != null) {
            compilationService.close();
        }
        if (projectService != null) {
            projectService.shutdown();
        }
        if (eventBus != null) {
            eventBus.close();
        }
        deleteRecursive(tempDir);
    }

    @Test
    public void wmProjectUpdated_crossesToCompilerEngineAndTriggersCompilation() throws Exception {
        AtomicInteger compileCount = new AtomicInteger();
        CountDownLatch secondCompilation = new CountDownLatch(1);
        compilationService = new CompilationServiceImpl(new DualSnapshotStore(), eventBus,
                countingAction(compileCount, secondCompilation), 50L);
        DocumentUri root = new DocumentUri.FileUri(tempDir.toAbsolutePath().normalize().toUri());
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_REGISTERED, root.uri()));

        Assert.assertTrue(awaitCompileCount(compileCount, 1, 3));
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, root.uri()));
        Assert.assertTrue(secondCompilation.await(3, TimeUnit.SECONDS));
    }

    @Test
    public void rmHeapPressure_crossesToProjectServiceAndEvictsBackgroundProjects() throws Exception {
        projectService = createProjectService();
        Path backgroundDir = Files.createDirectory(tempDir.resolve("background"));
        Files.writeString(backgroundDir.resolve("Ballerina.toml"), "[package]\norg = \"test\"\nname = \"bg\"\n");
        Files.writeString(backgroundDir.resolve("main.bal"), "public function main() {}\n");

        projectService.loadOrCreate(tempDir.resolve("main.bal"), () -> { });
        projectService.loadOrCreate(backgroundDir.resolve("main.bal"), () -> { });

        DocumentUri activeRoot = new DocumentUri.FileUri(tempDir.toAbsolutePath().normalize().toUri());
        DocumentUri backgroundRoot = new DocumentUri.FileUri(backgroundDir.toAbsolutePath().normalize().toUri());
        projectService.workspaceProject(activeRoot).orElseThrow().openDocumentCount().increment();

        eventBus.publish(new HeapPressureEvent(HeapPressureLevel.WARNING));

        Assert.assertTrue(awaitCondition(() -> projectService.workspaceProject(activeRoot).isPresent(), 3));
        Assert.assertTrue(awaitCondition(() -> projectService.workspaceProject(backgroundRoot).isEmpty(), 3));
    }

    @Test
    public void ceE5a_crossesToProjectServiceAndIsRecorded() throws Exception {
        projectService = createProjectService();
        Path mainFile = tempDir.resolve("main.bal");
        projectService.loadOrCreate(mainFile, () -> { });
        DocumentUri root = new DocumentUri.FileUri(tempDir.toAbsolutePath().normalize().toUri());

        eventBus.publish(new CompilerEvent(EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY, root.uri(), "test-pkg"));

        Assert.assertTrue(awaitCondition(
                () -> projectService.hasObservedCompilerSignal(root, EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY),
                3));
    }

    @Test
    public void ceE5b_crossesToProjectServiceAndRestoresHealthyState() throws Exception {
        projectService = createProjectService();
        Path mainFile = tempDir.resolve("main.bal");
        projectService.loadOrCreate(mainFile, () -> { });
        DocumentUri root = new DocumentUri.FileUri(tempDir.toAbsolutePath().normalize().toUri());
        Project project = projectService.workspaceProject(root).orElseThrow();
        project.notifySourceChanged();
        project.transitionTo(ProjectHealthState.COMPILATION_CRASHED);
        project.transitionTo(ProjectHealthState.RECOVERING);

        eventBus.publish(new CompilerEvent(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY, root.uri(), "test-pkg"));

        Assert.assertTrue(awaitCondition(() -> project.healthState() == ProjectHealthState.HEALTHY, 3));
    }

    @Test
    public void ceResolutionRecovered_crossesToProjectServiceAndReturnsToRecovering() throws Exception {
        projectService = createProjectService();
        Path mainFile = tempDir.resolve("main.bal");
        projectService.loadOrCreate(mainFile, () -> { });
        DocumentUri root = new DocumentUri.FileUri(tempDir.toAbsolutePath().normalize().toUri());
        Project project = projectService.workspaceProject(root).orElseThrow();
        project.transitionTo(ProjectHealthState.PROJECT_CRASHED);
        project.transitionTo(ProjectHealthState.RECOVERING);
        project.transitionTo(ProjectHealthState.CIRCUIT_OPEN);

        eventBus.publish(new CompilerEvent(EventKind.CE_RESOLUTION_RECOVERED, root.uri(), "test-pkg"));

        Assert.assertTrue(awaitCondition(() -> project.healthState() == ProjectHealthState.RECOVERING, 3));
    }

    private ProjectServiceImpl createProjectService() {
        ProjectLoader loader = (root, kind) -> mock(io.ballerina.projects.Project.class);
        return projectService = new ProjectServiceImpl(eventBus, loader, changeBuffer);
    }

    private CompilationPipeline.CompilationAction countingAction(AtomicInteger compileCount, CountDownLatch latch) {
        StableSnapshot snapshot = new StableSnapshot(Map.of(), Map.of(), Map.of(),
                mock(PackageCompilation.class), new ContentVersion(1));
        PackageDescriptor descriptor = createDescriptor("cross");
        return new CompilationPipeline.CompilationAction() {
            @Override
            public StableSnapshot compile(CompileTask task) {
                if (compileCount.incrementAndGet() >= 2) {
                    latch.countDown();
                }
                return snapshot;
            }

            @Override
            public PackageDescriptor describe(String sourceRootIdentifier) {
                return descriptor;
            }
        };
    }

    private static PackageDescriptor createDescriptor(String name) {
        PackageName packageName = mock(PackageName.class);
        when(packageName.value()).thenReturn(name);
        PackageDescriptor descriptor = mock(PackageDescriptor.class);
        when(descriptor.name()).thenReturn(packageName);
        return descriptor;
    }

    private static boolean awaitCompileCount(AtomicInteger count, int expectedMinimum, int timeoutSeconds)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        while (System.nanoTime() < deadline) {
            if (count.get() >= expectedMinimum) {
                return true;
            }
            Thread.sleep(25L);
        }
        return count.get() >= expectedMinimum;
    }

    private static boolean awaitCondition(Condition condition, int timeoutSeconds) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
        while (System.nanoTime() < deadline) {
            if (condition.test()) {
                return true;
            }
            Thread.sleep(25L);
        }
        return condition.test();
    }

    private interface Condition {
        boolean test() throws Exception;
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
