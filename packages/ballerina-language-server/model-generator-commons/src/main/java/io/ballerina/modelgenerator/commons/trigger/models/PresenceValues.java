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

package io.ballerina.modelgenerator.commons.trigger.models;

import java.util.List;

/**
 * A requiredness + closed-vocabulary pair for a resource-kind handler's syntactic slots (e.g. HTTP's
 * {@code method}, GraphQL's {@code accessor}). Sibling of {@link PresenceForm}, used where the legal
 * shapes are a closed set of literal values rather than structural forms.
 *
 * @param presence {@code required} or {@code optional} for the slot
 * @param values   the closed set of legal literal values
 * @since 1.10.0
 */
public record PresenceValues(String presence, List<String> values) {

    public static final String PRESENCE_REQUIRED = "required";
    public static final String PRESENCE_OPTIONAL = "optional";
}
