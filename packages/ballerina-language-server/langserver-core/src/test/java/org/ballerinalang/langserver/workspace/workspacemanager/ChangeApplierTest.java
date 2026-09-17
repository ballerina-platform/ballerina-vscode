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
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.TextDocument;
import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeApplier;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.ResolvedEntry;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.net.URI;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Tests for ChangeApplier — drains ChangeBuffer, resolves URIs, clusters by Module, applies via modify chain.
 *
 * @since 1.7.0
 */
public class ChangeApplierTest {

    private ChangeBuffer changeBuffer;
    private UriResolver uriResolver;
    private Project mockProject;
    private Package mockPackage;

    @BeforeMethod
    public void setUp() {
        // Pre-create all mocks to avoid ByteBuddy agent re-attachment issues
        changeBuffer = mock(ChangeBuffer.class);
        uriResolver = mock(UriResolver.class);
        mockProject = mock(Project.class);
        mockPackage = mock(Package.class);
    }

    /** Creates a spy of ChangeApplier with pending URIs injected. */
    private ChangeApplier spyWithPendingUris(Set<DocumentUri> pendingUris) {
        ChangeApplier spied = spy(new ChangeApplier(changeBuffer, uriResolver));
        doReturn(pendingUris).when(spied).getPendingUrisForProject(mockProject);
        return spied;
    }

    private BufferedChange makeChange(String text, ChangeLayer layer, int version) {
        TextDocumentContentChangeEvent event = new TextDocumentContentChangeEvent(text);
        return new BufferedChange(event, layer, new ContentVersion(version));
    }

    private DocumentUri fileUri(String path) {
        return new DocumentUri.FileUri(URI.create("file://" + path));
    }

    // =========================================================================
    // Single-document change — document.modify()
    // =========================================================================

    @Test
    public void apply_singleDocumentChange_callsDocumentModify() {
        DocumentUri uri = fileUri("/workspace/main.bal");
        BufferedChange change = makeChange("fn main() {}", ChangeLayer.EDITOR, 1);
        Document mockDoc = mock(Document.class);
        Module mockModule = mock(Module.class);
        Document.Modifier mockDocModifier = mock(Document.Modifier.class);
        TextDocument mockTextDoc = mock(TextDocument.class);

        when(changeBuffer.drain(uri, ChangeLayer.EDITOR)).thenReturn(List.of(change));
        when(changeBuffer.drain(uri, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri, ChangeLayer.EXPR)).thenReturn(List.of());
        when(uriResolver.resolve(uri)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc)));
        when(mockDoc.module()).thenReturn(mockModule);
        when(mockDoc.textDocument()).thenReturn(mockTextDoc);
        when(mockTextDoc.toString()).thenReturn("");
        when(mockDoc.modify()).thenReturn(mockDocModifier);
        when(mockDocModifier.withContent(any())).thenReturn(mockDocModifier);
        when(mockDocModifier.apply()).thenReturn(mockDoc);
        when(mockProject.currentPackage()).thenReturn(mockPackage);

        boolean result = spyWithPendingUris(Set.of(uri)).apply(mockProject);

        Assert.assertTrue(result);
        verify(mockDoc, times(1)).modify();
        verify(mockDocModifier, times(1)).withContent("fn main() {}");
        verify(mockDocModifier, times(1)).apply();
    }

    // =========================================================================
    // Multi-document same-module clustering
    // =========================================================================

    @Test
    public void apply_multiDocumentSameModule_appliesEachDocument() {
        DocumentUri uri1 = fileUri("/workspace/main.bal");
        DocumentUri uri2 = fileUri("/workspace/util.bal");
        BufferedChange change1 = makeChange("fn foo() {}", ChangeLayer.EDITOR, 1);
        BufferedChange change2 = makeChange("fn bar() {}", ChangeLayer.EDITOR, 1);

        Document mockDoc1 = mock(Document.class);
        Document mockDoc2 = mock(Document.class);
        Module mockModule = mock(Module.class);
        Document.Modifier mockMod1 = mock(Document.Modifier.class);
        Document.Modifier mockMod2 = mock(Document.Modifier.class);
        TextDocument mockText1 = mock(TextDocument.class);
        TextDocument mockText2 = mock(TextDocument.class);

        when(changeBuffer.drain(uri1, ChangeLayer.EDITOR)).thenReturn(List.of(change1));
        when(changeBuffer.drain(uri1, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri1, ChangeLayer.EXPR)).thenReturn(List.of());
        when(changeBuffer.drain(uri2, ChangeLayer.EDITOR)).thenReturn(List.of(change2));
        when(changeBuffer.drain(uri2, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri2, ChangeLayer.EXPR)).thenReturn(List.of());
        when(mockProject.currentPackage()).thenReturn(mockPackage);
        when(uriResolver.resolve(uri1)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc1)));
        when(uriResolver.resolve(uri2)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc2)));
        when(mockDoc1.module()).thenReturn(mockModule);
        when(mockDoc2.module()).thenReturn(mockModule);
        when(mockDoc1.textDocument()).thenReturn(mockText1);
        when(mockText1.toString()).thenReturn("");
        when(mockDoc2.textDocument()).thenReturn(mockText2);
        when(mockText2.toString()).thenReturn("");
        when(mockDoc1.modify()).thenReturn(mockMod1);
        when(mockDoc2.modify()).thenReturn(mockMod2);
        when(mockMod1.withContent(any())).thenReturn(mockMod1);
        when(mockMod2.withContent(any())).thenReturn(mockMod2);
        when(mockMod1.apply()).thenReturn(mockDoc1);
        when(mockMod2.apply()).thenReturn(mockDoc2);

        boolean result = spyWithPendingUris(Set.of(uri1, uri2)).apply(mockProject);

        Assert.assertTrue(result);
        verify(mockDoc1, times(1)).modify();
        verify(mockDoc2, times(1)).modify();
    }

    // =========================================================================
    // Multi-module changes
    // =========================================================================

    @Test
    public void apply_multiModuleChanges_appliesEachDocument() {
        DocumentUri uri1 = fileUri("/workspace/m1/main.bal");
        DocumentUri uri2 = fileUri("/workspace/m2/util.bal");
        BufferedChange change1 = makeChange("fn foo() {}", ChangeLayer.EDITOR, 1);
        BufferedChange change2 = makeChange("fn bar() {}", ChangeLayer.EDITOR, 1);

        Document mockDoc1 = mock(Document.class);
        Document mockDoc2 = mock(Document.class);
        Module mockModule1 = mock(Module.class);
        Module mockModule2 = mock(Module.class);
        Document.Modifier mockMod1 = mock(Document.Modifier.class);
        Document.Modifier mockMod2 = mock(Document.Modifier.class);
        TextDocument mockText1 = mock(TextDocument.class);
        TextDocument mockText2 = mock(TextDocument.class);

        when(changeBuffer.drain(uri1, ChangeLayer.EDITOR)).thenReturn(List.of(change1));
        when(changeBuffer.drain(uri1, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri1, ChangeLayer.EXPR)).thenReturn(List.of());
        when(changeBuffer.drain(uri2, ChangeLayer.EDITOR)).thenReturn(List.of(change2));
        when(changeBuffer.drain(uri2, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri2, ChangeLayer.EXPR)).thenReturn(List.of());
        when(mockProject.currentPackage()).thenReturn(mockPackage);
        when(uriResolver.resolve(uri1)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc1)));
        when(uriResolver.resolve(uri2)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc2)));
        when(mockDoc1.module()).thenReturn(mockModule1);
        when(mockDoc2.module()).thenReturn(mockModule2);
        when(mockDoc1.textDocument()).thenReturn(mockText1);
        when(mockText1.toString()).thenReturn("");
        when(mockDoc2.textDocument()).thenReturn(mockText2);
        when(mockText2.toString()).thenReturn("");
        when(mockDoc1.modify()).thenReturn(mockMod1);
        when(mockDoc2.modify()).thenReturn(mockMod2);
        when(mockMod1.withContent(any())).thenReturn(mockMod1);
        when(mockMod2.withContent(any())).thenReturn(mockMod2);
        when(mockMod1.apply()).thenReturn(mockDoc1);
        when(mockMod2.apply()).thenReturn(mockDoc2);

        boolean result = spyWithPendingUris(Set.of(uri1, uri2)).apply(mockProject);

        Assert.assertTrue(result);
        verify(mockDoc1, times(1)).modify();
        verify(mockDoc2, times(1)).modify();
    }

    // =========================================================================
    // Empty buffer — no-op
    // =========================================================================

    @Test
    public void apply_emptyBuffer_returnsFalseWithoutTouchingProject() {
        boolean result = spyWithPendingUris(Set.of()).apply(mockProject);

        Assert.assertFalse(result);
        verify(mockProject, never()).currentPackage();
    }

    @Test
    public void apply_pendingUrisButAllDrainEmpty_returnsFalse() {
        DocumentUri uri = fileUri("/workspace/main.bal");
        // URI is "pending" but buffer drained to nothing (e.g., already consumed elsewhere)
        when(changeBuffer.drain(uri, ChangeLayer.EDITOR)).thenReturn(List.of());
        when(changeBuffer.drain(uri, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri, ChangeLayer.EXPR)).thenReturn(List.of());

        boolean result = spyWithPendingUris(Set.of(uri)).apply(mockProject);

        Assert.assertFalse(result);
        verify(mockProject, never()).currentPackage();
    }

    // =========================================================================
    // Layer ordering — EDITOR → AI → EXPR applied as separate rounds
    // =========================================================================

    @Test
    public void apply_multipleLayersEditorFirst_appliesInLayerPriorityOrder() {
        DocumentUri uri = fileUri("/workspace/main.bal");
        Document mockDoc = mock(Document.class);
        Module mockModule = mock(Module.class);
        Document.Modifier mockDocModifier = mock(Document.Modifier.class);
        TextDocument mockTextDoc = mock(TextDocument.class);

        when(changeBuffer.drain(uri, ChangeLayer.EDITOR)).thenReturn(
                List.of(makeChange("v1", ChangeLayer.EDITOR, 1)));
        when(changeBuffer.drain(uri, ChangeLayer.AI)).thenReturn(
                List.of(makeChange("v2", ChangeLayer.AI, 2)));
        when(changeBuffer.drain(uri, ChangeLayer.EXPR)).thenReturn(
                List.of(makeChange("v3", ChangeLayer.EXPR, 3)));
        when(uriResolver.resolve(uri)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc)));
        when(mockDoc.module()).thenReturn(mockModule);
        when(mockDoc.textDocument()).thenReturn(mockTextDoc);
        when(mockTextDoc.toString()).thenReturn("");
        when(mockDoc.modify()).thenReturn(mockDocModifier);
        when(mockDocModifier.withContent(any())).thenReturn(mockDocModifier);
        when(mockDocModifier.apply()).thenReturn(mockDoc);
        when(mockProject.currentPackage()).thenReturn(mockPackage);

        boolean result = spyWithPendingUris(Set.of(uri)).apply(mockProject);

        Assert.assertTrue(result);
        // One apply() call per layer
        verify(mockDocModifier, times(3)).apply();
    }

    // =========================================================================
    // Unresolved URI — skipped gracefully
    // =========================================================================

    @Test
    public void apply_unresolvedUri_skipsAndContinues() {
        DocumentUri uri1 = fileUri("/workspace/main.bal");
        DocumentUri uri2 = fileUri("/workspace/missing.bal");
        Document mockDoc1 = mock(Document.class);
        Module mockModule1 = mock(Module.class);
        Document.Modifier mockDocModifier = mock(Document.Modifier.class);
        TextDocument mockTextDoc = mock(TextDocument.class);

        when(changeBuffer.drain(uri1, ChangeLayer.EDITOR)).thenReturn(
                List.of(makeChange("fn foo() {}", ChangeLayer.EDITOR, 1)));
        when(changeBuffer.drain(uri1, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri1, ChangeLayer.EXPR)).thenReturn(List.of());
        when(changeBuffer.drain(uri2, ChangeLayer.EDITOR)).thenReturn(
                List.of(makeChange("fn bar() {}", ChangeLayer.EDITOR, 1)));
        when(changeBuffer.drain(uri2, ChangeLayer.AI)).thenReturn(List.of());
        when(changeBuffer.drain(uri2, ChangeLayer.EXPR)).thenReturn(List.of());
        when(mockProject.currentPackage()).thenReturn(mockPackage);
        when(uriResolver.resolve(uri1)).thenReturn(Optional.of(new ResolvedEntry.DocumentEntry(mockDoc1)));
        when(uriResolver.resolve(uri2)).thenReturn(Optional.empty());
        when(mockDoc1.module()).thenReturn(mockModule1);
        when(mockDoc1.textDocument()).thenReturn(mockTextDoc);
        when(mockTextDoc.toString()).thenReturn("");
        when(mockDoc1.modify()).thenReturn(mockDocModifier);
        when(mockDocModifier.withContent(any())).thenReturn(mockDocModifier);
        when(mockDocModifier.apply()).thenReturn(mockDoc1);

        boolean result = spyWithPendingUris(Set.of(uri1, uri2)).apply(mockProject);

        Assert.assertTrue(result);
        verify(mockDoc1, times(1)).modify();
    }

    // =========================================================================
    // getPendingUrisForProject — enumerates compiler project documents
    // =========================================================================

    @Test
    public void getPendingUrisForProject_returnsUrisWithPendingChanges() {
        // Given: a project with a default module containing two documents
        Path sourceRoot = Paths.get("/workspace/myproject");
        DocumentId docId1 = mock(DocumentId.class);
        DocumentId docId2 = mock(DocumentId.class);
        Document compilerDoc1 = mock(Document.class);
        Document compilerDoc2 = mock(Document.class);
        Module defaultModule = mock(Module.class);
        ModuleId defaultModuleId = mock(ModuleId.class);
        ModuleName mockModuleName = mock(ModuleName.class);
        Project compilerProject = mock(Project.class);
        Package compilerPackage = mock(Package.class);

        when(compilerProject.currentPackage()).thenReturn(compilerPackage);
        when(compilerPackage.moduleIds()).thenReturn(List.of(defaultModuleId));
        when(compilerPackage.module(defaultModuleId)).thenReturn(defaultModule);
        when(defaultModule.documentIds()).thenReturn((Collection) List.of(docId1, docId2));
        when(defaultModule.document(docId1)).thenReturn(compilerDoc1);
        when(defaultModule.document(docId2)).thenReturn(compilerDoc2);
        when(defaultModule.isDefaultModule()).thenReturn(true);
        when(defaultModule.moduleName()).thenReturn(mockModuleName);
        when(defaultModule.project()).thenReturn(compilerProject);
        when(compilerProject.sourceRoot()).thenReturn(sourceRoot);
        when(compilerDoc1.name()).thenReturn("main.bal");
        when(compilerDoc2.name()).thenReturn("util.bal");

        // Only main.bal has pending changes
        DocumentUri mainUri = new DocumentUri.FileUri(sourceRoot.resolve("main.bal").toUri());
        DocumentUri utilUri = new DocumentUri.FileUri(sourceRoot.resolve("util.bal").toUri());
        when(changeBuffer.hasChanges(mainUri)).thenReturn(true);
        when(changeBuffer.hasChanges(utilUri)).thenReturn(false);

        ChangeApplier realApplier = new ChangeApplier(changeBuffer, uriResolver);
        Set<DocumentUri> result = realApplier.getPendingUrisForProject(compilerProject);

        Assert.assertEquals(result, Set.of(mainUri));
    }

    @Test
    // RED: this test should fail — ChangeApplier is still project-traversal based instead of buffer-driven
    public void applyAll_multipleProjects_returnsAffectedRootsFromBufferedUris() {
        DocumentUri uri1 = fileUri("/workspace/p1/main.bal");
        DocumentUri uri2 = fileUri("/workspace/p2/main.bal");
        BufferedChange change1 = makeChange("fn foo() {}", ChangeLayer.EDITOR, 1);
        BufferedChange change2 = makeChange("fn bar() {}", ChangeLayer.EDITOR, 1);

        Document mockDoc1 = mock(Document.class);
        Document mockDoc2 = mock(Document.class);
        Module mockModule1 = mock(Module.class);
        Module mockModule2 = mock(Module.class);
        Project mockProject1 = mock(Project.class);
        Project mockProject2 = mock(Project.class);
        Document.Modifier mockMod1 = mock(Document.Modifier.class);
        Document.Modifier mockMod2 = mock(Document.Modifier.class);
        TextDocument mockText1 = mock(TextDocument.class);
        TextDocument mockText2 = mock(TextDocument.class);

        Path sourceRoot1 = Path.of("/workspace/p1").toAbsolutePath().normalize();
        Path sourceRoot2 = Path.of("/workspace/p2").toAbsolutePath().normalize();

        when(changeBuffer.pendingUris()).thenReturn(Set.of(uri1, uri2));
        when(changeBuffer.drain(uri1)).thenReturn(List.of(change1));
        when(changeBuffer.drain(uri2)).thenReturn(List.of(change2));
        when(uriResolver.document(uri1)).thenReturn(Optional.of(mockDoc1));
        when(uriResolver.document(uri2)).thenReturn(Optional.of(mockDoc2));
        when(mockDoc1.module()).thenReturn(mockModule1);
        when(mockDoc2.module()).thenReturn(mockModule2);
        when(mockModule1.project()).thenReturn(mockProject1);
        when(mockModule2.project()).thenReturn(mockProject2);
        when(mockProject1.sourceRoot()).thenReturn(sourceRoot1);
        when(mockProject2.sourceRoot()).thenReturn(sourceRoot2);
        when(mockDoc1.textDocument()).thenReturn(mockText1);
        when(mockDoc2.textDocument()).thenReturn(mockText2);
        when(mockText1.toString()).thenReturn("");
        when(mockText2.toString()).thenReturn("");
        when(mockDoc1.modify()).thenReturn(mockMod1);
        when(mockDoc2.modify()).thenReturn(mockMod2);
        when(mockMod1.withContent(any())).thenReturn(mockMod1);
        when(mockMod2.withContent(any())).thenReturn(mockMod2);
        when(mockMod1.apply()).thenReturn(mockDoc1);
        when(mockMod2.apply()).thenReturn(mockDoc2);

        ChangeApplier applier = new ChangeApplier(changeBuffer, uriResolver);
        Set<DocumentUri> affectedRoots = applier.applyAll();

        Assert.assertEquals(affectedRoots,
                Set.of(new DocumentUri.FileUri(sourceRoot1.toUri()), new DocumentUri.FileUri(sourceRoot2.toUri())));
    }
}
