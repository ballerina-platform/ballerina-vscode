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

package io.ballerina.flowmodelgenerator.core.utils;

import com.google.gson.Gson;
import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.response.ConnectorResponse;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.centralconnector.response.FunctionResponse;
import io.ballerina.centralconnector.response.FunctionsResponse;
import io.ballerina.centralconnector.response.Listeners;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.centralconnector.response.SymbolResponse;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.PackageName;
import org.ballerinalang.diagramutil.connector.models.connector.Connector;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiPredicate;

/**
 * Tests for {@link CentralSearchUtil}.
 *
 * @since 1.7.0
 */
public class CentralSearchUtilTest {

    private static final Set<String> ALLOWED_ORGS = Set.of("ballerina", "ballerinax", "wso2");
    private static final BiPredicate<String, String> EDI_TOOL =
            (org, pkg) -> "ballerina".equals(org) && "editoolspackage".equals(pkg);

    @Test(description = "Raw function windows retain filtered slots and expose count-based continuation")
    public void testRawFunctionPagesKeepSourceOffsets() {
        RecordingCentralApi central = new RecordingCentralApi(null);
        central.pagedSymbols = List.of(
                function("ballerina", "editoolspackage", "2.3.0", "tool", "Tool"),
                symbol("ballerina", "edi", "1.4.0", "Client", "Connector", "connector"),
                function("ballerina", "edi", "1.4.0", "fromEdiString", "Library"));
        CentralSearchUtil search = new CentralSearchUtil(central, EDI_TOOL);
        var first = search.searchFunctionPage("edi", 2, 0, "ballerina");
        Assert.assertEquals(first.rows().size(), 2);
        Assert.assertNull(first.rows().get(0));
        Assert.assertNull(first.rows().get(1));
        Assert.assertTrue(first.hasMore());
        Assert.assertEquals(central.callCount, 1);
        Assert.assertEquals(central.lastQueryMap.get("org"), "ballerina");
        Assert.assertEquals(central.lastQueryMap.get("symbolType"), "function");
        var second = search.searchFunctionPage("edi", 2, 2, "ballerina");
        Assert.assertEquals(second.rows().getFirst().name(), "fromEdiString");
        Assert.assertFalse(second.hasMore());
    }

    @Test(description = "A raw Central failure is distinct from a successful empty window")
    public void testRawFunctionFailureSignalsFallback() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse());
        CentralSearchUtil search = new CentralSearchUtil(central, EDI_TOOL);
        Assert.assertFalse(search.searchFunctionPage("", 10, 0, "ballerina").hasMore());
        central.failOnSearch = true;
        Assert.assertNull(search.searchFunctionPage("", 10, 0, "ballerina"));
    }

    @Test(description = "A connector search drops tool packages before paging.")
    public void testSearchConnectorsDropsToolPackages() {
        RecordingCentralApi central = new RecordingCentralApi(null);
        central.connectorsResponse = connectorsResponse(
                connector("ballerina", "editoolspackage", "Client"),
                connector("ballerinax", "azure_storage_service", "FileClient"),
                connector("ballerinax", "azure.storage.files", "Client"));
        CentralSearchUtil centralSearch = new CentralSearchUtil(central, EDI_TOOL);

        List<SearchResult> results = centralSearch.searchConnectors("azure", 10, 0, ALLOWED_ORGS, Set.of());
        List<SearchResult> secondPage = centralSearch.searchConnectors("azure", 1, 1, ALLOWED_ORGS, Set.of());

        Assert.assertEquals(results.stream().map(result -> result.packageInfo().packageName()).toList(),
                List.of("azure_storage_service", "azure.storage.files"));
        Assert.assertEquals(secondPage.getFirst().packageInfo().packageName(), "azure.storage.files");
    }

    @Test(description = "A function symbol is surfaced with its package coordinates.")
    public void testAllowedFunctionsSurfaced() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        List<SearchResult> results = functionRows(new CentralSearchUtil(central)
                .searchFunctionPage("readString", 10, 0, "ballerina"));

        Assert.assertEquals(results.size(), 1);
        SearchResult result = results.getFirst();
        Assert.assertEquals(result.name(), "readString");
        Assert.assertEquals(result.description(), "Parses TOML");
        Assert.assertEquals(result.packageInfo().org(), "ballerina");
        Assert.assertEquals(result.packageInfo().packageName(), "toml");
        Assert.assertEquals(result.packageInfo().moduleName(), "toml");
        Assert.assertEquals(result.packageInfo().version(), "0.8.0");
        Assert.assertFalse(result.fromCurrentOrg());
    }

    @Test(description = "The symbolType=function filter is sent to Central.")
    public void testSymbolTypeQueryParameter() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        new CentralSearchUtil(central).searchFunctionPage("readString", 10, 0, "ballerina");

        Assert.assertEquals(central.lastQueryMap.get("symbolType"), "function");
        Assert.assertEquals(central.lastQueryMap.get("q"), "readString");
    }

    @Test(description = "A raw window passes org, symbolType, limit and offset to Central unchanged.")
    public void testRawFunctionPageQueryParameters() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        new CentralSearchUtil(central).searchFunctionPage("", 12, 24, "ballerina");

        Assert.assertEquals(central.lastQueryMap.get("org"), "ballerina");
        Assert.assertEquals(central.lastQueryMap.get("symbolType"), "function");
        Assert.assertEquals(central.lastQueryMap.get("limit"), "12");
        Assert.assertEquals(central.lastQueryMap.get("offset"), "24");
        Assert.assertFalse(central.lastQueryMap.containsKey("q"));
    }

    @Test(description = "A submodule symbol keeps its own module name, distinct from the package name.")
    public void testSubmoduleModuleNameRetained() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                symbol("ballerinax", "edifact.d03a.supplychain", "edifact.d03a.supplychain.mORDERS", "1.0.1",
                        "fromEdiString", "Convert EDI string to Ballerina record.", "function")));

        List<SearchResult> results = functionRows(new CentralSearchUtil(central)
                .searchFunctionPage("fromEdiString", 10, 0, "ballerinax"));

        Assert.assertEquals(results.size(), 1);
        SearchResult.Package packageInfo = results.getFirst().packageInfo();
        Assert.assertEquals(packageInfo.packageName(), "edifact.d03a.supplychain");
        Assert.assertEquals(packageInfo.moduleName(), "edifact.d03a.supplychain.mORDERS");
    }

    @Test(description = "A symbol without a module name is attributed to its package, as Central responds today.")
    public void testMissingModuleNameFallsBackToPackage() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerinax", "edifact.d03a.supplychain", "1.0.1", "fromEdiString", "Convert EDI string.")));

        List<SearchResult> results = functionRows(new CentralSearchUtil(central)
                .searchFunctionPage("fromEdiString", 10, 0, "ballerinax"));

        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().packageInfo().moduleName(), "edifact.d03a.supplychain");
    }

    @Test(description = "Same-named functions in different modules of one package stay distinct results.")
    public void testSameNameAcrossModulesNotCollapsed() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                symbol("ballerinax", "edifact.d03a.supplychain", "edifact.d03a.supplychain", "1.0.1",
                        "fromEdiString", "Root", "function"),
                symbol("ballerinax", "edifact.d03a.supplychain", "edifact.d03a.supplychain.mORDERS", "1.0.1",
                        "fromEdiString", "Submodule", "function")));

        List<SearchResult> results = functionRows(new CentralSearchUtil(central)
                .searchFunctionPage("fromEdiString", 10, 0, "ballerinax"));

        Assert.assertEquals(results.size(), 2);
        Assert.assertEquals(results.get(0).packageInfo().moduleName(), "edifact.d03a.supplychain");
        Assert.assertEquals(results.get(1).packageInfo().moduleName(), "edifact.d03a.supplychain.mORDERS");
    }

    @Test(description = "A function search lists the declarations in the default module and in the submodules.")
    public void testSearchListsRootAndSubmoduleDeclarations() {
        // Searching a function name has to surface every module that declares it, the package default module and
        // its submodules alike, each attributed to its own module. The captured package declares fromEdiString
        // twice for exactly this reason: the rows are separable only by moduleName, never by the package name.
        RecordingCentralApi central = new RecordingCentralApi(loadFixture("search-symbols-submodule.json"));

        List<SearchResult> results = functionRows(new CentralSearchUtil(central)
                .searchFunctionPage("submodulecheck", 10, 0, "yaseematest"));

        Assert.assertEquals(results.size(), 4);
        Assert.assertEquals(moduleOf(results, "getSchema"), "submodulecheck.mORDERS");
        Assert.assertEquals(moduleOf(results, "getEDINames"), "submodulecheck");
        Assert.assertEquals(
                results.stream().filter(result -> result.name().equals("fromEdiString"))
                        .map(result -> result.packageInfo().moduleName()).sorted().toList(),
                List.of("submodulecheck", "submodulecheck.mORDERS"));
        // The package name is the same for every row, so attribution cannot be recovered from it.
        results.forEach(result -> Assert.assertEquals(result.packageInfo().packageName(), "submodulecheck"));
    }

    @Test(description = "A symbol's module is spelled the way a resolved dependency spells it, so the two can be "
            + "matched.")
    public void testModuleNameMatchesTheResolvedDescriptorSpelling() {
        // The load-bearing coupling of the whole feature, and the one that fails silently. A result's coordinate is
        // built from Central's moduleName; an imported module's coordinate is built by ModuleCoordinate.of from the
        // compiler's resolved descriptor. FunctionSearchCommand matches imports against results by comparing the
        // two. If the spellings ever diverge - Central serving a bare "mORDERS", say - every match fails, the
        // imported functions quietly stop being listed, and nothing that asserts only one side would notice.
        RecordingCentralApi central = new RecordingCentralApi(loadFixture("search-symbols-submodule.json"));

        List<SearchResult> results = functionRows(new CentralSearchUtil(central)
                .searchFunctionPage("submodulecheck", 10, 0, "yaseematest"));

        PackageName packageName = PackageName.from("submodulecheck");
        Assert.assertEquals(coordinateOf(results, "getSchema"),
                ModuleCoordinate.of("yaseematest", ModuleName.from(packageName, "mORDERS")));
        Assert.assertEquals(coordinateOf(results, "getEDINames"),
                ModuleCoordinate.of("yaseematest", ModuleName.from(packageName)));
    }

    private static List<SearchResult> functionRows(CentralSearchUtil.FunctionRawPage page) {
        return page.rows().stream().filter(Objects::nonNull).toList();
    }

    private static ModuleCoordinate coordinateOf(List<SearchResult> results, String symbolName) {
        return results.stream()
                .filter(result -> result.name().equals(symbolName))
                .map(result -> result.packageInfo().coordinate())
                .findFirst()
                .orElseThrow(() -> new AssertionError("no result named " + symbolName));
    }

    private static String moduleOf(List<SearchResult> results, String symbolName) {
        return results.stream()
                .filter(result -> result.name().equals(symbolName))
                .map(result -> result.packageInfo().moduleName())
                .findFirst()
                .orElseThrow(() -> new AssertionError("no result named " + symbolName));
    }

    /**
     * Deserializes a response captured verbatim from a live registry, through the same bare {@link Gson} that
     * {@code RestClient} uses.
     * <p>
     * The hand-built symbols elsewhere in this class assert what {@link CentralSearchUtil} does with a response;
     * they cannot catch the field of a record silently failing to bind, because they never go through Gson. The
     * fixture is real bytes, so a rename on either side shows up as a null module name rather than as a passing
     * test. See {@code src/test/resources/central/README.md} for its provenance.
     *
     * @param name the fixture file name under {@code src/test/resources/central}
     * @return the deserialized response
     */
    private static SymbolResponse loadFixture(String name) {
        String resource = "central/" + name;
        try (InputStream stream = CentralSearchUtilTest.class.getClassLoader().getResourceAsStream(resource)) {
            if (stream == null) {
                throw new AssertionError("missing fixture: " + resource);
            }
            try (Reader reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
                return new Gson().fromJson(reader, SymbolResponse.class);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static SymbolResponse.Symbol function(String org, String pkg, String version, String symbolName,
                                                  String description) {
        return symbol(org, pkg, version, symbolName, description, "function");
    }

    private static SymbolResponse.Symbol symbol(String org, String pkg, String version, String symbolName,
                                                String description, String symbolType) {
        return symbol(org, pkg, null, version, symbolName, description, symbolType);
    }

    /**
     * A symbol carrying an explicit module name, as Central returns once it indexes submodules. Passing {@code null}
     * for {@code module} reproduces today's response, which omits the field.
     */
    private static SymbolResponse.Symbol symbol(String org, String pkg, String module, String version,
                                                String symbolName, String description, String symbolType) {
        return new SymbolResponse.Symbol("id", "pkgId", pkg, module, org, version, 0L, "icon", symbolType, "",
                symbolName, description, "signature", false, false, false, false, false, false);
    }

    private static Connector connector(String org, String pkg, String name) {
        return new Connector(org, pkg, pkg, "1.0.0", name, "", Map.of());
    }

    private static ConnectorsResponse connectorsResponse(Connector... connectors) {
        List<Connector> list = List.of(connectors);
        return new ConnectorsResponse(list, list.size(), 0, list.size());
    }

    private static SymbolResponse symbolResponse(SymbolResponse.Symbol... symbols) {
        List<SymbolResponse.Symbol> list = List.of(symbols);
        return new SymbolResponse(list, list.size(), 0, list.size());
    }

    /**
     * A {@link CentralAPI} stub that records the query it was called with and replays a fixed symbol response.
     */
    private static final class RecordingCentralApi implements CentralAPI {

        private final SymbolResponse response;
        // When set, symbol searches page through these rows by the request's offset and limit, as Central does.
        private List<SymbolResponse.Symbol> pagedSymbols;
        private ConnectorsResponse connectorsResponse;
        private Map<String, String> lastQueryMap;
        private int callCount;
        private boolean failOnSearch;

        private RecordingCentralApi(SymbolResponse response) {
            this.response = response;
        }

        @Override
        public SymbolResponse searchSymbols(Map<String, String> queryMap) {
            this.lastQueryMap = queryMap;
            this.callCount++;
            if (failOnSearch) {
                throw new RuntimeException("Central is unavailable");
            }
            if (pagedSymbols != null) {
                int offset = Math.min(Integer.parseInt(queryMap.get("offset")), pagedSymbols.size());
                int end = Math.min(offset + Integer.parseInt(queryMap.get("limit")), pagedSymbols.size());
                return new SymbolResponse(pagedSymbols.subList(offset, end), pagedSymbols.size(), offset, end - offset);
            }
            return response;
        }

        @Override
        public PackageResponse searchPackages(Map<String, String> queryMap) {
            throw new UnsupportedOperationException();
        }

        @Override
        public FunctionsResponse functions(String organization, String name, String version) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Listeners listeners(String organization, String name, String version) {
            throw new UnsupportedOperationException();
        }

        @Override
        public FunctionResponse function(String organization, String name, String version, String functionName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ConnectorsResponse connectors(Map<String, String> queryMap) {
            if (connectorsResponse == null) {
                throw new UnsupportedOperationException();
            }
            this.lastQueryMap = queryMap;
            this.callCount++;
            return connectorsResponse;
        }

        @Override
        public ConnectorResponse connector(String id) {
            throw new UnsupportedOperationException();
        }

        @Override
        public ConnectorResponse connector(String organization, String name, String version, String clientName) {
            throw new UnsupportedOperationException();
        }

        @Override
        public String latestPackageVersion(String org, String name) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<String> allPackageVersions(String org, String name) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, List<DependentPackage>> dependentPackages(String org, String packageName,
                                                                     List<String> versions) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Map<String, List<String>> packageKeywords(List<DependentPackage> modules) {
            throw new UnsupportedOperationException();
        }

        @Override
        public boolean hasAuthorizedAccess() {
            throw new UnsupportedOperationException();
        }
    }
}
