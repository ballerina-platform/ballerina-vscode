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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.testng.Assert;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;

/**
 * How an MCP server's name and icon are read from what it returns at design time. The cases mirror public servers:
 * DeepWiki and Tavily answer {@code initialize} with {@code serverInfo}; GitHub and Notion reject it without a token
 * but publish {@code resource_name} in their OAuth protected resource metadata.
 *
 * @since 2.0.0
 */
public class McpServerInfoTest {

    @DataProvider(name = "initializeResponses")
    public Object[][] initializeResponses() {
        return new Object[][]{
                {"name only (DeepWiki)", "{\"serverInfo\": {\"name\": \"DeepWiki\", \"version\": \"4.0.2\"}}",
                        "DeepWiki", null},
                {"name only (Tavily)", "{\"serverInfo\": {\"name\": \"tavily-mcp\", \"version\": \"4.1.5\"}}",
                        "tavily-mcp", null},
                {"title wins over name", "{\"serverInfo\": {\"name\": \"github-mcp-server\", "
                        + "\"title\": \"GitHub MCP Server\"}}", "GitHub MCP Server", null},
                {"blank title falls back to name", "{\"serverInfo\": {\"name\": \"docs\", \"title\": \"  \"}}",
                        "docs", null},
                {"unthemed icon preferred", "{\"serverInfo\": {\"name\": \"x\", \"icons\": ["
                        + "{\"src\": \"https://x.dev/dark.svg\", \"theme\": \"dark\"},"
                        + "{\"src\": \"https://x.dev/icon.png\"}]}}", "x", "https://x.dev/icon.png"},
                {"themed icon when no other", "{\"serverInfo\": {\"name\": \"x\", \"icons\": ["
                        + "{\"src\": \"https://x.dev/light.svg\", \"theme\": \"light\"}]}}", "x",
                        "https://x.dev/light.svg"},
                {"data URI icon skipped", "{\"serverInfo\": {\"name\": \"x\", \"icons\": ["
                        + "{\"src\": \"data:image/png;base64,AAAA\"}]}}", "x", null},
                {"no serverInfo", "{\"capabilities\": {}}", null, null},
        };
    }

    @Test(dataProvider = "initializeResponses")
    public void readsInitializeResponse(String description, String result, String name, String icon) {
        JsonObject response = JsonParser.parseString("{\"jsonrpc\": \"2.0\", \"id\": 1, \"result\": " + result + "}")
                .getAsJsonObject();
        McpServerInfo info = McpServerInfo.fromInitializeResponse(response);
        Assert.assertEquals(info.name(), name, description);
        Assert.assertEquals(info.icon(), icon, description);
    }

    @Test
    public void readsDiscoverResponse() {
        JsonObject response = JsonParser.parseString("{\"jsonrpc\": \"2.0\", \"id\": 1, \"result\": {"
                + "\"_meta\": {\"io.modelcontextprotocol/serverInfo\": {\"name\": \"docs\", \"title\": \"Docs\", "
                + "\"icons\": [{\"src\": \"https://x.dev/icon.png\"}]}}, \"supportedVersions\": [\"2026-07-28\"]}}")
                .getAsJsonObject();
        Assert.assertEquals(McpServerInfo.fromDiscoverResponse(response),
                new McpServerInfo("Docs", "https://x.dev/icon.png"));

        JsonObject unnamed = JsonParser.parseString("{\"jsonrpc\": \"2.0\", \"id\": 1, \"result\": "
                + "{\"supportedVersions\": [\"2026-07-28\"]}}").getAsJsonObject();
        Assert.assertTrue(McpServerInfo.fromDiscoverResponse(unnamed).isEmpty());
    }

    @Test
    public void readsErrorResponseAsEmpty() {
        JsonObject response = JsonParser.parseString(
                "{\"jsonrpc\": \"2.0\", \"id\": 1, \"error\": {\"code\": -32600, \"message\": \"bad\"}}")
                .getAsJsonObject();
        Assert.assertTrue(McpServerInfo.fromInitializeResponse(response).isEmpty());
    }

    @Test
    public void readsResourceName() {
        JsonObject metadata = JsonParser.parseString("{\"resource\": \"https://mcp.notion.com/mcp\", "
                + "\"resource_name\": \"Notion MCP (Beta)\"}").getAsJsonObject();
        Assert.assertEquals(McpServerInfo.fromResourceMetadata(metadata), new McpServerInfo("Notion MCP (Beta)", null));

        JsonObject unnamed = JsonParser.parseString("{\"resource\": \"https://mcp.tavily.com/mcp\"}").getAsJsonObject();
        Assert.assertTrue(McpServerInfo.fromResourceMetadata(unnamed).isEmpty());
    }

    @DataProvider(name = "metadataLocations")
    public Object[][] metadataLocations() {
        String github = "Bearer error=\"invalid_request\", resource_metadata="
                + "\"https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp\"";
        return new Object[][]{
                {"advertised on the same origin", "https://api.githubcopilot.com/mcp", github,
                        "https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp"},
                {"advertised on another origin", "https://mcp.example.com/mcp",
                        "Bearer resource_metadata=\"https://attacker.example.net/meta\"", null},
                {"advertised over another scheme", "https://mcp.example.com/mcp",
                        "Bearer resource_metadata=\"http://mcp.example.com/meta\"", null},
                {"no challenge, derived from the path", "https://mcp.notion.com/mcp", null,
                        "https://mcp.notion.com/.well-known/oauth-protected-resource/mcp"},
                {"no challenge, root path", "http://localhost:9090/", "Bearer realm=\"x\"",
                        "http://localhost:9090/.well-known/oauth-protected-resource"},
                {"not an http URL", "ftp://mcp.example.com/mcp", null, null},
        };
    }

    @Test(dataProvider = "metadataLocations")
    public void locatesResourceMetadata(String description, String serverUrl, String challenge, String expected) {
        Assert.assertEquals(McpServerInfo.resourceMetadataUrl(serverUrl, challenge), expected, description);
    }
}
