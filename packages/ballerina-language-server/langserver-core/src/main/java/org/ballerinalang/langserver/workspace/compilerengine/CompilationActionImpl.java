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
import io.ballerina.projects.CompilationOptions;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.Project;
import io.ballerina.projects.environment.PackageLockingMode;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.workspace.CompilerCompilationGuard;
import org.ballerinalang.langserver.workspace.compilerengine.recovery.ResolutionResult;
import org.ballerinalang.langserver.workspace.compilerengine.snapshot.StableSnapshot;
import org.ballerinalang.langserver.workspace.workspacemanager.LockingMode;
import org.ballerinalang.langserver.workspace.workspacemanager.ProjectServiceImpl;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.annotation.Nonnull;

/**
 * Concrete implementation of {@link CompilationPipeline.CompilationAction} that delegates
 * to ProjectService for project loading and snapshot building.
 *
 * @since 1.7.0
 */
public final class CompilationActionImpl implements CompilationPipeline.CompilationAction {
    private final ProjectServiceImpl projectService;
    public CompilationActionImpl(@Nonnull ProjectServiceImpl projectService) {
        this.projectService = projectService;
    }

    @Override
    public PackageDescriptor describe(String sourceRootIdentifier) {
        Project project = projectService.loadOrCreateFromIdentifier(sourceRootIdentifier, null);
        return project.currentPackage().descriptor();
    }

    @Override
    public ResolutionResult resolve(CompileTask task) {
        String sourceRootIdentifier = task.sourceRootIdentifier();
        try {
            Project project = projectService.loadOrCreateFromIdentifier(sourceRootIdentifier, null);
            LockingMode lockingMode = projectService.getLockingMode(project);
            PackageResolution resolution = CompilerCompilationGuard.getResolution(project.currentPackage(),
                    compilationOptions(lockingMode));
            List<ResolutionResult.ResolutionDiagnostic> diagnostics = BallerinaCompilerApi.getInstance()
                    .getDiagnostics(resolution.diagnosticResult()).stream()
                    .map(diagnostic -> new ResolutionResult.ResolutionDiagnostic(
                            severityOf(diagnostic),
                            diagnostic.message(),
                            sourceRootIdentifier))
                    .toList();
            boolean success = diagnostics.stream()
                    .noneMatch(diagnostic -> diagnostic.severity() == ResolutionResult.Severity.ERROR);
            return new ResolutionResult(task.descriptor(), diagnostics, success);
        } catch (RuntimeException e) {
            String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return new ResolutionResult(task.descriptor(), List.of(
                    new ResolutionResult.ResolutionDiagnostic(ResolutionResult.Severity.ERROR,
                            message, sourceRootIdentifier)), false);
        }
    }

    @Override
    public StableSnapshot compile(CompileTask task) {
        return snapshot(task, projectService.loadOrCreateFromIdentifier(task.sourceRootIdentifier(), null));
    }

    private StableSnapshot snapshot(CompileTask task, Project project) {
        if (task.isCancelled() || Thread.currentThread().isInterrupted()) {
            throw new java.util.concurrent.CancellationException(
                    "Compilation task cancelled before PackageCompilation");
        }
        PackageCompilation compilation = CompilerCompilationGuard.getCompilation(project.currentPackage());
        if (task.isCancelled() || Thread.currentThread().isInterrupted()) {
            throw new java.util.concurrent.CancellationException("Compilation task cancelled after PackageCompilation");
        }
        Map<DocumentId, SyntaxTree> syntaxTrees = new HashMap<>();
        Map<Path, DocumentId> pathToDocumentIds = new HashMap<>();
        Map<ModuleId, SemanticModel> semanticModels = new HashMap<>();
        boolean semanticModelsAvailable = semanticModelsAvailable(compilation);
        project.currentPackage().moduleIds().forEach(moduleId -> {
            if (task.isCancelled() || Thread.currentThread().isInterrupted()) {
                throw new java.util.concurrent.CancellationException(
                        "Compilation task cancelled before SemanticModel evaluation");
            }
            Module packageModule = project.currentPackage().module(moduleId);
            if (semanticModelsAvailable) {
                semanticModels.put(moduleId, compilation.getSemanticModel(moduleId));
            }
            packageModule.documentIds().forEach(docId -> project.documentPath(docId).ifPresent(path -> {
                syntaxTrees.put(docId, packageModule.document(docId).syntaxTree());
                pathToDocumentIds.put(path.toAbsolutePath().normalize(), docId);
            }));
            packageModule.testDocumentIds().forEach(docId -> project.documentPath(docId).ifPresent(path -> {
                syntaxTrees.put(docId, packageModule.document(docId).syntaxTree());
                pathToDocumentIds.put(path.toAbsolutePath().normalize(), docId);
            }));
        });
        if (syntaxTrees.isEmpty() || (semanticModelsAvailable && semanticModels.isEmpty())) {
            throw new RuntimeException("No source documents in project: " + project.sourceRoot());
        }
        return new StableSnapshot(syntaxTrees, pathToDocumentIds, semanticModels,
                compilation, task.contentVersion());
    }

    private boolean semanticModelsAvailable(PackageCompilation compilation) {
        return BallerinaCompilerApi.getInstance().getDiagnostics(compilation.diagnosticResult()).stream()
                .noneMatch(diagnostic -> DiagnosticErrorCode.CYCLIC_MODULE_IMPORTS_DETECTED.diagnosticId()
                        .equals(diagnostic.diagnosticInfo().code()));
    }

    private ResolutionResult.Severity severityOf(io.ballerina.tools.diagnostics.Diagnostic diagnostic) {
        return switch (diagnostic.diagnosticInfo().severity()) {
            case ERROR -> ResolutionResult.Severity.ERROR;
            case WARNING -> ResolutionResult.Severity.WARNING;
            default -> ResolutionResult.Severity.INFO;
        };
    }

    private CompilationOptions compilationOptions(LockingMode lockingMode) {
        return CompilationOptions.builder()
                .setOffline(CommonUtil.COMPILE_OFFLINE)
                .setLockingMode(PackageLockingMode.valueOf(lockingMode.name()))
                .build();
    }
}
