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

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.response.ConnectorResponse;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.centralconnector.response.FunctionResponse;
import io.ballerina.centralconnector.response.FunctionsResponse;
import io.ballerina.centralconnector.response.Listeners;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.centralconnector.response.SymbolResponse;
import io.ballerina.modelgenerator.commons.SearchResult;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tests for {@link CentralSearchUtil#searchFunctions(String, int, int, Set)}.
 *
 * @since 1.7.0
 */
public class CentralSearchUtilTest {

    private static final Set<String> ALLOWED_ORGS = Set.of("ballerina", "ballerinax", "wso2");

    @Test(description = "Functions from allowed organizations are surfaced with their package coordinates.")
    public void testAllowedFunctionsSurfaced() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        List<SearchResult> results = new CentralSearchUtil(central)
                .searchFunctions("readString", 10, 0, ALLOWED_ORGS);

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

    @Test(description = "Functions from organizations outside the allow list are dropped.")
    public void testDisallowedOrgDropped() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML"),
                function("zerohack", "evil", "1.0.0", "readString", "Third party")));

        List<SearchResult> results = new CentralSearchUtil(central)
                .searchFunctions("readString", 10, 0, ALLOWED_ORGS);

        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().packageInfo().org(), "ballerina");
    }

    @Test(description = "Non-function symbols are excluded even if Central returns them.")
    public void testNonFunctionSymbolsExcluded() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                symbol("ballerina", "toml", "0.8.0", "readString", "Parses TOML", "function"),
                symbol("ballerina", "toml", "0.8.0", "ReadConfig", "Config record", "record")));

        List<SearchResult> results = new CentralSearchUtil(central)
                .searchFunctions("read", 10, 0, ALLOWED_ORGS);

        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().name(), "readString");
    }

    @Test(description = "The symbolType=function filter is sent to Central.")
    public void testSymbolTypeQueryParameter() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        new CentralSearchUtil(central).searchFunctions("readString", 10, 0, ALLOWED_ORGS);

        Assert.assertEquals(central.lastQueryMap.get("symbolType"), "function");
        Assert.assertEquals(central.lastQueryMap.get("q"), "readString");
    }

    @Test(description = "A failure while contacting Central yields null so the caller can fall back to the index.")
    public void testFailureReturnsNull() {
        RecordingCentralApi central = new RecordingCentralApi(null);
        central.failOnSearch = true;

        Assert.assertNull(new CentralSearchUtil(central).searchFunctions("readString", 10, 0, ALLOWED_ORGS));
    }

    @Test(description = "An empty allow list short circuits without contacting Central.")
    public void testEmptyAllowListReturnsEmpty() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        List<SearchResult> results = new CentralSearchUtil(central).searchFunctions("readString", 10, 0, Set.of());

        Assert.assertTrue(results.isEmpty());
        Assert.assertEquals(central.callCount, 0);
    }

    @Test(description = "The requested limit caps the number of returned functions.")
    public void testLimitIsRespected() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "one"),
                function("ballerina", "yaml", "0.8.0", "readString", "two"),
                function("ballerina", "json", "0.8.0", "readString", "three")));

        List<SearchResult> results = new CentralSearchUtil(central)
                .searchFunctions("readString", 2, 0, ALLOWED_ORGS);

        Assert.assertEquals(results.size(), 2);
    }

    @Test(description = "The single-org list passes org and symbolType to Central server-side without over-fetching.")
    public void testSearchFunctionsByOrgQueryParameters() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        new CentralSearchUtil(central).searchFunctionsByOrg("", 12, 24, "ballerina");

        Assert.assertEquals(central.lastQueryMap.get("org"), "ballerina");
        Assert.assertEquals(central.lastQueryMap.get("symbolType"), "function");
        Assert.assertEquals(central.lastQueryMap.get("limit"), "12");
        Assert.assertEquals(central.lastQueryMap.get("offset"), "24");
        Assert.assertFalse(central.lastQueryMap.containsKey("q"));
    }

    @Test(description = "A query term is forwarded when listing an organization's functions.")
    public void testSearchFunctionsByOrgForwardsQuery() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        new CentralSearchUtil(central).searchFunctionsByOrg("read", 12, 0, "ballerina");

        Assert.assertEquals(central.lastQueryMap.get("q"), "read");
    }

    @Test(description = "Non-function symbols are excluded from the single-org list.")
    public void testSearchFunctionsByOrgExcludesNonFunctions() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                symbol("ballerina", "toml", "0.8.0", "readString", "Parses TOML", "function"),
                symbol("ballerina", "toml", "0.8.0", "ReadConfig", "Config record", "record")));

        List<SearchResult> results = new CentralSearchUtil(central).searchFunctionsByOrg("", 12, 0, "ballerina");

        Assert.assertEquals(results.size(), 1);
        Assert.assertEquals(results.getFirst().name(), "readString");
        Assert.assertFalse(results.getFirst().fromCurrentOrg());
    }

    @Test(description = "A failure while contacting Central yields null so the caller can fall back to the index.")
    public void testSearchFunctionsByOrgFailureReturnsNull() {
        RecordingCentralApi central = new RecordingCentralApi(null);
        central.failOnSearch = true;

        Assert.assertNull(new CentralSearchUtil(central).searchFunctionsByOrg("", 12, 0, "ballerina"));
    }

    @Test(description = "A missing organization short circuits without contacting Central.")
    public void testSearchFunctionsByOrgEmptyOrgReturnsEmpty() {
        RecordingCentralApi central = new RecordingCentralApi(symbolResponse(
                function("ballerina", "toml", "0.8.0", "readString", "Parses TOML")));

        Assert.assertTrue(new CentralSearchUtil(central).searchFunctionsByOrg("", 12, 0, "").isEmpty());
        Assert.assertEquals(central.callCount, 0);
    }

    private static SymbolResponse.Symbol function(String org, String module, String version, String symbolName,
                                                  String description) {
        return symbol(org, module, version, symbolName, description, "function");
    }

    private static SymbolResponse.Symbol symbol(String org, String module, String version, String symbolName,
                                                String description, String symbolType) {
        return new SymbolResponse.Symbol("id", "pkgId", module, org, version, 0L, "icon", symbolType, "",
                symbolName, description, "signature", false, false, false, false, false, false);
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
            throw new UnsupportedOperationException();
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
