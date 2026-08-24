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

import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.modelgenerator.commons.trigger.models.TypeRef;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.List;
import java.util.Set;

/**
 * Generates a parameter name for a <b>service handler</b> (remote/resource method of a trigger's service
 * type) whose name {@code trigger-metadata.json} deliberately does not state.
 *
 * <p>A handler parameter's name is chosen by whoever writes the service, so it is not part of the
 * connector's contract and the authoring schema omits {@code params[].name} for such slots. The Copilot
 * still emits a full method signature, so a name must be synthesized — deterministically, idiomatically,
 * and as valid Ballerina.
 *
 * <p><b>Scope: handler parameters only.</b> Called from exactly one place, {@link ParamTypeResolver}, for
 * a slot whose metadata {@code name} is absent. Listener init parameters, concrete service-type methods
 * and client/module/record symbols all carry declared names already, so a call site outside the handler
 * path would invent a name for something that already has one.
 *
 * <p><b>Rules</b>, applied in order, all deterministic:
 * <ol>
 *   <li>The type is the slot's <b>first</b> type member — per the authoring schema, the codegen default
 *       for a union.</li>
 *   <li>A slot typed exactly {@code Error} becomes {@code <moduleAlias>Error} ({@code kafka:Error} →
 *       {@code kafkaError}), the convention used throughout the trigger ecosystem.</li>
 *   <li>Otherwise the declared type name drives the name: a payload-shape prefix is dropped
 *       ({@code AnydataMessage} → {@code Message}) so an {@code AnydataX|BytesX} union yields one stable
 *       name; the result is lower-camel-cased; and an array type is pluralized
 *       ({@code AnydataConsumerRecord[]} → {@code consumerRecords}).</li>
 *   <li>If the type yields no usable identifier (a built-in such as {@code json}, an anonymous shape such
 *       as {@code record {}}, or a keyword) and the slot declares a {@code dataBinding} rule, it becomes
 *       {@code payload}.</li>
 *   <li>Anything remaining, or a name a sibling parameter of the same handler already holds, falls back to
 *       the positional {@code paramN} (1-based), which is always valid and never collides.</li>
 * </ol>
 *
 * <p>Illustrative examples, not observed output:
 * <pre>
 *   AnydataConsumerRecord[]|BytesConsumerRecord[]  → consumerRecords
 *   Caller                                        → caller
 *   Error            (moduleAlias "kafka")        → kafkaError
 *   AnydataMessage|BytesMessage                    → message
 *   ContentDistributionMessage                     → contentDistributionMessage
 * </pre>
 *
 * <p><b>No document in the shipped corpus reaches this generator.</b> Two conditions must both hold for it
 * to be called — the slot states no {@code name}, and it is not {@code addMode: "many"} — and all ten
 * nameless slots across the thirty-two documents are {@code many}. That is not a coincidence of authoring:
 * the spec §7 requires {@code name} on every fixed slot and permits its omission only under
 * {@code addMode: "many"}, where the user names each occurrence. The rules are kept because the first
 * document to violate that — or the first spec revision to relax it — needs them.
 *
 * @since 1.7.0
 */
final class HandlerParamNameGenerator {

    /**
     * Data-shape prefixes that distinguish the members of a connector's payload union rather than
     * naming a distinct domain concept. Dropping them keeps the generated name identical across the
     * members of an {@code AnydataX|BytesX} union, so a name never depends on which member the
     * codegen default happens to be.
     */
    private static final List<String> PAYLOAD_SHAPE_PREFIXES = List.of("Anydata", "Bytes");

    /** The idiomatic name for a slot that binds a message body but has no usable type name. */
    private static final String PAYLOAD_NAME = "payload";

    private static final String ERROR_TYPE = "Error";

    private HandlerParamNameGenerator() {
        // Prevent instantiation
    }

    /**
     * Generates the name for one unnamed handler parameter slot.
     *
     * @param ref             the slot's codegen-default type (first union member), may be null
     * @param hasDataBinding  whether the slot declares a {@code dataBinding} rule
     * @param moduleAlias     the connector's module alias, used for the {@code <alias>Error} rule
     * @param index           the slot's 0-based position, used for the positional fallback
     * @param usedNames       names already taken by sibling parameters of the same handler
     * @return a deterministic, valid, non-colliding Ballerina identifier
     */
    static String generate(TypeRef ref, boolean hasDataBinding, String moduleAlias, int index,
                           Set<String> usedNames) {
        String candidate = fromType(ref, moduleAlias);
        if (candidate == null && hasDataBinding) {
            candidate = PAYLOAD_NAME;
        }
        // `SyntaxInfo.isKeyword` is the compiler's own answer, and it replaces a hand-listed set of ~100
        // words this class used to carry. That list was wrong in both directions: it included names that
        // are not keywords at all (`string`, `int`, `json`, `anydata`, `field`, `key`, `order`, `limit`,
        // `group`), so a legal identifier was rejected into the positional fallback, and it could only ever
        // drift from the language.
        //
        // A keyword IS still refused rather than quoted: Ballerina admits `'string` as an identifier, but a
        // quoted parameter name is not what generated code should read like, so the positional fallback
        // wins.
        if (candidate == null || SyntaxInfo.isKeyword(candidate) || usedNames.contains(candidate)) {
            return positionalName(index, usedNames);
        }
        return candidate;
    }

    /**
     * The positional fallback, advanced past any name a sibling parameter already holds — so it stays
     * collision-free even next to a slot authored literally as {@code param2}.
     */
    private static String positionalName(int index, Set<String> usedNames) {
        int position = index + 1;
        String name = "param" + position;
        while (usedNames.contains(name)) {
            name = "param" + (++position);
        }
        return name;
    }

    /**
     * Derives a name from the declared type, or null when the type carries no usable identifier
     * (built-in, anonymous shape, or cross-module reference whose name this module does not own).
     */
    private static String fromType(TypeRef ref, String moduleAlias) {
        if (ref == null || ref.name() == null || ref.name().isEmpty()) {
            return null;
        }
        String typeName = ref.name();
        boolean isArray = typeName.endsWith("[]");
        String base = TypeRefResolver.baseIdentifier(typeName);
        if (base == null || base.isEmpty() || !Character.isUpperCase(base.charAt(0))) {
            // Built-ins (json, string, byte[], ...) and anonymous shapes (record {}) start lowercase
            // or yield a keyword; they name no domain concept.
            return null;
        }
        String stripped = stripPayloadShapePrefix(base);
        // An `Error` slot is the handler's error channel: <alias>Error reads naturally and never
        // clashes with the message parameter of the same handler. Applied after prefix stripping so
        // a shaped alias (AnydataError) resolves the same way a bare Error does.
        if (ERROR_TYPE.equals(stripped)) {
            if (moduleAlias == null || moduleAlias.isEmpty()) {
                return null;
            }
            return isArray ? pluralize(moduleAlias + ERROR_TYPE) : moduleAlias + ERROR_TYPE;
        }
        String camelCase = Character.toLowerCase(stripped.charAt(0)) + stripped.substring(1);
        return isArray ? pluralize(camelCase) : camelCase;
    }

    /**
     * Drops a leading {@link #PAYLOAD_SHAPE_PREFIXES} entry when what remains is still a
     * capitalized identifier (so {@code Anydata} itself, or {@code Bytes}, is left untouched).
     */
    private static String stripPayloadShapePrefix(String base) {
        for (String prefix : PAYLOAD_SHAPE_PREFIXES) {
            if (base.length() > prefix.length() && base.startsWith(prefix)
                    && Character.isUpperCase(base.charAt(prefix.length()))) {
                return base.substring(prefix.length());
            }
        }
        return base;
    }

    /** Naive English pluralization, sufficient for connector type names. */
    private static String pluralize(String name) {
        if (name.endsWith("s") || name.endsWith("x") || name.endsWith("z")
                || name.endsWith("ch") || name.endsWith("sh")) {
            return name + "es";
        }
        if (name.length() > 1 && name.endsWith("y")
                && !isVowel(name.charAt(name.length() - 2))) {
            return name.substring(0, name.length() - 1) + "ies";
        }
        return name + "s";
    }

    private static boolean isVowel(char c) {
        return "aeiouAEIOU".indexOf(c) >= 0;
    }
}
