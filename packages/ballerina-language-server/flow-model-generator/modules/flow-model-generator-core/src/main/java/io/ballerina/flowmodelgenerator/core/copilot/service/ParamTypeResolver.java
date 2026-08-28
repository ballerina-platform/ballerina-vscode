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
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Owns <b>the spec {@code params[]}</b>: a handler parameter slot's type, presence and name.
 *
 * <p>{@code type} is a {@code TypeRef} or array whose first element is the codegen default (the spec), so the
 * emitted signature is that member; {@code presence} is {@code required}/{@code optional}.
 *
 * <p>{@code addMode} is <b>not</b> owned here — see {@link PresenceRules}. The renderer treats
 * {@code presence} and {@code addMode} completely differently, so they are genuinely separate constructs.
 *
 * <p>{@code name} is the interesting one: The spec calls it an "optional domain-meaningful name … added only where
 * real source evidence shows it matters". Where the document states one it wins; where it does not, a name is
 * still synthesized, because a method signature cannot be written without one.
 *
 * @since 1.7.0
 */
final class ParamTypeResolver {

    private ParamTypeResolver() {
        // Prevent instantiation
    }

    /**
     * The slot's emitted type signature: its codegen-default member, module-prefixed per the spec.
     */
    static String signature(TriggerMetadataModel.ServiceType.Param param, String packageName,
                            Predicate<String> declaresType) {
        return TypeRefResolver.render(TypeRefResolver.first(param.type()), packageName, declaresType);
    }

    /**
     * A slot's full static surface: the type written in the signature, and the other types that are equally
     * legal for it.
     *
     * <p><b>{@code alternatives} must never be joined with {@code |}.</b> A {@code |}-joined type declares a
     * parameter <i>of union type</i>, whereas the spec means the author picks exactly one of them when writing
     * the signature. {@code rabbitmq}'s {@code onMessage} takes an {@code AnydataMessage} or a
     * {@code BytesMessage}, not an {@code AnydataMessage|BytesMessage}.
     *
     * @param signature    the codegen-default member (the spec's first element), as written in the signature
     * @param alternatives every other legal member, in document order; rendered but never joined
     * @param dropped      members naming a same-module type the resolved package does not declare, recorded
     *                     rather than rendered so an unresolvable type name never reaches the prompt
     */
    record ParamType(String signature, List<String> alternatives, List<String> dropped) {
    }

    /**
     * Resolves a slot's whole type surface.
     *
     * <p>Only the alternatives are filtered against the resolved package. The <b>signature</b> member is
     * not: an undeclared signature member is what makes the whole handler unusable, and that veto is
     * {@link #signatureReferencesUndeclaredType}'s job, applied before a handler is built at all.
     *
     * @param param        the slot
     * @param packageName  the resolved package name, for rendering per the spec
     * @param declaresType whether the home module declares a type of a given name
     * @return the signature member, the surviving alternatives, and the members dropped as undeclared
     */
    static ParamType resolveType(TriggerMetadataModel.ServiceType.Param param, String packageName,
                                 Predicate<String> declaresType) {
        List<TypeRef> members = param.type() == null ? List.of() : param.type();
        String signature = signature(param, packageName, declaresType);
        List<String> alternatives = new ArrayList<>();
        List<String> dropped = new ArrayList<>();
        for (int i = 1; i < members.size(); i++) {
            TypeRef member = members.get(i);
            String rendered = TypeRefResolver.render(member, packageName, declaresType);
            if (rendered == null || rendered.isEmpty() || rendered.equals(signature)) {
                continue;
            }
            if (isUndeclaredBareUserType(member, declaresType)) {
                dropped.add(rendered);
                continue;
            }
            alternatives.add(rendered);
        }
        return new ParamType(signature, alternatives, dropped);
    }

    /**
     * The slot's name: the authored one where the document states it, otherwise a deterministic
     * generated one.
     *
     * @param param       the slot
     * @param position    its zero-based index, used for the positional fallback
     * @param moduleAlias the library's module alias, used for the {@code <alias>Error} convention
     * @param usedNames   names already taken by siblings, which the generated name must avoid
     */
    static String resolveName(TriggerMetadataModel.ServiceType.Param param, int position,
                              String moduleAlias, Set<String> usedNames) {
        if (param.name() != null) {
            return param.name();
        }
        return HandlerParamNameGenerator.generate(TypeRefResolver.first(param.type()),
                param.dataBinding() != null, moduleAlias, position, usedNames);
    }

    /**
     * Whether a handler's emitted signature references a bare, capitalized — i.e. user-defined-looking —
     * same-module type the resolved package does not declare.
     *
     * <p>This is the guard against a document authored for a different release: rendering
     * {@code websub}'s {@code onHubError} when the package declares no {@code HubError} would put an
     * uncompilable signature in the prompt. Only the members that actually reach the signature are
     * inspected — the first type member of each parameter, and every member of the spec §5.4
     * {@code returns.type}.
     *
     * <p>A handler with no {@code returns} at all — the {@code file} connector's, whose language form
     * forbids a return clause — contributes nothing to check rather than being treated as suspect.
     */
    static boolean signatureReferencesUndeclaredType(
            TriggerMetadataModel.ServiceType.HandlerOption option, Predicate<String> declaresType) {
        if (option.params() != null) {
            for (TriggerMetadataModel.ServiceType.Param param : option.params()) {
                if (param != null
                        && isUndeclaredBareUserType(TypeRefResolver.first(param.type()), declaresType)) {
                    return true;
                }
            }
        }
        if (option.returns() != null && option.returns().type() != null) {
            for (TypeRef ref : option.returns().type()) {
                if (isUndeclaredBareUserType(ref, declaresType)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * A bare reference (the spec: same module as the connector's own types) whose base identifier looks
     * user-defined but which the resolved package does not declare. A {@code packageInfo}-carrying
     * reference is cross-module and cannot be checked against this module's symbols, so it is trusted.
     *
     * <p>A leaf the document marks {@code builtin} (the spec §1.3) is trusted for the same reason and one
     * stronger: it names a language type, which no package declares and none has to. The casing test below
     * already lets today's builtins through — {@code anydata} and {@code record {}} are lower-case — so
     * this changes nothing in the corpus; it is here because reading the flag is what the spec §1.2 asks a
     * consumer to do, and a future capitalised language type would otherwise veto a whole handler.
     *
     * <p><b>A composite is walked, not skipped.</b> The spec §1.1 makes {@code T[]},
     * {@code stream<T, C>} and {@code readonly & T} trees whose leaves each carry their own name, so the
     * type a reader must be able to resolve sits one or more levels down — {@code kafka}'s payload slot is
     * an array of {@code AnydataConsumerRecord}, not a name ending in {@code []}. Checking only the top
     * node would let exactly the release-drift this guard exists to catch through, silently, for every
     * batched or streamed slot in the corpus.
     */
    private static boolean isUndeclaredBareUserType(TypeRef ref, Predicate<String> declaresType) {
        if (ref == null) {
            return false;
        }
        if (ref.isComposite()) {
            return anyUndeclared(ref.elementType(), declaresType)
                    || anyUndeclared(ref.completionType(), declaresType);
        }
        if (ref.name() == null || ref.packageInfo() != null || ref.isBuiltin()) {
            return false;
        }
        String base = TypeRefResolver.baseIdentifier(ref.name());
        return base != null && !base.isEmpty() && Character.isUpperCase(base.charAt(0))
                && !declaresType.test(base);
    }

    /** Whether any member of a composite's part is an undeclared bare user type. */
    private static boolean anyUndeclared(List<TypeRef> part, Predicate<String> declaresType) {
        if (part == null) {
            return false;
        }
        for (TypeRef member : part) {
            if (isUndeclaredBareUserType(member, declaresType)) {
                return true;
            }
        }
        return false;
    }
}
