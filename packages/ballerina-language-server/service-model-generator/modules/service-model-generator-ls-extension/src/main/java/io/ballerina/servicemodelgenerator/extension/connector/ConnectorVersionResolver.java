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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.projects.DependencyManifest;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageManifest;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.PackageResolution;
import io.ballerina.projects.Project;
import io.ballerina.projects.ResolvedPackageDependency;

import java.util.Optional;

/**
 * Resolves which version of a connector a schema-driven add flow should be modelled against: if the
 * project already depends on the connector, its resolved version wins over the client-requested one,
 * since modelling the newest could emit source against types the project's version does not have.
 *
 * @since 1.9.0
 */
public final class ConnectorVersionResolver {

    private ConnectorVersionResolver() {
    }

    /**
     * The version to model {@code orgName/packageName} against: the version the project already
     * resolves for it, else {@code requestedVersion}, else {@code null} (leaving the caller on the
     * newest variant).
     */
    public static String resolve(Project project, String orgName, String packageName, String requestedVersion) {
        String resolved = resolvedProjectVersion(project, orgName, packageName);
        return resolved != null ? resolved : requestedVersion;
    }

    /**
     * The version of {@code orgName/packageName} this project resolves, or {@code null} when it does
     * not depend on it. Checked in descending authority: locked {@code Dependencies.toml}, then the
     * explicit {@code Ballerina.toml} pin (consulted before the graph since offline resolution can
     * silently substitute an uncached pinned version), then the resolved dependency graph.
     */
    private static String resolvedProjectVersion(Project project, String orgName, String packageName) {
        if (project == null || orgName == null || packageName == null) {
            return null;
        }
        try {
            Package currentPackage = project.currentPackage();
            DependencyManifest dependencyManifest = currentPackage.dependencyManifest();
            if (dependencyManifest != null) {
                Optional<String> locked = dependencyManifest
                        .dependency(PackageOrg.from(orgName), PackageName.from(packageName))
                        .map(dependency -> dependency.version().value().toString());
                if (locked.isPresent()) {
                    return locked.get();
                }
            }
            String pinned = fromPackageManifest(currentPackage, orgName, packageName);
            return pinned != null ? pinned : fromDependencyGraph(currentPackage, orgName, packageName);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** The version declared for the package by a {@code Ballerina.toml} {@code [[dependency]]} entry. */
    private static String fromPackageManifest(Package currentPackage, String orgName, String packageName) {
        PackageManifest manifest = currentPackage.manifest();
        if (manifest == null || manifest.dependencies() == null) {
            return null;
        }
        for (PackageManifest.Dependency dependency : manifest.dependencies()) {
            if (orgName.equals(dependency.org().value()) && packageName.equals(dependency.name().value())
                    && dependency.version() != null) {
                return dependency.version().value().toString();
            }
        }
        return null;
    }

    private static String fromDependencyGraph(Package currentPackage, String orgName, String packageName) {
        PackageResolution resolution = currentPackage.getResolution();
        if (resolution == null || resolution.dependencyGraph() == null) {
            return null;
        }
        for (ResolvedPackageDependency dependency : resolution.dependencyGraph().getNodes()) {
            Package dependencyPackage = dependency.packageInstance();
            if (dependencyPackage == null) {
                continue;
            }
            if (orgName.equals(dependencyPackage.packageOrg().value())
                    && packageName.equals(dependencyPackage.packageName().value())) {
                return dependencyPackage.packageVersion().value().toString();
            }
        }
        return null;
    }
}
