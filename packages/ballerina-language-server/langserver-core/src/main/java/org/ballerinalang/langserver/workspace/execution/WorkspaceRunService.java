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

package org.ballerinalang.langserver.workspace.execution;

import io.ballerina.projects.DocumentId;
import io.ballerina.projects.JBallerinaBackend;
import io.ballerina.projects.JarLibrary;
import io.ballerina.projects.JarResolver;
import io.ballerina.projects.JvmTarget;
import io.ballerina.projects.Module;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.Diagnostic;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import org.ballerinalang.langserver.commons.CompilerCompilationGuard;
import org.ballerinalang.langserver.commons.workspace.RunContext;
import org.ballerinalang.langserver.commons.workspace.RunResult;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectService;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

import javax.annotation.Nonnull;

import static io.ballerina.runtime.api.constants.RuntimeConstants.MODULE_INIT_CLASS_NAME;

/**
 * Preserves the legacy {@link org.ballerinalang.langserver.commons.workspace.WorkspaceManager#run(RunContext)}
 * contract while execution internals are isolated behind the facade boundary.
 *
 * @since 1.7.0
 */
public final class WorkspaceRunService {
    private static final String USER_DIR = System.getProperty("user.dir");
    private static final String HEAP_DUMP_FLAG = "-XX:+HeapDumpOnOutOfMemoryError";
    private static final String HEAP_DUMP_PATH_FLAG = "-XX:HeapDumpPath=";
    private static final String DEBUG_ARGS = "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:";

    private final ProjectService projectService;
    private final ConcurrentHashMap<Path, Process> runningProcesses;
    private final ReentrantLock processLock;

    /**
     * Creates a workspace run service.
     *
     * @param projectService project service used to resolve workspace projects
     */
    public WorkspaceRunService(@Nonnull ProjectService projectService) {
        this.projectService = projectService;
        this.runningProcesses = new ConcurrentHashMap<>();
        this.processLock = new ReentrantLock();
    }

    /**
     * Runs a Ballerina project and returns the started process plus execution-gating diagnostics.
     *
     * @param context run context
     * @return run result containing the process when execution starts
     * @throws IOException when the child process cannot be started
     */
    public @Nonnull RunResult run(@Nonnull RunContext context) throws IOException {
        Project project = projectService.loadOrCreate(context.balSourcePath(), null);
        if (project == null) {
            return new RunResult(null, List.of());
        }

        processLock.lock();
        try {
            Path sourceRoot = project.sourceRoot().toAbsolutePath().normalize();
            if (!stopLocalProcess(sourceRoot)) {
                return new RunResult(null, List.of());
            }

            PackageCompilation compilation = packageCompilation(project);
            JBallerinaBackend backend = JBallerinaBackend.from(compilation, JvmTarget.JAVA_21, false);
            refreshProjectDocuments(project);
            List<Diagnostic> diagnostics = executionDiagnostics(project, backend);
            if (diagnostics.stream().anyMatch(d -> d.diagnosticInfo().severity() == DiagnosticSeverity.ERROR)) {
                return new RunResult(null, diagnostics);
            }

            Process process = startProcess(context, project, backend);
            runningProcesses.put(sourceRoot, process);
            return new RunResult(process, diagnostics);
        } finally {
            processLock.unlock();
        }
    }

    /**
     * Stops a running process for the project containing the given path.
     *
     * @param filePath source file or source root path
     * @return true when no process is running or the process is no longer alive
     */
    public boolean stop(@Nonnull Path filePath) {
        Path sourceRoot = sourceRoot(filePath);
        processLock.lock();
        try {
            return stopLocalProcess(sourceRoot);
        } finally {
            processLock.unlock();
        }
    }

    /**
     * Resolves the execution source root for a source path.
     *
     * @param filePath source file or source root path
     * @return normalized source root path
     */
    public @Nonnull Path sourceRoot(@Nonnull Path filePath) {
        Path normalized = filePath.toAbsolutePath().normalize();
        Optional<Project> project = Optional.empty();
        try {
            project = projectService.project(normalized);
        } catch (RuntimeException ignored) {
            // Use the path argument as the execution root when the project is not available.
        }
        if (project.isPresent()) {
            return project.get().sourceRoot().toAbsolutePath().normalize();
        }
        return runningProcesses.keySet().stream()
                .filter(root -> normalized.equals(root) || normalized.startsWith(root))
                .findFirst()
                .orElse(normalized);
    }

    private PackageCompilation packageCompilation(Project project) {
        return CompilerCompilationGuard.getCompilation(project.currentPackage());
    }

    private List<Diagnostic> executionDiagnostics(Project project, JBallerinaBackend backend) {
        List<Diagnostic> diagnostics = new ArrayList<>();
        diagnostics.addAll(backend.diagnosticResult().diagnostics(false));
        diagnostics.addAll(project.currentPackage().getBuildToolResolution().getDiagnosticList());
        return diagnostics;
    }

    private Process startProcess(RunContext context, Project project, JBallerinaBackend backend) throws IOException {
        List<String> commands = prepareExecutionCommands(context, project.currentPackage().getDefaultModule(),
                backend.jarResolver());
        ProcessBuilder processBuilder = new ProcessBuilder(commands);
        processBuilder.directory(project.sourceRoot().toFile());
        Map<String, String> env = context.env();
        if (env != null) {
            processBuilder.environment().putAll(env);
        }
        return processBuilder.start();
    }

    private List<String> prepareExecutionCommands(RunContext context, Module module, JarResolver jarResolver) {
        List<String> commands = new ArrayList<>();
        commands.add(context.javaCmd());
        commands.add(HEAP_DUMP_FLAG);
        commands.add(HEAP_DUMP_PATH_FLAG + USER_DIR);
        if (context.debugPort() != null && context.debugPort() > 0) {
            commands.add(DEBUG_ARGS + context.debugPort());
        }
        commands.add("-cp");
        commands.add(allClassPaths(jarResolver));
        commands.add(JarResolver.getQualifiedClassName(
                module.packageInstance().packageOrg().toString(),
                module.packageInstance().packageName().toString(),
                module.packageInstance().packageVersion().toString(),
                MODULE_INIT_CLASS_NAME));
        if (context.programArgs() != null) {
            commands.addAll(context.programArgs());
        }
        return commands;
    }

    private String allClassPaths(JarResolver jarResolver) {
        return jarResolver.getJarFilePathsRequiredForExecution().stream()
                .map(JarLibrary::path)
                .map(Path::toString)
                .collect(Collectors.joining(File.pathSeparator));
    }

    private void refreshProjectDocuments(Project project) {
        project.currentPackage().modules().forEach(module -> {
            for (DocumentId id : module.documentIds()) {
                module.document(id).modify().apply();
            }
        });
    }

    private boolean stopLocalProcess(Path sourceRoot) {
        Process process = runningProcesses.remove(sourceRoot);
        if (process == null) {
            return true;
        }
        process.toHandle().descendants().forEach(ProcessHandle::destroy);
        process.destroy();
        try {
            process.waitFor(2, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
        if (process.isAlive()) {
            process.toHandle().descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
        }
        return !process.isAlive();
    }
}
