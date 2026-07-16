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

package io.ballerina.servicemodelgenerator.extension.builder.function;

import com.google.gson.Gson;
import com.google.gson.stream.JsonReader;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.IncludedRecordParameterNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.ReturnTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.modelgenerator.commons.ServiceTypeFunction;
import io.ballerina.servicemodelgenerator.extension.builder.NodeBuilder;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.FunctionReturnType;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Parameter;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_DEFAULT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_DEFAULTABLE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_INCLUDED_RECORD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_MUTATION;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REMOTE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.KIND_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE_WITH_TAB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OBJECT_METHOD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.RESOURCE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil.ServiceClassContext.CLASS;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil.ServiceClassContext.SERVICE_DIAGRAM;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.FunctionSignatureContext.FUNCTION_ADD;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.generateFunctionDefSource;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.generateFunctionSignatureSource;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getImportStmt;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getPath;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateAnnotationAttachmentProperty;

/**
 * Represents the abstract function builder of the service model generator.
 *
 * @since 1.2.0
 */
public abstract class AbstractFunctionBuilder implements NodeBuilder<Function> {

    private static final String DEFAULT_FUNCTION_MODEL_LOCATION = "functions/%s_%s.json";

    static Function getServiceTypeBoundedFunctionFromSource(ServiceTypeFunction serviceTypeFunction,
                                                            FunctionDefinitionNode functionDefinitionNode,
                                                            SemanticModel semanticModel) {
        Function function = ServiceModelUtils.getFunctionFromServiceTypeFunction(serviceTypeFunction);
        FunctionSignatureNode functionSignatureNode = functionDefinitionNode.functionSignature();
        Optional<ReturnTypeDescriptorNode> returnTypeDesc = functionSignatureNode.returnTypeDesc();
        if (returnTypeDesc.isPresent()) {
            FunctionReturnType returnType = function.getReturnType();
            returnType.setValue(returnTypeDesc.get().type().toString().trim());
        }
        SeparatedNodeList<ParameterNode> parameters = functionSignatureNode.parameters();
        List<Parameter> parameterModels = new ArrayList<>();
        parameters.forEach(parameterNode -> {
            Optional<Parameter> parameterModel = getParameterModel(parameterNode);
            parameterModel.ifPresent(parameterModels::add);
        });
        function.setParameters(parameterModels);
        function.setCodedata(new Codedata(functionDefinitionNode.lineRange()));
        updateAnnotationAttachmentProperty(functionDefinitionNode, function);
        return function;
    }

    static Function getObjectFunctionFromSource(ServiceClassUtil.ServiceClassContext context,
                                                FunctionDefinitionNode functionDefinitionNode,
                                                SemanticModel semanticModel) {
        Function functionModel = Function.getNewFunctionModel(context);
        functionModel.getName().setValue(functionDefinitionNode.functionName().text().trim());

        FunctionSignatureNode functionSignatureNode = functionDefinitionNode.functionSignature();
        Optional<ReturnTypeDescriptorNode> returnTypeDesc = functionSignatureNode.returnTypeDesc();
        if (returnTypeDesc.isPresent()) {
            FunctionReturnType returnType = functionModel.getReturnType();
            returnType.setValue(returnTypeDesc.get().type().toString().trim());
        }

        List<Parameter> parameterModels = new ArrayList<>();
        functionModel.setCodedata(new Codedata(functionDefinitionNode.lineRange()));
        functionModel.setParameters(parameterModels);

        boolean isInit = Utils.isInitFunction(functionDefinitionNode);
        if (isInit) {
            functionModel.setKind(KIND_DEFAULT);
            functionModel.setAccessor(null);
            functionModel.getName().setEditable(false);
            functionModel.getReturnType().setEditable(false);
            functionModel.getReturnType().setEnabled(false);
            if (context == SERVICE_DIAGRAM) {
                functionModel.setSchema(null);
                return functionModel;
            }
        }

        SeparatedNodeList<ParameterNode> parameters = functionSignatureNode.parameters();

        parameters.forEach(parameterNode -> {
            Optional<Parameter> parameterModel = getParameterModel(parameterNode);
            parameterModel.ifPresent(parameterModels::add);
        });
        functionModel.setCanAddParameters(true);
        functionModel.setOptional(true);
        updateAnnotationAttachmentProperty(functionDefinitionNode, functionModel);
        functionModel.getDocumentation();
        if (functionModel.getReturnType() != null) {
            functionModel.getReturnType().getDocumentation();
        }
        Utils.updateFunctionAndReturnDocs(functionDefinitionNode, functionModel);
        return functionModel;
    }

    public static Optional<Parameter> getParameterModel(ParameterNode parameterNode) {
        if (parameterNode instanceof RequiredParameterNode parameter) {
            if (parameter.paramName().isEmpty()) {
                return Optional.empty();
            }
            String paramName = parameter.paramName().get().text().trim();
            String paramType = parameter.typeName().toString().trim();
            Parameter parameterModel = createParameter(paramName, KIND_REQUIRED, paramType);
            return Optional.of(parameterModel);
        } else if (parameterNode instanceof DefaultableParameterNode parameter) {
            if (parameter.paramName().isEmpty()) {
                return Optional.empty();
            }
            String paramName = parameter.paramName().get().text().trim();
            String paramType = parameter.typeName().toString().trim();
            Parameter parameterModel = createParameter(paramName, KIND_DEFAULTABLE, paramType);
            Value defaultValue = parameterModel.getDefaultValue();
            defaultValue.setValue(parameter.expression().toString().trim());
            defaultValue.setTypes(List.of(PropertyType.types(Value.FieldType.EXPRESSION)));
            defaultValue.setEnabled(true);
            return Optional.of(parameterModel);
        } else if (parameterNode instanceof IncludedRecordParameterNode parameter) {
            if (parameter.paramName().isEmpty()) {
                return Optional.empty();
            }
            String paramName = parameter.paramName().get().text().trim();
            String paramType = parameter.typeName().toString().trim();
            Parameter parameterModel = createParameter(paramName, KIND_INCLUDED_RECORD, paramType);
            return Optional.of(parameterModel);
        }
        return Optional.empty();
    }

    public static Map<String, List<TextEdit>> buildModel(AddModelContext context) throws Exception {
        List<TextEdit> edits = new ArrayList<>();
        LineRange functionLineRange;
        NodeList<Node> members;
        if (context.node() instanceof ServiceDeclarationNode serviceDeclarationNode) {
            functionLineRange = serviceDeclarationNode.openBraceToken().lineRange();
            members = serviceDeclarationNode.members();
        } else {
            ClassDefinitionNode classDefinitionNode = (ClassDefinitionNode) context.node();
            functionLineRange = classDefinitionNode.openBrace().lineRange();
            members = classDefinitionNode.members();
        }

        if (!members.isEmpty()) {
            functionLineRange = members.get(members.size() - 1).lineRange();
        }
        Map<String, String> imports = new HashMap<>();
        String functionNode = NEW_LINE_WITH_TAB + generateFunctionDefSource(context.function(), List.of(),
                Utils.FunctionAddContext.FUNCTION_ADD, FUNCTION_ADD, imports)
                .replace(NEW_LINE, NEW_LINE_WITH_TAB);

        List<String> importStmts = new ArrayList<>();
        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        imports.values().forEach(moduleId -> {
            String[] importParts = moduleId.split("/");
            String orgName = importParts[0];
            String moduleName = importParts[1].split(":")[0];
            if (!importExists(rootNode, orgName, moduleName)) {
                importStmts.add(getImportStmt(orgName, moduleName));
            }
        });

        if (!importStmts.isEmpty()) {
            String importsStmts = String.join(NEW_LINE, importStmts);
            edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), importsStmts));
        }

        edits.add(new TextEdit(Utils.toRange(functionLineRange.endLine()), functionNode));
        return Map.of(context.filePath(), edits);
    }

    public static Map<String, List<TextEdit>> buildUpdateModel(UpdateModelContext context) {
        List<TextEdit> edits = new ArrayList<>();
        Map<String, String> imports = new HashMap<>();
        Utils.addFunctionDocTextEdits(context.function(), context.functionNode(), edits);
        Utils.addFunctionAnnotationTextEdits(context.function(), context.functionNode(), edits, imports);

        if (!context.function().isEnabled()) {
            edits.add(new TextEdit(Utils.toRange(context.functionNode().lineRange()), ""));
            return Map.of(context.filePath(), edits);
        }

        String functionName = context.functionNode().functionName().text().trim();
        LineRange nameRange = context.functionNode().functionName().lineRange();
        String functionKind = context.function().getKind();
        boolean isRemote = functionKind.equals(KIND_REMOTE) || functionKind.equals(KIND_MUTATION)
                || functionKind.equals(OBJECT_METHOD);
        String newFunctionName = context.function().getName().getValue();
        if (isRemote && !functionName.equals(newFunctionName)) {
            edits.add(new TextEdit(Utils.toRange(nameRange), newFunctionName));
        }
        boolean isDefault = functionKind.equals(KIND_DEFAULT);

        if (!isRemote && !isDefault) {
            if (!functionName.equals(context.function().getAccessor().getValue())) {
                edits.add(new TextEdit(Utils.toRange(nameRange), context.function().getAccessor().getValue()));
            }

            NodeList<Node> path = context.functionNode().relativeResourcePath();
            if (Objects.nonNull(path) && !newFunctionName.equals(getPath(path))) {
                LinePosition startPos = path.get(0).lineRange().startLine();
                LinePosition endPos = path.get(path.size() - 1).lineRange().endLine();
                LineRange lineRange = context.function().getCodedata().getLineRange();
                LineRange pathLineRange = LineRange.from(lineRange.fileName(), startPos, endPos);
                TextEdit pathEdit = new TextEdit(Utils.toRange(pathLineRange), newFunctionName);
                edits.add(pathEdit);
            }
        }

        LineRange signatureRange = context.functionNode().functionSignature().lineRange();
        List<String> newStatusCodeTypesDef = new ArrayList<>();
        String functionSignature = generateFunctionSignatureSource(context.function(), imports);
        List<String> importStmts = new ArrayList<>();
        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        imports.values().forEach(moduleId -> {
            String[] importParts = moduleId.split("/");
            String orgName = importParts[0];
            String moduleName = importParts[1].split(":")[0];
            if (!importExists(rootNode, orgName, moduleName)) {
                importStmts.add(getImportStmt(orgName, moduleName));
            }
        });

        if (!importStmts.isEmpty()) {
            String importsStmts = String.join(NEW_LINE, importStmts);
            edits.addFirst(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), importsStmts));
        }

        edits.add(new TextEdit(Utils.toRange(signatureRange), functionSignature));

        if (!newStatusCodeTypesDef.isEmpty() &&
                context.functionNode().parent() instanceof ServiceDeclarationNode serviceNode) {
            String statusCodeResEdits = String.join(TWO_NEW_LINES, newStatusCodeTypesDef);
            edits.add(new TextEdit(Utils.toRange(serviceNode.closeBraceToken().lineRange().endLine()),
                    NEW_LINE + statusCodeResEdits));
        }
        return Map.of(context.filePath(), edits);
    }

    private static Parameter createParameter(String paramName, String paramKind, String typeName) {
        Parameter parameterModel = Parameter.functionParamSchema();
        parameterModel.setMetadata(new MetaData(paramName, paramName));
        parameterModel.setKind(paramKind);
        parameterModel.getType().setValue(typeName);
        parameterModel.getName().setValue(paramName);
        return parameterModel;
    }

    /**
     * Get the model template for a given function.
     *
     * @param context the context information for retrieving the functional model template
     * @return the model template
     */
    @Override
    public Optional<Function> getModelTemplate(GetModelContext context) {
        String resourcePath = String.format(DEFAULT_FUNCTION_MODEL_LOCATION, context.serviceType(),
                context.functionType());
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

    /**
     * Get the list of text edits for the given function model for addition.
     *
     * @param context the context information for adding the service
     * @return a map of file paths to lists of text edits
     */
    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        return buildModel(context);
    }

    /**
     * Get the list of text edits for the given function for updating.
     *
     * @param context the context information for updating the service
     * @return a map of file paths to lists of text edits
     */
    @Override
    public Map<String, List<TextEdit>> updateModel(UpdateModelContext context) {
        return buildUpdateModel(context);
    }

    /**
     * Get the function model from the source code.
     *
     * @param context the context information for extracting the function model
     * @return the ser extracted from the source code
     */
    @Override
    public Function getModelFromSource(ModelFromSourceContext context) {
        FunctionDefinitionNode functionDefinitionNode = (FunctionDefinitionNode) context.node();
        Function functionModel;
        if (functionDefinitionNode.parent() instanceof ClassDefinitionNode) {
            functionModel = getObjectFunctionFromSource(CLASS, functionDefinitionNode, context.semanticModel());
        } else {
            functionModel = getFunctionInsideService(context);
        }
        functionModel.setEditable(true);
        return functionModel;
    }

    private Function getFunctionInsideService(ModelFromSourceContext context) {
        FunctionDefinitionNode functionDefinitionNode = (FunctionDefinitionNode) context.node();
        boolean isResource = functionDefinitionNode.qualifierList().stream()
                .anyMatch(qualifier -> qualifier.text().equals(RESOURCE));
        String functionName = isResource ? getPath(functionDefinitionNode.relativeResourcePath())
                : functionDefinitionNode.functionName().text().trim();
        Optional<ServiceTypeFunction> matchingServiceTypeFunction = ServiceDatabaseManager.getInstance()
                .getMatchingServiceTypeFunction(context.orgName(), context.moduleName(), context.serviceType(),
                        functionName);
        return matchingServiceTypeFunction.map(serviceTypeFunction ->
                        getServiceTypeBoundedFunctionFromSource(serviceTypeFunction,
                                functionDefinitionNode, context.semanticModel()))
                .orElseGet(() -> getObjectFunctionFromSource(SERVICE_DIAGRAM,
                        functionDefinitionNode, context.semanticModel()));
    }

    /**
     * @return kind of the function model
     */
    @Override
    public String kind() {
        return "";
    }
}
