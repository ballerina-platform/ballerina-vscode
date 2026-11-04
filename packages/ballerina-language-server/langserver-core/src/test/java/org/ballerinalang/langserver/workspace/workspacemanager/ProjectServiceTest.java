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

package org.ballerinalang.langserver.workspace.workspacemanager;

import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Project;
import io.ballerina.projects.environment.PackageLockingMode;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.ProjectEvictedEvent;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureLevel;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeApplier;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectHealthState;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;


/**
 * Tests for {@link ProjectServiceImpl}.
 *
 * @since 1.7.0
 */
public class ProjectServiceTest {

    private UriResolver uriResolver;
    private EventSyncPubSubHolder eventBus;
    private ProjectServiceImpl service;
    private ChangeBuffer changeBuffer;
    private ChangeApplier changeApplier;
    private Path tempDir;
    private CancelChecker cancelChecker;
    private List<DomainEvent> publishedEvents;

    @BeforeMethod
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("test-project");
        Files.write(tempDir.resolve("Ballerina.toml"), new byte[0]);

        eventBus = new EventSyncPubSubHolder();
        publishedEvents = new CopyOnWriteArrayList<>();
        cancelChecker = () -> { };

        eventBus.subscribe("test-event-logger", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_REGISTERED, EventKind.WORKSPACE_PROJECT_EVICTED,
                        EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED, EventKind.WORKSPACE_PROJECT_TIER_CHANGED,
                        EventKind.WORKSPACE_BATCH_PROJECTS_REGISTERED, EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED),
                publishedEvents::add);

        ProjectLoader loader = (root, kind) -> mockBallerinaProject(root, kind);
        changeBuffer = new ChangeBuffer();
        changeApplier = Mockito.mock(ChangeApplier.class);
        service = new ProjectServiceImpl(eventBus, loader, changeBuffer, changeApplier);
        uriResolver = service.uriResolver();
    }

    @AfterMethod
    public void tearDown() {
        service.shutdown();
        eventBus.close();
    }

    @Test
    public void loadOrCreate_firstCallLoadsAndPublishesEvent() throws Exception {
        Project project = service.loadOrCreate(tempDir, cancelChecker);

        Assert.assertNotNull(project);
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event.eventKind() == EventKind.WORKSPACE_PROJECT_REGISTERED)));
    }

    @Test
    public void loadOrCreate_secondCallIsIdempotent() throws Exception {
        Project first = service.loadOrCreate(tempDir, cancelChecker);
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event.eventKind() == EventKind.WORKSPACE_PROJECT_REGISTERED)));
        publishedEvents.clear();

        Project second = service.loadOrCreate(tempDir, cancelChecker);

        Assert.assertSame(first, second);
        Assert.assertTrue(publishedEvents.isEmpty());
    }

    @Test
    public void allProjects_returnsLoadedProjects() {
        service.loadOrCreate(tempDir, cancelChecker);

        Collection<Project> projects = service.allProjects();

        Assert.assertEquals(projects.size(), 1);
    }

    @Test
    public void heapPressureEventEvictsBackgroundProjects() throws Exception {
        Path secondProject = Files.createTempDirectory("test-project-2");
        Files.write(secondProject.resolve("Ballerina.toml"), new byte[0]);
        service.loadOrCreate(tempDir, cancelChecker);
        service.loadOrCreate(secondProject, cancelChecker);

        DocumentUri activeRoot = new DocumentUri.FileUri(tempDir.toUri());
        DocumentUri backgroundRoot = new DocumentUri.FileUri(secondProject.toUri());
        service.workspaceProject(activeRoot).orElseThrow().openDocumentCount().increment();

        eventBus.publish(new HeapPressureEvent(HeapPressureLevel.WARNING));

        Assert.assertTrue(service.workspaceProject(activeRoot).isPresent());
        Assert.assertTrue(awaitCondition(() -> service.workspaceProject(backgroundRoot).isEmpty()));
    }

    @Test
    public void criticalHeapPressureKeepsActiveProjects() throws Exception {
        Path secondProject = Files.createTempDirectory("test-project-2");
        Files.write(secondProject.resolve("Ballerina.toml"), new byte[0]);
        service.loadOrCreate(tempDir, cancelChecker);
        service.loadOrCreate(secondProject, cancelChecker);

        DocumentUri activeRoot = new DocumentUri.FileUri(tempDir.toUri());
        DocumentUri backgroundRoot = new DocumentUri.FileUri(secondProject.toUri());
        service.workspaceProject(activeRoot).orElseThrow().openDocumentCount().increment();

        eventBus.publish(new HeapPressureEvent(HeapPressureLevel.CRITICAL));

        Assert.assertTrue(service.workspaceProject(activeRoot).isPresent());
        Assert.assertTrue(awaitCondition(() -> service.workspaceProject(backgroundRoot).isEmpty()));
    }

    @Test
    public void evictProject_removesFromResolverAndPublishesEvent() throws Exception {
        service.loadOrCreate(tempDir, cancelChecker);
        publishedEvents.clear();

        service.evictProject(tempDir);

        Assert.assertTrue(uriResolver.getProject(new DocumentUri.FileUri(tempDir.toUri())).isEmpty());
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event instanceof ProjectEvictedEvent)));
    }

    @Test
    public void registerWorkspace_publishesBatchEvent() throws Exception {
        Path secondProject = Files.createTempDirectory("test-project-2");
        Files.write(secondProject.resolve("Ballerina.toml"), new byte[0]);

        service.registerWorkspace(List.of(tempDir, secondProject));

        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event.eventKind() == EventKind.WORKSPACE_BATCH_PROJECTS_REGISTERED)));
        Assert.assertEquals(service.allProjects().size(), 2);
    }

    @Test
    public void compilationFailed_transitionsWorkspaceProjectState() throws Exception {
        service.loadOrCreate(tempDir, cancelChecker);
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());

        eventBus.publish(new CompilerEvent(EventKind.COMPILER_COMPILATION_FAILED, tempDir.toUri(), "test-pkg"));

        Assert.assertTrue(awaitCondition(() -> service.workspaceProject(root).orElseThrow().healthState()
                == ProjectHealthState.COMPILATION_CRASHED));
    }

    @Test
    public void compilationFailed_withCompilerSourceRootWithoutTrailingSlashTransitionsWorkspaceProjectState()
            throws Exception {
        service.loadOrCreate(tempDir, cancelChecker);
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());
        URI compilerSourceRoot = sourceRootUriWithoutTrailingSlash(tempDir);
        publishedEvents.clear();

        eventBus.publish(new CompilerEvent(EventKind.COMPILER_COMPILATION_FAILED, compilerSourceRoot, "test-pkg"));

        Assert.assertTrue(awaitCondition(() -> service.workspaceProject(root).orElseThrow().healthState()
                == ProjectHealthState.COMPILATION_CRASHED));
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event.eventKind() == EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED)));
    }

    @Test
    public void diagnosticsReady_withCompilerSourceRootWithoutTrailingSlashRestoresHealthAndRecordsSignal()
            throws Exception {
        service.loadOrCreate(tempDir, cancelChecker);
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());
        URI compilerSourceRoot = sourceRootUriWithoutTrailingSlash(tempDir);
        org.ballerinalang.langserver.workspace.workspacemanager.project.Project workspaceProject =
                service.workspaceProject(root).orElseThrow();
        workspaceProject.notifySourceChanged();
        workspaceProject.transitionTo(ProjectHealthState.COMPILATION_CRASHED);
        workspaceProject.transitionTo(ProjectHealthState.RECOVERING);
        publishedEvents.clear();

        eventBus.publish(new CompilerEvent(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY, compilerSourceRoot,
                "test-pkg"));

        Assert.assertTrue(awaitCondition(() -> workspaceProject.healthState() == ProjectHealthState.HEALTHY));
        Assert.assertTrue(service.hasObservedCompilerSignal(root, EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY));
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event.eventKind() == EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED)));
    }

    @Test
    public void resolutionEvents_withCompilerSourceRootWithoutTrailingSlashTransitionHealthAndRecordSignals()
            throws Exception {
        service.loadOrCreate(tempDir, cancelChecker);
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());
        URI compilerSourceRoot = sourceRootUriWithoutTrailingSlash(tempDir);
        org.ballerinalang.langserver.workspace.workspacemanager.project.Project workspaceProject =
                service.workspaceProject(root).orElseThrow();
        workspaceProject.notifySourceChanged();
        workspaceProject.transitionTo(ProjectHealthState.COMPILATION_CRASHED);
        workspaceProject.transitionTo(ProjectHealthState.RECOVERING);
        publishedEvents.clear();

        eventBus.publish(new CompilerEvent(EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY, compilerSourceRoot,
                "test-pkg"));
        Assert.assertTrue(awaitCondition(() -> service.hasObservedCompilerSignal(root,
                EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY)));

        eventBus.publish(new CompilerEvent(EventKind.CE_RESOLUTION_EXHAUSTED, compilerSourceRoot, "test-pkg"));
        Assert.assertTrue(awaitCondition(() -> workspaceProject.healthState() == ProjectHealthState.CIRCUIT_OPEN));
        Assert.assertTrue(service.hasObservedCompilerSignal(root, EventKind.CE_RESOLUTION_EXHAUSTED));

        eventBus.publish(new CompilerEvent(EventKind.CE_RESOLUTION_RECOVERED, compilerSourceRoot, "test-pkg"));
        Assert.assertTrue(awaitCondition(() -> workspaceProject.healthState() == ProjectHealthState.RECOVERING));
        Assert.assertTrue(service.hasObservedCompilerSignal(root, EventKind.CE_RESOLUTION_RECOVERED));
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .filter(event -> event.eventKind() == EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED)
                .count() >= 2));
    }

    @Test
    public void transitionKind_updatesWorkspaceMetadataAndPublishesEvent() throws Exception {
        Path singleFileDir;
        try {
            singleFileDir = Files.createTempDirectory("test-single-file");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        service.loadOrCreate(singleFileDir, cancelChecker);
        DocumentUri root = new DocumentUri.FileUri(singleFileDir.toAbsolutePath().normalize().toUri());
        publishedEvents.clear();

        service.transitionKind(root, ProjectKind.BUILD);

        Assert.assertEquals(service.workspaceProject(root).orElseThrow().kind(), ProjectKind.BUILD);
        Assert.assertTrue(awaitCondition(() -> publishedEvents.stream()
                .anyMatch(event -> event.eventKind() == EventKind.WORKSPACE_PROJECT_KIND_TRANSITIONED)));
    }

    @Test
    public void watchedFiles_ballerinaTomlCreationTransitionsProjectKind() throws Exception {
        Path singleFileDir = Files.createTempDirectory("test-single-file-watched-create");
        service.loadOrCreate(singleFileDir, cancelChecker);

        Path ballerinaToml = singleFileDir.resolve("Ballerina.toml");
        Files.writeString(ballerinaToml, "[package]\norg = \"test\"\nname = \"demo\"\n");

        service.didChangeWatchedFiles(List.of(new FileEvent(ballerinaToml.toUri().toString(), FileChangeType.Created)));

        DocumentUri root = new DocumentUri.FileUri(singleFileDir.toAbsolutePath().normalize().toUri());
        Assert.assertEquals(service.workspaceProject(root).orElseThrow().kind(), ProjectKind.BUILD);
    }

    @Test
    public void getLockingMode_readsProjectBuildOptions() {
        Project project = Mockito.mock(Project.class);
        BuildOptions buildOptions = Mockito.mock(BuildOptions.class);
        Mockito.when(project.buildOptions()).thenReturn(buildOptions);
        Mockito.when(buildOptions.lockingMode()).thenReturn(PackageLockingMode.HARD);

        Assert.assertEquals(service.getLockingMode(project), LockingMode.HARD);
    }

    private Project mockBallerinaProject(DocumentUri root, ProjectKind kind) {
        return Mockito.mock(Project.class);
    }

    private URI sourceRootUriWithoutTrailingSlash(Path sourceRoot) {
        String uri = sourceRoot.toAbsolutePath().normalize().toUri().toString();
        if (uri.endsWith("/")) {
            uri = uri.substring(0, uri.length() - 1);
        }
        return URI.create(uri);
    }

    private boolean awaitCondition(Condition condition) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            if (condition.test()) {
                return true;
            }
            Thread.sleep(25L);
        }
        return condition.test();
    }

    private interface Condition {
        boolean test();
    }
}
