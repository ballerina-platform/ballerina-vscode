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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.InProgressSnapshot;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.SnapshotView;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;


/**
 * Tests for the ADR-042 dual-snapshot contracts.
 *
 * @since 1.7.0
 */
public class DualSnapshotTest {

    @Test
    public void snapshotView_exposesSyntaxTreeAndContentVersion() throws NoSuchMethodException {
        Method syntaxTree = SnapshotView.class.getMethod("syntaxTree", DocumentId.class);
        Method contentVersion = SnapshotView.class.getMethod("contentVersion");

        Assert.assertEquals(syntaxTree.getReturnType(), SyntaxTree.class);
        Assert.assertEquals(contentVersion.getReturnType(), ContentVersion.class);
    }

    @Test
    public void stableSnapshot_extendsSnapshotView() {
        Assert.assertTrue(SnapshotView.class.isAssignableFrom(StableSnapshot.class));
        Assert.assertFalse(StableSnapshot.class.isInterface());
        Assert.assertTrue(Modifier.isFinal(StableSnapshot.class.getModifiers()));
    }

    @Test
    public void stableSnapshot_exposesSynchronousSemanticAccess() throws NoSuchMethodException {
        Method semanticModel = StableSnapshot.class.getMethod("semanticModel", ModuleId.class);
        Method compilation = StableSnapshot.class.getMethod("compilation");

        Assert.assertEquals(semanticModel.getReturnType(), SemanticModel.class);
        Assert.assertEquals(compilation.getReturnType(), PackageCompilation.class);
    }

    @Test
    public void inProgressSnapshot_extendsSnapshotView() {
        Assert.assertTrue(SnapshotView.class.isAssignableFrom(InProgressSnapshot.class));
    }

    @Test
    public void inProgressSnapshot_exposesAsyncSemanticAccess() throws NoSuchMethodException {
        Method semanticModel = InProgressSnapshot.class.getMethod("semanticModel", ModuleId.class,
                CancelChecker.class);
        Method compilation = InProgressSnapshot.class.getMethod("compilation", CancelChecker.class);

        Assert.assertEquals(semanticModel.getReturnType(), CompletableFuture.class);
        Assert.assertEquals(compilation.getReturnType(), CompletableFuture.class);
    }

    @Test
    public void stableSnapshot_stubProvidesImmediateSyntaxAndCompilation() {
        DocumentId documentId = mock(DocumentId.class);
        ModuleId moduleId = mock(ModuleId.class);
        SyntaxTree syntaxTree = mock(SyntaxTree.class);
        SemanticModel semanticModel = mock(SemanticModel.class);
        PackageCompilation compilation = mock(PackageCompilation.class);
        ContentVersion contentVersion = new ContentVersion(1);
        Path filePath = Path.of("/tmp/project/main.bal").toAbsolutePath().normalize();
        when(documentId.moduleId()).thenReturn(moduleId);

        StableSnapshot snapshot = new StableSnapshot(Map.of(documentId, syntaxTree),
                Map.of(filePath, documentId), Map.of(moduleId, semanticModel), compilation, contentVersion);

        Assert.assertSame(snapshot.syntaxTree(documentId), syntaxTree);
        Assert.assertSame(snapshot.syntaxTree(filePath), syntaxTree);
        Assert.assertSame(snapshot.semanticModel(moduleId), semanticModel);
        Assert.assertSame(snapshot.semanticModel(filePath), semanticModel);
        Assert.assertSame(snapshot.compilation(), compilation);
        Assert.assertEquals(snapshot.contentVersion(), contentVersion);
    }

    @Test
    public void inProgressSnapshot_stubProvidesImmediateSyntaxAndAsyncResults() throws Exception {
        DocumentId documentId = mock(DocumentId.class);
        ModuleId moduleId = mock(ModuleId.class);
        CancelChecker cancelChecker = mock(CancelChecker.class);
        SyntaxTree syntaxTree = mock(SyntaxTree.class);
        SemanticModel semanticModel = mock(SemanticModel.class);
        PackageCompilation compilation = mock(PackageCompilation.class);
        ContentVersion contentVersion = new ContentVersion(2);

        InProgressSnapshot snapshot = new TestInProgressSnapshot(
                Map.of(documentId, syntaxTree),
                contentVersion,
                CompletableFuture.completedFuture(semanticModel),
                CompletableFuture.completedFuture(compilation));

        Assert.assertSame(snapshot.syntaxTree(documentId), syntaxTree);
        Assert.assertSame(snapshot.semanticModel(moduleId, cancelChecker).get(), semanticModel);
        Assert.assertSame(snapshot.compilation(cancelChecker).get(), compilation);
        Assert.assertEquals(snapshot.contentVersion(), contentVersion);
    }

    private record TestInProgressSnapshot(Map<DocumentId, SyntaxTree> syntaxTrees,
                                          ContentVersion contentVersion,
                                          CompletableFuture<SemanticModel> semanticFuture,
                                          CompletableFuture<PackageCompilation> compilationFuture)
            implements InProgressSnapshot {

        @Override
        public SyntaxTree syntaxTree(DocumentId docId) {
            return syntaxTrees.get(docId);
        }

        @Override
        public CompletableFuture<SemanticModel> semanticModel(ModuleId moduleId, CancelChecker checker) {
            return semanticFuture;
        }

        @Override
        public CompletableFuture<PackageCompilation> compilation(CancelChecker checker) {
            return compilationFuture;
        }
    }
}
