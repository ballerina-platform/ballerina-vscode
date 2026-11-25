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
import com.google.gson.JsonParser;
import io.ballerina.flowmodelgenerator.extension.request.ConfigurableRenameRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.ballerinalang.langserver.util.TestUtil;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * The connection form's two configurable endpoints, as the webview calls them: the preview of an edited connection's
 * configurables ({@code getConnectionConfigurables}) and the Config.toml edits of renaming one
 * ({@code getConfigurableRenameEdits}), against a project with a Config.toml.
 *
 * @since 1.9.0
 */
public class ConnectionConfigurablesEndpointTest extends AbstractLSTest {

    private static final String PROJECT = "edited";

    @Override
    @Test(enabled = false)
    public void test(Path config) {
        // Each endpoint has its own test below.
    }

    @Override
    protected Object[] getConfigsList() {
        return new Object[0][];
    }

    @Test
    public void previewShowsTheConfigurablesAnEditedConnectionUses() throws IOException {
        JsonObject result = preview();
        Map<String, JsonObject> byPath = new HashMap<>();
        result.getAsJsonArray("configurables")
                .forEach(item -> byPath.put(item.getAsJsonObject().get("fieldPath").getAsString(),
                        item.getAsJsonObject()));

        // A configurable the connection already uses: its value from Config.toml, and where it is declared.
        JsonObject tokenUrl = byPath.get("auth.tokenUrl");
        Assert.assertEquals(tokenUrl.get("name").getAsString(), "sfSalesAuthTokenUrl");
        Assert.assertTrue(tokenUrl.get("existing").getAsBoolean());
        Assert.assertEquals(tokenUrl.get("value").getAsString(), "\"https://acme.my.salesforce.com/token\"");
        Assert.assertTrue(tokenUrl.getAsJsonObject("declaration").get("filePath").getAsString()
                .endsWith("config.bal"));
        // The form's key for the parameter's property.
        Assert.assertEquals(tokenUrl.get("key").getAsString(), "config");

        // One whose value Config.toml can't take back (a line break) shows no value, so the field keeps it.
        JsonObject secret = byPath.get("auth.clientSecret");
        Assert.assertTrue(secret.get("existing").getAsBoolean());
        Assert.assertFalse(secret.has("value"), secret.toString());

        // An edited connection's literals stay, unless the user makes them configurable.
        Assert.assertTrue(byPath.get("baseUrl").get("kept").getAsBoolean());

        // The argument as saving writes it, by the property's key: unchanged here.
        Assert.assertEquals(result.getAsJsonObject("arguments").get("config").getAsString(),
                "{baseUrl: \"https://acme.my.salesforce.com\", auth: {tokenUrl: sfSalesAuthTokenUrl, "
                        + "clientId: \"client\", clientSecret: sfSalesAuthClientSecret}}");
    }

    @Test
    public void renameEditsRenameTheConfigTomlKey() {
        JsonObject result = renameEdits("sfSalesAuthTokenUrl", "salesforceAuthUrl");
        Assert.assertFalse(result.has("errorMsg"), result.toString());
        JsonObject textEdits = result.getAsJsonObject("textEdits");
        Assert.assertEquals(textEdits.size(), 1, textEdits.toString());
        Map.Entry<String, JsonElement> configToml = textEdits.entrySet().iterator().next();
        Assert.assertTrue(configToml.getKey().endsWith("Config.toml"), configToml.getKey());
        JsonObject edit = configToml.getValue().getAsJsonArray().get(0).getAsJsonObject();
        Assert.assertEquals(edit.get("newText").getAsString(), "salesforceAuthUrl");
        Assert.assertEquals(edit.getAsJsonObject("range").getAsJsonObject("start").get("line").getAsInt(), 0);
    }

    @Test
    public void renameOntoANameTheModuleUsesIsRefused() {
        // The editor's rename would declare it a second time.
        Assert.assertEquals(renameEdits("sfSalesAuthTokenUrl", "sfSalesToken").get("errorMsg").getAsString(),
                "'sfSalesToken' is already used in this module. Choose another name.");
    }

    @Test
    public void renameOntoAConfigTomlKeyIsRefused() {
        Assert.assertEquals(renameEdits("sfSalesAuthTokenUrl", "salesforceTokenUrl").get("errorMsg").getAsString(),
                "Config.toml already has a value for 'salesforceTokenUrl'. Choose another name, or remove that "
                        + "value from Config.toml.");
    }

    private JsonObject preview() throws IOException {
        JsonObject diagram = JsonParser.parseString(Files.readString(resDir.resolve("edited_connection.json")))
                .getAsJsonObject().getAsJsonObject("diagram");
        String filePath = connectionsBal();
        // The form's template request loads the project, as the open editor has it loaded.
        getResponse(new FlowModelNodeTemplateRequest(filePath, LinePosition.from(0, 0),
                diagram.getAsJsonObject("codedata")), getServiceName() + "/getNodeTemplate");
        return getResponse(new FlowModelSourceGeneratorRequest(filePath, diagram),
                getServiceName() + "/getConnectionConfigurables");
    }

    private JsonObject renameEdits(String name, String newName) {
        // Read directly: getResponse fails the test on a refusal.
        CompletableFuture<?> result = serviceEndpoint.request(getServiceName() + "/getConfigurableRenameEdits",
                new ConfigurableRenameRequest(connectionsBal(), name, newName));
        return JsonParser.parseString(TestUtil.getResponseString(result)).getAsJsonObject()
                .getAsJsonObject("result");
    }

    private String connectionsBal() {
        return sourceDir.resolve(PROJECT).resolve("connections.bal").toAbsolutePath().toString();
    }

    @Override
    protected String getResourceDir() {
        return "connection_configurables_endpoint";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ConnectionConfigurablesEndpointTest.class;
    }

    @Override
    protected String getApiName() {
        return "getConnectionConfigurables";
    }
}
