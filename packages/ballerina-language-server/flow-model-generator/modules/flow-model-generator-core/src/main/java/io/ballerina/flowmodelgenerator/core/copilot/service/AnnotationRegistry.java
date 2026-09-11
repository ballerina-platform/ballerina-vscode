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

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Lookup over a document's top-level <b>{@code annotations[]}</b> registry (the spec).
 *
 * <p>The spec defines the registry as annotation types "referenced elsewhere, defined once", reached by
 * {@code id} from {@code params[].annotations}, {@code handlers.options[].annotations} and
 * {@code rules[].members[].annotation}, or by {@code attachPoint} for service- and return-level annotations
 * that have no more precise reference. Both access paths live here so that each attach-point component can
 * stay a pure filter rather than re-implementing the lookup.
 *
 * @since 1.7.0
 */
final class AnnotationRegistry {

    private static final AnnotationRegistry EMPTY = new AnnotationRegistry(Map.of());

    private final Map<String, TriggerMetadataModel.Annotation> byId;

    private AnnotationRegistry(Map<String, TriggerMetadataModel.Annotation> byId) {
        this.byId = byId;
    }

    /**
     * Builds the registry from a document. An absent or empty {@code annotations[]} yields an empty
     * registry rather than {@code null} — the spec's key is optional, and a consumer should not have to
     * null-check before every lookup.
     */
    static AnnotationRegistry of(TriggerMetadataModel document) {
        if (document == null || document.annotations() == null || document.annotations().isEmpty()) {
            return EMPTY;
        }
        Map<String, TriggerMetadataModel.Annotation> ids = new LinkedHashMap<>();
        for (TriggerMetadataModel.Annotation annotation : document.annotations()) {
            if (annotation == null || annotation.id() == null) {
                continue;
            }
            ids.putIfAbsent(annotation.id(), annotation);
        }
        return new AnnotationRegistry(ids);
    }

    /** The annotation a {@code params[]}/{@code options[]}/{@code rules[]} reference names. */
    Optional<TriggerMetadataModel.Annotation> byId(String id) {
        return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
    }
}
