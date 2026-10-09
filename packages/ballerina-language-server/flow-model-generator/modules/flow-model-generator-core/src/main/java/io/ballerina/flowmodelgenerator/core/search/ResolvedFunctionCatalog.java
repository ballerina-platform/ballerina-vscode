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
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.utils.SearchResultFilter;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageDependencyScope;
import io.ballerina.projects.Project;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

/**
 * Request-local imported function surfaces and authoritative versions for all resolved DEFAULT-scope packages,
 * including transitive dependencies. Promoting a transitive package to a direct import need not upgrade its version,
 * so offering a different release's function signature would be unsafe. Central serves only each package's latest
 * release, so a registry/index row for a resolved package at another version is rebased onto the resolved version
 * when the resolved package declares that public function, and dropped otherwise.
 *
 * <p>Successfully resolved imported symbols, including empty surfaces, are authoritative. Failed symbol discovery
 * permits only exact resolved-version fallback; an unresolved imported package must never fall back to latest,
 * including through one of its sibling modules. Catalogs are not shared across requests or dependency changes.</p>
 */
final class ResolvedFunctionCatalog {
    private static final Logger LOGGER = Logger.getLogger(ResolvedFunctionCatalog.class.getName());
    private final Map<String, String> versions;
    private final Map<ModuleCoordinate, List<SearchResult>> functions;
    private final Set<ModuleCoordinate> imports;
    // Public function names of a resolved module, or null when they cannot be enumerated.
    private final Function<SearchResult.Package, Set<String>> resolvedSurface;
    private final Map<String, Optional<Set<String>>> surfaces = new HashMap<>();

    ResolvedFunctionCatalog(Map<String, String> versions, Map<ModuleCoordinate, List<SearchResult>> functions,
                            Set<ModuleCoordinate> imports) {
        this(versions, functions, imports, pkg -> null);
    }

    ResolvedFunctionCatalog(Map<String, String> versions, Map<ModuleCoordinate, List<SearchResult>> functions,
                            Set<ModuleCoordinate> imports,
                            Function<SearchResult.Package, Set<String>> resolvedSurface) {
        this.versions = Map.copyOf(versions);
        this.functions = new TreeMap<>(functions);
        this.imports = Set.copyOf(imports);
        this.resolvedSurface = resolvedSurface;
    }

    static ResolvedFunctionCatalog collect(Project project, Set<ModuleCoordinate> imports) {
        Set<ModuleCoordinate> knownImports = new TreeSet<>(imports);
        var pkg = project.currentPackage();
        var compilation = PackageUtil.getCompilation(pkg);
        Map<String, String> versions = new HashMap<>();
        Map<String, Package> packages = new HashMap<>();
        for (var dependency : pkg.getResolution().dependencyGraph().getNodes()) {
            if (dependency.scope() != PackageDependencyScope.DEFAULT) {
                continue;
            }
            var resolved = dependency.packageInstance();
            String key = resolved.packageOrg().value() + "/" + resolved.packageName().value();
            versions.put(key, resolved.packageVersion().toString());
            if (!resolved.packageId().equals(pkg.packageId())) {
                packages.put(key, resolved);
            }
        }
        Map<ModuleCoordinate, List<SearchResult>> functions = new TreeMap<>();
        for (var module : PackageModuleUtils.modules(pkg)) {
            try {
                SemanticModel semanticModel = compilation.getSemanticModel(module.moduleId());
                for (var documentId : module.documentIds()) {
                    ModulePartNode root = (ModulePartNode) module.document(documentId).syntaxTree().rootNode();
                    for (var importNode : root.imports()) {
                        var symbol = semanticModel.symbol(importNode);
                        if (symbol.isEmpty() || !(symbol.get() instanceof ModuleSymbol imported)) {
                            String org = importNode.orgName().map(node -> node.orgName().text())
                                    .orElse(pkg.packageOrg().value());
                            String name = StreamSupport.stream(importNode.moduleName().spliterator(), false)
                                    .map(token -> token.text().replaceFirst("^'", ""))
                                    .collect(Collectors.joining("."));
                            knownImports.add(new ModuleCoordinate(org.replaceFirst("^'", ""), name));
                            continue;
                        }
                        ModuleCoordinate coordinate = new ModuleCoordinate(imported.id().orgName(),
                                imported.id().moduleName());
                        if (!imports.contains(coordinate) || functions.containsKey(coordinate)) {
                            continue;
                        }
                        List<SearchResult> rows = new ArrayList<>();
                        for (var function : imported.functions()) {
                            if (!function.qualifiers().contains(Qualifier.PUBLIC) || function.getName().isEmpty()) {
                                continue;
                            }
                            rows.add(SearchResult.from(imported.id().orgName(), imported.id().packageName(),
                                    imported.id().moduleName(), imported.id().version(), function.getName().get(),
                                    function.documentation().flatMap(doc -> doc.description()).orElse("")));
                        }
                        rows.sort(Comparator.comparing(SearchResult::name));
                        // Empty is authoritative too: it must not resurrect obsolete Central/index APIs.
                        functions.put(coordinate, List.copyOf(rows));
                    }
                }
            } catch (RuntimeException e) {
                LOGGER.log(Level.WARNING, "Failed to discover imported functions in " + module.moduleName(), e);
            }
        }
        for (var coordinate : knownImports) {
            if (!functions.containsKey(coordinate)) {
                LOGGER.fine(() -> "No function symbols for " + coordinate + "; only exact resolved-version fallback "
                        + "is permitted");
            }
        }
        return new ResolvedFunctionCatalog(versions, functions, knownImports, row -> {
            Package resolved = packages.get(row.org() + "/" + row.packageName());
            return resolved == null ? null : publicFunctionNames(resolved, row.moduleName());
        });
    }

    /** Reads declarations from the resolved package's sources, so no compilation or registry access is needed. */
    private static Set<String> publicFunctionNames(Package resolved, String moduleName) {
        try {
            for (var module : resolved.modules()) {
                if (!module.moduleName().toString().equals(moduleName)) {
                    continue;
                }
                Set<String> names = new TreeSet<>();
                for (var documentId : module.documentIds()) {
                    ModulePartNode root = (ModulePartNode) module.document(documentId).syntaxTree().rootNode();
                    for (var member : root.members()) {
                        if (member instanceof FunctionDefinitionNode function && function.qualifierList().stream()
                                .anyMatch(qualifier -> qualifier.kind() == SyntaxKind.PUBLIC_KEYWORD)) {
                            names.add(unquote(function.functionName().text()));
                        }
                    }
                }
                return names;
            }
        } catch (RuntimeException e) {
            LOGGER.log(Level.WARNING, "Failed to read public functions of " + resolved.packageOrg() + "/"
                    + moduleName + " " + resolved.packageVersion(), e);
        }
        return null;
    }

    private static String unquote(String identifier) {
        return identifier.startsWith("'") ? identifier.substring(1) : identifier;
    }

    Set<ModuleCoordinate> imports() {
        return imports;
    }

    Set<ModuleCoordinate> fallbackImports() {
        Set<ModuleCoordinate> fallback = new TreeSet<>(imports);
        fallback.removeAll(functions.keySet());
        return fallback;
    }

    List<SearchResult> matching(String query) {
        return functions.values().stream().flatMap(List::stream).filter(queryMatcher(query)).toList();
    }

    static Predicate<SearchResult> queryMatcher(String query) {
        String normalizedQuery = SearchDatabaseManager.sanitizeQuery(query).toLowerCase(Locale.ROOT);
        List<String> terms = Arrays.asList(normalizedQuery.split("\\s+"));
        return row -> {
            String text = (row.packageInfo().moduleName() + " " + row.name() + " " + row.description())
                    .toLowerCase(Locale.ROOT);
            return terms.stream().allMatch(text::contains);
        };
    }

    boolean eligible(SearchResult row) {
        return admit(row) != null;
    }

    /**
     * Returns the row as the project can call it, or null when it must not be offered. A row at another version of
     * a resolved package is rebased onto the resolved version only when that version declares the function; the
     * signature is then taken from the resolved version when the node is created.
     */
    SearchResult admit(SearchResult row) {
        if (row == null) {
            return null;
        }
        var pkg = row.packageInfo();
        if (SearchResultFilter.isToolPackage(pkg.org(), pkg.packageName())
                || functions.containsKey(pkg.coordinate())) {
            return null;
        }
        String version = versions.get(pkg.org() + "/" + pkg.packageName());
        if (version == null) {
            // An unresolved import has no trustworthy version for ANY module of its package. A sibling module from
            // Central's latest release is no safer than the imported module itself. Package names can contain
            // dots, so compare against the candidate's complete package name rather than splitting at a dot.
            return imports.stream().anyMatch(module -> module.org().equals(pkg.org())
                    && (module.moduleName().equals(pkg.packageName())
                    || module.moduleName().startsWith(pkg.packageName() + "."))) ? null : row;
        }
        if (version.equals(pkg.version())) {
            return row;
        }
        Optional<Set<String>> declared = surfaces.computeIfAbsent(pkg.org() + "/" + pkg.moduleName(),
                key -> Optional.ofNullable(resolvedSurface.apply(pkg)));
        if (declared.isEmpty() || !declared.get().contains(unquote(row.name()))) {
            return null;
        }
        return new SearchResult(new SearchResult.Package(pkg.org(), pkg.packageName(), pkg.moduleName(), version),
                row.name(), row.description(), row.attributes(), row.fromCurrentOrg());
    }
}
