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

package io.ballerina.servicemodelgenerator.extension.connector;

import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_MODIFIER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_FLAG;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_VARIATION_SELECTOR;

/**
 * Computes the effective Ballerina type text of a parameter from its {@code type} {@link
 * TriggerUISchemaModel.Property} tree:
 *
 * <pre>
 *   element = codedata.boundType (if set) else codedata.defaultType
 *   base    = codedata.template applied to element   ({{type}} / T -> element)
 *   result  = the highest-precedence active PAYLOAD_MODIFIER sibling's template, else base
 * </pre>
 *
 * Pure and unit-testable.
 *
 * @since 1.9.0
 */
public final class PayloadComposer {

    private static final String BRACED = "{{type}}";
    // Compiled once: applyTemplate runs on the hot per-parameter composition path.
    private static final Pattern STANDALONE_T = Pattern.compile("\\bT\\b");

    private PayloadComposer() {
    }

    /** The emitted Ballerina type of a parameter, from its {@code type} Property. */
    public static String effectiveType(TriggerUISchemaModel.Property typeProp) {
        if (typeProp == null) {
            return "";
        }
        String fieldType = selectedFieldType(typeProp);
        if (FIELD_TYPE_FLAG.equals(fieldType)) {
            String ballerinaType = selectedBallerinaType(typeProp);
            return ballerinaType == null ? "" : ballerinaType;
        }

        Located located = locatePayload(typeProp);
        if (located == null) {
            return stringValue(typeProp.value());
        }

        TriggerUISchemaModel.Codedata cd = located.payload.codedata();
        String element = element(cd);
        String modifierTemplate = highestPrecedenceModifierTemplate(located.siblings);
        if (modifierTemplate != null) {
            return applyTemplate(modifierTemplate, element);
        }
        String base = applyTemplate(templateOf(cd), element);
        return base.isEmpty() ? element : base;
    }

    /**
     * The template of the highest-precedence active {@code PAYLOAD_MODIFIER} sibling, or {@code null}
     * when none is active. A modifier wins over another active one when the other's {@code supersedes}
     * does not name it; among modifiers no active peer supersedes (the common case: at most one
     * modifier is ever active), the first one found wins.
     */
    private static String highestPrecedenceModifierTemplate(List<TriggerUISchemaModel.Property> siblings) {
        if (siblings == null) {
            return null;
        }
        List<TriggerUISchemaModel.Codedata> active = new ArrayList<>();
        for (TriggerUISchemaModel.Property sibling : siblings) {
            TriggerUISchemaModel.Codedata sc = sibling.codedata();
            if (sc != null && CD_TYPE_PAYLOAD_MODIFIER.equals(sc.type()) && isTrue(sibling.value())
                    && sc.template() != null && !sc.template().isBlank()) {
                active.add(sc);
            }
        }
        for (TriggerUISchemaModel.Codedata candidate : active) {
            boolean beaten = active.stream().anyMatch(other -> other != candidate
                    && other.supersedes() != null && other.supersedes().contains(candidate.modifier()));
            if (!beaten) {
                return candidate.template();
            }
        }
        return active.isEmpty() ? null : active.get(0).template();
    }

    /**
     * The default composition of a parameter's type — element = {@code defaultType} (ignoring any
     * bound type) wrapped by the base template only (ignoring active modifiers). This is the
     * "placeholder" type the UI resets to when the user removes a custom schema.
     */
    public static String defaultComposedType(TriggerUISchemaModel.Property typeProp) {
        Located located = locatePayload(typeProp);
        if (located == null) {
            return effectiveType(typeProp);
        }
        TriggerUISchemaModel.Codedata cd = located.payload.codedata();
        String element = cd == null || cd.defaultType() == null ? "" : cd.defaultType();
        String base = applyTemplate(templateOf(cd), element);
        return base.isEmpty() ? element : base;
    }

    /** The PAYLOAD_TYPE node backing a parameter's type tree (a variant sub-form or the type itself). */
    public static TriggerUISchemaModel.Property payloadNode(TriggerUISchemaModel.Property typeProp) {
        Located located = locatePayload(typeProp);
        return located == null ? null : located.payload;
    }

    /** The base wrap template of the payload backing a type tree (e.g. {@code {{type}}[]}), or empty. */
    public static String payloadTemplate(TriggerUISchemaModel.Property typeProp) {
        Located located = locatePayload(typeProp);
        return located == null ? "" : templateOf(located.payload.codedata());
    }

    /**
     * The non-payload siblings composed alongside the payload (PAYLOAD_MODIFIER flags such as
     * {@code stream}, METADATA_FLAG markers such as {@code rows}), keyed as declared. Empty when the
     * type tree has no payload sub-form.
     */
    public static Map<String, TriggerUISchemaModel.Property> compositionSiblings(
            TriggerUISchemaModel.Property typeProp) {
        if (typeProp == null) {
            return Map.of();
        }
        String fieldType = selectedFieldType(typeProp);
        Map<String, TriggerUISchemaModel.Property> children = typeProp.properties();
        if (FIELD_TYPE_VARIATION_SELECTOR.equals(fieldType) && children != null) {
            TriggerUISchemaModel.Property variant = selectedVariant(typeProp, children);
            return variant == null ? Map.of() : compositionSiblings(variant);
        }
        if (children == null || isPayload(typeProp)) {
            return Map.of();
        }
        Map<String, TriggerUISchemaModel.Property> siblings = new LinkedHashMap<>();
        for (Map.Entry<String, TriggerUISchemaModel.Property> child : children.entrySet()) {
            if (!isPayload(child.getValue())) {
                siblings.put(child.getKey(), child.getValue());
            }
        }
        return siblings;
    }

    private record Located(TriggerUISchemaModel.Property payload, List<TriggerUISchemaModel.Property> siblings) {
    }

    private static Located locatePayload(TriggerUISchemaModel.Property node) {
        if (node == null) {
            return null;
        }
        if (isPayload(node)) {
            return new Located(node, null);
        }
        String fieldType = selectedFieldType(node);
        Map<String, TriggerUISchemaModel.Property> children = node.properties();
        if (FIELD_TYPE_VARIATION_SELECTOR.equals(fieldType) && children != null) {
            TriggerUISchemaModel.Property variant = selectedVariant(node, children);
            return variant == null ? null : locatePayload(variant);
        }
        if (children != null) {
            TriggerUISchemaModel.Property payload = null;
            for (TriggerUISchemaModel.Property child : children.values()) {
                if (isPayload(child)) {
                    payload = child;
                    break;
                }
            }
            if (payload != null) {
                TriggerUISchemaModel.Property found = payload;
                List<TriggerUISchemaModel.Property> siblings = children.values().stream()
                        .filter(c -> c != found)
                        .toList();
                return new Located(found, siblings);
            }
        }
        return null;
    }

    private static TriggerUISchemaModel.Property selectedVariant(TriggerUISchemaModel.Property selector,
                                                         Map<String, TriggerUISchemaModel.Property> variants) {
        Object value = selector.value();
        if (value != null && variants.containsKey(String.valueOf(value))) {
            return variants.get(String.valueOf(value));
        }
        for (TriggerUISchemaModel.Property variant : variants.values()) {
            if (variant.enabled()) {
                return variant;
            }
        }
        return variants.values().stream().findFirst().orElse(null);
    }

    private static boolean isPayload(TriggerUISchemaModel.Property node) {
        TriggerUISchemaModel.Codedata cd = node == null ? null : node.codedata();
        if (cd == null || cd.type() == null) {
            return false;
        }
        return CD_TYPE_PAYLOAD_TYPE.equals(cd.type()) || CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD.equals(cd.type());
    }

    private static String element(TriggerUISchemaModel.Codedata cd) {
        if (cd == null) {
            return "";
        }
        if (cd.boundType() != null && !cd.boundType().isBlank()) {
            return cd.boundType();
        }
        return cd.defaultType() == null ? "" : cd.defaultType();
    }

    /** The base wrap template: {@code codedata.template}, else a {@code modifiers.template} (kafka). */
    private static String templateOf(TriggerUISchemaModel.Codedata cd) {
        if (cd == null) {
            return "";
        }
        if (cd.template() != null && !cd.template().isBlank()) {
            return cd.template();
        }
        if (cd.modifiers() instanceof Map<?, ?> modifiers) {
            Object template = modifiers.get("template");
            if (template != null) {
                return String.valueOf(template);
            }
        }
        return "";
    }

    /**
     * Substitutes the element into a wrap template. Supports {@code {{type}}} or a standalone {@code T}
     * -- the two authoring styles are alternatives, never combined in one template (see {@code
     * TriggerFunctionAdapter#normalizeTemplate}, which translates one into the other) -- so matching
     * {@code {{type}}} always short-circuits the (otherwise redundant) standalone-{@code T} pass.
     * Package-visible: shared with {@link IncludedRecordBinder}, whose wrapper-type templates are
     * always normalized to this same {@code {{type}}} form before reaching it.
     */
    static String applyTemplate(String template, String element) {
        if (template == null || template.isBlank()) {
            return element == null ? "" : element;
        }
        String safe = element == null ? "" : element;
        if (template.contains(BRACED)) {
            return template.replace(BRACED, safe);
        }
        return STANDALONE_T.matcher(template).replaceAll(Matcher.quoteReplacement(safe));
    }

    public static String selectedFieldType(TriggerUISchemaModel.Property property) {
        if (property == null || property.types() == null) {
            return null;
        }
        TriggerUISchemaModel.PropertyType selected = null;
        for (TriggerUISchemaModel.PropertyType type : property.types()) {
            if (type.selected()) {
                selected = type;
                break;
            }
        }
        if (selected == null && !property.types().isEmpty()) {
            selected = property.types().getFirst();
        }
        return selected == null ? null : selected.fieldType();
    }

    private static String selectedBallerinaType(TriggerUISchemaModel.Property property) {
        if (property == null || property.types() == null) {
            return null;
        }
        for (TriggerUISchemaModel.PropertyType type : property.types()) {
            if (type.selected() && type.ballerinaType() != null) {
                return type.ballerinaType();
            }
        }
        for (TriggerUISchemaModel.PropertyType type : property.types()) {
            if (type.ballerinaType() != null) {
                return type.ballerinaType();
            }
        }
        return null;
    }

    /** Truthy for a boolean {@code true} or a case-insensitive {@code "true"} string; shared by every
     *  class in this package that reads a flag-shaped {@code TriggerUISchemaModel} value. */
    static boolean isTrue(Object value) {
        return Boolean.TRUE.equals(value) || "true".equalsIgnoreCase(String.valueOf(value));
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
