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

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * The channels a trigger can be created from an agent for.
 *
 * @since 1.9.0
 */
public final class AgentTriggerChannels {

    private static final String GITHUB_MODULE = "trigger.github";
    private static final String SHOPIFY_MODULE = "trigger.shopify";
    private static final String HUBSPOT_MODULE = "trigger.hubspot";
    private static final String SALESFORCE_MODULE = "salesforce";

    private static final Map<String, AgentTriggerChannel> BY_MODULE = new LinkedHashMap<>() {{
            put(WhatsAppBusinessChannel.MODULE_NAME, new WhatsAppBusinessChannel());
            put(TelegramChannel.MODULE_NAME, new TelegramChannel());
            put(GITHUB_MODULE, new EventAgentTriggerChannel(GITHUB_MODULE));
            put(SHOPIFY_MODULE, new EventAgentTriggerChannel(SHOPIFY_MODULE));
            put(HUBSPOT_MODULE, new EventAgentTriggerChannel(HUBSPOT_MODULE));
            put(SALESFORCE_MODULE, new EventAgentTriggerChannel(SALESFORCE_MODULE));
        }};

    private AgentTriggerChannels() {
    }

    public static Optional<AgentTriggerChannel> forModule(String moduleName) {
        return moduleName == null ? Optional.empty() : Optional.ofNullable(BY_MODULE.get(moduleName));
    }

    public static boolean supports(String moduleName) {
        return forModule(moduleName).isPresent();
    }

    public static String kindOf(String moduleName) {
        return forModule(moduleName).map(channel -> channel.kind().name()).orElse(null);
    }
}
