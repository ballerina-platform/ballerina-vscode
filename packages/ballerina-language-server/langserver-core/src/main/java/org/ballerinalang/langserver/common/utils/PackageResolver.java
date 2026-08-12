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

package org.ballerinalang.langserver.common.utils;

import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectEnvironmentBuilder;
import io.ballerina.projects.bala.BalaProject;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;
import io.ballerina.projects.repos.TempDirCompilationCache;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;

import java.nio.file.Path;
import java.util.Collections;
import java.util.Optional;

/**
 * Resolves Ballerina packages on behalf of the language server.
 * <p>
 * There are two implementations. {@link RemotePackageResolver} may reach Ballerina Central;
 * {@link OfflinePackageResolver} resolves only from the local repositories the server was given. One of them is
 * installed once at startup by {@link #initialize(boolean)} and every caller goes through {@link #get()}, so no calling
 * code has to know which mode the server is in — adding a resolution path does not mean remembering the test setup.
 * <p>
 * The contract is deliberately expressed in {@code String} org/name/version rather than richer model types, so this
 * class stays free of dependencies on the modules that call it.
 *
 * @since 1.7.0
 */
public abstract class PackageResolver {

    // Seeded from the system property so an unconfigured server is already correct and nothing has to remember to
    // initialise it. Volatile because initialize() may run after other threads have started.
    private static volatile PackageResolver instance = create(Boolean.getBoolean("ls.test.offline"));

    /**
     * Installs the resolver for this server. Called once during startup.
     *
     * @param offline {@code true} to resolve without contacting Ballerina Central.
     */
    public static void initialize(boolean offline) {
        instance = create(offline);
    }

    /**
     * The resolver installed for this server.
     *
     * @return The active resolver.
     */
    public static PackageResolver get() {
        return instance;
    }

    private static PackageResolver create(boolean offline) {
        return offline ? new OfflinePackageResolver() : new RemotePackageResolver();
    }

    /**
     * Whether this resolver avoids Ballerina Central.
     *
     * @return {@code true} for the offline resolver.
     */
    public abstract boolean isOffline();

    /**
     * Resolves an exact package version.
     *
     * @param sampleProject Project supplying the resolution environment.
     * @param org           Package organization.
     * @param name          Package name.
     * @param version       Exact version to resolve.
     * @param repository     Repository to resolve from, or {@code null} for the default resolution.
     * @return The resolved package, if any.
     */
    public abstract Optional<Package> resolvePackage(BuildProject sampleProject, String org, String name,
                                                    String version, String repository);

    /**
     * Resolves a package without a version, choosing the version this resolver considers current.
     *
     * @param sampleProject Project supplying the resolution environment.
     * @param org           Package organization.
     * @param name          Package name.
     * @return The resolved package, if any.
     */
    public abstract Optional<Package> resolvePackage(BuildProject sampleProject, String org, String name);

    /**
     * The version this resolver considers current for a package.
     *
     * @param sampleProject Project supplying the resolution environment.
     * @param org           Package organization.
     * @param name          Package name.
     * @return The version, or {@code null} when none can be determined.
     */
    public abstract String latestVersion(BuildProject sampleProject, String org, String name);

    /**
     * Loads a standalone {@code .bal} file as a single file project.
     *
     * @param path Path to the file.
     * @return The loaded project.
     */
    public abstract Project loadSingleFileProject(Path path);

    /**
     * Loads a package directory as a build project.
     *
     * @param projectRoot Path to the package root.
     * @return The loaded project.
     */
    public abstract Project loadBuildProject(Path projectRoot);

    /**
     * Resolves a package's dependency graph.
     *
     * @param pkg The package.
     * @return The resolution.
     */
    public abstract PackageResolution resolution(Package pkg);

    /**
     * Pre-resolves a package so a later compilation reuses that resolution instead of resolving again. A no-op for
     * resolvers that have nothing to pin.
     *
     * @param pkg The package.
     */
    public abstract void preResolve(Package pkg);

    /**
     * Build options for loading an already resolved bala. The distribution-specific locking knob is owned by
     * {@link BallerinaCompilerApi} so this stays usable on distributions that predate it.
     *
     * @return The build options.
     */
    protected final BuildOptions balaBuildOptions() {
        return BallerinaCompilerApi.getInstance().getBalaBuildOptions(isOffline());
    }

    /**
     * Loads a resolved bala from disk.
     *
     * @param balaPath Path to the bala.
     * @return The package it contains, if any.
     */
    protected final Optional<Package> loadBala(Path balaPath) {
        ProjectEnvironmentBuilder defaultBuilder = ProjectEnvironmentBuilder.getDefaultBuilder();
        defaultBuilder.addCompilationCacheFactory(TempDirCompilationCache::from);
        BalaProject balaProject = BalaProject.loadProject(defaultBuilder, balaPath, balaBuildOptions());
        return Optional.ofNullable(balaProject.currentPackage());
    }

    /**
     * The resolution service of a project.
     *
     * @param project The project.
     * @return The service.
     */
    protected static io.ballerina.projects.environment.PackageResolver resolverOf(BuildProject project) {
        return project.projectEnvironmentContext()
                .getService(io.ballerina.projects.environment.PackageResolver.class);
    }

    /**
     * Builds a descriptor, optionally pinned to a repository.
     *
     * @param org        Package organization.
     * @param name       Package name.
     * @param version    Exact version, or {@code null}.
     * @param repository Repository name, or {@code null}.
     * @return The descriptor.
     */
    protected static PackageDescriptor descriptor(String org, String name, String version, String repository) {
        PackageOrg packageOrg = PackageOrg.from(org);
        PackageName packageName = PackageName.from(name);
        if (version == null) {
            return PackageDescriptor.from(packageOrg, packageName);
        }
        io.ballerina.projects.PackageVersion packageVersion = io.ballerina.projects.PackageVersion.from(version);
        return repository == null
                ? PackageDescriptor.from(packageOrg, packageName, packageVersion)
                : PackageDescriptor.from(packageOrg, packageName, packageVersion, repository);
    }

    /**
     * Resolves a request to a usable response.
     * <p>
     * Only a {@code RESOLVED} response is usable: {@code resolvePackages} can return a non-empty collection holding an
     * {@code UNRESOLVED} entry whose {@code resolvedPackage()} is {@code null}, which would otherwise slip past an
     * {@code isEmpty()} check and throw on {@code resolvedPackage().project()}.
     *
     * @param resolver The resolution service.
     * @param request  The request.
     * @param offline  Whether to forbid contacting Ballerina Central.
     * @return The resolved response, if any.
     */
    protected static Optional<ResolutionResponse> resolved(
            io.ballerina.projects.environment.PackageResolver resolver, ResolutionRequest request, boolean offline) {
        return resolver.resolvePackages(Collections.singletonList(request),
                        ResolutionOptions.builder().setOffline(offline).setSticky(false).build())
                .stream()
                .filter(response -> response.resolutionStatus() == ResolutionResponse.ResolutionStatus.RESOLVED)
                .findFirst();
    }

    /**
     * Looks up package metadata in the local repositories.
     *
     * @param resolver The resolution service.
     * @param org      Package organization.
     * @param name     Package name.
     * @return The metadata response when the package is known locally.
     */
    protected static Optional<PackageMetadataResponse> localMetadata(
            io.ballerina.projects.environment.PackageResolver resolver, String org, String name) {
        return resolver.resolvePackageMetadata(
                        Collections.singletonList(ResolutionRequest.from(descriptor(org, name, null, null))),
                        ResolutionOptions.builder().setOffline(true).build())
                .stream()
                .filter(response -> response.resolutionStatus() != ResolutionResponse.ResolutionStatus.UNRESOLVED)
                .findFirst();
    }
}
