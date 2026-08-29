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

import io.ballerina.modelgenerator.commons.trigger.models.Repeatable;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.PayloadComposer;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DATA_BINDING;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FIELD_TYPE_VARIATION_SELECTOR;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_COMPLEX_REMOTE_FUNCTION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_COMPLEX_RESOURCE_FUNCTION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_VARIANT;

/**
 * Adapts a unified {@link TriggerUISchemaModel.FunctionModel} into the wire {@link Function} POJOs the
 * Integrator understands. A handler with a {@code VARIANT} parameter (e.g. FTP/SMB's file-format
 * handlers) fans out into one wire {@link Function} per variant.
 *
 * @since 1.9.0
 */
public final class TriggerFunctionAdapter {

    private TriggerFunctionAdapter() {
    }

    /** One wire {@link Function} per format variant when the handler carries a VARIANT parameter, else one. */
    public static List<Function> toFunctions(TriggerUISchemaModel.FunctionModel model) {
        TriggerUISchemaModel.Parameter variantParameter = findVariantParameter(model);
        if (variantParameter == null || variantParameter.type() == null
                || variantParameter.type().properties() == null
                || variantParameter.type().properties().isEmpty()) {
            return List.of(toFunction(model, null, null));
        }
        List<Function> functions = new ArrayList<>();
        for (Map.Entry<String, TriggerUISchemaModel.Property> variant
                : variantParameter.type().properties().entrySet()) {
            functions.add(toFunction(model, variantParameter, variant.getValue()));
        }
        return functions;
    }

    public static Function toFunction(TriggerUISchemaModel.FunctionModel model) {
        return toFunction(model, null, null);
    }

    private static Function toFunction(TriggerUISchemaModel.FunctionModel model,
                                       TriggerUISchemaModel.Parameter variantParameter,
                                       TriggerUISchemaModel.Property variant) {
        String label = label(model.metadata(), model.name());
        String description = description(model.metadata());
        String notice = model.metadata() == null ? null : model.metadata().notice();
        String badge = model.metadata() == null ? null : model.metadata().badge();
        String functionName = variant != null && variant.codedata() != null
                && notBlank(variant.codedata().originalName())
                        ? variant.codedata().originalName() : model.name();
        String variantLabel = variantLabel(model, variant);
        String nameLabel = model.nameMetadata() != null && notBlank(model.nameMetadata().label())
                ? model.nameMetadata().label() : (variantLabel != null ? variantLabel : label);
        String nameDescription = model.nameMetadata() != null && notBlank(model.nameMetadata().description())
                ? model.nameMetadata().description() : description;

        Function.FunctionBuilder builder = new Function.FunctionBuilder()
                .setMetadata(new MetaData(label, description, notice, null, badge))
                .kind(wireKind(model.kind()))
                .name(identifierValue(functionName, nameLabel, nameDescription,
                        Boolean.TRUE.equals(model.nameEditable())))
                .parameters(toParameters(model.parameters(), variantParameter, variant))
                .returnType(toReturnType(model.returnType()))
                .enabled(model.enabled())
                .optional(Boolean.TRUE.equals(model.optional()))
                .editable(model.editable() == null || model.editable())
                .canAddParameters(Boolean.TRUE.equals(model.canAddParameters()));

        // Do NOT copy `qualifiers` — the source emitter derives the keyword from `kind`.
        if (KIND_RESOURCE.equalsIgnoreCase(model.kind()) && model.accessor() != null) {
            builder.accessor(identifierValue(model.accessor(), model.accessor(), description));
        }
        if (model.documentationSchema() != null) {
            builder.documentation(PropertyValueAdapter.toValue(model.documentationSchema()));
        }
        Function function = builder.build();
        function.setGroup(notBlank(model.group()) ? model.group() : model.name());
        function.setVariantLabel(variantLabel);
        function.setAddLabel(model.metadata() == null ? null : model.metadata().addLabel());
        function.setAddDescription(model.metadata() == null ? null : model.metadata().addDescription());
        function.setRepeatable(Repeatable.orDefault(model.repeatable()).effective(function.getGroup()));
        function.setNameEditable(model.nameEditable());
        function.setProperties(toWireProperties(model, variant));
        function.setSchema(toParameterSchema(model.parameterSchema()));
        return function;
    }

    /** Converts the {@code canAddParameters} templates into the wire {@code Function.schema} map. */
    private static Map<String, Parameter> toParameterSchema(
            Map<String, TriggerUISchemaModel.Parameter> parameterSchema) {
        if (parameterSchema == null || parameterSchema.isEmpty()) {
            return null;
        }
        Map<String, Parameter> schema = new LinkedHashMap<>();
        parameterSchema.forEach((key, template) -> schema.put(key, toParameterSchemaTemplate(template)));
        return schema;
    }

    private static Parameter toParameterSchemaTemplate(TriggerUISchemaModel.Parameter model) {
        if (model == null) {
            return null;
        }
        String label = label(model.metadata(), paramNameText(model));
        String description = description(model.metadata());
        return new Parameter.Builder()
                .metadata(new MetaData(label, description))
                .kind(model.kind())
                .type(PropertyValueAdapter.toValue(model.type()))
                .name(PropertyValueAdapter.toValue(model.name()))
                .defaultValue(PropertyValueAdapter.toValue(model.defaultValue()))
                .documentation(PropertyValueAdapter.toValue(model.documentation()))
                .headerName(PropertyValueAdapter.toValue(model.headerName()))
                .httpParamType(model.httpParamType())
                .optional(Boolean.TRUE.equals(model.optional()))
                .enabled(model.enabled() == null || model.enabled())
                .editable(model.editable() == null || model.editable())
                .build();
    }

    private static String wireKind(String kind) {
        if (kind == null) {
            return null;
        }
        return switch (kind.toUpperCase(java.util.Locale.US)) {
            case KIND_COMPLEX_REMOTE_FUNCTION -> KIND_REMOTE;
            case KIND_COMPLEX_RESOURCE_FUNCTION -> KIND_RESOURCE;
            default -> kind;
        };
    }

    /** The parameter whose selection fans the handler out into per-format variants, if any. */
    private static TriggerUISchemaModel.Parameter findVariantParameter(TriggerUISchemaModel.FunctionModel model) {
        if (model.parameters() == null) {
            return null;
        }
        for (TriggerUISchemaModel.Parameter parameter : model.parameters()) {
            if (KIND_VARIANT.equals(parameter.kind())
                    || FIELD_TYPE_VARIATION_SELECTOR.equals(PayloadComposer.selectedFieldType(parameter.type()))) {
                return parameter;
            }
        }
        return null;
    }

    private static String variantLabel(TriggerUISchemaModel.FunctionModel model,
                                        TriggerUISchemaModel.Property variant) {
        if (variant != null) {
            if (variant.codedata() != null && notBlank(variant.codedata().variantLabel())) {
                return variant.codedata().variantLabel();
            }
            if (variant.metadata() != null && notBlank(variant.metadata().label())) {
                return variant.metadata().label();
            }
        }
        return notBlank(model.variantLabel()) ? model.variantLabel() : null;
    }

    private static Map<String, Value> toWireProperties(TriggerUISchemaModel.FunctionModel model,
                                                       TriggerUISchemaModel.Property variant) {
        Map<String, Value> properties = new LinkedHashMap<>();
        if (model.properties() != null) {
            model.properties().forEach((key, property) ->
                    properties.put(key, PropertyValueAdapter.toValue(property)));
        }
        if (variant != null) {
            addCompositionSiblings(variant, properties);
        } else if (model.parameters() != null) {
            // Variant-less payload param (e.g. FTP's onFileCsv) surfaces its composition siblings
            // from the parameter's own type tree instead of a variant sub-form.
            for (TriggerUISchemaModel.Parameter parameter : model.parameters()) {
                if (PayloadComposer.payloadNode(parameter.type()) != null) {
                    addCompositionSiblings(parameter.type(), properties);
                }
            }
        }
        return properties;
    }

    private static void addCompositionSiblings(TriggerUISchemaModel.Property payloadTree,
                                               Map<String, Value> properties) {
        PayloadComposer.compositionSiblings(payloadTree).forEach((key, sibling) ->
                properties.put(key, PropertyValueAdapter.toValue(sibling)));
    }

    private static List<Parameter> toParameters(List<TriggerUISchemaModel.Parameter> parameters,
                                                TriggerUISchemaModel.Parameter variantParameter,
                                                TriggerUISchemaModel.Property variant) {
        List<Parameter> result = new ArrayList<>();
        if (parameters == null) {
            return result;
        }
        for (TriggerUISchemaModel.Parameter parameter : parameters) {
            if (parameter == variantParameter && variant != null) {
                result.add(toPayloadParameter(parameter, variant));
            } else if (PayloadComposer.payloadNode(parameter.type()) != null) {
                // Variant-less payload param (e.g. kafka's consumer records).
                result.add(toPayloadParameter(parameter, parameter.type()));
            } else {
                result.add(toParameter(parameter));
            }
        }
        return result;
    }

    private static Parameter toPayloadParameter(TriggerUISchemaModel.Parameter model,
                                                 TriggerUISchemaModel.Property payloadTree) {
        TriggerUISchemaModel.Property payload = PayloadComposer.payloadNode(payloadTree);
        TriggerUISchemaModel.Codedata payloadCodedata = payload == null ? null : payload.codedata();

        String label = payload != null && payload.metadata() != null && notBlank(payload.metadata().label())
                ? payload.metadata().label() : label(model.metadata(), paramNameText(model));
        String description = payload != null && payload.metadata() != null
                && notBlank(payload.metadata().description())
                        ? payload.metadata().description() : description(model.metadata());

        String composedType = PayloadComposer.effectiveType(payloadTree);
        String defaultType = PayloadComposer.defaultComposedType(payloadTree);
        boolean bindable = payloadCodedata != null && Boolean.TRUE.equals(payloadCodedata.bindable());

        // PAYLOAD_TYPE_INCLUDED_RECORD tells the save flow to generate a wrapper record in types.bal
        // instead of binding the type directly.
        Codedata typeCodedata = new Codedata(payloadCodedata != null && notBlank(payloadCodedata.type())
                ? payloadCodedata.type() : CD_TYPE_PAYLOAD_TYPE);
        typeCodedata.setBindable(bindable);
        typeCodedata.setTemplate(normalizeTemplate(PayloadComposer.payloadTemplate(payloadTree)));
        if (payloadCodedata != null) {
            typeCodedata.setDefaultType(payloadCodedata.defaultType());
            typeCodedata.setBoundType(payloadCodedata.boundType());
            typeCodedata.setField(includedRecordHint(payloadCodedata, payloadCodedata.field(), "field"));
            typeCodedata.setTypeIdentifier(
                    includedRecordHint(payloadCodedata, null, "typeIdentifier", "typeIndentidier"));
            typeCodedata.setNameEditable(payloadCodedata.nameEditable());
        }

        Value.ValueBuilder typeBuilder = new Value.ValueBuilder()
                .setMetadata(new MetaData(label, description))
                .value(composedType)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(defaultType)
                .editable(bindable && payload != null && payload.editable())
                .enabled(true)
                .setCodedata(typeCodedata);
        // The wrapper record's included type (e.g. `*jms:Message`) may live in a module whose default
        // prefix differs from the module name itself (e.g. solace.jms's default prefix is "jms") — the
        // import must ride along explicitly, keyed by that prefix, rather than being derived from it by
        // assuming org "ballerinax" and module == prefix (see DatabindUtil#extractRequiredImports).
        String includedTypePrefix = includedTypePrefix(payloadCodedata);
        if (includedTypePrefix != null && payloadCodedata != null && notBlank(payloadCodedata.moduleName())
                && notBlank(payloadCodedata.orgName())) {
            typeBuilder.addImport(includedTypePrefix,
                    payloadCodedata.orgName() + "/" + payloadCodedata.moduleName());
        }
        Value type = typeBuilder.build();

        Value name = identifierValue(paramNameText(model), label, description);
        Parameter.Builder builder = new Parameter.Builder()
                .metadata(new MetaData(label, description))
                .kind(bindable ? DATA_BINDING : KIND_REQUIRED)
                .type(type)
                .name(name)
                .optional(false)
                .enabled(true)
                .editable(model.editable() == null || model.editable());
        String bindingGroup = model.codedata() == null ? null : model.codedata().bindingGroup();
        if (notBlank(bindingGroup)) {
            builder.bindingGroup(bindingGroup);
        }
        return builder.build();
    }

    /** The module prefix a payload's {@code defaultType} is qualified with (e.g. {@code "jms"} from
     *  {@code "jms:Message"}), or null when unqualified/absent. */
    private static String includedTypePrefix(TriggerUISchemaModel.Codedata payloadCodedata) {
        if (payloadCodedata == null || !notBlank(payloadCodedata.defaultType())) {
            return null;
        }
        String defaultType = payloadCodedata.defaultType();
        int colon = defaultType.indexOf(':');
        return colon > 0 ? defaultType.substring(0, colon) : null;
    }

    /** Checks the payload {@code codedata}, then its {@code modifiers} map, under each given key. */
    private static String includedRecordHint(TriggerUISchemaModel.Codedata payloadCodedata, String direct,
                                              String... keys) {
        if (notBlank(direct)) {
            return direct;
        }
        if (payloadCodedata.modifiers() instanceof Map<?, ?> modifiers) {
            for (String key : keys) {
                Object value = modifiers.get(key);
                if (value != null && notBlank(String.valueOf(value))) {
                    return String.valueOf(value);
                }
            }
        }
        return null;
    }

    /** Kafka's included-record form declares its wrap as a standalone {@code T} (e.g. {@code T[]}). */
    private static String normalizeTemplate(String template) {
        if (template == null || template.isBlank() || template.contains("{{type}}")) {
            return template;
        }
        return template.replaceAll("\\bT\\b", "{{type}}");
    }

    private static Parameter toParameter(TriggerUISchemaModel.Parameter model) {
        String label = label(model.metadata(), paramNameText(model));
        String description = description(model.metadata());

        Value name = identifierValue(paramNameText(model), label, description);

        String typeText = paramTypeText(model);
        Value.ValueBuilder typeBuilder = new Value.ValueBuilder()
                .setMetadata(new MetaData("Parameter Type", "The type of the parameter"))
                .value(typeText)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(typeText)
                .editable(false)
                .enabled(true)
                .optional(true);
        // A fixed type from another module (e.g. MCP's `http:Request`) needs its import riding along
        // so the generic emitter adds it whenever this parameter is enabled.
        TriggerUISchemaModel.Codedata typeCodedata = model.type() == null ? null : model.type().codedata();
        if (typeCodedata != null && notBlank(typeCodedata.moduleName()) && notBlank(typeCodedata.orgName())) {
            typeBuilder.addImport(typeCodedata.moduleName(),
                    typeCodedata.orgName() + "/" + typeCodedata.moduleName());
        }
        Value type = typeBuilder.build();

        return new Parameter.Builder()
                .metadata(new MetaData(label, description))
                .kind(model.kind())
                .type(type)
                .name(name)
                .optional(Boolean.TRUE.equals(model.optional()))
                .enabled(model.enabled() == null || model.enabled())
                .editable(model.editable() == null || model.editable())
                .advanced(Boolean.TRUE.equals(model.advanced()))
                .build();
    }

    private static FunctionReturnType toReturnType(TriggerUISchemaModel.ReturnType model) {
        if (model == null) {
            return null;
        }
        String rendered = renderReturnType(model);
        Value returnValue = new Value.ValueBuilder()
                .setMetadata(new MetaData("Return Type", "The return type of the function."))
                .value(rendered)
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(rendered)
                .editable(Boolean.TRUE.equals(model.typeEditable()))
                .enabled(model.enabled())
                .optional(Boolean.TRUE.equals(model.optional()))
                .build();
        FunctionReturnType returnType = new FunctionReturnType(returnValue);
        returnType.setHasError(Boolean.TRUE.equals(model.hasError()));
        return returnType;
    }

    private static String renderReturnType(TriggerUISchemaModel.ReturnType model) {
        String type = model.type() == null ? "" : model.type();
        if (Boolean.TRUE.equals(model.hasError()) && !type.contains("error")) {
            type = type.isEmpty() ? "error" : type + "|error";
        }
        if (Boolean.TRUE.equals(model.optional()) && !type.endsWith("?")) {
            type = type + "?";
        }
        return type;
    }

    private static String paramTypeText(TriggerUISchemaModel.Parameter parameter) {
        return PayloadComposer.effectiveType(parameter.type());
    }

    private static String paramNameText(TriggerUISchemaModel.Parameter parameter) {
        if (parameter.name() == null || parameter.name().value() == null) {
            return "";
        }
        return String.valueOf(parameter.name().value());
    }

    private static Value identifierValue(String value, String label, String description) {
        return identifierValue(value, label, description, false);
    }

    /** {@code editable} marks the function-name identifier user-renamable (see {@code nameEditable}). */
    private static Value identifierValue(String value, String label, String description, boolean editable) {
        return new Value.ValueBuilder()
                .metadata(label, description)
                .value(value)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .setPlaceholder(value)
                .enabled(true)
                .editable(editable)
                .build();
    }

    private static String label(TriggerUISchemaModel.Metadata metadata, String fallback) {
        if (metadata != null && notBlank(metadata.label())) {
            return metadata.label();
        }
        return fallback;
    }

    private static String description(TriggerUISchemaModel.Metadata metadata) {
        return metadata == null || metadata.description() == null ? "" : metadata.description();
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }
}
