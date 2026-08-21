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

/**
 * Google Chat spaces and direct messages.
 *
 * @since 1.9.0
 */
public class GoogleChatChannel implements AgentTriggerChannel {

    static final String ORG_NAME = "ballerinax";
    static final String MODULE_NAME = "googleapis.chat";

    private static final String SERVICE_BLOCK = """
            service {{alias}}:ChatService on {{listener}} {

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
                        string|error result = {{agentRun}};
                        if result is error {
                            log:printError("Agent run failed", result);
                            replyText = "Sorry, something went wrong. Please try again.";
                        } else {
                            replyText = result;
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
    public String serviceBlock(AgentTriggerContext context) {
        return context.fill(SERVICE_BLOCK)
                .replace("{{agentRun}}",
                        context.agentRun("text", "\"googlechat:\" + (event.space?.name ?: \"unknown\")"));
    }
}
