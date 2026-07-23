/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.ballerina.flowmodelgenerator.extension.agentsmanager;

import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import io.ballerina.flowmodelgenerator.extension.request.ClassMemberRequest;
import io.ballerina.flowmodelgenerator.extension.request.DeleteClassMemberRequest;
import io.ballerina.flowmodelgenerator.extension.request.SaveClassMemberRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelAvailableNodesRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelGeneratorRequest;
import io.ballerina.modelgenerator.commons.AbstractLSTest;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;
import java.lang.reflect.Type;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public class AgentDefinitionConnectionTest extends AbstractLSTest {

    private static final Type TEXT_EDITS_TYPE = new TypeToken<Map<String, List<TextEdit>>>() { }.getType();

    @Test
    public void testClassOwnedConnectionUsesExistingInput() throws IOException {
        String source = "agent_definition_connection/agents.bal";
        Path sourcePath = sourceDir.resolve(source).toAbsolutePath();
        SaveClassMemberRequest request = new SaveClassMemberRequest(
                sourcePath.toString(), connectionNode(),
                LineRange.from("agents.bal", LinePosition.from(3, 0), LinePosition.from(15, 1)));

        JsonObject response = getResponse(request, "flowDesignService/saveClassMember");
        Map<String, List<TextEdit>> edits = gson.fromJson(response.getAsJsonObject("textEdits"), TEXT_EDITS_TYPE);
        String generated = edits.values().stream().flatMap(List::stream).map(TextEdit::getNewText)
                .reduce("", (left, right) -> left + "\n" + right);

        Assert.assertTrue(generated.contains("private final existingHttp:Client calendarClient;"));
        Assert.assertTrue(generated.contains("self.calendarClient = check new (self.token);"));
        Assert.assertFalse(generated.contains("existingHttp:Client calendarClient)"),
                "A class-owned connection must not be added as an init parameter");
    }

    @Test
    public void testClassOwnedConnectionIsAvailableForTools() throws IOException {
        Path sourcePath = sourceDir.resolve("agent_definition_connection_available_nodes/agents.bal").toAbsolutePath();
        FlowModelAvailableNodesRequest request = new FlowModelAvailableNodesRequest(
                sourcePath.toString(), LinePosition.from(9, 8));

        JsonObject response = getResponse(request, "flowDesignService/getAvailableNodes");
        Assert.assertTrue(response.toString().contains("managedClient"),
                "A class-owned client field should be available as a connection tool receiver");
    }

    @Test
    public void testClassOwnedConnectionDoesNotReplaceTheInnerAgent() throws IOException {
        Path sourcePath = sourceDir.resolve("agent_definition_connection_available_nodes/agents.bal").toAbsolutePath();
        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(
                sourcePath.toString(), LinePosition.from(3, 0), LinePosition.from(12, 1));

        JsonObject response = getResponse(request, "flowDesignService/getFlowModel");
        Assert.assertTrue(response.getAsJsonObject("flowModel").getAsJsonArray("nodes").toString()
                        .contains("\"node\":\"AGENT\""),
                "The agent definition model must continue to resolve the inner ai:Agent assignment");
    }

    @Test
    public void testAgentDefinitionToolMetadataMarksMcpAndAgentTools() throws IOException {
        String source = "agent_definition_connection/agents_with_mcp_tools.bal";
        Path sourcePath = sourceDir.resolve(source).toAbsolutePath();
        FlowModelGeneratorRequest request = new FlowModelGeneratorRequest(
                sourcePath.toString(), LinePosition.from(2, 0), LinePosition.from(29, 1));

        JsonObject response = getResponse(request, "flowDesignService/getFlowModel");
        String nodes = response.getAsJsonObject("flowModel").getAsJsonArray("nodes").toString();

        Assert.assertTrue(nodes.contains("\"name\":\"weatherMcp\""), nodes);
        Assert.assertTrue(nodes.contains("\"type\":\"MCP Server\""), nodes);
        Assert.assertTrue(nodes.contains("\"name\":\"askSpecialist\""), nodes);
        Assert.assertTrue(nodes.contains("\"type\":\"Agent\""), nodes);
    }

    @Test
    public void testListClassMembersReturnsMcpToolKit() throws IOException {
        String source = "agent_definition_connection/agents_with_mcp_tools.bal";
        Path sourcePath = sourceDir.resolve(source).toAbsolutePath();
        ClassMemberRequest request = new ClassMemberRequest(
                sourcePath.toString(),
                LineRange.from("agents.bal", LinePosition.from(2, 0), LinePosition.from(29, 1)));

        JsonObject response = getResponse(request, "flowDesignService/listClassMembers");
        String variables = response.getAsJsonObject("flowModel").getAsJsonArray("variables").toString();

        Assert.assertTrue(variables.contains("\"node\":\"MCP_TOOL_KIT\""), variables);
        Assert.assertTrue(variables.contains("\"value\":\"weatherMcp\""), variables);
        Assert.assertTrue(variables.contains("WeatherMcpToolKit"), variables);
        Assert.assertFalse(variables.contains("\"value\":\"self.weatherMcp\""),
                "Class-owned node variables should be normalized to field names");
    }

    @Test
    public void testListClassMembersReturnsConnections() throws IOException {
        String source = "agent_definition_connection_available_nodes/agents.bal";
        Path sourcePath = sourceDir.resolve(source).toAbsolutePath();
        ClassMemberRequest request = new ClassMemberRequest(
                sourcePath.toString(),
                LineRange.from("agents.bal", LinePosition.from(3, 0), LinePosition.from(12, 1)));

        JsonObject response = getResponse(request, "flowDesignService/listClassMembers");
        String variables = response.getAsJsonObject("flowModel").getAsJsonArray("variables").toString();

        Assert.assertTrue(variables.contains("\"node\":\"NEW_CONNECTION\""), variables);
        Assert.assertTrue(variables.contains("\"value\":\"managedClient\""), variables);
    }

    @Test
    public void testGenericClassOwnedMcpToolKitUsesExistingInput() throws IOException {
        String source = "agent_definition_connection/agents.bal";
        Path sourcePath = sourceDir.resolve(source).toAbsolutePath();
        SaveClassMemberRequest request = new SaveClassMemberRequest(
                sourcePath.toString(), mcpToolKitNode(),
                LineRange.from("agents.bal", LinePosition.from(3, 0), LinePosition.from(15, 1)));

        JsonObject response = getResponse(request, "flowDesignService/saveClassMember");
        Map<String, List<TextEdit>> edits = gson.fromJson(response.getAsJsonObject("textEdits"), TEXT_EDITS_TYPE);
        String generated = edits.values().stream().flatMap(List::stream).map(TextEdit::getNewText)
                .reduce("", (left, right) -> left + "\n" + right);

        Assert.assertFalse(edits.keySet().stream().anyMatch(path -> path.endsWith("connections.bal")),
                "A definition-owned MCP toolkit must not be generated as a module-level connection");
        Assert.assertTrue(generated.contains("isolated class WeatherMcpToolKit"));
        Assert.assertTrue(generated.contains("private final WeatherMcpToolKit weatherMcp;"));
        Assert.assertTrue(generated.contains("self.weatherMcp = check new (self.token);"));
        Assert.assertTrue(generated.contains("self.weatherMcp"));
        Assert.assertTrue(generated.contains("getWeather"));
    }

    @Test
    public void testGenericRemoveClassOwnedMcpToolKitCleansWiring() throws IOException {
        String source = "agent_definition_connection/agents_with_mcp_tools.bal";
        Path sourcePath = sourceDir.resolve(source).toAbsolutePath();
        DeleteClassMemberRequest request = new DeleteClassMemberRequest(
                sourcePath.toString(), "weatherMcp",
                LineRange.from("agents.bal", LinePosition.from(2, 0), LinePosition.from(29, 1)));

        JsonObject response = getResponse(request, "flowDesignService/deleteClassMember");
        Map<String, List<TextEdit>> edits = gson.fromJson(response.getAsJsonObject("textEdits"), TEXT_EDITS_TYPE);
        String generated = edits.values().stream().flatMap(List::stream).map(TextEdit::getNewText)
                .reduce("", (left, right) -> left + "\n" + right);

        Assert.assertTrue(edits.values().stream().flatMap(List::stream)
                .anyMatch(edit -> edit.getNewText().isEmpty()),
                "Removing an MCP toolkit should delete field, assignment, and generated helper source ranges");
        Assert.assertTrue(generated.contains("[self.askSpecialist]"));
        Assert.assertFalse(generated.contains("self.weatherMcp"));
    }

    @Override
    public void test(Path config) {
    }

    @Override
    protected String getResourceDir() {
        return "agents_manager";
    }

    @Override
    protected Class<? extends AbstractLSTest> clazz() {
        return AgentDefinitionConnectionTest.class;
    }

    @Override
    protected String getApiName() {
        return "saveClassMember";
    }

    private JsonObject connectionNode() {
        JsonObject node = new JsonObject();
        JsonObject codedata = new JsonObject();
        codedata.addProperty("node", "NEW_CONNECTION");
        codedata.addProperty("org", "ballerina");
        codedata.addProperty("module", "http");
        codedata.addProperty("packageName", "http");
        codedata.addProperty("object", "Client");
        codedata.addProperty("symbol", "init");
        codedata.addProperty("isNew", true);
        node.add("codedata", codedata);

        JsonObject properties = new JsonObject();
        properties.add("url", property("self.token", "REQUIRED"));
        properties.add("type", property("http:Client", "TYPE"));
        properties.add("variable", property("calendarClient", "IDENTIFIER"));
        properties.add("scope", property("Global", "ENUM"));
        node.add("properties", properties);
        return node;
    }

    private JsonObject mcpToolKitNode() {
        JsonObject node = new JsonObject();
        JsonObject codedata = new JsonObject();
        codedata.addProperty("node", "MCP_TOOL_KIT");
        codedata.addProperty("org", "ballerina");
        codedata.addProperty("module", "ai");
        codedata.addProperty("packageName", "ai");
        codedata.addProperty("object", "McpToolKit");
        codedata.addProperty("symbol", "init");
        codedata.addProperty("isNew", true);
        node.add("codedata", codedata);

        JsonObject properties = new JsonObject();
        properties.add("serverUrl", property("self.token", "REQUIRED"));
        properties.add("variable", property("weatherMcp", "IDENTIFIER"));
        properties.add("toolKitName", property("WeatherMcpToolKit", "IDENTIFIER"));
        properties.add("permittedTools", property("[\"getWeather\"]", "INCLUDED_FIELD"));
        node.add("properties", properties);
        return node;
    }

    private JsonObject property(String value, String kind) {
        JsonObject property = new JsonObject();
        property.addProperty("value", value);
        JsonObject codedata = new JsonObject();
        codedata.addProperty("kind", kind);
        property.add("codedata", codedata);
        return property;
    }
}
