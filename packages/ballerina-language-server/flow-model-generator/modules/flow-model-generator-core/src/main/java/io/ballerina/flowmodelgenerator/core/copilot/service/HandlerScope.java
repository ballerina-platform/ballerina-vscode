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

/**
 * The immutable inputs a handler-level component reads — one per handler being built.
 *
 * <p>Exactly one of {@code option}/{@code declared} is populated: {@code declared} is a concrete service
 * type's own method read from the semantic model, {@code option} is a marker service type's handler read
 * from the document, because the library declares no method to introspect.
 *
 * @param service  the enclosing service scope
 * @param option   the metadata handler option, or {@code null} for a concrete method
 * @param declared the semantic-model method, or {@code null} for a metadata-driven handler
 * @since 1.7.0
 */
record HandlerScope(
        TriggerScope service,
        TriggerMetadataModel.ServiceType.HandlerOption option,
        TriggerSemanticFacts.DeclaredMethod declared) {

    /** Whether this handler comes from the semantic model rather than the metadata document. */
    boolean isConcrete() {
        return declared != null;
    }
}
