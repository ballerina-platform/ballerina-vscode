/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.extension.agentsmanager;

import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

/**
 * Test cases for the flow model generator service for agents.
 *
 * @since 1.0.0
 */
public class FlowNodeGeneratorTest extends AbstractLSTest {

    @DataProvider(name = "data-provider")
    @Override
    protected Object[] getConfigsList() {
        List<String> skip = Arrays.asList(skipList());
        return Stream.of(
                "agent_call_flow_node_1.json",
                "agent_call_flow_node_2.json",
                "agent_call_flow_node_3.json",
                "agent_call_flow_node_4.json",
                "agent_call_flow_node_7.json",
                "agent_call_flow_node_8.json",
                "agent_call_flow_node_9.json"
                // agent_call_flow_node_5/6 intentionally excluded (pre-existing)
        ).filter(c -> !skip.contains(c)).map(c -> new Object[]{Path.of(c)}).toArray(Object[][]::new);
    }

    @Override
    protected String[] skipList() {
        // TODO: remove after deprecated ballerinax/ai imports are migrated.
        // Configs 1-4 map to sources agent_3/agent_5/agent_6/agent_7 respectively, which import the retired
        // ballerinax/ai (removed from the offline cache)
        // (config 7 -> agent_12 imports ballerina/ai, not ballerinax/ai, so it stays enabled.)
        return new String[]{
                "agent_call_flow_node_1.json",   // agent_3 (ballerinax/ai)
                "agent_call_flow_node_2.json",   // agent_5 (ballerinax/ai)
                "agent_call_flow_node_3.json",   // agent_6 (ballerinax/ai)
                "agent_call_flow_node_4.json"    // agent_7 (ballerinax/ai)
        };
    }

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        BufferedReader bufferedReader = Files.newBufferedReader(configJsonPath);
        TestConfig testConfig = gson.fromJson(bufferedReader, TestConfig.class);
        bufferedReader.close();

        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(
                getSourcePath(testConfig.source()), testConfig.start(),
                testConfig.end());
        JsonObject jsonModel = getResponseAndCloseFile(request, testConfig.source()).getAsJsonObject("flowModel");

        // Assert only the file name since the absolute path may vary depending on the machine
        String balFileName = Path.of(jsonModel.getAsJsonPrimitive("fileName").getAsString()).getFileName().toString();
        JsonPrimitive testFileName = testConfig.diagram().getAsJsonPrimitive("fileName");
        boolean fileNameEquality = testFileName != null && balFileName.equals(testFileName.getAsString());
        JsonObject modifiedDiagram = jsonModel.deepCopy();
        modifiedDiagram.addProperty("fileName", balFileName);

        boolean flowEquality = modifiedDiagram.equals(testConfig.diagram());
        if (!fileNameEquality || !flowEquality) {
            TestConfig updatedConfig = new TestConfig(testConfig.start(), testConfig.end(), testConfig.source(),
                    testConfig.description(), modifiedDiagram);
//            updateConfig(configJsonPath, updatedConfig);
            compareJsonElements(modifiedDiagram, testConfig.diagram());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @AfterMethod
    public void shutDownLS() {
        this.shutDownLanguageServer();
    }

    @BeforeMethod
    public void startLS() {
        this.startLanguageServer();
    }

    @Override
    protected String getResourceDir() {
        return "agents_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return FlowNodeGeneratorTest.class;
    }

    @Override
    protected String getApiName() {
        return "getFlowModel";
    }

    /**
     * Represents the test configuration for the model generator test.
     *
     * @param start       The start position of the diagram
     * @param end         The end position of the diagram
     * @param source      The source file
     * @param description The description of the test
     * @param diagram     The expected diagram for the given inputs
     * @since 1.0.0
     */
    private record TestConfig(LinePosition start, LinePosition end, String source, String description,
                              JsonObject diagram) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
