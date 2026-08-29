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

package io.ballerina.servicemodelgenerator.extension.util;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ArrayTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.RecordFieldNode;
import io.ballerina.compiler.syntax.tree.RecordTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.tools.text.LinePosition;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DATA_BINDING;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DATA_BINDING_PROPERTY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DATA_BINDING_TEMPLATE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.EMPTY_ARRAY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.MAIN_BAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PAYLOAD_FIELD_NAME_PROPERTY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TYPES_BAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.WRAPPER_TYPE_NAME_PROPERTY;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getFunctionModel;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getImportStmt;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

/**
 * Utility class for data binding parameter operations.
 *
 * @since 1.3.0
 */
public final class DatabindUtil {

    private DatabindUtil() {
    }

    public static FunctionMatch findMatchingFunctions(Service service, String functionName,
                                                      ServiceDeclarationNode serviceNode) {
        Function targetFunction = service.getFunctions().stream()
                .filter(func -> func.getName().getValue().equals(functionName))
                .findFirst()
                .orElse(null);

        if (targetFunction == null) {
            return null;
        }

        Function sourceFunction = null;
        FunctionDefinitionNode sourceFunctionNode = null;

        for (var node : serviceNode.members()) {
            if (node instanceof FunctionDefinitionNode functionNode) {
                Function func = getFunctionModel(functionNode, Map.of());
                if (func.getName().getValue().equals(functionName)) {
                    sourceFunction = func;
                    sourceFunctionNode = functionNode;
                    break;
                }
            }
        }

        return new FunctionMatch(targetFunction, sourceFunction, sourceFunctionNode);
    }

    /**
     * Determines data binding configuration by analyzing source function. Extracts the data binding type from record
     * type descriptors if present.
     *
     * @param sourceFunction     The function from source code
     * @param sourceFunctionNode The FunctionDefinitionNode from source
     * @param semanticModel      The semantic model for resolving type references
     * @param payloadFieldName   The field name to look up (e.g., "value" for Kafka, "content" for RabbitMQ)
     * @return DataBindingInfo containing enabled state, parameter type, name, and editability
     */
    private static DataBindingInfo determineDataBindingInfo(Function sourceFunction,
                                                            FunctionDefinitionNode sourceFunctionNode,
                                                            SemanticModel semanticModel,
                                                            String payloadFieldName) {
        boolean dataBindingEnabled = false;
        String paramType = "";
        String paramName = "";
        boolean editable = true;

        if (sourceFunction != null && !sourceFunction.getParameters().isEmpty() && sourceFunctionNode != null) {
            Parameter sourceParam = sourceFunction.getParameters().getFirst();
            paramName = sourceParam.getName().getValue();

            DataBindingTypeInfo typeInfo = extractDataBindingType(sourceFunctionNode, paramName, semanticModel,
                    payloadFieldName);

            if (typeInfo != null && typeInfo.typeName() != null) {
                dataBindingEnabled = true;
                paramType = typeInfo.typeName();
                editable = typeInfo.editable();
            }
        }

        return new DataBindingInfo(dataBindingEnabled, paramType, paramName, editable);
    }

    /**
     * Creates a data binding parameter with the specified configuration.
     *
     * @param paramType          The parameter type value
     * @param paramName          The parameter name value
     * @param dataBindingEnabled Whether the parameter should be enabled
     * @param editable           Whether the parameter should be editable
     * @return The created Parameter object
     */
    private static Parameter createDataBindingParam(String paramType, String paramName,
                                                    boolean dataBindingEnabled, boolean editable) {
        Value parameterType = new Value.ValueBuilder()
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .value(paramType)
                .enabled(true)
                .editable(false)
                .build();

        Value parameterNameValue = new Value.ValueBuilder()
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .value(paramName)
                .enabled(true)
                .editable(false)
                .build();

        return new Parameter.Builder()
                .metadata(new MetaData("Data Binding", "Data binding parameter"))
                .kind(DATA_BINDING)
                .type(parameterType)
                .name(parameterNameValue)
                .enabled(dataBindingEnabled)
                .editable(editable)
                .optional(false)
                .build();
    }

    private static Node unwrapArrayType(Node typeNode) {
        return typeNode instanceof ArrayTypeDescriptorNode arrayTypeNode
                ? arrayTypeNode.memberTypeDesc()
                : typeNode;
    }

    /**
     * Finds a required parameter by name in a function definition.
     *
     * @param functionNode The FunctionDefinitionNode to search
     * @param paramName    The name of the parameter to find
     * @return Optional containing the RequiredParameterNode if found
     */
    private static Optional<RequiredParameterNode> findRequiredParameter(FunctionDefinitionNode functionNode,
                                                                         String paramName) {
        return functionNode.functionSignature().parameters().stream()
                .filter(paramNode -> paramNode instanceof RequiredParameterNode)
                .map(paramNode -> (RequiredParameterNode) paramNode)
                .filter(reqParam -> reqParam.paramName().isPresent() &&
                        reqParam.paramName().get().text().trim().equals(paramName))
                .findFirst();
    }

    /**
     * Extracts data binding type from a type reference (e.g., a named record type).
     *
     * @param simpleNameRef    The simple name reference node
     * @param semanticModel    The semantic model for resolving type references
     * @param payloadFieldName The field name to look up
     * @return DataBindingTypeInfo or null if not found
     */
    private static DataBindingTypeInfo extractFromTypeReference(SimpleNameReferenceNode simpleNameRef,
                                                                SemanticModel semanticModel,
                                                                String payloadFieldName) {
        Optional<Symbol> symbolOpt = semanticModel.symbol(simpleNameRef);
        if (symbolOpt.isEmpty() || !(symbolOpt.get() instanceof TypeReferenceTypeSymbol typeDefSymbol)) {
            return null;
        }

        TypeSymbol typeSymbol = CommonUtil.getRawType(typeDefSymbol.typeDescriptor());
        if (!(typeSymbol instanceof RecordTypeSymbol recordTypeSymbol)) {
            return null;
        }

        String typeName = extractDataBindingTypeFromRecordSymbol(recordTypeSymbol, payloadFieldName);
        return typeName != null
                ? new DataBindingTypeInfo(typeName, true)
                : new DataBindingTypeInfo(simpleNameRef.name().toString().trim(), true);
    }

    /**
     * Extracts data binding type from an inline record type descriptor.
     *
     * @param recordType       The record type descriptor node
     * @param payloadFieldName The field name to look up
     * @return DataBindingTypeInfo or null if not found
     */
    private static DataBindingTypeInfo extractFromInlineRecord(RecordTypeDescriptorNode recordType,
                                                               String payloadFieldName) {
        return recordType.fields().stream()
                .filter(field -> field instanceof RecordFieldNode)
                .map(field -> (RecordFieldNode) field)
                .filter(recordField -> recordField.fieldName().text().trim().equals(payloadFieldName))
                .findFirst()
                .map(recordField -> new DataBindingTypeInfo(recordField.typeName().toString().trim(), true))
                .orElse(null);
    }

    /**
     * Extracts the data binding type from a function parameter.
     *
     * @param functionNode     The FunctionDefinitionNode to analyze
     * @param paramName        The name of the parameter to extract the type from
     * @param semanticModel    The semantic model for resolving type references
     * @param payloadFieldName The field name to look up
     * @return DataBindingTypeInfo or null if not found
     */
    public static DataBindingTypeInfo extractDataBindingType(FunctionDefinitionNode functionNode, String paramName,
                                                              SemanticModel semanticModel,
                                                              String payloadFieldName) {
        Optional<RequiredParameterNode> targetParam = findRequiredParameter(functionNode, paramName);

        if (targetParam.isEmpty()) {
            return null;
        }

        Node targetTypeNameNode = unwrapArrayType(targetParam.get().typeName());

        if (targetTypeNameNode instanceof SimpleNameReferenceNode simpleNameRef) {
            return extractFromTypeReference(simpleNameRef, semanticModel, payloadFieldName);
        }

        if (targetTypeNameNode instanceof RecordTypeDescriptorNode recordType) {
            return extractFromInlineRecord(recordType, payloadFieldName);
        }

        return null;
    }

    /**
     * Extracts the data binding field type from a RecordTypeSymbol.
     *
     * @param recordTypeSymbol The record type symbol to analyze
     * @param payloadFieldName The specific field name to look up (e.g., "value" for Kafka, "content" for RabbitMQ)
     * @return The data binding type name, or null if not found
     */
    private static String extractDataBindingTypeFromRecordSymbol(RecordTypeSymbol recordTypeSymbol,
                                                                 String payloadFieldName) {
        Map<String, RecordFieldSymbol> fieldSymbols = recordTypeSymbol.fieldDescriptors();

        RecordFieldSymbol fieldSymbol = fieldSymbols.get(payloadFieldName);
        if (fieldSymbol != null) {
            TypeSymbol fieldType = fieldSymbol.typeDescriptor();
            if (fieldType.getName().isPresent()) {
                return fieldType.getName().get();
            }
            if (!fieldType.signature().isEmpty()) {
                return fieldType.signature();
            }
        }

        return null;
    }

    /**
     * Adds a data binding parameter to the specified function in the service. This method analyzes the source code to
     * determine if data binding is being used and adds the appropriate DATA_BINDING parameter.
     *
     * @param service          The service model containing the functions
     * @param functionName     Name of the function to add the data binding parameter to
     * @param context          ModelFromSourceContext to access the source node
     * @param payloadFieldName The field name to look up (e.g., "value" for Kafka, "content" for RabbitMQ)
     * @param prefix           Type name prefix for generated wrapper types (e.g., "KafkaDataBind", "RabbitMQDataBind")
     */
    public static void addDataBindingParam(Service service, String functionName, ModelFromSourceContext context,
                                           String payloadFieldName, String prefix) {
        ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) context.node();

        FunctionMatch match = findMatchingFunctions(service, functionName, serviceNode);
        if (match == null || match.targetFunction() == null) {
            return;
        }

        DataBindingInfo dataBindingInfo = determineDataBindingInfo(
                match.sourceFunction(),
                match.sourceFunctionNode(),
                context.semanticModel(),
                payloadFieldName
        );

        Parameter dataBindingParam = createDataBindingParam(
                dataBindingInfo.paramType(),
                dataBindingInfo.paramName(),
                dataBindingInfo.enabled(),
                dataBindingInfo.editable()
        );

        match.targetFunction().addParameter(dataBindingParam);
        if (match.targetFunction().getCodedata() == null) {
            match.targetFunction().setCodedata(new Codedata());
        }
        match.targetFunction().getCodedata().setModuleName(service.getModuleName());
        match.targetFunction().addProperty(DATA_BINDING_PROPERTY,
                new Value.ValueBuilder().value("true").build()
        );
        match.targetFunction().addProperty(PAYLOAD_FIELD_NAME_PROPERTY,
                new Value.ValueBuilder().value(payloadFieldName).build()
        );

        // Extract existing wrapper type name from function node if it exists
        String wrapperTypeName = "";
        if (match.sourceFunctionNode() != null && context.semanticModel() != null && context.project() != null) {
            String paramName = dataBindingParam.getName().getValue();
            Document mainDocument = getDocumentByName(context.filePath(), MAIN_BAL, context.workspaceManager());

            if (mainDocument != null) {
                String extractedTypeName = extractExistingDatabindTypeName(match.sourceFunctionNode(), paramName,
                        context.semanticModel(), mainDocument, "");
                if (extractedTypeName != null) {
                    wrapperTypeName = extractedTypeName;
                }
            }
        }

        if (wrapperTypeName.isEmpty() && context.project() != null && context.semanticModel() != null) {
            wrapperTypeName =
                    generateNewDataBindTypeName(context.filePath(), context.workspaceManager(), context.semanticModel(),
                            match.sourceFunctionNode(), prefix);
        }

        match.targetFunction().addProperty(WRAPPER_TYPE_NAME_PROPERTY,
                new Value.ValueBuilder().value(wrapperTypeName).build()
        );
    }

    /**
     * <p>This method handles the case where standard consolidation may overwrite DATA_BINDING kinds to
     * REQUIRED when parameter types match (e.g., both template and source have "record {}"). By using the original
     * kinds captured before consolidation, it can correctly restore DATA_BINDING kinds and update parameter
     * values.</p>
     *
     * <p>Handles three scenarios:
     * <p>
     * 1. Custom type (e.g., MyType) - enabled=true, type.value="MyType", type.placeholder="record {}"
     * <p>
     * 2. Generic type (e.g., record {}) - enabled=true, type.value="record {}", type.placeholder="record {}"
     * <p>
     * 3. No parameter in source - enabled=false
     * </p>
     *
     * @param targetFunction         The function in the consolidated model
     * @param sourceFunction         The function from source code (contains actual parameter types and names)
     * @param originalParameterKinds Map of parameter position to original kind (from before consolidation)
     */
    public static void restoreAndUpdateDataBindingParams(Function targetFunction, Function sourceFunction,
                                                         Map<Integer, String> originalParameterKinds) {
        if (targetFunction == null || sourceFunction == null || originalParameterKinds == null) {
            return;
        }

        List<Parameter> templateParams = targetFunction.getParameters();
        List<Parameter> sourceParams = sourceFunction.getParameters();

        for (int i = 0; i < templateParams.size(); i++) {
            Parameter templateParam = templateParams.get(i);
            String originalKind = originalParameterKinds.get(i);

            // Only process parameters that were originally DATA_BINDING
            if (!DATA_BINDING.equals(originalKind)) {
                continue;
            }

            // Restore the DATA_BINDING kind (may have been overwritten to REQUIRED by consolidation)
            templateParam.setKind(DATA_BINDING);

            // Check if source has a parameter at this position
            if (i < sourceParams.size()) {
                Parameter sourceParam = sourceParams.get(i);
                String sourceType = sourceParam.getType().getValue();
                String sourceName = sourceParam.getName().getValue();

                // Parameter exists in source - update type and name, set enabled=true
                templateParam.getType().setValue(sourceType);
                templateParam.getName().setValue(sourceName);
                templateParam.setEnabled(true);
            } else {
                // No source parameter at this position - parameter doesn't exist in source
                templateParam.setEnabled(false);
            }
        }
    }

    /**
     * Extracts the original parameter kinds from the template before consolidation.
     *
     * @param serviceModel The base service model with original template data
     * @return Map of function name to (parameter position to original kind)
     */
    public static Map<String, Map<Integer, String>> extractParameterKinds(Service serviceModel) {
        Map<String, Map<Integer, String>> originalKinds = new java.util.HashMap<>();

        for (Function function : serviceModel.getFunctions()) {
            Map<Integer, String> paramKinds = new java.util.HashMap<>();
            List<Parameter> params = function.getParameters();

            for (int i = 0; i < params.size(); i++) {
                paramKinds.put(i, params.get(i).getKind());
            }

            originalKinds.put(function.getName().getValue(), paramKinds);
        }

        return originalKinds;
    }

    /**
     * Processes databinding for a function add operation. This method generates wrapper types and updates the function
     * parameters when a DATA_BINDING parameter is enabled. Similar to processDatabindingUpdate but adapted for add
     * operations where we don't have function nodes.
     *
     * @param context          The AddModelContext containing function and project information
     * @param prefix           Type name prefix for generated wrapper types (e.g., "RabbitMQAnydataMessage")
     * @param baseType         Base record type (e.g., "rabbitmq:AnydataMessage")
     * @param payloadFieldName The field name to look up (e.g., "value" for Kafka, "content" for RabbitMQ)
     * @param isArray          Whether the parameter is array type
     * @return Map of file paths to TextEdit lists for types.bal, or empty if no changes needed
     */
    public static Map<String, List<TextEdit>> processDatabindingForAdd(AddModelContext context, String prefix,
                                                                       String baseType, String payloadFieldName,
                                                                       boolean isArray) {
        Function function = context.function();
        Optional<Parameter> dataBindingParamOpt = findDataBindingParameter(function);

        if (dataBindingParamOpt.isEmpty()) {
            return Map.of();
        }

        Parameter dataBindingParam = dataBindingParamOpt.get();
        String newDataBindingType = dataBindingParam.getType().getValue();

        if (newDataBindingType == null || newDataBindingType.isEmpty()) {
            return Map.of();
        }

        String customWrapperTypeName = null;
        Value wrapperTypeNameProp = function.getProperty(WRAPPER_TYPE_NAME_PROPERTY);
        if (wrapperTypeNameProp != null) {
            String propValue = wrapperTypeNameProp.getValue();
            if (propValue != null && !propValue.isEmpty()) {
                customWrapperTypeName = propValue;
            }
        }

        String typeName;
        if (customWrapperTypeName != null) {
            typeName = customWrapperTypeName;
        } else {
            typeName =
                    generateNewDataBindTypeName(context.filePath(), context.workspaceManager(), context.semanticModel(),
                            null, prefix);
        }

        updateFunctionParameters(function, dataBindingParam, typeName, isArray);

        function.addProperty(WRAPPER_TYPE_NAME_PROPERTY,
                new Value.ValueBuilder().value(typeName).build()
        );

        Map<String, String> importsForTypeDef = dataBindingParam.getType().getImports();

        return createTypeDefinitionEdits(context.project(), typeName, baseType, newDataBindingType, payloadFieldName,
                context.filePath(), context.workspaceManager(), importsForTypeDef);
    }

    /**
     * Creates an inline record type for data binding. Ex. "record {*rabbitmq:AnydataMessage; Order content;}"
     *
     * @param requiredParamType The default parameter type (e.g., "rabbitmq:AnydataMessage")
     * @param dataBindingType   The data binding type (e.g., "Order")
     * @param payloadFieldName  The field name for the payload (e.g., "content")
     * @param isArray           Whether the parameter is an array type
     * @return The inline record type string
     */
    public static String createInlineRecordType(String requiredParamType, String dataBindingType,
                                                String payloadFieldName, boolean isArray) {
        return String.format(DATA_BINDING_TEMPLATE, requiredParamType, dataBindingType, payloadFieldName,
                isArray ? EMPTY_ARRAY : "");
    }

    /**
     * Finds the DATA_BINDING parameter in a function.
     *
     * @param function The function to search
     * @return Optional containing the DATA_BINDING parameter if found and enabled
     */
    private static Optional<Parameter> findDataBindingParameter(Function function) {
        return function.getParameters().stream()
                .filter(param -> DATA_BINDING.equals(param.getKind()) && param.isEnabled())
                .findFirst();
    }

    /**
     * Finds the first REQUIRED parameter in a function.
     *
     * @param function The function to search
     * @return Optional containing the REQUIRED parameter if found
     */
    private static Optional<Parameter> findRequiredParameter(Function function) {
        return function.getParameters().stream()
                .filter(param -> KIND_REQUIRED.equals(param.getKind()) && !param.isOptional())
                .findFirst();
    }

    /**
     * Processes databinding for a function update operation. This is the main entry point for databinding logic. This
     * method: 1. Finds the DATA_BINDING parameter (if exists and enabled) 2. Determines if creating new type or
     * updating existing 3. Generates/updates type in types.bal 4. Updates the function parameter type 5. Returns
     * TextEdits for types.bal
     *
     * @param context          The UpdateModelContext
     * @param prefix           Type name prefix for generated types (e.g., "KafkaAnydataConsumer",
     *                         "RabbitMQAnydataMessage")
     * @param baseType         Base record type (e.g., "kafka:AnydataConsumerRecord")
     * @param payloadFieldName Field name (e.g., "value", "content")
     * @param isArray          Whether parameter is array type
     * @return Map of file paths to TextEdit lists for types.bal
     */
    public static Map<String, List<TextEdit>> processDatabindingUpdate(UpdateModelContext context,
                                                                       String prefix,
                                                                       String baseType,
                                                                       String payloadFieldName,
                                                                       boolean isArray) {
        Function function = context.function();
        Optional<Parameter> dataBindingParamOpt = findDataBindingParameter(function);

        if (dataBindingParamOpt.isEmpty()) {
            Optional<Parameter> disabledDataBindingParam = function.getParameters().stream()
                    .filter(param -> DATA_BINDING.equals(param.getKind()) && !param.isEnabled())
                    .findFirst();
            if (disabledDataBindingParam.isPresent()) {
                return handleDataBindingDeletion(context, function, disabledDataBindingParam.get(), baseType);
            }
            return Map.of();
        }
        // TODO: Go to parent from here and get the types.bal

//        PathUtil.getBalaUriForPath(
//        context.filePath()
//        context.workspaceManager().document()

        Parameter dataBindingParam = dataBindingParamOpt.get();

        if (!dataBindingParam.isEditable()) {
            handleNonEditableDataBinding(function, context.functionNode());
            return Map.of();
        }

        String newDataBindingType = dataBindingParam.getType().getValue();
        if (newDataBindingType == null || newDataBindingType.isEmpty()) {
            return Map.of();
        }

        String customWrapperTypeName = null;
        Value wrapperTypeNameProp = function.getProperty(WRAPPER_TYPE_NAME_PROPERTY);
        if (wrapperTypeNameProp != null) {
            String propValue = wrapperTypeNameProp.getValue();
            if (propValue != null && !propValue.isEmpty()) {
                customWrapperTypeName = validateCustomWrapperTypeName(propValue, context);
            }
        }

        // Determine if we're updating an existing type or creating a new one
        String existingTypeName = null;
        if (context.functionNode() != null) {
            String paramName = dataBindingParam.getName().getValue();
            existingTypeName = extractExistingDatabindTypeName(context.functionNode(), paramName,
                    context.semanticModel(), context.document(), baseType);
        }

        Map<String, List<TextEdit>> typesEdits;
        String typeName;

        Map<String, String> importsForTypeDef = dataBindingParam.getType().getImports();
        if (customWrapperTypeName != null && !customWrapperTypeName.equals(existingTypeName)) {
            typeName = customWrapperTypeName;
            if (existingTypeName != null) {
                typesEdits = updateTypeDefinitionEdits(context, existingTypeName, baseType, newDataBindingType,
                        payloadFieldName, customWrapperTypeName, importsForTypeDef);
            } else {
                typesEdits =
                        createTypeDefinitionEdits(context.project(), customWrapperTypeName, baseType,
                                newDataBindingType, payloadFieldName, context.filePath(), context.workspaceManager(),
                                importsForTypeDef);
            }
        } else if (existingTypeName != null) {
            typeName = existingTypeName;
            typesEdits = updateTypeDefinitionEdits(context, existingTypeName, baseType, newDataBindingType,
                    payloadFieldName, null, importsForTypeDef);
        } else {
            typeName =
                    generateNewDataBindTypeName(context.filePath(), context.workspaceManager(), context.semanticModel(),
                            context.functionNode(),
                            prefix);
            typesEdits = createTypeDefinitionEdits(context.project(), typeName, baseType, newDataBindingType,
                    payloadFieldName, context.filePath(), context.workspaceManager(), importsForTypeDef);
        }

        updateFunctionParameters(function, dataBindingParam, typeName, isArray);

        function.addProperty(WRAPPER_TYPE_NAME_PROPERTY, new Value.ValueBuilder().value(typeName).build());

        return typesEdits;
    }

    /**
     * Handles non-editable databinding by preserving the source type.
     */
    private static void handleNonEditableDataBinding(Function function, FunctionDefinitionNode functionNode) {
        Optional<Parameter> dataBindingParamOpt = findDataBindingParameter(function);
        Optional<Parameter> requiredParamOpt = findRequiredParameter(function);

        if (dataBindingParamOpt.isEmpty() || requiredParamOpt.isEmpty() || functionNode == null) {
            return;
        }

        Parameter dataBindingParam = dataBindingParamOpt.get();
        Parameter requiredParam = requiredParamOpt.get();

        String paramName = dataBindingParam.getName().getValue();
        Optional<RequiredParameterNode> sourceParam = findRequiredParameter(functionNode, paramName);

        if (sourceParam.isPresent()) {
            String sourceParamType = sourceParam.get().typeName().toString().trim();
            requiredParam.getType().setValue(sourceParamType);
            requiredParam.setEnabled(true);
        }

        dataBindingParam.setEnabled(false);
    }

    /**
     * Handles data binding deletion by removing the wrapper type if it's not used elsewhere.
     *
     * @param context                  The UpdateModelContext
     * @param function                 The function containing the data binding
     * @param disabledDataBindingParam The disabled data binding parameter
     * @param baseType                 The base event type (for reference checking)
     * @return Map of TextEdits to delete the type, or empty if type is still in use
     */
    public static Map<String, List<TextEdit>> handleDataBindingDeletion(UpdateModelContext context,
                                                                         Function function,
                                                                         Parameter disabledDataBindingParam,
                                                                         String baseType) {
        if (context.functionNode() == null || context.semanticModel() == null || context.document() == null) {
            return Map.of();
        }

        String paramName = disabledDataBindingParam.getName().getValue();
        String wrapperTypeName = extractExistingDatabindTypeName(context.functionNode(), paramName,
                context.semanticModel(), context.document(), baseType);

        if (wrapperTypeName == null || wrapperTypeName.isEmpty()) {
            return Map.of();
        }

        if (isTypeUsedElsewhere(context, wrapperTypeName)) {
            return Map.of();
        }

        // Type is not used elsewhere, delete it from types.bal
        return deleteTypeDefinition(context, wrapperTypeName);
    }

    /**
     * Checks if a type is used elsewhere in the codebase using semantic model references.
     *
     * @param context  The UpdateModelContext
     * @param typeName The type name to check
     * @return true if the type is referenced elsewhere, false otherwise
     */
    private static boolean isTypeUsedElsewhere(UpdateModelContext context, String typeName) {
        if (context.semanticModel() == null) {
            return true;
        }

        LinePosition typePosition = context.functionNode() != null
                ? context.functionNode().lineRange().startLine()
                : LinePosition.from(0, 0);

        List<Symbol> visibleSymbols = context.semanticModel()
                .visibleSymbols(context.document(), typePosition);

        for (Symbol symbol : visibleSymbols) {
            if (symbol.getName().isPresent() && symbol.getName().get().equals(typeName)) {
                List<?> references = context.semanticModel().references(symbol);

                if (references.size() > 2) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Deletes a type definition from types.bal.
     *
     * @param context  The UpdateModelContext
     * @param typeName The name of the type to delete
     * @return Map of TextEdits to perform the deletion
     */
    private static Map<String, List<TextEdit>> deleteTypeDefinition(UpdateModelContext context, String typeName) {
        Document typesDocument = getTypesDocument(context.filePath(), context.workspaceManager());
        if (typesDocument == null || typesDocument.syntaxTree() == null) {
            return Map.of();
        }

        ModulePartNode modulePartNode = typesDocument.syntaxTree().rootNode();
        TypeDefinitionNode typeDefToDelete = null;

        // Find the type definition to delete
        for (Node member : modulePartNode.members()) {
            if (member instanceof TypeDefinitionNode typeDefNode) {
                if (typeDefNode.typeName().text().equals(typeName)) {
                    typeDefToDelete = typeDefNode;
                    break;
                }
            }
        }

        if (typeDefToDelete == null) {
            return Map.of();
        }

        List<TextEdit> edits = new ArrayList<>();
        TextEdit deleteEdit = new TextEdit(Utils.toRange(typeDefToDelete.lineRange()), "");
        edits.add(deleteEdit);

        Path typesFilePath = getFilePathForFile(context.filePath(), context.workspaceManager(), TYPES_BAL);
        if (typesFilePath == null) {
            return Map.of();
        }
        return Map.of(typesFilePath.toString(), edits);
    }

    /**
     * Updates function parameters with the databind type name.
     *
     * @param function         The function to update
     * @param dataBindingParam The databinding parameter
     * @param typeName         The type name to use
     * @param isArray          Whether the parameter is array type
     */
    private static void updateFunctionParameters(Function function, Parameter dataBindingParam,
                                                 String typeName, boolean isArray) {
        dataBindingParam.getType().setValue(typeName);

        Optional<Parameter> requiredParamOpt = findRequiredParameter(function);
        if (requiredParamOpt.isPresent()) {
            Parameter requiredParam = requiredParamOpt.get();
            String paramType = typeName + (isArray ? EMPTY_ARRAY : "");
            requiredParam.getType().setValue(paramType);
            requiredParam.setEnabled(true);
        }

        dataBindingParam.setEnabled(false);
    }

    /**
     * Validates a custom wrapper type name to ensure it doesn't conflict with Ballerina keywords or existing symbols in
     * the semantic model.
     *
     * @param customTypeName The proposed type name
     * @param context        The UpdateModelContext containing semantic model information
     * @return The validated type name (same as input if valid, or null if invalid)
     */
    private static String validateCustomWrapperTypeName(String customTypeName, UpdateModelContext context) {
        if (customTypeName == null || customTypeName.isEmpty()) {
            return null;
        }

        if (!SyntaxInfo.isIdentifier(customTypeName)) {
            return null;
        }

        if (SyntaxInfo.isKeyword(customTypeName)) {
            return null;
        }

        if (context.semanticModel() != null && context.document() != null) {
            LinePosition linePosition = context.functionNode() != null
                    ? context.functionNode().lineRange().startLine()
                    : LinePosition.from(0, 0);

            Set<String> visibleSymbols = context.semanticModel()
                    .visibleSymbols(context.document(), linePosition).stream()
                    .filter(s -> s.getName().isPresent())
                    .map(s -> s.getName().get())
                    .collect(HashSet::new, Set::add, Set::addAll);

            if (visibleSymbols.contains(customTypeName)) {
                return null;
            }
        }

        return customTypeName;
    }

    /**
     * Generates a new unique databind type name for the given prefix using semantic model.
     *
     * @param contextFilePath  The context file path for locating main.bal
     * @param workspaceManager The workspace manager for document retrieval
     * @param semanticModel    The semantic model for generating unique identifiers
     * @param functionNode     The function definition node for line position reference
     * @param prefix           The prefix for generated type names
     * @return The generated unique type name
     */
    public static String generateNewDataBindTypeName(String contextFilePath, WorkspaceManager workspaceManager,
                                                      SemanticModel semanticModel, FunctionDefinitionNode functionNode,
                                                      String prefix) {
        if (semanticModel == null) {
            return prefix;
        }

        Document mainDocument = getDocumentByName(contextFilePath, MAIN_BAL, workspaceManager);
        if (mainDocument == null) {
            return prefix;
        }

        LinePosition linePosition = functionNode != null
                ? functionNode.lineRange().startLine()
                : LinePosition.from(0, 0);

        return Utils.generateTypeIdentifier(semanticModel, mainDocument, linePosition, prefix);
    }

    /**
     * Extracts import statements needed for the given baseType. For example, "kafka:AnydataConsumerRecord" returns
     * org/kafka imports.
     *
     * @param baseType       The base record type (e.g., "kafka:AnydataConsumerRecord")
     * @param modulePartNode The module part node to check existing imports
     * @param importsForTypeDef Map of imports needed for the type definition
     * @return Set of import statements to add
     */
    private static Set<String> extractRequiredImports(String baseType, ModulePartNode modulePartNode,
                                                      Map<String, String> importsForTypeDef) {
        Set<String> imports = new LinkedHashSet<>();

        if (baseType.contains(COLON)) {
            String moduleName = baseType.substring(0, baseType.indexOf(COLON));
            String org = "ballerinax";
            String importModule = moduleName.toLowerCase(java.util.Locale.ENGLISH);

            // The guess above (org "ballerinax", module == prefix) breaks for dotted module names
            // (e.g. "solace.jms", whose default prefix is "jms", not a real "ballerinax/jms" package) —
            // an explicit override keyed by that same prefix takes precedence when supplied.
            if (importsForTypeDef != null && importsForTypeDef.containsKey(moduleName)) {
                String[] overrideParts = importsForTypeDef.get(moduleName).split("/");
                org = overrideParts[0];
                importModule = overrideParts[1].split(":")[0];
            }

            if (!importExists(modulePartNode, org, importModule)) {
                imports.add(getImportStmt(org, importModule));
            }
        }

        if (importsForTypeDef != null) {
            importsForTypeDef.values().forEach(moduleId -> {
                String[] importParts = moduleId.split("/");
                String orgName = importParts[0];
                String moduleName = importParts[1].split(":")[0];
                if (!importExists(modulePartNode, orgName, moduleName)) {
                    imports.add(getImportStmt(orgName, moduleName));
                }
            });
        }

        return imports;
    }

    /**
     * Prepares the context for type definition edit operations by loading the types document and extracting required
     * imports.
     *
     * @param project          The Ballerina project
     * @param baseType         The base record type (e.g., "kafka:AnydataConsumerRecord")
     * @param contextFilePath  The context file path for locating types.bal
     * @param workspaceManager The workspace manager for document retrieval
     * @return TypeDefinitionEditContext containing types document, module part node, required imports, and project
     */
    private static TypeDefinitionEditContext prepareTypeDefinitionEditContext(Project project, String baseType,
                                                                              String contextFilePath,
                                                                              WorkspaceManager workspaceManager,
                                                                              Map<String, String> importsForTypeDef) {
        Document typesDocument = getOrCreateTypesDocument(contextFilePath, workspaceManager);
        if (typesDocument == null || typesDocument.syntaxTree() == null) {
            return null;
        }

        ModulePartNode modulePartNode = typesDocument.syntaxTree().rootNode();
        Set<String> requiredImports = extractRequiredImports(baseType, modulePartNode, importsForTypeDef);

        return new TypeDefinitionEditContext(typesDocument, modulePartNode, requiredImports, project);
    }

    /**
     * Creates TextEdits for adding a databind type definition to types.bal.
     *
     * @param project          The Ballerina project
     * @param typeName         The name for the new type (e.g., "KafkaDatabind1")
     * @param baseType         The base record type (e.g., "kafka:AnydataConsumerRecord")
     * @param dataBindingType  The data binding field type (e.g., "Order")
     * @param payloadFieldName The field name for the payload (e.g., "value" or "content")
     * @param contextFilePath  The context file path for locating types.bal
     * @param workspaceManager The workspace manager for document retrieval
     * @param importsForTypeDef Map of imports needed for the type definition
     * @return Map of file paths to TextEdit lists
     */
    public static Map<String, List<TextEdit>> createTypeDefinitionEdits(Project project, String typeName,
                                                                         String baseType, String dataBindingType,
                                                                         String payloadFieldName,
                                                                         String contextFilePath,
                                                                         WorkspaceManager workspaceManager,
                                                                         Map<String, String> importsForTypeDef) {
        TypeDefinitionEditContext context =
                prepareTypeDefinitionEditContext(project, baseType, contextFilePath, workspaceManager,
                        importsForTypeDef);
        if (context == null) {
            return Map.of();
        }

        String typeDefinition = generateTypeDefinition(typeName, baseType, dataBindingType, payloadFieldName);

        // Determine insertion point: always after the last existing declaration (member, else the
        // last import), never above pre-existing imports — a members-empty file can still have
        // imports (imports() and members() are separate lists), so that alone doesn't mean "empty".
        LinePosition insertPosition;
        String typeDefPrefix;
        ModulePartNode modulePartNode = context.modulePartNode();

        if (!modulePartNode.members().isEmpty()) {
            // Insert at the end of the file
            Node lastMember = modulePartNode.members().get(modulePartNode.members().size() - 1);
            insertPosition = lastMember.lineRange().endLine();
            typeDefPrefix = "\n\n";
        } else if (!modulePartNode.imports().isEmpty()) {
            // No type/function members yet, but the file already has imports — anchor after the
            // last one so the type definition doesn't land above them.
            ImportDeclarationNode lastImport = modulePartNode.imports().get(modulePartNode.imports().size() - 1);
            insertPosition = lastImport.lineRange().endLine();
            typeDefPrefix = "\n\n";
        } else {
            // Truly empty — anchor at the module-part start, which skips leading minutiae
            // (license/doc comments) so the type definition lands below them.
            insertPosition = modulePartNode.lineRange().startLine();
            typeDefPrefix = "";
        }

        List<TextEdit> edits = new ArrayList<>();

        // Add required imports
        if (!context.requiredImports().isEmpty()) {
            String importsText = String.join("\n", context.requiredImports());
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), importsText + "\n"));
        }

        // Add the type definition
        TextEdit typeEdit = new TextEdit(Utils.toRange(insertPosition), typeDefPrefix + typeDefinition);
        edits.add(typeEdit);

        // Construct the path to types.bal
        Path typesFilePath = getFilePathForFile(contextFilePath, workspaceManager, TYPES_BAL);
        if (typesFilePath == null) {
            return Map.of();
        }
        return Map.of(typesFilePath.toString(), edits);
    }

    /**
     * Gets a document from the file system by filename.
     *
     * @param contextFilePath  The context file path for locating the document
     * @param fileName         The name of the document to retrieve (e.g., "main.bal", "types.bal")
     * @param workspaceManager The workspace manager for document retrieval
     * @return The Document if found, or null otherwise
     */
    private static Document getDocumentByName(String contextFilePath, String fileName,
                                              WorkspaceManager workspaceManager) {
        Path filePath = getFilePathForFile(contextFilePath, workspaceManager, fileName);
        // WorkspaceManager.document() rejects a path that does not exist on disk with a ProjectException. Hence, the
        // absence of the file is checked beforehand, since the document is only read here.
        if (filePath == null || !Files.exists(filePath)) {
            return null;
        }
        Optional<Document> documentOpt = workspaceManager.document(filePath);
        return documentOpt.orElse(null);
    }

    /**
     * Gets the types.bal document in the project, and creates it when it does not exist.
     * <p>
     * The type definition of the data binding is written to types.bal, which is one of the files that the project
     * need not hold yet. Hence, the document is resolved through {@link FileSystemUtils#getDocument}, which creates
     * the file when it is absent.
     * <p>
     * Creating the file is deliberate. The callers of this method are the add and the update operations of a
     * function, which the user has already committed to, and the text edits that they return are anchored to this
     * document and are applied to it right away. A text edit cannot bring the file into being on its own.
     *
     * @param contextFilePath  The context file path for locating types.bal
     * @param workspaceManager The workspace manager for document retrieval
     * @return The types.bal Document, or null if the path cannot be resolved
     */
    private static Document getOrCreateTypesDocument(String contextFilePath,
                                                     WorkspaceManager workspaceManager) {
        Path typesFilePath = getFilePathForFile(contextFilePath, workspaceManager, TYPES_BAL);
        if (typesFilePath == null) {
            return null;
        }
        return FileSystemUtils.getDocument(workspaceManager, typesFilePath);
    }

    /**
     * Gets the types.bal document in the project.
     *
     * @param contextFilePath  The context file path for locating types.bal
     * @param workspaceManager The workspace manager for document retrieval
     * @return The types.bal Document, or null if it does not exist
     */
    private static Document getTypesDocument(String contextFilePath,
                                             WorkspaceManager workspaceManager) {
        return getDocumentByName(contextFilePath, TYPES_BAL, workspaceManager);
    }

    /**
     * Generates the source code for a databind type definition.
     *
     * @param typeName         The name for the type (e.g., "KafkaDatabind1")
     * @param baseType         The base record type (e.g., "kafka:AnydataConsumerRecord")
     * @param dataBindingType  The data binding field type (e.g., "Order")
     * @param payloadFieldName The field name for the payload (e.g., "value" or "content")
     * @return The type definition source code
     */
    private static String generateTypeDefinition(String typeName, String baseType, String dataBindingType,
                                                 String payloadFieldName) {
        return String.format("type %s record {|%n    *%s;%n    %s %s;%n|};",
                typeName, baseType, dataBindingType, payloadFieldName);
    }

    /**
     * Extracts the existing databind type name from the function signature. Validates that the type is a subtype of the
     * baseType using semantic model to ensure it's a proper databinding type.
     *
     * @param functionNode  The FunctionDefinitionNode to analyze
     * @param paramName     The name of the parameter to extract the type from
     * @param semanticModel The semantic model for resolving type symbols
     * @param document      The document for accessing visible symbols at specific positions
     * @param baseType      The base record type (e.g., "kafka:AnydataConsumerRecord") to check against
     * @return The databind type name, or null if not found or not a subtype of baseType
     */
    public static String extractExistingDatabindTypeName(FunctionDefinitionNode functionNode, String paramName,
                                                          SemanticModel semanticModel, Document document,
                                                          String baseType) {
        Optional<RequiredParameterNode> targetParam = findRequiredParameter(functionNode, paramName);
        if (targetParam.isEmpty()) {
            return null;
        }

        String typeString = targetParam.get().typeName().toString().trim();

        // Remove array suffix if present
        if (typeString.endsWith("[]")) {
            typeString = typeString.substring(0, typeString.length() - 2);
        }

        // Check if it's a simple type name (not a qualified name or inline record)
        if (typeString.contains(":") || typeString.contains("{")) {
            return null;
        }

        if (semanticModel != null && document != null) {
            Optional<Symbol> typeSymbolOpt = semanticModel.symbol(unwrapArrayType(targetParam.get().typeName()));
            if (typeSymbolOpt.isPresent() && typeSymbolOpt.get() instanceof TypeSymbol typeSymbol) {
                TypeSymbol existingRawType = CommonUtil.getRawType(typeSymbol);

                Optional<TypeSymbol> baseTypeSymbolOpt = resolveQualifiedTypeName(semanticModel, document, baseType);

                if (baseTypeSymbolOpt.isPresent()) {
                    TypeSymbol baseTypeSymbol = baseTypeSymbolOpt.get();
                    if (existingRawType.subtypeOf(baseTypeSymbol)) {
                        return typeString;
                    }
                    return null;
                } else {
                    if (existingRawType instanceof RecordTypeSymbol) {
                        return typeString;
                    }
                }
            }
        }

        return typeString;
    }

    /**
     * Resolves a qualified type name (e.g., "kafka:AnydataConsumerRecord") to a TypeSymbol. Uses pattern from
     * ModuleUtil.getTypeFromModule() but adapted for SemanticModel + Document context.
     *
     * @param semanticModel The semantic model for resolution
     * @param document      The document for accessing visible symbols
     * @param qualifiedName The qualified type name to resolve
     * @return Optional containing the resolved TypeSymbol
     */
    private static Optional<TypeSymbol> resolveQualifiedTypeName(SemanticModel semanticModel, Document document,
                                                                 String qualifiedName) {
        if (!qualifiedName.contains(":")) {
            return Optional.empty();
        }

        String[] parts = qualifiedName.split(":");
        if (parts.length != 2) {
            return Optional.empty();
        }

        String moduleAlias = parts[0];
        String typeName = parts[1];

        try {
            // Get visible symbols at the beginning of the document to find module imports
            LinePosition startPosition = LinePosition.from(0, 0);
            List<Symbol> visibleSymbols = semanticModel.visibleSymbols(document, startPosition);

            // Find the module symbol matching the alias
            Optional<ModuleSymbol> moduleSymbolOpt = visibleSymbols.stream()
                    .filter(symbol -> symbol.kind().toString().equals("MODULE") &&
                            symbol.getName().isPresent() &&
                            symbol.getName().get().equals(moduleAlias))
                    .findFirst()
                    .filter(symbol -> symbol instanceof ModuleSymbol)
                    .map(symbol -> (ModuleSymbol) symbol);

            if (moduleSymbolOpt.isEmpty()) {
                return Optional.empty();
            }

            ModuleSymbol moduleSymbol = moduleSymbolOpt.get();

            // Search for the type in the module's type definitions
            Optional<TypeSymbol> typeFromTypeDefs = moduleSymbol.typeDefinitions().stream()
                    .filter(typeDefSymbol -> typeDefSymbol.getName().isPresent() &&
                            typeDefSymbol.getName().get().equals(typeName))
                    .findFirst()
                    .map(TypeDefinitionSymbol::typeDescriptor);

            if (typeFromTypeDefs.isPresent()) {
                return typeFromTypeDefs;
            }

            // Search for class symbols if type definition not found
            return moduleSymbol.classes().stream()
                    .filter(classSymbol -> classSymbol.getName().isPresent() &&
                            classSymbol.getName().get().equals(typeName))
                    .map(classSymbol -> (TypeSymbol) classSymbol)
                    .findFirst();

        } catch (NullPointerException | IllegalStateException e) {
            // If semantic model operations fail due to null context or invalid state, return empty
        }

        return Optional.empty();
    }

    private static Path getFilePathForFile(String contextFilePath, WorkspaceManager workspaceManager,
                                           String fileName) {
        Path contextPath = Paths.get(contextFilePath);
        Path parentDir = contextPath.getParent();
        if (parentDir == null) {
            return null;
        }
        Path targetFilePath = parentDir.resolve(fileName);
        return targetFilePath.toAbsolutePath();
    }

    /**
     * Updates an existing databind type definition in types.bal with optional renaming.
     *
     * @param context            The UpdateModelContext containing project information
     * @param existingTypeName   The existing type name to update (e.g., "KafkaDatabind2")
     * @param baseType           The base record type (e.g., "kafka:AnydataConsumerRecord")
     * @param newDataBindingType The new data binding field type (e.g., "Customer")
     * @param payloadFieldName   The field name for the payload (e.g., "value")
     * @param newTypeName        The new type name to rename to (optional, if null uses existingTypeName)
     * @param importsForTypeDef  Map of imports needed for the type definition
     * @return Map of file paths to TextEdit lists
     */
    public static Map<String, List<TextEdit>> updateTypeDefinitionEdits(UpdateModelContext context,
                                                                         String existingTypeName,
                                                                         String baseType,
                                                                         String newDataBindingType,
                                                                         String payloadFieldName,
                                                                         String newTypeName,
                                                                         Map<String, String> importsForTypeDef) {

        Project project = context.project() != null ? context.project() : context.document().module().project();
        TypeDefinitionEditContext editContext =
                prepareTypeDefinitionEditContext(project, baseType, context.filePath(), context.workspaceManager(),
                        importsForTypeDef);
        if (editContext == null) {
            return Map.of();
        }

        ModulePartNode modulePartNode = editContext.modulePartNode();
        TypeDefinitionNode existingTypeDef = null;

        // Find the existing type definition
        for (Node member : modulePartNode.members()) {
            if (member instanceof TypeDefinitionNode typeDefNode) {
                if (typeDefNode.typeName().text().equals(existingTypeName)) {
                    existingTypeDef = typeDefNode;
                    break;
                }
            }
        }

        if (existingTypeDef == null) {
            // Type doesn't exist, create it instead
            return createTypeDefinitionEdits(context.project(), existingTypeName, baseType, newDataBindingType,
                    payloadFieldName, context.filePath(), context.workspaceManager(), importsForTypeDef);
        }

        // Use newTypeName if provided for renaming, otherwise use existingTypeName
        String typeNameForDefinition = newTypeName != null ? newTypeName : existingTypeName;

        // Generate the new type definition
        String newTypeDefinition = generateTypeDefinition(typeNameForDefinition, baseType, newDataBindingType,
                payloadFieldName);

        List<TextEdit> edits = new ArrayList<>();

        // Add required imports
        if (!editContext.requiredImports().isEmpty()) {
            String importsText = String.join("\n", editContext.requiredImports());
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), importsText + "\n"));
        }

        // Create a TextEdit to replace the old definition
        TextEdit replaceEdit = new TextEdit(Utils.toRange(existingTypeDef.lineRange()), newTypeDefinition);
        edits.add(replaceEdit);
        Path typesFilePath = getFilePathForFile(context.filePath(), context.workspaceManager(), TYPES_BAL);
        if (typesFilePath == null) {
            return Map.of();
        }
        return Map.of(typesFilePath.toString(), edits);
    }

    /**
     * Record to hold context for type definition edits operations.
     *
     * @param typesDocument   The types.bal Document
     * @param modulePartNode  The ModulePartNode from the document's syntax tree
     * @param requiredImports Set of import statements needed for the type definition
     * @param project         The Ballerina project
     */
    private record TypeDefinitionEditContext(
            Document typesDocument,
            ModulePartNode modulePartNode,
            Set<String> requiredImports,
            Project project
    ) {
    }

    /**
     * Record to hold matching function references from service and source.
     *
     * @param targetFunction     The function from the service model
     * @param sourceFunction     The function parsed from source code
     * @param sourceFunctionNode The FunctionDefinitionNode from source
     */
    public record FunctionMatch(
            Function targetFunction,
            Function sourceFunction,
            FunctionDefinitionNode sourceFunctionNode
    ) {
    }

    /**
     * Record to hold data binding configuration information.
     *
     * @param enabled   Whether data binding should be enabled
     * @param paramType The parameter type to use
     * @param paramName The parameter name to use
     * @param editable  Whether the data binding parameter should be editable
     */
    public record DataBindingInfo(
            boolean enabled,
            String paramType,
            String paramName,
            boolean editable
    ) {
    }

    /**
     * Record to hold extracted data binding type information.
     *
     * @param typeName The data binding type name (e.g., "Order")
     * @param editable Whether the data binding parameter should be editable
     */
    public record DataBindingTypeInfo(
            String typeName,
            boolean editable
    ) {
    }
}
