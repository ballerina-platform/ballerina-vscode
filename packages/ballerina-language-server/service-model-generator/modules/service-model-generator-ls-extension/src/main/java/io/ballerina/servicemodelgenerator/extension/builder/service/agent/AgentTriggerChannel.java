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

import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.List;
import java.util.Map;

/**
 * The per-channel knowledge an agent trigger needs.
 *
 * @since 1.9.0
 */
public interface AgentTriggerChannel {

    String moduleName();

    default Map<String, Value> additionalProperties() {
        return Map.of();
    }

    default List<String> imports() {
        return List.of("ballerina/log");
    }

    String serviceBlock(AgentTriggerContext context);
}
