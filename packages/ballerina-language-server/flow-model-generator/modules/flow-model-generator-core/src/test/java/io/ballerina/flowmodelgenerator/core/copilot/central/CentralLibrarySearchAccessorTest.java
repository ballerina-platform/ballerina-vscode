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

package io.ballerina.flowmodelgenerator.core.copilot.central;

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.response.ConnectorResponse;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.centralconnector.response.FunctionResponse;
import io.ballerina.centralconnector.response.FunctionsResponse;
import io.ballerina.centralconnector.response.Listeners;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.centralconnector.response.SymbolResponse;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Tests for {@link CentralLibrarySearchAccessor}.
 *
 * @since 1.7.0
 */
public class CentralLibrarySearchAccessorTest {

    @BeforeMethod
    public void resetCache() {
        CentralLibrarySearchAccessor.clearCache();
    }

    @Test(description = "Keywords are joined into a single space separated query value.")
    public void testKeywordsJoinedIntoQuery() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(
                new String[]{"GitHub", "issue", "webhook"}), "GitHub issue webhook");
    }

    @Test(description = "A colon in a keyword is stripped so Central does not read it as a field lookup.")
    public void testColonKeywordIsStripped() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(new String[]{"http:client"}), "http client");
    }

    @Test(description = "A slash in a keyword is stripped so Central does not switch the query to AND.")
    public void testSlashKeywordIsStripped() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(
                new String[]{"ballerinax/github"}), "ballerinax github");
    }

    @Test(description = "Punctuation collapses to single separators without leaving empty terms.")
    public void testPunctuationCollapses() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(
                new String[]{" e-mail ", "sap.s4hana"}), "e mail sap s4hana");
    }

    @Test(description = "Solr boolean operators are dropped regardless of case.")
    public void testBooleanOperatorsDropped() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(
                new String[]{"payment", "not", "AND", "or", "stripe"}), "payment stripe");
    }

    @Test(description = "Blank and null keywords are skipped.")
    public void testBlankKeywordsSkipped() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(
                new String[]{"kafka", "   ", null, "consumer"}), "kafka consumer");
    }

    @Test(description = "A keyword with no alphanumeric content yields an empty query.")
    public void testUnusableKeywordsYieldEmptyQuery() {
        Assert.assertEquals(CentralLibrarySearchAccessor.buildQuery(new String[]{"!!!", "???"}), "");
    }

    @Test(description = "Only ballerina and ballerinax libraries are surfaced, in Central's order.")
    public void testOrganizationFilterAndOrdering() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(
                        Map.of("1", highlight("GitHub trigger"), "3", highlight("GitHub connector"),
                                "5", highlight("Also mentions GitHub")),
                        entry(1, "ballerinax", "trigger.github", "GitHub trigger"),
                        entry(2, "choreo", "github_issue_to_gsheet", "Template"),
                        entry(3, "ballerinax", "github", "GitHub connector"),
                        entry(4, "zerohack", "github", "Third party"),
                        entry(5, "ballerina", "http", "Also mentions GitHub")));

        Map<String, String> result = new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"github"});

        Assert.assertEquals(new ArrayList<>(result.keySet()),
                List.of("ballerinax/trigger.github", "ballerinax/github", "ballerina/http"));
        Assert.assertEquals(result.get("ballerinax/github"), "GitHub connector");
    }

    @Test(description = "Central is asked for the over-fetch limit so the local filters have room.")
    public void testCentralQueryParameters() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerina", "http", "HTTP library")));

        new CentralLibrarySearchAccessor(central).searchLibrariesByKeywords(new String[]{"REST", "service"});

        Assert.assertEquals(central.lastQueryMap.get("q"), "REST service");
        Assert.assertEquals(central.lastQueryMap.get("limit"),
                String.valueOf(CentralLibrarySearchAccessor.CENTRAL_FETCH_LIMIT));
    }

    @Test(description = "A package Central highlighted on its keywords field is kept.")
    public void testKeywordHighlightKeepsPackage() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(Map.of("1", new PackageResponse.Highlighting(List.of(), List.of("**payment**"))),
                        entry(1, "ballerinax", "stripe", "Online payments")));

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"payment"}).containsKey("ballerinax/stripe"));
    }

    @Test(description = "A popular package that only matched incidentally is dropped.")
    public void testPopularityNoiseDropped() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(Map.of("1", highlight("A GitHub connector")),
                        entry(1, "ballerinax", "github", "A GitHub connector"),
                        entry(2, "ballerina", "regex", "Regular expressions"),
                        entry(3, "ballerina", "jwt", "Authentication framework")));

        Map<String, String> result = new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"github", "issue"});

        Assert.assertEquals(new ArrayList<>(result.keySet()), List.of("ballerinax/github"));
    }

    @Test(description = "A name match survives even when Central highlighted nothing.")
    public void testNameMatchSurvivesWithoutHighlight() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerinax", "kafka", "Event streaming")));

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"kafka"}).containsKey("ballerinax/kafka"));
    }

    @Test(description = "A dotted package name matches on any of its segments.")
    public void testDottedNameSegmentMatches() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerinax", "microsoft.excel", "Spreadsheets")));

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"excel"}).containsKey("ballerinax/microsoft.excel"));
    }

    @Test(description = "A name segment that glues the term to something else still matches.")
    public void testPartialNameSegmentMatches() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(
                        entry(1, "ballerinax", "api2pdf", "Connects to the Api2Pdf REST API"),
                        entry(2, "ballerinax", "pdfbroker", "Connects to PDFBroker.io")));

        Map<String, String> result = new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"pdf"});

        Assert.assertEquals(new ArrayList<>(result.keySet()),
                List.of("ballerinax/api2pdf", "ballerinax/pdfbroker"));
    }

    @Test(description = "A short term does not match a name segment by accident.")
    public void testShortTermDoesNotPartiallyMatchNames() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerina", "email", "Send and receive email")));

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"ai"}).isEmpty());
    }

    @Test(description = "Blank highlight snippets do not count as a match.")
    public void testBlankHighlightSnippetsIgnored() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(Map.of("1", new PackageResponse.Highlighting(List.of(), List.of(""))),
                        entry(1, "ballerina", "regex", "Regular expressions")));

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"github"}).isEmpty());
    }

    @Test(description = "Repeated keywords do not break query term collection.")
    public void testRepeatedKeywordsTolerated() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerina", "http", "HTTP library")));

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"http", "http"}).containsKey("ballerina/http"));
    }

    @Test(description = "A missing summary becomes an empty description rather than a null.")
    public void testMissingSummaryBecomesEmptyString() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerina", "http", null)));

        Map<String, String> result = new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"http"});

        Assert.assertEquals(result.get("ballerina/http"), "");
    }

    @Test(description = "Repeated package names keep the highest ranked entry.")
    public void testDuplicatePackagesDeduplicated() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(
                        entry(1, "ballerina", "http", "Newest"),
                        entry(2, "ballerina", "http", "Older")));

        Map<String, String> result = new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"http"});

        Assert.assertEquals(result.size(), 1);
        Assert.assertEquals(result.get("ballerina/http"), "Newest");
    }

    @Test(description = "Empty and unusable keyword arrays short circuit without calling Central.")
    public void testNoCentralCallWithoutUsableKeywords() {
        RecordingCentralApi central = new RecordingCentralApi(packageResponse());

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[0]).isEmpty());
        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(null).isEmpty());
        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"###"}).isEmpty());
        Assert.assertEquals(central.callCount, 0);
    }

    @Test(description = "A repeated query is served from the cache instead of hitting Central again.")
    public void testRepeatedQueryIsCached() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerina", "http", "HTTP library")));
        CentralLibrarySearchAccessor accessor = new CentralLibrarySearchAccessor(central);

        Map<String, String> first = accessor.searchLibrariesByKeywords(new String[]{"http", "rest"});
        Map<String, String> second = accessor.searchLibrariesByKeywords(new String[]{"http", "rest"});

        Assert.assertEquals(central.callCount, 1);
        Assert.assertEquals(second, first);
    }

    @Test(description = "Mutating a returned map does not corrupt the cached entry.")
    public void testCachedResultIsIsolatedFromCallers() {
        RecordingCentralApi central = new RecordingCentralApi(
                packageResponse(entry(1, "ballerina", "http", "HTTP library")));
        CentralLibrarySearchAccessor accessor = new CentralLibrarySearchAccessor(central);

        accessor.searchLibrariesByKeywords(new String[]{"http"}).clear();
        Map<String, String> second = accessor.searchLibrariesByKeywords(new String[]{"http"});

        Assert.assertEquals(second.size(), 1);
        Assert.assertEquals(second.get("ballerina/http"), "HTTP library");
    }

    @Test(description = "An empty Central response yields no libraries.")
    public void testEmptyCentralResponse() {
        RecordingCentralApi central = new RecordingCentralApi(packageResponse());

        Assert.assertTrue(new CentralLibrarySearchAccessor(central)
                .searchLibrariesByKeywords(new String[]{"nothing"}).isEmpty());
    }

    private static PackageResponse.Highlighting highlight(String summarySnippet) {
        return new PackageResponse.Highlighting(List.of(summarySnippet), List.of());
    }

    private static PackageResponse.Package entry(int id, String organization, String name, String summary) {
        return new PackageResponse.Package(id, organization, name, "1.0.0", "any", "2201.0.0", false, "",
                "", "", "", "", summary, null, false, List.of(), List.of(), "", List.of(), "", "", "",
                0L, 0, "public", List.of(), "", "");
    }

    private static PackageResponse packageResponse(PackageResponse.Package... packages) {
        return packageResponse(Map.of(), packages);
    }

    private static PackageResponse packageResponse(Map<String, PackageResponse.Highlighting> highlighting,
                                                   PackageResponse.Package... packages) {
        return new PackageResponse(List.of(packages), List.of(), highlighting, packages.length, 0,
                CentralLibrarySearchAccessor.CENTRAL_FETCH_LIMIT);
    }

    /**
     * A {@link CentralAPI} stub that records the query it was called with and replays a fixed response.
     */
    private static final class RecordingCentralApi implements CentralAPI {

        private final PackageResponse response;
        private Map<String, String> lastQueryMap;
        private int callCount;

        private RecordingCentralApi(PackageResponse response) {
            this.response = response;
        }

        @Override
        public PackageResponse searchPackages(Map<String, String> queryMap) {
            this.lastQueryMap = queryMap;
            this.callCount++;
            return response;
        }

        @Override
        public SymbolResponse searchSymbols(Map<String, String> queryMap) {
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
