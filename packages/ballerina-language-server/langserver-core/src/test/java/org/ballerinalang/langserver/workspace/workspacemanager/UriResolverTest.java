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

import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.TomlDocument;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.ResolvedEntry;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.mockito.Mockito;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;


/**
 * Tests for {@link UriResolver} lock-free URI resolution cache.
 *
 * @since 1.7.0
 */
public class UriResolverTest {

    private static final String FILE_SCHEME = "file";
    private static final String EXPR_SCHEME = "expr";

    private UriResolver resolver;
    private Project mockProject;
    private Module mockModule;
    private Document mockDocument;
    private TomlDocument mockTomlDocument;

    @BeforeMethod
    public void setUp() {
        resolver = new UriResolver();
        mockProject = projectAt("/workspace/project");
        mockModule = moduleOf(mockProject);
        mockDocument = documentOf(mockModule);
        mockTomlDocument = configOf(mockProject);
    }

    /**
     * Verifies that resolving from an empty cache returns empty.
     */
    @Test
    public void resolve_emptyResolver_returnsEmpty() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        Assert.assertEquals(resolver.resolve(uri), Optional.empty());
    }

    /**
     * Verifies scheme-aware resolution returns the entry registered for that scheme.
     */
    @Test
    public void resolve_samePathDifferentSchemes_returnsSchemeSpecificEntry() {
        Document fileDocument = documentOf(moduleOf(mockProject));
        Document exprDocument = documentOf(moduleOf(mockProject));
        DocumentUri fileUri = fileUri("/workspace/project/main.bal");
        DocumentUri exprUri = exprUri("/workspace/project/main.bal");
        ResolvedEntry fileEntry = new ResolvedEntry.DocumentEntry(fileDocument);
        ResolvedEntry exprEntry = new ResolvedEntry.DocumentEntry(exprDocument);

        resolver.register(fileUri, fileEntry);
        resolver.register(exprUri, exprEntry);

        Assert.assertEquals(resolver.resolve(fileUri, FILE_SCHEME), Optional.of(fileEntry));
        Assert.assertEquals(resolver.resolve(exprUri, EXPR_SCHEME), Optional.of(exprEntry));
        Assert.assertEquals(resolver.resolve(fileUri, EXPR_SCHEME), Optional.of(exprEntry));
    }

    /**
     * Verifies the default resolve overload uses the URI's scheme.
     */
    @Test
    public void resolve_defaultSchemeOverload_usesUriScheme() {
        DocumentUri uri = exprUri("/workspace/project/main.bal");
        ResolvedEntry entry = new ResolvedEntry.DocumentEntry(mockDocument);

        resolver.register(uri, entry);

        Assert.assertEquals(resolver.resolve(uri), Optional.of(entry));
    }

    /**
     * Verifies document convenience resolution returns the typed document directly.
     */
    @Test
    public void document_afterRegisterDocument_returnsTypedDocument() {
        DocumentUri uri = fileUri("/workspace/project/main.bal");
        resolver.register(uri, new ResolvedEntry.DocumentEntry(mockDocument));

        Assert.assertEquals(resolver.document(uri), Optional.of(mockDocument));
    }

    /**
     * Verifies module resolution derives upward from a cached document.
     */
    @Test
    public void module_whenOnlyDocumentCached_derivesFromDocument() {
        DocumentUri uri = fileUri("/workspace/project/modules/auth/auth.bal");
        resolver.register(uri, new ResolvedEntry.DocumentEntry(mockDocument));

        Assert.assertEquals(resolver.module(uri), Optional.of(mockModule));
    }

    /**
     * Verifies project resolution derives upward from a cached document.
     */
    @Test
    public void project_whenOnlyDocumentCached_derivesFromDocument() {
        DocumentUri uri = fileUri("/workspace/project/modules/auth/auth.bal");
        resolver.register(uri, new ResolvedEntry.DocumentEntry(mockDocument));

        Assert.assertEquals(resolver.project(uri), Optional.of(mockProject));
    }

    /**
     * Verifies project resolution derives upward from a cached module.
     */
    @Test
    public void project_whenOnlyModuleCached_derivesFromModule() {
        DocumentUri moduleUri = fileUri("/workspace/project/modules/auth");
        resolver.register(moduleUri, new ResolvedEntry.ModuleEntry(mockModule));

        Assert.assertEquals(resolver.project(moduleUri), Optional.of(mockProject));
    }

    /**
     * Verifies config convenience resolution returns the typed TOML document.
     */
    @Test
    public void config_afterRegisterConfig_returnsTypedConfig() {
        DocumentUri configUri = fileUri("/workspace/project/Ballerina.toml");
        resolver.register(configUri, new ResolvedEntry.ConfigEntry(mockTomlDocument, mockProject));

        Assert.assertEquals(resolver.config(configUri), Optional.of(mockTomlDocument));
    }

    /**
     * Verifies registering the same path and scheme replaces the previous entry.
     */
    @Test
    public void register_samePathSameScheme_replacesPreviousEntry() {
        DocumentUri rootUri = fileUri("/workspace/project");
        Project project = projectAt("/workspace/project");
        Module module = moduleOf(project);

        resolver.register(rootUri, new ResolvedEntry.ProjectEntry(project));
        resolver.register(rootUri, new ResolvedEntry.ModuleEntry(module));

        Assert.assertEquals(resolver.project(rootUri), Optional.of(project));
        Assert.assertEquals(resolver.resolve(rootUri, FILE_SCHEME),
                Optional.of(new ResolvedEntry.ModuleEntry(module)));
        Assert.assertEquals(resolver.module(rootUri), Optional.of(module));
    }

    /**
     * Verifies unregister of a non-existent URI is a no-op.
     */
    @Test
    public void unregister_nonExistentUri_isNoOp() {
        DocumentUri uri = fileUri("/workspace/main.bal");

        resolver.unregister(uri);

        Assert.assertEquals(resolver.resolve(uri), Optional.empty());
    }

    /**
     * Verifies evictSubtree removes all entries under the given source root prefix.
     */
    @Test
    public void evictSubtree_removesAllEntriesUnderPrefix() {
        DocumentUri sourceRoot = fileUri("/workspace/project");
        DocumentUri doc1 = fileUri("/workspace/project/main.bal");
        DocumentUri doc2 = fileUri("/workspace/project/modules/auth/auth.bal");

        resolver.register(doc1, new ResolvedEntry.DocumentEntry(mockDocument));
        resolver.register(doc2, new ResolvedEntry.DocumentEntry(documentOf(moduleOf(mockProject))));
        resolver.evictSubtree(sourceRoot);

        Assert.assertEquals(resolver.resolve(doc1), Optional.empty());
        Assert.assertEquals(resolver.resolve(doc2), Optional.empty());
    }

    /**
     * Verifies evictSubtree preserves entries outside the given prefix.
     */
    @Test
    public void evictSubtree_preservesEntriesOutsidePrefix() {
        DocumentUri sourceRoot = fileUri("/workspace/project-a");
        DocumentUri inScope = fileUri("/workspace/project-a/main.bal");
        DocumentUri outScope = fileUri("/workspace/project-b/main.bal");
        ResolvedEntry inScopeEntry = new ResolvedEntry.DocumentEntry(mockDocument);
        ResolvedEntry outScopeEntry = new ResolvedEntry.DocumentEntry(
                documentOf(moduleOf(projectAt("/workspace/project-b"))));

        resolver.register(inScope, inScopeEntry);
        resolver.register(outScope, outScopeEntry);
        resolver.evictSubtree(sourceRoot);

        Assert.assertEquals(resolver.resolve(inScope), Optional.empty());
        Assert.assertEquals(resolver.resolve(outScope), Optional.of(outScopeEntry));
    }

    /**
     * Verifies evictSubtree removes only the compressed branch below the given prefix.
     */
    @Test
    public void evictSubtree_compressedBoundary_removesOnlyMatchingBranch() {
        DocumentUri modulesRoot = fileUri("/workspace/project/modules");
        DocumentUri authDoc = fileUri("/workspace/project/modules/auth/auth.bal");
        DocumentUri dbDoc = fileUri("/workspace/project/modules/db/db.bal");
        DocumentUri testDoc = fileUri("/workspace/project/tests/main_test.bal");
        ResolvedEntry authEntry = new ResolvedEntry.DocumentEntry(mockDocument);
        ResolvedEntry dbEntry = new ResolvedEntry.DocumentEntry(documentOf(moduleOf(mockProject)));
        ResolvedEntry testEntry = new ResolvedEntry.DocumentEntry(
                documentOf(moduleOf(projectAt("/workspace/project"))));

        resolver.register(authDoc, authEntry);
        resolver.register(dbDoc, dbEntry);
        resolver.register(testDoc, testEntry);
        resolver.evictSubtree(modulesRoot);

        Assert.assertEquals(resolver.resolve(authDoc), Optional.empty());
        Assert.assertEquals(resolver.resolve(dbDoc), Optional.empty());
        Assert.assertEquals(resolver.resolve(testDoc), Optional.of(testEntry));
    }

    /**
     * Verifies evictSubtree on an empty resolver is a no-op.
     */
    @Test
    public void evictSubtree_emptyResolver_isNoOp() {
        DocumentUri sourceRoot = fileUri("/workspace/project");

        resolver.evictSubtree(sourceRoot);

        Assert.assertEquals(resolver.resolve(fileUri("/workspace/project/main.bal")), Optional.empty());
    }

    /**
     * Verifies a URI can be re-registered after subtree eviction.
     */
    @Test
    public void resolve_afterEvictSubtreeAndReregister_returnsNewEntry() {
        DocumentUri sourceRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");
        Document firstDocument = documentOf(moduleOf(projectAt("/workspace/project")));
        Document secondDocument = documentOf(moduleOf(projectAt("/workspace/project")));

        resolver.register(documentUri, new ResolvedEntry.DocumentEntry(firstDocument));
        resolver.evictSubtree(sourceRoot);
        resolver.register(documentUri, new ResolvedEntry.DocumentEntry(secondDocument));

        Assert.assertEquals(resolver.document(documentUri), Optional.of(secondDocument));
    }

    /**
     * Verifies registering a project indexes it by source root for direct lookup.
     */
    @Test
    public void registerProject_getProject_returnsIndexedProject() {
        DocumentUri sourceRoot = fileUri("/workspace/project");

        resolver.registerProject(sourceRoot, mockProject);

        Assert.assertEquals(resolver.getProject(sourceRoot), Optional.of(mockProject));
        Assert.assertEquals(resolver.project(sourceRoot), Optional.of(mockProject));
    }

    /**
     * Verifies project enumeration and count are driven by the bounded project index.
     */
    @Test
    public void registerProject_allProjectsAndCount_trackRegisteredRoots() {
        Project firstProject = projectAt("/workspace/first");
        Project secondProject = projectAt("/workspace/second");
        DocumentUri firstRoot = fileUri("/workspace/first");
        DocumentUri secondRoot = fileUri("/workspace/second");

        resolver.registerProject(firstRoot, firstProject);
        resolver.registerProject(secondRoot, secondProject);

        Assert.assertEquals(resolver.projectCount(), 2L);
        Assert.assertEquals(resolver.allProjects().size(), 2);
        Assert.assertTrue(resolver.allProjects().contains(firstProject));
        Assert.assertTrue(resolver.allProjects().contains(secondProject));
    }

    /**
     * Verifies explicit project removal evicts the trie subtree without invoking the implicit-eviction callback.
     */
    @Test
    public void removeProject_explicitRemoval_evctsSubtreeWithoutCallback() {
        List<DocumentUri> evictedRoots = new ArrayList<>();
        resolver = new UriResolver(2, evictedRoots::add);
        Project project = projectAt("/workspace/project");
        DocumentUri sourceRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");

        resolver.registerProject(sourceRoot, project);
        resolver.register(documentUri, new ResolvedEntry.DocumentEntry(documentOf(moduleOf(project))));

        resolver.removeProject(sourceRoot);

        Assert.assertTrue(resolver.getProject(sourceRoot).isEmpty());
        Assert.assertTrue(resolver.resolve(documentUri).isEmpty());
        Assert.assertTrue(evictedRoots.isEmpty(), "Explicit removals must not trigger implicit-eviction callbacks");
    }

    /**
     * Verifies bounded project-index eviction removes the eldest project subtree and invokes the callback.
     */
    @Test
    public void registerProject_lruEviction_removesSubtreeAndInvokesCallback() {
        List<DocumentUri> evictedRoots = new ArrayList<>();
        resolver = new UriResolver(1, evictedRoots::add);

        Project firstProject = projectAt("/workspace/first");
        Project secondProject = projectAt("/workspace/second");
        DocumentUri firstRoot = fileUri("/workspace/first");
        DocumentUri secondRoot = fileUri("/workspace/second");
        DocumentUri firstDocument = fileUri("/workspace/first/main.bal");

        resolver.registerProject(firstRoot, firstProject);
        resolver.register(firstDocument, new ResolvedEntry.DocumentEntry(documentOf(moduleOf(firstProject))));
        resolver.registerProject(secondRoot, secondProject);

        Assert.assertTrue(resolver.getProject(firstRoot).isEmpty(), "Least-recently-used project should be evicted");
        Assert.assertEquals(resolver.getProject(secondRoot), Optional.of(secondProject));
        Assert.assertTrue(resolver.resolve(firstDocument).isEmpty(), "Evicted project subtree should be removed");
        Assert.assertEquals(evictedRoots, List.of(firstRoot));
    }

    /**
     * Verifies long common prefixes still resolve to independent entries.
     */
    @Test
    public void resolve_urisWithLongCommonPrefix_resolveIndependently() {
        DocumentUri firstUri = fileUri("/workspace/project/modules/common/deeply/nested/first/main.bal");
        DocumentUri secondUri = fileUri("/workspace/project/modules/common/deeply/nested/second/main.bal");
        Document firstDocument = documentOf(moduleOf(projectAt("/workspace/project")));
        Document secondDocument = documentOf(moduleOf(projectAt("/workspace/project")));

        resolver.register(firstUri, new ResolvedEntry.DocumentEntry(firstDocument));
        resolver.register(secondUri, new ResolvedEntry.DocumentEntry(secondDocument));

        Assert.assertEquals(resolver.document(firstUri), Optional.of(firstDocument));
        Assert.assertEquals(resolver.document(secondUri), Optional.of(secondDocument));
    }

    /**
     * Verifies lifecycle document update refreshes document and ancestors.
     */
    @Test
    public void onDocumentUpdate_refreshesDocumentModuleAndProjectEntries() {
        Project project = projectAt("/workspace/project");
        Module module = moduleOf(project);
        Document document = documentOf(module);
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri moduleUri = fileUri("/workspace/project/modules/auth");
        DocumentUri documentUri = fileUri("/workspace/project/modules/auth/auth.bal");

        resolver.onDocumentUpdate(documentUri, FILE_SCHEME, document);

        Assert.assertEquals(resolver.document(documentUri), Optional.of(document));
        Assert.assertEquals(resolver.module(moduleUri), Optional.of(module));
        Assert.assertSame(resolver.project(projectRootUri).orElseThrow(), project);
        Assert.assertSame(resolver.getProject(projectRootUri).orElseThrow(), project);
    }

    /**
     * Verifies document update replaces the bounded project index without reporting an eviction.
     */
    @Test
    public void onDocumentUpdate_existingBoundedProjectIndexRefreshesWithoutEviction() {
        List<DocumentUri> evictedRoots = new ArrayList<>();
        UriResolver boundedResolver = new UriResolver(2, evictedRoots::add);
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");
        Project initialProject = projectAt("/workspace/project");
        Project updatedProject = projectAt("/workspace/project");
        Document updatedDocument = documentOf(moduleOf(updatedProject));

        boundedResolver.registerProject(projectRootUri, initialProject);

        boundedResolver.onDocumentUpdate(documentUri, FILE_SCHEME, updatedDocument);

        Assert.assertSame(boundedResolver.getProject(projectRootUri).orElseThrow(), updatedProject);
        Assert.assertTrue(evictedRoots.isEmpty());
    }

    /**
     * Verifies lifecycle document remove removes only the document entry and refreshes ancestors.
     */
    @Test
    public void onDocumentRemove_existingSiblingPreservesSiblingAndRefreshesAncestors() {
        Project initialProject = projectAt("/workspace/project");
        Module initialModule = moduleOf(initialProject);
        Document removedDocument = documentOf(initialModule);
        Document siblingDocument = documentOf(initialModule);
        Project updatedProject = projectAt("/workspace/project");
        Module updatedModule = moduleOf(updatedProject);
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri moduleUri = fileUri("/workspace/project/modules/auth");
        DocumentUri removedUri = fileUri("/workspace/project/modules/auth/auth.bal");
        DocumentUri siblingUri = fileUri("/workspace/project/modules/auth/util.bal");

        resolver.onDocumentUpdate(removedUri, FILE_SCHEME, removedDocument);
        resolver.onDocumentUpdate(siblingUri, FILE_SCHEME, siblingDocument);

        resolver.onDocumentRemove(removedUri, FILE_SCHEME, updatedModule);

        Assert.assertEquals(resolver.document(removedUri), Optional.empty());
        Assert.assertEquals(resolver.document(siblingUri), Optional.of(siblingDocument));
        Assert.assertEquals(resolver.module(moduleUri), Optional.of(updatedModule));
        Assert.assertSame(resolver.project(projectRootUri).orElseThrow(), updatedProject);
    }

    /**
     * Verifies lifecycle project update evicts descendants and keeps only the refreshed project.
     */
    @Test
    public void onProjectUpdate_existingSubtreeEvictsDescendantsAndRegistersProjectOnly() {
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri moduleUri = fileUri("/workspace/project/modules/auth");
        DocumentUri documentUri = fileUri("/workspace/project/modules/auth/auth.bal");
        DocumentUri configUri = fileUri("/workspace/project/Ballerina.toml");
        Project initialProject = projectAt("/workspace/project");
        Document initialDocument = documentOf(moduleOf(initialProject));
        TomlDocument initialConfig = configOf(initialProject);
        Project updatedProject = projectAt("/workspace/project");

        resolver.onProjectCreate(projectRootUri, FILE_SCHEME, initialProject);
        resolver.onDocumentUpdate(documentUri, FILE_SCHEME, initialDocument);
        resolver.onConfigUpdate(configUri, FILE_SCHEME, initialConfig);

        resolver.onProjectUpdate(projectRootUri, FILE_SCHEME, updatedProject);

        Assert.assertSame(resolver.project(projectRootUri).orElseThrow(), updatedProject);
        Assert.assertEquals(resolver.module(moduleUri), Optional.empty());
        Assert.assertEquals(resolver.document(documentUri), Optional.empty());
        Assert.assertEquals(resolver.config(configUri), Optional.empty());
    }

    /**
     * Verifies lifecycle project remove evicts the full subtree.
     */
    @Test
    public void onProjectRemove_existingSubtreeEvictsEverythingUnderRoot() {
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");

        resolver.onDocumentUpdate(documentUri, FILE_SCHEME, mockDocument);
        resolver.onProjectRemove(projectRootUri);

        Assert.assertEquals(resolver.getProject(projectRootUri), Optional.empty());
        Assert.assertEquals(resolver.project(projectRootUri), Optional.empty());
        Assert.assertEquals(resolver.document(documentUri), Optional.empty());
    }

    /**
     * Verifies lifecycle config update registers the config and refreshes the project ancestor.
     */
    @Test
    public void onConfigUpdate_refreshesConfigAndProjectEntries() {
        Project project = projectAt("/workspace/project");
        TomlDocument config = configOf(project);
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri configUri = fileUri("/workspace/project/Ballerina.toml");

        resolver.onProjectCreate(projectRootUri, FILE_SCHEME, project);

        resolver.onConfigUpdate(configUri, FILE_SCHEME, config);

        Assert.assertEquals(resolver.config(configUri), Optional.of(config));
        Assert.assertSame(resolver.project(projectRootUri).orElseThrow(), project);
    }

    /**
     * Verifies lifecycle config remove removes only the config entry and keeps the refreshed project.
     */
    @Test
    public void onConfigRemove_existingConfigRemovesConfigAndPreservesProject() {
        Project initialProject = projectAt("/workspace/project");
        Project updatedProject = projectAt("/workspace/project");
        TomlDocument initialConfig = configOf(initialProject);
        DocumentUri projectRootUri = fileUri("/workspace/project");
        DocumentUri configUri = fileUri("/workspace/project/Ballerina.toml");

        resolver.onProjectCreate(projectRootUri, FILE_SCHEME, initialProject);
        resolver.onConfigUpdate(configUri, FILE_SCHEME, initialConfig);
        resolver.onConfigRemove(configUri, FILE_SCHEME, updatedProject);

        Assert.assertEquals(resolver.config(configUri), Optional.empty());
        Assert.assertSame(resolver.project(projectRootUri).orElseThrow(), updatedProject);
    }

    // ── Ancestor-resolution (project-entry derivation) ────────────────────────

    /**
     * Verifies that querying a document URI returns the cached project when only the project root is registered.
     */
    @Test
    public void project_documentUriQueriedWithOnlyProjectRegistered_returnsAncestorProject() {
        DocumentUri projectRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");

        resolver.registerProject(projectRoot, mockProject);

        Assert.assertEquals(resolver.project(documentUri), Optional.of(mockProject));
    }

    /**
     * Verifies that querying a deep document URI returns the cached project when only the project root is registered.
     */
    @Test
    public void project_deepDocumentUriQueriedWithOnlyProjectRegistered_returnsAncestorProject() {
        DocumentUri projectRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/modules/auth/auth.bal");

        resolver.registerProject(projectRoot, mockProject);

        Assert.assertEquals(resolver.project(documentUri), Optional.of(mockProject));
    }

    /**
     * Verifies that project() derived from a sibling project root does not bleed into an unrelated path.
     */
    @Test
    public void project_unrelatedPath_doesNotReturnSiblingProject() {
        DocumentUri projectRoot = fileUri("/workspace/project-a");

        resolver.registerProject(projectRoot, mockProject);

        Assert.assertEquals(resolver.project(fileUri("/workspace/project-b/main.bal")), Optional.empty());
    }

    /**
     * Verifies that querying a module URI returns a module derived from the ancestor project.
     */
    @Test
    public void module_documentUriQueriedWithOnlyProjectRegistered_derivesModuleFromProject() {
        DocumentUri projectRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");
        Path filePath = Path.of("/workspace/project/main.bal").toAbsolutePath().normalize();

        DocumentId docId = Mockito.mock(DocumentId.class);
        ModuleId moduleId = Mockito.mock(ModuleId.class);
        Package pkg = Mockito.mock(Package.class);
        Mockito.when(docId.moduleId()).thenReturn(moduleId);
        Mockito.when(mockProject.documentId(filePath)).thenReturn(docId);
        Mockito.when(mockProject.currentPackage()).thenReturn(pkg);
        Mockito.when(pkg.module(moduleId)).thenReturn(mockModule);

        resolver.registerProject(projectRoot, mockProject);

        Assert.assertEquals(resolver.module(documentUri), Optional.of(mockModule));
    }

    /**
     * Verifies that querying a document URI derives the document from an ancestor project entry.
     */
    @Test
    public void document_documentUriQueriedWithOnlyProjectRegistered_derivesDocumentFromProject() {
        DocumentUri projectRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");
        Path filePath = Path.of("/workspace/project/main.bal").toAbsolutePath().normalize();

        DocumentId docId = Mockito.mock(DocumentId.class);
        ModuleId moduleId = Mockito.mock(ModuleId.class);
        Package pkg = Mockito.mock(Package.class);
        Mockito.when(docId.moduleId()).thenReturn(moduleId);
        Mockito.when(mockProject.documentId(filePath)).thenReturn(docId);
        Mockito.when(mockProject.currentPackage()).thenReturn(pkg);
        Mockito.when(pkg.module(moduleId)).thenReturn(mockModule);
        Mockito.when(mockModule.document(docId)).thenReturn(mockDocument);

        resolver.registerProject(projectRoot, mockProject);

        Assert.assertEquals(resolver.document(documentUri), Optional.of(mockDocument));
    }

    /**
     * Verifies that derivation returns empty when the project does not own the requested file path.
     */
    @Test
    public void document_projectDoesNotOwnPath_returnsEmpty() {
        DocumentUri projectRoot = fileUri("/workspace/project");
        DocumentUri documentUri = fileUri("/workspace/project/main.bal");
        Path filePath = Path.of("/workspace/project/main.bal").toAbsolutePath().normalize();

        Mockito.when(mockProject.documentId(filePath)).thenThrow(new RuntimeException("not found"));

        resolver.registerProject(projectRoot, mockProject);

        Assert.assertEquals(resolver.document(documentUri), Optional.empty());
    }

    /**
     * Verifies that a module entry ancestor allows project() to derive upward.
     */
    @Test
    public void project_ancestorModuleEntry_derivesProjectFromModule() {
        DocumentUri moduleUri = fileUri("/workspace/project/modules/auth");
        DocumentUri documentUri = fileUri("/workspace/project/modules/auth/auth.bal");

        resolver.register(moduleUri, new ResolvedEntry.ModuleEntry(mockModule));

        Assert.assertEquals(resolver.project(documentUri), Optional.of(mockProject));
    }

    /**
     * Verifies concurrent reads during writes remain lock-free.
     */
    @Test
    public void concurrentReads_duringWrite_doNotBlockOrThrow() throws InterruptedException {
        DocumentUri uri = fileUri("/workspace/main.bal");
        ResolvedEntry entry = new ResolvedEntry.DocumentEntry(mockDocument);
        resolver.register(uri, entry);

        int readerCount = 50;
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(readerCount + 1);
        AtomicInteger successCount = new AtomicInteger(0);
        List<Throwable> errors = new ArrayList<>();

        ExecutorService executor = Executors.newFixedThreadPool(readerCount + 1);

        executor.submit(() -> {
            try {
                startLatch.await();
                for (int i = 0; i < 100; i++) {
                    resolver.register(uri, entry);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                doneLatch.countDown();
            }
        });

        for (int i = 0; i < readerCount; i++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < 100; j++) {
                        resolver.resolve(uri);
                        successCount.incrementAndGet();
                    }
                } catch (Throwable t) {
                    synchronized (errors) {
                        errors.add(t);
                    }
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean completed = doneLatch.await(10, TimeUnit.SECONDS);
        executor.shutdownNow();

        Assert.assertTrue(completed, "Concurrent reads/write did not complete in time");
        Assert.assertTrue(errors.isEmpty(), "Concurrent reads threw exceptions: " + errors);
        Assert.assertEquals(successCount.get(), readerCount * 100, "Not all reads completed successfully");
    }

    /**
     * Verifies concurrent reads during subtree eviction do not block or throw.
     */
    @Test
    public void concurrentReads_duringEvictSubtree_doNotBlockOrThrow() throws InterruptedException {
        DocumentUri sourceRoot = fileUri("/workspace/project");
        DocumentUri uri = fileUri("/workspace/project/main.bal");
        resolver.register(uri, new ResolvedEntry.DocumentEntry(mockDocument));

        int readerCount = 50;
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(readerCount + 1);
        List<Throwable> errors = new ArrayList<>();

        ExecutorService executor = Executors.newFixedThreadPool(readerCount + 1);
        executor.submit(() -> {
            try {
                startLatch.await();
                for (int i = 0; i < 100; i++) {
                    resolver.evictSubtree(sourceRoot);
                    resolver.register(uri, new ResolvedEntry.DocumentEntry(mockDocument));
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                doneLatch.countDown();
            }
        });

        for (int i = 0; i < readerCount; i++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    for (int j = 0; j < 100; j++) {
                        resolver.resolve(uri);
                    }
                } catch (Throwable t) {
                    synchronized (errors) {
                        errors.add(t);
                    }
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean completed = doneLatch.await(10, TimeUnit.SECONDS);
        executor.shutdownNow();

        Assert.assertTrue(completed, "Concurrent reads/evictions did not complete in time");
        Assert.assertTrue(errors.isEmpty(), "Concurrent reads threw exceptions: " + errors);
    }

    /**
     * Verifies evictSubtree on an expr: overlay leaves file: scheme entries at the same path intact.
     */
    @Test
    public void evictSubtree_exprOverlay_preservesFileSchemeEntries() {
        DocumentUri fileRoot = fileUri("/workspace/project");
        DocumentUri exprRoot = exprUri("/workspace/project");
        DocumentUri fileDoc = fileUri("/workspace/project/main.bal");
        DocumentUri exprDoc = exprUri("/workspace/project/main.bal");
        ResolvedEntry fileRootEntry = new ResolvedEntry.ProjectEntry(mockProject);
        ResolvedEntry fileDocEntry = new ResolvedEntry.DocumentEntry(mockDocument);
        ResolvedEntry exprRootEntry = new ResolvedEntry.ProjectEntry(mockProject);
        ResolvedEntry exprDocEntry = new ResolvedEntry.DocumentEntry(documentOf(moduleOf(mockProject)));

        resolver.register(fileRoot, fileRootEntry);
        resolver.register(fileDoc, fileDocEntry);
        resolver.register(exprRoot, exprRootEntry);
        resolver.register(exprDoc, exprDocEntry);

        resolver.evictSubtree(exprRoot);

        Assert.assertEquals(resolver.resolve(fileRoot, FILE_SCHEME), Optional.of(fileRootEntry));
        Assert.assertEquals(resolver.resolve(fileDoc, FILE_SCHEME), Optional.of(fileDocEntry));
        Assert.assertEquals(resolver.resolve(exprRoot, EXPR_SCHEME), Optional.empty());
        Assert.assertEquals(resolver.resolve(exprDoc, EXPR_SCHEME), Optional.empty());
    }

    private DocumentUri fileUri(String path) {
        return new DocumentUri.FileUri(Path.of(path).toAbsolutePath().normalize().toUri());
    }

    private DocumentUri exprUri(String path) {
        Path normalized = Path.of(path).toAbsolutePath().normalize();
        URI fileUri = normalized.toUri();
        return new DocumentUri.ExprUri(URI.create(EXPR_SCHEME + ":" + fileUri.getRawSchemeSpecificPart()));
    }

    private Project projectAt(String sourceRoot) {
        Project project = Mockito.mock(Project.class);
        Mockito.when(project.sourceRoot()).thenReturn(Path.of(sourceRoot).toAbsolutePath().normalize());
        return project;
    }

    private Module moduleOf(Project project) {
        Module module = Mockito.mock(Module.class);
        Mockito.when(module.project()).thenReturn(project);
        return module;
    }

    private Document documentOf(Module module) {
        Document document = Mockito.mock(Document.class);
        Mockito.when(document.module()).thenReturn(module);
        return document;
    }

    private TomlDocument configOf(Project project) {
        return Mockito.mock(TomlDocument.class, Mockito.withSettings().name("config-" + project.hashCode()));
    }
}
