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

import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.servicemodelgenerator.extension.util.DatabindUtil;
import org.eclipse.lsp4j.TextEdit;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD;

/**
 * Included-record payload binding for schema-driven trigger handlers (the {@code
 * PAYLOAD_TYPE_INCLUDED_RECORD} marker on a payload parameter's {@code codedata}). Unlike a plain
 * {@code PAYLOAD_TYPE}, this form wraps the user's schema in a generated record that includes the
 * connector's base record — e.g. binding {@code json} to kafka's {@code onConsumerRecord} generates:
 *
 * <pre>
 * type KafkaAnydataConsumer1 record {|
 *     *kafka:AnydataConsumerRecord;
 *     json value;
 * |};
 * </pre>
 *
 * The UI only ever sees the payload type ({@code json}); the save flows swap in the generated
 * wrapper, and the read flow resolves the wrapper's payload field back out.
 *
 * @since 1.9.0
 */
public final class IncludedRecordBinder {

    /** Builtin element types a direct (non-wrapper) binding can use — never wrapper type names. */
    private static final Set<String> BUILTIN_TYPES = Set.of(
            "int", "string", "boolean", "float", "decimal", "byte", "json", "xml",
            "anydata", "any", "error", "readonly");

    private IncludedRecordBinder() {
    }

    /**
     * Applies the binding for an add-handler save: generates a fresh uniquely-named wrapper type in
     * {@code types.bal} and rewrites the parameter's emitted type to the wrapped form.
     */
    public static Map<String, List<TextEdit>> forAdd(AddModelContext context) {
        Parameter param = includedRecordParam(context.function());
        if (param == null) {
            return Map.of();
        }
        Codedata codedata = param.getType().getCodedata();
        String boundType = codedata.getBoundType();
        String fieldName = codedata.getField();
        if (isBlank(boundType) || isBlank(fieldName)) {
            return Map.of();
        }
        String typeName = DatabindUtil.generateNewDataBindTypeName(context.filePath(), context.workspaceManager(),
                context.semanticModel(), null, typeIdentifierOf(codedata));
        Map<String, List<TextEdit>> edits = DatabindUtil.createTypeDefinitionEdits(context.project(), typeName,
                codedata.getDefaultType(), boundType, fieldName, context.filePath(), context.workspaceManager(),
                param.getType().getImports());
        if (!edits.isEmpty()) {
            applyWrappedType(param, codedata, typeName);
        }
        return edits;
    }

    /**
     * Applies the binding for an edit-handler save: rewrites the wrapper the source parameter already
     * uses (or generates one on first bind), and drops it when the binding is removed and nothing
     * else references it.
     */
    public static Map<String, List<TextEdit>> forUpdate(UpdateModelContext context) {
        Parameter param = includedRecordParam(context.function());
        if (param == null) {
            return Map.of();
        }
        Codedata codedata = param.getType().getCodedata();
        String fieldName = codedata.getField();
        String baseType = codedata.getDefaultType();
        if (isBlank(fieldName)) {
            return Map.of();
        }
        String boundType = codedata.getBoundType();
        if (isBlank(boundType)) {
            String defaultComposed = PayloadComposer.applyTemplate(codedata.getTemplate(), baseType);
            String currentValue = param.getType().getValue();
            if (currentValue != null && !currentValue.trim().equals(defaultComposed)) {
                // A non-default type in play (e.g. hand-written int[]) is a custom direct binding.
                return Map.of();
            }
            param.getType().setValue(defaultComposed);
            return DatabindUtil.handleDataBindingDeletion(context, context.function(), param, baseType);
        }
        String existingTypeName = existingWrapperTypeName(context, param, baseType);
        if (!isBlank(existingTypeName)) {
            applyWrappedType(param, codedata, existingTypeName);
            return DatabindUtil.updateTypeDefinitionEdits(context, existingTypeName, baseType, boundType,
                    fieldName, null, param.getType().getImports());
        }
        String typeName = DatabindUtil.generateNewDataBindTypeName(context.filePath(), context.workspaceManager(),
                context.semanticModel(), context.functionNode(), typeIdentifierOf(codedata));
        Map<String, List<TextEdit>> edits = DatabindUtil.createTypeDefinitionEdits(context.project(), typeName,
                baseType, boundType, fieldName, context.filePath(), context.workspaceManager(),
                param.getType().getImports());
        if (!edits.isEmpty()) {
            applyWrappedType(param, codedata, typeName);
        }
        return edits;
    }

    /**
     * Read-side overlay: for each source handler whose payload parameter is a generated wrapper
     * (e.g. {@code KafkaAnydataConsumer1[]}), resolves the wrapper's payload field type and presents
     * <i>that</i> as the bound type — so the UI shows {@code json}, never the wrapper.
     */
    public static void overlayFromSource(Service serviceModel, ModelFromSourceContext context) {
        if (serviceModel.getFunctions() == null || context.semanticModel() == null
                || !(context.node() instanceof ServiceDeclarationNode serviceNode)) {
            return;
        }
        for (Function function : serviceModel.getFunctions()) {
            Parameter param = includedRecordParam(function);
            if (param == null || !function.isEnabled()) {
                continue;
            }
            Codedata codedata = param.getType().getCodedata();
            String fieldName = codedata.getField();
            if (isBlank(fieldName) || function.getName() == null) {
                continue;
            }
            DatabindUtil.FunctionMatch match = DatabindUtil.findMatchingFunctions(serviceModel,
                    function.getName().getValue(), serviceNode);
            if (match == null || match.sourceFunctionNode() == null) {
                continue;
            }
            DatabindUtil.DataBindingTypeInfo info = DatabindUtil.extractDataBindingType(match.sourceFunctionNode(),
                    param.getName().getValue(), context.semanticModel(), fieldName);
            if (info == null || isBlank(info.typeName())) {
                // Not a recognizable binding shape (e.g. hand-written int[]): present it as unbound.
                codedata.setBoundType(null);
                continue;
            }
            codedata.setBoundType(info.typeName());
            param.getType().setValue(PayloadComposer.applyTemplate(codedata.getTemplate(), info.typeName()));
        }
    }

    /**
     * The wrapper type the source parameter currently uses, if any. The generic extraction is
     * syntax-first and can echo back a builtin element (e.g. {@code int} from a hand-written
     * {@code int[]}) — that is a direct binding, not a wrapper, so it is filtered out here.
     */
    private static String existingWrapperTypeName(UpdateModelContext context, Parameter param, String baseType) {
        if (context.functionNode() == null) {
            return null;
        }
        String typeName = DatabindUtil.extractExistingDatabindTypeName(context.functionNode(),
                param.getName().getValue(), context.semanticModel(), context.document(), baseType);
        return typeName == null || BUILTIN_TYPES.contains(typeName) ? null : typeName;
    }

    /** The function's included-record payload parameter, or null when it has none. */
    static Parameter includedRecordParam(Function function) {
        if (function == null || function.getParameters() == null) {
            return null;
        }
        for (Parameter parameter : function.getParameters()) {
            Codedata codedata = parameter.getType() == null ? null : parameter.getType().getCodedata();
            if (codedata != null && CD_TYPE_PAYLOAD_TYPE_INCLUDED_RECORD.equals(codedata.getType())) {
                return parameter;
            }
        }
        return null;
    }

    /** The base identifier for generated wrapper names, falling back to the base type's local name. */
    static String typeIdentifierOf(Codedata codedata) {
        if (!isBlank(codedata.getTypeIdentifier())) {
            return codedata.getTypeIdentifier();
        }
        String baseType = codedata.getDefaultType() == null ? "" : codedata.getDefaultType();
        int colon = baseType.indexOf(':');
        String localName = colon >= 0 ? baseType.substring(colon + 1) : baseType;
        return localName.isBlank() ? "PayloadRecord" : localName;
    }

    /** Wrapper-type templates are always normalized to {@code {{type}}} form by the time they reach
     *  here (see {@code TriggerFunctionAdapter#normalizeTemplate}), so {@link PayloadComposer}'s
     *  general-purpose template substitution applies unchanged. */
    private static void applyWrappedType(Parameter param, Codedata codedata, String typeName) {
        param.getType().setValue(PayloadComposer.applyTemplate(codedata.getTemplate(), typeName));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
