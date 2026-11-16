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

package io.ballerina.flowmodelgenerator.extension.knowledgebasemanager;

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
import java.nio.file.Paths;
import java.util.Map;

/**
 * Test for generating code for knowledge bases.
 *
 * @since 1.1.0
 */
public class CodeGenerationTest extends AbstractLSTest {
    public static final String CONNECTIONS_BAL_FILE_NAME = "connections.bal";
    public static final String AUTOMATIONS_BAL_FILE_NAME = "automation.bal";
    public static final String TEXT_EDITS_RESPONSE_KEY_NAME = "textEdits";

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        return new Object[][]{
                {Path.of("code_generation_with_vector_store_knowledge_base.json")},
                {Path.of("code_generation_for_vector_store_knowledge_base_retrieve_call.json")},
                {Path.of("code_generation_for_vector_store_knowledge_base_ingest_call.json")},
                {Path.of("code_generation_for_cloud_knowledge_base_retrieve_call.json")},
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);
        String filePath = sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        JsonObject sourceGenerationResponse = getSourceGenerationResponse(filePath, testConfig);
        if (!sourceGenerationResponse.equals(testConfig.expectedResponse())) {
            TestConfig updatedConfig = new TestConfig(testConfig.source(), testConfig.flowNode(),
                    sourceGenerationResponse);
            // updateConfig(configJsonPath, updatedConfig);
            compareJsonElements(sourceGenerationResponse, testConfig.expectedResponse());
            Assert.fail(String.format("Failed test: '%s'", configJsonPath));
        }
    }

    private JsonObject getSourceGenerationResponse(String filePath, TestConfig testConfig) throws IOException {
        FlowModelSourceGeneratorRequest request = new FlowModelSourceGeneratorRequest(filePath, testConfig.flowNode());
        JsonObject response = getResponse(request);

        JsonObject textEdits = response.getAsJsonObject(TEXT_EDITS_RESPONSE_KEY_NAME);

        // Find the entry that ends with "connections.bal"
        Map.Entry<String, JsonElement> connectionEditEntry = textEdits.entrySet().stream()
                .filter(entry -> entry.getKey().endsWith(CONNECTIONS_BAL_FILE_NAME)
                        || entry.getKey().endsWith(AUTOMATIONS_BAL_FILE_NAME))
                .findFirst().orElseThrow(
                        () -> new RuntimeException("Unable to obtain text edits for knowledge base"));

        // Use only the file name as the key
        String textEditFilePath = connectionEditEntry.getKey();
        textEdits.remove(textEditFilePath);
        String fileName = Paths.get(textEditFilePath).getFileName().toString();
        textEdits.add(fileName, connectionEditEntry.getValue());
        return response;
    }

    @Override
    protected String getResourceDir() {
        return "knowledge_base_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return CodeGenerationTest.class;
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
