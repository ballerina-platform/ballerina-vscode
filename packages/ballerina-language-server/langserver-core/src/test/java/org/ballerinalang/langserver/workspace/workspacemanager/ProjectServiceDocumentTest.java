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

import io.ballerina.projects.Project;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeApplier;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectTier;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;


/**
 * Tests document lifecycle routing through {@link ProjectServiceImpl}.
 *
 * @since 1.7.0
 */
public class ProjectServiceDocumentTest {

    private EventSyncPubSubHolder eventBus;
    private ChangeBuffer changeBuffer;
    private ChangeApplier changeApplier;
    private ProjectServiceImpl service;
    private Path tempDir;
    private Path secondProjectDir;
    private List<DomainEvent> publishedEvents;

    @BeforeMethod
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("test-project-docs");
        Files.write(tempDir.resolve("Ballerina.toml"), new byte[0]);
        secondProjectDir = Files.createTempDirectory("test-project-docs-2");
        Files.write(secondProjectDir.resolve("Ballerina.toml"), new byte[0]);

        eventBus = new EventSyncPubSubHolder();
        changeBuffer = new ChangeBuffer();
        changeApplier = Mockito.mock(ChangeApplier.class);
        publishedEvents = new CopyOnWriteArrayList<>();

        eventBus.subscribe("test-project-updated", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_UPDATED, EventKind.WORKSPACE_PROJECT_TIER_CHANGED),
                publishedEvents::add);

        ProjectLoader loader = (root, kind) -> Mockito.mock(Project.class);
        service = new ProjectServiceImpl(eventBus, loader, changeBuffer, changeApplier);
    }

    @AfterMethod
    public void tearDown() {
        service.shutdown();
        eventBus.close();
    }

    @Test
    public void didOpen_storesFullTextChangeWithEditorLayerAndVersion1() {
        DocumentUri uri = createTestUri(tempDir, "main.bal");
        String content = "function main() {}";

        service.didOpen(uri, content);

        List<BufferedChange> drained = changeBuffer.drain(uri, ChangeLayer.EDITOR);
        Assert.assertEquals(drained.size(), 1);
        Assert.assertEquals(drained.get(0).version().value(), 1);
        Assert.assertEquals(drained.get(0).change().getText(), content);
    }

    @Test
    public void didChange_appliesImmediatelyAndEmitsProjectUpdated() throws Exception {
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());
        DocumentUri uri = createTestUri(tempDir, "main.bal");
        CountDownLatch latch = new CountDownLatch(1);
        eventBus.subscribe("debounce-project-updated", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_UPDATED), event -> latch.countDown());
        Mockito.when(changeApplier.applyAll()).thenReturn(Set.of(root));

        service.didChange(uri, List.of(new TextDocumentContentChangeEvent("change-1")));
        service.didChange(uri, List.of(new TextDocumentContentChangeEvent("change-2")));

        Assert.assertTrue(latch.await(2, TimeUnit.SECONDS));
    }

    @Test
    public void didOpenAndDidClose_updateOpenDocumentCountDirectly() throws Exception {
        Path mainFile = tempDir.resolve("main.bal");
        Files.writeString(mainFile, "function main() {}\n");
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());
        DocumentUri uri = new DocumentUri.FileUri(mainFile.toUri());

        service.loadOrCreate(mainFile, null);
        service.didOpen(uri, "function main() {}\n");
        service.didClose(uri);

        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().count(), 0);
    }

    @Test
    public void didClose_duplicateClose_keepsProjectActiveForStillOpenDocument() throws Exception {
        // Regression for PR #674 review: a duplicate/out-of-order didClose must not
        // decrement the shared open-document count when the URI had no tracked layer,
        // so a sibling document that is still open keeps the project ACTIVE.
        Path fileA = tempDir.resolve("main.bal");
        Path fileB = tempDir.resolve("other.bal");
        Files.writeString(fileA, "function main() {}\n");
        Files.writeString(fileB, "function other() {}\n");
        DocumentUri root = new DocumentUri.FileUri(tempDir.toUri());
        DocumentUri uriA = new DocumentUri.FileUri(fileA.toUri());
        DocumentUri uriB = new DocumentUri.FileUri(fileB.toUri());

        service.loadOrCreate(fileA, null);
        service.loadOrCreate(fileB, null);
        service.didOpen(uriA, "function main() {}\n");
        service.didOpen(uriB, "function other() {}\n");

        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().count(), 2);
        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().tier(),
                ProjectTier.ACTIVE);

        // First close of B is genuine and decrements the count.
        service.didClose(uriB);
        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().count(), 1);
        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().tier(),
                ProjectTier.ACTIVE);

        // Spurious duplicate close of B must be a no-op for the count: A is still open.
        service.didClose(uriB);
        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().count(), 1);
        Assert.assertEquals(service.workspaceProject(root).orElseThrow().openDocumentCount().tier(),
                ProjectTier.ACTIVE);
    }

    @Test
    public void didChangeWatchedFiles_multipleProjects_emitsOneEventPerProject() throws Exception {
        DocumentUri firstRoot = new DocumentUri.FileUri(tempDir.toUri());
        DocumentUri secondRoot = new DocumentUri.FileUri(secondProjectDir.toUri());
        CountDownLatch latch = new CountDownLatch(2);
        eventBus.subscribe("multi-project-updated", SubscriberTier.CRITICAL,
                Set.of(EventKind.WORKSPACE_PROJECT_UPDATED), event -> latch.countDown());
        Mockito.when(changeApplier.applyAll())
                .thenReturn(Set.of(firstRoot, secondRoot))
                .thenReturn(Set.of());

        FileEvent firstEvent = new FileEvent(tempDir.resolve("Dependencies.toml").toUri().toString(),
                FileChangeType.Changed);
        FileEvent secondEvent = new FileEvent(secondProjectDir.resolve("Dependencies.toml").toUri().toString(),
                FileChangeType.Changed);

        service.didChangeWatchedFiles(List.of(firstEvent, secondEvent));

        Assert.assertTrue(latch.await(2, TimeUnit.SECONDS));
    }

    private DocumentUri createTestUri(Path projectDir, String fileName) {
        URI fileUri = projectDir.resolve(fileName).toUri();
        return new DocumentUri.FileUri(fileUri);
    }
}
