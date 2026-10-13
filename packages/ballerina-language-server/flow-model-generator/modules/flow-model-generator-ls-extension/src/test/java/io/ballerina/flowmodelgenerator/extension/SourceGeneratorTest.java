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

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocuments;
import org.ballerinalang.formatter.core.Formatter;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.langserver.util.TestUtil;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.AfterClass;
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
 * Tests for the flow model source generator service.
 *
 * @since 1.0.0
 */
public class SourceGeneratorTest extends AbstractLSTest {

    private static final String UNDEFINED_VARIABLE = "undefinedVariable";

    private static final Type textEditListType = new TypeToken<Map<String, List<TextEdit>>>() { }.getType();

    @Override
    @Test(dataProvider = "data-provider")
    public void test(Path config) throws IOException {
        Path configJsonPath = configDir.resolve(config);
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configJsonPath), TestConfig.class);

        FlowModelSourceGeneratorRequest request =
                new FlowModelSourceGeneratorRequest(sourceDir.resolve(testConfig.source()).toAbsolutePath().toString(),
                        testConfig.diagram());
        JsonObject jsonMap = getResponseAndCloseFile(request, testConfig.source()).getAsJsonObject("textEdits");

        Map<String, List<TextEdit>> actualTextEdits = gson.fromJson(jsonMap, textEditListType);

        boolean assertFailure = false;

        if (actualTextEdits.size() != testConfig.output().size()) {
            log.info("The number of text edits does not match the expected output.");
            assertFailure = true;
        }

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
            TestConfig updatedConfig =
                    new TestConfig(testConfig.source(), testConfig.description(), testConfig.diagram(), newMap);
//            updateConfig(configJsonPath, updatedConfig);
            Assert.fail(String.format("Failed test: '%s' (%s)", testConfig.description(), configJsonPath));
        }
    }

    @Test
    public void testNodesShareOneImport() throws IOException {
        FlowModelSourceGeneratorRequest println = nodeRequest("function_call-io-println.json");
        FlowModelSourceGeneratorRequest readCsv = nodeRequest("function_call-io-fileReadCsv.json");
        FlowModelSourceGeneratorRequest request = new FlowModelSourceGeneratorRequest(println.filePath(),
                println.flowNode(), false, List.of(println, readCsv));
        JsonObject sourceEdits = getResponseAndCloseFile(request, "empty.bal").getAsJsonObject("sourceEdits");

        Map<String, List<TextEdit>> edits = gson.fromJson(sourceEdits, textEditListType);
        Assert.assertEquals(edits.size(), 1);
        Assert.assertEquals(edits.values().iterator().next().stream().map(TextEdit::getNewText).toList(),
                List.of("import ballerina/io;", "io:println();", "Row[] returnType = check io:fileReadCsv(\"\");"));
    }

    @Test
    public void testFormattedSave() throws IOException {
        assertFormattedSave("function_definition1.json");
    }

    @Test
    public void testFormattedSaveAcrossTwoFiles() throws IOException {
        assertFormattedSave("wait_data_existing_to_source.json");
    }

    @Test
    public void testFormatFailureFallsBackToRawEdits() throws IOException {
        FlowModelSourceGeneratorRequest println = nodeRequest("function_call-io-println.json");
        String filePath = sourceDir.resolve("format_failure/main.bal").toAbsolutePath().toString();
        assertRawFallback(getResponseAndCloseFile(new FlowModelSourceGeneratorRequest(filePath, println.flowNode(),
                true, null), "format_failure/main.bal"));
    }

    @Test
    public void testEditOutsideDocumentFallsBackToRawEdits() throws IOException {
        // The diagram inserts at character 4 of an empty line, which the client clamps.
        FlowModelSourceGeneratorRequest node = nodeRequest("resource_action_call-persist-get-albums-create.json");
        assertRawFallback(getResponseAndCloseFile(
                new FlowModelSourceGeneratorRequest(node.filePath(), node.flowNode(), true, null),
                "persist_connector/main.bal"));
    }

    private static void assertRawFallback(JsonObject response) {
        Assert.assertFalse(response.has("formatted"), "A failed format must not report formatted edits");
        Assert.assertEquals(response.get("textEdits"), response.get("sourceEdits"));
    }

    private void assertFormattedSave(String configName) throws IOException {
        FlowModelSourceGeneratorRequest node = nodeRequest(configName);
        String source = sourceDir.relativize(Path.of(node.filePath())).toString();
        JsonObject response = getResponseAndCloseFile(
                new FlowModelSourceGeneratorRequest(node.filePath(), node.flowNode(), true, null), source);
        assertFormattedEdits(response, response.getAsJsonObject("sourceEdits"));
    }

    static void assertFormattedEdits(JsonObject response, JsonObject rawEdits) throws IOException {
        Assert.assertTrue(response.has("formatted") && response.get("formatted").getAsBoolean(), response.toString());
        Gson gson = new Gson();
        Map<String, List<TextEdit>> formatted = gson.fromJson(response.get("textEdits"), textEditListType);
        Map<String, List<TextEdit>> raw = gson.fromJson(rawEdits, textEditListType);
        Assert.assertEquals(formatted.keySet(), raw.keySet());
        for (Map.Entry<String, List<TextEdit>> entry : formatted.entrySet()) {
            Assert.assertEquals(entry.getValue().size(), 1, "Expected one edit for " + entry.getKey());
            TextEdit edit = entry.getValue().get(0);
            Path path = Path.of(entry.getKey());
            String original = Files.exists(path) ? Files.readString(path) : "";
            LinePosition end = TextDocuments.from(original).linePositionFrom(original.length());
            Assert.assertEquals(edit.getRange(),
                    new Range(new Position(0, 0), new Position(end.line(), end.offset())));
            String text = edit.getNewText();
            Assert.assertNotEquals(text, original);
            Assert.assertFalse(text.contains("\r\n") && text.replace("\r\n", "").contains("\n"),
                    "Edit text mixes line endings");
            try {
                // The formatter's own line ending can differ from the document's, which the edit keeps.
                Assert.assertEquals(lf(Formatter.format(text)), lf(text), "Edit text is not formatted");
            } catch (FormatterException e) {
                Assert.fail("Edit text could not be formatted", e);
            }
            for (TextEdit rawEdit : raw.get(entry.getKey())) {
                Assert.assertTrue(withoutWhitespace(text).contains(withoutWhitespace(rawEdit.getNewText())),
                        "Missing raw edit: " + rawEdit.getNewText());
            }
        }
    }

    private static String lf(String text) {
        return text.replace("\r\n", "\n");
    }

    private static String withoutWhitespace(String text) {
        return text.replaceAll("\\s", "");
    }

    private FlowModelSourceGeneratorRequest nodeRequest(String configName) throws IOException {
        TestConfig config = gson.fromJson(Files.newBufferedReader(configDir.resolve(configName)), TestConfig.class);
        return new FlowModelSourceGeneratorRequest(sourceDir.resolve(config.source()).toAbsolutePath().toString(),
                config.diagram());
    }

    @Test(dataProvider = "blank-workflow")
    public void testBlankWorkflowIsReported(String config, String workflowKey, String expectedMessage)
            throws IOException {
        JsonObject response = requestWithBlankWorkflow(config, workflowKey, getApiName());
        Assert.assertEquals(response.get("errorMsg").getAsString(), expectedMessage);
    }

    @Test(dataProvider = "blank-workflow-diagnostics")
    public void testBlankWorkflowStillGetsDiagnostics(String config, String workflowKey, String otherKey)
            throws IOException {
        // The form asks for diagnostics on every edit, before a workflow is picked too: another field with an
        // undefined variable still gets its diagnostic.
        JsonObject response = requestWithBlankWorkflow(config, workflowKey, otherKey, "diagnostics");
        Assert.assertFalse(response.has("errorMsg"), "Diagnostics failed: " + response);
        Assert.assertTrue(response.has("flowNode") && response.get("flowNode").isJsonObject(),
                "Diagnostics returned no flow node: " + response);
        JsonObject properties = response.getAsJsonObject("flowNode").getAsJsonObject("properties");
        // The empty workflow is only reported on save ("Select a workflow..."); the dropdown carries no compiler text.
        JsonObject workflow = properties.getAsJsonObject(workflowKey);
        Assert.assertNotNull(workflow, "No '" + workflowKey + "' field in: " + response);
        Assert.assertFalse(workflow.has("diagnostics") && workflow.getAsJsonObject("diagnostics").get("hasDiagnostics")
                .getAsBoolean(), "The blank '" + workflowKey + "' field carries diagnostics: " + workflow);
        JsonObject other = properties.getAsJsonObject(otherKey);
        Assert.assertNotNull(other, "No '" + otherKey + "' field in: " + response);
        Assert.assertTrue(other.has("diagnostics") && other.getAsJsonObject("diagnostics").get("hasDiagnostics")
                .getAsBoolean(), "No diagnostic on '" + otherKey + "': " + other);
        Assert.assertTrue(other.getAsJsonObject("diagnostics").toString().contains(UNDEFINED_VARIABLE),
                "The diagnostic on '" + otherKey + "' does not name the undefined variable: " + other);
    }

    @Test
    public void testBlankWorkflowInBlockStillGetsDiagnostics() throws IOException {
        // A block's children are written by child source builders, which must take the diagnostics path too.
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configDir.resolve("workflow_run_to_source.json")),
                TestConfig.class);
        JsonObject runNode = testConfig.diagram().getAsJsonObject().deepCopy();
        runNode.getAsJsonObject("codedata").remove("symbol");
        runNode.getAsJsonObject("codedata").remove("isNew");
        runNode.getAsJsonObject("properties").getAsJsonObject("input").addProperty("value", UNDEFINED_VARIABLE);

        JsonObject condition = new JsonObject();
        condition.addProperty("valueType", "EXPRESSION");
        condition.addProperty("value", "true");
        JsonObject branchProperties = new JsonObject();
        branchProperties.add("condition", condition);
        JsonObject branchCodedata = new JsonObject();
        branchCodedata.addProperty("node", "CONDITIONAL");
        JsonArray children = new JsonArray();
        children.add(runNode);
        JsonObject thenBranch = new JsonObject();
        thenBranch.addProperty("label", "Then");
        thenBranch.addProperty("kind", "BLOCK");
        thenBranch.add("codedata", branchCodedata);
        thenBranch.add("properties", branchProperties);
        thenBranch.add("children", children);
        JsonArray branches = new JsonArray();
        branches.add(thenBranch);

        JsonObject ifCodedata = testConfig.diagram().getAsJsonObject().getAsJsonObject("codedata").deepCopy();
        ifCodedata.addProperty("node", "IF");
        ifCodedata.remove("org");
        ifCodedata.remove("module");
        ifCodedata.remove("symbol");
        JsonObject ifNode = new JsonObject();
        ifNode.addProperty("id", "1");
        ifNode.add("codedata", ifCodedata);
        ifNode.add("branches", branches);
        ifNode.add("properties", new JsonObject());

        FlowModelSourceGeneratorRequest request = new FlowModelSourceGeneratorRequest(
                sourceDir.resolve(testConfig.source()).toAbsolutePath().toString(), ifNode);
        CompletableFuture<?> result = serviceEndpoint.request(getServiceName() + "/diagnostics", request);
        JsonObject response = JsonParser.parseString(TestUtil.getResponseString(result))
                .getAsJsonObject().getAsJsonObject("result");
        Assert.assertFalse(response.has("errorMsg"), "Diagnostics failed: " + response);
        Assert.assertTrue(response.has("flowNode") && response.get("flowNode").isJsonObject(),
                "Diagnostics returned no flow node: " + response);
    }

    private JsonObject requestWithBlankWorkflow(String config, String workflowKey, String api) throws IOException {
        return requestWithBlankWorkflow(config, workflowKey, null, api);
    }

    private JsonObject requestWithBlankWorkflow(String config, String workflowKey, String otherKey, String api)
            throws IOException {
        TestConfig testConfig = gson.fromJson(Files.newBufferedReader(configDir.resolve(config)), TestConfig.class);
        // The form opened from the function search has no workflow until one is picked from the dropdown.
        JsonObject diagram = testConfig.diagram().getAsJsonObject().deepCopy();
        JsonObject codedata = diagram.getAsJsonObject("codedata");
        // The workflow nodes fall back to the codedata symbol; for runWithId the symbol names the function called.
        if (!"FUNCTION_CALL".equals(codedata.get("node").getAsString())) {
            codedata.remove("symbol");
        }
        JsonObject workflow = diagram.getAsJsonObject("properties").getAsJsonObject(workflowKey);
        if (workflow != null) {
            workflow.addProperty("value", "");
        }
        if (otherKey != null) {
            diagram.getAsJsonObject("properties").getAsJsonObject(otherKey).addProperty("value", UNDEFINED_VARIABLE);
        }

        FlowModelSourceGeneratorRequest request = new FlowModelSourceGeneratorRequest(
                sourceDir.resolve(testConfig.source()).toAbsolutePath().toString(), diagram);
        // getResponse fails the test on any error, so the error response is read directly.
        CompletableFuture<?> result = serviceEndpoint.request(getServiceName() + "/" + api, request);
        return JsonParser.parseString(TestUtil.getResponseString(result)).getAsJsonObject().getAsJsonObject("result");
    }

    @DataProvider(name = "blank-workflow")
    private Object[][] blankWorkflowConfigs() {
        return new Object[][]{
                {"workflow_run_to_source.json", "workflow", "Select a workflow in the Workflow field"},
                {"send_data_to_source.json", "workflow", "Select a workflow in the Workflow Name field"},
                {"workflow_run_with_id_to_source.json", "processFunction", "Select a workflow in the Workflow field"},
                {"child_workflow_run_to_source.json", "workflow", "Select a workflow in the Child Workflow field"},
                {"child_workflow_call_to_source.json", "workflow", "Select a workflow in the Child Workflow field"}
        };
    }

    @DataProvider(name = "blank-workflow-diagnostics")
    private Object[][] blankWorkflowDiagnosticsConfigs() {
        return new Object[][]{
                {"workflow_run_to_source.json", "workflow", "input"},
                {"send_data_to_source.json", "workflow", "workflowId"},
                {"workflow_run_with_id_to_source.json", "processFunction", "instanceId"},
                {"child_workflow_run_to_source.json", "workflow", "input"},
                {"child_workflow_call_to_source.json", "workflow", "input"}
        };
    }

    @AfterClass
    void cleanFiles() {
        FileSystemUtils.deleteCreatedFiles();
    }

    @Override
    protected String getResourceDir() {
        return "to_source";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return SourceGeneratorTest.class;
    }

    @Override
    protected String getApiName() {
        return "getSourceCode";
    }

    @Override
    protected String[] skipList() {
        //TODO: The tests are failing in Windows: https://github.com/ballerina-platform/ballerina-lang/issues/42932
        return new String[]{
                "resource_action_call-http-get6.json",
                "resource_action_call-http-post5.json",
                // The following nodes are deprecated
                "data_mapper1.json",
                "data_mapper2.json",
                "data_mapper-main.json",
                "data_mapper-service.json"
        };
    }

    /**
     * Represents the test configuration for the source generator test.
     *
     * @param source      The source file name
     * @param description The description of the test
     * @param diagram     The diagram to generate the source code
     * @param output      The expected output source code
     */
    private record TestConfig(String source, String description, JsonElement diagram,
                              Map<String, List<TextEdit>> output) {

        public String description() {
            return description == null ? "" : description;
        }
    }
}
