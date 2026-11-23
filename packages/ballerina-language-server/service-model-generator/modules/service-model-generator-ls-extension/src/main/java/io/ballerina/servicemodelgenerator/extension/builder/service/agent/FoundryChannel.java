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
 * Runs an agent as a Microsoft Foundry hosted agent, over the Foundry Invocations protocol of
 * {@code ballerinax/ai.azure}. Foundry calls {@code POST /invocations} once per turn of a session and probes
 * {@code GET /readiness}, so the service is always attached at the root base path.
 *
 * @since 1.9.0
 */
public class FoundryChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "ai.azure";

    private static final String AS_TEXT_SLOT = "{{asText}}";

    // The readiness probe never calls the model: Foundry calls it often and takes the container out of rotation
    // on any non-2xx status.
    private static final String SERVICE_BLOCK = """
            service {{alias}}:FoundryInvocationService on {{listener}} {
            {{durableHelpers}}
                resource function get readiness() returns json {
                    return {status: "healthy"};
                }

                resource function post invocations(@http:Payload json payload, {{alias}}:FoundryContext ctx)
                        returns json|error {
                    string message = check payload.message;
                    {{agentAnswerType}} reply = check {{agentRun}};
                    return {reply: reply{{asText}}, sessionId: ctx.sessionId, invocationId: ctx.invocationId};
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
        return context.withAgentRun(context.fill(template), "message", "ctx.sessionId");
    }
}
