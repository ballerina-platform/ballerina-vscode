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

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.extension.request.ExpressionEditorDiagnosticsRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Test cases for the flow model diagnostics API.
 *
 * @since 1.0.0
 */
public class FlowModelDiagnosticsTest extends AbstractLSTest {

    private static final String ADD_FORM_WITHOUT_CONFIG_FILE = "config_variable17.json";

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourcePath = getSourcePath(testConfig.source());

        notifyDidOpen(sourcePath);
        FlowModelSourceGeneratorRequest request =
                new FlowModelSourceGeneratorRequest(sourcePath, testConfig.flowNode());
        JsonElement flowNode = getResponse(request).get("flowNode");
        notifyDidClose(sourcePath);

        if (!flowNode.equals(testConfig.output())) {
            TestConfig updateConfig = new TestConfig(testConfig.source(), testConfig.description(),
                    testConfig.flowNode(), flowNode);
//            updateConfig(configJsonPath, updateConfig);
            compareJsonElements(flowNode, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void testMultipleRequests() throws IOException, InterruptedException {
        // Load the template test config
        Path configJsonPath = configDir.resolve("variable1.json");
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourcePath = getSourcePath(testConfig.source());
        notifyDidOpen(sourcePath);

        // Fire multiple requests with the same flow node to test race conditions
        JsonElement flowNode = testConfig.flowNode();
        for (int i = 0; i < 3; i++) {
            getResponse(new FlowModelSourceGeneratorRequest(sourcePath, flowNode));
            Thread.sleep(50);
        }

        // Make a final request and verify it returns the expected response
        FlowModelSourceGeneratorRequest finalReq = new FlowModelSourceGeneratorRequest(sourcePath, flowNode);
        JsonObject response = getResponse(finalReq);
        notifyDidClose(sourcePath);
        Assert.assertEquals(response.get("flowNode"), testConfig.output());
    }

    @Test
    public void testImportKeptByAnExpressionCheckDoesNotReachNodeCheck() throws IOException {
        Path configJsonPath = configDir.resolve("variable1.json");
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourcePath = getSourcePath(testConfig.source());
        JsonObject flowNode = testConfig.flowNode().deepCopy().getAsJsonObject();
        JsonObject properties = flowNode.getAsJsonObject("properties");
        properties.getAsJsonObject("expression").addProperty("value", "crypto:hashMd5([])");
        properties.getAsJsonObject("type").addProperty("value", "byte[]");
        JsonObject cert = JsonParser.parseString("""
                {"types": [{"fieldType": "EXPRESSION", "ballerinaType": "crypto:TrustStore", "selected": true}],
                 "imports": {"crypto": "ballerina/crypto:2.13.0"}}""").getAsJsonObject();
        notifyDidOpen(sourcePath);

        JsonElement fresh = getResponse(new FlowModelSourceGeneratorRequest(sourcePath, flowNode)).get("flowNode");
        getResponse(new ExpressionEditorDiagnosticsRequest(sourcePath, new ExpressionEditorContext.Info("5",
                LinePosition.from(1, 0), 0, 0, null, cert, "cert")), "expressionEditor/diagnostics");
        JsonElement afterCheck = getResponse(new FlowModelSourceGeneratorRequest(sourcePath, flowNode))
                .get("flowNode");
        notifyDidClose(sourcePath);

        Assert.assertTrue(fresh.toString().contains("undefined module"), fresh.toString());
        Assert.assertEquals(afterCheck, fresh);
    }

    @Test
    public void testNewConfigurableWithoutConfigFile() throws IOException {
        // The Add form names config.bal, which a package may not have yet
        Path configJsonPath = configDir.resolve(ADD_FORM_WITHOUT_CONFIG_FILE);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String sourcePath = getSourcePath(testConfig.source());
        String configFilePath = Path.of(sourcePath).resolveSibling("config.bal").toString();

        notifyDidOpen(sourcePath);
        FlowModelSourceGeneratorRequest request =
                new FlowModelSourceGeneratorRequest(configFilePath, testConfig.flowNode());
        JsonElement flowNode = getResponse(request).get("flowNode");
        notifyDidClose(sourcePath);
        Assert.assertEquals(flowNode, testConfig.output(), testConfig.description());
    }

    @Override
    protected String[] skipList() {
        //This test cannot be run in the build due to user-specific paths in the test config.
        return new String[]{
                "persist_query.json",
                ADD_FORM_WITHOUT_CONFIG_FILE
        };
    }

    @Override
    protected String getResourceDir() {
        return "flow_model_diagnostics";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return FlowModelDiagnosticsTest.class;
    }

    @Override
    protected String getApiName() {
        return "diagnostics";
    }

    private record TestConfig(String source, String description, JsonElement flowNode, JsonElement output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
