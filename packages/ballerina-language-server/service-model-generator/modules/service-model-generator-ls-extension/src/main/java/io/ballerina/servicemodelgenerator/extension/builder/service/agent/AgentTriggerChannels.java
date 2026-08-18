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

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * The channels a trigger can be created from an agent for.
 *
 * @since 1.9.0
 */
public final class AgentTriggerChannels {

    private static final String EVENT_TRIGGER_KIND = "event";

    private static final Map<String, AgentTriggerChannel> BESPOKE = new LinkedHashMap<>() {{
            put(AiChatChannel.MODULE_NAME, new AiChatChannel());
            put(WhatsAppBusinessChannel.MODULE_NAME, new WhatsAppBusinessChannel());
            put(TelegramChannel.MODULE_NAME, new TelegramChannel());
            put(GoogleChatChannel.MODULE_NAME, new GoogleChatChannel());
        }};

    private AgentTriggerChannels() {
    }

    public static Optional<AgentTriggerChannel> forModule(String orgName, String moduleName) {
        return forModule(orgName, moduleName, null, false);
    }

    public static Optional<AgentTriggerChannel> forModule(String orgName, String moduleName, String version,
                                                          boolean isLocalRepository) {
        AgentTriggerChannel bespoke = moduleName == null ? null : BESPOKE.get(moduleName);
        if (bespoke != null) {
            return Optional.of(bespoke);
        }
        return TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(orgName, moduleName, version, isLocalRepository)
                .filter(model -> EVENT_TRIGGER_KIND.equals(model.kind()))
                .map(model -> new EventAgentTriggerChannel(moduleName));
    }

    /** Stamps a listed trigger with how it calls an agent, from the scalars the row already holds. */
    public static TriggerBasicInfo withAgentKind(TriggerBasicInfo trigger) {
        return trigger.withAgentTriggerKind(kindOf(trigger.moduleName(), trigger.type()));
    }

    public static String kindOf(String moduleName, String triggerKind) {
        AgentTriggerChannel bespoke = moduleName == null ? null : BESPOKE.get(moduleName);
        if (bespoke != null) {
            return bespoke.kind().name();
        }
        return EVENT_TRIGGER_KIND.equals(triggerKind) ? AgentTriggerKind.EVENT.name() : null;
    }
}
