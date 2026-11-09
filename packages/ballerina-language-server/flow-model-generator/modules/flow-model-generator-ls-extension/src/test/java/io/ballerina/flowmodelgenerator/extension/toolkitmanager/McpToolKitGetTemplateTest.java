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

package io.ballerina.flowmodelgenerator.extension.toolkitmanager;

import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.chunkermanager.GetNodeTemplateTest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Test for getting MCP toolkit node template.
 *
 * @since 1.3.1
 */
public class McpToolKitGetTemplateTest extends AbstractLSTest {
    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("get_mcp_tool_kit_class_template.json")},
                {Path.of("get_mcp_tool_kit_template.json")}
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String filePath = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        FlowModelNodeTemplateRequest request = new FlowModelNodeTemplateRequest(filePath,
                LinePosition.from(1, 1), testConfig.codedata());
        JsonObject nodeTemplateResponse = getResponse(request);
        if (!nodeTemplateResponse.equals(testConfig.expectedTemplate())) {
            TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.codedata(), nodeTemplateResponse);
//             updateConfig(configJsonPath, updatedConfig);
            compareJsonElements(nodeTemplateResponse, testConfig.expectedTemplate());
            Assert.fail(String.format("Failed test: '%s'", configJsonPath));
        }
    }

    // The test environment has no ai that supports mcp.v2, as when offline with only an older ai cached
    @Test
    public void testNewToolKitWithoutLoadableMcpV2AiGetsV1Form() throws IOException {
        JsonObject codedata = new JsonObject();
        codedata.addProperty("node", "MCP_TOOL_KIT");
        String filePath = sourceDir.resolve("without_ai/main.bal").toAbsolutePath().toString();
        JsonObject response = getResponse(new FlowModelNodeTemplateRequest(filePath, LinePosition.from(1, 1),
                codedata));

        Assert.assertTrue(response.has("flowNode"), response.toString());
        JsonObject flowNode = response.getAsJsonObject("flowNode");
        JsonObject properties = flowNode.getAsJsonObject("properties");
        Assert.assertTrue(properties.has("serverUrl"), properties.toString());
        Assert.assertFalse(properties.has("httpConfig"), "Expected the mcp (v1) form: " + properties);
        Assert.assertFalse(flowNode.getAsJsonObject("codedata").toString().contains("mcpProtocol"),
                flowNode.getAsJsonObject("codedata").toString());
    }

    @Override
    protected String getResourceDir() {
        return "toolkit_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return GetNodeTemplateTest.class;
    }

    @Override
    protected String getApiName() {
        return "getNodeTemplate";
    }

    /**
     * Represents the test configuration for the flow model getNodeTemplate API.
     *
     * @param source           The source file path
     * @param codedata         The code data of the toolkit
     * @param expectedTemplate The expected template of the toolkit
     */
    private record TestConfig(String source, JsonObject codedata, JsonObject expectedTemplate) {

    }
}
