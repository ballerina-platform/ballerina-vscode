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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.centralconnector.response.SymbolResponse;
import io.ballerina.flowmodelgenerator.core.search.SearchCommand;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.PackageDependencyScope;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.Test;

import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Drives the function search command through its Central path with a registry that has moved past the project's
 * resolved versions, as Central does whenever a package publishes a new release (e.g. workflow 1.0.0).
 */
public class FunctionSearchCentralVersionTest {

    private static final Path WORKFLOW = Path.of("src/test/resources/function_search_versions/workflow");
    private static final Path HTTP = Path.of("src/test/resources/function_search_versions/http");
    // Real crypto functions as Central serves them (latest 2.13.0 only); HTTP resolves an older crypto locally.
    private static final List<String> CRYPTO_FUNCTIONS = List.of("crc32b", "decryptAesGcm", "equalConstantTime",
            "hashArgon2", "hashSha256", "hmacSha256", "signRsaSha256", "verifyBcrypt");

    private record Offered(String category, String module, String symbol, String version) { }

    @AfterMethod
    public void resetCentral() {
        RemoteCentral.resetTestInstance();
    }

    private static SearchCommand search(Project project, Map<String, String> queryMap,
                                        List<SymbolResponse.Symbol> ballerinaSymbols) {
        RemoteCentral.setTestInstance(central(Map.of("ballerina", ballerinaSymbols)));
        return SearchCommand.from(SearchCommand.Kind.FUNCTION, project, null, queryMap, null);
    }

    @Test
    public void newerCentralReleasesNeverReplaceResolvedVersions() {
        Project project = BuildProject.load(WORKFLOW,
                BuildOptions.builder().setOffline(true).build());
        String timeVersion = resolvedVersion(project, "ballerina/time");
        Assert.assertNotNull(timeVersion, "workflow must resolve time as a transitive dependency");
        Assert.assertNotEquals(timeVersion, "99.0.0");

        List<SymbolResponse.Symbol> ballerina = List.of(
                function("workflow", "1.0.0", "run"),
                function("workflow", "1.0.0", "getWorkflowInfo"),
                function("time", "99.0.0", "utcNow"),
                function("time", "99.0.0", "onlyInLatestTime"),
                function("unresolvedpkg", "1.0.0", "freshFunction"));
        SearchCommand command = search(project, Map.of("orgName", "ballerina", "limit", "20"), ballerina);
        List<Offered> offered = offered(command.execute());

        Assert.assertTrue(offered.contains(new Offered("Standard Library", "time", "utcNow", timeVersion)),
                "A transitive package stays discoverable at its resolved version: " + offered);
        Assert.assertTrue(offered.contains(new Offered("Standard Library", "unresolvedpkg", "freshFunction",
                "1.0.0")), "A package outside the dependency graph uses Central's release");
        Assert.assertTrue(offered.stream().noneMatch(row -> row.symbol().equals("onlyInLatestTime")
                || row.symbol().equals("getWorkflowInfo")), "Another release's API must not be offered");
        Assert.assertTrue(offered.stream().noneMatch(row -> row.module().equals("workflow")),
                "Imported modules belong to the imported category only");
        Assert.assertTrue(offered.stream().noneMatch(row -> row.version().equals("99.0.0")
                || row.module().equals("time") && !row.version().equals(timeVersion)));

        var pagination = command.functionPagination().get("ballerina");
        Assert.assertEquals(pagination.source(), "central");
        Assert.assertEquals(pagination.nextOffset(), ballerina.size(), "Filtered rows still consume raw offsets");
        Assert.assertFalse(pagination.hasMore());
    }

    @Test
    public void transitiveCryptoFromCentralUsesTheVersionHttpResolves() {
        Project project = BuildProject.load(HTTP, BuildOptions.builder().setOffline(true).build());
        String cryptoVersion = resolvedVersion(project, "ballerina/crypto");
        Assert.assertNotNull(cryptoVersion, "http must resolve crypto as a transitive dependency");
        Assert.assertNotEquals(cryptoVersion, "2.13.0", "The fixture must lag Central's latest crypto");

        List<SymbolResponse.Symbol> ballerina = new ArrayList<>();
        CRYPTO_FUNCTIONS.forEach(name -> ballerina.add(function("crypto", "2.13.0", name)));
        ballerina.add(function("crypto", "2.13.0", "onlyInLatestCrypto"));
        SearchCommand command = search(project, Map.of("orgName", "ballerina", "q", "crypto", "limit", "50"),
                ballerina);
        List<Offered> crypto = offered(command.execute()).stream()
                .filter(row -> row.module().equals("crypto")).toList();

        Assert.assertEquals(crypto.stream().map(Offered::symbol).sorted().toList(), CRYPTO_FUNCTIONS,
                "Every function the resolved crypto declares stays discoverable; newer-only APIs are hidden");
        Assert.assertTrue(crypto.stream().allMatch(row -> row.category().equals("Standard Library")
                && row.version().equals(cryptoVersion)), crypto.toString());
        Assert.assertEquals(command.functionPagination().get("ballerina").nextOffset(), ballerina.size());
    }

    @Test
    public void importedSurfaceIgnoresNewerCentralRelease() {
        Project project = BuildProject.load(WORKFLOW,
                BuildOptions.builder().setOffline(true).build());
        SearchCommand command = search(project, Map.of("limit", "20"),
                List.of(function("workflow", "1.0.0", "getWorkflowInfo")));
        List<Offered> imported = offered(command.execute()).stream()
                .filter(row -> row.category().equals("Imported Functions")).toList();
        Assert.assertEquals(imported.stream().map(Offered::symbol).sorted().toList(), List.of("completeHumanTask",
                "getPendingAgentEvents", "getWorkflowResult", "run", "sendData"));
        Assert.assertTrue(imported.stream().allMatch(row -> row.version().equals("0.10.0")), imported.toString());
    }

    private static String resolvedVersion(Project project, String key) {
        for (var dependency : project.currentPackage().getResolution().dependencyGraph().getNodes()) {
            var pkg = dependency.packageInstance();
            if (dependency.scope() == PackageDependencyScope.DEFAULT
                    && key.equals(pkg.packageOrg().value() + "/" + pkg.packageName().value())) {
                return pkg.packageVersion().toString();
            }
        }
        return null;
    }

    private static SymbolResponse.Symbol function(String pkg, String version, String name) {
        return new SymbolResponse.Symbol("id", "pkgId", pkg, pkg, "ballerina", version, 0L, "icon", "function", "",
                name, "", "signature", false, false, false, false, false, false);
    }

    /** A registry that pages each organization's rows by offset and limit, as Central's symbol search does. */
    private static CentralAPI central(Map<String, List<SymbolResponse.Symbol>> symbolsByOrg) {
        return (CentralAPI) Proxy.newProxyInstance(CentralAPI.class.getClassLoader(),
                new Class<?>[]{CentralAPI.class}, (proxy, method, args) -> {
                    if (!method.getName().equals("searchSymbols")) {
                        throw new UnsupportedOperationException(method.getName());
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, String> params = (Map<String, String>) args[0];
                    List<SymbolResponse.Symbol> all = symbolsByOrg.getOrDefault(params.get("org"), List.of());
                    int offset = Math.min(all.size(), Integer.parseInt(params.get("offset")));
                    int end = Math.min(all.size(), offset + Integer.parseInt(params.get("limit")));
                    return new SymbolResponse(all.subList(offset, end), all.size(), offset, end - offset);
                });
    }

    private static List<Offered> offered(Iterable<JsonElement> categories) {
        List<Offered> rows = new ArrayList<>();
        for (JsonElement element : categories) {
            JsonObject category = element.getAsJsonObject();
            collect(category.getAsJsonObject("metadata").get("label").getAsString(), category, rows);
        }
        return rows;
    }

    private static void collect(String category, JsonObject item, List<Offered> rows) {
        if (item.has("codedata")) {
            JsonObject codedata = item.getAsJsonObject("codedata");
            rows.add(new Offered(category, codedata.get("module").getAsString(),
                    codedata.get("symbol").getAsString(), codedata.get("version").getAsString()));
        }
        if (item.has("items")) {
            for (JsonElement child : item.getAsJsonArray("items")) {
                collect(category, child.getAsJsonObject(), rows);
            }
        }
    }
}
