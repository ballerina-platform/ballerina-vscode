/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.flowmodelgenerator.core.search.SearchCommand;
import io.ballerina.flowmodelgenerator.extension.request.SearchRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.tools.text.LineRange;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Tests for the search API.
 *
 * @since 1.0.0
 */
public class SearchTest extends AbstractLSTest {

    // Central access is disabled globally in tests via the ls.test.offline system property (RemoteCentral.getInstance()
    // returns an OfflineCentral), so the search commands fall back to the local index database deterministically.

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        SearchRequest request = new SearchRequest(testConfig.kind().name(), getSourcePath(testConfig.source()),
                testConfig.position(), testConfig.queryMap());
        JsonArray availableNodes = getResponseAndCloseFile(
                request, testConfig.source()).getAsJsonArray("categories");

        JsonArray categories = availableNodes.getAsJsonArray();
        if (!categories.equals(testConfig.categories())) {
            TestConfig updateConfig = new TestConfig(testConfig.description(), testConfig.kind(), testConfig.source(),
                    testConfig.position(), testConfig.queryMap(), categories);
//            updateConfig(configJsonPath, updateConfig);
            compareJsonElements(categories, testConfig.categories());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void importedFunctionsAreCompleteAndVersionCorrectAcrossSearchViews() throws IOException {
        String source = "proj/main.bal";
        var project = BuildProject.load(sourceDir.resolve("proj"), BuildOptions.builder().setOffline(true).build());
        var module = project.currentPackage().getDefaultModule();
        var document = module.documentIds().stream().map(module::document)
                .filter(value -> value.name().equals("main.bal")).findFirst().orElseThrow();
        var semantic = PackageUtil.getCompilation(project.currentPackage()).getSemanticModel(module.moduleId());
        var root = (ModulePartNode) document.syntaxTree().rootNode();
        ModuleSymbol io = root.imports().stream().map(node -> semantic.symbol(node).orElseThrow())
                .filter(ModuleSymbol.class::isInstance).map(ModuleSymbol.class::cast)
                .filter(symbol -> symbol.id().moduleName().equals("io")).findFirst().orElseThrow();
        List<String> expected = io.functions().stream()
                .filter(function -> function.qualifiers().contains(Qualifier.PUBLIC))
                .flatMap(function -> function.getName().stream()).sorted().toList();
        Assert.assertFalse(expected.isEmpty());
        for (String kind : List.of("FUNCTION", "ALL")) {
            for (String query : List.of("", "io")) {
                var request = new SearchRequest(kind, getSourcePath(source), null, Map.of("q", query));
                JsonObject response = getResponseAndCloseFile(request, source);
                List<JsonObject> nodes = new ArrayList<>();
                for (var category : response.getAsJsonArray("categories")) {
                    JsonObject value = category.getAsJsonObject();
                    if (!value.getAsJsonObject("metadata").get("label").getAsString().equals("Imported Functions")) {
                        continue;
                    }
                    for (var imported : value.getAsJsonArray("items")) {
                        JsonObject group = imported.getAsJsonObject();
                        if (group.getAsJsonObject("metadata").get("label").getAsString().equals("io")) {
                            group.getAsJsonArray("items").forEach(node -> nodes.add(node.getAsJsonObject()));
                        }
                    }
                }
                Assert.assertEquals(nodes.stream().map(node -> node.getAsJsonObject("codedata")
                        .get("symbol").getAsString()).sorted().toList(), expected, kind + " query=" + query);
                for (JsonObject node : nodes) {
                    Assert.assertEquals(node.getAsJsonObject("codedata").get("version").getAsString(),
                            io.id().version());
                }
                if (kind.equals("FUNCTION")) {
                    JsonObject pagination = response.getAsJsonObject("functionPagination");
                    for (String org : List.of("ballerina", "ballerinax")) {
                        JsonObject page = pagination.getAsJsonObject(org);
                        Assert.assertEquals(page.get("source").getAsString(), "index");
                        Assert.assertTrue(page.get("nextOffset").getAsInt() >= 0);
                        Assert.assertNotNull(page.get("hasMore"));
                    }
                }
            }
        }
    }

    @Override
    protected String[] skipList() {
        return new String[] {
                // TODO: Investigate why this test fails on Github Actions
                "custom_sum.json"
        };
    }

    @Override
    protected String getResourceDir() {
        return "search";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return SearchTest.class;
    }

    @Override
    protected String getApiName() {
        return "search";
    }

    private record TestConfig(String description, SearchCommand.Kind kind, String source, LineRange position,
                              Map<String, String> queryMap, JsonArray categories) {

    }
}
