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

package org.ballerinalang.langserver.workspace.compilerengine.snapshot;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;

import java.nio.file.Path;
import java.util.Map;

import javax.annotation.Nonnull;

/**
 * Stable snapshot for the last successful compilation.
 *
 * <p>This snapshot is fully materialized and provides synchronous access to syntax trees,
 * semantic models, and package compilation results for a single content version.
 *
 * @since 1.7.0
 */
public final class StableSnapshot implements SnapshotView {

    private final Map<DocumentId, SyntaxTree> syntaxTrees;
    private final Map<Path, DocumentId> pathToDocumentIds;
    private final Map<ModuleId, SemanticModel> semanticModels;
    private final PackageCompilation compilation;
    private final ContentVersion contentVersion;

    /**
     * Creates a fully materialized stable snapshot.
     *
     * @param syntaxTrees syntax trees keyed by document id
     * @param pathToDocumentIds document ids keyed by normalized path
     * @param semanticModels semantic models keyed by module id
     * @param compilation package compilation for the snapshot
     * @param contentVersion content version represented by the snapshot
     */
    public StableSnapshot(@Nonnull Map<DocumentId, SyntaxTree> syntaxTrees,
                          @Nonnull Map<Path, DocumentId> pathToDocumentIds,
                          @Nonnull Map<ModuleId, SemanticModel> semanticModels,
                          @Nonnull PackageCompilation compilation,
                          @Nonnull ContentVersion contentVersion) {
        this.syntaxTrees = Map.copyOf(syntaxTrees);
        this.pathToDocumentIds = Map.copyOf(pathToDocumentIds);
        this.semanticModels = Map.copyOf(semanticModels);
        this.compilation = compilation;
        this.contentVersion = contentVersion;
    }

    @Override
    public SyntaxTree syntaxTree(DocumentId docId) {
        return syntaxTrees.get(docId);
    }

    /**
     * Returns the syntax tree for the given file path.
     *
     * @param filePath source file path
     * @return syntax tree, or {@code null} when the file is not present in the snapshot
     */
    public SyntaxTree syntaxTree(@Nonnull Path filePath) {
        DocumentId documentId = pathToDocumentIds.get(normalize(filePath));
        return documentId == null ? null : syntaxTrees.get(documentId);
    }

    @Override
    public ContentVersion contentVersion() {
        return contentVersion;
    }

    /**
     * Returns the semantic model for the given module.
     *
     * @param moduleId the module identifier
     * @return the module semantic model
     */
    public SemanticModel semanticModel(@Nonnull ModuleId moduleId) {
        return semanticModels.get(moduleId);
    }

    /**
     * Returns the semantic model for the given file path.
     *
     * @param filePath source file path
     * @return semantic model, or {@code null} when the file is not present in the snapshot
     */
    public SemanticModel semanticModel(@Nonnull Path filePath) {
        DocumentId documentId = pathToDocumentIds.get(normalize(filePath));
        return documentId == null ? null : semanticModels.get(documentId.moduleId());
    }

    /**
     * Returns the fully materialized package compilation.
     *
     * @return the package compilation
     */
    public PackageCompilation compilation() {
        return compilation;
    }

    private static Path normalize(@Nonnull Path filePath) {
        return filePath.toAbsolutePath().normalize();
    }
}
