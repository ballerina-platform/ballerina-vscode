/*
 * Copyright (c) 2018, WSO2 Inc. (http://wso2.com) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.ballerinalang.langserver.diagnostic;

import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectKind;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.command.CommandUtil;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.WorkspaceServiceContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;
import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.DiagnosticSeverity;
import org.eclipse.lsp4j.MessageType;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.PublishDiagnosticsParams;
import org.eclipse.lsp4j.Range;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;

/**
 * Utilities for the diagnostics related operations.
 *
 * @since 1.0.0
 */
public class DiagnosticsHelper {

    private final List<Diagnostic> emptyDiagnosticList = new ArrayList<>(0);
    private static final LanguageServerContext.Key<DiagnosticsHelper> DIAGNOSTICS_HELPER_KEY =
            new LanguageServerContext.Key<>();
    private static final long DIAGNOSTIC_DELAY = 1;
    /**
     * Holds file URIs that had diagnostics in the last publication for the purpose of clear-off when publishing new
     * diagnostics. Key: package root path, Value: set of file URIs that had diagnostics
     */
    private final Map<Path, Set<String>> lastDiagnosticFileUris;
    private CompletableFuture<Boolean> latestScheduled = null;
    private final Deque<String> cyclicDependencyErrors;

    public static DiagnosticsHelper getInstance(LanguageServerContext serverContext) {
        DiagnosticsHelper diagnosticsHelper = serverContext.get(DIAGNOSTICS_HELPER_KEY);
        if (diagnosticsHelper == null) {
            diagnosticsHelper = new DiagnosticsHelper(serverContext);
        }

        return diagnosticsHelper;
    }

    private DiagnosticsHelper(LanguageServerContext serverContext) {
        serverContext.put(DIAGNOSTICS_HELPER_KEY, this);
        this.lastDiagnosticFileUris = new HashMap<>();
        this.cyclicDependencyErrors = new ConcurrentLinkedDeque<>();
    }

    /**
     * Schedule the diagnostics publishing.
     * In general the diagnostics publishing is done for document open, close and change events. When the document
     * change events are triggered frequently in subsequent edits, we do compilations and diagnostic calculation for
     * each of the change event. This is time-consuming for the large projects and from the user experience point of
     * view, we can publish the diagnostics after a delay. The default delay specified in {@link #DIAGNOSTIC_DELAY}
     *
     * @param client  Language client
     * @param context Document Service context.
     */
    public synchronized void schedulePublishDiagnostics(ExtendedLanguageClient client, DocumentServiceContext context) {
        WorkspaceManager workspaceManager = context.workspace();
        Path projectRoot = workspaceManager.projectRoot(context.filePath());
        compileAndSendDiagnostics(workspaceManager, projectRoot, client);
    }

    /**
     * Schedule the diagnostics publishing for a project specified with the given project root.
     * This particular diagnostics publishing API is used for publishing diagnostics through the workspace service.
     * This is time-consuming for the large projects and from the user experience point of
     * view, we can publish the diagnostics after a delay. The default delay specified in {@link #DIAGNOSTIC_DELAY}
     *
     * @param client      Language client
     * @param context     Workspace Service context
     * @param projectRoot project root
     */
    public synchronized void schedulePublishDiagnostics(ExtendedLanguageClient client,
                                                        WorkspaceServiceContext context,
                                                        Path projectRoot) {
        WorkspaceManager workspaceManager = context.workspace();
        compileAndSendDiagnostics(workspaceManager, projectRoot, client);
    }

    /**
     * Compiles and publishes diagnostics for a source file.
     * In order to avoid the unnecessary compilations, we will be scheduling the diagnostic compilations. Hence, instead
     * of this method, it is highly recommended to use
     * {@link #schedulePublishDiagnostics(ExtendedLanguageClient, DocumentServiceContext)}
     *
     * @param client  Language server client
     * @param context LS context
     */
    public synchronized void compileAndSendDiagnostics(ExtendedLanguageClient client, DocumentServiceContext context) {
        // Compile diagnostics
        Optional<Project> project = context.workspace().project(context.filePath());
        if (project.isEmpty()) {
            return;
        }
        DiagnosticsResponse response = getLatestDiagnosticsWithPackages(context);
        sendDiagnostics(client, response.diagnostics(), response.compiledPackages(), response.packageFileUris());
    }

    /**
     * Compiles and publishes diagnostics for a project.
     *
     * @param client      Language server client
     * @param projectRoot project root
     * @param compilation package compilation
     */
    private synchronized void compileAndSendDiagnostics(ExtendedLanguageClient client, Path projectRoot,
                                                        PackageCompilation compilation,
                                                        WorkspaceManager workspaceManager) {
        PackageDiagnostics packageDiagnostics =
                toDiagnosticsMap(compilation.diagnosticResult().diagnostics(false), projectRoot, workspaceManager);
        Map<Path, Set<String>> packageFileUris = new HashMap<>();
        packageFileUris.put(projectRoot, packageDiagnostics.fileUris());
        sendDiagnostics(client, packageDiagnostics.diagnostics(), List.of(projectRoot), packageFileUris);
    }

    private synchronized void sendDiagnostics(ExtendedLanguageClient client,
                                              Map<String, List<Diagnostic>> diagnosticMap,
                                              List<Path> compiledPackages,
                                              Map<Path, Set<String>> packageFileUris) {
        // If the client is null, returns
        if (client == null) {
            return;
        }

        // Clear old diagnostic entries only from compiled packages
        for (Path packageRoot : compiledPackages) {
            Set<String> lastFileUris = lastDiagnosticFileUris.getOrDefault(packageRoot, new HashSet<>());
            lastFileUris.forEach(fileUri -> {
                if (!diagnosticMap.containsKey(fileUri)) {
                    client.publishDiagnostics(new PublishDiagnosticsParams(fileUri, emptyDiagnosticList));
                }
            });
        }

        // Publish diagnostics for all packages
        diagnosticMap.forEach((key, value) -> client.publishDiagnostics(new PublishDiagnosticsParams(key, value)));

        // Show cyclic dependency error message if exists
        while (!this.cyclicDependencyErrors.isEmpty()) {
            CommandUtil.notifyClient(client, MessageType.Error, this.cyclicDependencyErrors.pop());
        }

        // Update tracked file URIs per package using the provided mappings
        packageFileUris.forEach((packageRoot, fileUris) -> lastDiagnosticFileUris.put(packageRoot, fileUris));
    }

    private DiagnosticsResponse getLatestDiagnosticsWithPackages(DocumentServiceContext context) {
        BallerinaWorkspaceManager workspace = (BallerinaWorkspaceManager) context.workspace();
        Map<String, List<Diagnostic>> diagnosticMap = new HashMap<>();
        List<Path> compiledPackages = new ArrayList<>();
        Map<Path, Set<String>> packageFileUris = new HashMap<>();

        Optional<Project> project = workspace.project(context.filePath());
        if (project.isEmpty()) {
            return new DiagnosticsResponse(diagnosticMap, compiledPackages, packageFileUris);
        }
        // NOTE: We are not using `project.sourceRoot()` since it provides the single file project uses a temp path and
        // IDE requires the original path.
        Path projectRoot = workspace.projectRoot(context.filePath());
        Path originalPath = project.get().kind() == ProjectKind.SINGLE_FILE_PROJECT
                ? projectRoot.getParent() : projectRoot;

        // Check if this package belongs to a workspace project
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        Optional<Project> workspaceProjectOpt = compilerApi.getWorkspaceProject(project.get());
        if (workspaceProjectOpt.isPresent()) {
            // Handle workspace project: get diagnostics from current package and all dependents
            Project workspaceProject = workspaceProjectOpt.get();

            // Get the current package compilation
            Optional<PackageCompilation> currentCompilation =
                    workspace.waitAndGetPackageCompilation(context.filePath());
            currentCompilation.ifPresent(packageCompilation -> {
                PackageDiagnostics pkgDiag = toDiagnosticsMap(
                        compilerApi.getDiagnostics(packageCompilation.diagnosticResult()),
                        originalPath, workspace);
                diagnosticMap.putAll(pkgDiag.diagnostics());
                compiledPackages.add(originalPath);
                packageFileUris.put(originalPath, pkgDiag.fileUris());
            });

            // Get diagnostics from all dependent packages
            Collection<Project> dependents = compilerApi.getWorkspaceDependents(workspaceProject, project.get());
            for (Project dependent : dependents) {
                Path dependentRoot = dependent.sourceRoot();
                Optional<PackageCompilation> dependentCompilation =
                        workspace.waitAndGetPackageCompilation(dependentRoot);
                dependentCompilation.ifPresent(packageCompilation -> {
                    PackageDiagnostics pkgDiag = toDiagnosticsMap(
                            compilerApi.getDiagnostics(packageCompilation.diagnosticResult()),
                            dependentRoot, workspace);
                    diagnosticMap.putAll(pkgDiag.diagnostics());
                    compiledPackages.add(dependentRoot);
                    packageFileUris.put(dependentRoot, pkgDiag.fileUris());
                });
            }
        } else if (compilerApi.isWorkspaceProject(project.get())) {
            // Handle workspace project by iterating through all its packages
            List<Project> projects = compilerApi.getWorkspaceProjects(project.get());
            for (Project buildProject : projects) {
                Path buildProjectRoot = buildProject.sourceRoot();
                Optional<PackageCompilation> buildProjectCompilation =
                        workspace.waitAndGetPackageCompilation(buildProjectRoot);
                buildProjectCompilation.ifPresent(packageCompilation -> {
                    PackageDiagnostics pkgDiag = toDiagnosticsMap(
                            compilerApi.getDiagnostics(packageCompilation.diagnosticResult()),
                            buildProjectRoot, workspace);
                    diagnosticMap.putAll(pkgDiag.diagnostics());
                    compiledPackages.add(buildProjectRoot);
                    packageFileUris.put(buildProjectRoot, pkgDiag.fileUris());
                });
            }
        } else {
            // Fall back to single package compilation
            Optional<PackageCompilation> compilation = workspace.waitAndGetPackageCompilation(context.filePath());
            compilation.ifPresent(packageCompilation -> {
                PackageDiagnostics pkgDiag = toDiagnosticsMap(
                        packageCompilation.diagnosticResult().diagnostics(false), originalPath, workspace);
                diagnosticMap.putAll(pkgDiag.diagnostics());
                compiledPackages.add(originalPath);
                packageFileUris.put(originalPath, pkgDiag.fileUris());
            });
        }
        return new DiagnosticsResponse(diagnosticMap, compiledPackages, packageFileUris);
    }

    public Map<String, List<Diagnostic>> getLatestDiagnostics(DocumentServiceContext context) {
        return getLatestDiagnosticsWithPackages(context).diagnostics();
    }

    private PackageDiagnostics toDiagnosticsMap(Collection<io.ballerina.tools.diagnostics.Diagnostic> diags,
                                                Path projectRoot, WorkspaceManager workspaceManager) {
        Map<String, List<Diagnostic>> diagnosticsMap = new HashMap<>();
        Set<String> fileUris = new HashSet<>();

        for (io.ballerina.tools.diagnostics.Diagnostic diag : diags) {
            if (diag.diagnosticInfo().code()
                    .equals(DiagnosticErrorCode.CYCLIC_MODULE_IMPORTS_DETECTED.diagnosticId())) {
                this.cyclicDependencyErrors.push(diag.message());
            }
            LineRange lineRange = diag.location().lineRange();
            Diagnostic diagnostic = getLSDiagnosticsFromCompilationDiagnostics(lineRange, diag);

            /*
            If the project root is a directory, that means it is a build project and in the other case, a single
            file project. So we only append the file URI for the build project case.
             */
            Path resolvedPath = projectRoot.toFile().isDirectory()
                    ? projectRoot.resolve(lineRange.fileName())
                    : projectRoot;
            String resolvedUri = resolvedPath.toUri().toString();
            String fileURI = PathUtil.getModifiedUri(workspaceManager, resolvedUri);
            List<Diagnostic> clientDiagnostics = diagnosticsMap.computeIfAbsent(fileURI, s -> new ArrayList<>());
            clientDiagnostics.add(diagnostic);
            fileUris.add(fileURI);
        }
        return new PackageDiagnostics(diagnosticsMap, fileUris);
    }

    private synchronized void compileAndSendDiagnostics(WorkspaceManager workspaceManager,
                                                        Path projectRoot,
                                                        ExtendedLanguageClient client) {
        if (latestScheduled != null && !latestScheduled.isDone()) {
            latestScheduled.completeExceptionally(new Throwable("Cancelled diagnostic publisher"));
        }

        Executor delayedExecutor = CompletableFuture.delayedExecutor(DIAGNOSTIC_DELAY, TimeUnit.SECONDS);
        CompletableFuture<Boolean> scheduledFuture = CompletableFuture.supplyAsync(() -> true, delayedExecutor);
        latestScheduled = scheduledFuture;
        scheduledFuture
                .thenApplyAsync((bool) -> workspaceManager.waitAndGetPackageCompilation(projectRoot))
                .thenAccept(compilation ->
                        compilation.ifPresent(pkgCompilation ->
                                compileAndSendDiagnostics(client, projectRoot, pkgCompilation, workspaceManager)));
    }

    public static Diagnostic getLSDiagnosticsFromCompilationDiagnostics(
            LineRange lineRange, io.ballerina.tools.diagnostics.Diagnostic diag) {
        int startLine = lineRange.startLine().line();
        int startChar = lineRange.startLine().offset();
        int endLine = lineRange.endLine().line();
        int endChar = lineRange.endLine().offset();

        endLine = (endLine <= 0) ? startLine : endLine;
        endChar = (endChar <= 0) ? startChar + 1 : endChar;

        Range range = new Range(new Position(startLine, startChar), new Position(endLine, endChar));
        Diagnostic diagnostic = new Diagnostic(range, diag.message(), null, null, diag.diagnosticInfo().code());

        switch (diag.diagnosticInfo().severity()) {
            case ERROR:
                diagnostic.setSeverity(DiagnosticSeverity.Error);
                break;
            case WARNING:
                diagnostic.setSeverity(DiagnosticSeverity.Warning);
                break;
            case HINT:
                diagnostic.setSeverity(DiagnosticSeverity.Hint);
                break;
            case INFO:
                diagnostic.setSeverity(DiagnosticSeverity.Information);
                break;
            default:
                break;
        }
        return diagnostic;
    }

    /**
     * Helper class to hold diagnostics and file URIs for a single package.
     *
     * @param diagnostics Map of file URIs to their diagnostics
     * @param fileUris    Set of file URIs that have diagnostics
     */
    private record PackageDiagnostics(Map<String, List<Diagnostic>> diagnostics, Set<String> fileUris) {
    }

    /**
     * Helper class to hold diagnostic results along with metadata about which packages were compiled.
     *
     * @param diagnostics       Map of file URIs to their diagnostics
     * @param compiledPackages  List of package root paths that were compiled
     * @param packageFileUris   Map of package root paths to the set of file URIs that have diagnostics
     */
    private record DiagnosticsResponse(Map<String, List<Diagnostic>> diagnostics, List<Path> compiledPackages,
                                       Map<Path, Set<String>> packageFileUris) {
    }
}
