/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.modelgenerator.commons;

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageVersion;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.bala.BalaProject;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.PackageResolver;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;
import io.ballerina.projects.repos.TempDirCompilationCache;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.MessageType;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Utility class that contains methods to perform package-related operations.
 *
 * @since 1.0.0
 */
public class PackageUtil {

    private static final String BALLERINA_HOME_PROPERTY = "ballerina.home";
    private static final BuildProject SAMPLE_PROJECT = getSampleProject();

    private static final String PULLING_THE_MODULE_MESSAGE = "Pulling the module '%s' from the central";
    private static final String MODULE_PULLING_FAILED_MESSAGE = "Failed to pull the module: %s";
    private static final String MODULE_PULLING_SUCCESS_MESSAGE = "Successfully pulled the module: %s";

    // Concurrent map to store locks for each project
    private static final ConcurrentHashMap<Path, ReentrantLock> PROJECT_LOCKS = new ConcurrentHashMap<>();

    public static BuildProject getSampleProject() {
        // Obtain the Ballerina distribution path
        String ballerinaHome = System.getProperty(BALLERINA_HOME_PROPERTY);
        if (ballerinaHome == null || ballerinaHome.isEmpty()) {
            Path currentPath = getPath(Paths.get(
                    PackageUtil.class.getProtectionDomain().getCodeSource().getLocation().getPath()));
            Path distributionPath = getParentPath(getParentPath(getParentPath(currentPath)));
            System.setProperty(BALLERINA_HOME_PROPERTY, distributionPath.toString());
        }

        try {
            // Create a temporary directory
            Path tempDir = Files.createTempDirectory("ballerina-sample");

            // Create an empty main.bal file
            Path mainBalFile = tempDir.resolve("main.bal");
            Files.createFile(mainBalFile);

            // Create Ballerina.toml file with the specified content
            Path ballerinaTomlFile = tempDir.resolve("Ballerina.toml");
            String tomlContent = "[package]\n" +
                    "org = \"wso2\"\n" +
                    "name = \"sample\"\n" +
                    "version = \"0.1.0\"\n" +
                    "distribution = \"2201.12.0\"";
            Files.writeString(ballerinaTomlFile, tomlContent, StandardOpenOption.CREATE);
            return BuildProject.load(tempDir);
        } catch (IOException e) {
            throw new RuntimeException("Error occurred while creating the sample project", e);
        }
    }

    /**
     * Retrieves the semantic model for a given package identified by organization, name, and version.
     *
     * @param moduleInfo The module information
     * @return An Optional containing the semantic model.
     */
    public static Optional<SemanticModel> getSemanticModel(ModuleInfo moduleInfo) {
        Optional<Package> modulePackage = getModulePackage(getSampleProject(), moduleInfo.org(),
                moduleInfo.packageName(), moduleInfo.version());
        if (modulePackage.isEmpty()) {
            return Optional.empty();
        }
        Package pkg = modulePackage.get();
        for (Module module : pkg.modules()) {
            if (module.moduleName().toString().equals(moduleInfo.moduleName())) {
                return Optional.of(getCompilation(pkg).getSemanticModel(module.moduleId()));
            }
        }
        return Optional.empty();
    }

    public static Optional<SemanticModel> getSemanticModel(String org, String name) {
        return getModulePackage(getSampleProject(), org, name).map(
                pkg -> getCompilation(pkg).getSemanticModel(pkg.getDefaultModule().moduleId()));
    }

    /**
     * Retrieves a package matching the specified organization, name, and version. If the package is not found in the
     * local cache, it attempts to fetch it from the remote repository.
     *
     * @param buildProject The build project context
     * @param org          The organization name of the package
     * @param name         The name of the package
     * @param version      The version of the package
     * @return An Optional containing the matching Package if found, empty Optional otherwise
     */
    public static Optional<Package> getModulePackage(BuildProject buildProject, String org, String name,
                                                     String version) {
        ResolutionRequest resolutionRequest = ResolutionRequest.from(
                PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name), PackageVersion.from(version)));

        Collection<ResolutionResponse> resolutionResponses =
                buildProject.projectEnvironmentContext().getService(PackageResolver.class)
                        .resolvePackages(Collections.singletonList(resolutionRequest),
                                ResolutionOptions.builder().setOffline(false).setSticky(false).build());
        Optional<ResolutionResponse> resolutionResponse = resolutionResponses.stream().findFirst();
        if (resolutionResponse.isEmpty()) {
            return Optional.empty();
        }

        Path balaPath = resolutionResponse.get().resolvedPackage().project().sourceRoot();
        ProjectEnvironmentBuilder defaultBuilder = ProjectEnvironmentBuilder.getDefaultBuilder();
        defaultBuilder.addCompilationCacheFactory(TempDirCompilationCache::from);
        BalaProject balaProject = BalaProject.loadProject(defaultBuilder, balaPath);
        return Optional.ofNullable(balaProject.currentPackage());
    }

    public static Optional<Package> getModulePackage(BuildProject buildProject, String org, String name) {
        ResolutionRequest resolutionRequest = ResolutionRequest.from(
                PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name)));
        PackageResolver packageResolver = buildProject.projectEnvironmentContext().getService(PackageResolver.class);
        Collection<PackageMetadataResponse> packageMetadataResponses = packageResolver.resolvePackageMetadata(
                Collections.singletonList(resolutionRequest),
                ResolutionOptions.builder().setOffline(true).build());
        Optional<PackageMetadataResponse> pkgMetadata = packageMetadataResponses.stream().findFirst();
        PackageDescriptor packageDescriptor;
        if (pkgMetadata.isEmpty() ||
                pkgMetadata.get().resolutionStatus() == ResolutionResponse.ResolutionStatus.UNRESOLVED) {
            // If the package metadata is not found locally, fetch the latest version from the central repository
            CentralAPI centralApi = RemoteCentral.getInstance();
            String version = centralApi.latestPackageVersion(org, name);
            packageDescriptor = PackageDescriptor.from(
                    PackageOrg.from(org), PackageName.from(name), PackageVersion.from(version));
        } else {
            packageDescriptor = pkgMetadata.get().resolvedDescriptor();
        }

        Collection<ResolutionResponse> resolutionResponses = packageResolver.resolvePackages(
                Collections.singletonList(ResolutionRequest.from(packageDescriptor)),
                ResolutionOptions.builder().setOffline(false).build());
        Optional<ResolutionResponse> resolutionResponse = resolutionResponses.stream().findFirst();
        if (resolutionResponse.isEmpty()) {
            return Optional.empty();
        }

        Path balaPath = resolutionResponse.get().resolvedPackage().project().sourceRoot();
        ProjectEnvironmentBuilder defaultBuilder = ProjectEnvironmentBuilder.getDefaultBuilder();
        defaultBuilder.addCompilationCacheFactory(TempDirCompilationCache::from);
        BalaProject balaProject = BalaProject.loadProject(defaultBuilder, balaPath);
        return Optional.ofNullable(balaProject.currentPackage());
    }

    public static boolean isModuleUnresolved(String org, String name, String version) {
        ResolutionRequest resolutionRequest = ResolutionRequest.from(
                PackageDescriptor.from(PackageOrg.from(org), PackageName.from(name), PackageVersion.from(version)));
        PackageResolver packageResolver = SAMPLE_PROJECT.projectEnvironmentContext().getService(PackageResolver.class);
        return packageResolver.resolvePackageMetadata(Collections.singletonList(resolutionRequest),
                        ResolutionOptions.builder().setOffline(true).build()).stream()
                .findFirst()
                .map(response -> response.resolutionStatus() == ResolutionResponse.ResolutionStatus.UNRESOLVED)
                .orElse(false);
    }

    private static Path getPath(Path path) {
        return Objects.requireNonNull(path, "Path cannot be null");
    }

    private static Path getParentPath(Path path) {
        return Objects.requireNonNull(path, "Path cannot be null").getParent();
    }

    /**
     * Load the project from the given file path.
     *
     * @param workspaceManager the workspace manager
     * @param filePath         the file path
     * @return the loaded project
     */
    public static Project loadProject(WorkspaceManager workspaceManager, Path filePath) {
        try {
            return workspaceManager.loadProject(filePath);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            throw new RuntimeException("Error loading project: " + e.getMessage());
        }
    }

    /**
     * Retrieves the semantic model of the default module of a package if the package details match the provided
     * organization, package name, and version.
     *
     * @param workspaceManager the workspace manager used to load the project
     * @param filePath         the path to the file from which the project should be loaded
     * @param orgName          the organization name that must match the package descriptor's organization value
     * @param packageName      the package name that must match the package descriptor's name value
     * @param modulePartName   the module part name that must match the package descriptor's submodule part name value
     * @param version          the version that must match the package descriptor's version value
     * @return an Optional containing the semantic model
     */
    public static Optional<SemanticModel> getSemanticModelIfMatched(WorkspaceManager workspaceManager, Path filePath,
                                                                    String orgName, String packageName,
                                                                    String modulePartName,
                                                                    String version) {
        try {
            Project project = workspaceManager.loadProject(filePath);
            Package currentPackage = project.currentPackage();
            PackageDescriptor descriptor = currentPackage.descriptor();
            if (descriptor.org().value().equals(orgName) &&
                    descriptor.name().value().equals(packageName) &&
                    descriptor.version().value().toString().equals(version)) {
                ModuleId moduleId = currentPackage.getDefaultModule().moduleId();
                if (Objects.nonNull(modulePartName) && !modulePartName.isEmpty()
                        && !packageName.equals(modulePartName)) {
                    ModuleName subModuleName = ModuleName.from(PackageName.from(packageName), modulePartName);
                    Module module = currentPackage.module(subModuleName);
                    if (module == null) {
                        for (Module mod : currentPackage.modules()) {
                            if (mod.moduleName().toString().equals(modulePartName)) {
                                module = mod;
                                break;
                            }
                        }
                        if (module == null) {
                            return Optional.empty();
                        }
                    }
                    moduleId = module.moduleId();
                }
                return Optional.of(PackageUtil.getCompilation(currentPackage).getSemanticModel(moduleId));
            }
        } catch (WorkspaceDocumentException | EventSyncException e) {
        }
        return Optional.empty();
    }

    /**
     * Retrieves the semantic model for a package from sibling projects within the same workspace.
     *
     * @param project     the current project used to find the workspace
     * @param org         the organization name of the target package
     * @param packageName the package name of the target package
     * @param moduleName  the module name of the target package
     * @return an Optional containing the semantic model if a matching sibling project is found
     */
    public static Optional<SemanticModel> getSemanticModelFromWorkspace(Project project, String org,
                                                                        String packageName, String moduleName) {
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
        if (workspaceProject.isEmpty()) {
            return Optional.empty();
        }
        List<Project> childProjects = compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get());
        for (Project childProject : childProjects) {
            Package currentPackage = childProject.currentPackage();
            String currentPackageName = currentPackage.packageName().value();
            boolean orgMatches = currentPackage.packageOrg().value().equals(org);
            boolean nameMatches = currentPackageName.equals(packageName) || currentPackageName.equals(moduleName);
            if (!orgMatches || !nameMatches) {
                continue;
            }

            ModuleId moduleId = currentPackage.getDefaultModule().moduleId();
            if (moduleName == null || moduleName.isEmpty() || packageName.equals(moduleName)) {
                return Optional.of(getCompilation(childProject).getSemanticModel(moduleId));
            }
            for (Module mod : currentPackage.modules()) {
                if (mod.moduleName().toString().equals(moduleName)) {
                    moduleId = mod.moduleId();
                    break;
                }
            }
            return Optional.of(getCompilation(childProject).getSemanticModel(moduleId));
        }
        return Optional.empty();
    }

    /**
     * Finds a workspace-sibling package matching the given org and package/module name.
     * <p>
     * Use this to skip a Central round-trip when the target package lives next door in the same
     * workspace. The match accepts either {@code packageName} or {@code moduleName} on the sibling's
     * package name so callers can pass whichever they have.
     *
     * @param project     the current project used to discover the workspace
     * @param org         the target package's organization
     * @param packageName the target package name (may be {@code null} if only {@code moduleName} is known)
     * @param moduleName  the target module name (may be {@code null} if only {@code packageName} is known)
     * @return the matching workspace sibling's {@link Package}, or empty if none found / not in a workspace
     */
    public static Optional<Package> findWorkspacePackage(Project project, String org, String packageName,
                                                         String moduleName) {
        if (project == null || org == null) {
            return Optional.empty();
        }
        try {
            BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
            Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
            if (workspaceProject.isEmpty()) {
                return Optional.empty();
            }
            for (Project childProject : compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get())) {
                Package currentPackage = childProject.currentPackage();
                String currentPackageName = currentPackage.packageName().value();
                if (currentPackage.packageOrg().value().equals(org)
                        && (currentPackageName.equals(packageName) || currentPackageName.equals(moduleName))) {
                    return Optional.of(currentPackage);
                }
            }
        } catch (Throwable t) {
            // Best-effort: callers fall back to Central resolution.
        }
        return Optional.empty();
    }

    public static ModuleInfo fetchVersionIfNotExists(ModuleInfo moduleInfo) {
        if (moduleInfo.version() == null) {
            CentralAPI centralApi = RemoteCentral.getInstance();
            return new ModuleInfo(moduleInfo.org(), moduleInfo.packageName(), moduleInfo.moduleName(),
                    centralApi.latestPackageVersion(moduleInfo.org(), moduleInfo.packageName()));
        }
        return moduleInfo;
    }

    public static Optional<Package> pullModuleAndNotify(LSClientLogger lsClientLogger, ModuleInfo moduleInfo) {
        ModuleInfo completeModuleInfo = fetchVersionIfNotExists(moduleInfo);
        Optional<Package> modulePackage;
        if (PackageUtil.isModuleUnresolved(completeModuleInfo.org(), completeModuleInfo.packageName(),
                completeModuleInfo.version())) {
            notifyClient(lsClientLogger, completeModuleInfo, MessageType.Info, PULLING_THE_MODULE_MESSAGE);
            modulePackage = getModulePackage(SAMPLE_PROJECT, completeModuleInfo.org(), completeModuleInfo.packageName(),
                    completeModuleInfo.version());
            if (modulePackage.isEmpty()) {
                notifyClient(lsClientLogger, completeModuleInfo, MessageType.Error, MODULE_PULLING_FAILED_MESSAGE);
            } else {
                notifyClient(lsClientLogger, completeModuleInfo, MessageType.Info, MODULE_PULLING_SUCCESS_MESSAGE);
            }
        } else {
            modulePackage = getModulePackage(SAMPLE_PROJECT, completeModuleInfo.org(), completeModuleInfo.packageName(),
                    completeModuleInfo.version());
        }
        return modulePackage;
    }

    private static void notifyClient(LSClientLogger lsClientLogger, ModuleInfo moduleInfo, MessageType messageType,
                                     String message) {
        if (lsClientLogger != null) {
            String signature =
                    String.format("%s/%s:%s", moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
            lsClientLogger.notifyClient(messageType, String.format(message, signature));
        }
    }

    /**
     * Safely retrieves compilation from a project using a lock to ensure thread safety.
     *
     * @param balPackage The package from which to retrieve the compilation
     * @return The compilation of the project
     */
    public static PackageCompilation getCompilation(Package balPackage) {
        Path id = balPackage.project().sourceRoot();
        ReentrantLock lock = PROJECT_LOCKS.computeIfAbsent(id, k -> new ReentrantLock());
        lock.lock();
        try {
            return balPackage.getCompilation();
        } finally {
            lock.unlock();
        }
    }

    public static PackageCompilation getCompilation(Project project) {
        return getCompilation(project.currentPackage());
    }

    /**
     * Safely resolves a module package with error handling for cases where packages don't exist in Central.
     * This utility method encapsulates the common pattern of trying to resolve a package and falling back
     * to an empty Optional if resolution fails.
     *
     * @param org         The organization name of the package
     * @param packageName The name of the package
     * @return An Optional containing the resolved Package if successful, empty Optional if resolution fails
     */
    public static Optional<Package> resolveModulePackage(String org, String packageName, String version) {
        try {
            if (version == null) {
                return getModulePackage(getSampleProject(), org, packageName);
            } else {
                return getModulePackage(getSampleProject(), org, packageName, version);
            }
        } catch (Exception e) {
            // If package resolution fails (e.g., package doesn't exist in Central),
            // treat it as a generated/test package and continue with empty resolved package
            return Optional.empty();
        }
    }

    /**
     * Determines if a function is local to the current workspace project.
     *
     * @param workspaceManager The workspace manager
     * @param filePath         The path to the current file
     * @param org              The organization name
     * @param moduleName       The module name
     * @return true if the function is local to the current project, false otherwise
     */
    public static boolean isLocalFunction(WorkspaceManager workspaceManager, Path filePath, String org,
                                          String moduleName) {
        if (org == null || moduleName == null) {
            return false;
        }
        try {
            Project project = workspaceManager.loadProject(filePath);
            PackageDescriptor descriptor = project.currentPackage().descriptor();
            String packageOrg = descriptor.org().value();
            String packageName = descriptor.name().value();

            return packageOrg.equals(org) && packageName.equals(moduleName);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return false;
        }
    }
}
