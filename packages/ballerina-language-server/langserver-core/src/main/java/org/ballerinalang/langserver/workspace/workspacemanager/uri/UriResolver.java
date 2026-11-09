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

package org.ballerinalang.langserver.workspace.workspacemanager.uri;

import com.google.common.cache.Cache;
import com.google.common.cache.CacheBuilder;
import com.google.common.cache.RemovalCause;
import com.google.common.cache.RemovalNotification;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.TomlDocument;
import io.ballerina.projects.util.ProjectConstants;

import java.lang.reflect.Method;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import javax.annotation.Nonnull;

/**
 * Lock-free URI resolution cache backed by an immutable persistent trie.
 *
 * <p>Readers call resolution methods with zero synchronization. They snapshot the current trie
 * root via a plain {@link AtomicReference#get()} and traverse the immutable structure without
 * locking. A single maintainer thread updates the root via {@link AtomicReference#set(Object)}
 * after constructing a new immutable snapshot.</p>
 *
 * <p>Uses a trie-based URI resolution design.</p>
 *
 * @since 1.7.0
 */
public final class UriResolver {
    private final AtomicReference<TrieNode<ResolvedEntry>> root = new AtomicReference<>(new TrieNode<>());
    private final Cache<DocumentUri, ResolvedEntry> projectIndex;
    private final Consumer<DocumentUri> onEviction;
    /**
     * Creates an unbounded resolver with no implicit-eviction callback.
     */
    public UriResolver() {
        this.projectIndex = CacheBuilder.newBuilder()
                .recordStats()
                .build();
        this.onEviction = ignored -> { };
    }

    /**
     * Creates a resolver with a bounded project index and an implicit-eviction callback.
     *
     * @param maxProjects maximum number of indexed projects
     * @param onEviction callback invoked for implicit evictions only
     */
    public UriResolver(int maxProjects, @Nonnull Consumer<DocumentUri> onEviction) {
        this.projectIndex = CacheBuilder.newBuilder()
                .maximumSize(maxProjects)
                .recordStats()
                .removalListener(this::onProjectIndexRemoval)
                .build();
        this.onEviction = onEviction;
    }

    /**
     * Resolves the given URI using the URI's own scheme.
     *
     * @param uri the document URI to resolve
     * @return the resolved entry, or empty if not cached
     */
    public @Nonnull Optional<ResolvedEntry> resolve(@Nonnull DocumentUri uri) {
        return resolve(uri, uri.uri().getScheme());
    }

    /**
     * Resolves the given URI to the most specific cached entry for the supplied scheme.
     *
     * @param uri the document URI to resolve
     * @param scheme the scheme to discriminate by
     * @return the resolved entry, or empty if not cached
     */
    public @Nonnull Optional<ResolvedEntry> resolve(@Nonnull DocumentUri uri, @Nonnull String scheme) {
        return root.get().lookup(toSegments(uri.uri()), scheme);
    }

    /**
     * Resolves a cached document using the URI's own scheme.
     *
     * @param uri the document URI
     * @return the cached document, or empty if unavailable
     */
    public @Nonnull Optional<Document> document(@Nonnull DocumentUri uri) {
        return document(uri, uri.uri().getScheme());
    }

    /**
     * Resolves a cached document for the supplied scheme.
     *
     * <p>If the exact URI is not cached but an ancestor project entry exists, the document
     * is derived from the project using {@code project.documentId(filePath)}.</p>
     *
     * @param uri the document URI
     * @param scheme the scheme to discriminate by
     * @return the cached document, or empty if unavailable
     */
    public @Nonnull Optional<Document> document(@Nonnull DocumentUri uri, @Nonnull String scheme) {
        Optional<ResolvedEntry> exact = resolve(uri, scheme);
        if (exact.isPresent()) {
            return exact.flatMap(entry -> switch (entry) {
                case ResolvedEntry.DocumentEntry documentEntry ->
                        latestDocumentFromIndex(uri, documentEntry.document())
                                .or(() -> Optional.of(documentEntry.document()));
                case ResolvedEntry.ProjectEntry projectEntry ->
                        deriveDocument(uri, projectEntry.project());
                case ResolvedEntry.ModuleEntry moduleEntry ->
                        deriveDocument(uri, moduleEntry.module().project());
                case ResolvedEntry.ConfigEntry ignored -> Optional.empty();
            });
        }
        return resolveNearest(uri, scheme)
                .flatMap(entry -> switch (entry) {
                    case ResolvedEntry.ProjectEntry projectEntry ->
                            deriveDocument(uri, projectEntry.project());
                    case ResolvedEntry.ModuleEntry moduleEntry ->
                            deriveDocument(uri, moduleEntry.module().project());
                    default -> Optional.empty();
                });
    }

    /**
     * Resolves a module using the URI's own scheme.
     *
     * @param uri the document URI
     * @return the cached or derived module, or empty if unavailable
     */
    public @Nonnull Optional<Module> module(@Nonnull DocumentUri uri) {
        return module(uri, uri.uri().getScheme());
    }

    /**
     * Resolves a module for the supplied scheme, deriving upward from a cached document or
     * downward from an ancestor project when possible.
     *
     * @param uri the document URI
     * @param scheme the scheme to discriminate by
     * @return the cached or derived module, or empty if unavailable
     */
    public @Nonnull Optional<Module> module(@Nonnull DocumentUri uri, @Nonnull String scheme) {
        Optional<ResolvedEntry> exact = resolve(uri, scheme);
        if (exact.isPresent()) {
            return exact.flatMap(entry -> switch (entry) {
                case ResolvedEntry.ModuleEntry moduleEntry ->
                        latestModuleFromIndex(uri, moduleEntry.module())
                                .or(() -> Optional.of(moduleEntry.module()));
                case ResolvedEntry.DocumentEntry documentEntry ->
                        latestDocumentFromIndex(uri, documentEntry.document())
                                .map(Document::module)
                                .or(() -> Optional.of(documentEntry.document().module()));
                case ResolvedEntry.ProjectEntry projectEntry ->
                        deriveModule(uri, projectEntry.project());
                case ResolvedEntry.ConfigEntry ignored -> Optional.empty();
            });
        }
        return resolveNearest(uri, scheme)
                .flatMap(entry -> switch (entry) {
                    case ResolvedEntry.ProjectEntry projectEntry ->
                            deriveModule(uri, projectEntry.project());
                    case ResolvedEntry.ModuleEntry moduleEntry ->
                            deriveModule(uri, moduleEntry.module().project());
                    default -> Optional.empty();
                });
    }

    /**
     * Resolves a project using the URI's own scheme.
     *
     * @param uri the document URI
     * @return the cached or derived project, or empty if unavailable
     */
    public @Nonnull Optional<Project> project(@Nonnull DocumentUri uri) {
        return project(uri, uri.uri().getScheme());
    }

    /**
     * Resolves a project for the supplied scheme, deriving upward from cached module, document,
     * or config entries, or from the nearest ancestor project entry when possible.
     *
     * @param uri the document URI
     * @param scheme the scheme to discriminate by
     * @return the cached or derived project, or empty if unavailable
     */
    public @Nonnull Optional<Project> project(@Nonnull DocumentUri uri, @Nonnull String scheme) {
        Optional<ResolvedEntry> exact = resolve(uri, scheme);
        if (exact.isPresent()) {
            return exact.flatMap(entry -> switch (entry) {
                case ResolvedEntry.ProjectEntry projectEntry -> Optional.of(projectEntry.project());
                case ResolvedEntry.ModuleEntry moduleEntry ->
                        latestProjectFromIndex(uri, moduleEntry.module().project())
                                .or(() -> Optional.of(moduleEntry.module().project()));
                case ResolvedEntry.DocumentEntry documentEntry ->
                        latestProjectFromIndex(uri, documentEntry.document().module().project())
                                .or(() -> Optional.of(documentEntry.document().module().project()));
                case ResolvedEntry.ConfigEntry configEntry -> configEntry.project()
                        .flatMap(project -> latestProjectFromIndex(uri, project).or(() -> Optional.of(project)));
            });
        }
        return resolveNearest(uri, scheme)
                .flatMap(entry -> switch (entry) {
                    case ResolvedEntry.ProjectEntry projectEntry ->
                            Optional.of(projectEntry.project());
                    case ResolvedEntry.ModuleEntry moduleEntry ->
                            Optional.of(moduleEntry.module().project());
                    default -> Optional.empty();
                });
    }

    /**
     * Registers a project under its source root in both the trie and the bounded project index.
     *
     * @param rootUri the source root URI
     * @param project the compiler project
     */
    public void registerProject(@Nonnull DocumentUri rootUri, @Nonnull Project project) {
        ResolvedEntry.ProjectEntry entry = new ResolvedEntry.ProjectEntry(project);
        projectIndex.put(rootUri, entry);
        register(rootUri, entry);
    }

    /**
     * Removes a project from the project index. Trie cleanup is performed by the removal listener.
     *
     * @param rootUri the source root URI
     */
    public void removeProject(@Nonnull DocumentUri rootUri) {
        evictSubtree(rootUri);
        projectIndex.invalidate(rootUri);
    }

    /**
     * Returns the indexed project for the given source root.
     *
     * @param rootUri the source root URI
     * @return the indexed project, if present
     */
    public @Nonnull Optional<Project> getProject(@Nonnull DocumentUri rootUri) {
        ResolvedEntry entry = projectIndex.getIfPresent(rootUri);
        if (entry instanceof ResolvedEntry.ProjectEntry projectEntry) {
            return Optional.of(projectEntry.project());
        }
        return Optional.empty();
    }

    /**
     * Returns all currently indexed projects.
     *
     * @return indexed projects
     */
    public @Nonnull Collection<Project> allProjects() {
        Collection<Project> projects = new ArrayList<>();
        for (ResolvedEntry entry : projectIndex.asMap().values()) {
            if (entry instanceof ResolvedEntry.ProjectEntry projectEntry) {
                projects.add(projectEntry.project());
            }
        }
        return projects;
    }

    /**
     * Returns the number of indexed projects.
     *
     * @return indexed project count
     */
    public long projectCount() {
        return projectIndex.size();
    }

    /**
     * Clears all resolver entries and indexed projects.
     */
    public void clear() {
        root.set(new TrieNode<>());
        projectIndex.invalidateAll();
        projectIndex.cleanUp();
    }

    /**
     * Resolves a cached config file using the URI's own scheme.
     *
     * @param uri the document URI
     * @return the cached config, or empty if unavailable
     */
    public @Nonnull Optional<TomlDocument> config(@Nonnull DocumentUri uri) {
        return config(uri, uri.uri().getScheme());
    }

    /**
     * Resolves a cached config file for the supplied scheme.
     *
     * @param uri the document URI
     * @param scheme the scheme to discriminate by
     * @return the cached config, or empty if unavailable
     */
    public @Nonnull Optional<TomlDocument> config(@Nonnull DocumentUri uri, @Nonnull String scheme) {
        return resolve(uri, scheme).flatMap(entry -> switch (entry) {
            case ResolvedEntry.ConfigEntry configEntry -> Optional.of(configEntry.config());
            case ResolvedEntry.ProjectEntry ignored -> Optional.empty();
            case ResolvedEntry.ModuleEntry ignored -> Optional.empty();
            case ResolvedEntry.DocumentEntry ignored -> Optional.empty();
        });
    }

    /**
     * Registers a resolved entry using the URI's own scheme and the entry's target type.
     *
     * @param uri the document URI
     * @param entry the resolved back-references to store
     */
    public void register(@Nonnull DocumentUri uri, @Nonnull ResolvedEntry entry) {
        register(uri, uri.uri().getScheme(), entry);
    }

    /**
     * Registers a resolved entry using the supplied scheme and the entry's target type.
     *
     * @param uri the document URI
     * @param scheme the scheme discriminator
     * @param entry the resolved back-references to store
     */
    public void register(@Nonnull DocumentUri uri, @Nonnull String scheme, @Nonnull ResolvedEntry entry) {
        root.set(root.get().insert(toSegments(uri.uri()), scheme, entry));
    }

    /**
     * Removes all entries at the given URI for the URI's own scheme.
     *
     * @param uri the document URI to remove
     */
    public void unregister(@Nonnull DocumentUri uri) {
        unregister(uri, uri.uri().getScheme());
    }

    /**
     * Removes the cached entry at the given URI for the supplied scheme.
     *
     * @param uri the document URI to remove
     * @param scheme the scheme discriminator
     */
    public void unregister(@Nonnull DocumentUri uri, @Nonnull String scheme) {
        root.set(root.get().remove(toSegments(uri.uri()), scheme));
    }

    /**
     * Evicts all cached entries under the given source root URI prefix.
     *
     * @param sourceRootUri the source root URI whose subtree should be evicted
     */
    public void evictSubtree(@Nonnull DocumentUri sourceRootUri) {
        root.set(root.get().removeSubtree(toSegments(sourceRootUri.uri()), sourceRootUri.uri().getScheme()));
    }

    /**
     * Updates a document entry and refreshes its module and project ancestors in a single atomic swap.
     *
     * @param uri the document URI
     * @param scheme the scheme discriminator
     * @param newDocument the new document instance
     */
    public void onDocumentUpdate(@Nonnull DocumentUri uri, @Nonnull String scheme, @Nonnull Document newDocument) {
        Module module = newDocument.module();
        Project project = module.project();
        Path sourceRoot = projectRootPath(uri, project);
        DocumentUri projectRootUri = sourceRootLike(uri, sourceRoot);
        ResolvedEntry.ProjectEntry projectEntry = new ResolvedEntry.ProjectEntry(project);
        projectIndex.put(projectRootUri, projectEntry);

        TrieNode<ResolvedEntry> snapshot = root.get();
        TrieNode<ResolvedEntry> updated = snapshot
                .insert(toSegments(sourceRoot), scheme, projectEntry)
                .insert(toSegments(modulePath(uri, project)), scheme, new ResolvedEntry.ModuleEntry(module))
                .insert(toSegments(uri.uri()), scheme, new ResolvedEntry.DocumentEntry(newDocument));
        root.set(updated);
    }

    /**
     * Creates a new document entry and refreshes its ancestors in a single atomic swap.
     *
     * @param uri the document URI
     * @param scheme the scheme discriminator
     * @param newDocument the new document instance
     */
    public void onDocumentCreate(@Nonnull DocumentUri uri, @Nonnull String scheme, @Nonnull Document newDocument) {
        onDocumentUpdate(uri, scheme, newDocument);
    }

    /**
     * Removes a document entry and refreshes its module and project ancestors in a single atomic swap.
     *
     * @param uri the document URI
     * @param scheme the scheme discriminator
     * @param updatedModule the refreshed module after removal
     */
    public void onDocumentRemove(@Nonnull DocumentUri uri, @Nonnull String scheme, @Nonnull Module updatedModule) {
        Project project = updatedModule.project();
        Path sourceRoot = projectRootPath(uri, project);

        TrieNode<ResolvedEntry> snapshot = root.get();
        TrieNode<ResolvedEntry> updated = snapshot
                .remove(toSegments(uri.uri()), scheme)
                .insert(toSegments(sourceRoot), scheme, new ResolvedEntry.ProjectEntry(project))
                .insert(toSegments(modulePath(uri, project)), scheme, new ResolvedEntry.ModuleEntry(updatedModule));
        root.set(updated);
    }

    /**
     * Registers a project root in a single atomic swap.
     *
     * @param projectRootUri the project root URI
     * @param scheme the scheme discriminator
     * @param project the project instance
     */
    public void onProjectCreate(@Nonnull DocumentUri projectRootUri, @Nonnull String scheme,
                                @Nonnull Project project) {
        registerProject(projectRootUri, project);
    }

    /**
     * Replaces a project's cached subtree with a fresh project root entry in a single atomic swap.
     *
     * @param projectRootUri the project root URI
     * @param scheme the scheme discriminator
     * @param newProject the refreshed project instance
     */
    public void onProjectUpdate(@Nonnull DocumentUri projectRootUri, @Nonnull String scheme,
                                @Nonnull Project newProject) {
        projectIndex.put(projectRootUri, new ResolvedEntry.ProjectEntry(newProject));
        TrieNode<ResolvedEntry> updated = root.get()
                .removeSubtree(toSegments(projectRootUri.uri()), scheme)
                .insert(toSegments(projectRootUri.uri()), scheme, new ResolvedEntry.ProjectEntry(newProject));
        root.set(updated);
    }

    /**
     * Removes every cached entry under the supplied project root.
     *
     * @param projectRootUri the project root URI
     */
    public void onProjectRemove(@Nonnull DocumentUri projectRootUri) {
        removeProject(projectRootUri);
    }

    /**
     * Updates a config entry and refreshes its project ancestor in a single atomic swap.
     *
     * @param uri the config URI
     * @param scheme the scheme discriminator
     * @param newConfig the new config instance
     */
    public void onConfigUpdate(@Nonnull DocumentUri uri, @Nonnull String scheme, @Nonnull TomlDocument newConfig) {
        Path projectRootPath = pathFromUriPath(uri.uri().getPath()).toAbsolutePath().normalize().getParent();
        Project project = resolveProjectForConfig(newConfig, scheme, projectRootPath)
                .orElseThrow(() -> new IllegalArgumentException("Cannot determine project for config URI: "
                        + uri.uri()));

        TrieNode<ResolvedEntry> updated = root.get()
                .insert(toSegments(project.sourceRoot()), scheme, new ResolvedEntry.ProjectEntry(project))
                .insert(toSegments(uri.uri()), scheme, new ResolvedEntry.ConfigEntry(newConfig, project));
        root.set(updated);
    }

    /**
     * Removes a config entry and refreshes its project ancestor in a single atomic swap.
     *
     * @param uri the config URI
     * @param scheme the scheme discriminator
     * @param updatedProject the refreshed project instance
     */
    public void onConfigRemove(@Nonnull DocumentUri uri, @Nonnull String scheme, @Nonnull Project updatedProject) {
        TrieNode<ResolvedEntry> updated = root.get()
                .remove(toSegments(uri.uri()), scheme)
                .insert(toSegments(updatedProject.sourceRoot()), scheme,
                        new ResolvedEntry.ProjectEntry(updatedProject));
        root.set(updated);
    }

    /**
     * Resolves the nearest ancestor entry for the given URI using {@code lookupNearest}.
     *
     * @param uri the document URI
     * @param scheme the scheme discriminator
     * @return the nearest ancestor entry, or empty if none found
     */
    private Optional<ResolvedEntry> resolveNearest(DocumentUri uri, String scheme) {
        return root.get().lookupNearest(toSegments(uri.uri()), scheme);
    }

    /**
     * Derives a document from a project using the URI's file path.
     *
     * @param uri the document URI
     * @param project the project to derive the document from
     * @return the derived document, or empty if the path does not belong to the project
     */
    private Optional<Document> deriveDocument(DocumentUri uri, Project project) {
        try {
            Path filePath = pathFromUriPath(uri.uri().getPath());
            DocumentId docId = project.documentId(filePath);
            Module module = project.currentPackage().module(docId.moduleId());
            return Optional.of(module.document(docId));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private Optional<Document> latestDocumentFromIndex(DocumentUri uri, Document fallback) {
        return latestProjectFromIndex(uri, fallback.module().project())
                .flatMap(project -> deriveDocument(uri, project));
    }

    /**
     * Derives a module from a project using the URI's file path.
     *
     * @param uri the document URI
     * @param project the project to derive the module from
     * @return the derived module, or empty if the path does not belong to the project
     */
    private Optional<Module> deriveModule(DocumentUri uri, Project project) {
        try {
            Path filePath = pathFromUriPath(uri.uri().getPath());
            DocumentId docId = project.documentId(filePath);
            return Optional.of(project.currentPackage().module(docId.moduleId()));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private Optional<Module> latestModuleFromIndex(DocumentUri uri, Module fallback) {
        return latestProjectFromIndex(uri, fallback.project())
                .flatMap(project -> deriveModule(uri, project));
    }

    private Optional<Project> latestProjectFromIndex(DocumentUri uri, Project fallback) {
        DocumentUri rootUri = sourceRootLike(uri, projectRootPath(uri, fallback));
        return getProject(rootUri);
    }

    private Optional<Project> resolveProjectForConfig(TomlDocument config, String scheme, Path projectRootPath) {
        Optional<Project> reflected = projectFromConfigViaReflection(config);
        if (reflected.isPresent()) {
            return reflected;
        }
        if (projectRootPath == null) {
            return Optional.empty();
        }
        return root.get().lookup(toSegments(projectRootPath), scheme)
                .filter(ResolvedEntry.ProjectEntry.class::isInstance)
                .map(ResolvedEntry.ProjectEntry.class::cast)
                .map(ResolvedEntry.ProjectEntry::project);
    }

    private Optional<Project> projectFromConfigViaReflection(TomlDocument config) {
        try {
            Method packageInstanceMethod = config.getClass().getMethod("packageInstance");
            Object packageInstance = packageInstanceMethod.invoke(config);
            Method projectMethod = packageInstance.getClass().getMethod("project");
            return Optional.of((Project) projectMethod.invoke(packageInstance));
        } catch (ReflectiveOperationException | ClassCastException ignored) {
            return Optional.empty();
        }
    }

    private static Path modulePath(DocumentUri documentUri, Project project) {
        Path sourceRoot = projectRootPath(documentUri, project);
        Path documentPath = pathFromUriPath(documentUri.uri().getPath()).toAbsolutePath().normalize();
        if (sourceRoot.equals(documentPath)) {
            return sourceRoot;
        }

        Path relativePath = sourceRoot.relativize(documentPath);
        if (relativePath.getNameCount() >= 3
                && ProjectConstants.MODULES_ROOT.equals(relativePath.getName(0).toString())) {
            return sourceRoot.resolve(relativePath.getName(0).toString())
                    .resolve(relativePath.getName(1).toString());
        }
        return sourceRoot;
    }

    private static Path projectRootPath(DocumentUri documentUri, Project project) {
        if (project.kind() == io.ballerina.projects.ProjectKind.SINGLE_FILE_PROJECT) {
            return pathFromUriPath(documentUri.uri().getPath()).toAbsolutePath().normalize();
        }
        return project.sourceRoot().toAbsolutePath().normalize();
    }

    private static DocumentUri sourceRootLike(DocumentUri template, Path sourceRoot) {
        Path normalized = sourceRoot.toAbsolutePath().normalize();
        return switch (template) {
            case DocumentUri.FileUri ignored -> new DocumentUri.FileUri(normalized.toUri());
            case DocumentUri.ExprUri ignored ->
                    new DocumentUri.ExprUri(URI.create("expr://" + normalized.toUri().getPath()));
            case DocumentUri.AiUri ignored ->
                    new DocumentUri.AiUri(URI.create("ai://" + normalized.toUri().getPath()));
        };
    }

    /**
     * Extracts the normalized path string from a URI, stripping any trailing slash that
     * {@link java.nio.file.Path#toUri()} appends for directory paths.
     *
     * <p>Use this instead of {@link URI#toString()} or {@link URI#getPath()} when the result
     * will be compared against {@link Path#toString()} values (e.g., as index keys).
     *
     * @param uri the URI whose path component should be normalized
     * @return the path string with no trailing slash, as produced by {@link Path#toString()}
     */
    public static @Nonnull String pathOf(@Nonnull URI uri) {
        return pathFromUriPath(uri.getPath()).toString();
    }

    /**
     * Decomposes a URI's path into trie segments using {@link Path} for segment splitting.
     */
    private static String[] toSegments(URI uri) {
        return toSegments(pathFromUriPath(uri.getPath()));
    }

    /**
     * Converts a URI path component (always {@code /}-separated, per RFC 3986) into a native
     * {@link Path}, regardless of the URI's scheme.
     *
     * <p>On Windows, {@code URI.getPath()} for a {@code file:} URI such as
     * {@code file:///D:/workspace} yields {@code /D:/workspace} — a leading slash before the
     * drive letter that {@link Path#of(String, String...)} cannot parse. The {@code expr:} and
     * {@code ai:} schemes mirror the same encoding (see {@code sourceRootLike}), so the leading
     * slash is stripped whenever it precedes a drive letter, for every scheme.
     *
     * @param rawUriPath the decoded path component of a {@link DocumentUri}
     * @return the corresponding native path
     */
    private static Path pathFromUriPath(String rawUriPath) {
        if (isWindowsDriveRoot(rawUriPath)) {
            return Path.of(rawUriPath.substring(1));
        }
        return Path.of(rawUriPath);
    }

    private static boolean isWindowsDriveRoot(String uriPath) {
        return uriPath.length() >= 4
                && uriPath.charAt(0) == '/'
                && Character.isLetter(uriPath.charAt(1))
                && uriPath.charAt(2) == ':'
                && uriPath.charAt(3) == '/';
    }

    /**
     * Decomposes an absolute {@link Path} into trie segments.
     */
    private static String[] toSegments(Path path) {
        int count = path.getNameCount();
        String[] segments = new String[count];
        for (int i = 0; i < count; i++) {
            segments[i] = path.getName(i).toString();
        }
        return segments;
    }

    private void onProjectIndexRemoval(RemovalNotification<DocumentUri, ResolvedEntry> notification) {
        DocumentUri rootUri = notification.getKey();
        if (rootUri == null) {
            return;
        }
        evictSubtree(rootUri);
        if (notification.getCause() == RemovalCause.SIZE) {
            onEviction.accept(rootUri);
        }
    }
}
