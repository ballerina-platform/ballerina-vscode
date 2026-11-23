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
 * Runs an agent on Amazon Bedrock AgentCore Runtime, over the HTTP protocol contract of
 * {@code ballerinax/ai.aws.bedrock.agentcore}. AgentCore calls {@code POST /invocations} once per turn of a session
 * and health-checks {@code GET /ping}, so the service is always attached at the root base path.
 *
 * @since 1.9.0
 */
public class AgentCoreChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "ai.aws.bedrock.agentcore";

    private static final String AS_TEXT_SLOT = "{{asText}}";

    // The ping never calls the model: AgentCore health-checks it every few seconds for the life of a session.
    // AgentCore doesn't always send a session ID, so a sessionless call gets its own request ID and never shares
    // another call's conversation. The payload's "prompt" field is the AgentCore SDKs' convention.
    private static final String SERVICE_BLOCK = """
            service {{alias}}:InvocationService on {{listener}} {
            {{durableHelpers}}
                resource function get ping() returns {{alias}}:PingStatus => {{alias}}:HEALTHY;

                resource function post invocations(@http:Payload json payload, {{alias}}:Context ctx)
                        returns json|error {
                    string message = check payload.prompt;
                    string sessionId = ctx.sessionId ?: ctx.requestId;
                    {{agentAnswerType}} reply = check {{agentRun}};
                    return {response: reply{{asText}}, sessionId};
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

    /**
     * The service is this channel's own template, which binds the payload with {@code @http:Payload}, so it is
     * emitted even when the connector's trigger model can't be resolved, rather than falling back to the generic
     * schema-driven service, which leaves the payload unannotated.
     */
    @Override
    public boolean isSchemaDriven() {
        return false;
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        // A typed answer that is already JSON goes back as it is, rather than as its string form.
        String template = context.typedAnswer() && context.runShape().json()
                ? SERVICE_BLOCK.replace(AS_TEXT_SLOT, "")
                : SERVICE_BLOCK;
        return context.withAgentRun(context.fill(template), "message", "sessionId");
    }
}
