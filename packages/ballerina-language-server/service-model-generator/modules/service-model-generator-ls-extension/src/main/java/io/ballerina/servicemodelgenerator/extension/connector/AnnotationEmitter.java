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

import io.ballerina.modelgenerator.commons.ModuleAliasResolver;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ANNOTATION_ATTACHMENT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_COMPLEX_FUNCTION_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ENUM_LITERAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_FIELD_VALUE_CHOICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_MAPPING_CONSTRUCTOR;

/**
 * Emits Ballerina annotation attachments (e.g. {@code @ftp:FunctionConfig { ... }}) from a node's
 * {@code properties} map, driven entirely by the granular {@code codedata} roles — no per-connector
 * code. Service-level {@code SERVICE_ANNOTATION} attachments are a different shape and are handled by
 * {@link SchemaDrivenSourceGenerator#buildServiceAnnotations} instead.
 *
 * @since 1.9.0
 */
public final class AnnotationEmitter {

    private static final String STRING_TYPE = "string";

    private AnnotationEmitter() {
    }

    /**
     * The annotation attachment strings (e.g. {@code @ftp:FunctionConfig {...}}) in a properties map.
     * A node whose body renders empty (every optional field unchecked) is skipped entirely. Also
     * recognizes a whole-value {@code ANNOTATION_ATTACHMENT} node whose {@code value} already IS the
     * complete mapping-constructor body (see {@code TriggerModelSynthesizer}).
     */
    public static List<String> annotationsOf(Map<String, TriggerUISchemaModel.Property> properties) {
        List<String> annotations = new ArrayList<>();
        if (properties == null) {
            return annotations;
        }
        for (TriggerUISchemaModel.Property node : properties.values()) {
            TriggerUISchemaModel.Codedata cd = node.codedata();
            if (cd == null) {
                continue;
            }
            if (CD_TYPE_COMPLEX_FUNCTION_ANNOTATION.equals(cd.type())) {
                emitAnnotation(node).ifPresent(annotations::add);
            } else if (CD_TYPE_ANNOTATION_ATTACHMENT.equals(cd.type()) && isEnabledWithValue(node)) {
                annotations.add(emitWholeValueAnnotation(node));
            }
        }
        return annotations;
    }

    private static boolean isEnabledWithValue(TriggerUISchemaModel.Property node) {
        return node.enabled() && node.value() != null && !String.valueOf(node.value()).isBlank();
    }

    /** {@code @<module>:<name> <value>} — the node's own value is already the complete attachment body. */
    private static String emitWholeValueAnnotation(TriggerUISchemaModel.Property node) {
        TriggerUISchemaModel.Codedata cd = node.codedata();
        String module = qualifierModule(cd.moduleName());
        String name = cd.originalName();
        String prefix = module == null || module.isBlank() ? "@" + name : "@" + module + ":" + name;
        return prefix + " " + node.value();
    }

    /** A module's natural import prefix (last dot-segment, e.g. {@code aws.sqs} -> {@code sqs}). */
    private static String qualifierModule(String moduleName) {
        return moduleName == null || moduleName.isBlank() ? null : ModuleAliasResolver.selfPrefix(moduleName);
    }

    /** The rendered annotation attachment, or empty when {@link #annotationBody} has nothing to emit. */
    private static Optional<String> emitAnnotation(TriggerUISchemaModel.Property node) {
        Optional<String> body = annotationBody(node);
        if (body.isEmpty()) {
            return Optional.empty();
        }
        TriggerUISchemaModel.Codedata cd = node.codedata();
        String module = qualifierModule(cd.moduleName());
        String name = cd.originalName();
        String prefix = module == null || module.isBlank() ? "@" + name : "@" + module + ":" + name;
        return Optional.of(prefix + " " + body.get());
    }

    /**
     * The mapping-constructor body ({@code {field: value, ...}}) of a COMPLEX_FUNCTION_ANNOTATION
     * node, or empty when no field is emitted (all optional fields unchecked).
     */
    public static Optional<String> annotationBody(TriggerUISchemaModel.Property node) {
        String body = mappingBody(node.properties());
        return "{}".equals(body) ? Optional.empty() : Optional.of(body);
    }

    /** {@code {field: value, ...}} from the MAPPING_FIELD children of a container. */
    private static String mappingBody(Map<String, TriggerUISchemaModel.Property> properties) {
        List<String> fields = new ArrayList<>();
        if (properties != null) {
            for (TriggerUISchemaModel.Property child : properties.values()) {
                String field = emitMappingField(child);
                if (field != null) {
                    fields.add(field);
                }
            }
        }
        return "{" + String.join(", ", fields) + "}";
    }

    /** {@code <field>: <value>}, or {@code null} when an optional field's flag is unchecked. */
    private static String emitMappingField(TriggerUISchemaModel.Property node) {
        TriggerUISchemaModel.Codedata cd = node.codedata();
        if (cd == null || cd.field() == null) {
            return null;
        }
        if (Boolean.TRUE.equals(cd.optional()) && !isIncluded(node)) {
            return null;
        }
        return cd.field() + ": " + fieldValue(node);
    }

    /**
     * Whether an optional mapping field is included: for a flag-gated container, {@code value:true};
     * for a plain leaf, its {@code enabled} state plus a non-empty value.
     */
    private static boolean isIncluded(TriggerUISchemaModel.Property node) {
        if (isLeaf(node)) {
            String raw = node.value() == null ? "" : String.valueOf(node.value());
            return node.enabled() && !raw.isBlank() && !"\"\"".equals(raw);
        }
        return PayloadComposer.isTrue(node.value());
    }

    /** A mapping field is a leaf when it renders its own value — it has no nested value node. */
    private static boolean isLeaf(TriggerUISchemaModel.Property node) {
        return node.properties() == null || node.properties().isEmpty();
    }

    /** The value side of a mapping field: a rendered leaf, or a nested value node. */
    private static String fieldValue(TriggerUISchemaModel.Property node) {
        if (isLeaf(node)) {
            return renderLeaf(node);
        }
        // Nested value: the first child value node (e.g. a FIELD_VALUE_CHOICE).
        return emitValue(node.properties().values().iterator().next());
    }

    /** Renders a value node by its {@code codedata.type}. */
    private static String emitValue(TriggerUISchemaModel.Property node) {
        TriggerUISchemaModel.Codedata cd = node.codedata();
        String type = cd == null ? null : cd.type();
        if (type == null) {
            return renderLeaf(node);
        }
        return switch (type) {
            case CD_TYPE_MAPPING_CONSTRUCTOR -> mappingBody(node.properties());
            case CD_TYPE_ENUM_LITERAL -> enumLiteral(cd);
            case CD_TYPE_FIELD_VALUE_CHOICE -> {
                TriggerUISchemaModel.Property selected = selectedChoice(node);
                yield selected == null ? "" : emitValue(selected);
            }
            default -> renderLeaf(node);
        };
    }

    private static String enumLiteral(TriggerUISchemaModel.Codedata cd) {
        String value = cd.value() == null ? "" : cd.value();
        return cd.valueQualifier() == null || cd.valueQualifier().isBlank()
                ? value : cd.valueQualifier() + ":" + value;
    }

    private static TriggerUISchemaModel.Property selectedChoice(TriggerUISchemaModel.Property choiceNode) {
        if (choiceNode.choices() == null) {
            return null;
        }
        for (TriggerUISchemaModel.Property choice : choiceNode.choices()) {
            if (choice.enabled()) {
                return choice;
            }
        }
        return choiceNode.choices().isEmpty() ? null : choiceNode.choices().getFirst();
    }

    /**
     * Renders a leaf value by its declared type: a {@code string}-typed leaf emits a quoted literal
     * (idempotently — a value normalized upstream, e.g. a {@code string `x`} template collapsed to
     * {@code "x"} by the wire model, must not be double-quoted); everything else renders raw.
     */
    private static String renderLeaf(TriggerUISchemaModel.Property node) {
        String raw = node.value() == null ? "" : String.valueOf(node.value());
        if (!isStringTyped(node)) {
            return raw;
        }
        return raw.length() >= 2 && raw.startsWith("\"") && raw.endsWith("\"") ? raw : "\"" + raw + "\"";
    }

    /** Whether the node's selected (or sole) declared type is a plain {@code string}. */
    private static boolean isStringTyped(TriggerUISchemaModel.Property node) {
        if (node.types() == null || node.types().isEmpty()) {
            return false;
        }
        TriggerUISchemaModel.PropertyType selected = node.types().stream()
                .filter(type -> Boolean.TRUE.equals(type.selected()))
                .findFirst()
                .orElse(node.types().getFirst());
        return STRING_TYPE.equals(selected.ballerinaType());
    }
}
