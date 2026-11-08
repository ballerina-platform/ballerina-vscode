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

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

/**
 * Test for generating MCP toolkit.
 *
 * @since 1.3.1
 */
public class McpToolKitGenerationTest extends AbstractLSTest {

    public static final String AGENTS_BAL_FILE_NAME = "agents.bal";
    public static final String CONNECTIONS_BAL_FILE_NAME = "connections.bal";
    public static final String TEXT_EDITS_RESPONSE_KEY_NAME = "textEdits";

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("mcp_toolkit_generation_with_class.json")},
                {Path.of("mcp_toolkit_generation_with_server_display.json")},
                {Path.of("mcp_toolkit_generation_without_class.json")},
                {Path.of("mcp_toolkit_generation_edit.json")},
                {Path.of("mcp_toolkit_generation_edit_with_scopes.json")},
                {Path.of("mcp_toolkit_generation_edit_without_class.json")},
                {Path.of("mcp_toolkit_generation_empty_permitted_tools.json")},
                {Path.of("mcp_toolkit_generation_with_special_tool_names.json")},
                {Path.of("mcp_toolkit_generation_v2_with_class.json")},
                {Path.of("mcp_toolkit_generation_v2_with_scopes.json")},
                {Path.of("mcp_toolkit_generation_v2_edit.json")}
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String filePath = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        JsonObject response = getSourceGenerationResponse(filePath, testConfig);
        if (!response.equals(testConfig.expectedResponse())) {
            TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.flowNode(), response);
//            updateConfig(configJsonPath, updatedConfig);
            compareJsonElements(response, testConfig.expectedResponse());
            Assert.fail(String.format("Failed test: '%s'", configJsonPath));
        }
    }

    private JsonObject getSourceGenerationResponse(String filePath, TestConfig testConfig) throws IOException {
        FlowModelSourceGeneratorRequest request = new FlowModelSourceGeneratorRequest(filePath, testConfig.flowNode());
        JsonObject response = getResponse(request);

        JsonObject textEdits = response.getAsJsonObject(TEXT_EDITS_RESPONSE_KEY_NAME);

        // Find the entry that ends with "connections.bal"
        Optional<Map.Entry<String, JsonElement>> connectionEditEntryOpt = textEdits.entrySet().stream()
                .filter(entry -> entry.getKey().endsWith(CONNECTIONS_BAL_FILE_NAME))
                .findFirst();
        if (connectionEditEntryOpt.isPresent()) {
            // Rename the key to a connections.bal
            textEdits.remove(connectionEditEntryOpt.get().getKey());
            textEdits.add(CONNECTIONS_BAL_FILE_NAME, connectionEditEntryOpt.get().getValue());
        }

        // Find the entry that ends with "agents.bal"
        Optional<Map.Entry<String, JsonElement>> agentEditEntryOpt = textEdits.entrySet().stream()
                .filter(entry -> entry.getKey().endsWith(AGENTS_BAL_FILE_NAME))
                .findFirst();

        if (agentEditEntryOpt.isPresent()) {
            // Rename the key to agents.bal
            textEdits.remove(agentEditEntryOpt.get().getKey());
            textEdits.add(AGENTS_BAL_FILE_NAME, agentEditEntryOpt.get().getValue());
        }
        return response;
    }

    @Override
    protected String getResourceDir() {
        return "toolkit_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return McpToolKitGenerationTest.class;
    }

    @Override
    protected String getApiName() {
        return "getSourceCode";
    }

    /**
     * Represents the test configuration for the flow model getSourceCode API.
     *
     * @param source           The source file path
     * @param flowNode         The flowNode input to the FlowModelSourceGeneratorRequest
     * @param expectedResponse The expected text edit response
     */
    private record TestConfig(String source, JsonObject flowNode, JsonObject expectedResponse) {

    }
}
