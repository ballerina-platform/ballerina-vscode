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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.core.copilot.model.Library;
import io.ballerina.flowmodelgenerator.core.copilot.model.ModelToJsonConverter;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.flowmodelgenerator.core.copilot.service.ServiceLoader;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Tests for the DB-backed Copilot service loader.
 * Verifies that the service-index.sqlite path produces non-empty, well-formed service
 * descriptors for all covered libraries and persists them to JSON for manual review.
 *
 * @since 1.7.0
 */
public class CopilotLibraryServicesParityTest {

    private static final Gson PRETTY = new GsonBuilder().setPrettyPrinting().create();
    private static final Path OUTPUT_DIR = Path.of("build", "services-comparison");

    /**
     * The services as they go on the wire.
     *
     * <p>Routed through {@link ModelToJsonConverter} rather than a bare {@code Gson}, because that is the
     * one place a Copilot service becomes JSON in production. Asserting on this output keeps these tests a
     * check on the <b>wire contract</b> — a wrong {@code @SerializedName} or a collection that stopped being
     * omitted when empty fails here, which reading the POJOs directly would not catch.
     */
    private static JsonArray wireJson(List<Service> services) {
        Library library = new Library("test", "test");
        library.setServices(services);
        return ModelToJsonConverter.libraryToJson(library).getAsJsonObject().getAsJsonArray("services");
    }

    @DataProvider(name = "coveredLibraries")
    public Object[][] coveredLibraries() {
        return new Object[][]{
                {"ballerinax/kafka"},
                {"ballerinax/asb"},
                {"ballerinax/rabbitmq"},
                {"ballerina/ftp"},
                {"ballerina/mqtt"},
                {"ballerinax/salesforce"},
                {"ballerinax/trigger.github"},
        };
    }

    @DataProvider(name = "allLibraries")
    public Object[][] allLibraries() {
        return new Object[][]{
                {"ballerinax/kafka"},
                {"ballerinax/asb"},
                {"ballerinax/rabbitmq"},
                {"ballerina/ftp"},
                {"ballerina/mqtt"},
                {"ballerinax/salesforce"},
                {"ballerinax/trigger.github"},
                {"ballerina/http"},
                {"ballerina/graphql"},
                {"ballerina/ai"},
        };
    }

    @Test(dataProvider = "coveredLibraries")
    public void testServiceLoaderProducesNonEmptyResults(String libraryName) {
        JsonArray services = wireJson(ServiceLoader.loadAllServices(libraryName));

        Assert.assertFalse(services.isEmpty(),
                "loadAllServices returned empty for covered library: " + libraryName);

        // Verify each service entry has the expected structure
        for (int i = 0; i < services.size(); i++) {
            JsonObject svc = services.get(i).getAsJsonObject();
            Assert.assertTrue(svc.has("type"), "Missing 'type' in service entry " + i + " for " + libraryName);
            Assert.assertEquals(svc.get("type").getAsString(), "fixed",
                    "Expected type 'fixed' for trigger service " + libraryName);
            Assert.assertTrue(svc.has("listener"),
                    "Missing 'listener' in service entry " + i + " for " + libraryName);

            JsonObject listener = svc.getAsJsonObject("listener");
            Assert.assertTrue(listener.has("name"), "Missing listener name for " + libraryName);
            Assert.assertTrue(listener.has("parameters"), "Missing listener parameters for " + libraryName);
        }
    }

    @Test(dataProvider = "allLibraries")
    public void dumpServicesJson(String libraryName) throws IOException {
        JsonArray services = wireJson(ServiceLoader.loadAllServices(libraryName));

        String shortName = libraryName.contains("/")
                ? libraryName.substring(libraryName.indexOf('/') + 1)
                : libraryName;
        shortName = shortName.replace('.', '_');

        Path libDir = OUTPUT_DIR.resolve(shortName);
        Files.createDirectories(libDir);
        Files.writeString(libDir.resolve("services.json"), PRETTY.toJson(services));
    }

    @Test
    public void testGenericServicesProduced() {
        for (String lib : new String[]{"ballerina/http", "ballerina/graphql"}) {
            JsonArray services = wireJson(ServiceLoader.loadAllServices(lib));
            Assert.assertFalse(services.isEmpty(),
                    "loadAllServices returned empty for generic library: " + lib);

            boolean hasGeneric = false;
            for (JsonElement element : services) {
                JsonObject svc = element.getAsJsonObject();
                if (svc.has("type") && "generic".equals(svc.get("type").getAsString())) {
                    hasGeneric = true;
                    break;
                }
            }
            Assert.assertTrue(hasGeneric,
                    "Expected at least one 'generic' service for " + lib);
        }
    }

    @Test
    public void testUncoveredLibraryReturnsEmpty() {
        for (String lib : new String[]{"ballerinax/jms", "ballerinax/nats"}) {
            JsonArray services = wireJson(ServiceLoader.loadAllServices(lib));
            Assert.assertTrue(services.isEmpty(),
                    "Expected empty services for uncovered library: " + lib);
        }
    }
}
