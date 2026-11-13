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

import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.ValidationRule;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.List;
import java.util.Map;

/**
 * Google Chat spaces and direct messages.
 *
 * @since 1.9.0
 */
public class GoogleChatChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "googleapis.chat";
    private static final String ENDPOINT_URL = "endpointUrl";

    // The listener rejects a service without @chat:ServiceConfig: it needs the endpoint URL to verify
    // that each request comes from Google Chat.
    private static final String SERVICE_BLOCK = """
            @{{alias}}:ServiceConfig {
                endpointUrl: {{endpointUrl}}
            }
            service {{alias}}:ChatService on {{listener}} {
            {{durableHelpers}}
                remote function onMessage({{alias}}:MessageEvent event, {{alias}}:MessageCaller caller)
                        returns error? {
                    check caller->respond();
                    _ = start self.replyToChatMessage(event, caller);
                }

                function replyToChatMessage({{alias}}:MessageEvent event, {{alias}}:MessageCaller caller) {
                    string replyText;
                    string? text = event.message.text;
                    if text is () {
                        replyText = "Sorry, I can only handle text messages right now.";
                    } else {
                        {{agentAnswerType}}|error result = {{agentRun}};
                        if result is error {
                            log:printError("Agent run failed", result);
                            replyText = "Sorry, something went wrong. Please try again.";
                        } else {
                            replyText = result{{asText}};
                        }
                    }
                    {{alias}}:CreateMessageRequest reply = {text: replyText};
                    {{alias}}:ChatThread? thread = event.message.thread;
                    if thread is {{alias}}:ChatThread {
                        reply.thread = thread;
                    }
                    {{alias}}:Message|error sent = caller->sendMessage(reply);
                    if sent is error {
                        log:printError("Google Chat send failed", sent);
                    }
                }
            }
            """;

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.CHAT;
    }

    @Override
    public Map<String, Value> additionalProperties() {
        return Map.of(ENDPOINT_URL, new Value.ValueBuilder()
                .metadata("Endpoint URL", "The public URL of this service, as set in the Google Chat app's "
                        + "connection settings. Google Chat requests are verified against it.")
                .types(List.of(PropertyType.types(Value.FieldType.TEXT, "string"),
                        PropertyType.types(Value.FieldType.EXPRESSION, "string")))
                .enabled(true)
                .editable(true)
                .optional(false)
                .setValidations(List.of(new ValidationRule("common.validate.required")))
                .build());
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        String endpointUrl = context.formValue(ENDPOINT_URL);
        String service = context.fill(SERVICE_BLOCK)
                .replace("{{endpointUrl}}", endpointUrl.isBlank() ? "\"\"" : endpointUrl);
        return context.withAgentRun(service, "text", "\"googlechat:\" + (event.space?.name ?: \"unknown\")");
    }
}
