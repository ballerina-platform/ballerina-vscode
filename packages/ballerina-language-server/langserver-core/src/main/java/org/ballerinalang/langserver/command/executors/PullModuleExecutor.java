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
package org.ballerinalang.langserver.command.executors;

import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import io.ballerina.projects.CompilationOptions;
import io.ballerina.projects.DependencyManifest;
import io.ballerina.projects.JvmTarget;
import io.ballerina.projects.Project;
import io.ballerina.projects.Settings;
import io.ballerina.projects.internal.bala.DependencyGraphJson;
import io.ballerina.projects.internal.model.Dependency;
import io.ballerina.projects.util.ProjectConstants;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.central.client.CentralAPIClient;
import org.ballerinalang.central.client.exceptions.CentralClientException;
import org.ballerinalang.central.client.exceptions.PackageAlreadyExistsException;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.LSContextOperation;
import org.ballerinalang.langserver.codeaction.providers.imports.PullModuleCodeAction;
import org.ballerinalang.langserver.command.CommandUtil;
import org.ballerinalang.langserver.common.constants.CommandConstants;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.ExecuteCommandContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.command.CommandArgument;
import org.ballerinalang.langserver.commons.command.spi.LSCommandExecutor;
import org.ballerinalang.langserver.commons.eventsync.EventKind;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.contexts.ContextBuilder;
import org.ballerinalang.langserver.eventsync.EventSyncPubSubHolder;
import org.ballerinalang.langserver.exception.UserErrorException;
import org.ballerinalang.langserver.workspace.BallerinaWorkspaceManager;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;
import org.eclipse.lsp4j.MessageType;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.ProgressParams;
import org.eclipse.lsp4j.WorkDoneProgressBegin;
import org.eclipse.lsp4j.WorkDoneProgressCreateParams;
import org.eclipse.lsp4j.WorkDoneProgressEnd;
import org.eclipse.lsp4j.WorkDoneProgressReport;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.wso2.ballerinalang.util.RepoUtils;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

import static io.ballerina.projects.util.ProjectUtils.getAccessTokenOfCLI;
import static io.ballerina.projects.util.ProjectUtils.initializeProxy;

/**
 * Command executor for pulling a package from central.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.command.spi.LSCommandExecutor")
public class PullModuleExecutor implements LSCommandExecutor {

    public static final String COMMAND = "PULL_MODULE";
    private static final String TITLE_PULL_MODULE = "Pull Module";
    private static final String PULL_MODULE_TASK_PREFIX = "pull-module-";

    // Built-in packages (lang libs, jballerina.java, etc.) carry this version and have no balas.
    private static final String BUILT_IN_PACKAGE_VERSION = "0.0.0";
    // Safety cap for the number of missing balas pulled within a single request.
    private static final int MAX_MISSING_BALA_PULLS = 25;
    // Guards against concurrent/re-entrant pulls for the same project. The PROJECT_UPDATE event
    // published in stage 4 below is also consumed by ResolveCompilationErrorsSubscriber, which
    // starts another pull for the same project, creating an endless pull loop on failures.
    private static final Set<String> PULL_IN_PROGRESS_PROJECTS = ConcurrentHashMap.newKeySet();

    /**
     * {@inheritDoc}
     *
     * @param context
     */
    @Override
    public Object execute(ExecuteCommandContext context) {
        String fileUri = null;
        String moduleName = null;
        for (CommandArgument arg : context.getArguments()) {
            switch (arg.key()) {
                case CommandConstants.ARG_KEY_DOC_URI:
                    fileUri = arg.valueAs(String.class);
                    break;
                case CommandConstants.ARG_KEY_MODULE_NAME:
                    moduleName = arg.valueAs(String.class);
                    break;
                default:
            }
        }
        try {
            return resolveModules(fileUri, context.getLanguageClient(), context.workspace(),
                    context.languageServercontext()).get();
        } catch (InterruptedException | ExecutionException e) {
            // TODO: Add tracing after the workspace manager rewrite.
            // Tracked with https://github.com/wso2/product-ballerina-integrator/issues/1488
            throw new RuntimeException(e);
        }
    }

    public static CompletableFuture<Void> resolveModules(String fileUri, ExtendedLanguageClient languageClient,
                                                         WorkspaceManager workspaceManager,
                                                         LanguageServerContext languageServerContext) {
        return resolveModules(fileUri, languageClient, workspaceManager, languageServerContext, false);
    }

    /**
     * Resolves missing modules for the given file.
     *
     * @param fileUri               the file URI
     * @param languageClient        the language client
     * @param workspaceManager      the workspace manager
     * @param languageServerContext the language server context
     * @param sticky                whether to use sticky mode for dependency resolution
     * @return a CompletableFuture that completes when module resolution is done
     */
    public static CompletableFuture<Void> resolveModules(String fileUri, ExtendedLanguageClient languageClient,
                                                         WorkspaceManager workspaceManager,
                                                         LanguageServerContext languageServerContext, boolean sticky) {
        String taskId = PULL_MODULE_TASK_PREFIX + UUID.randomUUID();
        Path filePath = PathUtil.getPathFromURI(fileUri)
                .orElseThrow(() -> new UserErrorException("Couldn't determine file path"));
        Project project = workspaceManager.project(filePath)
                .orElseThrow(() -> new UserErrorException("Couldn't find project to pull modules"));

        LSClientLogger clientLogger = LSClientLogger.getInstance(languageServerContext);

        // Prevent parallel/re-entrant pull tasks for the same project. Without this, the
        // PROJECT_UPDATE event published by a running pull re-triggers another pull via
        // ResolveCompilationErrorsSubscriber, causing an endless pull storm when pulls fail.
        String projectKey = project.sourceRoot().toString();
        if (!PULL_IN_PROGRESS_PROJECTS.add(projectKey)) {
            clientLogger.logTrace("Skipped pulling modules since a pull is already in progress for project: "
                    + projectKey);
            return CompletableFuture.completedFuture(null);
        }
        return CompletableFuture
                .runAsync(() -> {
                    clientLogger.logTrace("Started pulling modules for project: " + project.sourceRoot().toString());

                    // Initialize progress notification
                    WorkDoneProgressCreateParams workDoneProgressCreateParams = new WorkDoneProgressCreateParams();
                    workDoneProgressCreateParams.setToken(taskId);
                    languageClient.createProgress(workDoneProgressCreateParams);

                    // Start progress
                    WorkDoneProgressBegin beginNotification = new WorkDoneProgressBegin();
                    beginNotification.setTitle(TITLE_PULL_MODULE);
                    beginNotification.setCancellable(false);
                    beginNotification.setMessage("pulling the missing ballerina modules");
                    languageClient.notifyProgress(new ProgressParams(Either.forLeft(taskId),
                            Either.forLeft(beginNotification)));
                })
                .thenRunAsync(() -> {
                    CompilationOptions.CompilationOptionsBuilder optionsBuilder = CompilationOptions.builder();
                    // Production resolves online so missing modules are pulled from Central; tests
                    // (ls.test.offline) resolve only from the build-provisioned Ballerina home.
                    optionsBuilder.setOffline(CommonUtil.TEST_OFFLINE).setSticky(sticky);
                    CompilationOptions options = optionsBuilder.build();

                    // For workspace projects, currentPackage() returns only the first member package.
                    // Resolve every member online so that missing (transitive) balas are pulled for all
                    // packages in the workspace. Single-member workspaces and non-workspace projects are
                    // handled by the same path since the list then contains exactly one project.
                    BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
                    List<Project> memberProjects = compilerApi.isWorkspaceProject(project)
                            ? compilerApi.getWorkspaceProjectsInOrder(project)
                            : List.of(project);
                    if (memberProjects.isEmpty()) {
                        // Defensive fallback: preserve the previous behavior.
                        memberProjects = List.of(project);
                    }

                    // Repair the local bala cache first: pull any dependency bala that is recorded in
                    // Dependencies.toml or in a cached bala's dependency-graph.json but is missing from
                    // the local repository. The resolution below cannot repair such gaps by itself,
                    // because its online dependency graph is unified to the locked versions and never
                    // requests the bala-recorded (as-built) versions demanded by offline compilations.
                    for (Project memberProject : memberProjects) {
                        // TODO: Remove the following path once
                        //  https://github.com/ballerina-platform/ballerina-lang/issues/44275 gets fixed
                        repairMissingDependencyBalas(memberProject, clientLogger);
                    }

                    // Run all resolutions first so that every member's missing modules are pulled from
                    // central, even if a subsequent member compilation fails.
                    for (Project memberProject : memberProjects) {
                        memberProject.currentPackage().getResolution(options);
                    }
                    // BIR issues are not captured during resolution, causing the pull module executor to incorrectly
                    // report that modules were pulled successfully. To remedy this, we now include the compilation
                    // step so that the executor accounts for BIR errors when generating the final status.
                    for (Project memberProject : memberProjects) {
                        memberProject.currentPackage().getCompilation();
                    }
                })
                .thenRunAsync(() -> {
                    try {
                        // Refresh project
                        ((BallerinaWorkspaceManager) workspaceManager).refreshProject(filePath);
                    } catch (WorkspaceDocumentException e) {
                        throw new UserErrorException("Failed to refresh project");
                    }
                })
                .thenRunAsync(() -> {
                    DocumentServiceContext docContext = ContextBuilder.buildDocumentServiceContext(
                            fileUri,
                            workspaceManager,
                            LSContextOperation.RELOAD_PROJECT,
                            languageServerContext);
                    try {
                        EventSyncPubSubHolder.getInstance(languageServerContext)
                                .getPublisher(EventKind.PROJECT_UPDATE)
                                .publish(languageClient, languageServerContext, docContext);
                    } catch (EventSyncException e) {
                        // ignore
                    }
                })
                .thenRunAsync(() -> {
                    WorkDoneProgressReport workDoneProgressReport = new WorkDoneProgressReport();
                    workDoneProgressReport.setCancellable(false);
                    workDoneProgressReport.setMessage("compiling the project");
                    languageClient.notifyProgress(new ProgressParams(Either.forLeft(taskId),
                            Either.forLeft(workDoneProgressReport)));

                    Optional<List<String>> missingModules = workspaceManager
                            .waitAndGetPackageCompilation(filePath)
                            .map(compilation -> compilation.diagnosticResult().diagnostics().stream()
                                    .filter(diagnostic -> DiagnosticErrorCode.MODULE_NOT_FOUND.diagnosticId()
                                            .equals(diagnostic.diagnosticInfo().code()))
                                    // HACK: Ignore diagnostics for ballerinax/.config modules as they are
                                    // internal config modules that should not be pulled from central
                                    // https://github.com/ballerina-platform/ballerina-lang/issues/44519
                                    .filter(diagnostic -> !diagnostic.message()
                                            .contains("ballerinax/.config"))
                                    .map(PullModuleCodeAction::getMissingModuleNameFromDiagnostic)
                                    .filter(Optional::isPresent)
                                    .map(Optional::get)
                                    .toList()
                            );
                    if (missingModules.isEmpty()) {
                        throw new UserErrorException("Failed to pull modules!");
                    } else if (!missingModules.get().isEmpty()) {
                        String moduleNames = String.join(", ", missingModules.get());
                        throw new UserErrorException(String.format("Failed to pull modules: %s", moduleNames));
                    }
                })
                .whenComplete((result, t) -> {
                    PULL_IN_PROGRESS_PROJECTS.remove(projectKey);
                    boolean failed = true;
                    if (t != null) {
                        clientLogger.logError(LSContextOperation.WS_EXEC_CMD,
                                "Pull modules failed for project: " + project.sourceRoot().toString(),
                                t, null, (Position) null);
                        if (t.getCause() instanceof UserErrorException) {
                            String errorMessage = t.getCause().getMessage();
                            CommandUtil.notifyClient(languageClient, MessageType.Error, errorMessage);
                        } else {
                            CommandUtil.notifyClient(languageClient, MessageType.Error, "Failed to pull modules!");
                        }
                    } else {
                        failed = false;
                        CommandUtil.notifyClient(languageClient, MessageType.Info, "Module(s) pulled successfully!");
                        clientLogger
                                .logTrace("Finished pulling modules for project: " + project.sourceRoot().toString());

                        try {
                            DocumentServiceContext documentServiceContext =
                                    ContextBuilder.buildDocumentServiceContext(filePath.toUri().toString(),
                                            workspaceManager, LSContextOperation.WS_EXEC_CMD,
                                            languageServerContext);
                            EventSyncPubSubHolder.getInstance(languageServerContext)
                                    .getPublisher(EventKind.PULL_MODULE)
                                    .publish(languageClient, languageServerContext, documentServiceContext);
                        } catch (Throwable e) {
                            //ignore
                        }
                    }

                    WorkDoneProgressEnd endNotification = new WorkDoneProgressEnd();
                    if (failed) {
                        endNotification.setMessage("Failed to pull unresolved modules!");
                    } else {
                        endNotification.setMessage("Modules pulled successfully!");
                    }
                    languageClient.notifyProgress(new ProgressParams(Either.forLeft(taskId),
                            Either.forLeft(endNotification)));
                });
    }

    /**
     * Repairs the local bala cache for the given project by pulling any dependency bala that is
     * required but missing from the local repository.
     * <p>
     * The required set is computed deterministically, without compiling:
     * <ol>
     * <li>the packages locked in Dependencies.toml ({@code dependencyManifest().packages()}), and</li>
     * <li>transitively, every package recorded in the {@code dependency-graph.json} of each cached
     * bala — the as-built versions a bala's BIR demands at load time (e.g., ballerina/cache:3.10.0
     * requires ballerina/task:2.7.0 even when Dependencies.toml locks task to a newer version).</li>
     * </ol>
     * Offline compilations crash with a {@code BLangCompilerException} when such a bala is missing,
     * and the resolution-based pull cannot repair the gap because its online dependency graph is
     * unified to the locked versions and never requests the as-built version.
     *
     * @param project      the (member) project to repair the cache for
     * @param clientLogger the client logger
     */
    private static void repairMissingDependencyBalas(Project project, LSClientLogger clientLogger) {
        Path balaCacheRoot = RepoUtils.createAndGetHomeReposPath()
                .resolve(ProjectConstants.REPOSITORIES_DIR)
                .resolve(ProjectConstants.CENTRAL_REPOSITORY_CACHE_NAME)
                .resolve(ProjectConstants.BALA_DIR_NAME);

        // Seed the work queue with the packages locked in Dependencies.toml.
        Deque<String[]> workQueue = new ArrayDeque<>();
        DependencyManifest dependencyManifest = project.currentPackage().dependencyManifest();
        if (dependencyManifest == null || dependencyManifest.packages() == null) {
            return;
        }
        for (DependencyManifest.Package pkg : dependencyManifest.packages()) {
            workQueue.add(new String[]{pkg.org().value(), pkg.name().value(), pkg.version().toString()});
        }

        Set<String> visited = new HashSet<>();
        int pullCount = 0;
        while (!workQueue.isEmpty()) {
            String[] pkg = workQueue.poll();
            String org = pkg[0];
            String name = pkg[1];
            String version = pkg[2];
            if (BUILT_IN_PACKAGE_VERSION.equals(version) || !visited.add(org + "/" + name + ":" + version)) {
                // Built-in packages (lang libs, jballerina.java, etc.) have no balas.
                continue;
            }

            Path balaVersionDir = balaCacheRoot.resolve(org).resolve(name).resolve(version);
            if (!Files.isDirectory(balaVersionDir)) {
                if (pullCount >= MAX_MISSING_BALA_PULLS) {
                    clientLogger.logTrace("Skipped pulling missing bala '" + org + "/" + name + ":" + version
                            + "' since the maximum number of pulls per request has been reached");
                    continue;
                }
                pullCount++;
                clientLogger.logTrace("Pulling missing bala '" + org + "/" + name + ":" + version
                        + "' from Ballerina central");
                try {
                    pullModuleFromCentral(org, name, version);
                } catch (CentralClientException e) {
                    // Continue with the remaining packages; the compilation will surface the
                    // failure for this one through the regular error flow.
                    clientLogger.logTrace("Failed to pull bala '" + org + "/" + name + ":" + version
                            + "' from Ballerina central: " + e.getMessage());
                    continue;
                }
            }

            // Walk this bala's dependency graph to find the as-built versions it demands.
            for (Dependency dependency : readBalaDependencyGraph(balaVersionDir, clientLogger)) {
                workQueue.add(new String[]{dependency.getOrg(), dependency.getName(), dependency.getVersion()});
            }
        }
    }

    /**
     * Reads the package dependency graph recorded in a cached bala's {@code dependency-graph.json}.
     * A bala is extracted into {@code <org>/<name>/<version>/<platform>/}, so the platform
     * directory is located first.
     *
     * @param balaVersionDir the bala version directory in the local cache
     * @param clientLogger   the client logger
     * @return the packages recorded in the dependency graph, or an empty list if unreadable
     */
    private static List<Dependency> readBalaDependencyGraph(Path balaVersionDir, LSClientLogger clientLogger) {
        if (!Files.isDirectory(balaVersionDir)) {
            return List.of();
        }
        try (DirectoryStream<Path> platformDirs = Files.newDirectoryStream(balaVersionDir, Files::isDirectory)) {
            for (Path platformDir : platformDirs) {
                Path dependencyGraphJson = platformDir.resolve(ProjectConstants.DEPENDENCY_GRAPH_JSON);
                if (!Files.exists(dependencyGraphJson)) {
                    continue;
                }
                try (BufferedReader reader = Files.newBufferedReader(dependencyGraphJson)) {
                    DependencyGraphJson graph = new Gson().fromJson(reader, DependencyGraphJson.class);
                    if (graph != null && graph.getPackageDependencyGraph() != null) {
                        return graph.getPackageDependencyGraph();
                    }
                }
            }
        } catch (IOException | JsonSyntaxException e) {
            clientLogger.logTrace("Failed to read dependency graph of bala '" + balaVersionDir + "': "
                    + e.getMessage());
        }
        return List.of();
    }

    /**
     * Pulls the given package version directly from Ballerina central into the local bala cache.
     * This is the same download path used by `bal pull`.
     *
     * @param orgName     the organization name
     * @param packageName the package name
     * @param version     the exact package version to pull
     * @throws CentralClientException if the download fails
     */
    private static void pullModuleFromCentral(String orgName, String packageName, String version)
            throws CentralClientException {
        Path packagePathInBalaCache = RepoUtils.createAndGetHomeReposPath()
                .resolve(ProjectConstants.REPOSITORIES_DIR)
                .resolve(ProjectConstants.CENTRAL_REPOSITORY_CACHE_NAME)
                .resolve(ProjectConstants.BALA_DIR_NAME)
                .resolve(orgName)
                .resolve(packageName);
        Settings settings = RepoUtils.readSettings();
        CentralAPIClient client = new CentralAPIClient(RepoUtils.getRemoteRepoURL(),
                initializeProxy(settings.getProxy()), settings.getProxy().username(),
                settings.getProxy().password(), getAccessTokenOfCLI(settings),
                settings.getCentral().getConnectTimeout(),
                settings.getCentral().getReadTimeout(), settings.getCentral().getWriteTimeout(),
                settings.getCentral().getCallTimeout(), settings.getCentral().getMaxRetries());
        String supportedPlatform = Arrays.stream(JvmTarget.values())
                .map(JvmTarget::code)
                .collect(Collectors.joining(","));
        try {
            client.pullPackage(orgName, packageName, version, packagePathInBalaCache, supportedPlatform,
                    RepoUtils.getBallerinaVersion(), false);
        } catch (PackageAlreadyExistsException e) {
            // A concurrent pull has already fetched this bala. Treat it as a success.
        }
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String getCommand() {
        return COMMAND;
    }
}
