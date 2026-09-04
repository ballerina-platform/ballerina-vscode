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

import com.google.gson.Gson;
import com.google.gson.stream.JsonReader;
import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.IncludedRecordParameterNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationLineNode;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationNode;
import io.ballerina.compiler.syntax.tree.MarkdownParameterDocumentationLineNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.MethodDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NameReferenceNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeFactory;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.RestParameterNode;
import io.ballerina.compiler.syntax.tree.ReturnTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ImportPrefixReader;
import io.ballerina.modelgenerator.commons.ModuleAliasResolver;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceClass;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.request.TriggerListRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.TriggerRequest;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.MessageType;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.wso2.ballerinalang.util.RepoUtils;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.ANNOT_PREFIX;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_ANNOTATION_ATTACHMENT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CD_TYPE_SERVICE_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_PAREN;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.COLON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GET;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL_CONTEXT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_HEADER_PARAM_ANNOTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP_PARAM_TYPE_HEADER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_DEFAULT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_DEFAULTABLE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_MUTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_QUERY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_SUBSCRIPTION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_PAREN;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROPERTY_DESIGN_APPROACH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SUBSCRIBE;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil.ServiceClassContext.SERVICE_DIAGRAM;

/**
 * Common utility functions used in the project.
 *
 * @since 1.0.0
 */
public final class Utils {

    private static final String PULLING_THE_MODULE_MESSAGE = "Pulling the module '%s' from the central";
    private static final String MODULE_PULLING_FAILED_MESSAGE = "Failed to pull the module: %s";
    private static final String MODULE_PULLING_SUCCESS_MESSAGE = "Successfully pulled the module: %s";

    private static final String REPOSITORIES_DIR = "repositories";
    private static final String CENTRAL_REPO = "central.ballerina.io";
    private static final String BALA_DIR = "bala";
    private static final List<String> DISTRIBUTION_MODULES = Arrays.asList("http", "graphql", "tcp");

    private Utils() {
    }

    /**
     * Convert the syntax-node line range into a lsp4j range.
     *
     * @param lineRange line range
     * @return {@link Range} converted range
     */
    public static Range toRange(LineRange lineRange) {
        return new Range(toPosition(lineRange.startLine()), toPosition(lineRange.endLine()));
    }

    /**
     * Converts syntax-node line position into a lsp4j position.
     *
     * @param position line position
     * @return {@link Range} converted range
     */
    public static Range toRange(LinePosition position) {
        return new Range(toPosition(position), toPosition(position));
    }

    /**
     * Converts syntax-node line position into a lsp4j position.
     *
     * @param linePosition - line position
     * @return {@link Position} converted position
     */
    public static Position toPosition(LinePosition linePosition) {
        return new Position(linePosition.line(), linePosition.offset());
    }

    public static void populateRequiredFuncsDesignApproachAndServiceType(Service service) {
        populateRequiredFunctions(service);
        populateServiceType(service);
        populateDesignApproach(service);
    }

    public static void populateRequiredFunctions(Service service) {
        Value value = service.getProperty(Constants.PROPERTY_REQUIRED_FUNCTIONS);
        if (Objects.nonNull(value) && value.isEnabledWithValue()) {
            String requiredFunction = value.getValue();
            service.getFunctions()
                    .forEach(function -> function.setEnabled(
                            function.getName().getValue().equals(requiredFunction)));
        }
    }

    private static void populateServiceType(Service service) {
        Value serviceValue = service.getServiceType();
        if (Objects.nonNull(serviceValue) && serviceValue.isEnabledWithValue()) {
            String serviceType = service.getServiceTypeName();
            if (Objects.nonNull(serviceType)) {
                getServiceByServiceType(serviceType.toLowerCase(Locale.ROOT))
                        .ifPresent(serviceTypeModel -> service.setFunctions(serviceTypeModel.getFunctions()));
            }
        }
    }

    public static void populateDesignApproach(Service service) {
        Value designApproach = service.getDesignApproach();
        if (Objects.nonNull(designApproach) && designApproach.isEnabled()
                && Objects.nonNull(designApproach.getChoices()) && !designApproach.getChoices().isEmpty()) {
            designApproach.getChoices().stream()
                    .filter(Value::isEnabled).findFirst()
                    .ifPresent(selectedApproach -> service.addProperties(selectedApproach.getProperties()));
            service.getProperties().remove(PROPERTY_DESIGN_APPROACH);
        }
    }

    /**
     * Applies the properties of the enabled choice from the specified choice property key in the service init model.
     * If an enabled choice exists, its properties are added to the service and the choice property is removed.
     *
     * @param service the service initialization model to update
     * @param key     the key of the choice property to process
     */
    public static void applyEnabledChoiceProperty(ServiceInitModel service, String key) {
        Map<String, Value> properties = service.getProperties();
        Value choiceProperty = properties.get(key);
        if (Objects.isNull(choiceProperty) || !choiceProperty.isEnabled()
                || Objects.isNull(choiceProperty.getChoices()) || choiceProperty.getChoices().isEmpty()) {
            return;
        }
        boolean choiceEnabled = choiceProperty.getChoices().stream().anyMatch(Value::isEnabled);
        if (!choiceEnabled) {
            choiceProperty.getChoices().getFirst().setEnabled(true);
        }
        choiceProperty.getChoices().stream()
                .filter(Value::isEnabled)
                .findFirst()
                .ifPresent(selectedChoice -> service.addProperties(selectedChoice.getProperties()));
        properties.remove(key);
    }

    private static Optional<Service> getServiceByServiceType(String serviceType) {
        InputStream resourceStream = Utils.class.getClassLoader()
                .getResourceAsStream(String.format("services/%s.json", serviceType.replaceAll(":", ".")));
        if (resourceStream == null) {
            return Optional.empty();
        }

        try (JsonReader reader = new JsonReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8))) {
            return Optional.of(new Gson().fromJson(reader, Service.class));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    /**
     * Extracts the line range that encompasses all listener expressions in a service declaration.
     *
     * @param serviceNode the service declaration node containing listener expressions
     * @return an {@link Optional} containing the {@link LineRange} that spans from the start
     * of the first listener expression to the end of the last listener expression,
     * or {@link Optional#empty()} if no listener expressions are found
     */
    public static Optional<LineRange> getListenerExpressionsLineRange(ServiceDeclarationNode serviceNode) {
        SeparatedNodeList<ExpressionNode> expressions = serviceNode.expressions();
        if (expressions.isEmpty()) {
            return Optional.empty();
        }

        int size = expressions.size();
        LineRange firstExprLineRange = expressions.get(0).lineRange();
        LineRange lastExprLineRange = expressions.get(size - 1).lineRange();

        LineRange lineRange = LineRange.from(
                firstExprLineRange.fileName(),
                firstExprLineRange.startLine(),
                lastExprLineRange.endLine());

        return Optional.of(lineRange);
    }

    public static Optional<Symbol> getHttpServiceContractSym(SemanticModel semanticModel,
                                                             TypeDescriptorNode serviceTypeDesc) {
        Optional<Symbol> svcTypeSymbol = semanticModel.symbol(serviceTypeDesc);
        if (svcTypeSymbol.isEmpty() || !(svcTypeSymbol.get() instanceof TypeReferenceTypeSymbol svcTypeRef)) {
            return Optional.empty();
        }
        Optional<Symbol> contractSymbol = semanticModel.types().getTypeByName("ballerina", "http", "",
                "ServiceContract");
        if (contractSymbol.isEmpty() || !(contractSymbol.get() instanceof TypeDefinitionSymbol contractTypeDef)) {
            return Optional.empty();
        }
        if (svcTypeRef.subtypeOf(contractTypeDef.typeDescriptor())) {
            return svcTypeSymbol;
        }
        return Optional.empty();
    }

    public static String getPath(NodeList<Node> paths) {
        return paths.stream().map(Node::toString).map(String::trim).collect(Collectors.joining(""));
    }

    public static Function getFunctionModel(MethodDeclarationNode methodDeclarationNode,
                                            Map<String, Value> annotations) {
        Function functionModel = Function.getNewFunctionModel(SERVICE_DIAGRAM);
        annotations.forEach(functionModel.getProperties()::put);

        Value functionName = functionModel.getName();
        functionName.setValue(methodDeclarationNode.methodName().text().trim());
        functionName.setTypes(List.of(PropertyType.types((Value.FieldType.IDENTIFIER))));

        Value accessor = functionModel.getAccessor();
        for (Token qualifier : methodDeclarationNode.qualifierList()) {
            String qualifierText = qualifier.text().trim();
            if (qualifierText.matches(REMOTE)) {
                functionModel.setKind(KIND_REMOTE);
            } else if (qualifierText.matches(RESOURCE)) {
                functionModel.setKind(KIND_RESOURCE);
                accessor.setValue(methodDeclarationNode.methodName().text().trim());
                functionName.setValue(getPath(methodDeclarationNode.relativeResourcePath()));
            }
        }
        FunctionSignatureNode functionSignatureNode = methodDeclarationNode.methodSignature();
        Optional<ReturnTypeDescriptorNode> returnTypeDesc = functionSignatureNode.returnTypeDesc();
        if (returnTypeDesc.isPresent()) {
            FunctionReturnType returnType = functionModel.getReturnType();
            returnType.setValue(returnTypeDesc.get().type().toString().trim());
        }
        SeparatedNodeList<ParameterNode> parameters = functionSignatureNode.parameters();
        List<Parameter> parameterModels = new ArrayList<>();
        parameters.forEach(parameterNode -> {
            Optional<Parameter> parameterModel = getParameterModel(parameterNode);
            parameterModel.ifPresent(parameterModels::add);
        });
        functionModel.setParameters(parameterModels);
        functionModel.setCodedata(new Codedata(methodDeclarationNode.lineRange()));
        return functionModel;
    }

    public static Function getFunctionModel(FunctionDefinitionNode functionDefinitionNode,
                                            Map<String, Value> annotations) {
        Function functionModel = Function.getNewFunctionModel(SERVICE_DIAGRAM);
        annotations.forEach(functionModel.getProperties()::put);
        functionModel.setKind(KIND_DEFAULT);
        Value functionName = functionModel.getName();
        functionName.setValue(functionDefinitionNode.functionName().text().trim());
        functionName.setTypes(List.of(PropertyType.types((Value.FieldType.IDENTIFIER))));

        Value accessor = functionModel.getAccessor();
        for (Token qualifier : functionDefinitionNode.qualifierList()) {
            String qualifierText = qualifier.text().trim();
            if (qualifierText.matches(REMOTE)) {
                functionModel.setKind(KIND_REMOTE);
                break;
            } else if (qualifierText.matches(RESOURCE)) {
                functionModel.setKind(KIND_RESOURCE);
                accessor.setValue(functionDefinitionNode.functionName().text().trim());
                functionName.setValue(getPath(functionDefinitionNode.relativeResourcePath()));
                break;
            }
        }

        FunctionSignatureNode functionSignatureNode = functionDefinitionNode.functionSignature();
        Optional<ReturnTypeDescriptorNode> returnTypeDesc = functionSignatureNode.returnTypeDesc();
        if (returnTypeDesc.isPresent()) {
            FunctionReturnType returnType = functionModel.getReturnType();
            returnType.setValue(returnTypeDesc.get().type().toString().trim());
        }
        SeparatedNodeList<ParameterNode> parameters = functionSignatureNode.parameters();
        List<Parameter> parameterModels = new ArrayList<>();
        parameters.forEach(parameterNode -> {
            Optional<Parameter> parameterModel = getParameterModel(parameterNode);
            parameterModel.ifPresent(parameterModels::add);
        });
        functionModel.setParameters(parameterModels);
        functionModel.setCodedata(new Codedata(functionDefinitionNode.lineRange()));
        functionModel.setCanAddParameters(true);
        updateFunctionDocs(functionDefinitionNode, functionModel);
        updateAnnotationAttachmentProperty(functionDefinitionNode, functionModel);
        return functionModel;
    }

    public static boolean isInitFunction(FunctionDefinitionNode functionDefinitionNode) {
        return functionDefinitionNode.functionName().text().trim().equals(Constants.INIT);
    }

    public static boolean isInitFunction(MethodDeclarationNode functionDefinitionNode) {
        return functionDefinitionNode.methodName().text().trim().equals(Constants.INIT);
    }

    public static Optional<Parameter> getParameterModel(ParameterNode parameterNode) {
        Parameter parameterModel;
        if (parameterNode instanceof RequiredParameterNode parameter) {
            if (parameter.paramName().isEmpty()) {
                return Optional.empty();
            }
            String paramName = parameter.paramName().get().text().trim();
            parameterModel = createParameter(paramName, KIND_REQUIRED, parameter.typeName().toString().trim());
        } else if (parameterNode instanceof DefaultableParameterNode parameter) {
            if (parameter.paramName().isEmpty()) {
                return Optional.empty();
            }
            String paramName = parameter.paramName().get().text().trim();
            parameterModel = createParameter(paramName, KIND_DEFAULTABLE, parameter.typeName().toString().trim());
            Value defaultValue = parameterModel.getDefaultValue();
            defaultValue.setValue(parameter.expression().toString().trim());
            defaultValue.setTypes(List.of(PropertyType.types((Value.FieldType.EXPRESSION))));
            defaultValue.setEnabled(true);
        } else {
            return Optional.empty();
        }
        // Same detection as AbstractFunctionBuilder#getParameterModel (this method is that one's
        // duplicate, used by the generic service-level source extraction path — see
        // ServiceModelUtils#extractFunctionsFromSource) — an @http:Header-annotated parameter must be
        // recognised here too, or it reverts to a plain parameter every time the model is re-read.
        Optional<String> annotationRef = HttpUtil.getHttpParamTypeAndSetHeaderName(
                parameterModel, getParamAnnotations(parameterNode));
        if (annotationRef.filter(HTTP_HEADER_PARAM_ANNOTATION::equals).isPresent()) {
            parameterModel.setHttpParamType(HTTP_PARAM_TYPE_HEADER);
        }
        return Optional.of(parameterModel);
    }


    private static Parameter createParameter(String paramName, String paramKind, String typeName) {
        Parameter parameterModel = Parameter.getNewFunctionParameter();
        parameterModel.setMetadata(new MetaData(paramName, paramName));
        parameterModel.setKind(paramKind);
        parameterModel.getType().setValue(typeName);
        parameterModel.getName().setValue(paramName);
        return parameterModel;
    }

    public static Optional<String> getPath(TypeDefinitionNode serviceTypeNode) {
        Optional<MetadataNode> metadata = serviceTypeNode.metadata();
        if (metadata.isEmpty()) {
            return Optional.empty();
        }
        Optional<AnnotationNode> httpServiceConfig = metadata.get().annotations().stream()
                .filter(annotation -> annotation.annotReference().toString().trim().equals(
                        Constants.TYPE_HTTP_SERVICE_CONFIG))
                .findFirst();
        if (httpServiceConfig.isEmpty()) {
            return Optional.empty();
        }
        Optional<MappingConstructorExpressionNode> mapExpr = httpServiceConfig.get().annotValue();
        if (mapExpr.isEmpty()) {
            return Optional.empty();
        }
        Optional<SpecificFieldNode> basePathField = mapExpr.get().fields().stream()
                .filter(fieldNode -> fieldNode.kind().equals(SyntaxKind.SPECIFIC_FIELD))
                .map(fieldNode -> (SpecificFieldNode) fieldNode)
                .filter(fieldNode -> fieldNode.fieldName().toString().trim()
                        .equals(Constants.BASE_PATH))
                .findFirst();
        if (basePathField.isEmpty()) {
            return Optional.empty();
        }
        Optional<ExpressionNode> valueExpr = basePathField.get().valueExpr();
        if (valueExpr.isPresent() && valueExpr.get().kind().equals(SyntaxKind.STRING_LITERAL)) {
            String value = ((BasicLiteralNode) valueExpr.get()).literalToken().text();
            return Optional.of(value.substring(1, value.length() - 1));
        }
        return Optional.empty();
    }

    public static Optional<Function> getFunctionModel(String serviceType, String functionNameOrType) {
        String resourcePath = String.format("functions/%s_%s.json", serviceType.toLowerCase(Locale.US),
                functionNameOrType.toLowerCase(Locale.US));
        InputStream resourceStream = Utils.class.getClassLoader()
                .getResourceAsStream(resourcePath);
        if (resourceStream == null) {
            return Optional.empty();
        }

        try (JsonReader reader = new JsonReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8))) {
            return Optional.of(new Gson().fromJson(reader, Function.class));
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    public static void populateListenerInfo(Service serviceModel, ServiceDeclarationNode serviceNode) {
        SeparatedNodeList<ExpressionNode> expressions = serviceNode.expressions();
        Value listener = serviceModel.getListener();
        Map<String, Value> properties = getOrCreateListenerProperties(listener);
        if (expressions.size() == 1) {
            handleSingleListener(expressions.get(0), listener, properties);
        } else {
            handleMultipleListeners(expressions, listener, properties);
        }
    }

    private static Map<String, Value> getOrCreateListenerProperties(Value listener) {
        Map<String, Value> properties = listener.getProperties();
        if (properties == null) {
            properties = new HashMap<>();
            listener.setProperties(properties);
        }
        return properties;
    }

    private static void handleSingleListener(ExpressionNode expression, Value listener,
                                             Map<String, Value> properties) {
        String listenerExprName = getListenerExprName(expression);
        if (!listenerExprName.isEmpty()) {
            listener.setValue(listenerExprName);
            properties.put(listenerExprName, createListenerValue(expression));
        }
    }

    private static void handleMultipleListeners(SeparatedNodeList<ExpressionNode> expressions,
                                                Value listener, Map<String, Value> properties) {
        for (ExpressionNode expression : expressions) {
            String listenerExprName = getListenerExprName(expression);
            if (!listenerExprName.isEmpty()) {
                listener.addValue(listenerExprName);
                properties.put(listenerExprName, createListenerValue(expression));
            }
        }
    }

    private static Value createListenerValue(ExpressionNode expression) {
        return new Value.ValueBuilder()
                .setCodedata(new Codedata.Builder()
                        .setLineRange(expression.lineRange())
                        .build())
                .build();
    }

    public static void updateAnnotationAttachmentProperty(ServiceDeclarationNode serviceNode,
                                                          Service service) {
        Optional<MetadataNode> metadata = serviceNode.metadata();
        if (metadata.isEmpty()) {
            return;
        }

        ModulePartNode rootNode = serviceNode.syntaxTree().rootNode() instanceof ModulePartNode root
                ? root : null;
        metadata.get().annotations().forEach(annotationNode -> {
            String annotName = annotationNode.annotReference().toString().trim();
            String[] split = annotName.split(":");
            String prefix = split.length > 1 ? split[0] : "";
            annotName = split[split.length - 1];
            // What source carries is a PREFIX, while the model declares a MODULE — comparing them
            // directly fails the moment the module is imported under an alias (`@ftp2:ServiceConfig`
            // against a container declaring `ftp`), which silently produced a second, duplicate
            // `annot<Name>` property alongside the real one. Resolve the prefix through the file's
            // imports so the two are compared as the same kind of thing.
            String moduleName = prefix.isEmpty() ? ""
                    : ImportPrefixReader.moduleNameForPrefix(rootNode, prefix).orElse(prefix);

            // A schema-driven SERVICE_ANNOTATION container (e.g. RabbitMQ's `serviceConfig`, keyed by
            // its own schema key, not `annot<Name>`) is matched by module/name wherever it sits in the
            // tree; the raw mapping-constructor text is enough as its value (same as the legacy
            // flat-property path below) — no need to distribute it field by field.
            Value schemaContainer = findServiceAnnotationContainer(service.getProperties(), moduleName, annotName);
            if (schemaContainer != null) {
                schemaContainer.setValue(getAnnotationValue(annotationNode));
                return;
            }

            String propertyName = ANNOT_PREFIX + annotName;
            if (service.getProperties().containsKey(propertyName)) {
                Value property = service.getProperties().get(propertyName);
                property.setValue(getAnnotationValue(annotationNode));
            } else {
                // The resolved module name, not the source prefix: a prefix stored here would be read
                // back as a module identity by everything downstream (and re-emitted as one).
                Codedata codedata = new Codedata.Builder()
                        .setType(CD_TYPE_ANNOTATION_ATTACHMENT)
                        .setOriginalName(annotName)
                        .setModuleName(moduleName)
                        .build();

                Value value = new Value.ValueBuilder()
                        .metadata(annotName, annotName)
                        .setCodedata(codedata)
                        .value(getAnnotationValue(annotationNode))
                        .types(List.of(PropertyType.types(Value.FieldType.EXPRESSION)))
                        .enabled(true)
                        .editable(true)
                        .build();
                service.getProperties().put(propertyName, value);
            }
        });
    }

    /**
     * Recursively locates a {@code SERVICE_ANNOTATION} container ({@code codedata.type ==
     * SERVICE_ANNOTATION}) matching an annotation's module/name — wherever it sits in the service's
     * properties tree (a schema-driven template keys it by its own schema key, e.g. {@code
     * serviceConfig}, not by a fixed convention).
     */
    /**
     * Whether a module name resolved from source names the same module a model declares. Models are
     * inconsistent about this: some declare the full module ({@code trigger.google.mail}), others only
     * its last segment ({@code mail}). Both are accepted, so tightening the source side to a real module
     * name does not strand manifests written the other way.
     */
    private static boolean sameModule(String resolved, String declared) {
        if (declared == null || declared.isBlank()) {
            return false;
        }
        return resolved.equals(declared)
                || ModuleAliasResolver.selfPrefix(resolved).equals(declared)
                || resolved.equals(ModuleAliasResolver.selfPrefix(declared));
    }

    private static Value findServiceAnnotationContainer(Map<String, Value> properties, String moduleName,
                                                        String originalName) {
        if (properties == null) {
            return null;
        }
        for (Value value : properties.values()) {
            Codedata cd = value.getCodedata();
            if (cd != null && CD_TYPE_SERVICE_ANNOTATION.equals(cd.getType())
                    && originalName.equals(cd.getOriginalName())
                    && (moduleName.isEmpty() || sameModule(moduleName, cd.getModuleName()))) {
                return value;
            }
            Value nested = findServiceAnnotationContainer(value.getProperties(), moduleName, originalName);
            if (nested != null) {
                return nested;
            }
        }
        return null;
    }

    public static void updateAnnotationAttachmentProperty(FunctionDefinitionNode functionDef,
                                                          Function function) {
        Optional<MetadataNode> metadata = functionDef.metadata();
        if (metadata.isEmpty()) {
            return;
        }

        metadata.get().annotations().forEach(annotationNode -> {
            String annotName = annotationNode.annotReference().toString().trim();
            String[] split = annotName.split(COLON);
            annotName = split[split.length - 1];
            String propertyName = ANNOT_PREFIX + annotName;
            if (function.getProperties().containsKey(propertyName)) {
                Value property = function.getProperties().get(propertyName);
                property.setValue(getAnnotationValue(annotationNode));
            } else {
                if (!function.getProperties().containsKey(propertyName)) {
                    Codedata codedata = new Codedata.Builder()
                            .setType(CD_TYPE_ANNOTATION_ATTACHMENT)
                            .setOriginalName(annotName)
                            .setModuleName(split.length > 1 ? split[0] : "")
                            .build();

                    Value value = new Value.ValueBuilder()
                            .metadata(annotName, annotName)
                            .setCodedata(codedata)
                            .value(getAnnotationValue(annotationNode))
                            .enabled(true)
                            .editable(true)
                            .build();
                    function.getProperties().put(propertyName, value);
                }
            }
        });
    }

    public static NodeList<AnnotationNode> getParamAnnotations(ParameterNode parameterNode) {
        switch (parameterNode) {
            case RequiredParameterNode requiredParameterNode -> {
                return requiredParameterNode.annotations();
            }
            case DefaultableParameterNode defaultableParameterNode -> {
                return defaultableParameterNode.annotations();
            }
            case IncludedRecordParameterNode includedRecordParameterNode -> {
                return includedRecordParameterNode.annotations();
            }
            case RestParameterNode restParameterNode -> {
                return restParameterNode.annotations();
            }
            case null, default -> {
            }
        }
        return NodeFactory.createEmptyNodeList();
    }

    /**
     * This function will add the annotations of a parameter as properties to the parameter model.
     * We can pass a skip list to skip certain annotations.
     *
     * @param parameterModel Parameter model we need to add the annotations as properties
     * @param annotations    Annotations of the parameter
     * @param skipList       List of annotations to skip
     */
    public static void addParamAnnotationAsProperties(Parameter parameterModel,
                                                      NodeList<AnnotationNode> annotations,
                                                      List<String> skipList) {
        if (Objects.isNull(annotations) || annotations.isEmpty()) {
            return;
        }

        annotations.forEach(annotationNode -> {
            String annotName = annotationNode.annotReference().toString().trim();
            String[] split = annotName.split(COLON);
            annotName = split[split.length - 1];
            if (skipList.contains(annotName)) {
                return;
            }
            String propertyName = ANNOT_PREFIX + annotName;
            if (!parameterModel.getProperties().containsKey(propertyName)) {
                Codedata codedata = new Codedata.Builder()
                        .setType(CD_TYPE_ANNOTATION_ATTACHMENT)
                        .setOriginalName(annotName)
                        .setModuleName(split.length > 1 ? split[0] : "")
                        .build();

                Value value = new Value.ValueBuilder()
                        .setCodedata(codedata)
                        .value(getAnnotationValue(annotationNode))
                        .build();
                parameterModel.getProperties().put(propertyName, value);
            }
        });
    }

    private static String getAnnotationValue(AnnotationNode annotationNode) {
        if (annotationNode.annotValue().isEmpty()) {
            return null;
        }

        if (annotationNode.annotValue().isEmpty()) {
            return "";
        }
        return annotationNode.annotValue().get().toSourceCode().trim();
    }

    public static void updateServiceDocs(ServiceDeclarationNode serviceNode, Service service) {
        Optional<MetadataNode> metadata = serviceNode.metadata();
        if (metadata.isEmpty()) {
            return;
        }
        Optional<Node> docString = metadata.get().documentationString();
        if (docString.isEmpty() || docString.get().kind() != SyntaxKind.MARKDOWN_DOCUMENTATION) {
            return;
        }
        MarkdownDocumentationNode docNode = (MarkdownDocumentationNode) docString.get();
        StringBuilder serviceDoc = new StringBuilder();
        for (Node documentationLine : docNode.documentationLines()) {
            if (CommonUtils.isMarkdownDocumentationLine(documentationLine)) {
                NodeList<Node> nodes = ((MarkdownDocumentationLineNode) documentationLine).documentElements();
                nodes.stream().forEach(node -> serviceDoc.append(node.toSourceCode()));
            }
        }
        service.getDocumentation().setValue(serviceDoc.toString().stripTrailing());
    }

    public static void updateFunctionDocs(FunctionDefinitionNode functionDef, Function function) {
        Optional<MetadataNode> metadata = functionDef.metadata();
        if (metadata.isEmpty()) {
            return;
        }
        Optional<Node> docString = metadata.get().documentationString();
        if (docString.isEmpty() || docString.get().kind() != SyntaxKind.MARKDOWN_DOCUMENTATION) {
            return;
        }
        String doc = getFunctionDesc(functionDef);
        function.getDocumentation().setValue(doc);
        function.getParameters().forEach(parameter -> {
            if (!parameter.getName().getValue().equals(GRAPHQL_CONTEXT) &&
                    !parameter.getName().getValue().equals(GRAPHQL_FIELD)) {
                String paramDesc = getParamDesc(functionDef, parameter.getName().getValue());
                parameter.getDocumentation().setValue(paramDesc);
            }
        });
    }

    public static void updateFunctionAndReturnDocs(FunctionDefinitionNode functionDef, Function function) {
        Optional<MetadataNode> metadata = functionDef.metadata();
        if (metadata.isEmpty()) {
            return;
        }
        Optional<Node> docString = metadata.get().documentationString();
        if (docString.isEmpty() || docString.get().kind() != SyntaxKind.MARKDOWN_DOCUMENTATION) {
            return;
        }
        function.getDocumentation().setValue(getFunctionDesc(functionDef));
        function.getParameters().forEach(parameter -> {
            if (!parameter.getName().getValue().equals(GRAPHQL_CONTEXT)
                    && !parameter.getName().getValue().equals(GRAPHQL_FIELD)) {
                parameter.getDocumentation().setValue(getParamDesc(functionDef, parameter.getName().getValue()));
            }
        });
        if (Objects.nonNull(function.getReturnType())) {
            String returnDesc = getReturnDesc(functionDef);
            if (!returnDesc.isEmpty()) {
                function.getReturnType().getDocumentation().setValue(returnDesc);
            }
        }
    }

    private static String getReturnDesc(FunctionDefinitionNode funcDefNode) {
        Optional<MetadataNode> metadata = funcDefNode.metadata();
        Optional<Node> docString = metadata.get().documentationString();
        MarkdownDocumentationNode docNode = (MarkdownDocumentationNode) docString.get();
        StringBuilder returnDoc = new StringBuilder();
        for (Node documentationLine : docNode.documentationLines()) {
            if (documentationLine.kind() == SyntaxKind.MARKDOWN_RETURN_PARAMETER_DOCUMENTATION_LINE) {
                NodeList<Node> nodes = ((MarkdownParameterDocumentationLineNode) documentationLine).documentElements();
                nodes.stream().forEach(node -> returnDoc.append(node.toSourceCode()));
            }
        }
        return returnDoc.toString().stripTrailing();
    }

    private static String getFunctionDesc(FunctionDefinitionNode funcDefNode) {
        Optional<MetadataNode> metadata = funcDefNode.metadata();
        Optional<Node> docString = metadata.get().documentationString();
        MarkdownDocumentationNode docNode = (MarkdownDocumentationNode) docString.get();
        StringBuilder description = new StringBuilder();
        for (Node documentationLine : docNode.documentationLines()) {
            if (CommonUtils.isMarkdownDocumentationLine(documentationLine)) {
                NodeList<Node> nodes = ((MarkdownDocumentationLineNode) documentationLine).documentElements();
                nodes.stream().forEach(node -> description.append(node.toSourceCode()));
            }
        }
        return description.toString().stripTrailing();
    }

    private static String getParamDesc(FunctionDefinitionNode funcDefNode, String paramName) {
        Optional<MetadataNode> metadata = funcDefNode.metadata();
        Optional<Node> docString = metadata.get().documentationString();
        MarkdownDocumentationNode docNode = (MarkdownDocumentationNode) docString.get();
        StringBuilder paramDoc = new StringBuilder();
        for (Node documentationLine : docNode.documentationLines()) {
            if (documentationLine.kind() == SyntaxKind.MARKDOWN_PARAMETER_DOCUMENTATION_LINE) {
                MarkdownParameterDocumentationLineNode docLine =
                        (MarkdownParameterDocumentationLineNode) documentationLine;
                String name = docLine.parameterName().text().trim();
                NodeList<Node> nodes = docLine.documentElements();
                if (paramName.equals(name) && !nodes.isEmpty()) {
                    nodes.stream().forEach(node -> paramDoc.append(node.toSourceCode()));
                }
            }
        }
        return paramDoc.toString().stripTrailing();
    }

    private static String getListenerExprName(ExpressionNode expressionNode) {
        if (expressionNode instanceof NameReferenceNode nameReferenceNode) {
            return nameReferenceNode.toSourceCode().trim();
        } else if (expressionNode instanceof ExplicitNewExpressionNode explicitNewExpressionNode) {
            return explicitNewExpressionNode.toSourceCode().trim();
        }
        return "";
    }

    public static boolean isPresent(Function functionModel, Function newFunction) {
        return newFunction.getName().getValue().equals(functionModel.getName().getValue()) &&
                (Objects.isNull(newFunction.getAccessor()) || Objects.isNull(functionModel.getAccessor()) ||
                        newFunction.getAccessor().getValue().equals(functionModel.getAccessor().getValue()));
    }

    public static void updateValue(Value target, Value source) {
        if (Objects.isNull(target) || Objects.isNull(source)) {
            return;
        }
        target.setEnabled(source.isEnabledWithValue());
        target.setValue(source.getValue());
        target.setTypes(source.getTypes());
    }

    public static void updateValue(FunctionReturnType target, FunctionReturnType source) {
        if (Objects.isNull(target) || Objects.isNull(source)) {
            return;
        }
        target.setEnabled(source.isEnabledWithValue());
        target.setValue(source.getValue());
        target.setTypes(source.getTypes());
        if (Objects.nonNull(source.getResponses())) {
            target.setResponses(source.getResponses());
        }
        target.setIsGraphqlId(source.isGraphqlId());
        if (source.hasDocumentationValue()) {
            updateValue(target.getDocumentation(), source.getDocumentation());
        }
    }

    public static List<String> getAnnotationEdits(Service service) {
        return getAnnotationEdits(service, null);
    }

    /**
     * Renders the service's annotation attachments. When {@code rootNode} is supplied, each annotation's
     * module is resolved to the prefix that file actually binds it to; without it the module's natural
     * prefix is used.
     *
     * <p>The model stores a module <i>identity</i> ({@code ftp}) while source needs a <i>prefix</i>,
     * and the two diverge whenever the module is imported under an alias. Emitting the identity produced
     * {@code @ftp:ServiceConfig} in a file where {@code ftp} is bound to {@code ballerina/file} and the
     * annotation's own module is bound to {@code ftp2}. Resolving here, at render time, keeps the model
     * holding real identities rather than storing a prefix back into {@code moduleName}.
     */
    public static List<String> getAnnotationEdits(Service service, ModulePartNode rootNode) {
        Map<String, Value> properties = service.getProperties();
        List<String> annots = new ArrayList<>();
        for (Map.Entry<String, Value> property : properties.entrySet()) {
            Value value = property.getValue();
            Codedata codedata = value.getCodedata();
            if (codedata == null || codedata.getType() == null || !value.isEnabledWithValue()) {
                continue;
            }
            // CD_TYPE_ANNOTATION_ATTACHMENT is the legacy hardcoded-builder convention (property keyed
            // `annot<Name>`); CD_TYPE_SERVICE_ANNOTATION is the schema-driven (unified TriggerUISchemaModel)
            // container (e.g. RabbitMQ's `serviceConfig`, keyed by its own schema key) — both hold the
            // raw `{...}` mapping-constructor body as their value, so both render the same way. Without
            // this, a schema-driven service's annotation is invisible to this method, so the caller
            // (addServiceAnnotationTextEdits) computes an empty edit and wipes the existing
            // `@module:Name {...}` attachment from source on every save.
            if (CD_TYPE_ANNOTATION_ATTACHMENT.equals(codedata.getType())
                    || CD_TYPE_SERVICE_ANNOTATION.equals(codedata.getType())) {
                String ref = getAnnotationModule(codedata, service.getModuleName(), rootNode)
                        + ":" + codedata.getOriginalName();
                String annotTemplate = "@%s%s".formatted(ref, value.getValue());
                annots.add(annotTemplate);
            }
        }
        return annots;
    }

    private static String getAnnotationModule(Codedata codedata, String module, ModulePartNode rootNode) {
        String moduleName = codedata != null && codedata.getModuleName() != null
                && !codedata.getModuleName().isEmpty() ? codedata.getModuleName() : module;
        String org = codedata == null ? null : codedata.getOrgName();
        return resolveModulePrefix(rootNode, org, moduleName);
    }

    /**
     * The prefix {@code org/module} is bound to in this file, falling back to the module's natural
     * prefix. Unlike allocating a prefix for a new import, this never invents one: an annotation's module
     * is necessarily already imported, so an unmatched module means the model named it loosely rather
     * than that a new import is needed.
     */
    private static String resolveModulePrefix(ModulePartNode rootNode, String org, String moduleName) {
        String natural = ModuleAliasResolver.selfPrefix(moduleName == null ? "" : moduleName);
        if (rootNode == null || moduleName == null || moduleName.isBlank()) {
            return natural;
        }
        Optional<String> exact = ImportPrefixReader.existingImportPrefix(rootNode, org, moduleName);
        if (exact.isPresent()) {
            return exact.get();
        }
        // Models are inconsistent: some name the module by its last segment (`mail` for
        // `trigger.google.mail`), so fall back to matching an import by natural prefix.
        for (ImportDeclarationNode importDeclarationNode : rootNode.imports()) {
            String imported = importDeclarationNode.moduleName().stream()
                    .map(IdentifierToken::text)
                    .collect(Collectors.joining("."));
            if (natural.equals(ModuleAliasResolver.selfPrefix(imported))) {
                return ImportPrefixReader.prefixOf(importDeclarationNode);
            }
        }
        return natural;
    }

    public static List<String> getAnnotationEdits(Function function, Map<String, String> imports) {
        return getAnnotationEdits(function.getProperties(), imports, null);
    }

    /**
     * As {@link #getAnnotationEdits(Function, Map)}, resolving each annotation's module to the prefix
     * {@code rootNode}'s file binds it to. See {@link #getAnnotationEdits(Service, ModulePartNode)}.
     */
    public static List<String> getAnnotationEdits(Function function, Map<String, String> imports,
                                                  ModulePartNode rootNode) {
        return getAnnotationEdits(function.getProperties(), imports, rootNode);
    }

    public static List<String> getAnnotationEdits(Map<String, Value> properties, Map<String, String> imports) {
        return getAnnotationEdits(properties, imports, null);
    }

    public static List<String> getAnnotationEdits(Map<String, Value> properties, Map<String, String> imports,
                                                  ModulePartNode rootNode) {
        return properties.values().stream()
                .filter(Utils::isAnnotationProperty)
                .peek(value -> {
                    if (value.getImports() != null) {
                        imports.putAll(value.getImports());
                    }
                })
                .map(value -> "@%s%s".formatted(getAnnotationReference(value.getCodedata(), rootNode),
                        value.getValue()))
                .collect(Collectors.toList());
    }

    private static String getAnnotationReference(Codedata codedata, ModulePartNode rootNode) {
        String ref = "";
        if (Objects.nonNull(codedata.getModuleName()) && !codedata.getModuleName().isEmpty()) {
            // `moduleName` holds a module IDENTITY; the prefix it is emitted under is a property of the
            // target file, resolved here rather than written back into the model.
            ref = resolveModulePrefix(rootNode, codedata.getOrgName(), codedata.getModuleName()) + COLON;
        }
        ref += codedata.getOriginalName();
        return ref;
    }

    private static boolean isAnnotationProperty(Value value) {
        return Objects.nonNull(value.getCodedata()) && Objects.nonNull(value.getCodedata().getType()) &&
                value.getCodedata().getType().equals(CD_TYPE_ANNOTATION_ATTACHMENT)
                && (value.isEnabledWithValue() || !value.isEnabled() && !value.isEditable());
    }

    public static String getDocumentationEdits(Service service) {
        String docs = "";
        if (Objects.nonNull(service.getDocumentation()) && service.getDocumentation().getValue() != null) {
            String formatted = getFormattedDesc(service.getDocumentation().getValue());
            docs += formatted;
        }
        return docs;
    }

    public static String getDocumentationEdits(ServiceClass serviceClass) {
        String docs = "";
        if (Objects.nonNull(serviceClass.documentation()) && serviceClass.documentation().getValue() != null) {
            String formatted = getFormattedDesc(serviceClass.documentation().getValue());
            docs += formatted;
        }
        return docs;
    }

    public static String getDocumentationEdits(Function function) {
        String docEdits = "";
        if (Objects.nonNull(function.getDocumentation()) && function.getDocumentation().getValue() != null) {
            String formatted = getFormattedDesc(function.getDocumentation().getValue());
            docEdits = formatted.isEmpty() ? docEdits : formatted;
        }
        for (Parameter parameter : function.getParameters()) {
            Value doc = parameter.getDocumentation();
            if (Objects.nonNull(doc) && parameter.isEnabled() && doc.getValue() != null) {
                String formatted = getFormattedParamDesc(doc.getValue(), parameter.getName().getValue());
                docEdits = formatted.isEmpty() ? docEdits : docEdits + NEW_LINE + formatted;
            }
        }
        FunctionReturnType returnType = function.getReturnType();
        if (Objects.nonNull(returnType) && Objects.nonNull(returnType.getDocumentation())
                && returnType.getDocumentation().getValue() != null) {
            String formatted = getFormattedReturnDesc(returnType.getDocumentation().getValue());
            docEdits = formatted.isEmpty() ? docEdits : docEdits + NEW_LINE + formatted;
        }
        return docEdits;
    }

    public static String getFormattedReturnDesc(String desc) {
        if (desc.isBlank()) {
            return "";
        }
        String[] docs = desc.trim().split(NEW_LINE);
        return "# + return - " + String.join(" ", docs);
    }

    public static String getFormattedDesc(String desc) {
        if (desc.isBlank()) {
            return "";
        }
        String doc = CommonUtils.convertToBalDocs(desc);
        return doc.stripTrailing();
    }

    public static String getFormattedParamDesc(String desc, String paramName) {
        if (desc.isBlank()) {
            return "";
        }
        StringBuilder docBuilder = new StringBuilder();
        String[] docs = desc.trim().split(NEW_LINE);
        String paramDoc = String.join(" ", docs);
        docBuilder.append("# + ").append(paramName).append(" - ").append(paramDoc);
        return docBuilder.toString();
    }

    public static void addServiceAnnotationTextEdits(Service service, ServiceDeclarationNode serviceNode,
                                                     List<TextEdit> edits) {
        Token serviceKeyword = serviceNode.serviceKeyword();

        // Resolve annotation module prefixes against the file being edited, so a rewrite cannot replace
        // a working `@ftp2:ServiceConfig` with the model's unresolved `@ftp:ServiceConfig`.
        List<String> annots = getAnnotationEdits(service,
                serviceNode.syntaxTree().rootNode() instanceof ModulePartNode root ? root : null);
        String annotEdit = String.join(System.lineSeparator(), annots);

        Optional<MetadataNode> metadata = serviceNode.metadata();
        if (metadata.isEmpty()) { // metadata is empty and service has annotations
            if (!annotEdit.isEmpty()) {
                annotEdit += System.lineSeparator();
                edits.add(new TextEdit(toRange(serviceKeyword.lineRange().startLine()), annotEdit));
            }
            return;
        }
        NodeList<AnnotationNode> annotations = metadata.get().annotations();
        if (annotations.isEmpty()) { // metadata is present but no annotations
            if (!annotEdit.isEmpty()) {
                annotEdit += System.lineSeparator();
                edits.add(new TextEdit(toRange(metadata.get().lineRange()), annotEdit));
            }
            return;
        }

        // first annotation end line range
        int size = annotations.size();
        LinePosition firstAnnotationEndLinePos = annotations.get(0).lineRange().startLine();

        // last annotation end line range
        LinePosition lastAnnotationEndLinePos = annotations.get(size - 1).lineRange().endLine();

        LineRange range = LineRange.from(serviceKeyword.lineRange().fileName(),
                firstAnnotationEndLinePos, lastAnnotationEndLinePos);

        edits.add(new TextEdit(toRange(range), annotEdit));
    }

    public static void addServiceDocTextEdits(Service service, ServiceDeclarationNode serviceNode,
                                              List<TextEdit> edits) {
        Token serviceKeyword = serviceNode.serviceKeyword();

        String docEdit = getDocumentationEdits(service);

        Optional<MetadataNode> metadata = serviceNode.metadata();
        if (metadata.isEmpty()) { // metadata is empty and the service has documentation
            if (!docEdit.isEmpty()) {
                docEdit += NEW_LINE;
                edits.add(new TextEdit(toRange(serviceKeyword.lineRange().startLine()), docEdit));
            }
            return;
        }

        Optional<Node> documentationString = metadata.get().documentationString();
        if (documentationString.isEmpty()) { // metadata is present but no documentation
            if (!docEdit.isEmpty()) {
                docEdit += NEW_LINE;
                edits.add(new TextEdit(toRange(metadata.get().lineRange()), docEdit));
            }
            return;
        }

        LinePosition docStartLinePos = documentationString.get().lineRange().startLine();
        LinePosition docEndLinePos = documentationString.get().lineRange().endLine();
        LineRange range = LineRange.from(serviceKeyword.lineRange().fileName(), docStartLinePos, docEndLinePos);
        edits.add(new TextEdit(toRange(range), docEdit));
    }

    public static void addFunctionAnnotationTextEdits(Function function, FunctionDefinitionNode functionDef,
                                                      List<TextEdit> edits, Map<String, String> imports) {
        Token firstToken = functionDef.qualifierList().isEmpty() ? functionDef.functionKeyword()
                : functionDef.qualifierList().get(0);

        // Resolve against the file being edited, so rewriting a function's annotations cannot downgrade
        // a working aliased prefix to the model's unresolved module name.
        List<String> annots = getAnnotationEdits(function, imports,
                functionDef.syntaxTree().rootNode() instanceof ModulePartNode root ? root : null);
        String annotEdit = String.join(System.lineSeparator(), annots);

        Optional<MetadataNode> metadata = functionDef.metadata();
        if (metadata.isEmpty()) { // metadata is empty and service has annotations
            if (!annotEdit.isEmpty()) {
                annotEdit += System.lineSeparator();
                edits.add(new TextEdit(toRange(firstToken.lineRange().startLine()), annotEdit));
            }
            return;
        }
        NodeList<AnnotationNode> annotations = metadata.get().annotations();
        if (annotations.isEmpty()) { // metadata is present but no annotations
            if (!annotEdit.isEmpty()) {
                annotEdit += System.lineSeparator();
                edits.add(new TextEdit(toRange(firstToken.lineRange().startLine()), annotEdit));
            }
            return;
        }

        // first annotation end line range
        int size = annotations.size();
        LinePosition firstAnnotationEndLinePos = annotations.get(0).lineRange().startLine();

        // last annotation end line range
        LinePosition lastAnnotationEndLinePos = annotations.get(size - 1).lineRange().endLine();

        LineRange range = LineRange.from(firstToken.lineRange().fileName(),
                firstAnnotationEndLinePos, lastAnnotationEndLinePos);

        edits.add(new TextEdit(toRange(range), annotEdit));
    }

    public static void addFunctionDocTextEdits(Function function, FunctionDefinitionNode functionDef,
                                               List<TextEdit> edits) {
        Token firstToken = functionDef.qualifierList().isEmpty() ? functionDef.functionKeyword()
                : functionDef.qualifierList().get(0);
        String docEdit = getDocumentationEdits(function);
        Optional<MetadataNode> metadata = functionDef.metadata();
        if (metadata.isEmpty()) { // metadata is empty and the service has documentation
            if (!docEdit.isEmpty()) {
                docEdit += System.lineSeparator();
                edits.add(new TextEdit(toRange(firstToken.lineRange().startLine()), docEdit));
            }
            return;
        }

        Optional<Node> documentationString = metadata.get().documentationString();
        if (documentationString.isEmpty()) { // metadata is present but no documentation
            if (!docEdit.isEmpty()) {
                docEdit += System.lineSeparator();
                edits.add(new TextEdit(toRange(metadata.get().lineRange().startLine()), docEdit));
            }
            return;
        }

        LinePosition docStartLinePos = documentationString.get().lineRange().startLine();
        LinePosition docEndLinePos = documentationString.get().lineRange().endLine();
        LineRange range = LineRange.from(firstToken.lineRange().fileName(), docStartLinePos, docEndLinePos);
        edits.add(new TextEdit(toRange(range), docEdit));
    }

    public static String getValueString(Value value) {
        if (Objects.isNull(value)) {
            return "";
        }
        if (!value.isEnabledWithValue()) {
            return "";
        }
        String valueResult = value.getValue();
        if (!valueResult.trim().isEmpty()) {
            return valueResult;
        }
        Map<String, Value> properties = value.getProperties();
        if (Objects.isNull(properties)) {
            return "";
        }
        List<String> params = new ArrayList<>();
        properties.forEach((key, val) -> {
            if (val.isEnabledWithValue()) {
                params.add(String.format("%s: %s", key, getValueString(val)));
            }
        });
        return String.format("{%s}", String.join(", ", params));
    }

    public static String generateFunctionDefSource(Function function, List<String> statusCodeResponses,
                                                   FunctionAddContext addContext,
                                                   FunctionSignatureContext signatureContext,
                                                   Map<String, String> imports) {
        return generateFunctionDefSource(function, statusCodeResponses, addContext, signatureContext, imports, null);
    }

    /**
     * As above, resolving the function's annotation module prefixes against {@code rootNode}'s file.
     * A null {@code rootNode} falls back to each module's natural prefix (the historical behaviour).
     */
    public static String generateFunctionDefSource(Function function, List<String> statusCodeResponses,
                                                   FunctionAddContext addContext,
                                                   FunctionSignatureContext signatureContext,
                                                   Map<String, String> imports, ModulePartNode rootNode) {
        StringBuilder builder = new StringBuilder();
        String documentation = getDocumentationEdits(function);
        if (!documentation.isEmpty()) {
            builder.append(documentation).append(NEW_LINE);
        }

        List<String> functionAnnotations = getAnnotationEdits(function, imports, rootNode);
        if (!functionAnnotations.isEmpty()) {
            builder.append(String.join(NEW_LINE, functionAnnotations)).append(NEW_LINE);
        }

        String functionQualifiers = getFunctionQualifiers(function);
        if (!functionQualifiers.isEmpty()) {
            builder.append(functionQualifiers).append(SPACE);
        }
        builder.append("function ");

        // function accessor
        Value accessor = function.getAccessor();
        if (function.getKind().equals(KIND_RESOURCE) && Objects.nonNull(accessor) && accessor.isEnabledWithValue()) {
            builder.append(getValueString(accessor).toLowerCase(Locale.ROOT)).append(SPACE);
        }
        if (function.getKind().equals(KIND_SUBSCRIPTION)) {
            builder.append(SUBSCRIBE).append(SPACE);
        }
        if (function.getKind().equals(KIND_QUERY)) {
            builder.append(GET).append(SPACE);
        }

        // function identifier
        builder.append(getValueString(function.getName()));
        String functionSignature = generateFunctionSignatureSource(function, imports);
        builder.append(functionSignature);

        FunctionReturnType returnType = function.getReturnType();

        boolean hasErrorInReturn = returnType.hasError() || addContext.equals(FunctionAddContext.HTTP_SERVICE_ADD) ||
                signatureContext.equals(FunctionSignatureContext.HTTP_RESOURCE_ADD);

        if (!hasErrorInReturn && Objects.nonNull(returnType.getValue())) {
            List<String> returnParts = Arrays.stream(returnType.getValue().split("\\|")).toList();
            hasErrorInReturn = returnParts.contains("error") || returnParts.contains("error?");
        }


        // function body
        builder.append("{").append(NEW_LINE);
        if (hasErrorInReturn) {
            builder.append("\tdo {").append(NEW_LINE);
            builder.append("\t} on fail error err {")
                    .append(NEW_LINE)
                    .append("\t\t// handle error")
                    .append(NEW_LINE)
                    .append("\t\treturn error(\"unhandled error\", err);")
                    .append(NEW_LINE)
                    .append("\t}")
                    .append(NEW_LINE);
        }
        builder.append("}");
        return builder.toString();
    }

    public static String generateFunctionSignatureSource(Function function, Map<String, String> imports) {
        StringBuilder builder = new StringBuilder();
        builder.append(OPEN_PAREN)
                .append(generateFunctionParamListSource(function.getParameters(), imports))
                .append(CLOSE_PAREN);

        FunctionReturnType returnType = function.getReturnType();
        if (Objects.nonNull(returnType)) {
            if (returnType.isEnabledWithValue()) {
                builder.append(" returns ");
                // Add GraphQL ID annotation for return type if isGraphqlId is true
                if (returnType.isGraphqlId()) {
                    builder.append("@graphql:ID ");
                    imports.put("graphql", "ballerina/graphql");
                }
                String returnTypeStr = getValueString(returnType);
                builder.append(returnTypeStr);
                if (Objects.nonNull(returnType.getImports())) {
                    imports.putAll(returnType.getImports());
                }
            }
        }
        builder.append(SPACE);
        return builder.toString();
    }

    static String generateFunctionParamListSource(List<Parameter> parameters, Map<String, String> imports) {
        // sort params list where required params come first
        parameters.sort(new Parameter.RequiredParamSorter());

        List<String> params = new ArrayList<>();
        parameters.forEach(param -> {
            if (param.isEnabled()) {
                String paramDef;
                Value defaultValue = param.getDefaultValue();
                if (Objects.nonNull(defaultValue) && defaultValue.isEnabled() &&
                        Objects.nonNull(defaultValue.getValue()) && !defaultValue.getValue().isEmpty()) {
                    Value paramType = param.getType();
                    paramDef = String.format("%s %s = %s", getValueString(paramType), getValueString(param.getName()),
                            getValueString(defaultValue));
                    if (Objects.nonNull(paramType.getImports())) {
                        imports.putAll(paramType.getImports());
                    }
                } else {
                    Value paramType = param.getType();
                    if (Objects.nonNull(paramType.getImports())) {
                        imports.putAll(paramType.getImports());
                    }
                    paramDef = String.format("%s %s", getValueString(paramType), getValueString(param.getName()));
                }
                // Add GraphQL ID annotation if isGraphqlId is true
                if (param.isGraphqlId()) {
                    paramDef = String.format("@graphql:ID %s", paramDef);
                    imports.put("graphql", "ballerina/graphql");
                }
                // An individually bound HTTP header (e.g. a schema-driven function's user-added
                // header parameter) — same annotation shape HttpUtil#generateParams emits for HTTP
                // resources, via the shared helper below.
                String headerAnnotation = buildHttpHeaderAnnotationPrefix(param, imports);
                if (!headerAnnotation.isEmpty()) {
                    paramDef = headerAnnotation + paramDef;
                }
                params.add(paramDef);
            }
        });
        return String.join(", ", params);
    }

    /**
     * The {@code @http:Header} annotation prefix (including a trailing space) for a parameter marked
     * {@code httpParamType == HEADER} — an individually bound HTTP header, whether on HTTP's own
     * resource functions ({@link io.ballerina.servicemodelgenerator.extension.util.HttpUtil}) or a
     * schema-driven function's user-added header parameter (see {@code TriggerFunctionAdapter}'s
     * {@code parameterSchema}). Adds the {@code {name: ...}} remap when the wire header name differs
     * from the parameter's own identifier, and registers the {@code ballerina/http} import the
     * annotation itself needs. Returns {@code ""} for a non-header parameter.
     */
    static String buildHttpHeaderAnnotationPrefix(Parameter param, Map<String, String> imports) {
        if (!HTTP_PARAM_TYPE_HEADER.equals(param.getHttpParamType())) {
            return "";
        }
        imports.put("http", "ballerina/http");
        StringBuilder prefix = new StringBuilder("@http:").append(HTTP_HEADER_PARAM_ANNOTATION);
        Value headerName = param.getHeaderName();
        if (headerName != null && headerName.isEnabledWithValue()
                && !headerName.getValue().equals(param.getName().getValue())) {
            prefix.append(" {name: ").append(headerName.getLiteralValue()).append("}");
        }
        return prefix.append(SPACE).toString();
    }

    public static String getFunctionQualifiers(Function function) {
        List<String> qualifiers = function.getQualifiers();
        qualifiers = Objects.isNull(qualifiers) ? new ArrayList<>() : qualifiers;
        String kind = function.getKind();
        switch (kind) {
            case KIND_QUERY, KIND_SUBSCRIPTION,
                 KIND_RESOURCE -> qualifiers.add(RESOURCE);
            case KIND_REMOTE, KIND_MUTATION -> qualifiers.add(REMOTE);

            default -> {
            }
        }
        return String.join(" ", qualifiers);
    }

    /**
     * Checks whether the given import exists in the given module part node.
     *
     * @param node   module part node
     * @param org    organization name
     * @param module module name
     * @return true if the import exists, false otherwise
     */
    public static boolean importExists(ModulePartNode node, String org, String module) {
        return node.imports().stream().anyMatch(importDeclarationNode -> {
            String moduleName = importDeclarationNode.moduleName().stream()
                    .map(IdentifierToken::text)
                    .collect(Collectors.joining("."));
            return importDeclarationNode.orgName().isPresent() &&
                    org.equals(importDeclarationNode.orgName().get().orgName().text()) &&
                    module.equals(moduleName);
        });
    }

    /**
     * Generates the import statement for the given organization and module.
     *
     * @param org    organization name
     * @param module module name
     * @return generated import statement
     */
    public static String getImportStmt(String org, String module) {
        return String.format(Constants.IMPORT_STMT_TEMPLATE, org, module);
    }

    /**
     * Generates the import statement, adding an {@code as <alias>} clause only when {@code alias} is a
     * genuine rename (non-blank and different from the module's natural last-segment prefix). A dotted
     * module such as {@code trigger.twilio} — whose natural prefix {@code twilio} clashes with the base
     * {@code ballerinax/twilio} client — is thus imported as {@code import ballerinax/trigger.twilio as
     * triggerTwilio;}, while a plain module keeps its unaliased import.
     *
     * @param org    organization name
     * @param module module name
     * @param alias  the prefix to emit; null/blank or equal to the natural prefix yields a plain import
     * @return generated import statement
     */
    public static String getImportStmt(String org, String module, String alias) {
        int lastDot = module.lastIndexOf('.');
        String naturalPrefix = lastDot < 0 ? module : module.substring(lastDot + 1);
        if (alias == null || alias.isBlank() || alias.equals(naturalPrefix)) {
            return getImportStmt(org, module);
        }
        return String.format(Constants.IMPORT_STMT_TEMPLATE_WITH_ALIAS, org, module, alias);
    }

    public static boolean filterTriggers(TriggerProperty triggerProperty, TriggerListRequest request) {
        return (request == null) ||
                ((request.organization() == null || request.organization().equals(triggerProperty.orgName())) &&
                        (request.packageName() == null || request.packageName().equals(triggerProperty.packageName()))
                        && (request.keyWord() == null || triggerProperty.keywords().stream()
                        .anyMatch(keyword -> keyword.equalsIgnoreCase(request.keyWord()))) &&
                        (request.query() == null || triggerProperty.keywords().stream()
                                .anyMatch(keyword -> keyword.contains(request.query()))));
    }

    public static boolean expectsTriggerByName(TriggerRequest request) {
        return request.id() == null && request.organization() != null && request.packageName() != null;
    }

    public static String generateVariableIdentifier(SemanticModel semanticModel, Document document,
                                                    LinePosition linePosition, String prefix) {
        Set<String> names = semanticModel.visibleSymbols(document, linePosition).parallelStream()
                .filter(s -> s.getName().isPresent())
                .map(s -> s.getName().get())
                .collect(Collectors.toSet());
        return NameUtil.generateTypeName(prefix, names);
    }

    public static String generateTypeIdentifier(SemanticModel semanticModel, Document document,
                                                LinePosition linePosition, String prefix) {
        Set<String> names = getVisibleSymbols(semanticModel, document, linePosition);
        return NameUtil.generateTypeName(prefix, names);
    }

    public static String generateTypeIdentifier(Set<String> names, String prefix) {
        return NameUtil.generateTypeName(prefix, names);
    }

    public static Set<String> getVisibleSymbols(SemanticModel semanticModel, Document document,
                                                LinePosition linePosition) {
        return semanticModel.visibleSymbols(document, linePosition).parallelStream()
                .filter(s -> s.getName().isPresent())
                .map(s -> s.getName().get())
                .collect(Collectors.toSet());
    }

    public static Set<String> getVisibleSymbols(SemanticModel semanticModel, Document document) {
        ModulePartNode rootNode = document.syntaxTree().rootNode();
        LinePosition linePosition = rootNode.lineRange().endLine();
        return getVisibleSymbols(semanticModel, document, linePosition);
    }

    public static String upperCaseFirstLetter(String value) {
        return value.substring(0, 1).toUpperCase(Locale.ROOT) + value.substring(1).toLowerCase(Locale.ROOT);
    }

    /**
     * Resolves a Ballerina module by organization, package, and module name.
     * If the module is not found locally, attempts to pull it from the central repository,
     * notifies the client about the process.
     *
     * @param orgName        the organization name
     * @param packageName    the package name
     * @param moduleName     the module name
     * @param lsClientLogger the language server client logger for notifications
     */
    public static void resolveModule(String orgName, String packageName, String moduleName, String version,
                                     LSClientLogger lsClientLogger) {
        resolveModule(orgName, packageName, moduleName, version, false, lsClientLogger);
    }

    /** {@code isLocalRepository} variant: a no-op, since a local-repository connector needs no Central pull. */
    public static void resolveModule(String orgName, String packageName, String moduleName, String version,
                                     boolean isLocalRepository, LSClientLogger lsClientLogger) {
        if (isLocalRepository) {
            return;
        }
        if (BALLERINA.equals(orgName) && DISTRIBUTION_MODULES.contains(packageName)) {
            return;
        }
        Path balHomePath = RepoUtils.createAndGetHomeReposPath();
        Path packagePath = balHomePath.resolve(Path.of(REPOSITORIES_DIR, CENTRAL_REPO, BALA_DIR, orgName,
                packageName));
        boolean hasVersion = version != null && !version.isBlank();

        if (Files.exists(packagePath)) {
            if (!hasVersion) {
                // No specific version requested and the package is already present locally.
                return;
            }
            // A specific version was requested (e.g. a trigger picked from Central search): the package
            // directory exists, but possibly for a different version. Use PackageUtil.getModulePackage to
            // confirm the requested version resolves to a proper Package (pulling it if needed).
            Optional<Package> resolvedPackage = PackageUtil.getModulePackage(
                    PackageUtil.getSampleProject(), orgName, packageName, version);
            if (resolvedPackage.isPresent()) {
                return;
            }
            // Requested version not resolvable locally -> fall through to pull it below.
        }

        // Tests run offline (-Dls.test.offline): never contact Ballerina Central to pull a module.
        // Distribution-bundled packages (e.g. ballerina/file, ballerina/mcp) are resolved by the
        // downstream builder from the build-provisioned distribution; a package that is genuinely
        // unavailable offline fails loudly there instead of being pulled. Production is unchanged.
        if (PackageUtil.isOffline()) {
            return;
        }

        CentralAPI centralApi = RemoteCentral.getInstance();
        String targetVersion = hasVersion ? version : centralApi.latestPackageVersion(orgName, packageName);
        ModuleInfo moduleInfo = new ModuleInfo(orgName, packageName, moduleName, targetVersion);

        if (PackageUtil.isModuleUnresolved(orgName, packageName, targetVersion)) {
            notifyClient(MessageType.Info, PULLING_THE_MODULE_MESSAGE, moduleInfo, lsClientLogger);
            Optional<SemanticModel> semanticModel = PackageUtil.getSemanticModel(moduleInfo);
            if (semanticModel.isEmpty()) {
                notifyClient(MessageType.Error, MODULE_PULLING_FAILED_MESSAGE, moduleInfo, lsClientLogger);
            } else {
                notifyClient(MessageType.Info, MODULE_PULLING_SUCCESS_MESSAGE, moduleInfo, lsClientLogger);
            }
        }
    }

    /**
     * Notifies the client with a formatted message about the module resolution status.
     *
     * @param messageType    the type of message (info, error, etc.)
     * @param message        the message template
     * @param moduleInfo     the module information
     * @param lsClientLogger the language server client logger for notifications
     */
    private static void notifyClient(MessageType messageType, String message, ModuleInfo moduleInfo,
                                     LSClientLogger lsClientLogger) {
        if (lsClientLogger != null) {
            String signature =
                    String.format("%s/%s:%s", moduleInfo.org(), moduleInfo.packageName(), moduleInfo.version());
            lsClientLogger.notifyClient(messageType, String.format(message, signature));
        }
    }

    public enum FunctionAddContext {
        HTTP_SERVICE_ADD,
        TCP_SERVICE_ADD,
        GRAPHQL_SERVICE_ADD,
        TRIGGER_ADD,
        FUNCTION_ADD,
        RESOURCE_ADD
    }

    public enum FunctionSignatureContext {
        FUNCTION_ADD,
        HTTP_RESOURCE_ADD,
        FUNCTION_UPDATE
    }

    public record SelectionRecord(String label, String value) {
    }

    /** Strips a leading and trailing double quote, if both are present; returns {@code text} unchanged otherwise. */
    public static String unquote(String text) {
        if (text != null && text.length() >= 2 && text.startsWith("\"") && text.endsWith("\"")) {
            return text.substring(1, text.length() - 1);
        }
        return text;
    }
}
