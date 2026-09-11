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

    @Test(description = "Authorized access scopes by user-packages and omits org")
    public void testAuthorizedAccessScopesByUserPackages() {
        RecordingCentral central = new RecordingCentral(true);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "organization", "q", "chat")).execute();

        Assert.assertEquals(central.lastQuery.get("q"), "keywords:\"Type/Agent\" AND chat");
        Assert.assertEquals(central.lastQuery.get("user-packages"), "true");
        Assert.assertFalse(central.lastQuery.containsKey("org"));
    }

    @Test(description = "Unauthorized access falls back to the current package's org")
    public void testUnauthorizedAccessFallsBackToCurrentOrg() {
        RecordingCentral central = new RecordingCentral(false);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "organization", "q", "")).execute();

        Assert.assertEquals(central.lastQuery.get("q"), "keywords:\"Type/Agent\"");
        Assert.assertEquals(central.lastQuery.get("org"), "agent_search_org");
        Assert.assertFalse(central.lastQuery.containsKey("user-packages"));
    }

    @Test(description = "An empty query on the 'all' source stays offline and never calls Central")
    public void testAllSourceWithEmptyQueryDoesNotCallCentral() {
        RecordingCentral central = new RecordingCentral(true);
        RemoteCentral.setTestInstance(central);

        new AgentSearchCommand(project, POSITION, Map.of("source", "all", "q", "")).execute();

        Assert.assertNull(central.lastQuery, "an empty query must resolve from the bundled landing list, not Central");
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

    private static PackageResponse packageResponse(PackageResponse.Package pkg) {
        return new PackageResponse(List.of(pkg), List.of(), Map.of(), 1, 0, 1);
    }

    private static PackageResponse.Package samplePackage() {
        return new PackageResponse.Package(1, "wso2", "support_agent", "1.2.3", null, null, false, null, null,
                null, null, null, "Support agent package", null, false, List.of(), List.of(), null, List.of(),
                null, null, null, 0L, 0, null, List.of(), null, null);
    }

    /** Records the query map passed to {@code searchPackages}; every other method is unused by the paths under test. */
    private static final class RecordingCentral implements CentralAPI {

        private final boolean authorized;
        private final PackageResponse response;
        private final RuntimeException failure;
        private Map<String, String> lastQuery;

        private RecordingCentral(boolean authorized) {
            this(authorized, new PackageResponse(List.of(), List.of(), Map.of(), 0, 0, 0));
        }

        private RecordingCentral(boolean authorized, PackageResponse response) {
            this.authorized = authorized;
            this.response = response;
            this.failure = null;
        }

        private RecordingCentral(RuntimeException failure) {
            this.authorized = false;
            this.response = null;
            this.failure = failure;
        }

        @Override
        public PackageResponse searchPackages(Map<String, String> queryMap) {
            lastQuery = new HashMap<>(queryMap);
            if (failure != null) {
                throw failure;
            }
            return response;
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
