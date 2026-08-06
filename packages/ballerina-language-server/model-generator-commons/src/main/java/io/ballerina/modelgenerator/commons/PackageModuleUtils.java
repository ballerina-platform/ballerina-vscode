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

package io.ballerina.modelgenerator.commons;

import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;

import java.nio.file.Path;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.WeakHashMap;
import java.util.stream.StreamSupport;

/**
 * Shared package-module discovery and classification helpers.
 *
 * @since 1.8.0
 */
public final class PackageModuleUtils {

    public static final String CURRENT_MODULE = "CURRENT_MODULE";
    public static final String SAME_PACKAGE_MODULE = "SAME_PACKAGE_MODULE";
    public static final String WORKSPACE_PACKAGE_MODULE = "WORKSPACE_PACKAGE_MODULE";
    public static final String DEFAULT_MODULE = "DEFAULT_MODULE";
    public static final String SUBMODULE = "SUBMODULE";

    private static final Map<ModuleId, SourceKind> SOURCE_KIND_CACHE =
            Collections.synchronizedMap(new WeakHashMap<>());

    private PackageModuleUtils() {
    }

    public enum SourceKind {
        DEFAULT,
        MANUAL,
        GENERATED
    }

    public static List<Module> modules(Package currentPackage) {
        return StreamSupport.stream(currentPackage.modules().spliterator(), false)
                .sorted(Comparator.comparing(PackageModuleUtils::fullModuleName))
                .toList();
    }

    public static String fullModuleName(Module module) {
        return module.moduleName().toString();
    }

    public static String moduleKind(Module module) {
        return module.isDefaultModule() ? DEFAULT_MODULE : SUBMODULE;
    }

    public static SourceKind sourceKind(Module module) {
        return SOURCE_KIND_CACHE.computeIfAbsent(module.moduleId(), ignored -> classifySource(module));
    }

    private static SourceKind classifySource(Module module) {
        if (module.isDefaultModule()) {
            return SourceKind.DEFAULT;
        }
        Project project = module.project();
        boolean hasGeneratedDocument = false;
        for (DocumentId documentId : module.documentIds()) {
            Optional<Path> documentPath = project.documentPath(documentId);
            if (documentPath.isEmpty()) {
                continue;
            }
            if (!isGeneratedPath(project, documentPath.get())) {
                return SourceKind.MANUAL;
            }
            hasGeneratedDocument = true;
        }
        return hasGeneratedDocument ? SourceKind.GENERATED : SourceKind.MANUAL;
    }

    public static boolean isGenerated(Module module) {
        return sourceKind(module) == SourceKind.GENERATED;
    }

    public static Optional<Module> findModule(Package currentPackage, String fileName) {
        if (fileName == null || fileName.isBlank()) {
            return Optional.empty();
        }
        String normalizedFileName = normalizePath(fileName);
        for (Module module : currentPackage.modules()) {
            for (DocumentId documentId : module.documentIds()) {
                Optional<Path> documentPath = module.project().documentPath(documentId);
                if (documentPath.isEmpty()) {
                    continue;
                }
                String absolute = normalizePath(documentPath.get().toString());
                String relative = normalizePath(relativize(module.project(), documentPath.get()));
                if (absolute.equals(normalizedFileName) || relative.equals(normalizedFileName)
                        || absolute.endsWith("/" + normalizedFileName)
                        || relative.endsWith("/" + normalizedFileName)) {
                    return Optional.of(module);
                }
            }
        }
        return Optional.empty();
    }

    private static boolean isGeneratedPath(Project project, Path documentPath) {
        String relative = normalizeForComparison(relativize(project, documentPath));
        return relative.startsWith("generated/") || relative.contains("/generated/");
    }

    private static String relativize(Project project, Path path) {
        Path absolutePath = path.toAbsolutePath().normalize();
        Path sourceRoot = project.sourceRoot().toAbsolutePath().normalize();
        if (absolutePath.startsWith(sourceRoot)) {
            return sourceRoot.relativize(absolutePath).toString().replace('\\', '/');
        }
        return path.toString().replace('\\', '/');
    }

    private static String normalizePath(String path) {
        return path.replace('\\', '/');
    }

    private static String normalizeForComparison(String path) {
        return path.replace('\\', '/').toLowerCase(Locale.ROOT);
    }
}
