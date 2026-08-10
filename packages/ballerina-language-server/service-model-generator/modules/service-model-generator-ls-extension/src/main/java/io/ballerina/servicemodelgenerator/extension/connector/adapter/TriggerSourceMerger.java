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

package io.ballerina.servicemodelgenerator.extension.connector.adapter;

import com.google.gson.Gson;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.modelgenerator.commons.trigger.models.Repeatable;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ANNOTATION_ATTACHMENT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_COMPLEX_FUNCTION_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ENUM_LITERAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_FIELD_VALUE_CHOICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_MAPPING_CONSTRUCTOR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_MODIFIER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD;

/**
 * Folds the functions parsed from the user's source into a schema-driven trigger template
 * ({@link TriggerServiceAdapter#toServiceTemplate}), producing the wire {@link Service}'s
 * {@code functions} (present handlers, enriched from source) and {@code schemaFunctions} (the
 * still-addable catalog). Source functions matching no schema variant are kept as-is, read-only.
 *
 * @since 1.9.0
 */
public final class TriggerSourceMerger {

    private static final String TYPE_PLACEHOLDER = "{{type}}";

    private static final Gson GSON = new Gson();

    private TriggerSourceMerger() {
    }

    public static void mergeSource(Service serviceModel, List<Function> functionsInSource) {
        List<Function> catalog = new ArrayList<>();
        if (serviceModel.getFunctions() != null) {
            catalog.addAll(serviceModel.getFunctions());
        }
        if (serviceModel.getSchemaFunctions() != null) {
            catalog.addAll(serviceModel.getSchemaFunctions());
        }

        List<Function> merged = new ArrayList<>();
        // ONE_OF_GROUP: once one sibling is present, every other sibling leaves the catalog too (e.g.
        // RabbitMQ's onMessage/onRequest, mutually exclusive). ONE_EACH_PER_GROUP siblings stay addable.
        Set<String> consumedExclusiveGroups = new HashSet<>();
        boolean legacyHandlerConsumed = false;
        for (Function source : functionsInSource == null ? List.<Function>of() : functionsInSource) {
            TemplateMatch match = findTemplate(catalog, source);
            if (match == null) {
                // A hand-written member the schema does not know: keep it, read-only.
                source.setEditable(false);
                source.setOptional(true);
                merged.add(source);
                continue;
            }
            Function template = match.template();
            // A name-editable handler can be re-added under another name, so its template stays in the
            // catalog and the source function enriches a copy instead.
            Function enriched = Boolean.TRUE.equals(template.getNameEditable()) ? copyOf(template) : template;
            if (enriched == template) {
                Repeatable repeatable = match.effective();
                if (!repeatable.staysAddable()) {
                    catalog.remove(template);
                }
                if (repeatable.isGroupExclusive()) {
                    consumedExclusiveGroups.add(template.getGroup());
                }
                if (repeatable.isLegacy()) {
                    legacyHandlerConsumed = true;
                }
            }
            enrich(enriched, source);
            merged.add(enriched);
        }

        if (!consumedExclusiveGroups.isEmpty()) {
            catalog.removeIf(fn -> fn.getGroup() != null && consumedExclusiveGroups.contains(fn.getGroup()));
        }
        // A present LEGACY handler displaces the whole "modern" catalog (mutually incompatible ways of
        // handling the same surface); if none is present, LEGACY handlers stay hidden from the addable
        // catalog entirely — they only exist to recognise pre-existing source.
        if (legacyHandlerConsumed) {
            catalog.removeIf(fn -> !Repeatable.orDefault(fn.getRepeatable()).isLegacy());
        } else {
            catalog.removeIf(fn -> Repeatable.orDefault(fn.getRepeatable()).isLegacy());
        }

        for (Function remaining : catalog) {
            remaining.setEnabled(false);
        }
        serviceModel.setFunctions(merged);
        serviceModel.setSchemaFunctions(catalog);
    }

    /**
     * A matched template paired with its already-computed effective {@link Repeatable}, so the caller
     * never re-derives it for the same template.
     *
     * @param template  the matched catalog template
     * @param effective the template's {@code Repeatable}, already resolved against its group
     */
    private record TemplateMatch(Function template, Repeatable effective) {
    }

    /**
     * Matches by emitted name (and accessor for resources) first; a name-editable, repeat-always
     * template (e.g. MCP's {@code Tool}) has no fixed name once renamed, so falls back to matching
     * any same-kind/accessor source function not already claimed.
     */
    private static TemplateMatch findTemplate(List<Function> templates, Function source) {
        String sourceName = valueOf(source.getName());
        if (sourceName == null) {
            return null;
        }
        String sourceAccessor = valueOf(source.getAccessor());
        for (Function template : templates) {
            if (!sourceName.equals(valueOf(template.getName()))) {
                continue;
            }
            String templateAccessor = valueOf(template.getAccessor());
            if (sourceAccessor == null || templateAccessor == null
                    || sourceAccessor.equals(templateAccessor)) {
                return new TemplateMatch(template,
                        Repeatable.orDefault(template.getRepeatable()).effective(template.getGroup()));
            }
        }
        for (Function template : templates) {
            if (!Boolean.TRUE.equals(template.getNameEditable())) {
                continue;
            }
            Repeatable effective = Repeatable.orDefault(template.getRepeatable()).effective(template.getGroup());
            if (!effective.staysAddable()) {
                continue;
            }
            if (!Objects.equals(source.getKind(), template.getKind())) {
                continue;
            }
            String templateAccessor = valueOf(template.getAccessor());
            if (sourceAccessor == null || templateAccessor == null
                    || sourceAccessor.equals(templateAccessor)) {
                return new TemplateMatch(template, effective);
            }
        }
        return null;
    }

    private static Function copyOf(Function template) {
        return GSON.fromJson(GSON.toJson(template), Function.class);
    }

    private static void enrich(Function template, Function source) {
        template.setEnabled(true);
        template.setEditable(true);
        // `optional` must NOT be forced here: it's authored per-handler on the schema (e.g. compiler-
        // mandated handlers are optional=false) and forcing it would disable deletion incorrectly.
        if (template.getCodedata() == null) {
            template.setCodedata(source.getCodedata());
        } else if (source.getCodedata() != null) {
            template.getCodedata().setLineRange(source.getCodedata().getLineRange());
        }
        if (template.getName() != null && source.getName() != null) {
            template.getName().setValue(source.getName().getValue());
        }
        if (template.getReturnType() != null && source.getReturnType() != null
                && source.getReturnType().getValue() != null && !source.getReturnType().getValue().isBlank()) {
            template.getReturnType().setValue(source.getReturnType().getValue());
            template.getReturnType().setEnabled(true);
        }
        reconcileParameters(template, source);
        applyAnnotationsFromSource(template, source);
    }

    /**
     * Framework parameters (fixed types) match by type text; payload parameters claim remaining
     * source parameters positionally. Unknown extras are read-only unless {@code canAddParameters}.
     */
    private static void reconcileParameters(Function template, Function source) {
        List<Parameter> sourceParams = source.getParameters() == null
                ? new ArrayList<>() : new ArrayList<>(source.getParameters());
        List<Parameter> payloadTemplates = new ArrayList<>();
        for (Parameter templateParam : template.getParameters() == null
                ? List.<Parameter>of() : template.getParameters()) {
            if (isPayloadParameter(templateParam)) {
                payloadTemplates.add(templateParam);
                continue;
            }
            Parameter match = claimByType(sourceParams, typeOf(templateParam));
            if (match == null) {
                templateParam.setEnabled(false);
                continue;
            }
            templateParam.setEnabled(true);
            if (templateParam.getName() != null && match.getName() != null) {
                templateParam.getName().setValue(match.getName().getValue());
            }
        }
        for (Parameter payloadTemplate : payloadTemplates) {
            if (sourceParams.isEmpty()) {
                payloadTemplate.setEnabled(false);
            } else {
                applyPayloadSource(template, payloadTemplate, sourceParams.remove(0));
            }
        }
        boolean userAddable = template.isCanAddParameters();
        for (Parameter extra : sourceParams) {
            extra.setEnabled(true);
            extra.setEditable(userAddable);
            template.getParameters().add(extra);
        }
    }

    private static boolean isPayloadParameter(Parameter parameter) {
        if (parameter.getType() == null || parameter.getType().getCodedata() == null) {
            return false;
        }
        String codedataType = parameter.getType().getCodedata().getType();
        return CD_TYPE_PAYLOAD_TYPE.equals(codedataType) || CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD.equals(codedataType);
    }

    private static Parameter claimByType(List<Parameter> sourceParams, String typeText) {
        if (typeText == null) {
            return null;
        }
        for (int i = 0; i < sourceParams.size(); i++) {
            if (typesMatch(typeText, typeOf(sourceParams.get(i)))) {
                return sourceParams.remove(i);
            }
        }
        return null;
    }

    /** Matches exactly, or up to a {@code & readonly} intersection on either side. */
    private static boolean typesMatch(String templateType, String actualType) {
        if (templateType == null || actualType == null) {
            return false;
        }
        return templateType.equals(actualType) || stripReadonly(templateType).equals(stripReadonly(actualType));
    }

    private static String stripReadonly(String type) {
        String normalized = type.trim();
        String suffix = "& readonly";
        return normalized.endsWith(suffix)
                ? normalized.substring(0, normalized.length() - suffix.length()).trim()
                : normalized;
    }

    /** Reverse-composes the payload parameter from its actual source type, undoing the add flow's composition. */
    private static void applyPayloadSource(Function template, Parameter payloadParam, Parameter sourceParam) {
        String actualType = typeOf(sourceParam);
        Codedata typeCodedata = payloadParam.getType() == null ? null : payloadParam.getType().getCodedata();

        String element = null;
        for (Value property : template.getProperties().values()) {
            Codedata propertyCodedata = property.getCodedata();
            if (propertyCodedata == null || !CD_TYPE_PAYLOAD_MODIFIER.equals(propertyCodedata.getType())
                    || propertyCodedata.getTemplate() == null) {
                continue;
            }
            String extracted = elementOf(propertyCodedata.getTemplate(), actualType);
            property.setValue(String.valueOf(extracted != null));
            if (extracted != null) {
                element = extracted;
            }
        }
        if (element == null && typeCodedata != null) {
            element = elementOf(typeCodedata.getTemplate(), actualType);
        }
        if (typeCodedata != null && element != null
                && !element.equals(normalizeWhitespace(typeCodedata.getDefaultType()))) {
            typeCodedata.setBoundType(element);
        }
        if (payloadParam.getType() != null && actualType != null) {
            payloadParam.getType().setValue(actualType);
        }
        if (payloadParam.getName() != null && sourceParam.getName() != null) {
            payloadParam.getName().setValue(sourceParam.getName().getValue());
        }
        payloadParam.setEnabled(true);
    }

    /** Whitespace-insensitive; returns {@code null} when the type was not produced by this template. */
    static String elementOf(String template, String actualType) {
        if (template == null || actualType == null || !template.contains(TYPE_PLACEHOLDER)) {
            return null;
        }
        String normalizedTemplate = normalizeWhitespace(template);
        String normalizedActual = normalizeWhitespace(actualType);
        int placeholder = normalizedTemplate.indexOf(TYPE_PLACEHOLDER);
        String prefix = normalizedTemplate.substring(0, placeholder);
        String suffix = normalizedTemplate.substring(placeholder + TYPE_PLACEHOLDER.length());
        if (normalizedActual.length() <= prefix.length() + suffix.length()
                || !normalizedActual.startsWith(prefix) || !normalizedActual.endsWith(suffix)) {
            return null;
        }
        return normalizedActual.substring(prefix.length(), normalizedActual.length() - suffix.length());
    }

    private static void applyAnnotationsFromSource(Function template, Function source) {
        for (Value tree : template.getProperties().values()) {
            Codedata treeCodedata = tree.getCodedata();
            if (treeCodedata == null || !CD_TYPE_COMPLEX_FUNCTION_ANNOTATION.equals(treeCodedata.getType())) {
                continue;
            }
            String body = sourceAnnotationBody(source, treeCodedata.getOriginalName());
            if (body == null || body.isBlank()) {
                continue;
            }
            if (NodeParser.parseExpression(body) instanceof MappingConstructorExpressionNode mapping) {
                applyMapping(tree, mapping);
            }
        }
    }

    /** The mapping body of the source's annotation attachment with the given name, if present. */
    private static String sourceAnnotationBody(Function source, String annotationName) {
        if (annotationName == null) {
            return null;
        }
        for (Value property : source.getProperties().values()) {
            Codedata codedata = property.getCodedata();
            if (codedata != null && CD_TYPE_ANNOTATION_ATTACHMENT.equals(codedata.getType())
                    && annotationName.equals(codedata.getOriginalName())) {
                return property.getValue();
            }
        }
        return null;
    }

    /** Applies a parsed mapping constructor onto the MAPPING_FIELD children of a container node. */
    private static void applyMapping(Value container, MappingConstructorExpressionNode mapping) {
        Map<String, ExpressionNode> fields = fieldsOf(mapping);
        if (container.getProperties() == null) {
            return;
        }
        for (Value child : container.getProperties().values()) {
            Codedata codedata = child.getCodedata();
            if (codedata == null || codedata.getField() == null) {
                continue;
            }
            ExpressionNode fieldValue = fields.get(codedata.getField());
            boolean isLeaf = child.getProperties() == null || child.getProperties().isEmpty();
            if (fieldValue == null) {
                // Absent in the source: an optional leaf gates on `enabled`, a flag-gated
                // container on `value` — the two include conventions the emitter understands.
                if (isLeaf) {
                    child.setEnabled(false);
                } else {
                    child.setValue("false");
                }
                continue;
            }
            child.setEnabled(true);
            if (isLeaf) {
                child.setValue(fieldValue.toSourceCode().trim());
            } else {
                child.setValue("true");
                applyFieldValue(child, fieldValue);
            }
        }
    }

    private static Map<String, ExpressionNode> fieldsOf(MappingConstructorExpressionNode mapping) {
        Map<String, ExpressionNode> fields = new LinkedHashMap<>();
        for (MappingFieldNode field : mapping.fields()) {
            if (field instanceof SpecificFieldNode specificField && specificField.valueExpr().isPresent()) {
                fields.put(specificField.fieldName().toSourceCode().trim(), specificField.valueExpr().get());
            }
        }
        return fields;
    }

    /** Applies a source field value onto a flag-gated field's nested value node (mirrors the emitter). */
    private static void applyFieldValue(Value fieldNode, ExpressionNode expression) {
        if (fieldNode.getProperties() == null || fieldNode.getProperties().isEmpty()) {
            return;
        }
        Value valueNode = fieldNode.getProperties().values().iterator().next();
        applyValueNode(valueNode, expression);
    }

    private static void applyValueNode(Value node, ExpressionNode expression) {
        Codedata codedata = node.getCodedata();
        String type = codedata == null ? null : codedata.getType();
        if (CD_TYPE_FIELD_VALUE_CHOICE.equals(type)) {
            applyChoice(node, expression);
            return;
        }
        if (CD_TYPE_MAPPING_CONSTRUCTOR.equals(type)
                && expression instanceof MappingConstructorExpressionNode mapping) {
            applyMapping(node, mapping);
            return;
        }
        // A childless value node is a leaf: the source expression text is its editable value.
        if (node.getProperties() == null || node.getProperties().isEmpty()) {
            node.setValue(expression.toSourceCode().trim());
        }
    }

    /** A mapping value matches the branch sharing the most field names; a scalar matches by value. */
    private static void applyChoice(Value choiceNode, ExpressionNode expression) {
        if (choiceNode.getChoices() == null || choiceNode.getChoices().isEmpty()) {
            return;
        }
        Value selected = null;
        if (expression instanceof MappingConstructorExpressionNode mapping) {
            Map<String, ExpressionNode> fields = fieldsOf(mapping);
            int bestScore = 0;
            for (Value branch : choiceNode.getChoices()) {
                int score = branchFieldOverlap(branch, fields);
                if (score > bestScore) {
                    bestScore = score;
                    selected = branch;
                }
            }
            if (selected != null) {
                applyMapping(selected, mapping);
            }
        } else {
            String text = expression.toSourceCode().trim();
            String unqualified = text.contains(":") ? text.substring(text.lastIndexOf(':') + 1) : text;
            for (Value branch : choiceNode.getChoices()) {
                Codedata branchCodedata = branch.getCodedata();
                String branchValue = branchCodedata != null && CD_TYPE_ENUM_LITERAL.equals(branchCodedata.getType())
                        && branchCodedata.getValue() != null ? branchCodedata.getValue() : branch.getValue();
                if (text.equals(branchValue) || unqualified.equals(branchValue)) {
                    selected = branch;
                    break;
                }
            }
        }
        if (selected == null) {
            return;
        }
        for (Value branch : choiceNode.getChoices()) {
            branch.setEnabled(branch == selected);
        }
        if (selected.getValue() != null && !selected.getValue().isBlank()) {
            choiceNode.setValue(selected.getValue());
        }
    }

    private static int branchFieldOverlap(Value branch, Map<String, ExpressionNode> fields) {
        if (branch.getProperties() == null) {
            return 0;
        }
        int score = 0;
        for (Value child : branch.getProperties().values()) {
            Codedata codedata = child.getCodedata();
            if (codedata != null && codedata.getField() != null && fields.containsKey(codedata.getField())) {
                score++;
            }
        }
        return score;
    }

    private static String valueOf(Value value) {
        return value == null ? null : value.getValue();
    }

    private static String typeOf(Parameter parameter) {
        if (parameter == null || parameter.getType() == null || parameter.getType().getValue() == null) {
            return null;
        }
        return parameter.getType().getValue().trim();
    }

    private static String normalizeWhitespace(String text) {
        return text == null ? null : text.replaceAll("\\s+", "");
    }
}
