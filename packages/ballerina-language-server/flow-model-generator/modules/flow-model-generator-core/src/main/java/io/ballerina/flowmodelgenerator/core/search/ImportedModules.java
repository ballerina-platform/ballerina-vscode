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

package io.ballerina.flowmodelgenerator.core.search;

import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleDependency;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDependencyScope;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.WorkspaceProject;

import java.util.Collections;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

/**
 * Collects the modules the active package imports from outside itself, identified the way the search index
 * identifies them - by organization together with module name.
 *
 * <p>Dependencies are gathered from <b>every</b> module of the package rather than just the one the request position
 * happens to sit in, so a connector imported only by a submodule is still discoverable. Dependencies that resolve
 * back into the package itself or into a sibling of the same {@link WorkspaceProject} are excluded: those are already
 * surfaced under the current-integration/current-workspace categories, and treating them as imports would emit their
 * symbols twice.</p>
 *
 * @since 1.8.0
 */
final class ImportedModules {

    private ImportedModules() {
    }

    /**
     * Collects the imported modules of the given project's active package.
     *
     * @param project the project whose active package's imports are collected
     * @return an unmodifiable set of {@link ModuleCoordinate}s, sorted so results stay stable across compilations.
     * Organization is part of the identity rather than a value looked up by module name, so a project importing
     * same-named packages from two organizations keeps both.
     */
    static Set<ModuleCoordinate> collect(Project project) {
        Package currentPackage = project.currentPackage();
        PackageUtil.getCompilation(currentPackage);
        Set<ModuleCoordinate> importedModules = new TreeSet<>();
        for (Module module : PackageModuleUtils.modules(currentPackage)) {
            for (ModuleDependency moduleDependency : module.moduleDependencies()) {
                if (!isDefaultScope(moduleDependency) || isWorkspaceMember(project, currentPackage, moduleDependency)) {
                    continue;
                }
                importedModules.add(ModuleCoordinate.of(moduleDependency.descriptor().org().value(),
                        moduleDependency.descriptor().name()));
            }
        }
        return Collections.unmodifiableSet(importedModules);
    }

    /**
     * Non-default scopes (e.g. {@code testonly}) aren't real imports of the integration being built.
     */
    private static boolean isDefaultScope(ModuleDependency moduleDependency) {
        return moduleDependency.packageDependency().scope() == PackageDependencyScope.DEFAULT;
    }

    private static boolean isSamePackage(Package somePackage, ModuleDependency moduleDependency) {
        return moduleDependency.descriptor().org().value().equals(somePackage.packageOrg().value())
                && moduleDependency.descriptor().packageName().value().equals(somePackage.packageName().value());
    }

    /**
     * Returns whether the dependency resolves to the current package or to another package of the same workspace.
     */
    private static boolean isWorkspaceMember(Project project, Package currentPackage,
                                             ModuleDependency moduleDependency) {
        if (isSamePackage(currentPackage, moduleDependency)) {
            return true;
        }
        Optional<WorkspaceProject> workspaceProject = project.workspaceProject();
        if (workspaceProject.isEmpty()) {
            return false;
        }
        for (BuildProject siblingProject : workspaceProject.get().projects()) {
            if (isSamePackage(siblingProject.currentPackage(), moduleDependency)) {
                return true;
            }
        }
        return false;
    }
}
