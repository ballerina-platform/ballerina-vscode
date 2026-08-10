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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.function.Function;

/**
 * Shared module traversal and category construction for workspace search results.
 *
 * @since 1.8.0
 */
final class WorkspaceModuleSearchUtils {

    private WorkspaceModuleSearchUtils() {
    }

    static ModuleItems buildPackageModules(Project currentProject, Project targetProject, Module currentModule,
                                           Function<ModuleContext, ModuleItems> itemBuilder) {
        Package targetPackage = targetProject.currentPackage();
        var compilation = PackageUtil.getCompilation(targetPackage);
        boolean currentPackage = currentProject.currentPackage().packageName().equals(targetPackage.packageName());
        List<Item> packageItems = new ArrayList<>();
        List<Item> auxiliaryItems = new ArrayList<>();
        List<Module> modules = new ArrayList<>(PackageModuleUtils.modules(targetPackage));
        modules.sort(Comparator.comparingInt(module -> currentPackage
                && module.moduleId().equals(currentModule.moduleId()) ? 0 : 1));

        for (Module module : modules) {
            boolean current = currentPackage && module.moduleId().equals(currentModule.moduleId());
            String relation = current ? PackageModuleUtils.CURRENT_MODULE
                    : currentPackage ? PackageModuleUtils.SAME_PACKAGE_MODULE
                    : PackageModuleUtils.WORKSPACE_PACKAGE_MODULE;
            ModuleItems moduleItems = itemBuilder.apply(new ModuleContext(
                    module, compilation.getSemanticModel(module.moduleId()), current, relation));
            boolean flatten = current || !currentPackage && module.isDefaultModule();
            addModuleItems(packageItems, moduleItems.items(), module, flatten);
            addModuleItems(auxiliaryItems, moduleItems.auxiliaryItems(), module, flatten);
        }
        return new ModuleItems(packageItems, auxiliaryItems);
    }

    private static void addModuleItems(List<Item> packageItems, List<Item> moduleItems, Module module,
                                       boolean flatten) {
        if (flatten) {
            packageItems.addAll(moduleItems);
        } else if (!moduleItems.isEmpty()) {
            packageItems.add(buildCategory(moduleLabel(module), moduleItems));
        }
    }

    private static String moduleLabel(Module module) {
        return PackageModuleUtils.fullModuleName(module)
                + (PackageModuleUtils.isGenerated(module) ? " (Generated)" : "");
    }

    private static Category buildCategory(String label, List<Item> items) {
        Category.Builder categoryBuilder = new Category.Builder(null);
        categoryBuilder.metadata().label(label).description("").keywords(List.of());
        return categoryBuilder.items(items).build();
    }

    record ModuleContext(Module module, SemanticModel semanticModel, boolean current, String relation) {
    }

    record ModuleItems(List<Item> items, List<Item> auxiliaryItems) {
    }
}
