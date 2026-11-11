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
 * WSO2 Integration voice agent, which turns each spoken utterance into a chat message.
 *
 * @since 1.9.0
 */
public class VoiceAgentChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "ai.wso2.integration";

    private static final String SERVICE_BLOCK = """
            isolated service {{alias}}:VoiceService {{basePath}}on {{listener}} {
            {{durableHelpers}}
                isolated remote function onChatMessage({{alias}}:ChatMessage message) returns string|error {
                    string response = check {{agentRun}};
                    return response;
                }
            }
            """;

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.CHAT;
    }

    @Override
    public List<String> imports() {
        return List.of();
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        String basePath = context.basePath();
        return context.fill(SERVICE_BLOCK, true)
                .replace("{{basePath}}", basePath.isEmpty() ? "" : basePath + " ")
                .replace("{{agentRun}}", context.agentRun("message.message", "message.sessionId"));
    }
}
