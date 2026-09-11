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

package io.ballerina.flowmodelgenerator.core.copilot.service;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.Set;

/**
 * The immutable inputs a parameter-level component reads — one per parameter slot.
 *
 * <p>As with {@link HandlerScope}, exactly one of {@code param}/{@code declared} is populated.
 *
 * <p>{@code position} and {@code siblingNames} support name synthesis: a slot whose name the document
 * leaves to the author needs a deterministic one that cannot collide with a sibling's.
 *
 * @param handler      the enclosing handler scope
 * @param param        the metadata parameter slot, or {@code null} for a declared parameter
 * @param declared     the semantic-model parameter, or {@code null} for a metadata-driven slot
 * @param position     the slot's zero-based index within its handler; the spec: "Array order is
 *                     meaningful"
 * @param siblingNames names already taken within this handler, which a generated name must avoid
 * @since 1.7.0
 */
record ParamScope(
        HandlerScope handler,
        TriggerMetadataModel.ServiceType.Param param,
        TriggerSemanticFacts.DeclaredParam declared,
        int position,
        Set<String> siblingNames) {
}
