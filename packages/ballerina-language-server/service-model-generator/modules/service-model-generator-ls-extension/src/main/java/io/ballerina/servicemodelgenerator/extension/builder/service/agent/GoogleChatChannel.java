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
import io.ballerina.servicemodelgenerator.extension.validation.GenerationRefusedException;

import java.util.LinkedHashMap;
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
    static final String AUDIENCE = "authenticationAudience";
    static final String ENDPOINT_URL = "endpointUrl";
    static final String PROJECT_NUMBER = "projectNumber";

    // The listener rejects a service without @chat:ServiceConfig.
    private static final String SERVICE_BLOCK = """
            @{{alias}}:ServiceConfig {
                {{audienceField}}: {{audienceValue}}
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
        Value audience = new Value.ValueBuilder()
                .metadata("Authentication Audience",
                        "The Authentication Audience set in the Google Chat app's connection settings.")
                .types(List.of(PropertyType.types(Value.FieldType.CHOICE)))
                .enabled(true)
                .editable(true)
                .value("")
                .build();
        audience.setChoices(List.of(
                audienceChoice("HTTP Endpoint URL", "Google Chat signs requests for the HTTP endpoint URL.", true,
                        ENDPOINT_URL, "Endpoint URL", "The public HTTPS URL of this service, as set in the Chat app's "
                                + "HTTP endpoint URL field."),
                audienceChoice("Project Number", "Google Chat signs requests for the GCP project number.", false,
                        PROJECT_NUMBER, "Project Number", "The GCP project number used to build the Chat app.")));
        return Map.of(AUDIENCE, audience);
    }

    private static Value audienceChoice(String label, String description, boolean enabled, String key,
                                        String fieldLabel, String fieldDescription) {
        Value field = new Value.ValueBuilder()
                .metadata(fieldLabel, fieldDescription)
                .types(List.of(PropertyType.types(Value.FieldType.TEXT, "string"),
                        PropertyType.types(Value.FieldType.EXPRESSION, "string")))
                .enabled(true)
                .editable(true)
                .optional(false)
                .setValidations(List.of(new ValidationRule("common.validate.required")))
                .build();
        Map<String, Value> properties = new LinkedHashMap<>();
        properties.put(key, field);
        return new Value.ValueBuilder()
                .metadata(label, description)
                .types(List.of(PropertyType.types(Value.FieldType.FORM)))
                .enabled(enabled)
                .editable(true)
                .setProperties(properties)
                .build();
    }

    @Override
    public String serviceBlock(AgentTriggerContext context) {
        // Only the chosen branch reaches the form values, so whichever audience is present was the one picked.
        String projectNumber = context.formValue(PROJECT_NUMBER).strip();
        boolean byProject = !projectNumber.isBlank();
        String value = byProject ? projectNumber : context.formValue(ENDPOINT_URL).strip();
        if (value.isBlank()) {
            // A blank audience compiles and starts, then the listener rejects every request.
            throw new GenerationRefusedException(AUDIENCE,
                    "Set the Endpoint URL or the Project Number from the Google Chat app's connection settings.");
        }
        String service = context.fill(SERVICE_BLOCK)
                .replace("{{audienceField}}", byProject ? PROJECT_NUMBER : ENDPOINT_URL)
                .replace("{{audienceValue}}", value);
        return context.withAgentRun(service, "text", "\"googlechat:\" + (event.space?.name ?: \"unknown\")");
    }
}
