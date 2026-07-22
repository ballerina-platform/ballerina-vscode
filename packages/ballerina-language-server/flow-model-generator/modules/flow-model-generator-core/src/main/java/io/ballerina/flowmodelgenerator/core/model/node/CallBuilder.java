/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.TypeParameterReplacer;
import io.ballerina.flowmodelgenerator.core.TypesManager;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyType;
import io.ballerina.flowmodelgenerator.core.model.RecordSelectorType;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.ProjectException;
import io.ballerina.tools.text.LinePosition;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.TypesManager.mergeWithTargetVarRecordSelectorType;

/**
 * Abstract base class for function-like builders (functions, methods, resource actions).
 *
 * @since 1.0.0
 */
public abstract class CallBuilder extends NodeBuilder {

    /**
     * Canonical form key/label for an inferred ({@code typedesc<T> = <>}) databinding-type parameter.
     * Used in place of the dependently-typed library parameter name (e.g. {@code T}/{@code t}) so the
     * databinding/result-type field is consistent across all activities, regardless of that name.
     */
    public static final String DATABINDING_TYPE_KEY = "databindingType";
    public static final String DATABINDING_TYPE_LABEL = "Databinding Type";

    protected abstract NodeKind getFunctionNodeKind();

    protected abstract FunctionData.Kind getFunctionResultKind();

    @Override
    public void setConcreteConstData() {
        codedata().node(getFunctionNodeKind());
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        Codedata codedata = context.codedata();

        ModuleInfo targetModuleInfo = new ModuleInfo(codedata.org(), codedata.packageName(), codedata.module(),
                codedata.version());
        FunctionDataBuilder functionDataBuilder = new FunctionDataBuilder()
                .name(codedata.symbol())
                .moduleInfo(targetModuleInfo)
                .lsClientLogger(context.lsClientLogger())
                .functionResultKind(getFunctionResultKind())
                .project(PackageUtil.loadProject(context.workspaceManager(), context.filePath()))
                .userModuleInfo(moduleInfo)
                .workspaceManager(context.workspaceManager())
                .filePath(context.filePath());

        NodeKind functionNodeKind = getFunctionNodeKind();
        if (functionNodeKind != NodeKind.FUNCTION_CALL && functionNodeKind != NodeKind.ACTIVITY_CALL) {
            functionDataBuilder.parentSymbolType(codedata.object());
        }
        FunctionData functionData = functionDataBuilder.build();

        // Store the module for PARAM_FOR_TYPE_INFER processing
        Module module = context.workspaceManager().module(context.filePath()).orElse(null);

        metadata()
                .label(functionData.name())
                .icon(CommonUtils.generateIcon(functionData.org(), functionData.packageName(),
                        functionData.version()))
                .description(functionData.description());
        codedata()
                .node(functionNodeKind)
                .org(codedata.org())
                .module(codedata.module())
                .packageName(codedata.packageName())
                .object(codedata.object())
                .version(codedata.version())
                .symbol(codedata.symbol())
                .lineRange(codedata.lineRange())
                .sourceCode(codedata.sourceCode())
                .inferredReturnType(functionData.inferredReturnType() ? functionData.returnType() : null);

        if (functionNodeKind != NodeKind.FUNCTION_CALL && functionNodeKind != NodeKind.AGENT &&
                functionNodeKind != NodeKind.CLASS_INIT && functionNodeKind != NodeKind.ACTIVITY_CALL &&
                functionNodeKind != NodeKind.AGENT_TYPE) {
            properties().custom()
                    .metadata()
                    .label(Property.CONNECTION_LABEL)
                    .description(Property.CONNECTION_DOC)
                    .stepOut()
                    .type(Property.ValueType.EXPRESSION, PackageUtil.isLocalFunction(context.workspaceManager(),
                            context.filePath(), codedata.org(), codedata.module()) ? codedata.object() :
                            CommonUtils.getClassType(codedata.module(), codedata.object()))
                    .value(codedata.parentSymbol())
                    .hidden()
                    .stepOut()
                    .addProperty(Property.CONNECTION_KEY);
        }
        setParameterProperties(functionData, module);

        if (CommonUtils.hasReturn(functionData.returnType())) {
            setReturnTypeProperties(functionData, context, Property.RESULT_NAME, Property.RESULT_DOC, false);
        }

        if (functionData.returnError()) {
            properties().checkError(true);
        }
    }

    /**
     * Builds a form property for a {@code PARAM_FOR_TYPE_INFER} parameter. When the parameter type is
     * a Ballerina record, the property is rendered as a {@code RECORD_FIELD_SELECTOR} in the UI, allowing
     * the user to pick individual fields. If a {@code targetVarType} is provided and is itself a record
     * (or array of records), the selector is pre-populated by merging the parameter's type model with the
     * target variable's type model so that already-selected fields are preserved. Non-record types fall back
     * to a plain {@code TYPE} property.
     *
     * @param nodeBuilder    the node builder to attach the property to
     * @param paramData      the parameter descriptor for the inferred type parameter
     * @param value          the current value string (may be {@code null})
     * @param module         the Ballerina {@link Module} used to create the {@link TypesManager} for type resolution
     * @param targetVarType  the type of the target variable being assigned to, used to pre-select fields
     *                       (may be {@code null} if no target variable is available)
     * @param callNode       the syntax tree node of the function call, used for error reporting in type resolution
     */
    public static void buildInferredTypeProperty(NodeBuilder nodeBuilder, ParameterData paramData, String value,
                                                 Module module, TypeSymbol targetVarType, Node callNode) {
        String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramData.name());
        String label = paramData.label();
        // If the inferredType is a record type, add it as the value of the property if the value is not provided
        if (value == null && paramData.typeSymbol() != null
                && CommonUtil.getRawType(paramData.typeSymbol()).typeKind().equals(TypeDescKind.RECORD)) {
            // The value is same as the default value for inferred type parameter
            value = paramData.defaultValue();
        }

        Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = nodeBuilder.properties().custom()
                .metadata()
                .label(label == null || label.isEmpty() ? unescapedParamName : label)
                .description(paramData.description())
                .stepOut()
                .codedata()
                .kind(paramData.kind().name())
                .originalName(paramData.name())
                .stepOut()
                .value(value)
                .placeholder(paramData.placeholder())
                .defaultValue(paramData.defaultValue())
                .imports(paramData.importStatements())
                .editable();

        // Check if this is a record type - if so, emit RECORD_FIELD_SELECTOR with type models
        if (paramData.typeSymbol() != null && module != null
                && CommonUtil.getRawType(paramData.typeSymbol()).typeKind().equals(TypeDescKind.RECORD)) {
            addRecordFieldSelector(paramData, module, targetVarType, customPropBuilder);
        } else {
            // For non-record types, use the existing TYPE behavior
            customPropBuilder.type(Property.ValueType.TYPE, paramData.type());
        }

        customPropBuilder.stepOut().addProperty(unescapedParamName, callNode);
    }

    private static void addRecordFieldSelector(ParameterData paramData, Module module, TypeSymbol targetVarType,
                                               Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder) {
        TypeSymbol rawType = CommonUtil.getRawType(paramData.typeSymbol());
        if (!rawType.typeKind().equals(TypeDescKind.RECORD) || module.documentIds().isEmpty()) {
            // If we can't resolve the raw type, fallback to TYPE without field selector or
            // If we can't access any documents in the module, we won't be able to resolve the type models, so
            // fallback to TYPE without field selector
            customPropBuilder.type(Property.ValueType.TYPE, paramData.type());
            return;
        }

        // For record types, we want to show the record selector in the UI, so we set the field type to
        // RECORD_FIELD_SELECTOR and provide the necessary type models for it.
        TypesManager typesManager = new TypesManager(module.document(module.documentIds().iterator().next()));
        RecordSelectorType recordSelectorType = typesManager.getRecordSelectorType(paramData.typeSymbol(),
                module, true);

        if (recordSelectorType != null && targetVarType != null) {
            TypeSymbol recordTargetVarType = targetVarType;
            if (CommonUtil.getRawType(targetVarType).typeKind().equals(TypeDescKind.ARRAY)) {
                recordTargetVarType = ((ArrayTypeSymbol) CommonUtil.getRawType(recordTargetVarType))
                        .memberTypeDescriptor();
            }
            if (CommonUtil.getRawType(recordTargetVarType).typeKind().equals(TypeDescKind.RECORD)) {
                RecordSelectorType targetVarRecordSelectorType = typesManager.getRecordSelectorType(
                        recordTargetVarType, module, false);
                if (targetVarRecordSelectorType != null) {
                    recordSelectorType = mergeWithTargetVarRecordSelectorType(targetVarRecordSelectorType,
                            recordSelectorType);
                }
            }
        }

        if (recordSelectorType != null && !recordSelectorType.rootType().members().isEmpty()) {
            customPropBuilder.type()
                    .fieldType(Property.ValueType.RECORD_FIELD_SELECTOR)
                    .ballerinaType(paramData.type())
                    .recordSelectorType(recordSelectorType)
                    .selected(true)
                    .stepOut();
        } else {
            // Fallback to TYPE if type models couldn't be resolved
            customPropBuilder.type(Property.ValueType.TYPE, paramData.type());
        }
    }

    /**
     * Builds an inferred-type property for a {@code PARAM_FOR_TYPE_INFER} parameter without a target variable
     * type constraint. Delegates to the full overload with {@code targetVarType = null}.
     *
     * <p>NOTE: This overload is kept for persist-client call sites where no target variable type is
     * available. See issue: https://github.com/wso2/product-ballerina-integrator/issues/2042
     *
     * @param nodeBuilder the node builder to attach the property to
     * @param paramData   the parameter descriptor for the inferred type parameter
     * @param value       the current value string (may be {@code null})
     * @param module      the Ballerina {@link Module} used for type resolution
     */
    public static void buildInferredTypeProperty(NodeBuilder nodeBuilder, ParameterData paramData, String value,
                                                 Module module) {
        buildInferredTypeProperty(nodeBuilder, paramData, value, module, null, null);
    }

    /**
     * Normalizes the inferred type-infer property on {@code nodeBuilder} to the canonical
     * {@link #DATABINDING_TYPE_KEY} key and {@link #DATABINDING_TYPE_LABEL} label, with its
     * {@code TYPE} entry selected. Locates the property by its {@code PARAM_FOR_TYPE_INFER} codedata
     * kind, so it works regardless of the dependently-typed library parameter name ({@code T}, {@code t},
     * ...). {@link #buildInferredTypeProperty} adds the property under the raw parameter name and leaves
     * its type unselected; an unselected type entry makes the UI render a spurious second type selector.
     * No-op when no type-infer property is present.
     *
     * @param nodeBuilder the builder whose inferred type-infer property should be normalized
     */
    public static void normalizeDatabindingTypeProperty(NodeBuilder nodeBuilder) {
        Map<String, Property> properties = nodeBuilder.properties().build();
        String paramKey = properties.entrySet().stream()
                .filter(entry -> entry.getValue().codedata() != null
                        && ParameterData.Kind.PARAM_FOR_TYPE_INFER.name()
                            .equals(entry.getValue().codedata().kind()))
                .map(Map.Entry::getKey)
                .findFirst()
                .orElse(null);
        if (paramKey == null) {
            return;
        }
        Property existing = properties.remove(paramKey);
        String ballerinaType = existing.types() != null && !existing.types().isEmpty()
                ? existing.types().get(0).ballerinaType()
                : "anydata";
        Property normalized = Property.Builder.copyFrom(existing)
                .clearTypes()
                .type().fieldType(Property.ValueType.TYPE).ballerinaType(ballerinaType).selected(true).stepOut()
                .metadata().label(DATABINDING_TYPE_LABEL).stepOut()
                .codedata().kind(ParameterData.Kind.PARAM_FOR_TYPE_INFER.name())
                    .originalName(DATABINDING_TYPE_KEY).stepOut()
                .build();
        properties.put(DATABINDING_TYPE_KEY, normalized);
    }

    protected void setParameterProperties(FunctionData function, io.ballerina.projects.Module module) {
        boolean hasOnlyRestParams = function.parameters().size() == 1;

        for (ParameterData paramResult : function.parameters().values()) {
            if (paramResult.kind() == ParameterData.Kind.PARAM_FOR_TYPE_INFER) {
                buildInferredTypeProperty(this, paramResult, null, module);
                continue;
            }

            if (paramResult.kind().equals(ParameterData.Kind.INCLUDED_RECORD)) {
                continue;
            }

            // Allow subclasses to handle a parameter specially (e.g. replace with CONNECTION type).
            // If the override returns true the parameter has been fully handled; skip default processing.
            if (processSpecialParameter(paramResult)) {
                continue;
            }

            properties().build().put(getParameterPropertyKey(paramResult),
                    buildParameterProperty(paramResult, module, hasOnlyRestParams));
        }
    }

    protected Property buildParameterProperty(ParameterData paramData, io.ballerina.projects.Module module,
                                              boolean hasOnlyRestParams) {
        String unescapedParamName = ParamUtils.removeLeadingSingleQuote(paramData.name());
        Property.Builder<FormBuilder<NodeBuilder>> customPropBuilder = new Property.Builder<>(null);
        String label = paramData.label();
        customPropBuilder
                .metadata()
                    .label(label == null || label.isEmpty() ? unescapedParamName : label)
                    .description(paramData.description())
                    .stepOut()
                .codedata()
                    .kind(paramData.kind().name())
                    .originalName(paramData.name())
                    .stepOut()
                .placeholder(paramData.placeholder())
                .defaultValue(paramData.defaultValue())
                .imports(paramData.importStatements())
                .editable()
                .defaultable(paramData.optional());

        switch (paramData.kind()) {
            case INCLUDED_RECORD_REST -> {
                if (hasOnlyRestParams) {
                    customPropBuilder.defaultable(false);
                }
                Property template = customPropBuilder.buildRepeatableTemplates(paramData.typeSymbol(),
                        semanticModel, moduleInfo);
                customPropBuilder.type()
                        .fieldType(Property.ValueType.REPEATABLE_MAP)
                        .ballerinaType(paramData.type())
                        .template(template)
                        .selected(true)
                        .stepOut();
            }
            case REST_PARAMETER -> {
                if (hasOnlyRestParams) {
                    customPropBuilder.defaultable(false);
                }
                Property template = customPropBuilder.buildRepeatableTemplates(paramData.typeSymbol(),
                        semanticModel, moduleInfo);
                customPropBuilder.type()
                        .fieldType(Property.ValueType.REPEATABLE_LIST)
                        .ballerinaType(paramData.type())
                        .template(template)
                        .selected(true)
                        .stepOut();
            }
            default -> {
                // Add PROMPT field type for ai:Prompt parameters
                // TODO: Need an extension pattern to extract the following implementation out of the CallBuilder
                String typeSignature = CommonUtils.getTypeSignature(paramData.typeSymbol(), moduleInfo);
                if (AiUtils.AI_PROMPT_TYPE.equals(typeSignature)) {
                    customPropBuilder.type()
                            .fieldType(Property.ValueType.PROMPT)
                            .ballerinaType(AiUtils.AI_PROMPT_TYPE)
                            .selected(true)
                            .stepOut();
                }
                customPropBuilder.typeWithExpression(paramData.typeSymbol(), moduleInfo,
                        paramData.defaultValue());
            }
        }

        return customPropBuilder.build();
    }

    protected String getParameterPropertyKey(ParameterData paramData) {
        if (paramData.kind() == ParameterData.Kind.INCLUDED_RECORD_REST) {
            return "additionalValues";
        }
        return FlowNodeUtil.getPropertyKey(ParamUtils.removeLeadingSingleQuote(paramData.name()));
    }

    /**
     * Hook for subclasses to intercept individual parameters during {@link #setParameterProperties}.
     * If this method returns {@code true} the parameter has been fully handled and will be skipped
     * in the default processing loop; returning {@code false} lets the default logic run.
     *
     * @param paramData the parameter to (optionally) process
     * @return {@code true} if the parameter was handled by this override
     */
    protected boolean processSpecialParameter(ParameterData paramData) {
        return false;
    }

    protected void setReturnTypeProperties(FunctionData functionData, TemplateContext context, String label, String doc,
                                           boolean hidden) {
        properties()
                .type(functionData.returnType(), false, functionData.importStatements(), hidden,
                        Property.RESULT_TYPE_LABEL)
                .data(functionData.returnType(), context.getAllVisibleSymbolNames(), label, doc, false);
    }

    protected void setExpressionProperty(Codedata codedata) {
        properties().custom()
                .metadata()
                    .label(Property.CONNECTION_LABEL)
                    .description(Property.CONNECTION_DOC)
                    .stepOut()
                .type(Property.ValueType.EXPRESSION, CommonUtils.getClassType(codedata.module(), codedata.object()))
                .value(codedata.parentSymbol())
                .hidden()
                .stepOut()
                .addProperty(Property.CONNECTION_KEY);
    }

    private static boolean isLangLibFunction(Codedata codedata) {
        return codedata != null
                && CommonUtil.BALLERINA_ORG_NAME.equals(codedata.org())
                && codedata.module() != null
                && codedata.module().startsWith("lang.");
    }

    protected static String resolveLangLibReturnType(WorkspaceManager workspaceManager, Path filePath,
                                                     FlowNode flowNode) {
        if (!isLangLibFunction(flowNode.codedata())) {
            return null;
        }

        Optional<Property> typeProperty = flowNode.getProperty(Property.TYPE_KEY);
        if (typeProperty.isEmpty()) {
            return null;
        }

        String typeName = typeProperty.get().value().toString();

        // Find the first (longest) placeholder present in the return type
        String matchedPlaceholder = null;
        for (String placeholder : TypeParameterReplacer.getSortedPlaceholderValues()) {
            if (typeName.contains(placeholder)) {
                matchedPlaceholder = placeholder;
                break;
            }
        }
        if (matchedPlaceholder == null) {
            return null;
        }

        // Find a REQUIRED parameter whose ballerinaType template matches the placeholder structure
        Map<String, Property> properties = flowNode.properties();
        if (properties == null) {
            return null;
        }

        final String placeholder = matchedPlaceholder;
        for (Property prop : properties.values()) {
            if (prop.codedata() == null || prop.codedata().kind() == null) {
                continue;
            }
            if (!prop.codedata().kind().equals(ParameterData.Kind.REQUIRED.name())) {
                continue;
            }
            if (prop.value() == null || prop.value().toString().isBlank()) {
                continue;
            }
            if (prop.types() == null) {
                continue;
            }

            for (PropertyType pt : prop.types()) {
                String template = pt.ballerinaType();
                if (template == null) {
                    continue;
                }
                String varName = prop.value().toString().trim();
                String resolved = resolveConcreteType(workspaceManager, filePath, flowNode,
                        varName, template, placeholder);
                if (resolved != null) {
                    return typeName.replace(placeholder, resolved);
                }
            }
        }
        return null;
    }

    private static String resolveConcreteType(WorkspaceManager workspaceManager, Path filePath,
                                              FlowNode flowNode, String varName,
                                              String template, String placeholder) {
        try {
            workspaceManager.loadProject(filePath);
            SemanticModel semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);
            Document document = FileSystemUtils.getDocument(workspaceManager, filePath);

            LinePosition position = flowNode.codedata().lineRange().startLine();

            List<Symbol> visibleSymbols = semanticModel.visibleSymbols(document, position);
            Optional<Symbol> matchingSymbol = visibleSymbols.stream()
                    .filter(s -> s.getName().map(name -> name.equals(varName)).orElse(false))
                    .findFirst();

            if (matchingSymbol.isEmpty() || !(matchingSymbol.get() instanceof VariableSymbol variableSymbol)) {
                return null;
            }

            TypeSymbol typeSymbol = variableSymbol.typeDescriptor();
            if (typeSymbol.typeKind() == TypeDescKind.TYPE_REFERENCE) {
                typeSymbol = ((TypeReferenceTypeSymbol) typeSymbol).typeDescriptor();
            }

            ModuleInfo moduleInfo = ModuleInfo.from(document.module().descriptor());

            // Case 1: template IS the placeholder — use the actual type directly
            if (template.equals(placeholder)) {
                return CommonUtils.getTypeSignature(semanticModel, typeSymbol, true, moduleInfo);
            }

            // Case 2: template is placeholder + [] — extract the array element type
            if (template.equals(placeholder + "[]")) {
                if (typeSymbol.typeKind() != TypeDescKind.ARRAY) {
                    return null;
                }
                TypeSymbol elementType = ((ArrayTypeSymbol) typeSymbol).memberTypeDescriptor();
                return CommonUtils.getTypeSignature(semanticModel, elementType, true, moduleInfo);
            }

            return null;
        } catch (WorkspaceDocumentException | EventSyncException | ProjectException e) {
            return null;
        }
    }

}
