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
 * Telegram Bot API.
 *
 * @since 1.9.0
 */
public class TelegramChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "telegram";
    private static final String BOT_TOKEN = "botToken";

    private static final String SERVICE_BLOCK = """
            service {{alias}}:TelegramService on {{listener}} {
                final {{alias}}:Client telegramClient;

                function init() returns error? {
                    self.telegramClient = check new ({token: {{token}}});
                }

                remote function onMessage({{alias}}:Message message) returns error? {
                    _ = start self.replyToTelegramMessage(message);
                }

                function replyToTelegramMessage({{alias}}:Message message) {
                    string replyText;
                    string? text = message.text;
                    if text is () {
                        replyText = "Sorry, I can only handle text messages right now.";
                    } else {
                        string|error result = {{agentRun}};
                        if result is error {
                            log:printError("Agent run failed", result);
                            replyText = "Sorry, something went wrong. Please try again.";
                        } else {
                            replyText = result;
                        }
                    }
                    {{alias}}:Message|error sent = self.telegramClient->sendMessage(message.chat.id, replyText);
                    if sent is error {
                        log:printError("Telegram send failed", sent);
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
        return Map.of(BOT_TOKEN, new Value.ValueBuilder()
                .metadata("Bot Token", "The Telegram bot token used to send replies.")
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
        return context.fill(SERVICE_BLOCK)
                .replace("{{token}}", context.formValue(BOT_TOKEN))
                .replace("{{agentRun}}", context.agentRun("text", "\"telegram:\" + message.chat.id.toString()"));
    }
}
