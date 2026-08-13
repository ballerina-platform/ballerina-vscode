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

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.ProjectLoader;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;

import java.nio.file.Path;
import java.util.Collection;
import java.util.Collections;
import java.util.Optional;

/**
 * Resolves packages from the local repositories, falling back to Ballerina Central when a package is not available
 * locally. This is the production resolver.
 *
 * @since 1.7.0
 */
final class RemotePackageResolver extends PackageResolver {

    @Override
    public boolean isOffline() {
        return false;
    }

    @Override
    public Optional<Package> resolvePackage(BuildProject sampleProject, String org, String name, String version,
                                            String repository) {
        ResolutionRequest request = ResolutionRequest.from(descriptor(org, name, version, repository));
        return resolved(resolverOf(sampleProject), request, false)
                .map(response -> response.resolvedPackage().project().sourceRoot())
                .flatMap(this::loadBala);
    }

    @Override
    public Optional<Package> resolvePackage(BuildProject sampleProject, String org, String name) {
        io.ballerina.projects.environment.PackageResolver resolver = resolverOf(sampleProject);
        Optional<PackageMetadataResponse> metadata = localMetadata(resolver, org, name);
        PackageDescriptor packageDescriptor = metadata
                .map(PackageMetadataResponse::resolvedDescriptor)
                // Not known locally, so ask Central which version is current.
                .orElseGet(() -> descriptor(org, name, latestVersion(sampleProject, org, name), null));

        Collection<ResolutionResponse> responses = resolver.resolvePackages(
                Collections.singletonList(ResolutionRequest.from(packageDescriptor)),
                ResolutionOptions.builder().setOffline(false).build());
        Optional<ResolutionResponse> response = responses.stream().findFirst();
        if (response.isEmpty() || response.get().resolvedPackage() == null) {
            return Optional.empty();
        }
        return loadBala(response.get().resolvedPackage().project().sourceRoot());
    }

    @Override
    public String latestVersion(BuildProject sampleProject, String org, String name) {
        CentralAPI centralApi = RemoteCentral.getInstance();
        return centralApi.latestPackageVersion(org, name);
    }

    @Override
    public Project loadSingleFileProject(Path path) {
        return SingleFileProject.load(path);
    }

    @Override
    public Project loadBuildProject(Path projectRoot) {
        return BuildProject.load(projectRoot);
    }

    @Override
    public Project loadBalaProject(Path balaPath) {
        return ProjectLoader.loadProject(balaPath, balaEnvironment());
    }

    @Override
    public PackageResolution resolution(Package pkg) {
        return pkg.getResolution();
    }

    @Override
    public void preResolve(Package pkg) {
        // Nothing to pin: the package keeps its own inherited resolution.
    }
}
