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

import io.ballerina.flowmodelgenerator.core.copilot.model.BindingShape;
import io.ballerina.flowmodelgenerator.core.copilot.model.ParamBinding;
import io.ballerina.flowmodelgenerator.core.copilot.model.Return;
import io.ballerina.flowmodelgenerator.core.copilot.model.Type;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypedescVariant;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * Type-shape resolution: a handler return, a data-binding shape, and the binding spec built from them.
 * Grouped because all three turn document type references into rendered signatures the same way.
 *
 * @since 1.7.0
 */
final class TypeShapeRules {


    private static final String NIL = "()";

    private TypeShapeRules() {
        // Prevent instantiation
    }

    /** The union's joined, module-prefixed signature text. */
    static String signature(List<TypeRef> returns, String packageName, Predicate<String> declaresType) {
        return TypeRefResolver.renderUnion(returns, packageName, declaresType);
    }

    /**
     * Builds the {@code return} object from an already-joined signature.
     *
     * @param returnSignature the joined signature, or the declared method's own return signature
     * @param packageName     the resolved package name, for link resolution
     * @return the return carrying only its type, or empty when the return carries no information
     */
    static Optional<Return> resolveReturn(String returnSignature, String packageName) {
        if (returnSignature == null || returnSignature.isEmpty()) {
            return Optional.empty();
        }
        String canonical = ServiceIndexLoader.canonicalizeReturnType(returnSignature);
        if (canonical.isEmpty() || NIL.equals(canonical)) {
            return Optional.empty();
        }
        Return returnValue = new Return();
        returnValue.setType(TypeResolver.resolveTypeWithLinks(canonical, packageName));
        return Optional.of(returnValue);
    }

    /**
     * Resolves one embedding of a variant's bound type.
     *
     * <p>Every slot but {@code form} is left null when it states nothing, so the wire omits the key rather
     * than carrying an empty value. {@code fixedFields} in particular is absent — not empty — when the
     * envelope is not an introspectable record of the resolved package, because a consumer must not claim to
     * know which fields are pinned when nothing was read.
     *
     * @param shape          the {@code shapes[]} entry
     * @param packageName    the resolved package name, for rendering type references per the spec
     * @param declaresType   whether the home module declares a type of a given name
     * @param envelopeFields the declared field names of a record, by bare type name
     * @return the resolved shape, or {@code null} when the entry names no form and so states nothing
     */
    static BindingShape resolveShape(TriggerMetadataModel.ServiceType.Shape shape, String packageName,
                                 Predicate<String> declaresType,
                                 Function<String, List<String>> envelopeFields) {
        if (shape == null || shape.form() == null || shape.form().isBlank()) {
            return null;
        }
        String envelope = render(shape.envelope(), packageName, declaresType);
        List<String> bindable = nonBlank(shape.bindableFields());
        String completionType = renderUnion(shape.completionType(), packageName, declaresType);

        BindingShape resolved = new BindingShape();
        // The spec's `form`, carried verbatim so the renderer decides the wording.
        resolved.setForm(shape.form());
        // For `array`/`stream`, whether each item is bare or included.
        resolved.setElement(blankToNull(shape.element()));
        if (envelope != null) {
            // The record a user type includes with `*Envelope;` — or, under the spec §1.4's
            // `subtypeFamily`, any record of the named type's own subtype family, which is what http's
            // `StatusCodeResponse` is. The flag travels with the type because the two readings need
            // different prose and nothing else on the page distinguishes them.
            resolved.setEnvelope(asType(shape.envelope(), envelope, packageName));
        }
        // The envelope's fields this variant may retype, in document order; never truncated.
        resolved.setBindableFields(emptyToNull(bindable));
        // The envelope's remaining fields, derived rather than restated (the spec).
        resolved.setFixedFields(emptyToNull(fixedFields(shape.envelope(), bindable, envelopeFields)));
        if (completionType != null) {
            // For `stream`, the stream's completion type.
            resolved.setCompletionType(TypeResolver.resolveTypeWithLinks(completionType, packageName));
        }
        return resolved;
    }

    /** Keeps the omission rule in one place: an empty list is "nothing to state", so it becomes absent. */
    private static <T> List<T> emptyToNull(List<T> values) {
        return values == null || values.isEmpty() ? null : List.copyOf(values);
    }

    /**
     * One document type reference, resolved to the wire's {@code {name, links}} pair and carrying the spec
     * §1.4 {@code subtypeFamily} flag when the reference states it.
     *
     * <p>Used only inside a data binding, which is the whole of where §1.4 puts the flag: a binding's
     * {@code constraint}, its {@code excludes} and a shape's {@code envelope} name a <i>relationship</i> a
     * declared type must satisfy, so "is a subtype of" and "is exactly" are genuinely different claims
     * there and identical everywhere else.
     *
     * @param ref         the document reference the signature came from; may be {@code null}
     * @param rendered    the reference's already-rendered signature text
     * @param packageName the library being rendered, for link resolution
     * @return the wire type
     */
    private static Type asType(TypeRef ref, String rendered, String packageName) {
        Type type = TypeResolver.resolveTypeWithLinks(rendered, packageName);
        if (ref != null && ref.isSubtypeFamily()) {
            type.setSubtypeFamily(true);
        }
        return type;
    }

    /**
     * The spec §9's derivation: the envelope's declared fields minus the bindable ones, in declaration
     * order.
     *
     * <p>Uses the envelope's <b>bare</b> name, not its rendered signature: the lookup is against the
     * resolved package's own symbols, where a type is known by the name it was declared with.
     *
     * <p><b>Not derived for a subtype family.</b> The spec §1.4 makes such an envelope stand for the named
     * type and every subtype of it, "open ended over every subtype the named type's own module declares"
     * plus the reader's own narrowings — so the family head's field set is a lower bound, not a fixed one,
     * and a subtype may add fields the head never declared. Reading the head's fields and calling the
     * remainder fixed would state a prohibition the spec does not make. Absent rather than empty, which is
     * the difference between "nothing is pinned" and "we did not look".
     */
    private static List<String> fixedFields(TypeRef envelope, List<String> bindableFields,
                                            Function<String, List<String>> envelopeFields) {
        if (envelope == null || envelope.name() == null || envelopeFields == null
                || envelope.isSubtypeFamily()) {
            return List.of();
        }
        List<String> declared = envelopeFields.apply(TypeRefResolver.baseIdentifier(envelope.name()));
        if (declared == null || declared.isEmpty()) {
            return List.of();
        }
        Set<String> bindable = new LinkedHashSet<>(bindableFields);
        List<String> fixed = new ArrayList<>();
        for (String field : declared) {
            if (!bindable.contains(field)) {
                fixed.add(field);
            }
        }
        return fixed;
    }

    private static List<String> nonBlank(List<String> values) {
        if (values == null) {
            return List.of();
        }
        List<String> kept = new ArrayList<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                kept.add(value);
            }
        }
        return kept;
    }

    private static String render(TypeRef ref, String packageName, Predicate<String> declaresType) {
        return ref == null ? null : blankToNull(TypeRefResolver.render(ref, packageName, declaresType));
    }

    /**
     * A completion type, which the spec types as a TypeRef-or-union so that a nilable one is expressed the
     * same way as everywhere else — an explicit {@code ()} member rather than a flag.
     */
    private static String renderUnion(List<TypeRef> refs, String packageName,
                                      Predicate<String> declaresType) {
        return refs == null || refs.isEmpty() ? null
                : blankToNull(TypeRefResolver.renderNilableUnion(refs, packageName, declaresType));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /**
     * Resolves a parameter's inline binding.
     *
     * <p>Every type name becomes a {@link Type} rather than bare text, because the type closure that decides
     * which definitions reach the prompt walks links. A binding note naming {@code AnydataConsumerRecord}
     * with no way to reach its declaration would tell the model to include a record the file never defines.
     *
     * <p><b>The wire shape mirrors the document's</b> — variants, each with a bound, its exclusions and its
     * shapes — rather than flattening to a single {@code modes} array. Flattening would have to pick one
     * bound per binding, and the spec's whole point is that two variants can share shapes while differing in
     * bound (ftp's CSV rows) or share a bound while differing in shape (kafka's bare-vs-included).
     *
     * @param binding        the parameter's {@code dataBinding}; may be {@code null}
     * @param packageName    the resolved package name, for rendering type references per the spec
     * @param declaresType   whether the home module declares a type of a given name
     * @param envelopeFields the declared field names of a record, by bare type name
     * @return the resolved binding, or empty when it states nothing a consumer can act on
     */
    static Optional<ParamBinding> resolveBinding(TriggerMetadataModel.ServiceType.DataBinding binding,
                                         String packageName,
                                         Predicate<String> declaresType,
                                         Function<String, List<String>> envelopeFields) {
        if (binding == null || binding.typedescs() == null || binding.typedescs().isEmpty()) {
            return Optional.empty();
        }
        List<TypedescVariant> variants = new ArrayList<>();
        for (TriggerMetadataModel.ServiceType.TypedescVariant variant : binding.typedescs()) {
            if (variant == null) {
                continue;
            }
            String constraint = render(variant.constraint(), packageName, declaresType);
            if (constraint == null) {
                // A variant with no bound constrains nothing, so there is no type for a consumer to offer.
                continue;
            }
            List<BindingShape> shapes = new ArrayList<>();
            for (TriggerMetadataModel.ServiceType.Shape shape : safeShapes(variant)) {
                BindingShape resolved =
                        resolveShape(shape, packageName, declaresType, envelopeFields);
                if (resolved != null) {
                    shapes.add(resolved);
                }
            }
            if (shapes.isEmpty()) {
                // The bound is known but no way of embedding it is, which describes no declarable type.
                continue;
            }
            TypedescVariant resolvedVariant = new TypedescVariant();
            // This variant's upper bound, carrying the spec §1.4 flag when the bound is a subtype family
            // rather than one exact type.
            resolvedVariant.setConstraint(asType(variant.constraint(), constraint, packageName));
            // Instantiations a sibling variant owns, which this one must not claim. A negative constraint,
            // derivable from nothing else, so a consumer states it even when every positive type is visible.
            resolvedVariant.setExcludes(emptyToNull(
                    renderAllAsTypes(variant.excludes(), packageName, declaresType)));
            // The legal embeddings of this variant's bound, in document order; never empty.
            resolvedVariant.setShapes(List.copyOf(shapes));
            variants.add(resolvedVariant);
        }
        if (variants.isEmpty()) {
            return Optional.empty();
        }
        ParamBinding resolved = new ParamBinding();
        // The independent variants, in document order; never empty.
        resolved.setTypedescs(List.copyOf(variants));
        return Optional.of(resolved);
    }

    private static List<TriggerMetadataModel.ServiceType.Shape> safeShapes(
            TriggerMetadataModel.ServiceType.TypedescVariant variant) {
        return variant.shapes() == null ? List.of() : variant.shapes();
    }

    private static List<Type> renderAllAsTypes(List<TypeRef> refs, String packageName,
                                               Predicate<String> declaresType) {
        if (refs == null || refs.isEmpty()) {
            return List.of();
        }
        List<Type> rendered = new ArrayList<>();
        for (TypeRef ref : refs) {
            String value = render(ref, packageName, declaresType);
            if (value != null) {
                // The spec §1.4 applies to `excludes` too, and there the family reading is what makes the
                // prohibition correct: a user record that merely *is a* `StatusCodeResponse` is excluded
                // from the bare variant, not only the named type itself.
                rendered.add(asType(ref, value, packageName));
            }
        }
        return rendered;
    }

}
