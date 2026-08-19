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

package org.ballerinalang.langserver.workspace.workspacemanager.change;

import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.util.ProjectConstants;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.ResolvedEntry;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;

import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import javax.annotation.Nonnull;

/**
 * Drains buffered changes and applies them through the public compiler modify APIs.
 *
 * <p>TODO: Once the compiler exposes public batch-update APIs, replace the per-document fallback
 * with {@code module.modify().updateDocument(...)} and package-level batching.</p>
 *
 * <p>This applier only supports full-text document sync ({@code TextDocumentSyncKind.Full}). The previous
 * {@code ContentChangeStrategy} abstraction (with separate {@code FullTextChangeStrategy} and
 * {@code IncrementalChangeStrategy} implementations) has been collapsed inline because incremental text
 * document sync will not be supported with jBallerina/p>
 *
 * @since 1.7.0
 */
public class ChangeApplier {
    private static final Set<String> WATCHER_MARKERS = Set.of(
            FileChangeType.Created.name(),
            FileChangeType.Changed.name(),
            FileChangeType.Deleted.name());
    private final ChangeBuffer changeBuffer;
    private final UriResolver uriResolver;

    /**
     * Creates a new ChangeApplier.
     *
     * @param changeBuffer the per-URI, per-layer change buffer
     * @param uriResolver the URI-to-Document resolver
     */
    public ChangeApplier(@Nonnull ChangeBuffer changeBuffer, @Nonnull UriResolver uriResolver) {
        this.changeBuffer = changeBuffer;
        this.uriResolver = uriResolver;
    }

    /**
     * Legacy single-project apply path retained for existing compatibility tests.
     *
     * @param project the compiler Project to apply changes to
     * @return {@code true} if any changes were applied
     */
    public boolean apply(@Nonnull Project project) {
        boolean anyChangesApplied = false;
        for (ChangeLayer layer : ChangeLayer.values()) {
            anyChangesApplied |= applyLayer(project, layer);
        }
        return anyChangesApplied;
    }

    /**
     * Drains all pending buffered URIs, groups them by source root, applies the changes,
     * and returns the affected roots.
     *
     * @return affected source roots
     */
    public Set<DocumentUri> applyAll() {
        Set<DocumentUri> pendingUris = changeBuffer.pendingUris();
        if (pendingUris.isEmpty()) {
            return Set.of();
        }

        Map<DocumentUri, List<ResolvedPendingChange>> changesByRoot = new HashMap<>();
        for (DocumentUri uri : pendingUris) {
            List<BufferedChange> bufferedChanges = changeBuffer.drain(uri);
            if (bufferedChanges.isEmpty()) {
                continue;
            }

            Optional<ResolvedEntry> resolvedEntry = resolveEntry(uri);
            if (resolvedEntry.isEmpty()) {
                continue;
            }

            Optional<DocumentUri> sourceRoot = sourceRootOf(uri, resolvedEntry.get());
            if (sourceRoot.isEmpty()) {
                continue;
            }

            List<TextDocumentContentChangeEvent> changes = bufferedChanges.stream()
                    .map(BufferedChange::change)
                    .toList();
            changesByRoot.computeIfAbsent(sourceRoot.get(), ignored -> new ArrayList<>())
                    .add(new ResolvedPendingChange(uri, resolvedEntry.get(), changes));
        }

        if (changesByRoot.isEmpty()) {
            return Set.of();
        }

        Set<DocumentUri> affectedRoots = new HashSet<>();
        for (Map.Entry<DocumentUri, List<ResolvedPendingChange>> entry : changesByRoot.entrySet()) {
            if (applyResolvedChanges(entry.getValue())) {
                affectedRoots.add(entry.getKey());
            }
        }
        return affectedRoots;
    }

    private boolean applyLayer(Project project, ChangeLayer layer) {
        Set<DocumentUri> pendingUris = getPendingUrisForProject(project);
        if (pendingUris.isEmpty()) {
            return false;
        }

        Map<DocumentUri, List<BufferedChange>> changesByUri = new HashMap<>();
        for (DocumentUri uri : pendingUris) {
            List<BufferedChange> changes = changeBuffer.drain(uri, layer);
            if (!changes.isEmpty()) {
                changesByUri.put(uri, changes);
            }
        }

        if (changesByUri.isEmpty()) {
            return false;
        }

        boolean applied = false;
        for (Map.Entry<DocumentUri, List<BufferedChange>> entry : changesByUri.entrySet()) {
            Optional<Document> document = resolveDocument(entry.getKey());
            if (document.isEmpty()) {
                continue;
            }
            List<TextDocumentContentChangeEvent> events = entry.getValue().stream()
                    .map(BufferedChange::change)
                    .toList();
            applyViaDocumentModify(entry.getKey(), document.get(), events);
            applied = true;
        }
        return applied;
    }

    private boolean applyResolvedChanges(List<ResolvedPendingChange> resolvedChanges) {
        boolean applied = false;
        for (ResolvedPendingChange pendingChange : resolvedChanges) {
            ResolvedEntry resolvedEntry = pendingChange.entry();
            if (resolvedEntry instanceof ResolvedEntry.DocumentEntry documentEntry) {
                Document latestDocument = uriResolver.document(pendingChange.uri()).orElse(documentEntry.document());
                applyViaDocumentModify(pendingChange.uri(), latestDocument, pendingChange.changes());
                applied = true;
                continue;
            }
            if (resolvedEntry instanceof ResolvedEntry.ConfigEntry configEntry) {
                applied |= applyConfigChange(configEntry, pendingChange.uri(), pendingChange.changes());
            }
        }
        return applied;
    }

    private boolean applyConfigChange(ResolvedEntry.ConfigEntry configEntry, DocumentUri uri,
                                      List<TextDocumentContentChangeEvent> changes) {
        Optional<Project> project = configEntry.project();
        if (project.isEmpty()) {
            return containsWatcherMarker(changes);
        }

        Path path = Path.of(UriResolver.pathOf(uri.uri()));
        Path fileName = path.getFileName();
        if (fileName == null) {
            return false;
        }

        String configName = fileName.toString();
        if (containsWatcherMarker(changes)) {
            return true;
        }

        String content = resolveConfigContent(configEntry, changes);
        Package currentPackage = project.get().currentPackage();
        return switch (configName) {
            case ProjectConstants.BALLERINA_TOML -> currentPackage.ballerinaToml()
                    .map(ballerinaToml -> ballerinaToml.modify().withContent(content).apply())
                    .isPresent();
            case ProjectConstants.DEPENDENCIES_TOML -> currentPackage.dependenciesToml()
                    .map(dependenciesToml -> dependenciesToml.modify().withContent(content).apply())
                    .isPresent();
            case ProjectConstants.CLOUD_TOML -> currentPackage.cloudToml()
                    .map(cloudToml -> cloudToml.modify().withContent(content).apply())
                    .isPresent();
            default -> false;
        };
    }

    private String resolveConfigContent(ResolvedEntry.ConfigEntry configEntry,
                                        List<TextDocumentContentChangeEvent> changes) {
        String baseContent = configEntry.config().textDocument().toString();
        if (changes.isEmpty()) {
            return baseContent;
        }
        TextDocumentContentChangeEvent lastChange = changes.get(changes.size() - 1);
        if (lastChange.getRange() == null) {
            return lastChange.getText();
        }
        return baseContent;
    }

    private boolean containsWatcherMarker(List<TextDocumentContentChangeEvent> changes) {
        return changes.stream()
                .allMatch(change -> change.getRange() == null && WATCHER_MARKERS.contains(change.getText()));
    }

    private void applyViaDocumentModify(DocumentUri uri, Document document,
                                        List<TextDocumentContentChangeEvent> changes) {
        // Full-text sync: the client always sends the complete document content with every
        // notification, so only the last event carries the authoritative content. See the
        // class Javadoc for why incremental sync is not supported with jBallerina.
        String content = changes.get(changes.size() - 1).getText();
        Document updated = document.modify()
                .withContent(content)
                .apply();
        uriResolver.onDocumentUpdate(uri, uri.uri().getScheme(), updated);
    }

    private Optional<DocumentUri> sourceRootOf(DocumentUri uri, ResolvedEntry resolvedEntry) {
        if (resolvedEntry instanceof ResolvedEntry.DocumentEntry documentEntry) {
            return Optional.of(sourceRootLike(uri, documentEntry.document().module().project().sourceRoot()));
        }
        if (resolvedEntry instanceof ResolvedEntry.ModuleEntry moduleEntry) {
            return Optional.of(sourceRootLike(uri, moduleEntry.module().project().sourceRoot()));
        }
        if (resolvedEntry instanceof ResolvedEntry.ProjectEntry projectEntry) {
            return Optional.of(sourceRootLike(uri, projectEntry.project().sourceRoot()));
        }
        if (resolvedEntry instanceof ResolvedEntry.ConfigEntry configEntry) {
            return configEntry.project().map(project -> sourceRootLike(uri, project.sourceRoot()));
        }
        return Optional.empty();
    }

    private Optional<Document> resolveDocument(DocumentUri uri) {
        Optional<Document> document = uriResolver.document(uri);
        if (document.isPresent()) {
            return document;
        }
        return resolveEntry(uri)
                .filter(ResolvedEntry.DocumentEntry.class::isInstance)
                .map(ResolvedEntry.DocumentEntry.class::cast)
                .map(ResolvedEntry.DocumentEntry::document);
    }

    private Optional<ResolvedEntry> resolveEntry(DocumentUri uri) {
        Optional<ResolvedEntry> resolvedEntry = uriResolver.resolve(uri);
        if (resolvedEntry.isPresent()) {
            return resolvedEntry;
        }
        return uriResolver.document(uri).map(ResolvedEntry.DocumentEntry::new);
    }

    private DocumentUri sourceRootLike(DocumentUri template, Path sourceRoot) {
        String normalizedPath = sourceRoot.toAbsolutePath().normalize().toUri().getPath();
        return switch (template) {
            case DocumentUri.FileUri ignored ->
                    new DocumentUri.FileUri(sourceRoot.toAbsolutePath().normalize().toUri());
            case DocumentUri.ExprUri ignored -> new DocumentUri.ExprUri(URI.create("expr://" + normalizedPath));
            case DocumentUri.AiUri ignored -> new DocumentUri.AiUri(URI.create("ai://" + normalizedPath));
        };
    }

    /**
     * Enumerates source documents in the given compiler project and returns the
     * subset with buffered changes.
     *
     * @param project the compiler project to enumerate
     * @return pending document URIs for the project
     */
    public Set<DocumentUri> getPendingUrisForProject(Project project) {
        Set<DocumentUri> result = new HashSet<>();
        Package currentPackage = project.currentPackage();
        for (ModuleId moduleId : currentPackage.moduleIds()) {
            Module module = currentPackage.module(moduleId);
            for (DocumentId documentId : module.documentIds()) {
                Document document = module.document(documentId);
                DocumentUri uri = toDocumentUri(module, document);
                if (changeBuffer.hasChanges(uri)) {
                    result.add(uri);
                }
            }
        }
        return result;
    }

    private DocumentUri toDocumentUri(Module module, Document document) {
        Path sourceRoot = module.project().sourceRoot();
        Path documentPath;
        if (module.isDefaultModule()) {
            documentPath = sourceRoot.resolve(document.name());
        } else {
            documentPath = sourceRoot
                    .resolve(ProjectConstants.MODULES_ROOT)
                    .resolve(module.moduleName().moduleNamePart())
                    .resolve(document.name());
        }
        return new DocumentUri.FileUri(documentPath.toUri());
    }

    private record ResolvedPendingChange(DocumentUri uri, ResolvedEntry entry,
                                         List<TextDocumentContentChangeEvent> changes) {
    }
}
