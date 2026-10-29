package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Test cases for the flow model getNodeTemplate API.
 *
 * @since 1.0.0
 */
public class NodeTemplateTest extends AbstractLSTest {

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        String filePath =
                testConfig.source() == null ? "" : sourceDir.resolve(testConfig.source()).toAbsolutePath().toString();
        FlowModelNodeTemplateRequest request =
                new FlowModelNodeTemplateRequest(filePath, testConfig.position(), testConfig.codedata());
        JsonElement nodeTemplate = getResponseAndCloseFile(request, testConfig.source()).get("flowNode");

        if (!nodeTemplate.equals(testConfig.output())) {
            TestConfig updateConfig = new TestConfig(testConfig.source(), testConfig.position(),
                    testConfig.description(), testConfig.codedata(), nodeTemplate);
//            updateConfig(configJsonPath, updateConfig);
            compareJsonElements(nodeTemplate, testConfig.output());
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void testAgentRunTemplateCallsTheRequestedAgent() throws IOException {
        String filePath = sourceDir.resolve("empty.bal").toAbsolutePath().toString();
        for (String agent : List.of("firstAgent", "secondAgent")) {
            JsonObject codedata = gson.fromJson("""
                    {"node": "AGENT_RUN", "org": "ballerina", "module": "ai", "packageName": "ai",
                     "object": "Agent", "symbol": "run", "version": "1.16.0", "parentSymbol": "%s"}"""
                    .formatted(agent), JsonObject.class);
            JsonObject flowNode = getResponseAndCloseFile(new FlowModelNodeTemplateRequest(filePath,
                    LinePosition.from(0, 0), codedata), "empty.bal").getAsJsonObject("flowNode");
            Assert.assertEquals(flowNode.getAsJsonObject("properties").getAsJsonObject("connection")
                    .get("value").getAsString(), agent);
        }
    }

    @Override
    protected String getResourceDir() {
        return "node_template";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return NodeTemplateTest.class;
    }

    @Override
    protected String getApiName() {
        return "getNodeTemplate";
    }

    /**
     * Represents the test configuration for the flow model getNodeTemplate API.
     *
     * @param source      The source file path
     * @param position    The position of the node to be added
     * @param description The description of the test
     * @param codedata    The codedata of the node
     * @param output      The expected output
     */
    private record TestConfig(String source, LinePosition position, String description, JsonObject codedata,
                              JsonElement output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
