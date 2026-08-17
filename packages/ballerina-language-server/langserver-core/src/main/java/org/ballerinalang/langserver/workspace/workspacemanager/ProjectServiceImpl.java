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
import io.ballerina.projects.DocumentConfig;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import io.ballerina.projects.util.ProjectConstants;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.workspace.eventbus.EventKind;
import org.ballerinalang.langserver.workspace.eventbus.EventSyncPubSubHolder;
import org.ballerinalang.langserver.workspace.eventbus.ProjectEvictedEvent;
import org.ballerinalang.langserver.workspace.eventbus.ProjectKindTransitionedEvent;
import org.ballerinalang.langserver.workspace.eventbus.SubscriberTier;
import org.ballerinalang.langserver.workspace.eventbus.event.BatchEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.CompilerEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.DomainEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.HeapPressureEvent;
import org.ballerinalang.langserver.workspace.eventbus.event.ProjectEvent;
import org.ballerinalang.langserver.workspace.resourcemonitor.HeapPressureLevel;
import org.ballerinalang.langserver.workspace.workspacemanager.change.BufferedChange;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeApplier;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeBuffer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ChangeLayer;
import org.ballerinalang.langserver.workspace.workspacemanager.change.ContentVersion;
import org.ballerinalang.langserver.workspace.workspacemanager.project.EvictionReason;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectHealthState;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectKind;
import org.ballerinalang.langserver.workspace.workspacemanager.project.ProjectTier;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.FileChangeType;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.TextDocumentContentChangeEvent;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import javax.annotation.Nonnull;

/**
 * Service layer implementation managing workspace projects.
 *
 * <p>Implements {@link ProjectService} and coordinates:
 * <ul>
 *   <li>Compiler project caching via {@link UriResolver}</li>
 *   <li>Workspace-only lifecycle metadata via internal state maps</li>
 *   <li>URI resolution via the lock-free trie cache in {@link UriResolver}</li>
 *   <li>Heap pressure monitoring via {@link HeapPressureLevel} event subscriptions</li>
 *   <li>Domain event publishing and subscription via {@link EventSyncPubSubHolder}</li>
 * </ul>
 * </p>
 *
 * @since 1.7.0
 */
public final class ProjectServiceImpl implements ProjectService {
    private static final java.io.PrintStream ERROR_STREAM = System.err;
    private static final int DEFAULT_MAX_PROJECTS = 128;
    private static final String BALLERINA_TOML = ProjectConstants.BALLERINA_TOML;
    private static final String DEPENDENCIES_TOML = ProjectConstants.DEPENDENCIES_TOML;
    private static final Set<String> BUFFERED_TOML_FILES = Set.of(
            BALLERINA_TOML,
            DEPENDENCIES_TOML,
            ProjectConstants.CLOUD_TOML,
            ProjectConstants.COMPILER_PLUGIN_TOML,
            ProjectConstants.BAL_TOOL_TOML);
    private final UriResolver uriResolver;
    private final EventSyncPubSubHolder eventBus;
    private final ProjectLoader loader;
    private final ChangeBuffer changeBuffer;
    private final ChangeApplier changeApplier;
    private final ConcurrentHashMap<DocumentUri,
            org.ballerinalang.langserver.workspace.workspacemanager.project.Project> workspaceProjects;
    /** Per-URI monotonically increasing version counter for EDITOR-layer buffered changes. */
    private final ConcurrentHashMap<DocumentUri, AtomicInteger> versionCounters;
    private final ConcurrentHashMap<Path, AtomicInteger> dependenciesSelfWriteTokens;
    private final ConcurrentHashMap<DocumentUri, Set<EventKind>> observedCompilerSignals;
    private final ConcurrentHashMap<Path, DocumentUri> rootCache;
    private final Set<DocumentUri> deletedSingleFileRoots;

    /**
     * Constructs a project service with full wiring of dependencies.
     *
     * @param eventBus event bus; must not be null
     * @param loader Ballerina project loader; must not be null
     * @param changeBuffer per-URI, per-layer change buffer; must not be null
     * @throws NullPointerException if any argument is null
     */
    public ProjectServiceImpl(@Nonnull EventSyncPubSubHolder eventBus, @Nonnull ProjectLoader loader,
                              @Nonnull ChangeBuffer changeBuffer) {
        this.eventBus = eventBus;
        this.loader = loader;
        this.changeBuffer = changeBuffer;
        this.workspaceProjects = new ConcurrentHashMap<>();
        this.versionCounters = new ConcurrentHashMap<>();
        this.dependenciesSelfWriteTokens = new ConcurrentHashMap<>();
        this.observedCompilerSignals = new ConcurrentHashMap<>();
        this.rootCache = new ConcurrentHashMap<>();
        this.deletedSingleFileRoots = ConcurrentHashMap.newKeySet();
        this.uriResolver = new UriResolver(DEFAULT_MAX_PROJECTS, this::onImplicitProjectEviction);
        this.changeApplier = new ChangeApplier(changeBuffer, this.uriResolver);
        subscribeToEvents();
    }

    /**
     * Constructs a project service with an injectable change applier.
     *
     * @param eventBus event bus
     * @param loader project loader
     * @param changeBuffer change buffer
     * @param changeApplier change applier
     */
    public ProjectServiceImpl(@Nonnull EventSyncPubSubHolder eventBus, @Nonnull ProjectLoader loader,
                              @Nonnull ChangeBuffer changeBuffer, @Nonnull ChangeApplier changeApplier) {
        this.eventBus = eventBus;
        this.loader = loader;
        this.changeBuffer = changeBuffer;
        this.workspaceProjects = new ConcurrentHashMap<>();
        this.versionCounters = new ConcurrentHashMap<>();
        this.dependenciesSelfWriteTokens = new ConcurrentHashMap<>();
        this.observedCompilerSignals = new ConcurrentHashMap<>();
        this.rootCache = new ConcurrentHashMap<>();
        this.deletedSingleFileRoots = ConcurrentHashMap.newKeySet();
        this.uriResolver = new UriResolver(DEFAULT_MAX_PROJECTS, this::onImplicitProjectEviction);
        this.changeApplier = changeApplier;
        subscribeToEvents();
    }

    // =========================================================================
    // ProjectService Interface Implementation
    // =========================================================================

    @Override
    public Project loadOrCreate(@Nonnull Path path, CancelChecker cancelChecker) {
        processClosedWatcherEvents();
        Path normalized = path.toAbsolutePath().normalize();
        DocumentUri docUri = toFileUri(normalized);
        deletedSingleFileRoots.remove(docUri);
        Optional<Project> cachedProject = uriResolver.project(docUri);
        if (cachedProject.isPresent()) {
            Project project = cachedProject.get();
            if (hasResolvableSourceDocument(normalized, project)) {
                return project;
            }
            return refreshProject(normalized)
                    .orElseThrow(() -> new RuntimeException("Failed to resolve document for " + normalized));
        }

        DocumentUri root = resolveSourceRoot(normalized);
        Optional<Project> cached = uriResolver.getProject(root);
        if (cached.isPresent()) {
            return cached.get();
        }

        org.ballerinalang.langserver.workspace.workspacemanager.project.Project wmProject =
                workspaceProjects.computeIfAbsent(root,
                        ignored -> new org.ballerinalang.langserver.workspace.workspacemanager.project.Project(
                                root, detectKind(root)));
        try {
            Project loaded = loader.load(toFileUri(normalized), wmProject.kind());
            ensureResolvableSourceDocument(normalized, loaded);
            Project target = registerLoadedProject(root, loaded);
            publishWm(EventKind.WORKSPACE_PROJECT_REGISTERED, root);
            return target;
        } catch (ProjectException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("Failed to load project for " + root + ": " + e.getMessage(), e);
        }
    }

    @Override
    public Project loadOrCreate(@Nonnull DocumentUri uri, CancelChecker cancelChecker) {
        return switch (uri) {
            case DocumentUri.FileUri ignored -> loadOrCreate(pathOf(uri), cancelChecker);
            case DocumentUri.ExprUri ignored -> loadOrCreateOverlay(uri, cancelChecker);
            case DocumentUri.AiUri ignored -> loadOrCreateOverlay(uri, cancelChecker);
        };
    }

    @Override
    public @Nonnull Optional<Project> project(@Nonnull Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        DocumentUri docUri = toFileUri(normalized);
        if (deletedSingleFileRoots.contains(docUri)) {
            return Optional.empty();
        }
        Optional<Project> cachedProject = uriResolver.project(docUri);
        if (cachedProject.isPresent()) {
            return cachedProject;
        }
        try {
            return uriResolver.getProject(resolveSourceRoot(normalized));
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    @Override
    public @Nonnull Optional<Project> project(@Nonnull DocumentUri uri) {
        Optional<Project> cachedProject = uriResolver.project(uri);
        if (cachedProject.isPresent()) {
            return cachedProject;
        }
        if (uri instanceof DocumentUri.FileUri) {
            return project(pathOf(uri));
        }
        return Optional.empty();
    }

    /**
     * Resolves a source-root identifier through the project service and loads the project.
     *
     * @param sourceRootIdentifier URI or path-like source root identifier
     * @param cancelChecker cancel checker
     * @return loaded project
     */
    public Project loadOrCreateFromIdentifier(@Nonnull String sourceRootIdentifier, CancelChecker cancelChecker) {
        return loadOrCreate(resolvePathFromIdentifier(sourceRootIdentifier), cancelChecker);
    }

    /**
     * Resolves a source-root identifier through the project service.
     *
     * @param sourceRootIdentifier URI or path-like source root identifier
     * @return normalized source root path
     */
    public Path resolvePathFromIdentifier(@Nonnull String sourceRootIdentifier) {
        return parsePath(sourceRootIdentifier).toAbsolutePath().normalize();
    }

    @Override
    public Collection<Project> allProjects() {
        return uriResolver.allProjects();
    }

    @Override
    public io.ballerina.projects.Module module(@Nonnull Path path, CancelChecker cancelChecker) {
        Project project = loadOrCreate(path, cancelChecker);
        try {
            if (path.toAbsolutePath().normalize().equals(project.sourceRoot().toAbsolutePath().normalize())) {
                return project.currentPackage().getDefaultModule();
            }
            io.ballerina.projects.DocumentId documentId = project.documentId(path);
            return project.currentPackage().module(documentId.moduleId());
        } catch (Exception e) {
            throw new RuntimeException("Failed to resolve module for path: " + path, e);
        }
    }

    @Override
    public io.ballerina.projects.Module module(@Nonnull DocumentUri uri, CancelChecker cancelChecker) {
        Project project = loadOrCreate(uri, cancelChecker);
        try {
            Path path = pathOf(uri);
            if (path.equals(project.sourceRoot().toAbsolutePath().normalize())) {
                return project.currentPackage().getDefaultModule();
            }
            io.ballerina.projects.DocumentId documentId = project.documentId(path);
            return project.currentPackage().module(documentId.moduleId());
        } catch (Exception e) {
            throw new RuntimeException("Failed to resolve module for URI: " + uri.uri(), e);
        }
    }

    @Override
    public @Nonnull Optional<Document> document(@Nonnull DocumentUri uri, CancelChecker cancelChecker) {
        try {
            Project project = loadOrCreate(uri, cancelChecker);
            DocumentId docId = project.documentId(pathOf(uri));
            return Optional.of(project.currentPackage().module(docId.moduleId()).document(docId));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    @Override
    public LockingMode getLockingMode(@Nonnull Project project) {
        return LockingMode.valueOf(project.buildOptions().lockingMode().name());
    }

    @Override
    public void registerWorkspace(@Nonnull List<Path> workspaceFolders) {
        if (workspaceFolders.isEmpty()) {
            return; // No-op for empty list
        }
        boolean registeredAny = false;

        for (Path folder : workspaceFolders) {
            Path normalized = folder.toAbsolutePath().normalize();
            DocumentUri root = resolveSourceRoot(normalized);
            if (uriResolver.getProject(root).isPresent()) {
                continue;
            }
            try {
                org.ballerinalang.langserver.workspace.workspacemanager.project.Project wmProject =
                        workspaceProjects.computeIfAbsent(root,
                                ignored -> new org.ballerinalang.langserver.workspace.workspacemanager.project.Project(
                                        root, detectKind(root)));
                registerLoadedProject(root, loader.load(root, wmProject.kind()));
                registeredAny = true;
            } catch (Exception e) {
                ERROR_STREAM.println("Warning: Failed to register workspace project at " + root + ": " + e);
            }
        }
        if (registeredAny) {
            eventBus.publish(new BatchEvent());
        }
    }

    // =========================================================================
    // Event Subscription Handlers
    // =========================================================================

    private void onCompilationFailed(DomainEvent event) {
        if (!(event instanceof CompilerEvent ce)) {
            return;
        }
        DocumentUri root = new DocumentUri.FileUri(ce.sourceRoot());
        workspaceProjects.computeIfPresent(root, (key, project) -> {
            try {
                project.transitionTo(ProjectHealthState.COMPILATION_CRASHED);
                publishWm(EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED, project.sourceRoot());
            } catch (IllegalStateException stateError) {
                // Already in that state or invalid arc — skip (ADR-033)
            }
            return project;
        });
    }

    private void onDiagnosticsReady(DomainEvent event) {
        if (!(event instanceof CompilerEvent ce)) {
            return;
        }
        DocumentUri root = new DocumentUri.FileUri(ce.sourceRoot());
        recordCompilerSignal(root, event.eventKind());
        workspaceProjects.computeIfPresent(root, (key, project) -> {
            if (project.healthState() == ProjectHealthState.RECOVERING) {
                try {
                    project.transitionTo(ProjectHealthState.HEALTHY);
                    publishWm(EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED, project.sourceRoot());
                } catch (IllegalStateException stateError) {
                    // Invalid state transition — skip (ADR-033)
                }
            }
            return project;
        });
    }

    private void onResolutionDiagnosticsReady(DomainEvent event) {
        if (!(event instanceof CompilerEvent ce)) {
            return;
        }
        recordCompilerSignal(new DocumentUri.FileUri(ce.sourceRoot()), event.eventKind());
    }

    private void onResolutionRecovered(DomainEvent event) {
        if (!(event instanceof CompilerEvent ce)) {
            return;
        }
        DocumentUri root = new DocumentUri.FileUri(ce.sourceRoot());
        recordCompilerSignal(root, event.eventKind());
        workspaceProject(root).ifPresent(project -> transitionProject(project, ProjectHealthState.RECOVERING));
    }

    private void onResolutionExhausted(DomainEvent event) {
        if (!(event instanceof CompilerEvent ce)) {
            return;
        }
        DocumentUri root = new DocumentUri.FileUri(ce.sourceRoot());
        recordCompilerSignal(root, event.eventKind());
        workspaceProject(root).ifPresent(project -> transitionProject(project, ProjectHealthState.CIRCUIT_OPEN));
    }

    private void onHeapPressureDetected(DomainEvent event) {
        if (!(event instanceof HeapPressureEvent hpe)) {
            return;
        }
        switch (hpe.pressureLevel()) {
            case WARNING -> workspaceProjects.forEach((root, project) -> {
                if (project.openDocumentCount().tier() == ProjectTier.BACKGROUND
                        && uriResolver.getProject(root).isPresent()) {
                    evictProject(root, EvictionReason.HEAP_PRESSURE);
                }
            });
            case CRITICAL, EMERGENCY -> workspaceProjects.forEach((root, project) -> {
                if (project.openDocumentCount().tier() == ProjectTier.BACKGROUND
                        && uriResolver.getProject(root).isPresent()) {
                    evictProject(root, EvictionReason.HEAP_PRESSURE);
                }
            });
            case NORMAL -> { }
        }
    }

    public boolean hasObservedCompilerSignal(@Nonnull DocumentUri root, @Nonnull EventKind signal) {
        return observedCompilerSignals.getOrDefault(root, Collections.emptySet()).contains(signal);
    }

    // =========================================================================
    // Service Methods (not in interface but used by tests/clients)
    // =========================================================================

    /**
     * Transitions a project's kind and publishes the kind-transition event.
     *
     * @param root the project source root URI; must not be null
     * @param target the target project kind; must not be null
     * @throws IllegalStateException if the kind transition is invalid
     */
    public void transitionKind(@Nonnull DocumentUri root, @Nonnull ProjectKind target) {
        workspaceProject(root).ifPresent(project -> {
            project.transitionKind(target);
            eventBus.publish(new ProjectKindTransitionedEvent(root.uri(), target));
        });
    }

    /**
     * Evicts the cached project for the given file path, forcing a fresh reload from
     * disk on the next loadOrCreate call.
     *
     * @param filePath a file path within the project to evict
     */
    public void evictProject(Path filePath) {
        Path normalized = filePath.toAbsolutePath().normalize();
        try {
            evictProject(resolveSourceRoot(normalized), EvictionReason.DOCUMENT_CLOSED);
        } catch (RuntimeException ignored) {
            // Path not resolvable — no-op.
        }
    }

    /**
     * Removes a document from the cached project when its file is deleted.
     * After removal, syntaxTree() fallback will find no document and return empty.
     *
     * @param filePath absolute path of the deleted file
     */
    public void removeDocumentFromProject(Path filePath) {
        Path normalized = filePath.toAbsolutePath().normalize();
        try {
            DocumentUri docUri = toFileUri(normalized);
            Optional<Project> cached = uriResolver.project(docUri);
            if (cached.isEmpty()) {
                return;
            }
            Project project = cached.get();
            DocumentId docId = project.documentId(normalized);
            Document document = project.currentPackage().module(docId.moduleId()).document(docId);
            Project updated = document.module().modify().removeDocument(docId).apply().project();
            uriResolver.registerProject(resolveSourceRoot(normalized), updated);
        } catch (RuntimeException ignored) {
            // Document may not be in project or project not loaded — skip.
        }
    }

    /**
     * Applies in-memory content to a document in the cached project.
     * Called by WiringConfiguration when DS-E2 fires, so the synchronous
     * syntaxTree() fallback returns the latest editor content.
     *
     * @param filePath absolute, normalized path of the changed file
     * @param content  the current content to apply
     */
    public void applyDocumentContent(Path filePath, String content) {
        Path normalized = filePath.toAbsolutePath().normalize();
        DocumentUri uri = toFileUri(normalized);
        if (applyDocumentContent(uri, content)) {
            return;
        }
        try {
            // loadOrCreate is idempotent: returns cached project if already loaded.
            Project project = loadOrCreate(normalized, null);
            DocumentId docId = project.documentId(normalized);
            Module module = project.currentPackage().module(docId.moduleId());
            Document document = module.document(docId);
            // Ballerina project API is immutable: apply() returns a new Document in a new Project.
            Document updated = document.modify().withContent(content).apply();
            uriResolver.registerProject(resolveSourceRoot(normalized), updated.module().project());
        } catch (RuntimeException ignored) {
            // File not yet in project or project not supporting this op — skip.
        }
    }

    private boolean documentContentEquals(DocumentUri uri, String content) {
        try {
            return uriResolver.document(uri)
                    .map(document -> document.textDocument().toString().equals(content))
                    .orElse(false);
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean applyDocumentContent(DocumentUri uri, String content) {
        if (!isBallerinaSource(pathOf(uri))) {
            return false;
        }
        try {
            Optional<Document> document = uriResolver.document(uri);
            if (document.isEmpty()) {
                return createDocumentContent(uri, content);
            }
            Document updated = document.get().modify().withContent(content).apply();
            uriResolver.onDocumentUpdate(uri, uri.uri().getScheme(), updated);
            refreshWorkspaceGraphAfterDocumentUpdate(uri, updated.module().project())
                    .forEach(root -> publishWm(EventKind.WORKSPACE_PROJECT_UPDATED, root));
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private boolean createDocumentContent(DocumentUri uri, String content) {
        try {
            Optional<DocumentUri> root = resolveProjectRoot(uri);
            if (root.isEmpty()) {
                return false;
            }
            Optional<Project> project = uriResolver.getProject(root.get());
            if (project.isEmpty()) {
                return false;
            }

            Path filePath = pathOf(uri);
            Path sourceRoot = project.get().sourceRoot().toAbsolutePath().normalize();
            Path relativePath = sourceRoot.relativize(filePath);
            Optional<Module> module = moduleForDocument(project.get(), relativePath);
            if (module.isEmpty()) {
                return false;
            }

            String documentName = documentName(relativePath);
            DocumentId documentId = DocumentId.create(filePath.toString(), module.get().moduleId());
            DocumentConfig documentConfig = DocumentConfig.from(documentId, content, documentName);
            Project updatedProject = module.get().modify().addDocument(documentConfig).apply().project();
            Document updated = updatedProject.currentPackage().module(module.get().moduleId()).document(documentId);
            uriResolver.onDocumentCreate(uri, uri.uri().getScheme(), updated);
            refreshWorkspaceGraphAfterDocumentUpdate(uri, updatedProject)
                    .forEach(updatedRoot -> publishWm(EventKind.WORKSPACE_PROJECT_UPDATED, updatedRoot));
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private Optional<Module> moduleForDocument(Project project, Path relativePath) {
        if (relativePath.getNameCount() >= 3
                && ProjectConstants.MODULES_ROOT.equals(relativePath.getName(0).toString())) {
            String moduleName = relativePath.getName(1).toString();
            for (ModuleId moduleId : project.currentPackage().moduleIds()) {
                Module module = project.currentPackage().module(moduleId);
                if (module.moduleName().moduleNamePart().equals(moduleName)) {
                    return Optional.of(module);
                }
            }
            return Optional.empty();
        }
        return Optional.of(project.currentPackage().getDefaultModule());
    }

    private String documentName(Path relativePath) {
        if (relativePath.getNameCount() >= 3
                && ProjectConstants.MODULES_ROOT.equals(relativePath.getName(0).toString())) {
            return relativePath.subpath(2, relativePath.getNameCount()).toString();
        }
        return relativePath.toString();
    }

    // =========================================================================
    // Document Lifecycle Methods (T-044: absorb DocumentService into ProjectService)
    // =========================================================================

    @Override
    public void didOpen(@Nonnull DocumentUri uri, @Nonnull String content) {
        if (!isLifecycleDocumentPath(pathOf(uri))) {
            return;
        }
        ChangeLayer layer = layerOf(uri);
        boolean alreadyOpen = changeBuffer.hasLayer(uri, layer);
        boolean countedOpen = false;
        try {
            loadOrCreate(uri, null);
            if (!alreadyOpen) {
                incrementOpenDocumentCount(uri);
                countedOpen = true;
            }
            changeBuffer.ensureLayer(uri, layer);
            if (documentContentEquals(uri, content)) {
                applyDocumentContent(uri, content);
                return;
            }
            TextDocumentContentChangeEvent fullText = new TextDocumentContentChangeEvent(content);
            int version = versionCounters.computeIfAbsent(uri, k -> new AtomicInteger(0)).incrementAndGet();
            changeBuffer.append(uri, new BufferedChange(fullText, layer, new ContentVersion(version)));
            applyBufferedChanges();
            if (versionCounters.getOrDefault(uri, new AtomicInteger()).get() == version) {
                applyDocumentContent(uri, content);
            }
        } catch (RuntimeException e) {
            if (!alreadyOpen) {
                changeBuffer.clear(uri);
                versionCounters.remove(uri);
                if (countedOpen) {
                    decrementOpenDocumentCount(uri);
                }
            }
            throw e;
        }
    }

    @Override
    public void didChange(@Nonnull DocumentUri uri, @Nonnull List<TextDocumentContentChangeEvent> changes) {
        if (!isLifecycleDocumentPath(pathOf(uri))) {
            return;
        }
        loadOrCreate(uri, null);
        ChangeLayer layer = layerOf(uri);
        AtomicInteger counter = versionCounters.computeIfAbsent(uri, k -> new AtomicInteger(0));
        for (TextDocumentContentChangeEvent change : changes) {
            int version = counter.incrementAndGet();
            changeBuffer.append(uri, new BufferedChange(change, layer, new ContentVersion(version)));
        }
        applyBufferedChanges();
        if (!changes.isEmpty()) {
            applyDocumentContent(uri, changes.get(changes.size() - 1).getText());
        }
    }

    @Override
    public void didClose(@Nonnull DocumentUri uri) {
        Optional<DocumentUri> overlayRoot = uri instanceof DocumentUri.FileUri ? Optional.empty()
                : resolveProjectRoot(uri);
        // Mirror didOpen's alreadyOpen guard: only adjust the shared open-document
        // count when this URI actually had a tracked overlay layer before clearing.
        // A duplicate or out-of-order didClose must not drive the count below the
        // number of genuinely open documents in the project.
        boolean wasOpen = changeBuffer.hasLayer(uri, layerOf(uri));
        changeBuffer.clear(uri);
        versionCounters.remove(uri);
        if (wasOpen) {
            decrementOpenDocumentCount(uri);
        }
        overlayRoot.ifPresent(this::removeCachedProject);
    }

    @Override
    public void didChangeWatchedFiles(@Nonnull List<FileEvent> events) {
        for (FileEvent event : events) {
            try {
                URI uri = URI.create(event.getUri());
                DocumentUri docUri = new DocumentUri.FileUri(uri);
                Path filePath = Path.of(uri).toAbsolutePath().normalize();
                if (isBufferedTomlFile(filePath)) {
                    if (isDependenciesToml(filePath) && consumeDependenciesTomlSelfWrite(filePath)) {
                        continue;
                    }
                    appendWatchedTomlChange(docUri, event.getType());
                    transitionProjectKindIfNeeded(filePath, event.getType());
                    refreshProjectForTomlIdentityChange(filePath, event.getType());
                } else {
                    routeSourceWatcherEvent(docUri, filePath, event);
                }
                applyBufferedChanges();
            } catch (RuntimeException ignored) {
                // Malformed or non-file URI — skip this event
            }
        }
    }

    /**
     * Registers a self-write token for {@code Dependencies.toml} watcher suppression.
     *
     * @param dependenciesTomlPath dependencies file path
     */
    public void registerDependenciesTomlSelfWrite(@Nonnull Path dependenciesTomlPath) {
        Path normalized = dependenciesTomlPath.toAbsolutePath().normalize();
        if (!isDependenciesToml(normalized)) {
            return;
        }

        dependenciesSelfWriteTokens.compute(normalized, (path, counter) -> {
            if (counter == null) {
                return new AtomicInteger(1);
            }
            counter.incrementAndGet();
            return counter;
        });
    }

    /**
     * Test-only hook: simulates heap pressure by invoking the eviction callback.
     */
    public void simulateHeapPressure() {
        eventBus.publish(new HeapPressureEvent(HeapPressureLevel.WARNING));
    }

    /**
     * Returns the resolver-backed compiler project cache.
     *
     * @return URI resolver instance
     */
    public @Nonnull UriResolver uriResolver() {
        return uriResolver;
    }

    /**
     * Returns the change applier bound to this service's resolver.
     *
     * @return change applier
     */
    public @Nonnull ChangeApplier changeApplier() {
        return changeApplier;
    }

    /**
     * Returns workspace lifecycle metadata for the given source root.
     *
     * @param root source root URI
     * @return workspace project metadata, if present
     */
    public @Nonnull Optional<org.ballerinalang.langserver.workspace.workspacemanager.project.Project> workspaceProject(
            @Nonnull DocumentUri root) {
        return Optional.ofNullable(workspaceProjects.get(root));
    }

    /**
     * Shuts down the service and releases resources.
     */
    public void shutdown() {
        uriResolver.clear();
        workspaceProjects.clear();
        versionCounters.clear();
        dependenciesSelfWriteTokens.clear();
        observedCompilerSignals.clear();
        rootCache.clear();
        deletedSingleFileRoots.clear();
    }

    // =========================================================================
    // Private Helpers
    // =========================================================================

    private Project loadOrCreateOverlay(DocumentUri uri, CancelChecker cancelChecker) {
        processClosedWatcherEvents();
        Path path = pathOf(uri);
        Project baseProject = loadOrCreate(path, cancelChecker);
        DocumentUri overlayRoot = sourceRootLike(uri, baseProject.sourceRoot());
        Optional<Project> cached = uriResolver.getProject(overlayRoot);
        if (cached.isPresent()) {
            return cached.get();
        }

        Project duplicated = duplicateForOverlay(baseProject);
        Project target = registerWorkspacePackages(overlayRoot, duplicated, false, overlayRoot);
        ensureWorkspaceMetadata(overlayRoot, target);
        uriResolver.registerProject(overlayRoot, target);
        publishWm(EventKind.WORKSPACE_PROJECT_REGISTERED, overlayRoot);
        return target;
    }

    private Project duplicateForOverlay(Project baseProject) {
        try {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            Optional<Project> workspaceProject = compilerApi.isWorkspaceProject(baseProject)
                    ? Optional.of(baseProject)
                    : compilerApi.getWorkspaceProject(baseProject);
            if (workspaceProject.isPresent()) {
                return workspaceProject.get().duplicate();
            }
        } catch (RuntimeException ignored) {
            // Fall back to duplicating the package project directly.
        }
        return baseProject.duplicate();
    }

    private Project registerLoadedProject(DocumentUri requestedRoot, Project loaded) {
        Project target = registerWorkspacePackages(requestedRoot, loaded, false);
        ensureWorkspaceMetadata(requestedRoot, target);
        uriResolver.registerProject(requestedRoot, target);
        return target;
    }

    private Project refreshLoadedProject(DocumentUri requestedRoot, Project loaded) {
        Project target = registerWorkspacePackages(requestedRoot, loaded, true);
        ensureWorkspaceMetadata(requestedRoot, target);
        uriResolver.onProjectUpdate(requestedRoot, requestedRoot.uri().getScheme(), target);
        return target;
    }

    private Project registerWorkspacePackages(DocumentUri requestedRoot, Project loaded, boolean refreshExisting) {
        return registerWorkspacePackages(requestedRoot, loaded, refreshExisting, requestedRoot);
    }

    private Project registerWorkspacePackages(DocumentUri requestedRoot, Project loaded, boolean refreshExisting,
                                              DocumentUri rootTemplate) {
        Project target = loaded;
        for (Project workspacePackage : workspacePackages(loaded)) {
            Optional<DocumentUri> packageRoot = sourceRootUri(workspacePackage, rootTemplate);
            if (packageRoot.isEmpty()) {
                continue;
            }
            DocumentUri root = packageRoot.get();
            ensureWorkspaceMetadata(root, workspacePackage);
            if (root.equals(requestedRoot)) {
                target = workspacePackage;
            }
            if (refreshExisting) {
                uriResolver.onProjectUpdate(root, root.uri().getScheme(), workspacePackage);
            } else {
                uriResolver.registerProject(root, workspacePackage);
            }
        }
        return target;
    }

    private Set<DocumentUri> refreshWorkspaceGraphAfterDocumentUpdate(DocumentUri template, Project updatedProject) {
        Set<DocumentUri> refreshedRoots = new HashSet<>();
        Optional<DocumentUri> updatedRoot = sourceRootUri(updatedProject, template);
        for (Project workspacePackage : workspacePackages(updatedProject)) {
            Optional<DocumentUri> packageRoot = sourceRootUri(workspacePackage, template);
            if (packageRoot.isEmpty() || packageRoot.equals(updatedRoot)) {
                continue;
            }
            DocumentUri root = packageRoot.get();
            ensureWorkspaceMetadata(root, workspacePackage);
            uriResolver.onProjectUpdate(root, root.uri().getScheme(), workspacePackage);
            refreshedRoots.add(root);
        }
        return refreshedRoots;
    }

    private List<Project> workspacePackages(Project project) {
        try {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            Optional<Project> workspaceProject = compilerApi.isWorkspaceProject(project)
                    ? Optional.of(project)
                    : compilerApi.getWorkspaceProject(project);
            if (workspaceProject.isEmpty()) {
                return List.of();
            }
            return compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get());
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    private Optional<DocumentUri> sourceRootUri(Project project, DocumentUri template) {
        try {
            Path sourceRoot = project.sourceRoot();
            if (sourceRoot == null) {
                return Optional.empty();
            }
            if (template == null) {
                return Optional.of(new DocumentUri.FileUri(sourceRoot.toAbsolutePath().normalize().toUri()));
            }
            return Optional.of(sourceRootLike(template, sourceRoot));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    private void ensureWorkspaceMetadata(DocumentUri root, Project project) {
        workspaceProjects.computeIfAbsent(root,
                ignored -> new org.ballerinalang.langserver.workspace.workspacemanager.project.Project(
                        root, kindOf(project, root)));
    }

    private ProjectKind kindOf(Project project, DocumentUri root) {
        try {
            if (project.kind() == io.ballerina.projects.ProjectKind.SINGLE_FILE_PROJECT) {
                return ProjectKind.SINGLE_FILE;
            }
        } catch (RuntimeException ignored) {
            // Fall back to path-based detection.
        }
        return detectKind(root);
    }

    /**
     * Resolves the source root for a given path.
     * If the path is a file, check the parent directory.
     * Walks up to find Ballerina.toml; if found, uses that directory as root.
     * If not found, uses the path itself (for single-file projects).
     *
     * @param normalized absolute, normalized path
     * @return source root URI
     */
    private DocumentUri resolveSourceRoot(Path normalized) {
        DocumentUri cached = rootCache.get(normalized);
        if (cached != null) {
            return cached;
        }

        // Check if normalized path itself or its parent directory contains Ballerina.toml
        Path currentCheck = normalized;
        if (normalized.toFile().isFile()) {
            currentCheck = normalized.getParent();
        }

        // Walk up to find Ballerina.toml
        Path current = currentCheck;
        while (current != null) {
            if (current.resolve("Ballerina.toml").toFile().exists()) {
                DocumentUri root = new DocumentUri.FileUri(current.toUri());
                rootCache.put(normalized, root);
                return root;
            }
            current = current.getParent();
        }

        // No Ballerina.toml found. For standalone .bal files, use the file path itself
        // as the source root so the projectLoader receives a file path that
        // BallerinaCompilerApi can recognise as a SingleFileProject.
        DocumentUri result;
        if (normalized.toFile().isFile()) {
            result = new DocumentUri.FileUri(normalized.toUri());
        } else {
            result = new DocumentUri.FileUri((currentCheck != null ? currentCheck : normalized).toUri());
        }
        rootCache.put(normalized, result);
        return result;
    }

    /**
     * Detects the project kind based on whether Ballerina.toml exists at the root.
     *
     * @param root the source root URI
     * @return BUILD if Ballerina.toml exists, SINGLE_FILE otherwise
     */
    private ProjectKind detectKind(DocumentUri root) {
        Path rootPath = pathOf(root);
        // A file-as-root means it's a standalone .bal file (single-file project).
        if (rootPath.toFile().isFile()) {
            return ProjectKind.SINGLE_FILE;
        }
        if (rootPath.resolve("Ballerina.toml").toFile().exists()) {
            return ProjectKind.BUILD;
        }
        return ProjectKind.SINGLE_FILE;
    }

    /**
     * Parses a path string safely.
     *
     * @param pathStr the path string
     * @return parsed path
     */
    private Path parsePath(String pathStr) {
        try {
            java.net.URI uri = java.net.URI.create(pathStr);
            if (uri.getScheme() != null) {
                return Path.of(uri);
            }
        } catch (Exception ignored) {
            // Fall through to path-based parsing
        }
        try {
            return Path.of(pathStr);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid path: " + pathStr, e);
        }
    }

    private void appendWatchedTomlChange(DocumentUri uri, FileChangeType changeType) {
        AtomicInteger counter = versionCounters.computeIfAbsent(uri, key -> new AtomicInteger(0));
        int version = counter.incrementAndGet();
        TextDocumentContentChangeEvent change = new TextDocumentContentChangeEvent(changeType.name());
        changeBuffer.append(uri, new BufferedChange(change, ChangeLayer.EDITOR, new ContentVersion(version)));
    }

    private void routeSourceWatcherEvent(DocumentUri uri, Path filePath, FileEvent event) {
        boolean open = changeBuffer.isOpen(uri);
        changeBuffer.routeWatcherEvent(uri, event);
        switch (event.getType()) {
            case Created -> refreshProjectForSourceChange(uri, filePath);
            case Deleted -> {
                if (open) {
                    Optional<Project> cachedProject = uriResolver.project(uri);
                    if (cachedProject.isPresent()
                            && cachedProject.get().kind() == io.ballerina.projects.ProjectKind.SINGLE_FILE_PROJECT) {
                        removeSingleFileProject(filePath);
                    } else {
                        if (!applyDocumentContent(uri, "")) {
                            removeDocumentFromProject(filePath);
                        }
                    }
                    changeBuffer.clear(uri);
                    versionCounters.remove(uri);
                    decrementOpenDocumentCount(uri);
                } else {
                    removeOrRefreshProjectForSourceDelete(uri, filePath);
                }
            }
            case Changed -> { }
        }
    }

    private void processClosedWatcherEvents() {
        changeBuffer.drainClosedDocChanges().forEach((uri, event) -> {
            if (changeBuffer.isOpen(uri)) {
                return;
            }
            Path filePath = pathOf(uri);
            switch (event.getType()) {
                case Created, Changed -> refreshProjectForSourceChange(uri, filePath);
                case Deleted -> removeOrRefreshProjectForSourceDelete(uri, filePath);
            }
        });
    }

    private void refreshProjectForTomlIdentityChange(Path filePath, FileChangeType changeType) {
        if (changeType != FileChangeType.Created && changeType != FileChangeType.Deleted) {
            return;
        }

        Path parent = filePath.getParent();
        if (parent == null) {
            return;
        }

        rootCache.clear();
        if (isBallerinaToml(filePath) && changeType == FileChangeType.Deleted) {
            removeProjectsAtOrUnder(parent);
            return;
        }
        if (isBallerinaToml(filePath)) {
            removeProjectsAtOrUnder(parent);
        }
        refreshProject(parent);
    }

    private void refreshProjectForSourceChange(DocumentUri uri, Path filePath) {
        DocumentUri root = uriResolver.project(uri)
                .map(project -> sourceRootLike(uri, project.sourceRoot()))
                .orElseGet(() -> resolveSourceRoot(filePath));
        refreshProject(pathOf(root));
    }

    private void removeOrRefreshProjectForSourceDelete(DocumentUri uri, Path filePath) {
        Optional<Project> cachedProject = uriResolver.project(uri);
        if (cachedProject.isPresent()
                && cachedProject.get().kind() == io.ballerina.projects.ProjectKind.SINGLE_FILE_PROJECT) {
            removeSingleFileProject(filePath);
            return;
        }

        DocumentUri root = cachedProject
                .map(project -> sourceRootLike(uri, project.sourceRoot()))
                .orElseGet(() -> resolveSourceRoot(filePath));
        refreshProject(pathOf(root));
    }

    private Optional<Project> refreshProject(Path loadPath) {
        Path normalized = loadPath.toAbsolutePath().normalize();
        rootCache.clear();
        DocumentUri root = resolveSourceRoot(normalized);
        try {
            ProjectKind kind = detectKind(root);
            Project refreshed = loader.load(toFileUri(normalized), kind);
            workspaceProjects.computeIfAbsent(root,
                    ignored -> new org.ballerinalang.langserver.workspace.workspacemanager.project.Project(root, kind));
            Project target = refreshLoadedProject(root, refreshed);
            publishWm(EventKind.WORKSPACE_PROJECT_UPDATED, root);
            return Optional.of(target);
        } catch (RuntimeException ignored) {
            removeCachedProject(root);
            return Optional.empty();
        }
    }

    private void removeProjectsAtOrUnder(Path rootPath) {
        Path normalizedRoot = rootPath.toAbsolutePath().normalize();
        List<DocumentUri> roots = workspaceProjects.keySet().stream()
                .filter(root -> pathOf(root).startsWith(normalizedRoot))
                .toList();
        roots.forEach(this::removeCachedProject);
    }

    private void removeCachedProject(DocumentUri root) {
        uriResolver.onProjectRemove(root);
        workspaceProjects.remove(root);
        purgeEntriesForRoot(root);
        rootCache.clear();
    }

    private void removeSingleFileProject(Path filePath) {
        DocumentUri root = resolveSourceRoot(filePath);
        deletedSingleFileRoots.add(root);
        removeCachedProject(root);
    }

    private void transitionProjectKindIfNeeded(Path filePath, FileChangeType changeType) {
        if (!isBallerinaToml(filePath)
                || (changeType != FileChangeType.Created && changeType != FileChangeType.Deleted)) {
            return;
        }

        rootCache.clear();
        Path rootPath = filePath.getParent();
        if (rootPath == null) {
            return;
        }

        ProjectKind targetKind = changeType == FileChangeType.Created ? ProjectKind.BUILD : ProjectKind.SINGLE_FILE;
        try {
            transitionKind(new DocumentUri.FileUri(rootPath.toAbsolutePath().normalize().toUri()), targetKind);
        } catch (IllegalStateException ignored) {
            // Ignore duplicate or otherwise invalid transitions from watcher replays.
        }
    }

    private boolean consumeDependenciesTomlSelfWrite(Path dependenciesTomlPath) {
        AtomicInteger counter = dependenciesSelfWriteTokens.get(dependenciesTomlPath);
        if (counter == null) {
            return false;
        }

        while (true) {
            int current = counter.get();
            if (current <= 0) {
                dependenciesSelfWriteTokens.remove(dependenciesTomlPath, counter);
                return false;
            }
            if (!counter.compareAndSet(current, current - 1)) {
                continue;
            }
            if (current == 1) {
                dependenciesSelfWriteTokens.remove(dependenciesTomlPath, counter);
            }
            return true;
        }
    }

    private boolean isBufferedTomlFile(Path path) {
        Path fileName = path.getFileName();
        return fileName != null && BUFFERED_TOML_FILES.contains(fileName.toString());
    }

    private boolean isLifecycleDocumentPath(Path path) {
        return isBallerinaSource(path) || isBufferedTomlFile(path);
    }

    private boolean isBallerinaToml(Path path) {
        Path fileName = path.getFileName();
        return fileName != null && BALLERINA_TOML.equals(fileName.toString());
    }

    private boolean isDependenciesToml(Path path) {
        Path fileName = path.getFileName();
        return fileName != null && DEPENDENCIES_TOML.equals(fileName.toString());
    }

    private void ensureResolvableSourceDocument(Path path, Project project) {
        if (!hasResolvableSourceDocument(path, project)) {
            throw new RuntimeException("Failed to resolve document for " + path);
        }
    }

    private boolean hasResolvableSourceDocument(Path path, Project project) {
        if (!isBallerinaSource(path) || !Files.isRegularFile(path)) {
            return true;
        }
        ensureNoGeneratedSourceDuplicates(path);
        if (!isInspectableProject(project)) {
            return true;
        }
        try {
            DocumentId documentId = project.documentId(path);
            project.currentPackage().module(documentId.moduleId()).document(documentId);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isBallerinaSource(Path path) {
        Path fileName = path.getFileName();
        return fileName != null && fileName.toString().endsWith(".bal");
    }

    private void ensureNoGeneratedSourceDuplicates(Path path) {
        Path rootPath = pathOf(resolveSourceRoot(path));
        Path generatedRoot = rootPath.resolve(ProjectConstants.GENERATED_MODULES_ROOT);
        if (!Files.isDirectory(generatedRoot)) {
            return;
        }
        try (Stream<Path> generatedSources = Files.walk(generatedRoot)) {
            Optional<Path> duplicate = generatedSources
                    .filter(Files::isRegularFile)
                    .filter(this::isBallerinaSource)
                    .filter(generatedSource -> Files.isRegularFile(sourcePathForGenerated(rootPath, generatedRoot,
                            generatedSource)))
                    .findAny();
            if (duplicate.isPresent()) {
                throw new RuntimeException("Duplicate generated source exists in project: " + rootPath);
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to inspect generated sources for " + rootPath, e);
        }
    }

    private Path sourcePathForGenerated(Path rootPath, Path generatedRoot, Path generatedSource) {
        Path relative = generatedRoot.relativize(generatedSource);
        if (relative.getNameCount() == 1) {
            return rootPath.resolve(relative);
        }
        return rootPath.resolve(ProjectConstants.MODULES_ROOT).resolve(relative);
    }

    private boolean isInspectableProject(Project project) {
        try {
            return project.sourceRoot() != null && project.currentPackage() != null && project.kind() != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Publishes a workspace-manager event with a root.
     *
     * @param kind event kind
     * @param root affected source root URI
     */
    private void publishWm(EventKind kind, DocumentUri root) {
        eventBus.publish(new ProjectEvent(kind, root.uri()));
    }

    private void recordCompilerSignal(DocumentUri root, EventKind signal) {
        if (!workspaceProjects.containsKey(root)) {
            return;
        }
        observedCompilerSignals.computeIfAbsent(root, ignored -> ConcurrentHashMap.newKeySet()).add(signal);
    }

    private void transitionProject(org.ballerinalang.langserver.workspace.workspacemanager.project.Project project,
                                   ProjectHealthState target) {
        try {
            if (project.healthState() != target) {
                project.transitionTo(target);
                publishWm(EventKind.WORKSPACE_PROJECT_HEALTH_STATE_CHANGED, project.sourceRoot());
            }
        } catch (IllegalStateException ignored) {
            // Ignore compiler lifecycle signals that do not map to a valid arc for the current state.
        }
    }

    private void incrementOpenDocumentCount(DocumentUri uri) {
        resolveProjectRoot(uri).flatMap(this::workspaceProject).ifPresent(project -> {
            ProjectTier before = project.openDocumentCount().tier();
            project.openDocumentCount().increment();
            ProjectTier after = project.openDocumentCount().tier();
            if (before != after) {
                publishWm(EventKind.WORKSPACE_PROJECT_TIER_CHANGED, project.sourceRoot());
            }
        });
    }

    private void decrementOpenDocumentCount(DocumentUri uri) {
        resolveProjectRoot(uri).flatMap(this::workspaceProject).ifPresent(project -> {
            ProjectTier before = project.openDocumentCount().tier();
            project.openDocumentCount().decrement();
            ProjectTier after = project.openDocumentCount().tier();
            if (project.kind() == ProjectKind.SINGLE_FILE && uri instanceof DocumentUri.FileUri) {
                evictProject(pathOf(uri));
            }
            if (before != after) {
                publishWm(EventKind.WORKSPACE_PROJECT_TIER_CHANGED, project.sourceRoot());
            }
        });
    }

    private void applyBufferedChanges() {
        Set<DocumentUri> affectedRoots = changeApplier.applyAll();
        for (DocumentUri root : affectedRoots) {
            eventBus.publish(new ProjectEvent(EventKind.WORKSPACE_PROJECT_UPDATED, root.uri()));
        }
    }

    private Optional<DocumentUri> resolveProjectRoot(DocumentUri uri) {
        try {
            Optional<Project> project = uriResolver.project(uri);
            if (project.isPresent()) {
                return Optional.of(sourceRootLike(uri, project.get().sourceRoot()));
            }
        } catch (RuntimeException ignored) {
            // Fall back to path-based root resolution below.
        }

        try {
            Path path = pathOf(uri);
            DocumentUri root = resolveSourceRoot(path);
            return Optional.of(sourceRootLike(uri, Path.of(root.uri())));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    private DocumentUri sourceRootLike(DocumentUri uri, Path rootPath) {
        Path normalized = rootPath.toAbsolutePath().normalize();
        return switch (uri) {
            case DocumentUri.FileUri ignored -> new DocumentUri.FileUri(normalized.toUri());
            case DocumentUri.ExprUri ignored ->
                    new DocumentUri.ExprUri(URI.create("expr://" + normalized.toUri().getPath()));
            case DocumentUri.AiUri ignored ->
                    new DocumentUri.AiUri(URI.create("ai://" + normalized.toUri().getPath()));
        };
    }

    private ChangeLayer layerOf(DocumentUri uri) {
        return switch (uri) {
            case DocumentUri.FileUri ignored -> ChangeLayer.EDITOR;
            case DocumentUri.ExprUri ignored -> ChangeLayer.EXPR;
            case DocumentUri.AiUri ignored -> ChangeLayer.AI;
        };
    }

    private Path pathOf(DocumentUri uri) {
        return Path.of(UriResolver.pathOf(uri.uri())).toAbsolutePath().normalize();
    }

    /**
     * Converts a Path to a DocumentUri.FileUri.
     *
     * @param path the file path
     * @return a DocumentUri for the path
     */
    private static DocumentUri toFileUri(Path path) {
        URI uri = path.toUri();
        return new DocumentUri.FileUri(uri);
    }

    /**
     * Removes all secondary map entries associated with the given source root.
     *
     * <p>Cleans up per-document entries ({@code versionCounters}, {@code changeBuffer}) whose
     * URI path falls under the source root, the per-root {@code observedCompilerSignals} entry,
     * and any {@code dependenciesSelfWriteTokens} whose path is within the source root directory.</p>
     *
     * @param root the evicted source root
     */
    private void purgeEntriesForRoot(DocumentUri root) {
        String rootPath = root.uri().getPath();

        // Per-document entries: version counters and change buffer
        versionCounters.keySet().removeIf(uri -> uri.uri().getPath().startsWith(rootPath));
        changeBuffer.clearSubtree(rootPath);

        // Per-root compiler signals
        observedCompilerSignals.remove(root);

        // Dependencies.toml self-write tokens
        Path rootDir = Path.of(root.uri()).toAbsolutePath().normalize();
        dependenciesSelfWriteTokens.keySet().removeIf(path ->
                path.toAbsolutePath().normalize().startsWith(rootDir));
    }

    private void subscribeToEvents() {
        eventBus.subscribe("wm-compilation-failed", SubscriberTier.CRITICAL,
                Set.of(EventKind.COMPILER_COMPILATION_FAILED), this::onCompilationFailed);
        eventBus.subscribe("wm-diagnostics-ready", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5B_COMPILATION_DIAGNOSTICS_READY), this::onDiagnosticsReady);
        eventBus.subscribe("wm-resolution-diagnostics-ready", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_E5A_RESOLUTION_DIAGNOSTICS_READY), this::onResolutionDiagnosticsReady);
        eventBus.subscribe("wm-resolution-recovered", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_RESOLUTION_RECOVERED), this::onResolutionRecovered);
        eventBus.subscribe("wm-resolution-exhausted", SubscriberTier.CRITICAL,
                Set.of(EventKind.CE_RESOLUTION_EXHAUSTED), this::onResolutionExhausted);
        eventBus.subscribe("rm-heap-pressure", SubscriberTier.CRITICAL,
                Set.of(EventKind.RM_E1_HEAP_PRESSURE_DETECTED), this::onHeapPressureDetected);
    }

    private void evictProject(@Nonnull DocumentUri root, @Nonnull EvictionReason reason) {
        if (uriResolver.getProject(root).isEmpty()) {
            return;
        }
        uriResolver.removeProject(root);
        workspaceProjects.remove(root);
        purgeEntriesForRoot(root);
        eventBus.publish(new ProjectEvictedEvent(root.uri(), reason));
    }

    private void onImplicitProjectEviction(@Nonnull DocumentUri root) {
        workspaceProjects.remove(root);
        purgeEntriesForRoot(root);
        eventBus.publish(new ProjectEvictedEvent(root.uri(), EvictionReason.LRU_EVICTION));
    }
}
