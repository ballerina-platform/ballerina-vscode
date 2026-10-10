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

import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.PackageDependencyScope;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ResolvedFunctionCatalogTest {
    private static SearchResult row(String org, String module, String version, String name) {
        return SearchResult.from(org, "sample", module, version, name, "useful documentation");
    }

    @Test
    public void provisionedWorkflowUsesTheResolvedBalaNotTheIndex() {
        // Gradle provisions workflow 0.10.0 in BALLERINA_HOME_DIR, not the developer's ~/.ballerina cache.
        // This acceptance case must fail, rather than skip, if the build-owned fixture is missing.
        var project = BuildProject.load(Path.of("src/test/resources/function-discovery/issue-2697-workflow"),
                BuildOptions.builder().setOffline(true).build());
        var catalog = ResolvedFunctionCatalog.collect(project, ImportedModules.collect(project), true);
        List<SearchResult> rows = catalog.matching("workflow");
        Assert.assertEquals(rows.stream().map(SearchResult::name).toList(), List.of("completeHumanTask",
                "getPendingAgentEvents", "getWorkflowResult", "run", "sendData"));
        Assert.assertTrue(rows.stream().allMatch(row -> row.packageInfo().version().equals("0.10.0")));
        Assert.assertTrue(catalog.fallbackImports().isEmpty());
        Assert.assertTrue(catalog.matching("getWorkflowInfo").isEmpty());
        var unlisted = ResolvedFunctionCatalog.collect(project, ImportedModules.collect(project), false);
        Assert.assertTrue(unlisted.matching("workflow").isEmpty(), "A continuation does not list imported functions");
        Assert.assertEquals(unlisted.imports(), catalog.imports());
        Assert.assertTrue(unlisted.fallbackImports().isEmpty(), "Resolved imports stay resolved without listing");
        Assert.assertNull(unlisted.admit(rows.getFirst()), "Imported compiler symbols still supersede registry rows");
    }

    @Test
    public void realRootCompilationEnumeratesEveryPublicImportedFunctionOffline() {
        var project = BuildProject.load(Path.of("src/test/resources/function-discovery/issue-2697"),
                BuildOptions.builder().setOffline(true).build());
        Set<ModuleCoordinate> imports = ImportedModules.collect(project);
        Assert.assertEquals(imports.size(), 6);
        var catalog = ResolvedFunctionCatalog.collect(project, imports, true);
        List<SearchResult> actual = catalog.matching("");
        Assert.assertTrue(actual.size() > 50, "Fixture must exercise a large real imported surface");
        var module = project.currentPackage().getDefaultModule();
        var semanticModel = PackageUtil.getCompilation(project.currentPackage())
                .getSemanticModel(module.moduleId());
        var root = (ModulePartNode) module.document(
                module.documentIds().iterator().next()).syntaxTree().rootNode();
        int expected = 0;
        for (var importNode : root.imports()) {
            var symbol = (ModuleSymbol) semanticModel.symbol(importNode)
                    .orElseThrow();
            List<String> names = symbol.functions().stream()
                    .filter(fn -> fn.qualifiers().contains(Qualifier.PUBLIC))
                    .flatMap(fn -> fn.getName().stream()).sorted().toList();
            List<SearchResult> rows = actual.stream()
                    .filter(row -> row.packageInfo().moduleName().equals(symbol.id().moduleName())).toList();
            Assert.assertEquals(rows.stream().map(SearchResult::name).toList(), names);
            Assert.assertTrue(rows.stream().allMatch(row -> row.packageInfo().version().equals(symbol.id().version())));
            expected += names.size();
        }
        Assert.assertEquals(actual.size(), expected);
        // Independent, literal expectations supplement the complete compiler-surface invariant.
        Map<String, String> representativeFunctions = Map.of("io", "println", "log", "printInfo", "time", "utcNow",
                "os", "getEnv", "crypto", "hashSha256", "uuid", "createType4AsString");
        representativeFunctions.forEach((name, function) -> Assert.assertTrue(actual.stream()
                .anyMatch(row -> row.packageInfo().moduleName().equals(name) && row.name().equals(function)),
                "Missing public function " + name + ":" + function));
        Assert.assertEquals(catalog.matching(""),
                ResolvedFunctionCatalog.collect(project, imports, true).matching(""));
    }

    private static Map<String, String> resolvedVersions(Project project) {
        Map<String, String> versions = new HashMap<>();
        for (var dependency : project.currentPackage().getResolution().dependencyGraph().getNodes()) {
            if (dependency.scope() == PackageDependencyScope.DEFAULT) {
                var pkg = dependency.packageInstance();
                versions.put(pkg.packageOrg().value() + "/" + pkg.packageName().value(),
                        pkg.packageVersion().toString());
            }
        }
        return versions;
    }

    @Test
    public void importingATransitivePackageDoesNotPermitOtherVersionSignatures() {
        var project = BuildProject.load(Path.of("src/test/resources/function-discovery/issue-2697-transitive"),
                BuildOptions.builder().setOffline(true).build());
        Set<ModuleCoordinate> imports = ImportedModules.collect(project);
        Assert.assertEquals(imports, Set.of(new ModuleCoordinate("ballerina", "http")));
        var before = ResolvedFunctionCatalog.collect(project, imports, true);
        Map<String, String> versions = resolvedVersions(project);
        String timeVersion = versions.get("ballerina/time");
        Assert.assertNotNull(timeVersion, "HTTP must resolve time as a transitive dependency");
        SearchResult compatible = SearchResult.from("ballerina", "time", "time", timeVersion, "utcNow", "");
        Assert.assertNotNull(before.admit(compatible));
        for (String otherVersion : List.of("0.0.0", "99.0.0")) {
            SearchResult rebased = before.admit(SearchResult.from("ballerina", "time", "time", otherVersion,
                    "utcNow", ""));
            Assert.assertNotNull(rebased, "A function the resolved release declares stays discoverable");
            Assert.assertEquals(rebased.packageInfo().version(), timeVersion,
                    "A transitive lock is authoritative before adding a direct import");
            Assert.assertNull(before.admit(SearchResult.from("ballerina", "time", "time", otherVersion,
                    "onlyInAnotherRelease", "")), "Another release's API must not be offered");
        }

        var module = project.currentPackage().getDefaultModule();
        var document = module.document(module.documentIds().iterator().next());
        document.modify().withContent(document.textDocument().toString().replace("import ballerina/http;",
                "import ballerina/http;\nimport ballerina/time;")).apply();
        Set<ModuleCoordinate> promotedImports = ImportedModules.collect(project);
        Assert.assertTrue(promotedImports.contains(new ModuleCoordinate("ballerina", "time")));
        Assert.assertEquals(resolvedVersions(project), versions, "Adding an import must not imply a version upgrade");
        var after = ResolvedFunctionCatalog.collect(project, promotedImports, true);
        Assert.assertTrue(after.matching("utcNow").stream()
                .anyMatch(row -> row.packageInfo().moduleName().equals("time")
                        && row.packageInfo().version().equals(timeVersion)));
        Assert.assertNull(after.admit(compatible), "Imported compiler symbols supersede registry/index duplicates");
        Assert.assertNotNull(before.admit(compatible), "A subsequent request must not mutate an earlier catalog");
    }

    @Test
    public void resolvedPackageWinsOverEveryExternalVersion() {
        var module = new ModuleCoordinate("ballerinax", "sample");
        var old = row("ballerinax", "sample", "0.1.0", "removedInLatest");
        var catalog = new ResolvedFunctionCatalog(Map.of("ballerinax/sample", "0.1.0"),
                Map.of(module, List.of(old)), Set.of(module));
        Assert.assertEquals(catalog.matching(""), List.of(old));
        Assert.assertTrue(catalog.fallbackImports().isEmpty());
        Assert.assertEquals(catalog.matching("sample removed"), List.of(old));
        Assert.assertEquals(catalog.matching("useful"), List.of(old));
        Assert.assertEquals(catalog.matching("@#$%"), List.of(old));
        Assert.assertEquals(catalog.matching("\"SAMPLE\" REMOVED"), List.of(old));
        Assert.assertTrue(catalog.matching("addedInLatest").isEmpty());
        for (String version : List.of("0.1.0", "0.2.0", "0.0.9")) {
            Assert.assertNull(catalog.admit(row("ballerinax", "sample", version, "addedInLatest")));
            Assert.assertEquals(catalog.admit(row("ballerinax", "sample.sub", version, "subFunction")) != null,
                    "0.1.0".equals(version));
        }
        Assert.assertNotNull(catalog.admit(row("otherorg", "sample", "0.2.0", "newFunction")));
    }

    @Test
    public void registryRowsAreRebasedOntoTheResolvedVersion() {
        // Central serves only the latest release: workflow 1.0.0 while the project resolves 0.10.0.
        Map<String, Map<String, String>> declared = Map.of("ballerina/workflow", Map.of("run", "resolved docs"),
                "ballerina/workflow.sub", Map.of("subRun", ""));
        var catalog = new ResolvedFunctionCatalog(Map.of("ballerina/workflow", "0.10.0"), Map.of(), Set.of(),
                pkg -> declared.get(pkg.org() + "/" + pkg.moduleName()));
        var latest = SearchResult.from("ballerina", "workflow", "workflow", "1.0.0", "run", "latest docs");
        SearchResult rebased = catalog.admit(latest);
        Assert.assertEquals(rebased.packageInfo(),
                new SearchResult.Package("ballerina", "workflow", "workflow", "0.10.0"));
        Assert.assertEquals(rebased.name(), "run");
        Assert.assertEquals(rebased.description(), "resolved docs", "Latest docs may describe another signature");
        Assert.assertNull(catalog.admit(SearchResult.from("ballerina", "workflow", "workflow", "1.0.0",
                "getWorkflowInfo", "")));
        Assert.assertEquals(catalog.admit(SearchResult.from("ballerina", "workflow", "workflow.sub", "1.0.0",
                "subRun", "")).packageInfo().version(), "0.10.0");
        var exact = SearchResult.from("ballerina", "workflow", "workflow", "0.10.0", "anything", "");
        Assert.assertSame(catalog.admit(exact), exact, "An exact-version row needs no source check");
        var unreadable = new ResolvedFunctionCatalog(Map.of("ballerina/workflow", "0.10.0"), Map.of(), Set.of());
        Assert.assertNull(unreadable.admit(latest), "An unreadable resolved surface must not admit another release");
    }

    @Test
    public void realTransitiveSubmodulesAreRebasedFromResolvedSources() {
        var project = BuildProject.load(Path.of("src/test/resources/function-discovery/issue-2697-transitive"),
                BuildOptions.builder().setOffline(true).build());
        var catalog = ResolvedFunctionCatalog.collect(project, ImportedModules.collect(project), true);
        String mimeVersion = resolvedVersions(project).get("ballerina/mime");
        Assert.assertNotNull(mimeVersion, "HTTP must resolve mime as a transitive dependency");
        SearchResult rebased = catalog.admit(SearchResult.from("ballerina", "mime", "mime", "99.0.0",
                "getMediaType", ""));
        Assert.assertNotNull(rebased);
        Assert.assertEquals(rebased.packageInfo().version(), mimeVersion);
        Assert.assertFalse(rebased.description().isEmpty(), "The description is read from the resolved sources");
        Assert.assertNull(catalog.admit(SearchResult.from("ballerina", "mime", "mime", "99.0.0",
                "notAMimeFunction", "")));
        Assert.assertNull(catalog.admit(SearchResult.from("ballerina", "mime", "mime.missing", "99.0.0",
                "getMediaType", "")), "A module absent from the resolved release must not be offered");
    }

    @Test
    public void emptySymbolsAndBrokenImportsCannotResurrectLatestApis() {
        var module = new ModuleCoordinate("ballerinax", "sample");
        var empty = new ResolvedFunctionCatalog(Map.of("ballerinax/sample", "0.1.0"),
                Map.of(module, List.of()), Set.of(module));
        Assert.assertNull(empty.admit(row("ballerinax", "sample", "0.1.0", "obsolete")));
        var broken = new ResolvedFunctionCatalog(Map.of("ballerinax/sample", "0.1.0"), Map.of(), Set.of(module));
        Assert.assertNotNull(broken.admit(row("ballerinax", "sample", "0.1.0", "fallback")));
        Assert.assertNull(broken.admit(row("ballerinax", "sample", "0.2.0", "fallback")));
        var unresolved = new ResolvedFunctionCatalog(Map.of(), Map.of(), Set.of(module));
        Assert.assertNull(unresolved.admit(row("ballerinax", "sample", "0.2.0", "fallback")));
        Assert.assertNull(unresolved.admit(row("ballerinax", "sample.sub", "0.2.0", "sibling")));
        var unresolvedSubmodule = new ResolvedFunctionCatalog(Map.of(), Map.of(),
                Set.of(new ModuleCoordinate("ballerinax", "sample.sub")));
        Assert.assertNull(unresolvedSubmodule.admit(row("ballerinax", "sample", "0.2.0", "root")));
        Assert.assertNull(unresolvedSubmodule.admit(row("ballerinax", "sample.other", "0.2.0", "sibling")));
        Assert.assertNotNull(unresolvedSubmodule.admit(row("otherorg", "sample", "0.2.0", "unrelated")));
        Assert.assertNotNull(unresolvedSubmodule.admit(SearchResult.from("ballerinax", "sampleother", "sampleother",
                "0.2.0", "unrelated", "")));
    }

    @Test
    public void aNewRequestReflectsAnExplicitDependencyUpgrade() {
        var module = new ModuleCoordinate("ballerinax", "sample");
        var old = row("ballerinax", "sample", "0.1.0", "oldFunction");
        var latest = row("ballerinax", "sample", "0.2.0", "newFunction");
        var before = new ResolvedFunctionCatalog(Map.of("ballerinax/sample", "0.1.0"),
                Map.of(module, List.of(old)), Set.of(module));
        var after = new ResolvedFunctionCatalog(Map.of("ballerinax/sample", "0.2.0"),
                Map.of(module, List.of(latest)), Set.of(module));
        Assert.assertEquals(before.matching("sample"), List.of(old));
        Assert.assertEquals(after.matching("sample"), List.of(latest));
        Assert.assertTrue(after.matching("oldFunction").isEmpty());
        Assert.assertEquals(before.matching("sample"), List.of(old), "Requests must not share mutable catalogs");
    }

    @Test
    public void everyImportedFunctionIsReachableWithoutRegistryBudgets() {
        Map<ModuleCoordinate, List<SearchResult>> functions = new HashMap<>();
        for (int module = 0; module < 8; module++) {
            List<SearchResult> rows = new ArrayList<>();
            String name = "sample.sub" + module;
            for (int function = 0; function < 75; function++) {
                rows.add(row("ballerinax", name, "0.1.0", "function" + function));
            }
            functions.put(new ModuleCoordinate("ballerinax", name), rows);
        }
        var catalog = new ResolvedFunctionCatalog(Map.of("ballerinax/sample", "0.1.0"), functions,
                functions.keySet());
        Assert.assertEquals(catalog.matching("sample").size(), 600);
        Assert.assertEquals(catalog.matching("function74").size(), 8);
        Assert.assertEquals(catalog.matching("sample.sub7").size(), 75);
    }
}
