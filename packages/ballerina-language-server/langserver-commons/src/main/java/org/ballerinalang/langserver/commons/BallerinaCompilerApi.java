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

package org.ballerinalang.langserver.commons;

import com.github.zafarkhaja.semver.Version;
import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.DiagnosticResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.TomlDocument;
import io.ballerina.tools.diagnostics.Diagnostic;
import org.wso2.ballerinalang.compiler.tree.BLangPackage;
import org.wso2.ballerinalang.util.RepoUtils;

import java.nio.file.Path;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.ServiceConfigurationError;
import java.util.ServiceLoader;

/**
 * Abstract class for the new Ballerina Compiler APIs.
 * <p>
 * This is an <strong>abstract class</strong> that follows the adapter pattern to handle different Ballerina compiler
 * API versions gracefully.
 * <p>
 * The {@link #initialize()} method must be called once during language server startup before calling
 * {@link #getInstance()}.
 * <p>
 * The best practice is to extend the class implementation of the previous version to only highlight the differences
 * (e.g., U13 should extend U12).
 * <p>
 * The implementation should be stateless and thread-safe, as the same instance is used across the language server.
 *
 * @since 1.0.0
 */
public abstract class BallerinaCompilerApi {

    private static final String DEFAULT_VERSION = "2201.0.0"; // Default version if no specific implementation is found
    private static BallerinaCompilerApi instance;

    /**
     * Initializes the adapter by loading the correct implementation for the Ballerina version. Must be called once at
     * startup.
     */
    public static void initialize() {
        ServiceLoader<BallerinaCompilerApi> serviceLoader = ServiceLoader.load(BallerinaCompilerApi.class);
        String ballerinaVersion = RepoUtils.getBallerinaPackVersion();

        // Ignore the pre-release suffix if present
        Version currentVersion = Version.valueOf(Version.valueOf(ballerinaVersion).getNormalVersion());

        // Find the best match for the current Ballerina version
        Version bestMatchVersion = null;
        BallerinaCompilerApi bestMatch = null;
        BallerinaCompilerApi defaultMatch = null;

        Iterator<BallerinaCompilerApi> serviceIterator = serviceLoader.iterator();
        while (true) {
            try {
                // The ServiceConfigurationError can be thrown if the service class cannot be instantiated.
                if (!serviceIterator.hasNext()) {
                    break;
                }
                BallerinaCompilerApi service = serviceIterator.next();

                // Fetch the version of this service implementation
                String serviceVersionString = service.getVersion();
                Version serviceVersion = Version.valueOf(serviceVersionString);

                // Check if this service version is <= current version
                if (serviceVersion.lessThanOrEqualTo(currentVersion)) {
                    // Keep track of the highest version that's still <= current version
                    if (bestMatch == null || serviceVersion.greaterThan(bestMatchVersion)) {
                        bestMatch = service;
                        bestMatchVersion = serviceVersion;
                    }
                }

                // Keep track of default version service as fallback
                if (defaultMatch == null && DEFAULT_VERSION.equals(serviceVersionString)) {
                    defaultMatch = service;
                }
            } catch (ServiceConfigurationError e) {
                // Skip services that fail to load (e.g., missing constructor, initialization errors)
                // and continue with the next service
            }
        }

        if (bestMatch != null) {
            instance = bestMatch;
        } else if (defaultMatch != null) {
            instance = defaultMatch;
        } else {
            throw new IllegalStateException("Implementation for BallerinaCompilerApi cannot be found.");
        }
    }

    /**
     * Gets the singleton instance, initializing it on first use.
     * <p>
     * {@link #initialize()} runs in the language server constructor, before any request thread is started, so the
     * instance is always resolved there. This fallback covers single-threaded entry points that skip that path (e.g.
     * the index generators), which is why it needs no locking.
     *
     * @return The singleton instance of BallerinaCompilerApi.
     * @throws IllegalStateException if no implementation can be found.
     */
    public static BallerinaCompilerApi getInstance() {
        if (instance == null) {
            initialize();
        }
        return instance;
    }

    /**
     * Gets the Ballerina version for this implementation.
     *
     * @return The version string.
     */
    public abstract String getVersion();

    /**
     * Checks if the node is a natural expression body.
     *
     * @param expressionFunctionBodyNode The node to check.
     * @return {@code true} if it is a natural expression body.
     */
    public abstract boolean isNaturalExpressionBody(ExpressionFunctionBodyNode expressionFunctionBodyNode);

    /**
     * Checks if the function has a natural expression body.
     *
     * @param functionDefNode The function node to check.
     * @return {@code true} if the function has a natural expression body.
     */
    public abstract boolean isNaturalExpressionBodiedFunction(FunctionDefinitionNode functionDefNode);

    /**
     * Checks if the project has optimized dependency compilation enabled.
     *
     * @param project The project to check.
     * @return {@code true} if optimized dependency compilation is enabled.
     */
    public abstract boolean hasOptimizedDependencyCompilation(Project project);

    /**
     * Gets a type symbol from the semantic model by type name and package mapping.
     *
     * @param types      The types in the semantic model.
     * @param document   The document context.
     * @param typeName   The name of the type to retrieve.
     * @param packageMap The mapping of package prefixes to BLangPackage instances.
     * @return An Optional containing the TypeSymbol if found.
     */
    public abstract Optional<TypeSymbol> getType(Types types, Document document, String typeName,
                                                 Map<String, BLangPackage> packageMap);

    /**
     * Gets a type symbol from the semantic model by type name.
     *
     * @param types    The types in the semantic model.
     * @param document The document context.
     * @param typeName The name of the type to retrieve.
     * @return An Optional containing the TypeSymbol if found.
     */
    public abstract Optional<TypeSymbol> getType(Types types, Document document, String typeName);

    /**
     * Gets the workspace project from a package project if it belongs to a workspace.
     *
     * @param project The package project.
     * @return An Optional containing the workspace project if the package belongs to a workspace.
     */
    public abstract Optional<Project> getWorkspaceProject(Project project);

    /**
     * Checks if the given project is a workspace project.
     *
     * @param project The project to check.
     * @return {@code true} if the project is a workspace project, {@code false} otherwise.
     */
    public abstract boolean isWorkspaceProject(Project project);

    /**
     * Gets all dependent packages in a workspace for a given package.
     *
     * @param workspaceProject The workspace project.
     * @param packageProject   The package project within the workspace.
     * @return A collection of dependent projects, or empty if not in a workspace.
     */
    public abstract Collection<Project> getWorkspaceDependents(Project workspaceProject, Project packageProject);

    /**
     * Gets all workspace packages in topological order.
     *
     * @param project The workspace project.
     * @return A list of projects in topological order, or empty if not a workspace project.
     */
    public abstract List<Project> getWorkspaceProjectsInOrder(Project project);

    /**
     * Gets all projects in a workspace.
     *
     * @param project The workspace project.
     * @return A list of all build projects in the workspace, or empty if not a workspace project.
     */
    public abstract List<Project> getWorkspaceProjects(Project project);

    /**
     * Gets the Ballerina.toml for a workspace project.
     *
     * @param project The workspace project.
     * @return An Optional containing the TomlDocument if the project is a workspace project with a Ballerina.toml.
     */
    public abstract Optional<TomlDocument> getWorkspaceToml(Project project);

    /**
     * Loads a project from the given path using the appropriate ProjectLoader API.
     *
     * @param path The path to the project root.
     * @return The loaded project.
     */
    public abstract Project loadProject(Path path);

    /**
     * Loads a project from the given path with build options.
     * <p>
     * The API signature changed between versions. This method abstracts that difference.
     *
     * @param path         The path to the project root.
     * @param buildOptions The build options.
     * @return The loaded project.
     */
    public abstract Project loadProject(Path path, BuildOptions buildOptions);

    /**
     * Gets the build options to use when loading an already resolved bala.
     * <p>
     * How a bala's baked transitive versions are re-resolved is expressed differently across versions
     * ({@code PackageLockingMode} only exists from 2201.13.0), so the knob is chosen here rather than by the caller.
     * Concrete on purpose: implementations compiled against an earlier version of this SPI keep working and inherit
     * the pre-2201.13.0 behaviour.
     *
     * @param offline {@code true} to load without contacting Ballerina Central, re-resolving transitives to whatever
     *                the local repositories hold; {@code false} for the default sticky behaviour.
     * @return The build options to pass to {@code BalaProject.loadProject}.
     */
    public BuildOptions getBalaBuildOptions(boolean offline) {
        // PackageLockingMode only exists from 2201.13.0; sticky = false is the equivalent knob before it.
        return offline ? BuildOptions.builder().setOffline(true).setSticky(false).build()
                : BuildOptions.builder().setSticky(true).build();
    }

    /**
     * Loads a project from the given path with custom project environment builder.
     *
     * @param path               The path to the project root.
     * @param environmentBuilder The project environment builder.
     * @return The loaded project.
     */
    public abstract Project loadProject(Path path, ProjectEnvironmentBuilder environmentBuilder);

    /**
     * Checks if the given path is a workspace project root.
     *
     * @param path The path to check.
     * @return {@code true} if the path is a workspace project root, {@code false} otherwise.
     */
    public abstract boolean isWorkspaceProjectRoot(Path path);

    /**
     * Gets diagnostics from a diagnostic result after hiding the diagnostics from the dependencies.
     *
     * @param diagnosticResult The diagnostic result from a package compilation.
     * @return A collection of diagnostics.
     */
    public abstract Collection<Diagnostic> getDiagnostics(DiagnosticResult diagnosticResult);

    /**
     * Updates the workspace Ballerina.toml with new content and reloads all workspace packages.
     *
     * @param project The workspace project.
     * @param content The new content for the workspace Ballerina.toml.
     * @return An Optional containing the updated workspace project with all packages reloaded, or Optional.empty() if
     * the operation is not supported or the project is not a workspace project.
     */
    public abstract Optional<Project> updateWorkspaceToml(Project project, String content);
}
