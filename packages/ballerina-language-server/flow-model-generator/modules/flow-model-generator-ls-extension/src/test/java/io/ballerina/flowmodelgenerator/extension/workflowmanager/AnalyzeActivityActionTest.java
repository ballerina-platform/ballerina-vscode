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

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.ballerina.flowmodelgenerator.extension.request.AnalyzeActivityActionRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.ballerinalang.langserver.util.TestUtil;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

/**
 * Tests for the WorkflowManagerService analyzeActivityAction API: derivation of the activity
 * signature (parameters, data-type filtering, docs, return type) from a connector action.
 *
 * @since 1.5.0
 */
public class AnalyzeActivityActionTest extends AbstractLSTest {

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[0][];
    }

    @Override
    @Test(dataProvider = "data-provider", enabled = false)
    public void test(Path config) {
    }

    @Test
    public void testDataActionParams() throws IOException {
        JsonObject analysis = analyze("addEntry");
        Assert.assertTrue(analysis.get("supported").getAsBoolean(), "Expected addEntry to be supported");
        JsonArray params = analysis.getAsJsonArray("params");
        Assert.assertEquals(params.size(), 2);

        JsonObject nameParam = params.get(0).getAsJsonObject();
        Assert.assertEquals(nameParam.get("name").getAsString(), "name");
        Assert.assertEquals(nameParam.get("type").getAsString(), "string");
        Assert.assertTrue(nameParam.get("required").getAsBoolean());
        Assert.assertEquals(nameParam.get("description").getAsString(), "The entry name");

        JsonObject countParam = params.get(1).getAsJsonObject();
        Assert.assertEquals(countParam.get("name").getAsString(), "count");
        Assert.assertFalse(countParam.get("required").getAsBoolean(), "Defaultable params must be optional");
        Assert.assertEquals(countParam.get("description").getAsString(), "The entry count");

        Assert.assertEquals(analysis.get("returnType").getAsString(), "json");
        Assert.assertFalse(analysis.get("dependentReturn").getAsBoolean());
    }

    @Test
    public void testUnionParamFilteredToDataMembers() throws IOException {
        JsonObject analysis = analyze("send");
        Assert.assertTrue(analysis.get("supported").getAsBoolean(), "Expected send to be supported");
        JsonObject messageParam = analysis.getAsJsonArray("params").get(0).getAsJsonObject();
        // The non-anydata union member (the client object) is dropped.
        Assert.assertEquals(messageParam.get("type").getAsString(), "string|xml");
        Assert.assertEquals(messageParam.get("description").getAsString(), "The message payload");
        Assert.assertEquals(analysis.get("returnType").getAsString(), "string");
    }

    @Test
    public void testNonDataParamUnsupported() throws IOException {
        JsonObject analysis = analyze("dispatch");
        Assert.assertFalse(analysis.get("supported").getAsBoolean(), "Expected dispatch to be unsupported");
        String reasons = analysis.getAsJsonArray("reasons").toString();
        Assert.assertTrue(reasons.contains("is not a data type"), "Unexpected reasons: " + reasons);
    }

    @Test
    public void testRestParamUnsupported() throws IOException {
        JsonObject analysis = analyze("combine");
        Assert.assertFalse(analysis.get("supported").getAsBoolean(), "Expected combine to be unsupported");
        String reasons = analysis.getAsJsonArray("reasons").toString();
        Assert.assertTrue(reasons.contains("Rest parameter"), "Unexpected reasons: " + reasons);
    }

    @Test
    public void testStreamReturnCollected() throws IOException {
        JsonObject analysis = analyze("fetchLines");
        Assert.assertTrue(analysis.get("supported").getAsBoolean(), "Expected fetchLines to be supported");
        Assert.assertEquals(analysis.get("returnType").getAsString(), "string[]");
        Assert.assertEquals(analysis.get("streamElementType").getAsString(), "string");
    }

    @Test
    public void testUnknownActionFailsGracefully() throws IOException {
        JsonObject result = request("noSuchAction");
        Assert.assertTrue(result.has("errorMsg") && !result.get("errorMsg").isJsonNull(),
                "Expected a graceful error for an unknown action: " + result);
    }

    private JsonObject analyze(String actionName) throws IOException {
        JsonObject result = request(actionName);
        Assert.assertFalse(result.has("errorMsg") && !result.get("errorMsg").isJsonNull(),
                "Analysis failed: " + result);
        return result.getAsJsonObject("analysis");
    }

    private JsonObject request(String actionName) throws IOException {
        Path filePath = sourceDir.resolve("analyze_action/main.bal").toAbsolutePath();
        AnalyzeActivityActionRequest request = new AnalyzeActivityActionRequest(filePath.toString(),
                "localClient", actionName, "REMOTE_ACTION_CALL");
        CompletableFuture<?> result = serviceEndpoint.request(getServiceName() + "/" + getApiName(), request);
        String response = TestUtil.getResponseString(result);
        return JsonParser.parseString(response).getAsJsonObject().getAsJsonObject("result");
    }

    @Override
    protected String getResourceDir() {
        return "workflow_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return AnalyzeActivityActionTest.class;
    }

    @Override
    protected String getApiName() {
        return "analyzeActivityAction";
    }

    @Override
    protected String getServiceName() {
        return "workflowManager";
    }
}
