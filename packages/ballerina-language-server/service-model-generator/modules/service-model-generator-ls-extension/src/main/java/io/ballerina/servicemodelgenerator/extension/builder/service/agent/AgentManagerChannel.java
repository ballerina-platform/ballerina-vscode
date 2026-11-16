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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import java.util.List;

/**
 * Exposes an agent to WSO2 Agent Manager through the chat service of {@code ballerinax/amp}. The Agent Manager
 * console calls {@code POST /chat} with a session ID and the user's message, so each session keeps its own
 * conversation. The service is attached at the root base path unless the user picks another one.
 *
 * @since 1.9.0
 */
public class AgentManagerChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "amp";

    // Agent Manager calls /chat at the root of the agent's endpoint.
    private static final String DEFAULT_BASE_PATH = "/";
    private static final String PATH_SEPARATOR = "/";

    private static final String SERVICE_BLOCK = """
            service {{alias}}:ChatService {{basePath}} on {{listener}} {
            {{durableHelpers}}
                resource function post chat(@http:Payload {{alias}}:ChatRequest request)
                        returns {{alias}}:ChatResponse|error {
                    {{agentAnswerType}} reply = check {{agentRun}};
                    return {response: reply{{asText}}};
                }
            }
            """;

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.AI_PLATFORM;
    }

    @Override
    public List<String> imports() {
        return List.of("ballerina/http");
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        return context.withAgentRun(context.fill(SERVICE_BLOCK).replace("{{basePath}}", basePath(context)),
                "request.message", "request.sessionId");
    }

    // The form's base path, in source form (reserved words and other invalid segments escaped), as the
    // schema-driven channels write it; the root when it is empty.
    private static String basePath(AgentTriggerContext context) {
        String basePath = context.basePath();
        if (basePath == null || basePath.isBlank()) {
            return DEFAULT_BASE_PATH;
        }
        return basePath.startsWith(PATH_SEPARATOR) ? basePath : PATH_SEPARATOR + basePath;
    }
}
