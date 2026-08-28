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

import java.util.Optional;

/**
 * Whether a slot may be omitted, and whether it repeats — for handlers and for parameters.
 *
 * @since 1.7.0
 */
final class PresenceRules {

    private static final String OPTIONAL = "optional";

    private PresenceRules() {
        // Prevent instantiation
    }

    /**
     * Whether a documented parameter may be omitted.
     *
     * <p>Only {@code "optional"} makes it so; an unrecognised or absent value reads as required. A slot
     * wrongly marked optional invites omitting something the handler needs, where one wrongly marked
     * required only costs an argument that could have been left out.
     */
    static boolean isOptional(TriggerMetadataModel.ServiceType.Param param) {
        return param != null && OPTIONAL.equals(param.presence());
    }

    /** The same question for a declared parameter, where the compiler has already answered it. */
    static boolean isOptional(TriggerSemanticFacts.DeclaredParam declared) {
        return declared != null && declared.optional();
    }

    /**
     * Whether a handler must be implemented, may be omitted, or is not a question the document answers.
     *
     * <p>Three states, not two. Under {@code addMode: "many"} the option is a shape the author instantiates,
     * so "is this particular handler required" has no meaning and the key is omitted rather than guessed at.
     * An absent {@code addMode} reads as {@code subset}, so this tests for {@code many} rather than for the
     * literal word {@code subset} — testing the other way would drop presence from most of the corpus.
     *
     * @param presence the option's declared presence; may be {@code null}
     * @param addMode  the option's own addMode; {@code null} reads as {@code subset}
     * @return {@code true} optional, {@code false} required, empty when the document is not answering
     */
    static Optional<Boolean> resolveOptional(String presence, String addMode) {
        if (isRepeatable(addMode)) {
            return Optional.empty();
        }
        if (TriggerMetadataModel.Annotation.PRESENCE_OPTIONAL.equals(presence)) {
            return Optional.of(true);
        }
        if (TriggerMetadataModel.Annotation.PRESENCE_REQUIRED.equals(presence)) {
            return Optional.of(false);
        }
        // An unrecognised or absent presence is not guessed at: asserting `required` could oblige generated
        // code to implement a handler the connector treats as optional, and asserting `optional` could omit
        // a mandatory one.
        return Optional.empty();
    }

    /** Whether an {@code addMode} takes its slot out of the fixed signature. */
    static boolean isRepeatable(String addMode) {
        return TriggerMetadataModel.ServiceType.HandlerOption.ADD_MODE_MANY.equals(addMode);
    }

    /** Whether a documented parameter repeats, so the author names each occurrence. */
    static boolean isRepeatable(TriggerMetadataModel.ServiceType.Param param) {
        return param != null && isRepeatable(param.addMode());
    }
}
