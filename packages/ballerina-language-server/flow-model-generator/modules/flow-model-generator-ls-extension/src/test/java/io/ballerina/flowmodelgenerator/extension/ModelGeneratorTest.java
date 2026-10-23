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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.IntStream;

/**
 * Test cases for the flow model generator service.
 *
 * @since 1.0.0
 */
public class ModelGeneratorTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

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

    @Test
    public void testSubmoduleFunctionCallDoesNotExposeView() throws IOException {
        String source = "submodule_function_call/main.bal";
        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(
                getSourcePath(source), LinePosition.from(2, 0), LinePosition.from(4, 1));
        JsonObject response = getResponseAndCloseFile(request, source);

        Assert.assertFalse(response.has("errorMsg"), "Flow model generation failed: " + response);
        JsonObject functionCall = null;
        for (JsonElement node : response.getAsJsonObject("flowModel").getAsJsonArray("nodes")) {
            JsonObject nodeObject = node.getAsJsonObject();
            JsonObject codedata = nodeObject.getAsJsonObject("codedata");
            if (codedata != null && codedata.has("symbol") && "add".equals(codedata.get("symbol").getAsString())) {
                functionCall = nodeObject;
                break;
            }
        }
        Assert.assertNotNull(functionCall, "Submodule function call was not generated");
        Assert.assertFalse(functionCall.getAsJsonObject("properties").has("view"),
                "Submodule function call should not expose navigation");
    }

    @Test
    public void testRunWithIdWorkflowIsADropdown() throws IOException {
        String source = "workflow_run_with_id.bal";
        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(
                getSourcePath(source), LinePosition.from(11, 0), LinePosition.from(13, 1));
        JsonObject response = getResponseAndCloseFile(request, source);

        Assert.assertFalse(response.has("errorMsg"), "Flow model generation failed: " + response);
        JsonObject runWithId = null;
        for (JsonElement node : response.getAsJsonObject("flowModel").getAsJsonArray("nodes")) {
            JsonObject codedata = node.getAsJsonObject().getAsJsonObject("codedata");
            if (codedata != null && codedata.has("symbol")
                    && "runWithId".equals(codedata.get("symbol").getAsString())) {
                runWithId = node.getAsJsonObject();
                break;
            }
        }
        Assert.assertNotNull(runWithId, "workflow:runWithId call was not generated");
        JsonObject workflow = runWithId.getAsJsonObject("properties").getAsJsonObject("processFunction");
        JsonObject type = workflow.getAsJsonArray("types").get(0).getAsJsonObject();
        Assert.assertEquals(type.get("fieldType").getAsString(), "SINGLE_SELECT");
        Assert.assertEquals(type.getAsJsonArray("options").get(0).getAsJsonObject().get("value").getAsString(),
                "orderWorkflow");
        Assert.assertEquals(workflow.get("value").getAsString(), "orderWorkflow");
        Assert.assertEquals(workflow.getAsJsonObject("codedata").get("originalName").getAsString(), "processFunction");
    }

    // Each row: agent, card role, card instructions, form role, form instructions. A null card means no prompt.
    @DataProvider(name = "agent-system-prompt")
    public Object[][] agentSystemPromptCases() {
        return new Object[][]{
                {"promptVarAgent", "\"Assistant\"", "Answer clearly.", "\"Assistant\"", "Answer clearly."},
                {"fieldVarAgent", "Tutor", "Explain step by step.", "role", "tutorInstructions"},
                {"nestedVarAgent", "Tutor", "Explain step by step.", "role", "tutorInstructions"},
                {"configurableAgent", "reviewerRole", "Review code.", "reviewerRole", "Review code."},
                {"templateAgent", "\"Teacher\"", "Teach ${topic}.", "\"Teacher\"", "teachInstructions"},
                {"functionAgent", null, null, "", ""},
                {"quotedKeyAgent", "\"Analyst\"", "Summarize data.", "\"Analyst\"", "Summarize data."},
                {"spreadAgent", null, null, "", ""}
        };
    }

    @Test(dataProvider = "agent-system-prompt")
    public void testAgentSystemPrompt(String agentName, String cardRole, String cardInstructions, String formRole,
                                      String formInstructions) throws IOException {
        JsonObject agent = getAgentNode(agentName);
        JsonObject agentInfo = agent.getAsJsonObject("metadata").getAsJsonObject("data")
                .getAsJsonObject("agentInfo");
        if (cardRole == null) {
            Assert.assertFalse(agentInfo.has("systemPrompt"), "Unexpected card prompt for " + agentName);
        } else {
            JsonObject systemPrompt = agentInfo.getAsJsonObject("systemPrompt");
            Assert.assertEquals(systemPrompt.get("role").getAsString(), cardRole);
            Assert.assertEquals(systemPrompt.get("instructions").getAsString(), cardInstructions);
        }
        JsonObject properties = agent.getAsJsonObject("properties");
        Assert.assertEquals(properties.getAsJsonObject("role").get("value").getAsString(), formRole);
        Assert.assertEquals(properties.getAsJsonObject("instructions").get("value").getAsString(), formInstructions);
    }

    @Test
    public void testPromptVariableMetadata() throws IOException {
        JsonObject properties = getAgentNode("fieldVarAgent").getAsJsonObject("properties");
        JsonObject instructions = getPromptVariable(properties, "instructions");
        Assert.assertEquals(instructions.get("name").getAsString(), "tutorInstructions");
        Assert.assertEquals(instructions.get("value").getAsString(), "Explain step by step.");
        Assert.assertEquals(instructions.get("references").getAsInt(), 2);
        Assert.assertEquals(instructions.getAsJsonObject("lineRange").getAsJsonObject("startLine").get("line")
                .getAsInt(), 6);
        Assert.assertEquals(getPromptVariable(properties, "role").get("value").getAsString(), "Tutor");

        JsonObject configurable = getAgentNode("configurableAgent").getAsJsonObject("properties");
        Assert.assertNull(getPromptVariable(configurable, "role"));
        Assert.assertNull(getPromptVariable(configurable, "instructions"));

        JsonObject dollarLiteral = getAgentNode("dollarLiteralAgent").getAsJsonObject("properties");
        Assert.assertNull(getPromptVariable(dollarLiteral, "role"));
    }

    private static JsonObject getPromptVariable(JsonObject properties, String key) {
        JsonObject data = properties.getAsJsonObject(key).getAsJsonObject("metadata").getAsJsonObject("data");
        return data == null ? null : data.getAsJsonObject("promptVariable");
    }

    private JsonObject getAgentNode(String agentName) throws IOException {
        String source = "agent_system_prompt_variable.bal";
        List<String> lines = Files.readAllLines(sourceDir.resolve(source));
        int line = IntStream.range(0, lines.size())
                .filter(i -> lines.get(i).contains(" " + agentName + " = check new"))
                .findFirst().orElseThrow();
        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(getSourcePath(source),
                LinePosition.from(line, 0), LinePosition.from(line, lines.get(line).length()));
        JsonObject response = getResponseAndCloseFile(request, source);
        Assert.assertFalse(response.has("errorMsg"), "Flow model generation failed: " + response);
        for (JsonElement node : response.getAsJsonObject("flowModel").getAsJsonArray("nodes")) {
            if ("AGENT".equals(node.getAsJsonObject().getAsJsonObject("codedata").get("node").getAsString())) {
                return node.getAsJsonObject();
            }
        }
        throw new AssertionError("Agent node was not generated for " + agentName);
    }

    @Override
    protected String[] skipList() {
        return new String[]{
                // TODO: Enable this once the default value issue is resolved
                "resource_action_call_github.json",
                // TODO: Enable this once the intermittent issue in the Github workflows is resolved
                "flags2.json",
                // TODO: remove after deprecated ballerinax/ai imports are migrated
                // chat_agent / agent_with_backticks sources import ballerinax/ai (removed from offline
                // cache)
                "chat_agent.json",
                "agent_with_backticks_in_system_prompt.json"
        };
    }

    @Override
    protected String getResourceDir() {
        return "diagram_generator";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return ModelGeneratorTest.class;
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
