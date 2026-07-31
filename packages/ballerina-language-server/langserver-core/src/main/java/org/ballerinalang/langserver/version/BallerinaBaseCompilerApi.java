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

import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.DiagnosticResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.ProjectException;
import io.ballerina.projects.ProjectKind;
import io.ballerina.projects.TomlDocument;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.ProjectLoader;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.projects.util.ProjectConstants;
import io.ballerina.projects.util.ProjectPaths;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.apache.commons.lang3.tuple.ImmutablePair;
import org.apache.commons.lang3.tuple.Pair;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.wso2.ballerinalang.compiler.tree.BLangPackage;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The base fallback implementation for the Ballerina Compiler API.
 * <p>
 * This implementation is used as a default when a version-specific implementation for the current Ballerina environment
 * cannot be found.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.BallerinaCompilerApi")
public class BallerinaBaseCompilerApi extends BallerinaCompilerApi {

    @Override
    public String getVersion() {
        return "2201.0.0";
    }

    @Override
    public boolean isNaturalExpressionBody(ExpressionFunctionBodyNode expressionFunctionBodyNode) {
        return false;
    }

    @Override
    public boolean isNaturalExpressionBodiedFunction(FunctionDefinitionNode functionDefNode) {
        return false;
    }

    @Override
    public boolean hasOptimizedDependencyCompilation(Project project) {
        return false;
    }

    @Override
    public Optional<TypeSymbol> getType(Types types, Document document, String typeName,
                                        Map<String, BLangPackage> packageMap) {
        return Optional.empty();
    }

    @Override
    public Optional<TypeSymbol> getType(Types types, Document document, String typeName) {
        return Optional.empty();
    }

    @Override
    public Optional<Project> getWorkspaceProject(Project project) {
        return Optional.empty();
    }

    @Override
    public boolean isWorkspaceProject(Project project) {
        return false;
    }

    @Override
    public Collection<Project> getWorkspaceDependents(Project workspaceProject, Project packageProject) {
        return Collections.emptyList();
    }

    @Override
    public List<Project> getWorkspaceProjectsInOrder(Project project) {
        return Collections.emptyList();
    }

    @Override
    public Project loadProject(Path path) {
        // Tests (ls.test.offline) force offline resolution so this load never pulls from Central; production keeps the
        // default (online) behaviour.
        if (CommonUtil.TEST_OFFLINE) {
            return createProject(path, BuildOptions.builder().setOffline(true).build());
        }
        return ProjectLoader.loadProject(path);
    }

    @Override
    public Project loadProject(Path path, BuildOptions buildOptions) {
        return createProject(path, buildOptions);
    }

    @Override
    public Project loadProject(Path path, ProjectEnvironmentBuilder environmentBuilder) {
        return ProjectLoader.loadProject(path, environmentBuilder);
    }

    @Override
    public boolean isWorkspaceProjectRoot(Path path) {
        return false;
    }

    @Override
    public Collection<Diagnostic> getDiagnostics(DiagnosticResult diagnosticResult) {
        return diagnosticResult.diagnostics(false);
    }

    @Override
    public List<Project> getWorkspaceProjects(Project project) {
        return Collections.emptyList();
    }

    @Override
    public Optional<TomlDocument> getWorkspaceToml(Project project) {
        return Optional.empty();
    }

    @Override
    public Optional<Project> updateWorkspaceToml(Project project, String content) {
        return Optional.empty();
    }

    private Project createProject(Path filePath, BuildOptions buildOptions) {
        Pair<ProjectKind, Path> projectKindAndProjectRootPair = computeProjectKindAndProjectRoot(filePath);
        ProjectKind projectKind = projectKindAndProjectRootPair.getLeft();
        Path projectRoot = projectKindAndProjectRootPair.getRight();
        try {
            Project project;
            if (projectKind == ProjectKind.BUILD_PROJECT) {
                project = BuildProject.load(projectRoot, buildOptions);

                // TODO: Remove this once https://github.com/ballerina-platform/ballerina-lang/issues/43972 is resolved
                // Save the dependencies.toml to resolve the inconsistencies issue in the subsequent builds
                if (BallerinaCompilerApi.getInstance().hasOptimizedDependencyCompilation(project)) {
                    BuildOptions newOptions = BuildOptions.builder()
                            .setOffline(CommonUtil.COMPILE_OFFLINE)
                            .setSticky(false)
                            .build();
                    project = BuildProject.load(projectRoot, newOptions);
                }
            } else if (projectKind == ProjectKind.SINGLE_FILE_PROJECT) {
                project = SingleFileProject.load(projectRoot, buildOptions);
            } else {
                // Projects other than single file and build will use the ProjectLoader.
                project = ProjectLoader.loadProject(projectRoot, buildOptions);
            }
            return project;
        } catch (ProjectException e) {
            //If there is an error the project crash status should be set.
            throw new ProjectException("failed to create project " +
                    filePath.toString(), e);
        }
    }

    private Pair<ProjectKind, Path> computeProjectKindAndProjectRoot(Path path) {
        if (ProjectPaths.isStandaloneBalFile(path)) {
            return new ImmutablePair<>(ProjectKind.SINGLE_FILE_PROJECT, path);
        }
        // Following is a temp fix to distinguish Bala and Build projects
        Path tomlPath = ProjectPaths.packageRoot(path).resolve(ProjectConstants.BALLERINA_TOML);
        if (Files.exists(tomlPath)) {
            return new ImmutablePair<>(ProjectKind.BUILD_PROJECT, ProjectPaths.packageRoot(path));
        }
        return new ImmutablePair<>(ProjectKind.BALA_PROJECT, ProjectPaths.packageRoot(path));
    }

}
