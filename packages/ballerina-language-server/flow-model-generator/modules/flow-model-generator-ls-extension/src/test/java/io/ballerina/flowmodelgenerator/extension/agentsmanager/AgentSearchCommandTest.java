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
 * Tests the Central-search query parameters built by {@link AgentSearchCommand} for the
 * {@code organization}-scoped source, via a recording {@link CentralAPI} test double.
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

    /** Records the query map passed to {@code searchPackages}; every other method is unused by the paths under test. */
    private static final class RecordingCentral implements CentralAPI {

        private final boolean authorized;
        private Map<String, String> lastQuery;

        private RecordingCentral(boolean authorized) {
            this.authorized = authorized;
        }

        @Override
        public PackageResponse searchPackages(Map<String, String> queryMap) {
            lastQuery = new HashMap<>(queryMap);
            return new PackageResponse(List.of(), List.of(), Map.of(), 0, 0, 0);
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
