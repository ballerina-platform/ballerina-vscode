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

import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceAnnotationRef;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.ArrayList;
import java.util.List;

/**
 * The wire shape of a the spec annotation requirement, written once and shared by all four attach-point
 * aspects. Owned by nobody, like {@link AnnotationRegistry} and {@link TypeResolver}: the shape is the same
 * at every attach point, and having four aspects each build it would be four places for it to drift.
 *
 * <p>Shape: {@code {name, module?, presence, attachPoint, typeConstraint?}}.
 *
 * @since 1.7.0
 */
final class AnnotationRefWriter {

    private AnnotationRefWriter() {
        // Prevent instantiation
    }

    /**
     * Renders a scope's resolved references.
     *
     * @param refs        the references, in document order
     * @param packageName the library being rendered, for resolving the constraint's links
     * @return the list to write onto a draft; empty when there is nothing to state
     */
    static List<ServiceAnnotationRef> write(List<AnnotationRef> refs, String packageName) {
        List<ServiceAnnotationRef> written = new ArrayList<>();
        for (AnnotationRef ref : refs) {
            written.add(write(ref, packageName));
        }
        return written;
    }

    /**
     * Renders one reference.
     *
     * <p>{@code typeConstraint} goes through {@link TypeResolver} exactly as a parameter type does, so the
     * constraining record reaches the prompt by the same link mechanism rather than a second one.
     * {@code module} is omitted for a home-module annotation, which the renderer then prefixes with the
     * library's own alias — the division of labour the spec already imposes on a service type.
     */
    private static ServiceAnnotationRef write(AnnotationRef ref, String packageName) {
        ServiceAnnotationRef written = new ServiceAnnotationRef();
        written.setName(ref.name());
        written.setModule(ref.module());
        written.setPresence(ref.required()
                ? TriggerMetadataModel.Annotation.PRESENCE_REQUIRED
                : TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL);
        written.setAttachPoint(ref.attachPoint());
        if (ref.typeConstraint() != null && !ref.typeConstraint().isEmpty()) {
            written.setTypeConstraint(TypeResolver.resolveAnnotationConstraint(
                    ref.typeConstraint(), packageName, ref.module()));
        }
        return written;
    }
}
