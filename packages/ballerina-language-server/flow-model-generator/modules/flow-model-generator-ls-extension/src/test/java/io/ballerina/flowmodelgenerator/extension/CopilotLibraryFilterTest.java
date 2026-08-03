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
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.GetSelectedLibrariesRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Tests for the Copilot Library Service getFilteredLibraries method.
 *
 * @since 1.0.0
 */
public class CopilotLibraryFilterTest extends AbstractLSTest {

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("get_filtered_libraries.json")},
                {Path.of("get_filtered_libraries_trigger_salesforce.json")},
                {Path.of("get_filtered_libraries_salesforce.json")},
                {Path.of("get_filtered_libraries_trigger_github.json")},
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        // Create request with library names to filter and mode
        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(
                testConfig.libNames().toArray(new String[0]));
        JsonElement response = getResponse(request);

        JsonArray actualLibraries = response.getAsJsonObject().getAsJsonArray("libraries");

        boolean assertFailure = false;

        if (actualLibraries == null) {
            log.info("No libraries array found in response");
            assertFailure = true;
        } else if (actualLibraries.size() != testConfig.expectedLibraries().size()) {
            log.info("Expected " + testConfig.expectedLibraries().size() + " libraries, but got " +
                    actualLibraries.size());
            assertFailure = true;
        } else {
            // Verify that each returned library is a complete object (not just name and description)
            for (int i = 0; i < actualLibraries.size(); i++) {
                JsonObject actualLibrary = actualLibraries.get(i).getAsJsonObject();
                String expectedLibraryName = testConfig.expectedLibraries().get(i).name;

                if (!actualLibrary.has("name")) {
                    log.info("Library object at index " + i + " missing 'name' field");
                    assertFailure = true;
                    break;
                }

                String actualLibraryName = actualLibrary.get("name").getAsString();
                if (!actualLibraryName.equals(expectedLibraryName)) {
                    log.info("Library mismatch at index " + i + ": expected '" + expectedLibraryName + "', got '" +
                            actualLibraryName + "'");
                    assertFailure = true;
                    break;
                }

                // Verify that this is a full library object (should have more than just name and description)
                if (actualLibrary.entrySet().size() <= 2) {
                    log.info("Library object at index " + i + " appears to be limited (only has " +
                            actualLibrary.entrySet().size() + " fields)");
                    assertFailure = true;
                    break;
                }
            }
        }

        if (assertFailure) {
            // updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void testTriggerSalesforceExcluded() throws IOException {
        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(
                new String[]{"ballerinax/trigger.salesforce"});
        JsonElement response = getResponse(request);
        JsonArray libraries = response.getAsJsonObject().getAsJsonArray("libraries");

        Assert.assertNotNull(libraries, "Libraries array should not be null");
        Assert.assertTrue(libraries.isEmpty(),
                "trigger.salesforce should be excluded and return empty libraries");
    }

    @Test
    public void testDocumentationIncludedForWhitelistedOrgs() throws IOException {
        // Documentation is whitelisted per organization (CopilotLibraryManager.DOC_WHITELIST_ORGS),
        // so both ballerinax/salesforce and ballerina/http carry a readme. Both must also still
        // return their full runtime payload (clients/typeDefs).
        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(
                new String[]{"ballerinax/salesforce", "ballerina/http"});
        JsonObject response = getResponse(request);
        JsonArray libraries = response.getAsJsonArray("libraries");

        Assert.assertNotNull(libraries, "Libraries array should not be null");
        Map<String, JsonObject> byName = new HashMap<>();
        for (JsonElement libElement : libraries) {
            JsonObject lib = libElement.getAsJsonObject();
            byName.put(lib.get("name").getAsString(), lib);
        }
        Assert.assertEquals(byName.keySet(), Set.of("ballerinax/salesforce", "ballerina/http"));

        // salesforce is a connector: API lives on the client, so module-level functions
        // is naturally empty. clients/typeDefs prove the semantic model pass ran.
        JsonObject salesforce = byName.get("ballerinax/salesforce");
        assertHasNonEmptyArray(salesforce, "clients");
        assertHasNonEmptyArray(salesforce, "typeDefs");
        Assert.assertTrue(salesforce.has("readme"),
                "ballerinax/salesforce should have readme as ballerinax is whitelisted");
        Assert.assertFalse(salesforce.get("readme").getAsString().isEmpty(),
                "ballerinax/salesforce readme should not be empty");

        JsonObject http = byName.get("ballerina/http");
        assertHasNonEmptyArray(http, "clients");
        assertHasNonEmptyArray(http, "typeDefs");
        assertHasNonEmptyArray(http, "functions");
        Assert.assertTrue(http.has("readme"),
                "ballerina/http should have readme as ballerina is whitelisted");
        Assert.assertFalse(http.get("readme").getAsString().isEmpty(),
                "ballerina/http readme should not be empty");
    }

    private static void assertHasNonEmptyArray(JsonObject lib, String field) {
        String name = lib.get("name").getAsString();
        Assert.assertTrue(lib.has(field), name + " should have '" + field + "' field");
        Assert.assertFalse(lib.getAsJsonArray(field).isEmpty(),
                name + " '" + field + "' should not be empty");
    }

    /**
     * Verifies that getFilteredLibraries for ballerinax/trigger.github returns a fully-populated
     * services array sourced from the SQLite service-index. Expected 10 service-type entries
     * (IssuesService, PullRequestService, etc.) each with a github:Listener and non-empty remote
     * methods.
     */
    @Test
    public void testTriggerGithubServicesFullyPopulated() throws IOException {
        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(
                new String[]{"ballerinax/trigger.github"});
        JsonObject response = getResponse(request);
        JsonArray libraries = response.getAsJsonArray("libraries");

        Assert.assertNotNull(libraries, "libraries array should not be null");
        Assert.assertEquals(libraries.size(), 1, "should return exactly one library");

        JsonObject library = libraries.get(0).getAsJsonObject();
        Assert.assertEquals(library.get("name").getAsString(), "ballerinax/trigger.github");

        Assert.assertTrue(library.has("services"), "library should have a 'services' field");
        JsonArray services = library.getAsJsonArray("services");

        Set<String> expectedServiceTypes = new LinkedHashSet<>(List.of(
                "IssuesService", "IssueCommentService", "PullRequestService",
                "PullRequestReviewService", "PullRequestReviewCommentService",
                "ReleaseService", "LabelService", "MilestoneService",
                "PushService", "ProjectCardService"));

        Set<String> actualServiceTypes = new LinkedHashSet<>();
        for (JsonElement svcElement : services) {
            JsonObject svc = svcElement.getAsJsonObject();

            Assert.assertEquals(svc.get("type").getAsString(), "fixed",
                    "trigger.github services should be type=fixed");

            Assert.assertTrue(svc.has("name"),
                    "service entry should expose 'name' so consumers can identify the channel");
            actualServiceTypes.add(svc.get("name").getAsString());

            Assert.assertTrue(svc.has("listener"), "service should have a listener");
            JsonObject listener = svc.getAsJsonObject("listener");
            Assert.assertEquals(listener.get("name").getAsString(), "github:Listener");
            Assert.assertTrue(listener.has("parameters"), "listener should have parameters");

            Assert.assertTrue(svc.has("methods"), "service should have methods");
            JsonArray methods = svc.getAsJsonArray("methods");
            Assert.assertFalse(methods.isEmpty(), "methods array should not be empty");

            for (JsonElement methodElement : methods) {
                JsonObject method = methodElement.getAsJsonObject();
                Assert.assertTrue(method.has("name"), "method should have a name");
                Assert.assertEquals(method.get("type").getAsString(), "remote",
                        "trigger.github methods should be remote");
                Assert.assertTrue(method.has("parameters"), "method should have parameters");
                Assert.assertTrue(method.has("return"), "method should have a return");
            }
        }

        Assert.assertEquals(services.size(), expectedServiceTypes.size(),
                "expected " + expectedServiceTypes.size() + " service entries, got " + services.size());
        Assert.assertEquals(actualServiceTypes, expectedServiceTypes,
                "service type names do not match expected set");
    }

    /**
     * Calls getFilteredLibraries for every library indexed in service-index.sqlite and asserts
     * each returned library carries at least one service. Guards against regressions that
     * silently drop a library's services (e.g. a denylist bug or a loader misrouting entries).
     */
    // Disabled: requires service-index regeneration. Re-enable after regeneration.
    @Test(enabled = false)
    public void testIndexedLibraryServicesPopulated() throws IOException {
        String[] libraryNames = {
                // historical inbuilt-triggers set (nats and java.jms removed - not in DB)
                "ballerinax/kafka",
                "ballerinax/rabbitmq",
                "ballerina/mqtt",
                "ballerina/ftp",
                "ballerinax/asb",
                "ballerinax/salesforce",
                "ballerinax/trigger.github",
                // additional libraries now unlocked by removing the denylist
                "ballerina/ai",
                "ballerina/graphql",
                "ballerina/http",
                "ballerina/tcp",
                "ballerinax/mssql",
                "ballerinax/postgresql",
                "ballerinax/solace",
                "ballerinax/trigger.twilio"
        };

        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(libraryNames);
        JsonObject response = getResponse(request);
        JsonArray libraries = response.getAsJsonArray("libraries");
        Assert.assertNotNull(libraries, "libraries array should not be null");

        Map<String, JsonObject> byName = new HashMap<>();
        for (JsonElement libElement : libraries) {
            JsonObject lib = libElement.getAsJsonObject();
            byName.put(lib.get("name").getAsString(), lib);
        }

        Assert.assertEquals(libraries.size(), libraryNames.length,
                "should return one entry per requested library");

        for (String libraryName : libraryNames) {
            JsonObject lib = byName.get(libraryName);
            Assert.assertNotNull(lib, libraryName + " should be present in response");
            Assert.assertTrue(lib.has("services"), libraryName + " should have a 'services' field");
            JsonArray services = lib.getAsJsonArray("services");
            Assert.assertFalse(services.isEmpty(),
                    libraryName + " should expose at least one service");
        }
    }

    /**
     * Verifies that the Copilot listener-name enricher rewrites {@code postgresql:Listener}
     * to {@code postgresql:CdcListener} (and same for mssql) for SQLite-sourced services,
     * while leaving canonical {@code Listener}-class libraries untouched. Generic-services
     * entries (e.g. ballerina/http) ship a bare {@code "Listener"} string and are also
     * left untouched because their listener.name has no module prefix.
     */
    // Disabled: requires service-index regeneration. Re-enable after regeneration.
    @Test(enabled = false)
    public void testCdcListenerNameOverride() throws IOException {
        GetSelectedLibrariesRequest request = new GetSelectedLibrariesRequest(new String[]{
                "ballerinax/postgresql",
                "ballerinax/mssql",
                "ballerinax/kafka",
                "ballerina/http"
        });
        JsonObject response = getResponse(request);
        JsonArray libraries = response.getAsJsonArray("libraries");
        Assert.assertNotNull(libraries, "libraries array should not be null");

        Map<String, JsonObject> byName = new HashMap<>();
        for (JsonElement libElement : libraries) {
            JsonObject lib = libElement.getAsJsonObject();
            byName.put(lib.get("name").getAsString(), lib);
        }

        // postgresql/mssql: every prefixed listener.name must be rewritten to *:CdcListener.
        assertEveryPrefixedListenerEquals(byName.get("ballerinax/postgresql"), "postgresql:CdcListener");
        assertEveryPrefixedListenerEquals(byName.get("ballerinax/mssql"), "mssql:CdcListener");

        // kafka: only one SQLite-sourced service, must remain kafka:Listener.
        assertEveryPrefixedListenerEquals(byName.get("ballerinax/kafka"), "kafka:Listener");

        // http: SQLite-sourced entry must remain http:Listener; the bare "Listener" entry
        // from generic-services.json is intentionally left alone (no module prefix to anchor on).
        JsonObject http = byName.get("ballerina/http");
        Assert.assertNotNull(http);
        boolean foundHttpListener = false;
        for (JsonElement svcElement : http.getAsJsonArray("services")) {
            String name = svcElement.getAsJsonObject().getAsJsonObject("listener").get("name").getAsString();
            Assert.assertNotEquals(name, "http:CdcListener", "ballerina/http must not be rewritten as CDC");
            if (name.equals("http:Listener")) {
                foundHttpListener = true;
            }
        }
        Assert.assertTrue(foundHttpListener, "ballerina/http should still emit at least one http:Listener entry");
    }

    private static void assertEveryPrefixedListenerEquals(JsonObject library, String expected) {
        Assert.assertNotNull(library, "library must be present in response");
        String libName = library.get("name").getAsString();
        JsonArray services = library.getAsJsonArray("services");
        Assert.assertFalse(services.isEmpty(), libName + " services should not be empty");
        for (JsonElement svcElement : services) {
            JsonObject svc = svcElement.getAsJsonObject();
            Assert.assertTrue(svc.has("listener"), libName + " service should have a listener");
            String name = svc.getAsJsonObject("listener").get("name").getAsString();
            if (name.contains(":")) {
                Assert.assertEquals(name, expected,
                        libName + " listener.name expected '" + expected + "' got '" + name + "'");
            }
        }
    }

    @Override
    protected String getResourceDir() {
        return "copilot_library";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return CopilotLibraryFilterTest.class;
    }

    @Override
    protected String getApiName() {
        return "getFilteredLibraries";
    }

    @Override
    protected String getServiceName() {
        return "copilotLibraryManager";
    }

    /**
     * Test configuration record for filtered libraries test.
     *
     * @param description The description of the test
     * @param libNames Array of library names to filter
     * @param mode The mode to test ("CORE" or "HEALTHCARE")
     * @param expectedLibraries The expected list of libraries
     */
    public record TestConfig(String description, List<String> libNames, String mode, List<Library> expectedLibraries) {

        public String mode() {
            return mode == null ? "CORE" : mode;
        }
    }

    public record Library(String name, String description, List<Object> typeDefs, List<Object> clients,
                          List<Object> functions) {
    }
}
