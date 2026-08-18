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
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.mockito.Mockito.mock;


/**
 * Integration smoke tests for wiring after the project-cache consolidation.
 *
 * @since 1.7.0
 */
public class WiringConfigurationTest {

    private EventSyncPubSubHolder eventBus;
    private WiringConfiguration wiring;
    private Path tempDir;
    private DocumentUri testRoot;
    private PackageDescriptor testDescriptor;

    @BeforeMethod
    public void setUp() throws IOException {
        tempDir = Files.createTempDirectory("t020-integration");
        Files.writeString(tempDir.resolve("Ballerina.toml"), "[package]\norg = \"test\"\nname = \"wired\"\n");
        Files.writeString(tempDir.resolve("main.bal"), "public function main() {}\n");
        testRoot = new DocumentUri.FileUri(tempDir.toAbsolutePath().normalize().toUri());
        eventBus = new EventSyncPubSubHolder();

        StableSnapshot mockSnapshot = new StableSnapshot(Map.of(), Map.of(), Map.of(),
                mock(PackageCompilation.class), new ContentVersion(1));
        testDescriptor = descriptor(tempDir.getFileName().toString());

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
                        return testDescriptor;
                    }
                })
                .projectLoader((root, kind) -> mock(io.ballerina.projects.Project.class))
                .gracePeriod(Duration.ofMillis(1000))
                .maxActiveProcesses(5)
                .heapPressurePollIntervalMs(60000L)
                .build();
    }

    @AfterMethod
    public void tearDown() throws Exception {
        if (wiring != null) {
            wiring.close();
        }
        if (eventBus != null) {
            eventBus.close();
        }
        deleteRecursive(tempDir);
    }

    @Test
    public void wiring_constructionOrder_allServicesWired() {
        Assert.assertNotNull(wiring.changeBuffer());
        Assert.assertNotNull(wiring.changeApplier());
        Assert.assertNotNull(wiring.heapPressureMonitor());
        Assert.assertNotNull(wiring.projectService());
        Assert.assertNotNull(wiring.compilationService());
        Assert.assertNotNull(wiring.executionService());
        Assert.assertNotNull(wiring.traceLogger());
    }

    @Test
    public void chain_projectRegistered_triggersCompilation() throws Exception {
        CountDownLatch snapshotPublished = new CountDownLatch(1);
        eventBus.subscribe("snapshot-observer", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_SNAPSHOT_PUBLISHED), event -> snapshotPublished.countDown());

        wiring.projectService().loadOrCreate(tempDir.resolve("main.bal"), () -> { });
        eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, testRoot.uri()));

        Assert.assertTrue(snapshotPublished.await(5, TimeUnit.SECONDS));
    }

    @Test
    public void chain_kindTransition_updatesWorkspaceMetadata() throws Exception {
        wiring.projectService().loadOrCreate(tempDir.resolve("main.bal"), () -> { });

        wiring.projectService().transitionKind(testRoot, ProjectKind.SINGLE_FILE);

        Assert.assertEquals(wiring.projectService().workspaceProject(testRoot).orElseThrow().kind(),
                ProjectKind.SINGLE_FILE);
    }

    @Test
    public void heapPressureMonitor_lifecycle_startedOnConstructionStoppedOnClose() throws Exception {
        Assert.assertFalse(wiring.heapPressureMonitor().isStopped());
        wiring.close();
        Assert.assertTrue(wiring.heapPressureMonitor().isStopped());
    }

    private PackageDescriptor descriptor(String packageNameValue) {
        PackageDescriptor descriptor = mock(PackageDescriptor.class);
        PackageName packageName = mock(PackageName.class);
        org.mockito.Mockito.when(descriptor.name()).thenReturn(packageName);
        org.mockito.Mockito.when(packageName.value()).thenReturn(packageNameValue);
        return descriptor;
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
