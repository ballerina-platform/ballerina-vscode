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

package io.ballerina.flowmodelgenerator.extension.workflowmanager;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.extension.request.GenActivityRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Tests for the WorkflowManagerService genActivity API.
 *
 * @since 1.5.0
 */
public class GenActivityTest extends AbstractLSTest {

    private static final Type textEditListType = new TypeToken<Map<String, List<TextEdit>>>() {
    }.getType();

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("gen_activity_remote_action.json")},
                {Path.of("gen_activity_remote_action_no_desc.json")},
                {Path.of("gen_activity_resource_action.json")}
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        String filePath = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, testConfig.diagram(),
                testConfig.activityName(), testConfig.activityParameters(), testConfig.activityDescription(),
                testConfig.connection(), null, false);
        JsonObject jsonMap = getResponseAndCloseFile(request, testConfig.source()).getAsJsonObject("textEdits");

        Map<String, List<TextEdit>> actualTextEdits = gson.fromJson(jsonMap, textEditListType);

        boolean assertFailure = actualTextEdits.size() != testConfig.output().size();

        Map<String, List<TextEdit>> newMap = new HashMap<>();
        for (Map.Entry<String, List<TextEdit>> entry : actualTextEdits.entrySet()) {
            Path fullPath = Paths.get(entry.getKey());
            String relativePath = sourceDir.relativize(fullPath).toString();

            List<TextEdit> textEdits = testConfig.output().get(relativePath.replace("\\", "/"));
            if (textEdits == null) {
                log.info("No text edits found for the file: " + relativePath);
                assertFailure = true;
            } else if (!assertArray("text edits", entry.getValue(), textEdits)) {
                assertFailure = true;
            }

            newMap.put(relativePath, entry.getValue());
        }

        if (assertFailure) {
            TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.description(),
                    testConfig.activityName(), testConfig.activityDescription(), testConfig.activityParameters(),
                    testConfig.connection(), testConfig.diagram(), newMap);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void testUnsupportedNodeKind() throws IOException {
        JsonObject response = sendMutatedRequest(diagram ->
                diagram.getAsJsonObject("codedata").addProperty("node", "IF"), null);
        assertGracefulError(response, "unsupported node kind");
    }

    @Test
    public void testUnresolvableConnection() throws IOException {
        JsonObject response = sendMutatedRequest(diagram -> { }, "nonExistentConnection");
        assertGracefulError(response, "unresolvable connection");
    }

    @Test
    public void testStreamCollectedReturn() throws IOException {
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String filePath = sourceDir.resolve(base.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, base.diagram(), base.activityName(),
                base.activityParameters(), base.activityDescription(), base.connection(), "string", false);

        JsonObject jsonMap = getResponseAndCloseFile(request, base.source()).getAsJsonObject("textEdits");
        String generated = jsonMap.toString();
        // The stream result is collected into an array of the element type and returned.
        Assert.assertTrue(generated.contains("var streamResult ="),
                "Expected an intermediate stream variable, got: " + generated);
        // The formatter may wrap the query expression across lines, so assert the parts.
        Assert.assertTrue(generated.contains("string[] result = check from var item in streamResult"),
                "Expected the stream to be collected into string[], got: " + generated);
        Assert.assertTrue(generated.contains("select item;"),
                "Expected the collect query's select clause, got: " + generated);
    }

    @Test
    public void testStreamCollectedCompoundElementType() throws IOException {
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String filePath = sourceDir.resolve(base.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, base.diagram(), base.activityName(),
                base.activityParameters(), base.activityDescription(), base.connection(),
                "byte[] & readonly", false);

        JsonObject jsonMap = getResponseAndCloseFile(request, base.source()).getAsJsonObject("textEdits");
        String generated = jsonMap.toString();
        // Compound element types must be parenthesized so the array applies to the whole type.
        Assert.assertTrue(generated.contains("(byte[] & readonly)[] result = check from var item in streamResult"),
                "Expected a parenthesized compound array type, got: " + generated);
    }

    @Test
    public void testConnectionAsParam() throws IOException {
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String filePath = sourceDir.resolve(base.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, base.diagram(), base.activityName(),
                base.activityParameters(), base.activityDescription(), base.connection(), null, true);

        JsonObject jsonMap = getResponseAndCloseFile(request, base.source()).getAsJsonObject("textEdits");
        String generated = jsonMap.toString();
        // The connection becomes the first parameter and the action call targets it.
        Assert.assertTrue(generated.contains("http:Client connection"),
                "Expected the connection as the first activity parameter, got: " + generated);
        Assert.assertTrue(generated.contains("connection->get("),
                "Expected the action call to target the connection parameter, got: " + generated);
        // Referencing http:Client in the signature requires the module import, which must be added to
        // the generated activity's file (functions.bal).
        Assert.assertTrue(generated.contains("import ballerina/http"),
                "Expected the http module import for the http:Client parameter, got: " + generated);
    }

    @Test
    public void testActivityAndImportsRoutedToFunctionsBal() throws IOException {
        // Activities are always generated in functions.bal, even when the request targets another file,
        // so the activity and any import it pulls in (here the http:Client connection parameter) never
        // shift the requesting file's positions. Target connections.bal to prove the routing.
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String target = "activity_from_connection/connections.bal";
        String filePath = sourceDir.resolve(target).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, base.diagram(), base.activityName(),
                base.activityParameters(), base.activityDescription(), base.connection(), null, true);

        JsonObject jsonMap = getResponseAndCloseFile(request, target).getAsJsonObject("textEdits");
        Map<String, List<TextEdit>> edits = gson.fromJson(jsonMap, textEditListType);

        Assert.assertFalse(edits.isEmpty(), "Expected text edits to be generated");
        for (String key : edits.keySet()) {
            Assert.assertTrue(key.replace("\\", "/").endsWith("functions.bal"),
                    "Expected all edits to target functions.bal, but got: " + key);
        }
        String generated = jsonMap.toString();
        Assert.assertTrue(generated.contains("import ballerina/http"),
                "Expected the http import to be added to functions.bal, got: " + generated);
        Assert.assertTrue(generated.contains("http:Client connection"),
                "Expected the connection parameter in functions.bal, got: " + generated);
    }

    @Test
    public void testParamDocFallback() throws IOException {
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        // Blank the parameter descriptions: every parameter must still get a doc line so the
        // generated activity raises no undocumented-parameter (BCE20001) warnings.
        JsonObject activityParameters = base.activityParameters().getAsJsonObject().deepCopy();
        JsonObject paramsValue = activityParameters.getAsJsonObject("value");
        for (String key : paramsValue.keySet()) {
            paramsValue.getAsJsonObject(key).getAsJsonObject("value")
                    .getAsJsonObject("parameterDescription").addProperty("value", "");
        }

        String filePath = sourceDir.resolve(base.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, base.diagram(), base.activityName(),
                activityParameters, base.activityDescription(), base.connection(), null, false);
        JsonObject jsonMap = getResponseAndCloseFile(request, base.source()).getAsJsonObject("textEdits");
        String generated = jsonMap.toString();
        Assert.assertTrue(generated.contains("+ base - The base value"),
                "Expected a fallback doc line for 'base', got: " + generated);
        Assert.assertTrue(generated.contains("+ symbols - The symbols value"),
                "Expected a fallback doc line for 'symbols', got: " + generated);
    }

    @Test
    public void testUnusedPropertyImportsDropped() throws IOException {
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        JsonObject diagram = base.diagram().getAsJsonObject().deepCopy();
        // Simulate the editor-type imports the action node template carries (e.g. mime for the
        // message editor) that the generated data-only signature never references.
        JsonObject imports = new JsonObject();
        imports.addProperty("mime", "ballerina/mime");
        diagram.getAsJsonObject("properties").getAsJsonObject("path").add("imports", imports);

        String filePath = sourceDir.resolve(base.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, diagram, base.activityName(),
                base.activityParameters(), base.activityDescription(), base.connection(), null, false);
        JsonObject jsonMap = getResponseAndCloseFile(request, base.source()).getAsJsonObject("textEdits");
        String generated = jsonMap.toString();
        Assert.assertFalse(generated.contains("import ballerina/mime"),
                "Property imports unused by the generated signature must be dropped, got: " + generated);
    }

    private JsonObject sendMutatedRequest(java.util.function.Consumer<JsonObject> diagramMutator,
                                          String connectionOverride) throws IOException {
        Path configJsonPath = configDir.resolve("gen_activity_remote_action.json");
        TestConfig base = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        JsonObject diagram = base.diagram().getAsJsonObject();
        diagramMutator.accept(diagram);

        String filePath = sourceDir.resolve(base.source()).toAbsolutePath().toString();
        GenActivityRequest request = new GenActivityRequest(filePath, diagram, base.activityName(),
                base.activityParameters(), base.activityDescription(),
                connectionOverride != null ? connectionOverride : base.connection(), null, false);

        // The shared getResponse helper fails the test when the response carries an errorMsg, so the
        // endpoint is invoked directly here to assert the graceful-error contract on the raw response.
        CompletableFuture<?> result = serviceEndpoint.request(getServiceName() + "/" + getApiName(), request);
        String response = TestUtil.getResponseString(result);
        return JsonParser.parseString(response).getAsJsonObject().getAsJsonObject("result");
    }

    private void assertGracefulError(JsonObject response, String scenario) {
        Assert.assertTrue(response.get("textEdits") == null || response.get("textEdits").isJsonNull(),
                "Expected no text edits for " + scenario);
        Assert.assertTrue(response.has("errorMsg") && !response.get("errorMsg").isJsonNull(),
                "Expected a graceful error message for " + scenario);
    }

    @Override
    protected String getResourceDir() {
        return "workflow_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return GenActivityTest.class;
    }

    @Override
    protected String getApiName() {
        return "genActivity";
    }

    @Override
    protected String getServiceName() {
        return "workflowManager";
    }

    /**
     * Represents the test configuration for the genActivity API.
     *
     * @param source              The source file path
     * @param description         The description of the test
     * @param activityName        The name of the activity function
     * @param activityDescription The description of the activity
     * @param activityParameters  The parameters of the activity function
     * @param connection          The name of the connection
     * @param diagram             The action call flow node
     * @param output              The expected text edits
     */
    private record TestConfig(String source, String description, String activityName, String activityDescription,
                              JsonElement activityParameters, String connection, JsonElement diagram,
                              Map<String, List<TextEdit>> output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
