/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package org.ballerinalang.langserver.version;

import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.DiagnosticResult;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.ProjectKind;
import io.ballerina.projects.TomlDocument;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.ProjectLoader;
import io.ballerina.projects.directory.WorkspaceProject;
import io.ballerina.projects.environment.PackageLockingMode;
import io.ballerina.projects.util.ProjectPaths;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.ballerinalang.annotation.JavaSPIService;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * Compiler API implementation for Ballerina 2201.13.0.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.BallerinaCompilerApi")
public class BallerinaU130CompilerApi extends BallerinaU123CompilerApi {

    @Override
    public String getVersion() {
        return "2201.13.0";
    }

    @Override
    public boolean isNaturalExpressionBody(ExpressionFunctionBodyNode expressionFunctionBodyNode) {
        return expressionFunctionBodyNode.expression().kind() == SyntaxKind.NATURAL_EXPRESSION;
    }

    @Override
    public boolean isNaturalExpressionBodiedFunction(FunctionDefinitionNode functionDefNode) {
        FunctionBodyNode functionBody = functionDefNode.functionBody();
        return functionBody.kind() == SyntaxKind.EXPRESSION_FUNCTION_BODY
                && ((ExpressionFunctionBodyNode) functionBody).expression().kind() == SyntaxKind.NATURAL_EXPRESSION;
    }

    @Override
    public Optional<Project> getWorkspaceProject(Project project) {
        return project.workspaceProject().map(wp -> wp);
    }

    @Override
    public boolean isWorkspaceProject(Project project) {
        return project.kind() == ProjectKind.WORKSPACE_PROJECT;
    }

    @Override
    public Collection<Project> getWorkspaceDependents(Project workspaceProject, Project packageProject) {
        if (!isWorkspaceProject(workspaceProject)) {
            return Collections.emptyList();
        }

        WorkspaceProject wsProject = (WorkspaceProject) workspaceProject;
        // Get all packages that depend on the given package
        Collection<BuildProject> dependents = wsProject.getResolution().dependencyGraph()
                .getAllDependents((BuildProject) packageProject);
        return new java.util.ArrayList<>(dependents);
    }

    @Override
    public List<Project> getWorkspaceProjectsInOrder(Project project) {
        if (!isWorkspaceProject(project)) {
            return Collections.emptyList();
        }

        WorkspaceProject workspaceProject = (WorkspaceProject) project;
        List<BuildProject> buildProjects = workspaceProject.getResolution().dependencyGraph()
                .toTopologicallySortedList();
        return new ArrayList<>(buildProjects);
    }

    @Override
    public Project loadProject(Path path) {
        return ProjectLoader.load(path).project();
    }

    @Override
    public Project loadProject(Path path, BuildOptions buildOptions) {
        return ProjectLoader.load(path, buildOptions).project();
    }

    @Override
    public Project loadProject(Path path, ProjectEnvironmentBuilder environmentBuilder) {
        return ProjectLoader.load(path, environmentBuilder).project();
    }

    @Override
    public boolean isWorkspaceProjectRoot(Path path) {
        return ProjectPaths.isWorkspaceProjectRoot(path);
    }

    @Override
    public BuildOptions getBalaBuildOptions(boolean offline) {
        // SOFT locking re-resolves a bala's baked transitives to what the local repositories hold, instead of
        // demanding the exact baked version, which is often not provisioned.
        return offline ? BuildOptions.builder().setOffline(true).setLockingMode(PackageLockingMode.SOFT).build()
                : super.getBalaBuildOptions(false);
    }

    @Override
    public Collection<Diagnostic> getDiagnostics(DiagnosticResult diagnosticResult) {
        return diagnosticResult.diagnostics(false, true);
    }

    @Override
    public List<Project> getWorkspaceProjects(Project project) {
        if (project instanceof WorkspaceProject workspaceProject) {
            List<BuildProject> buildProjects = workspaceProject.projects();
            return new ArrayList<>(buildProjects);
        }
        return Collections.emptyList();
    }

    @Override
    public Optional<TomlDocument> getWorkspaceToml(Project project) {
        if (project instanceof WorkspaceProject workspaceProject) {
            return Optional.of(workspaceProject.ballerinaToml().tomlDocument());
        }
        return Optional.empty();
    }

    @Override
    public Optional<Project> updateWorkspaceToml(Project project, String content) {
        if (project instanceof WorkspaceProject wsProject) {
            Project updatedProject = wsProject.ballerinaToml()
                    .modify()
                    .withContent(content)
                    .apply()
                    .project();
            return Optional.of(updatedProject);
        }
        return Optional.empty();
    }
}
