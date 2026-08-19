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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import org.ballerinalang.langserver.commons.CompilerCompilationGuard;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.RunContext;
import org.ballerinalang.langserver.commons.workspace.RunResult;
import org.ballerinalang.langserver.commons.workspace.UriScopedWorkspaceManagerProvider;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.workspace.compilerengine.CompilationService;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.execution.WorkspaceRunService;
import org.ballerinalang.langserver.workspace.executionmanager.ExecutionService;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectService;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.DocumentUri;
import org.ballerinalang.langserver.workspace.workspacemanager.uri.UriResolver;
import org.eclipse.lsp4j.DidChangeTextDocumentParams;
import org.eclipse.lsp4j.DidChangeWatchedFilesParams;
import org.eclipse.lsp4j.DidCloseTextDocumentParams;
import org.eclipse.lsp4j.DidOpenTextDocumentParams;
import org.eclipse.lsp4j.FileEvent;
import org.eclipse.lsp4j.jsonrpc.CancelChecker;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

import javax.annotation.Nonnull;

/**
 * Pure facade implementation that delegates all WorkspaceManager methods to bounded context services.
 * No domain logic, no conditionals, max 5 lines per method.
 * All URI schemes are handled directly without proxy routing (ADR-040).
 *
 * @since 1.7.0
 */
public final class WorkspaceManagerFacadeImpl
        implements WorkspaceManager, UriScopedWorkspaceManagerProvider, AutoCloseable {
    private final ProjectService projectService;
    private final CompilationService compilationService;
    private final ExecutionService executionService;
    private final WorkspaceRunService workspaceRunService;
    private final AutoCloseable closeAction;
    private static final Logger LOG = Logger.getLogger(WorkspaceManagerFacadeImpl.class.getName());

    private final AtomicBoolean closed = new AtomicBoolean(false);
    /**
     * Creates a new facade with all required service dependencies.
     *
     * @param projectService project service
     * @param compilationService compilation service
     * @param executionService execution service
     */
    public WorkspaceManagerFacadeImpl(
            ProjectService projectService,
            CompilationService compilationService,
            ExecutionService executionService) {
        this(projectService, compilationService, executionService, () -> { });
    }

    /**
     * Creates a new facade with all required service dependencies and lifecycle cleanup.
     *
     * @param projectService project service
     * @param compilationService compilation service
     * @param executionService execution service
     * @param closeAction close action for the owned workspace wiring; must not be null
     */
    public WorkspaceManagerFacadeImpl(
            @Nonnull ProjectService projectService,
            @Nonnull CompilationService compilationService,
            @Nonnull ExecutionService executionService,
            @Nonnull AutoCloseable closeAction) {
        this.projectService = projectService;
        this.compilationService = compilationService;
        this.executionService = executionService;
        this.workspaceRunService = new WorkspaceRunService(projectService);
        this.closeAction = closeAction;
    }

    /**
     * Closes the owned workspace wiring and releases background resources.
     *
     * @throws Exception if the close action fails
     */
    @Override
    public void close() throws Exception {
        if (closed.compareAndSet(false, true)) {
            closeAction.close();
        }
    }

    /**
     * Returns a workspace manager view that preserves the request document URI for path-based read methods.
     *
     * @param uriString request document URI
     * @return URI-scoped workspace manager view
     */
    @Override
    public WorkspaceManager forDocumentUri(String uriString) {
        return new UriScopedWorkspaceManager(this, toDocumentUri(uriString));
    }

    @Override
    public Optional<String> relativePath(Path path) {
        try {
            Path root = projectService.loadOrCreate(path, null).sourceRoot();
            return Optional.of(root.relativize(path).toString());
        } catch (RuntimeException e) {
            logSwallowed("relativePath", path, e);
            return Optional.empty();
        }
    }

    @Override
    public Optional<String> relativePath(Path path, CancelChecker cancelChecker) {
        try {
            Path root = projectService.loadOrCreate(path, cancelChecker).sourceRoot();
            return Optional.of(root.relativize(path).toString());
        } catch (RuntimeException e) {
            logSwallowed("relativePath", path, e);
            return Optional.empty();
        }
    }

    @Override
    public Path projectRoot(Path path) {
        Project project = projectService.loadOrCreate(path, null);
        return project.sourceRoot();
    }

    @Override
    public Path projectRoot(Path path, CancelChecker cancelChecker) {
        Project project = projectService.loadOrCreate(path, cancelChecker);
        return project.sourceRoot();
    }

    @Override
    public Optional<Project> project(Path filePath) {
        return projectService.project(filePath);
    }

    @Override
    public Project loadProject(Path filePath) throws ProjectException, WorkspaceDocumentException, EventSyncException {
        return projectService.loadOrCreate(filePath, null);
    }

    @Override
    public Optional<Module> module(Path filePath) {
        Module module = projectService.module(filePath, null);
        return Optional.ofNullable(module);
    }

    @Override
    public Optional<Module> module(Path filePath, CancelChecker cancelChecker) {
        Module module = projectService.module(filePath, cancelChecker);
        return Optional.ofNullable(module);
    }

    @Override
    public Optional<Document> document(Path filePath) {
        try {
            Project project = projectService.loadOrCreate(filePath, null);
            DocumentId docId = project.documentId(filePath);
            return Optional.of(project.currentPackage().module(docId.moduleId()).document(docId));
        } catch (RuntimeException e) {
            logSwallowed("document", filePath, e);
            return Optional.empty();
        }
    }

    @Override
    public Optional<Document> document(Path filePath, CancelChecker cancelChecker) {
        try {
            Project project = projectService.loadOrCreate(filePath, cancelChecker);
            DocumentId docId = project.documentId(filePath);
            return Optional.of(project.currentPackage().module(docId.moduleId()).document(docId));
        } catch (RuntimeException e) {
            logSwallowed("document", filePath, e);
            return Optional.empty();
        }
    }

    @Override
    public Optional<SyntaxTree> syntaxTree(Path filePath) {
        try {
            Project project = projectService.loadOrCreate(filePath, null);
            DocumentId docId = project.documentId(filePath);
            return Optional.of(project.currentPackage().module(docId.moduleId()).document(docId).syntaxTree());
        } catch (RuntimeException e) {
            logSwallowed("syntaxTree", filePath, e);
            return Optional.empty();
        }
    }

    @Override
    public Optional<SyntaxTree> syntaxTree(Path filePath, CancelChecker cancelChecker) {
        try {
            Project project = projectService.loadOrCreate(filePath, cancelChecker);
            DocumentId docId = project.documentId(filePath);
            return Optional.of(project.currentPackage().module(docId.moduleId()).document(docId).syntaxTree());
        } catch (RuntimeException e) {
            logSwallowed("syntaxTree", filePath, e);
            return Optional.empty();
        }
    }

    @Override
    public Optional<SemanticModel> semanticModel(Path filePath) {
        return semanticModel(filePath, null);
    }

    @Override
    public Optional<SemanticModel> semanticModel(Path filePath, CancelChecker cancelChecker) {
        try {
            Project project = projectService.loadOrCreate(filePath, cancelChecker);
            Module module = projectService.module(filePath, cancelChecker);
            return semanticModel(project, module.moduleId(), filePath, cancelChecker);
        } catch (RuntimeException e) {
            logSwallowed("semanticModel", filePath, e);
            return Optional.empty();
        }
    }

    private Optional<SemanticModel> semanticModel(Project project, ModuleId moduleId, Path filePath,
                                                  CancelChecker cancelChecker) {
        try {
            PackageCompilation compilation = CompilerCompilationGuard.getCompilation(project.currentPackage(),
                    cancelChecker);
            return Optional.of(compilation.getSemanticModel(moduleId));
        } catch (Exception e) {
            // Deliberate fallback: the stable compilation path may not be ready yet; retry via the buffered
            // compilation snapshot below. Logged at FINE so a repeated fallback storm is still observable.
            logSwallowed("semanticModel (stable compilation)", filePath, e);
            return semanticModelFromCompilation(filePath, moduleId, cancelChecker);
        }
    }

    @Override
    public Optional<PackageCompilation> waitAndGetPackageCompilation(Path filePath) {
        return waitAndGetPackageCompilation(filePath, null);
    }

    @Override
    public Optional<PackageCompilation> waitAndGetPackageCompilation(Path filePath, CancelChecker cancelChecker) {
        try {
            Project project = projectService.loadOrCreate(filePath, cancelChecker);
            PackageDescriptor descriptor = project.currentPackage().descriptor();
            StableSnapshot snapshot = null;
            try {
                snapshot = compilationService.stableSnapshot(project, descriptor, cancelChecker);
            } catch (RuntimeException e) {
                // Deliberate fallback to the raw compiler result below for legacy diagnostics compatibility.
                // Logged at FINE so a repeatedly failing stable-snapshot path is observable.
                logSwallowed("waitAndGetPackageCompilation (stable snapshot)", filePath, e);
            }
            if (snapshot != null) {
                return Optional.of(snapshot.compilation());
            }
            return Optional.of(CompilerCompilationGuard.getCompilation(project.currentPackage(), cancelChecker));
        } catch (RuntimeException e) {
            logSwallowed("waitAndGetPackageCompilation", filePath, e);
            return Optional.empty();
        }
    }

    @Override
    public void didOpen(Path filePath, DidOpenTextDocumentParams params) throws WorkspaceDocumentException {
        try {
            String uriString = uriOrFilePath(params.getTextDocument().getUri(), filePath);
            String content = params.getTextDocument().getText();
            projectService.didOpen(toDocumentUri(uriString), content);
        } catch (RuntimeException e) {
            // didOpen is the only lifecycle entry point that creates fresh project state, so a failure here
            // leaves a half-constructed project that can never recover; evicting it is the safe reset.
            logSwallowed("didOpen", filePath, e);
            projectService.evictProject(filePath);
            throw new WorkspaceDocumentException(e);
        }
    }

    // Note on lifecycle error-handling asymmetry (deliberate, see task #07):
    // didChange and didClose intentionally do NOT evict the project on failure the way didOpen does.
    // Rationale:
    //   1. By the time didChange/didClose run, the project already exists in a known-good state from a prior
    //      successful didOpen. A RuntimeException here typically comes from applying a single content change
    //      (didChange) or tearing down a document handle (didClose), not from corrupting the whole project.
    //   2. Evicting on a didChange failure would discard the entire project — including every other open
    //      document in that package — because one edit failed to apply. That is far more disruptive than
    //      leaving the project at its last successfully applied content version, which the editor can retry
    //      from on the next change.
    //   3. didClose failing rarely implies project corruption; the document handle simply may not unregister.
    //      Evicting would force a full reload on the next access for no benefit.
    // The next read after a failed didChange will operate on the last good snapshot (via the stable
    // snapshot / buffered-change layer in ProjectService), so the language server degrades gracefully
    // instead of nuking the workspace. If a future failure mode is found that does corrupt project state,
    // the fix is to make ProjectService.didChange/didClose internally atomic, not to evict at the facade.
    @Override
    public void didChange(Path filePath, DidChangeTextDocumentParams params) throws WorkspaceDocumentException {
        projectService.loadOrCreate(filePath, null);
        String uriString = uriOrFilePath(params.getTextDocument().getUri(), filePath);
        projectService.didChange(toDocumentUri(uriString), params.getContentChanges());
    }

    @Override
    public void didClose(Path filePath, DidCloseTextDocumentParams params) {
        projectService.loadOrCreate(filePath, null);
        String uriString = uriOrFilePath(params.getTextDocument().getUri(), filePath);
        projectService.didClose(toDocumentUri(uriString));
    }

    @Override
    public void didChangeWatched(Path filePath, FileEvent fileEvent) throws WorkspaceDocumentException {
        projectService.didChangeWatchedFiles(List.of(fileEvent));
    }

    @Override
    public List<Path> didChangeWatched(DidChangeWatchedFilesParams params) throws WorkspaceDocumentException {
        List<FileEvent> events = params != null && params.getChanges() != null
                ? params.getChanges() : List.of();
        projectService.didChangeWatchedFiles(events);
        return List.of();
    }

    @Override
    public String uriScheme() {
        return "file";
    }

    @Override
    public RunResult run(RunContext runContext) throws IOException {
        return workspaceRunService.run(runContext);
    }

    @Override
    public boolean stop(Path filePath) {
        Path sourceRoot = workspaceRunService.sourceRoot(filePath);
        boolean stopped = workspaceRunService.stop(filePath);
        try {
            executionService.stop(new DocumentUri.FileUri(sourceRoot.toUri()));
            return stopped;
        } catch (Exception e) {
            logSwallowed("stop", filePath, e);
            return false;
        }
    }

    @Override
    public CompletableFuture<Map<Path, Project>> workspaceProjects() {
        Collection<Project> projects = projectService.allProjects();
        Map<Path, Project> projectMap = projects.stream()
                .collect(Collectors.toMap(Project::sourceRoot, p -> p,
                        (existingProject, duplicateProject) -> projectService.project(existingProject.sourceRoot())
                                .orElse(existingProject)));
        return CompletableFuture.completedFuture(projectMap);
    }

    private Project loadProject(DocumentUri uri) {
        return projectService.loadOrCreate(uri, null);
    }

    private Optional<Module> module(DocumentUri uri, CancelChecker cancelChecker) {
        try {
            return Optional.of(projectService.module(uri, cancelChecker));
        } catch (RuntimeException e) {
            logSwallowed("module", uri, e);
            return Optional.empty();
        }
    }

    private Optional<Document> document(DocumentUri uri, CancelChecker cancelChecker) {
        return projectService.document(uri, cancelChecker);
    }

    private Optional<SyntaxTree> syntaxTree(DocumentUri uri, CancelChecker cancelChecker) {
        return document(uri, cancelChecker).map(Document::syntaxTree);
    }

    private Optional<SemanticModel> semanticModel(DocumentUri uri, CancelChecker cancelChecker) {
        try {
            Project project = projectService.loadOrCreate(uri, cancelChecker);
            Module module = projectService.module(uri, cancelChecker);
            return semanticModel(project, module.moduleId(), Path.of(UriResolver.pathOf(uri.uri())), cancelChecker);
        } catch (RuntimeException e) {
            logSwallowed("semanticModel", uri, e);
            return Optional.empty();
        }
    }

    private Optional<SemanticModel> semanticModelFromCompilation(Path filePath, ModuleId moduleId,
                                                                CancelChecker cancelChecker) {
        try {
            return waitAndGetPackageCompilation(filePath, cancelChecker)
                    .map(compilation -> compilation.getSemanticModel(moduleId));
        } catch (Exception e) {
            // Deliberate swallow: both the stable-snapshot and raw-compiler paths already failed above; there
            // is no further fallback, so the only honest result is empty. Logged at FINE for observability.
            logSwallowed("semanticModelFromCompilation", filePath, e);
            return Optional.empty();
        }
    }

    private Optional<PackageCompilation> waitAndGetPackageCompilation(DocumentUri uri, CancelChecker cancelChecker) {
        try {
            Project project = projectService.loadOrCreate(uri, cancelChecker);
            if (!(uri instanceof DocumentUri.FileUri)) {
                return Optional.of(CompilerCompilationGuard.getCompilation(project.currentPackage(), cancelChecker));
            }

            PackageDescriptor descriptor = project.currentPackage().descriptor();
            StableSnapshot snapshot = null;
            try {
                snapshot = compilationService.stableSnapshot(project, descriptor, cancelChecker);
            } catch (RuntimeException e) {
                // Deliberate fallback to the raw compiler result below for legacy diagnostics compatibility.
                // Logged at FINE so a repeatedly failing stable-snapshot path is observable.
                logSwallowed("waitAndGetPackageCompilation (stable snapshot)", uri, e);
            }
            if (snapshot != null) {
                return Optional.of(snapshot.compilation());
            }
            return Optional.of(CompilerCompilationGuard.getCompilation(project.currentPackage(), cancelChecker));
        } catch (RuntimeException e) {
            logSwallowed("waitAndGetPackageCompilation", uri, e);
            return Optional.empty();
        }
    }

    private DocumentUri documentUriLike(DocumentUri template, Path path) {
        Path normalized = path.toAbsolutePath().normalize();
        return switch (template) {
            case DocumentUri.FileUri ignored -> new DocumentUri.FileUri(normalized.toUri());
            case DocumentUri.ExprUri ignored -> new DocumentUri.ExprUri(URI.create("expr://"
                    + normalized.toUri().getPath()));
            case DocumentUri.AiUri ignored -> new DocumentUri.AiUri(URI.create("ai://"
                    + normalized.toUri().getPath()));
        };
    }

    private static final class UriScopedWorkspaceManager implements WorkspaceManager {

        private final WorkspaceManagerFacadeImpl facade;
        private final DocumentUri uri;
        private final Path requestPath;
        private final boolean routeAllPaths;
        private final boolean routeDescendants;

        private UriScopedWorkspaceManager(WorkspaceManagerFacadeImpl facade, DocumentUri uri) {
            this.facade = facade;
            this.uri = uri;
            this.routeAllPaths = !(uri instanceof DocumentUri.FileUri)
                    && (uri.uri().getPath() == null || uri.uri().getPath().isBlank());
            this.requestPath = routeAllPaths ? null
                    : Path.of(UriResolver.pathOf(uri.uri())).toAbsolutePath().normalize();
            this.routeDescendants = !(uri instanceof DocumentUri.FileUri) && requestPath != null
                    && !isBallerinaSource(requestPath);
        }

        @Override
        public Optional<String> relativePath(Path path) {
            return facade.relativePath(path);
        }

        @Override
        public Optional<String> relativePath(Path path, CancelChecker cancelChecker) {
            return facade.relativePath(path, cancelChecker);
        }

        @Override
        public Path projectRoot(Path path) {
            return facade.projectRoot(path);
        }

        @Override
        public Path projectRoot(Path path, CancelChecker cancelChecker) {
            return facade.projectRoot(path, cancelChecker);
        }

        @Override
        public Optional<Project> project(Path filePath) {
            if (!shouldScope(filePath)) {
                return facade.project(filePath);
            }
            try {
                return Optional.of(facade.loadProject(uriFor(filePath)));
            } catch (Exception e) {
                logSwallowed("project (uri-scoped)", filePath, e);
                return Optional.empty();
            }
        }

        @Override
        public Project loadProject(Path filePath)
                throws ProjectException, WorkspaceDocumentException, EventSyncException {
            return shouldScope(filePath) ? facade.loadProject(uriFor(filePath)) : facade.loadProject(filePath);
        }

        @Override
        public Optional<Module> module(Path filePath) {
            return shouldScope(filePath) ? facade.module(uriFor(filePath), null) : facade.module(filePath);
        }

        @Override
        public Optional<Module> module(Path filePath, CancelChecker cancelChecker) {
            return shouldScope(filePath) ? facade.module(uriFor(filePath), cancelChecker)
                    : facade.module(filePath, cancelChecker);
        }

        @Override
        public Optional<Document> document(Path filePath) {
            return shouldScope(filePath) ? facade.document(uriFor(filePath), null) : facade.document(filePath);
        }

        @Override
        public Optional<Document> document(Path filePath, CancelChecker cancelChecker) {
            return shouldScope(filePath) ? facade.document(uriFor(filePath), cancelChecker)
                    : facade.document(filePath, cancelChecker);
        }

        @Override
        public Optional<SyntaxTree> syntaxTree(Path filePath) {
            return shouldScope(filePath) ? facade.syntaxTree(uriFor(filePath), null) : facade.syntaxTree(filePath);
        }

        @Override
        public Optional<SyntaxTree> syntaxTree(Path filePath, CancelChecker cancelChecker) {
            return shouldScope(filePath) ? facade.syntaxTree(uriFor(filePath), cancelChecker)
                    : facade.syntaxTree(filePath, cancelChecker);
        }

        @Override
        public Optional<SemanticModel> semanticModel(Path filePath) {
            return shouldScope(filePath) ? facade.semanticModel(uriFor(filePath), null)
                    : facade.semanticModel(filePath);
        }

        @Override
        public Optional<SemanticModel> semanticModel(Path filePath, CancelChecker cancelChecker) {
            return shouldScope(filePath) ? facade.semanticModel(uriFor(filePath), cancelChecker)
                    : facade.semanticModel(filePath, cancelChecker);
        }

        @Override
        public Optional<PackageCompilation> waitAndGetPackageCompilation(Path filePath) {
            return shouldScope(filePath) ? facade.waitAndGetPackageCompilation(uriFor(filePath), null)
                    : facade.waitAndGetPackageCompilation(filePath);
        }

        @Override
        public Optional<PackageCompilation> waitAndGetPackageCompilation(Path filePath, CancelChecker cancelChecker) {
            return shouldScope(filePath) ? facade.waitAndGetPackageCompilation(uriFor(filePath), cancelChecker)
                    : facade.waitAndGetPackageCompilation(filePath, cancelChecker);
        }

        @Override
        public void didOpen(Path filePath, DidOpenTextDocumentParams params) throws WorkspaceDocumentException {
            facade.didOpen(filePath, params);
        }

        @Override
        public void didChange(Path filePath, DidChangeTextDocumentParams params) throws WorkspaceDocumentException {
            facade.didChange(filePath, params);
        }

        @Override
        public void didClose(Path filePath, DidCloseTextDocumentParams params) {
            facade.didClose(filePath, params);
        }

        @Override
        public void didChangeWatched(Path filePath, FileEvent fileEvent) throws WorkspaceDocumentException {
            facade.didChangeWatched(filePath, fileEvent);
        }

        @Override
        public List<Path> didChangeWatched(DidChangeWatchedFilesParams params) throws WorkspaceDocumentException {
            return facade.didChangeWatched(params);
        }

        @Override
        public String uriScheme() {
            return uri.uri().getScheme();
        }

        @Override
        public RunResult run(RunContext runContext) throws IOException {
            return facade.run(runContext);
        }

        @Override
        public boolean stop(Path filePath) {
            return facade.stop(filePath);
        }

        @Override
        public CompletableFuture<Map<Path, Project>> workspaceProjects() {
            return facade.workspaceProjects();
        }

        private boolean shouldScope(Path path) {
            if (path == null) {
                return false;
            }
            Path normalized = path.toAbsolutePath().normalize();
            return routeAllPaths || requestPath.equals(normalized)
                    || (routeDescendants && normalized.startsWith(requestPath));
        }

        private DocumentUri uriFor(Path path) {
            Path normalized = path.toAbsolutePath().normalize();
            return (routeAllPaths || !requestPath.equals(normalized)) ? facade.documentUriLike(uri, normalized) : uri;
        }

        private static boolean isBallerinaSource(Path path) {
            Path fileName = path.getFileName();
            return fileName != null && fileName.toString().endsWith(".bal");
        }

    }

    /**
     * Logs a swallowed exception at {@link Level#FINE} before a facade read method returns its empty/default
     * value. String construction is guarded by {@link Logger#isLoggable} so the hot path pays nothing when
     * fine logging is disabled. The return behavior of the caller is intentionally unchanged; this is purely
     * an observability hook so a genuine engine bug is distinguishable from "no result".
     *
     * @param operation short name of the facade operation that failed (e.g. {@code "document"})
     * @param subject   the path or URI involved, or {@code null} if none
     * @param e         the swallowed exception
     */
    private static void logSwallowed(String operation, Object subject, Throwable e) {
        if (LOG.isLoggable(Level.FINE)) {
            LOG.log(Level.FINE, operation + " failed for " + subject + "; returning empty/default value", e);
        }
    }

    /**
     * Converts a URI string to a typed {@link DocumentUri} based on its scheme.
     *
     * @param uriString the URI string from LSP params
     * @return the corresponding DocumentUri subtype
     */
    private DocumentUri toDocumentUri(String uriString) {
        URI uri = URI.create(uriString);
        return switch (uri.getScheme()) {
            case "file" -> new DocumentUri.FileUri(uri);
            case "bala" -> new DocumentUri.FileUri(toFileUri(uri));
            case "expr" -> new DocumentUri.ExprUri(uri);
            case "ai" -> new DocumentUri.AiUri(uri);
            default -> throw new IllegalArgumentException("Unknown URI scheme: " + uri.getScheme());
        };
    }

    private String uriOrFilePath(String uriString, Path filePath) {
        if (uriString != null && !uriString.isBlank()) {
            return uriString;
        }
        return filePath.toAbsolutePath().normalize().toUri().toString();
    }

    private URI toFileUri(URI uri) {
        try {
            return new URI("file", uri.getUserInfo(), uri.getHost(), uri.getPort(),
                    uri.getPath(), uri.getQuery(), uri.getFragment());
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Invalid bala URI: " + uri, e);
        }
    }

}
