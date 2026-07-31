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

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.core.copilot.CopilotLibraryManager;
import io.ballerina.flowmodelgenerator.core.copilot.model.Client;
import io.ballerina.flowmodelgenerator.core.copilot.model.Library;
import io.ballerina.flowmodelgenerator.core.copilot.model.LibraryFunction;
import io.ballerina.flowmodelgenerator.core.copilot.model.ModelToJsonConverter;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeDef;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;

/**
 * Verifies that {@code isDeprecated} surfaces on the copilot JSON for known real-world
 * deprecated APIs, and is omitted (not emitted as false) for non-deprecated siblings.
 *
 * @since 1.7.0
 */
public class CopilotDeprecationTest {

    @Test
    public void testSalesforceClientDeprecatedMethod() {
        CopilotLibraryManager manager = new CopilotLibraryManager();
        List<Library> libs = manager.loadFilteredLibraries(new String[]{"ballerinax/salesforce"});

        Assert.assertFalse(libs.isEmpty(), "Expected ballerinax/salesforce to resolve");
        Library salesforce = libs.get(0);
        Assert.assertNotNull(salesforce.getClients(), "salesforce should expose clients");
        Assert.assertFalse(salesforce.getClients().isEmpty(), "salesforce should have at least one client");

        Client client = salesforce.getClients().get(0);
        LibraryFunction apex = findFunction(client.getFunctions(), "apexRestExecute");
        Assert.assertNotNull(apex, "apexRestExecute should be present on salesforce client");
        Assert.assertEquals(apex.isDeprecated(), Boolean.TRUE,
                "apexRestExecute is @deprecated in ballerinax/salesforce and should be marked");

        // Pick a non-deprecated sibling: init is always present and not deprecated.
        LibraryFunction init = findFunction(client.getFunctions(), "init");
        Assert.assertNotNull(init, "init should be present on salesforce client");
        Assert.assertNull(init.isDeprecated(),
                "Non-deprecated methods must leave isDeprecated unset (lightweight shape)");

        // JSON-level contract: key absent for non-deprecated, present and true for deprecated.
        JsonObject salesforceJson = ModelToJsonConverter.libraryToJson(salesforce).getAsJsonObject();
        JsonObject clientJson = findByNameInArray(salesforceJson.getAsJsonArray("clients"), client.getName());
        Assert.assertNotNull(clientJson, "Client JSON missing for " + client.getName());
        JsonObject apexJson = findByNameInArray(clientJson.getAsJsonArray("functions"), "apexRestExecute");
        JsonObject initJson = findByNameInArray(clientJson.getAsJsonArray("functions"), "init");
        Assert.assertNotNull(apexJson);
        Assert.assertNotNull(initJson);
        Assert.assertTrue(apexJson.has("isDeprecated") && apexJson.get("isDeprecated").getAsBoolean(),
                "Deprecated method JSON must carry isDeprecated=true");
        Assert.assertFalse(initJson.has("isDeprecated"),
                "Non-deprecated method JSON must omit isDeprecated entirely");
    }

    // Disabled: deprecated fields on ListenerConfiguration exist only in ballerina/ftp >= 2.18.0,
    // but ballerina/ftp in build-config/ballerina_dependencies/Ballerina.toml is pinned to 2.16.0,
    // so CI resolves a version without them and the test fails. Re-enable after bumping it to >= 2.18.0.
    @Test(enabled = false)
    public void testFtpListenerConfigurationDeprecatedField() {
        CopilotLibraryManager manager = new CopilotLibraryManager();
        List<Library> libs = manager.loadFilteredLibraries(new String[]{"ballerina/ftp"});

        Assert.assertFalse(libs.isEmpty(), "Expected ballerina/ftp to resolve");
        Library ftp = libs.get(0);
        Assert.assertNotNull(ftp.getTypeDefs(), "ftp should expose typeDefs");

        TypeDef listenerConfig = findTypeDef(ftp.getTypeDefs(), "ListenerConfiguration");
        Assert.assertNotNull(listenerConfig, "ftp ListenerConfiguration should be present");
        Assert.assertNotNull(listenerConfig.getFields(), "ListenerConfiguration should have fields");

        long deprecatedFieldCount = listenerConfig.getFields().stream()
                .filter(f -> Boolean.TRUE.equals(f.isDeprecated()))
                .count();
        Assert.assertTrue(deprecatedFieldCount > 0,
                "Expected at least one deprecated field on ftp ListenerConfiguration");

        long nonDeprecatedFieldCount = listenerConfig.getFields().stream()
                .filter(f -> f.isDeprecated() == null)
                .count();
        Assert.assertTrue(nonDeprecatedFieldCount > 0,
                "Expected some non-deprecated fields on ftp ListenerConfiguration to prove "
                        + "the flag is not set uniformly");

        // JSON shape: deprecated fields carry the key, others omit it.
        JsonObject ftpJson = ModelToJsonConverter.libraryToJson(ftp).getAsJsonObject();
        JsonObject listenerConfigJson = findByNameInArray(ftpJson.getAsJsonArray("typeDefs"),
                "ListenerConfiguration");
        Assert.assertNotNull(listenerConfigJson);
        JsonArray fieldsJson = listenerConfigJson.getAsJsonArray("fields");

        boolean sawDeprecatedKey = false;
        boolean sawNonDeprecatedWithoutKey = false;
        for (int i = 0; i < fieldsJson.size(); i++) {
            JsonObject fieldJson = fieldsJson.get(i).getAsJsonObject();
            if (fieldJson.has("isDeprecated")) {
                Assert.assertTrue(fieldJson.get("isDeprecated").getAsBoolean(),
                        "isDeprecated must only ever serialize as true when present");
                sawDeprecatedKey = true;
            } else {
                sawNonDeprecatedWithoutKey = true;
            }
        }
        Assert.assertTrue(sawDeprecatedKey, "At least one field JSON must carry isDeprecated=true");
        Assert.assertTrue(sawNonDeprecatedWithoutKey,
                "At least one field JSON must omit isDeprecated (lightweight shape)");
    }

    private static LibraryFunction findFunction(List<LibraryFunction> functions, String name) {
        if (functions == null) {
            return null;
        }
        for (LibraryFunction f : functions) {
            if (name.equals(f.getName())) {
                return f;
            }
        }
        return null;
    }

    private static TypeDef findTypeDef(List<TypeDef> typeDefs, String name) {
        if (typeDefs == null) {
            return null;
        }
        for (TypeDef t : typeDefs) {
            if (name.equals(t.getName())) {
                return t;
            }
        }
        return null;
    }

    private static JsonObject findByNameInArray(JsonArray array, String name) {
        if (array == null) {
            return null;
        }
        for (JsonElement element : array) {
            JsonObject obj = element.getAsJsonObject();
            if (obj.has("name") && name.equals(obj.get("name").getAsString())) {
                return obj;
            }
        }
        return null;
    }
}
