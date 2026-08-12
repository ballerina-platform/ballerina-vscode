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
import io.ballerina.projects.CompilationOptions;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.SingleFileProject;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;

import java.nio.file.Path;
import java.util.Optional;

/**
 * Resolves packages only from the local repositories the server was given, never contacting Ballerina Central.
 * <p>
 * A package that is not already available locally simply does not resolve. That is deliberate: it keeps resolution
 * deterministic and reproducible, and it makes a missing package a visible failure rather than a silent download.
 *
 * @since 1.7.0
 */
final class OfflinePackageResolver extends PackageResolver {

    @Override
    public boolean isOffline() {
        return true;
    }

    @Override
    public Optional<Package> resolvePackage(BuildProject sampleProject, String org, String name, String version,
                                            String repository) {
        ResolutionRequest request = ResolutionRequest.from(descriptor(org, name, version, repository));
        return resolved(resolverOf(sampleProject), request, true)
                .map(response -> response.resolvedPackage().project().sourceRoot())
                .flatMap(this::loadBala);
    }

    @Override
    public Optional<Package> resolvePackage(BuildProject sampleProject, String org, String name) {
        io.ballerina.projects.environment.PackageResolver resolver = resolverOf(sampleProject);
        Optional<PackageMetadataResponse> metadata = localMetadata(resolver, org, name);
        if (metadata.isEmpty()) {
            // Not in the local repositories, and there is no network fallback.
            return Optional.empty();
        }
        Optional<ResolutionResponse> response =
                resolved(resolver, ResolutionRequest.from(metadata.get().resolvedDescriptor()), true);
        return response
                .map(resolution -> resolution.resolvedPackage().project().sourceRoot())
                .flatMap(this::loadBala);
    }

    @Override
    public String latestVersion(BuildProject sampleProject, String org, String name) {
        try {
            return localMetadata(resolverOf(sampleProject), org, name)
                    .map(response -> response.resolvedDescriptor().version().toString())
                    .orElse(null);
        } catch (RuntimeException ignored) {
            // Treated the same as "not available locally".
            return null;
        }
    }

    @Override
    public Project loadSingleFileProject(Path path) {
        return SingleFileProject.load(path, BuildOptions.builder().setOffline(true).build());
    }

    @Override
    public Project loadBuildProject(Path projectRoot) {
        return BuildProject.load(projectRoot, BuildOptions.builder().setOffline(true).build());
    }

    @Override
    public PackageResolution resolution(Package pkg) {
        return pkg.getResolution(CompilationOptions.builder().setOffline(true).build());
    }

    @Override
    public void preResolve(Package pkg) {
        // Pin the resolution offline so a later compilation of this package cannot reach Central.
        pkg.getResolution(CompilationOptions.builder().setOffline(true).build());
    }
}
