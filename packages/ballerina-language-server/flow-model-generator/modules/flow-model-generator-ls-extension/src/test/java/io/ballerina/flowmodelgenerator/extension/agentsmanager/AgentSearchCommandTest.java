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

package io.ballerina.flowmodelgenerator.extension.agentsmanager;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.centralconnector.response.ConnectorResponse;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.DependentPackage;
import io.ballerina.centralconnector.response.FunctionResponse;
import io.ballerina.centralconnector.response.FunctionsResponse;
import io.ballerina.centralconnector.response.Listeners;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.centralconnector.response.SymbolResponse;
import io.ballerina.flowmodelgenerator.core.search.AgentSearchCommand;
import io.ballerina.projects.BuildOptions;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.Test;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Tests {@link AgentSearchCommand}'s Central-search query scoping, package-to-agent-node mapping, and
 * failure handling, via a recording {@link CentralAPI} test double.
 *
 * @since 1.8.0
 */
public class AgentSearchCommandTest {

    private static final Path RES_DIR = Paths.get(
            "src", "test", "resources", "agents_manager", "source", "agent_search_org").toAbsolutePath();
    private static final LineRange POSITION =
            LineRange.from("main.bal", LinePosition.from(0, 0), LinePosition.from(0, 0));

    private Project project;

    @BeforeClass
    public void setup() {
        project = BuildProject.load(RES_DIR, BuildOptions.builder().setOffline(true).build());
    }

    @AfterMethod
    public void resetCentral() {
        RemoteCentral.resetTestInstance();
    }

    @Test(description = "Authorized access with a current org queries user-packages and org separately, since "
            + "Central ANDs the two and would otherwise drop everything the user owns under another org")
    public void testAuthorizedAccessQueriesUserPackagesAndOrgSeparately() {
        RecordingCentral central = new RecordingCentral(true);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "organization", "q", "chat")).execute();

        Assert.assertEquals(central.queries.size(), 2);
        Assert.assertTrue(central.queries.stream().anyMatch(query ->
                "agent_search_org".equals(query.get("org")) && !query.containsKey("user-packages")));
        Assert.assertTrue(central.queries.stream().anyMatch(query ->
                "true".equals(query.get("user-packages")) && !query.containsKey("org")));
        central.queries.forEach(query ->
                Assert.assertEquals(query.get("q"), "keywords:\"Type/Agent\" AND chat"));
    }

    @Test(description = "Unauthorized access falls back to the current package's org")
    public void testUnauthorizedAccessFallsBackToCurrentOrg() {
        RecordingCentral central = new RecordingCentral(false);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "organization", "q", "")).execute();

        Assert.assertEquals(central.queries.size(), 1);
        Assert.assertEquals(central.lastQuery().get("q"), "keywords:\"Type/Agent\"");
        Assert.assertEquals(central.lastQuery().get("org"), "agent_search_org");
        Assert.assertFalse(central.lastQuery().containsKey("user-packages"));
    }

    @Test(description = "Org-scoped and user-owned Central results are merged without duplicates")
    public void testOrganizationScopeMergesResultsWithoutDuplicates() {
        RecordingCentral central = new RecordingCentral(true,
                packageResponse(samplePackage()),
                packageResponse(samplePackage(), otherPackage()));
        RemoteCentral.setTestInstance(central);

        JsonArray result = new AgentSearchCommand(project, POSITION, Map.of("source", "organization", "q", "chat"))
                .execute();

        JsonArray items = result.get(0).getAsJsonObject().getAsJsonArray("items");
        Assert.assertEquals(items.size(), 2, "the package returned by both calls must be merged, not duplicated");
    }

    @Test(description = "A search term with a stray boolean operator and quote is sanitized before reaching Central")
    public void testSearchQueryStripsReservedOperatorsAndQuotes() {
        RecordingCentral central = new RecordingCentral(true);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "organization", "q", "chat AND \"bot")).execute();

        Assert.assertEquals(central.lastQuery().get("q"), "keywords:\"Type/Agent\" AND chat bot");
    }

    @Test(description = "An empty query on the 'all' source stays offline and never calls Central")
    public void testAllSourceWithEmptyQueryDoesNotCallCentral() {
        RecordingCentral central = new RecordingCentral(true);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "all", "q", "")).execute();

        Assert.assertTrue(central.queries.isEmpty(), "an empty query must resolve from the bundled landing list, "
                + "not Central");
    }

    @Test(description = "A non-empty query on the 'all' source maps a Central package to its agent node")
    public void testAllSourceWithQueryMapsCentralPackageToAgentNode() {
        RecordingCentral central = new RecordingCentral(true, packageResponse(samplePackage()));
        RemoteCentral.setTestInstance(central);

        JsonArray result = new AgentSearchCommand(project, POSITION, Map.of("source", "all", "q", "chat")).execute();

        Assert.assertEquals(result.size(), 1);
        JsonObject category = result.get(0).getAsJsonObject();
        Assert.assertEquals(category.getAsJsonObject("metadata").get("label").getAsString(), "Central Agents");

        JsonObject node = category.getAsJsonArray("items").get(0).getAsJsonObject();
        JsonObject metadata = node.getAsJsonObject("metadata");
        JsonObject codedata = node.getAsJsonObject("codedata");
        Assert.assertEquals(metadata.get("label").getAsString(), "support_agent");
        Assert.assertEquals(metadata.get("description").getAsString(), "Support agent package");
        Assert.assertEquals(codedata.get("node").getAsString(), "TYPED_AGENT");
        Assert.assertEquals(codedata.get("org").getAsString(), "wso2");
        Assert.assertEquals(codedata.get("module").getAsString(), "support_agent");
        Assert.assertEquals(codedata.get("packageName").getAsString(), "support_agent");
        Assert.assertEquals(codedata.get("symbol").getAsString(), "init");
        Assert.assertEquals(codedata.get("version").getAsString(), "1.2.3");
    }

    @Test(description = "A null package list from Central resolves to no agents rather than failing")
    public void testFetchAgentsFromCentralReturnsEmptyWhenPackagesNull() {
        RecordingCentral central = new RecordingCentral(true, new PackageResponse(null, List.of(), Map.of(), 0, 0, 0));
        RemoteCentral.setTestInstance(central);

        JsonArray result = new AgentSearchCommand(project, POSITION, Map.of("source", "all", "q", "chat")).execute();

        Assert.assertEquals(result.size(), 0);
    }

    @Test(description = "A Central failure resolves to no agents rather than propagating")
    public void testFetchAgentsFromCentralReturnsEmptyOnCentralFailure() {
        RemoteCentral.setTestInstance(new RecordingCentral(new RuntimeException("Central unavailable")));

        JsonArray result = new AgentSearchCommand(project, POSITION, Map.of("source", "all", "q", "chat")).execute();

        Assert.assertEquals(result.size(), 0);
    }

    @Test(description = "A package id that isn't a complete module reference skips the Central pull entirely")
    public void testExecuteWithIncompletePackageIdSkipsPull() {
        JsonArray result = new AgentSearchCommand(project, POSITION, Map.of("package", "not-a-valid-id")).execute();

        Assert.assertEquals(result.size(), 0);
    }

    private static PackageResponse packageResponse(PackageResponse.Package... pkgs) {
        return new PackageResponse(List.of(pkgs), List.of(), Map.of(), pkgs.length, 0, pkgs.length);
    }

    private static PackageResponse.Package samplePackage() {
        return new PackageResponse.Package(1, "wso2", "support_agent", "1.2.3", null, null, false, null, null,
                null, null, null, "Support agent package", null, false, List.of(), List.of(), null, List.of(),
                null, null, null, 0L, 0, null, List.of(), null, null);
    }

    private static PackageResponse.Package otherPackage() {
        return new PackageResponse.Package(2, "acme", "helper_agent", "2.0.0", null, null, false, null, null,
                null, null, null, "Helper agent package", null, false, List.of(), List.of(), null, List.of(),
                null, null, null, 0L, 0, null, List.of(), null, null);
    }

    /** Records every query map passed to {@code searchPackages}; every other method is unused by the paths under
     * test. Responses are returned in call order and the last one repeats once exhausted. */
    private static final class RecordingCentral implements CentralAPI {

        private final boolean authorized;
        private final List<PackageResponse> responses;
        private final RuntimeException failure;
        private final List<Map<String, String>> queries = new ArrayList<>();

        private RecordingCentral(boolean authorized) {
            this(authorized, new PackageResponse(List.of(), List.of(), Map.of(), 0, 0, 0));
        }

        private RecordingCentral(boolean authorized, PackageResponse... responses) {
            this.authorized = authorized;
            this.responses = List.of(responses);
            this.failure = null;
        }

        private RecordingCentral(RuntimeException failure) {
            this.authorized = false;
            this.responses = List.of();
            this.failure = failure;
        }

        private Map<String, String> lastQuery() {
            return queries.isEmpty() ? null : queries.get(queries.size() - 1);
        }

        @Override
        public PackageResponse searchPackages(Map<String, String> queryMap) {
            queries.add(new HashMap<>(queryMap));
            if (failure != null) {
                throw failure;
            }
            if (responses.isEmpty()) {
                return null;
            }
            return responses.get(Math.min(queries.size() - 1, responses.size() - 1));
        }

        @Override
        public boolean hasAuthorizedAccess() {
            return authorized;
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
    }
}
