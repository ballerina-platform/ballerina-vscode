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
 * WhatsApp Business Cloud API.
 *
 * @since 1.9.0
 */
public class WhatsAppBusinessChannel implements AgentTriggerChannel {

    static final String MODULE_NAME = "whatsapp.business";
    private static final String ACCESS_TOKEN = "accessToken";

    private static final String SERVICE_BLOCK = """
            service {{alias}}:WhatsAppService on {{listener}} {
                final {{alias}}:Client whatsappClient;

                function init() returns error? {
                    self.whatsappClient = check new ({auth: {token: {{accessToken}}}});
                }

                remote function onMessages({{alias}}:MessagesNotification notification) returns error? {
                    if notification is {{alias}}:Messages {
                        _ = start self.replyToWhatsAppMessages(notification);
                    }
                }

                function replyToWhatsAppMessages({{alias}}:Messages notification) {
                    foreach {{alias}}:InboundMessage message in notification.messages {
                        string replyText;
                        string? text = message.text;
                        if text is () {
                            replyText = "Sorry, I can only handle text messages right now.";
                        } else {
                            string|error result = {{agentRun}};
                            if result is error {
                                log:printError("Agent run failed", result, sender = message.'from);
                                replyText = "Sorry, something went wrong. Please try again.";
                            } else {
                                replyText = result;
                            }
                        }
                        {{alias}}:TextMessage payload = {to: message.'from, text: {body: replyText, previewUrl: false}};
                        {{alias}}:MessageResponsePayload|{{alias}}:Error sent =
                                self.whatsappClient->sendMessage(notification.phoneNumberId, payload);
                        if sent is {{alias}}:Error {
                            log:printError("WhatsApp send failed", sent);
                        }
                    }
                }
            }
            """;

    @Override
    public String moduleName() {
        return MODULE_NAME;
    }

    @Override
    public AgentTriggerKind kind() {
        return AgentTriggerKind.CHAT;
    }

    @Override
    public Map<String, Value> additionalProperties() {
        return Map.of(ACCESS_TOKEN, new Value.ValueBuilder()
                .metadata("Access Token", "The WhatsApp Business Cloud API access token used to send replies.")
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
        return SERVICE_BLOCK
                .replace("{{alias}}", context.emitAlias())
                .replace("{{listener}}", context.listenerVarName())
                .replace("{{accessToken}}", context.formValue(ACCESS_TOKEN))
                .replace("{{agentRun}}", context.agentRun("text", "\"whatsapp:\" + message.'from"));
    }
}
