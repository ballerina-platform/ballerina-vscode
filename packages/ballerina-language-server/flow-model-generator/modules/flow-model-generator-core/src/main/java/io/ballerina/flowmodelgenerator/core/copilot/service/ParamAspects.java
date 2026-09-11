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

import io.ballerina.flowmodelgenerator.core.copilot.model.ParamBinding;
import io.ballerina.flowmodelgenerator.core.copilot.model.Type;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

/**
 * The parameter tier, plus data binding. Each method runs once per parameter slot of a handler.
 *
 * <p>The same provenance split as the handler tier applies: a <b>declared</b> parameter of a concrete
 * service type supplies its own name, type and optionality; a <b>metadata</b> slot supplies its type and
 * presence, and its name only sometimes. Parameter annotations are {@link AnnotationAspects#param}.
 *
 * <p>Order carries no meaning — {@link ParamDraft} holds each slot as a field and emits the wire contract's
 * key order itself.
 *
 * @since 1.7.0
 */
final class ParamAspects {

    private ParamAspects() {
        // Prevent instantiation
    }

    /**
     * The spec {@code params[]} — one slot's name, description and type.
     *
     * <p>The spec calls {@code name} an "optional domain-meaningful name", so where the document omits it a
     * deterministic one is generated. This is the only place in the pipeline where a name is synthesized
     * rather than read. A repeatable slot is exempt: The spec says its occurrences are "each independently named"
     * by the author, so there is no single name for it and none is synthesized — though an authored name is
     * still a real fact and is kept.
     *
     * <p>The spec's rule applies to parameters too: a documented slot of a marker-type handler has no
     * symbol behind it, so the document's {@code doc} is the only description of what it carries.
     */
    static void type(ParamScope scope, ParamDraft draft) {
        TriggerScope service = scope.handler().service();
        String packageName = service.packageName();

        if (scope.declared() != null) {
            TriggerSemanticFacts.DeclaredParam declared = scope.declared();
            draft.setName(declared.name());
            draft.setDescription(declared.description());
            draft.setType(TypeResolver.resolveTypeWithLinks(
                    declared.typeSignature() != null ? declared.typeSignature() : "", packageName));
            // Optionality is `presence`, for both sources.
            return;
        }

        TriggerMetadataModel.ServiceType.Param param = scope.param();
        // Reading PresenceRules's predicate rather than the raw key leaves the spec's `addMode` with
        // exactly one owner.
        String name = PresenceRules.isRepeatable(param)
                ? param.name()
                : ParamTypeResolver.resolveName(param, scope.position(),
                        TypeRefResolver.moduleAlias(packageName), scope.siblingNames());
        draft.setDescription(param.doc());
        // The spec `deprecated`, the parameter-scope twin of the spec's. No corpus slot states one yet; the
        // wiring is here because the alternative is that the first document to state one loses it silently.
        draft.setDeprecated(param.deprecated());
        if (name != null) {
            scope.siblingNames().add(name);
        }

        ParamTypeResolver.ParamType resolved = ParamTypeResolver.resolveType(param, packageName,
                service.declaresType());

        draft.setName(name);
        draft.setType(TypeResolver.resolveTypeWithLinks(resolved.signature(), packageName));

        // The spec's other legal types, as link-carrying pairs so the type closure reaches their
        // definitions. Never joined with `|` — see ParamTypeResolver.ParamType.
        List<Type> alternatives = new ArrayList<>();
        for (String alternative : resolved.alternatives()) {
            alternatives.add(TypeResolver.resolveTypeWithLinks(alternative, packageName));
        }
        draft.setAlternatives(alternatives);

        for (String undeclared : resolved.dropped()) {
            draft.drop("paramType: " + undeclared
                    + ": an alternative type the resolved package version does not declare");
        }
    }

    /**
     * The spec {@code params[].presence} — whether the slot may be omitted from the signature. Reads
     * whichever source the handler came from: a metadata slot states {@code presence}, a declared parameter
     * carries the compiler's answer.
     */
    static void presence(ParamScope scope, ParamDraft draft) {
        draft.setOptional(scope.declared() != null
                ? PresenceRules.isOptional(scope.declared())
                : PresenceRules.isOptional(scope.param()));
    }

    /**
     * The spec {@code params[].addMode} — the flag that takes a slot out of the fixed signature.
     *
     * <p>Metadata-described slots only: a declared parameter either exists or does not, and there is no
     * notion of one that repeats.
     */
    static void repeat(ParamScope scope, ParamDraft draft) {
        if (PresenceRules.isRepeatable(scope.param())) {
            draft.setRepeatable(true);
        }
    }

    /**
     * The spec {@code params[].dataBinding} — how a parameter's raw value may be projected into a
     * user-defined type.
     *
     * <p>{@link TypeShapeRules#resolveBinding} owns the resolved shape, including why every type name is
     * carried as a link-bearing {@code Type} and why the variant structure mirrors the document's.
     */
    static void dataBinding(ParamScope scope, ParamDraft draft) {
        TriggerMetadataModel.ServiceType.Param param = scope.param();
        if (param == null || param.dataBinding() == null) {
            return;
        }
        TriggerScope service = scope.handler().service();
        String packageName = service.packageName();
        Optional<ParamBinding> spec = TypeShapeRules.resolveBinding(
                param.dataBinding(), packageName, service.declaresType(), envelopeFields(service));

        if (spec.isEmpty()) {
            // A binding is written inline, so there is no id to have mis-resolved: the only way here is a
            // binding whose every variant was unusable. Reported against the parameter, which is also where
            // the document author has to edit.
            String subject = param.name() == null ? "<unnamed param>" : param.name();
            draft.drop("dataBinding: " + subject
                    + ": its dataBinding declares no variant with both a bound and a readable shape");
            return;
        }
        draft.setBinding(spec.get());
    }

    /**
     * The envelope-field lookup the spec's derived {@code fixedFields} needs, or an empty one when no
     * compiled package is behind this scope — in which case {@code fixedFields} is simply not derived,
     * rather than guessed.
     *
     * <p>Package-private rather than private because the spec §9.1 gave a <i>return</i> a binding of the
     * same shape, and {@link HandlerAspects#returnType} needs the identical lookup. Sharing it is what
     * keeps "how a fixed-field set is derived" one decision rather than two.
     */
    static Function<String, List<String>> envelopeFields(TriggerScope scope) {
        TriggerSemanticFacts facts = scope.facts();
        return facts == null ? name -> List.of() : facts::recordFieldNames;
    }
}
