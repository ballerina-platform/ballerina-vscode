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

package io.ballerina.flowmodelgenerator.extension.response;

import com.google.gson.JsonArray;
import io.ballerina.flowmodelgenerator.core.McpServerInfo;

public class GetMcpToolsResponse extends AbstractFlowModelResponse {
    private JsonArray tools;
    private String serverName;
    private String serverIcon;

    public GetMcpToolsResponse() {
    }

    public JsonArray getTools() {
        return tools;
    }

    public void setTools(JsonArray tools) {
        this.tools = tools;
    }

    public String getServerName() {
        return serverName;
    }

    public String getServerIcon() {
        return serverIcon;
    }

    public void setServerInfo(McpServerInfo serverInfo) {
        this.serverName = serverInfo.name();
        this.serverIcon = serverInfo.icon();
    }
}
