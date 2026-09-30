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

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.NameReferenceNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.modelgenerator.commons.AnnotationAttachment;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ReadOnlyMetaData;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.modelgenerator.commons.ServiceDeclaration;
import io.ballerina.modelgenerator.commons.ServiceTypeFunction;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.PropertyTypeMemberInfo;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.ServiceMetadata;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DB_KIND_OPTIONAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.DOUBLE_QUOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FUNCTION_ACCESSOR_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FUNCTION_RETURN_TYPE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL_OBJECT_DOCUMENTATION_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PARAMETER_DEFAULT_VALUE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PARAMETER_TYPE_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_SERVICE_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE_DOCUMENTATION_METADATA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TYPE_SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getFunctionModel;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getPath;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.isPresent;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateListenerInfo;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateAnnotationAttachmentProperty;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateValue;

public class ServiceModelUtils {

    public static void updateServiceInfoNew(Service serviceModel, List<Function> functionsInSource) {
        Utils.populateRequiredFunctions(serviceModel);

        // mark the enabled functions as true if they present in the source
        serviceModel.getFunctions().forEach(functionModel -> {
            Optional<Function> function = functionsInSource.stream()
                    .filter(newFunction -> isPresent(functionModel, newFunction)
                            && newFunction.getKind().equals(functionModel.getKind()))
                    .findFirst();
            functionModel.setEditable(false);
            function.ifPresentOrElse(
                    func -> updateFunction(functionModel, func, serviceModel),
                    () -> functionModel.setEnabled(false)
            );
        });

        // functions contains in a source but not enforced using the service contract type
        functionsInSource.forEach(funcInSource -> {
            if (serviceModel.getFunctions().stream().noneMatch(newFunction -> isPresent(funcInSource, newFunction))) {
                serviceModel.addFunction(funcInSource);
                funcInSource.setEditable(false);
                funcInSource.setOptional(true);
            }
        });
    }

    public static void updateFunction(Function target, Function source, Service service) {
        updateFunction(target, source);
        Value requiredFunctions = service.getProperty(Constants.PROPERTY_REQUIRED_FUNCTIONS);
        if (Objects.nonNull(requiredFunctions)) {
            if (source.isEnabled() && requiredFunctions.getItems().contains(source.getName().getValue())) {
                requiredFunctions.setValue(source.getName().getValue());
            }
        }
    }

    public static void updateFunction(Function target, Function source) {
        target.setEnabled(source.isEnabled());
        target.setCodedata(source.getCodedata());
        updateValue(target.getAccessor(), source.getAccessor());
        updateValue(target.getName(), source.getName());

        List<Parameter> sourceParameters = source.getParameters();
        for (Parameter targetParameter : target.getParameters()) {
            AtomicReference<Optional<Parameter>> parameter = new AtomicReference<>(Optional.empty());
            sourceParameters.removeIf(sourceParam -> {
                if (isEqual(targetParameter.getType(), sourceParam.getType())) {
                    parameter.set(Optional.of(sourceParam));
                    return true;
                }
                return false;
            });
            Optional<Parameter> foundSourceParam = parameter.get();
            if (foundSourceParam.isEmpty()) {
                targetParameter.setEnabled(false);
            }
            foundSourceParam.ifPresent(value -> updateParameter(targetParameter, value));
        }
        updateValue(target.getReturnType(), source.getReturnType());
    }

    private static boolean isEqual(Value target, Value source) {
        return Objects.nonNull(target) && target.getValue().equals(source.getValue());
    }

    private static void updateParameter(Parameter target, Parameter source) {
        target.setEnabled(source.isEnabled());
        target.setKind(source.getKind());
        updateValue(target.getType(), source.getType());
        updateValue(target.getName(), source.getName());
        target.setIsGraphqlId(source.isGraphqlId());
    }

    public static void populateRequiredFunctionsForServiceType(Service service) {
        int packageId = Integer.parseInt(service.getId());
        String serviceTypeName = Objects.nonNull(service.getServiceType()) ? service.getServiceType().getValue()
                : "Service";
        ServiceDatabaseManager.getInstance().getMatchingServiceTypeFunctions(packageId, serviceTypeName)
                .forEach(function -> service.getFunctions().add(getFunctionFromServiceTypeFunction(function)));
    }

    public static List<Function> getRequiredFunctionsForServiceType(ServiceInitModel model) {
        int packageId = Integer.parseInt(model.getId());
        String serviceTypeName = model.getServiceTypeName();
        return ServiceDatabaseManager.getInstance()
                .getMatchingServiceTypeFunctions(packageId, serviceTypeName)
                .stream()
                .map(ServiceModelUtils::getFunctionFromServiceTypeFunction)
                .toList();
    }

    /**
     * Creates a Function model from a ServiceTypeFunction database record.
     * This method transforms database function metadata into a complete Function model
     * with all necessary parameters, return types, and configuration values.
     *
     * @param function the ServiceTypeFunction containing database metadata for the function
     * @return a fully configured Function model ready for code generation
     * @throws IllegalArgumentException if the function parameter is null
     */
    public static Function getFunctionFromServiceTypeFunction(ServiceTypeFunction function) {

        List<Parameter> parameters = createFunctionParameters(function.parameters());
        Value functionName = createFunctionNameValue(function);
        FunctionReturnType functionReturnType = createFunctionReturnType(function);

        Function.FunctionBuilder functionBuilder = new Function.FunctionBuilder();
        functionBuilder
                .setMetadata(new MetaData(function.name(), function.description()))
                .kind(function.kind())
                .name(functionName)
                .returnType(functionReturnType)
                .parameters(parameters)
                .enabled(function.enable() == 1)
                .optional(function.optional() == 1)
                .editable(true);

        configureAccessorForResourceFunction(functionBuilder, function);

        return functionBuilder.build();
    }

    /**
     * Creates a Value object representing the function name with appropriate metadata and constraints.
     *
     * @param function the ServiceTypeFunction containing function name and description
     * @return a configured Value object for the function name
     */
    private static Value createFunctionNameValue(ServiceTypeFunction function) {
        return new Value.ValueBuilder()
                .metadata(function.name(), function.description())
                .value(function.name())
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .setPlaceholder(function.name())
                .enabled(true)
                .build();
    }

    /**
     * Creates a FunctionReturnType model from ServiceTypeFunction return type metadata.
     *
     * @param function the ServiceTypeFunction containing return type information
     * @return a configured FunctionReturnType with error handling capabilities
     */
    private static FunctionReturnType createFunctionReturnType(ServiceTypeFunction function) {
        Value returnValue = new Value.ValueBuilder()
                .setMetadata(FUNCTION_RETURN_TYPE_METADATA)
                .value(function.returnType())
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(function.returnType())
                .editable(function.returnTypeEditable() == 1)
                .enabled(true)
                .optional(true)
                .build();

        FunctionReturnType functionReturnType = new FunctionReturnType(returnValue);
        functionReturnType.setHasError(function.returnError() == 1);

        return functionReturnType;
    }

    /**
     * Configures the accessor for resource functions. Only applies to functions with KIND_RESOURCE.
     *
     * @param functionBuilder the Function.FunctionBuilder to configure
     * @param function        the ServiceTypeFunction containing accessor information
     */
    private static void configureAccessorForResourceFunction(Function.FunctionBuilder functionBuilder,
                                                             ServiceTypeFunction function) {
        if (KIND_RESOURCE.equals(function.kind())) {
            Value accessor = new Value.ValueBuilder()
                    .setMetadata(FUNCTION_ACCESSOR_METADATA)
                    .value(function.accessor())
                    .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                    .setPlaceholder(function.accessor())
                    .enabled(true)
                    .build();
            functionBuilder.accessor(accessor);
            functionBuilder.kind(KIND_RESOURCE);
        } else if (KIND_REMOTE.equals(function.kind())) {
            functionBuilder.kind(KIND_REMOTE);
        }
    }

    /**
     * Creates a list of Parameter models from ServiceTypeFunction parameter metadata.
     *
     * @param functionParameters the list of ServiceTypeFunctionParameter containing parameter metadata
     * @return a list of Parameter models configured with types, names, and default values
     */
    private static List<Parameter> createFunctionParameters(
            List<ServiceTypeFunction.ServiceTypeFunctionParameter> functionParameters) {
        return new ArrayList<>(functionParameters.stream()
                .map(ServiceModelUtils::createParameterFromServiceTypeParameter)
                .toList());
    }

    /**
     * Creates a Parameter model from a ServiceTypeFunctionParameter database record.
     * Configures parameter name, type, default value, and editability settings.
     *
     * @param parameter the ServiceTypeFunctionParameter containing parameter metadata
     * @return a fully configured Parameter model
     * @throws IllegalArgumentException if the parameter is null
     */
    private static Parameter createParameterFromServiceTypeParameter(
            ServiceTypeFunction.ServiceTypeFunctionParameter parameter) {

        Value parameterName = createParameterNameValue(parameter);
        Value parameterType = createParameterTypeValue(parameter);
        Value parameterDefaultValue = createParameterDefaultValue(parameter);

        return new Parameter.Builder()
                .metadata(new MetaData(parameter.name(), parameter.description()))
                .kind(parameter.kind())
                .type(parameterType)
                .name(parameterName)
                .defaultValue(parameterDefaultValue)
                .optional(parameter.kind().equals(DB_KIND_OPTIONAL))
                .enabled(true)
                .editable(true)
                .build();
    }

    /**
     * Creates a Value object for parameter name with appropriate metadata and constraints.
     *
     * @param parameter the ServiceTypeFunctionParameter containing name information
     * @return a configured Value object for the parameter name
     */
    private static Value createParameterNameValue(ServiceTypeFunction.ServiceTypeFunctionParameter parameter) {
        return new Value.ValueBuilder()
                .setMetadata(new MetaData(parameter.name(), parameter.description()))
                .value(parameter.name())
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .setPlaceholder(parameter.name())
                .editable(parameter.nameEditable() == 1)
                .enabled(true)
                .build();
    }

    /**
     * Creates a Value object for parameter type with appropriate metadata and constraints.
     *
     * @param parameter the ServiceTypeFunctionParameter containing type information
     * @return a configured Value object for the parameter type
     */
    private static Value createParameterTypeValue(ServiceTypeFunction.ServiceTypeFunctionParameter parameter) {
        return new Value.ValueBuilder()
                .setMetadata(PARAMETER_TYPE_METADATA)
                .value(parameter.type())
                .types(List.of(PropertyType.types(Value.FieldType.TYPE)))
                .setPlaceholder(parameter.type())
                .editable(parameter.typeEditable() == 1)
                .enabled(true)
                .optional(true)
                .build();
    }

    /**
     * Creates a Value object for parameter default value with appropriate metadata and constraints.
     *
     * @param parameter the ServiceTypeFunctionParameter containing default value information
     * @return a configured Value object for the parameter default value
     */
    private static Value createParameterDefaultValue(ServiceTypeFunction.ServiceTypeFunctionParameter parameter) {
        return new Value.ValueBuilder()
                .setMetadata(PARAMETER_DEFAULT_VALUE_METADATA)
                .value(parameter.defaultValue())
                .types(List.of(PropertyType.types(Value.FieldType.EXPRESSION)))
                .setPlaceholder(parameter.defaultValue())
                .enabled(true)
                .editable(true)
                .optional(true)
                .build();
    }

    public static Value getTypeDescriptorProperty(ServiceDeclaration template, int packageId) {
        List<String> serviceTypes = ServiceDatabaseManager.getInstance().getServiceTypes(packageId);
        String value = "";
        if (serviceTypes.size() == 1) {
            value = serviceTypes.getFirst();
        }
        List<String> items = new ArrayList<>();
        items.add("");
        items.addAll(serviceTypes);

        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData(template.typeDescriptorLabel(), template.typeDescriptorDescription()))
                .setCodedata(new Codedata("SERVICE_TYPE"))
                .value(value)
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT, Option.of(items))))
                .setPlaceholder(template.typeDescriptorDefaultValue())
                .enabled(template.optionalTypeDescriptor() == 0)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getServiceTypeProperty(String value) {
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData("Service Type", "The type of the service"))
                .setCodedata(new Codedata("SERVICE_TYPE"))
                .value(value)
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT, List.of(new Option(value, value)))))
                .enabled(true);

        return valueBuilder.build();
    }

    public static Value getStringLiteralProperty(String value) {
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData("Service Identifier", "Identifier for the service"))
                .setCodedata(new Codedata("STRING_LITERAL"))
                .value(value)
                .setValues(new ArrayList<>())
                .types(List.of(PropertyType.types(Value.FieldType.STRING_LITERAL)))
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getStringLiteral(ServiceDeclaration template) {
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData(template.stringLiteralLabel(), template.stringLiteralDescription()))
                .setCodedata(new Codedata("STRING_LITERAL"))
                .value("")
                .setValues(new ArrayList<>())
                .types(List.of(PropertyType.types(Value.FieldType.STRING_LITERAL)))
                .setPlaceholder(template.stringLiteralDefaultValue())
                .optional(false)
                .setAdvanced(false)
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getBasePathProperty(String value) {
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData("Base Path", "The base path of the service"))
                .setCodedata(new Codedata("SERVICE_BASE_PATH"))
                .value(value)
                .setValues(new ArrayList<>())
                .types(List.of(PropertyType.types(Value.FieldType.SERVICE_PATH)))
                .setPlaceholder("/")
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getBasePathProperty(ServiceDeclaration template) {
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData(template.absoluteResourcePathLabel(),
                        template.absoluteResourcePathDescription()))
                .setCodedata(new Codedata("SERVICE_BASE_PATH"))
                .value(template.absoluteResourcePathDefaultValue())
                .setValues(new ArrayList<>())
                .types(List.of(PropertyType.types(Value.FieldType.SERVICE_PATH)))
                .setPlaceholder(template.absoluteResourcePathDefaultValue())
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getAnnotationAttachmentProperty(AnnotationAttachment attachment) {
        String typeName = attachment.typeName();
        String[] split = typeName.split(":");
        if (split.length > 1) {
            typeName = split[1];
        }
        PropertyTypeMemberInfo propertyTypeMemberInfo = new PropertyTypeMemberInfo(typeName, attachment.packageInfo(),
                attachment.packageName(), "RECORD_TYPE", true);
        Codedata codedata = new Codedata("ANNOTATION_ATTACHMENT");
        codedata.setOriginalName(attachment.annotName());

        PropertyType propertyType = new PropertyType.Builder()
                .fieldType(Value.FieldType.RECORD_MAP_EXPRESSION)
                .ballerinaType(attachment.typeName())
                .setMembers(List.of(propertyTypeMemberInfo))
                .build();

        Value.ValueBuilder valueBuilder = new Value.ValueBuilder()
                .setMetadata(new MetaData(attachment.displayName(), attachment.description()))
                .setCodedata(codedata)
                .value("")
                .setValues(new ArrayList<>())
                .types(List.of(propertyType))
                .setPlaceholder("{}")
                .optional(true)
                .setAdvanced(true)
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getListenersProperty(String protocol, Value.FieldType fieldType) {
        boolean isMultiple = fieldType.equals(Value.FieldType.MULTIPLE_SELECT_LISTENER);
        MetaData metaData = isMultiple ?
                new MetaData("Listeners", "The Listeners to be bound with the service")
                : new MetaData("Listener", "The Listener to be bound with the service");
        Value.FieldType kind = isMultiple ? Value.FieldType.MULTIPLE_SELECT_LISTENER :
                Value.FieldType.SINGLE_SELECT_LISTENER;
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(metaData)
                .setCodedata(new Codedata("LISTENER"))
                .value("")
                .setValues(new ArrayList<>())
                .types(List.of(PropertyType.types(kind, new ArrayList<>())))
                .setPlaceholder("")
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static Value getServiceDocumentation(ServiceClassUtil.ServiceClassContext context) {
        MetaData metaData = context.equals(ServiceClassUtil.ServiceClassContext.GRAPHQL_DIAGRAM)
                ? GRAPHQL_OBJECT_DOCUMENTATION_METADATA : SERVICE_DOCUMENTATION_METADATA;

        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(metaData)
                .setCodedata(new Codedata("DOCUMENTATION"))
                .types(List.of(PropertyType.types(Value.FieldType.TEXT)))
                .optional(true)
                .enabled(true)
                .editable(true);
        return valueBuilder.build();
    }

    public static Value getReadonlyMetadata(String orgName, String packageName, String serviceType) {
        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        HashMap<String, ArrayList<String>> props = new HashMap<>();

        // Try to get metadata from database if service type and package info is available
        if (orgName != null && packageName != null && serviceType != null) {
            List<ReadOnlyMetaData> metaDataList =
                    ServiceDatabaseManager.getInstance().getReadOnlyMetaData(orgName, packageName, serviceType);

            for (ReadOnlyMetaData metaData : metaDataList) {
                String displayName = metaData.displayName() != null && !metaData.displayName().isEmpty()
                        ? metaData.displayName()
                        : metaData.metadataKey();
                props.put(displayName, new ArrayList<>());  // Value will be populated at runtime by extractors
            }
        }

        valueBuilder.setCodedata(new Codedata("READONLY"))
                .value(props)
                .types(List.of(PropertyType.types(Value.FieldType.SINGLE_SELECT)))
                .setPlaceholder("false")
                .optional(false)
                .setAdvanced(false)
                .enabled(true)
                .editable(true);

        return valueBuilder.build();
    }

    public static String getProtocol(String moduleName) {
        String[] split = moduleName.split("\\.");
        return split[split.length - 1];
    }

    public static void updateListenerItems(String moduleName, SemanticModel semanticModel, Project project,
                                           Service serviceModel) {
        Set<String> listeners = ListenerUtil.getCompatibleListeners(moduleName, semanticModel, project);
        List<String> allValues = serviceModel.getListener().getValues();
        if (Objects.isNull(allValues) || allValues.isEmpty()) {
            listeners.add(serviceModel.getListener().getValue());
        } else {
            listeners.addAll(allValues);
        }
        Value listener = serviceModel.getListener();
        if (!listeners.isEmpty() && listener.getTypes() != null && !listener.getTypes().isEmpty()) {
            listener.getTypes().getFirst().options().addAll(Option.of(listeners));
        }
    }

    public static String getServiceTypeIdentifier(String serviceType) {
        String[] parts = serviceType.split(COLON);
        return parts.length > 1 ? parts[1] : parts[0];
    }

    public static ServiceMetadata deriveServiceType(ServiceDeclarationNode serviceNode,
                                                    SemanticModel semanticModel) {
        Optional<TypeDescriptorNode> serviceTypeDesc = serviceNode.typeDescriptor();
        Optional<ModuleSymbol> module = Optional.empty();
        String serviceType = TYPE_SERVICE;
        if (serviceTypeDesc.isPresent()) {
            TypeDescriptorNode typeDescriptorNode = serviceTypeDesc.get();
            serviceType = typeDescriptorNode.toString().trim();
            Optional<TypeSymbol> typeSymbol = semanticModel.typeOf(typeDescriptorNode);
            if (typeSymbol.isPresent()) {
                module = typeSymbol.get().getModule();
            }
        }
        String serviceTypeIdentifier = getServiceTypeIdentifier(serviceType);

        if (module.isEmpty()) {
            SeparatedNodeList<ExpressionNode> expressions = serviceNode.expressions();
            if (expressions.isEmpty()) {
                return new ServiceMetadata(serviceType, serviceTypeIdentifier);
            }
            ExpressionNode expressionNode = expressions.get(0);
            if (expressionNode instanceof ExplicitNewExpressionNode explicitNewExpressionNode) {
                Optional<Symbol> symbol = semanticModel.symbol(explicitNewExpressionNode.typeDescriptor());
                if (symbol.isEmpty()) {
                    return new ServiceMetadata(serviceType, serviceTypeIdentifier);
                }
                module = symbol.get().getModule();
            } else if (expressionNode instanceof NameReferenceNode nameReferenceNode) {
                Optional<Symbol> symbol = semanticModel.symbol(nameReferenceNode);
                if (symbol.isPresent() && symbol.get() instanceof VariableSymbol variableSymbol) {
                    module = variableSymbol.typeDescriptor().getModule();
                }
            }
        }

        if (module.isEmpty()) {
            return new ServiceMetadata(serviceType, serviceTypeIdentifier);
        }
        ModuleID id = module.get().id();
        return new ServiceMetadata(serviceType, serviceTypeIdentifier, id);
    }

    /**
     * Check if the given annotation attachment is a GraphQL ID annotation.
     *
     * @param annotAttach the annotation attachment symbol
     * @return true if the annotation is a GraphQL ID annotation, false otherwise
     */
    public static boolean isGraphqlIdAnnotation(AnnotationAttachmentSymbol annotAttach) {
        AnnotationSymbol annot = annotAttach.typeDescriptor();
        return annot.getName().isPresent()
                && annot.getName().get().equals("ID")
                && annot.getModule().isPresent()
                && annot.getModule().get().id().orgName().equals("ballerina")
                && annot.getModule().get().id().moduleName().equals("graphql");
    }

    /**
     * Check and set the GraphQL ID annotation on a parameter by examining its annotations.
     *
     * @param parameter     the parameter model to update
     * @param parameterNode the parameter syntax node
     * @param semanticModel the semantic model to resolve annotations
     */
    public static void setGraphqlIdForParameter(Parameter parameter,
                                                io.ballerina.compiler.syntax.tree.Node parameterNode,
                                                SemanticModel semanticModel) {
        if (semanticModel == null || parameter == null || parameterNode == null) {
            return;
        }

        Optional<Symbol> symbol = semanticModel.symbol(parameterNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof
                io.ballerina.compiler.api.symbols.ParameterSymbol paramSymbol)) {
            return;
        }

        for (AnnotationAttachmentSymbol annotAttachment : paramSymbol.annotAttachments()) {
            if (isGraphqlIdAnnotation(annotAttachment)) {
                parameter.setIsGraphqlId(true);
                break;
            }
        }
    }

    /**
     * Check and set the GraphQL ID annotation on a function return type.
     *
     * @param returnType    the return type model to update
     * @param functionNode  the function definition node
     * @param semanticModel the semantic model to resolve annotations
     */
    public static void setGraphqlIdForReturnType(FunctionReturnType returnType,
                                                 io.ballerina.compiler.syntax.tree.FunctionDefinitionNode functionNode,
                                                 SemanticModel semanticModel) {
        if (semanticModel == null || returnType == null || functionNode == null) {
            return;
        }

        Optional<Symbol> symbol = semanticModel.symbol(functionNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof
                io.ballerina.compiler.api.symbols.FunctionSymbol functionSymbol)) {
            return;
        }

        io.ballerina.compiler.api.symbols.FunctionTypeSymbol functionTypeSymbol =
                functionSymbol.typeDescriptor();
        functionTypeSymbol.returnTypeAnnotations().ifPresent(returnTypeAnnots -> {
            for (AnnotationAttachmentSymbol annotAttachment : returnTypeAnnots.annotAttachments()) {
                if (isGraphqlIdAnnotation(annotAttachment)) {
                    returnType.setIsGraphqlId(true);
                    break;
                }
            }
        });
    }

    /**
     * Creates a fallback service model when the service is not found in the database.
     * This method builds a basic service model from the service declaration node.
     *
     * @param context the model context
     * @return a fallback service model or null if creation fails
     */
    public static Service createFallbackServiceModel(ModelFromSourceContext context) {
        ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) context.node();
        String serviceType = getServiceTypeIdentifier(context.serviceType());

        String protocol = getProtocol(context.moduleName());
        String name = protocol.toUpperCase(Locale.ROOT) + SPACE + TYPE_SERVICE;

        Map<String, Value> properties = new LinkedHashMap<>();
        List<Function> functionsInSource = extractFunctionsFromSource(serviceNode);

        // Set code metadata
        Codedata codedata = new Codedata.Builder()
                .setLineRange(serviceNode.lineRange())
                .setOrgName(context.orgName())
                .setPackageName(context.packageName())
                .setModuleName(context.moduleName())
                .build();

        // Create basic service model with minimal properties
        Service.ServiceModelBuilder serviceBuilder = new Service.ServiceModelBuilder();
        serviceBuilder
                .setId(context.moduleName())
                .setName(name)
                .setType(context.moduleName())
                .setDisplayName(name)
                .setOrgName(context.orgName())
                .setPackageName(context.packageName())
                .setModuleName(context.moduleName())
                .setListenerProtocol(protocol)
                .setIcon(CommonUtils.generateIcon(context.orgName(), context.packageName(), context.version()))
                .setDocumentation(getServiceDocumentation(ServiceClassUtil.ServiceClassContext.SERVICE_DIAGRAM))
                .setCodedata(codedata)
                .setProperties(properties)
                .setFunctions(functionsInSource);

        Service serviceModel = serviceBuilder.build();

        properties.put(PROP_KEY_LISTENER, getListenersProperty(protocol, Value.FieldType.SINGLE_SELECT_LISTENER));
        populateListenerInfo(serviceModel, serviceNode);

        if (serviceNode.typeDescriptor().isPresent()) {
            properties.put(PROP_KEY_SERVICE_TYPE, getServiceTypeProperty(serviceType));
        }

        extractServicePathInfo(serviceNode, serviceModel);
        updateAnnotationAttachmentProperty(serviceNode, serviceModel);
        return serviceModel;
    }


    /**
     * Extracts and configures service path information from a service declaration node.
     * This method analyzes the absolute resource path of a service and determines whether
     * it represents a string literal or a base path, then updates the service model accordingly.
     *
     * @param serviceNode  the service declaration node containing path information
     * @param serviceModel the service model to update with extracted path information
     * @throws IllegalArgumentException if serviceNode or serviceModel is null
     */
    public static void extractServicePathInfo(ServiceDeclarationNode serviceNode, Service serviceModel) {
        String attachPoint = getPath(serviceNode.absoluteResourcePath());

        if (attachPoint.isEmpty()) {
            return;
        }

        if (isStringLiteral(attachPoint)) {
            configureStringLiteralPath(serviceModel, attachPoint);
        } else {
            configureBasePathProperty(serviceModel, attachPoint);
        }
    }

    /**
     * Determines if the given value represents a string literal by checking for double quote enclosure.
     *
     * @param value the value string to check
     * @return true if the value is enclosed in double quotes, false otherwise
     */
    private static boolean isStringLiteral(String value) {
        return value.startsWith(DOUBLE_QUOTE) && value.endsWith(DOUBLE_QUOTE);
    }

    /**
     * Configures the string literal property for the service model.
     * Updates existing string literal property or creates a new one if none exists.
     *
     * @param serviceModel the service model to update
     * @param attachPoint  the string literal path value
     */
    private static void configureStringLiteralPath(Service serviceModel, String attachPoint) {
        Value stringLiteralProperty = serviceModel.getStringLiteralProperty();
        if (Objects.nonNull(stringLiteralProperty)) {
            stringLiteralProperty.setValue(attachPoint);
        } else {
            serviceModel.setStringLiteral(getStringLiteralProperty(attachPoint));
        }
    }

    /**
     * Configures the base path property for the service model.
     * Updates existing base path property or creates a new one if none exists.
     *
     * @param serviceModel the service model to update
     * @param attachPoint  the base path value
     */
    private static void configureBasePathProperty(Service serviceModel, String attachPoint) {
        Value basePathProperty = serviceModel.getBasePath();
        if (Objects.nonNull(basePathProperty)) {
            basePathProperty.setValue(attachPoint);
        } else {
            serviceModel.setBasePath(getBasePathProperty(attachPoint));
        }
    }

    /**
     * Extracts function definition nodes from the service declaration node.
     *
     * @param serviceNode the service declaration node
     * @return list of syntax function nodes extracted from the source
     */
    public static List<FunctionDefinitionNode> extractFunctionNodesFromSource(ServiceDeclarationNode serviceNode) {
        return serviceNode.members().stream()
                .filter(FunctionDefinitionNode.class::isInstance)
                .map(FunctionDefinitionNode.class::cast)
                .toList();
    }

    /**
     * Extracts function definitions from the service declaration node.
     *
     * @param serviceNode the service declaration node
     * @return list of Function models extracted from the source
     */
    public static List<Function> extractFunctionsFromSource(ServiceDeclarationNode serviceNode) {
        return extractFunctionNodesFromSource(serviceNode).stream()
                .map(member -> getFunctionModel(member, Map.of()))
                .toList();
    }
}
