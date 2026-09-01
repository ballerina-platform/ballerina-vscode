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

import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.TriggerBasicInfo;

import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The channels a trigger can be created from an agent for.
 *
 * @since 1.9.0
 */
public final class AgentTriggerChannels {

    private static final String EVENT_TRIGGER_KIND = "event";
    private static final String FILE_TRIGGER_KIND = "file";

    private static final Map<String, AgentTriggerChannel> BESPOKE = Map.of(
            key(AiChatChannel.ORG_NAME, AiChatChannel.MODULE_NAME), new AiChatChannel(),
            key(WhatsAppBusinessChannel.ORG_NAME, WhatsAppBusinessChannel.MODULE_NAME),
            new WhatsAppBusinessChannel(),
            key(TelegramChannel.ORG_NAME, TelegramChannel.MODULE_NAME), new TelegramChannel(),
            key(GoogleChatChannel.ORG_NAME, GoogleChatChannel.MODULE_NAME), new GoogleChatChannel(),
            key(HttpAgentTriggerChannel.ORG_NAME, HttpAgentTriggerChannel.MODULE_NAME),
            new HttpAgentTriggerChannel());

    private AgentTriggerChannels() {
    }

    public static Optional<AgentTriggerChannel> forModule(String orgName, String moduleName) {
        return forModule(orgName, moduleName, null, false);
    }

    public static Optional<AgentTriggerChannel> forModule(String orgName, String moduleName, String version,
                                                          boolean isLocalRepository) {
        AgentTriggerChannel bespoke = bespoke(orgName, moduleName);
        if (bespoke != null) {
            return Optional.of(bespoke);
        }
        return TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(orgName, moduleName, version, isLocalRepository)
                .map(model -> schemaAgentKind(model.kind()))
                .filter(Objects::nonNull)
                .map(kind -> new EventAgentTriggerChannel(moduleName, kind));
    }

    /** Stamps a listed trigger with how it calls an agent, from the scalars the row already holds. */
    public static TriggerBasicInfo withAgentKind(TriggerBasicInfo trigger) {
        AgentTriggerChannel channel = listedChannel(trigger.orgName(), trigger.moduleName(), trigger.type());
        return channel == null ? trigger
                : trigger.withAgentTrigger(channel.kind().name(), channel.deletionScope().name());
    }

    public static String kindOf(String orgName, String moduleName, String triggerKind) {
        AgentTriggerChannel channel = listedChannel(orgName, moduleName, triggerKind);
        return channel == null ? null : channel.kind().name();
    }

    private static AgentTriggerChannel listedChannel(String orgName, String moduleName, String triggerKind) {
        AgentTriggerChannel bespoke = bespoke(orgName, moduleName);
        if (bespoke != null) {
            return bespoke;
        }
        AgentTriggerKind kind = schemaAgentKind(triggerKind);
        return kind == null ? null : new EventAgentTriggerChannel(moduleName, kind);
    }

    private static AgentTriggerChannel bespoke(String orgName, String moduleName) {
        return orgName == null || moduleName == null ? null : BESPOKE.get(key(orgName, moduleName));
    }

    /** Every schema-driven trigger is a caller; only its own {@code kind} says how it calls the agent. */
    private static AgentTriggerKind schemaAgentKind(String triggerKind) {
        if (EVENT_TRIGGER_KIND.equals(triggerKind)) {
            return AgentTriggerKind.EVENT;
        }
        if (FILE_TRIGGER_KIND.equals(triggerKind)) {
            return AgentTriggerKind.FILE;
        }
        return null;
    }

    private static String key(String orgName, String moduleName) {
        return orgName + "/" + moduleName;
    }
}
