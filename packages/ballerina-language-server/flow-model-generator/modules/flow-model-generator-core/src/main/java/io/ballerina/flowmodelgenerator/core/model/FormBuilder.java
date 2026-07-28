/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.flowmodelgenerator.core.model;

import com.google.gson.reflect.TypeToken;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.MarkdownDocumentationNode;
import io.ballerina.compiler.syntax.tree.MatchClauseNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypedBindingPatternNode;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.DiagnosticHandler;
import io.ballerina.flowmodelgenerator.core.TypeParameterReplacer;
import io.ballerina.flowmodelgenerator.core.model.node.DataMapperBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ExpressionBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.FunctionDefinitionBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.RemoteActionCallBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.WaitBuilder;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.NameUtil;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.Stack;
import java.util.StringJoiner;

import static io.ballerina.flowmodelgenerator.core.Constants.COLLECTION_TYPE_CONSTRAINT;
import static io.ballerina.flowmodelgenerator.core.Constants.CONDITION_TYPE_CONSTRAINT;
import static io.ballerina.flowmodelgenerator.core.Constants.MATCH_TARGET_TYPE_CONSTRAINT;

/**
 * Represents a builder for the form of a flow node.
 *
 * @param <T> Parent builder type
 * @since 1.0.0
 */
public class FormBuilder<T> extends FacetedBuilder<T> {

    private Map<String, Property> nodeProperties;
    private final Stack<Map<String, Property>> nodePropertiesStack;
    private final SemanticModel semanticModel;
    private final DiagnosticHandler diagnosticHandler;
    protected Property.Builder<FormBuilder<T>> propertyBuilder;
    private final ModuleInfo moduleInfo;

    public static final Type NODE_PROPERTIES_TYPE = new TypeToken<Map<String, Property>>() { }.getType();

    public FormBuilder(SemanticModel semanticModel, DiagnosticHandler diagnosticHandler,
                       ModuleInfo moduleInfo, T parentBuilder) {
        super(parentBuilder);
        this.nodeProperties = new LinkedHashMap<>();
        this.propertyBuilder = new Property.Builder<>(this);
        this.nodePropertiesStack = new Stack<>();
        this.semanticModel = semanticModel;
        this.diagnosticHandler = diagnosticHandler;
        this.moduleInfo = moduleInfo;
    }

    public FormBuilder<T> data(Node node, Set<String> names) {
        return data(node, false, names);
    }

    public FormBuilder<T> data(Node node, boolean implicit, Set<String> names) {
        return data(node, implicit ? Property.IMPLICIT_VARIABLE_LABEL : Property.VARIABLE_NAME, Property.VARIABLE_DOC,
                NameUtil.generateTypeName("var", names), false);
    }

    public FormBuilder<T> data(Node node, boolean implicit, Set<String> names, boolean assignment) {
        return data(node, implicit ? Property.IMPLICIT_VARIABLE_LABEL : Property.VARIABLE_NAME, Property.VARIABLE_DOC,
                NameUtil.generateTypeName("var", names), assignment);
    }

    public FormBuilder<T> data(String label, String doc, String templateName, boolean optional) {
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .value(templateName)
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut()
                .optional(optional)
                .editable();

        addProperty(Property.VARIABLE_KEY);
        return this;
    }

    public FormBuilder<T> data(Node node, String label, String doc, String templateName, boolean assignment) {
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .value(node == null ? templateName : CommonUtils.getVariableName(node))
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut();

        if (node != null && !assignment) {
            propertyBuilder.codedata()
                    .lineRange(node.lineRange());
        } else {
            propertyBuilder.editable();
        }

        addProperty(Property.VARIABLE_KEY, node);
        return this;
    }

    public FormBuilder<T> data(String typeSignature, Set<String> names, String label) {
        String varName = typeSignature.contains(RemoteActionCallBuilder.TARGET_TYPE_KEY)
                ? NameUtil.generateTypeName("var", names)
                : NameUtil.generateVariableName(typeSignature, names);
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(Property.VARIABLE_DOC)
                    .stepOut()
                .value(varName)
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.VARIABLE_KEY);
        return this;
    }

    public FormBuilder<T> data(String typeSignature, Set<String> names, String label, String doc,
                               boolean isConnection) {
        String varName = typeSignature.contains(RemoteActionCallBuilder.TARGET_TYPE_KEY)
                ? NameUtil.generateTypeName("var", names)
                : isConnection
                ? NameUtil.generateTypeName(NameUtil.toCamelCase(typeSignature), names)
                : NameUtil.generateVariableName(typeSignature, names);
        propertyBuilder
                .metadata()
                .label(label)
                .description(doc)
                .stepOut()
                .value(varName)
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.VARIABLE_KEY);
        return this;
    }

    public FormBuilder<T> type(Node node, boolean editable) {
        return type(node, Property.TYPE_LABEL, editable);
    }

    public FormBuilder<T> type(Node node, boolean editable, boolean modified) {
        String typeName = (node == null) ? "" : CommonUtils.getVariableName(node);
        return type(typeName, Property.TYPE_LABEL, editable, modified, node == null ? null : node.lineRange(), false);
    }

    public FormBuilder<T> type(Node node, String label, boolean editable) {
        String typeName = (node == null) ? "" : CommonUtils.getVariableName(node);
        return type(typeName, label, editable, null, node == null ? null : node.lineRange(), false);
    }

    public FormBuilder<T> type(String typeName, boolean editable, String importStatements, boolean hidden) {
        return type(typeName, Property.TYPE_LABEL, editable, null, null, importStatements, hidden);
    }

    public FormBuilder<T> type(String typeName, boolean editable, String importStatements, boolean hidden,
                               String label) {
        return type(typeName, label, editable, null, null, importStatements, hidden);
    }

    public FormBuilder<T> type(String typeName, String label, boolean editable, Boolean modified, LineRange lineRange,
                               boolean hidden) {
        return type(typeName, label, editable, modified, lineRange, null, hidden);
    }

    public FormBuilder<T> type(String typeName, String label, boolean editable, Boolean modified, LineRange lineRange,
                               String importStatements) {
        return type(typeName, label, editable, modified, lineRange, importStatements, false);
    }

    public FormBuilder<T> type(String typeName, String label, boolean editable, Boolean modified, LineRange lineRange,
                               String importStatements, boolean hidden) {
        String replacedTypeName = TypeParameterReplacer.replaceTypeParameters(typeName);
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(Property.TYPE_DOC)
                    .stepOut()
                .codedata()
                    .stepOut()
                .placeholder("var")
                .value(replacedTypeName)
                .imports(importStatements)
                .hidden(hidden || !replacedTypeName.equals(typeName))
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .selected(true)
                    .stepOut()
                .editable(editable)
                .modified(modified);

        addProperty(Property.TYPE_KEY, lineRange);
        return this;
    }

    public FormBuilder<T> returnType(String value, String typeConstraint, boolean optional) {
        propertyBuilder
                .metadata()
                    .label(Property.RETURN_TYPE_LABEL)
                    .description(Property.RETURN_TYPE_DOC)
                    .stepOut()
                .value(TypeParameterReplacer.replaceTypeParameters(value == null ? "" : value))
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .ballerinaType(typeConstraint)
                    .selected(true)
                    .stepOut()
                .optional(optional)
                .editable();

        addProperty(Property.TYPE_KEY);
        return this;
    }

    public FormBuilder<T> functionDescription(String value) {
        propertyBuilder
                .metadata()
                .label(Property.DESCRIPTION_LABEL)
                .description(Property.DESCRIPTION_TYPE_DOC)
                .stepOut()
                .value(value == null ? "" : value)
                .type()
                    .fieldType(Property.ValueType.DOC_TEXT)
                    .selected(true)
                    .stepOut()
                .optional(true)
                .editable();

        addProperty(Property.FUNCTION_NAME_DESCRIPTION_KEY);
        return this;
    }

    public FormBuilder<T> returnDescription(String value) {
        propertyBuilder
                .metadata()
                .label(Property.RETURN_DESCRIPTION_LABEL)
                .description(Property.RETURN_DESCRIPTION_TYPE_DOC)
                .stepOut()
                .value(value == null ? "" : value)
                .type()
                    .fieldType(Property.ValueType.DOC_TEXT)
                    .selected(true)
                    .stepOut()
                .optional(true)
                .editable();

        addProperty(Property.RETURN_DESCRIPTION_KEY);
        return this;
    }

    public FormBuilder<T> returnType(String value) {
        return returnType(value, null, true);
    }

    public FormBuilder<T> dataVariable(TypedBindingPatternNode node, Set<String> names) {
        return dataVariable(node, false, names);
    }

    public FormBuilder<T> dataVariable(TypedBindingPatternNode node, boolean implicit, Set<String> names) {
        return implicit ?
                dataVariable(node, Property.IMPLICIT_VARIABLE_LABEL, Property.IMPLICIT_TYPE_LABEL, true, names, false)
                : dataVariable(node, Property.VARIABLE_NAME, Property.TYPE_LABEL, true, names, false);
    }

    public FormBuilder<T> dataVariable(TypedBindingPatternNode node, String variableLabel, String typeDoc,
                                       boolean editable, Set<String> names, boolean hidden) {
        return dataVariable(node, variableLabel, typeDoc, Property.VARIABLE_DOC, editable, names, hidden);
    }

    public FormBuilder<T> dataVariable(TypedBindingPatternNode node, String variableLabel, String typeDoc,
                                       String variableDoc, boolean editable, Set<String> names, boolean hidden) {
        data(node == null ? null : node.bindingPattern(), variableLabel, variableDoc,
                NameUtil.generateTypeName("var", names), false);

        String typeName;
        if (node == null) {
            typeName = "";
        } else if (node.typeDescriptor().kind() == SyntaxKind.VAR_TYPE_DESC) {
            typeName = "var";
        } else {
            typeName = CommonUtils.getTypeSymbol(semanticModel, node)
                    .map(typeSymbol -> CommonUtils.getTypeSignature(semanticModel, typeSymbol, true, moduleInfo))
                    .orElse(CommonUtils.getVariableName(node));
        }
        return type(typeName, typeDoc, editable, null, node == null ? null : node.typeDescriptor().lineRange(), hidden);
    }

    public Property.Builder<FormBuilder<T>> custom() {
        return propertyBuilder;
    }

    public FormBuilder<T> payload(TypedBindingPatternNode node, String type) {
        data(node, new HashSet<>());

        propertyBuilder
                .metadata()
                    .label(Property.TYPE_LABEL)
                    .description(Property.TYPE_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .selected(true)
                    .stepOut()
                .editable();

        if (node == null) {
            propertyBuilder.value(type);
        } else {
            Optional<TypeSymbol> optTypeSymbol = CommonUtils.getTypeSymbol(semanticModel, node);
            optTypeSymbol.ifPresent(typeSymbol -> propertyBuilder.value(
                    CommonUtils.getTypeSignature(semanticModel, typeSymbol, true, moduleInfo)));
        }
        addProperty(Property.TYPE_KEY);
        return this;
    }

    public FormBuilder<T> variableName(String name) {
        return variableName(name, true);
    }

    public FormBuilder<T> variableName(String name, boolean editable) {
        return variableName(name, editable, null);
    }

    public FormBuilder<T> variableName(String name, boolean editable, Boolean modified) {
        propertyBuilder
                .metadata()
                .label(Property.VARIABLE_NAME)
                .description(Property.VARIABLE_DOC)
                .stepOut()
                .value(name)
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .scope(Property.GLOBAL_SCOPE)
                    .selected(true)
                    .stepOut()
                .editable(editable)
                .modified(modified);
        addProperty(Property.VARIABLE_KEY);
        return this;
    }

    public FormBuilder<T> patterns(NodeList<? extends Node> node) {
        List<Property> properties = new ArrayList<>();
        for (Node patternNode : node) {
            Property property = propertyBuilder
                    .metadata()
                        .label(Property.PATTERN_LABEL)
                        .description(Property.PATTERN_DOC)
                        .stepOut()
                    .value(patternNode.toSourceCode().strip())
                    .type()
                        .fieldType(Property.ValueType.EXPRESSION)
                        .selected(true)
                        .stepOut()
                    .editable()
                    .build();
            properties.add(property);
        }

        propertyBuilder
                .metadata()
                    .label(Property.PATTERNS_LABEL)
                    .description(Property.PATTERNS_DOC)
                    .stepOut()
                .value(properties)
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.PATTERNS_KEY);

        return this;
    }

    public FormBuilder<T> patterns(MatchClauseNode matchClauseNode, String pattern, CommentProperty commentProperty) {
        List<Property> properties = new ArrayList<>();

        if (!matchClauseNode.matchPatterns().isEmpty()) {
            Property property = propertyBuilder
                    .metadata()
                    .label(Property.PATTERN_LABEL)
                    .description(Property.PATTERN_DOC)
                    .stepOut()
                    .value(pattern)
                    .comment(commentProperty)
                    .type()
                        .fieldType(Property.ValueType.EXPRESSION)
                        .selected(true)
                        .stepOut()
                    .editable()
                    .build();
            properties.add(property);
        }

        propertyBuilder
                .metadata()
                .label(Property.PATTERNS_LABEL)
                .description(Property.PATTERNS_DOC)
                .stepOut()
                .value(properties)
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.PATTERNS_KEY);

        return this;
    }

    public FormBuilder<T> connectionSelector(String placeholder) {
        return connectionSelector(placeholder, null, null);
    }

    public FormBuilder<T> connectionSelector(String placeholder, String searchNodesKind) {
        return connectionSelector(placeholder, searchNodesKind, null);
    }

    public FormBuilder<T> connectionSelector(String placeholder, String searchNodesKind,
                                             List<Metadata.AllowedConnector> connectors) {
        return connectionSelector(Property.CONNECTION_KEY, Property.CONNECTION_LABEL, placeholder,
                searchNodesKind, connectors);
    }

    public FormBuilder<T> connectionSelector(String key, String label, String placeholder, String searchNodesKind,
                                             List<Metadata.AllowedConnector> connectors) {
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(Property.CONNECTION_DOC)
                    .stepOut()
                .value(placeholder)
                .placeholder(placeholder)
                .type()
                    .fieldType(Property.ValueType.CONNECTION)
                    .selected(true)
                    .stepOut()
                .editable();
        if (connectors != null && !connectors.isEmpty()) {
            propertyBuilder.metadata().connectors(connectors);
        }
        if (searchNodesKind != null) {
            propertyBuilder.codedata().searchNodesKind(searchNodesKind);
        }
        addProperty(key);
        return this;
    }

    public FormBuilder<T> callConnection(ExpressionNode expressionNode, String key, Map<String, Object> metadataData) {
        propertyBuilder
                .metadata()
                    .label(Property.CONNECTION_LABEL)
                    .description(Property.CONNECTION_DOC)
                    .data(metadataData)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .hidden()
                .value(expressionNode.toString());
        addProperty(key);
        return this;
    }

    public FormBuilder<T> callExpression(ExpressionNode expressionNode, String key) {
        propertyBuilder
                .metadata()
                    .label(Property.METHOD_EXPRESSION_LABEL)
                    .description(Property.METHOD_EXPRESSION_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .value(expressionNode.toString());
        addProperty(key);
        return this;
    }

    public FormBuilder<T> resourcePath(String path, boolean editable) {
        propertyBuilder
                .metadata()
                    .label(Property.RESOURCE_PATH_LABEL)
                    .description(Property.RESOURCE_PATH_DOC)
                    .stepOut()
                .type(Property.ValueType.ACTION_PATH);
        if (editable) {
            propertyBuilder
                    .codedata()
                        .originalName(ParamUtils.REST_RESOURCE_PATH)
                        .stepOut()
                    .value(path)
                    .editable();
        } else {
            propertyBuilder
                    .codedata()
                        .originalName(path)
                        .stepOut()
                    .hidden()
                    .value(path.replaceAll("\\\\", ""));
        }
        addProperty(Property.RESOURCE_PATH_KEY);
        return this;
    }

    public FormBuilder<T> checkError(boolean checkError) {
        return checkError(checkError, Property.CHECK_ERROR_DOC, true);
    }

    public FormBuilder<T> checkError(boolean checkError, String doc, boolean editable) {
        propertyBuilder
                .metadata()
                    .label(Property.CHECK_ERROR_LABEL)
                    .description(doc)
                    .stepOut()
                .value(checkError)
                .hidden()
                .advanced(true)
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut();
        if (editable) {
            propertyBuilder.editable();
        }
        addProperty(Property.CHECK_ERROR_KEY);
        return this;
    }

    public FormBuilder<T> condition(ExpressionNode expressionNode) {
        propertyBuilder
                .metadata()
                    .label(Property.CONDITION_LABEL)
                    .description(Property.CONDITION_DOC)
                    .stepOut()
                .value(expressionNode == null ? "" : expressionNode.toSourceCode())
                .placeholder("true")
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(CONDITION_TYPE_CONSTRAINT)
                    .selected(expressionNode != null)
                    .stepOut()
                .editable();
        addProperty(Property.CONDITION_KEY, expressionNode);
        return this;
    }

    public void matchTarget(ExpressionNode expressionNode) {
        propertyBuilder
                .metadata()
                    .label(Property.MATCH_TARGET_LABEL)
                    .description(Property.MATCH_TARGET_DOC)
                    .stepOut()
                .value(expressionNode == null ? "" : expressionNode.toSourceCode())
                .placeholder("true")
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(MATCH_TARGET_TYPE_CONSTRAINT)
                    .selected(expressionNode != null)
                    .stepOut()
                .editable();
        addProperty(Property.MATCH_TARGET_KEY, expressionNode);
    }

    public FormBuilder<T> retryCount(int retryCount) {
        return retryCount(retryCount, false);
    }

    public FormBuilder<T> retryCount(int retryCount, boolean optional) {
        propertyBuilder
                .metadata()
                    .label(Property.RETRY_COUNT_LABEL)
                    .description(Property.RETRY_COUNT_DOC)
                    .stepOut()
                .value(String.valueOf(retryCount))
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("int")
                    .selected(true)
                    .stepOut()
                .optional(optional)
                .editable();
        addProperty(Property.RETRY_COUNT_KEY);
        return this;
    }

    public FormBuilder<T> expression(String expr, String expressionDoc) {
        return expression(expr, expressionDoc, false, null);
    }

    public FormBuilder<T> expression(String expr, String expressionDoc, boolean optional, String typeConstraint) {
        propertyBuilder
                .metadata()
                    .label(Property.EXPRESSION_DOC)
                    .description(expressionDoc)
                    .stepOut()
                .value(expr)
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(typeConstraint)
                    .selected(true)
                    .stepOut()
                .optional(optional)
                .editable();
        addProperty(Property.EXPRESSION_KEY);
        return this;
    }

    public FormBuilder<T> expression(ExpressionNode expressionNode, String expressionDoc) {
        propertyBuilder
                .metadata()
                    .label(Property.EXPRESSION_DOC)
                    .description(expressionDoc)
                    .stepOut()
                .value(expressionNode == null ? "" : expressionNode.toSourceCode())
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.EXPRESSION_KEY, expressionNode);
        return this;
    }

    public FormBuilder<T> expression(ExpressionNode expressionNode, String expressionDoc, boolean optional,
                                     String typeConstraint) {
        propertyBuilder
                .metadata()
                    .label(Property.EXPRESSION_DOC)
                    .description(expressionDoc)
                    .stepOut()
                .value(expressionNode == null ? "" : expressionNode.toSourceCode())
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(typeConstraint)
                    .selected(true)
                    .stepOut()
                .optional(optional)
                .editable();
        addProperty(Property.EXPRESSION_KEY, expressionNode);
        return this;
    }

    public FormBuilder<T> expression(ExpressionNode expressionNode, String key, String expressionDoc) {
        propertyBuilder
                .metadata()
                    .label(Property.EXPRESSION_DOC)
                    .description(expressionDoc)
                    .stepOut()
                .value(expressionNode == null ? "" : expressionNode.toSourceCode())
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(key, expressionNode);
        return this;
    }

    public FormBuilder<T> expressionOrAction(ExpressionNode expressionNode, String expressionDoc, boolean optional) {
        propertyBuilder
                .metadata()
                    .label(Property.EXPRESSION_DOC)
                    .description(expressionDoc)
                    .stepOut()
                .value(expressionNode == null ? "" : expressionNode.toSourceCode())
                .type()
                    .fieldType(Property.ValueType.ACTION_OR_EXPRESSION)
                    .selected(true)
                    .stepOut()
                .optional(optional)
                .editable();
        addProperty(Property.EXPRESSION_KEY, expressionNode);
        return this;
    }

    public FormBuilder<T> expression(ExpressionNode expressionNode) {
        return expression(expressionNode, false);
    }

    public FormBuilder<T> expression(ExpressionNode expressionNode, boolean optional) {
        propertyBuilder
                .metadata()
                    .label(Property.EXPRESSION_LABEL)
                    .description(Property.EXPRESSION_DOC)
                    .stepOut()
                .editable()
                .value(expressionNode == null ? "" : expressionNode.toString())
                .optional(optional)
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut();
        addProperty(Property.EXPRESSION_KEY, expressionNode);
        return this;
    }

    public FormBuilder<T> defaultValue(ExpressionNode expr) {
        return defaultValue(expr, true);
    }

    public FormBuilder<T> defaultValue(ExpressionNode expr, boolean editable) {
        propertyBuilder
                .metadata()
                .label(Property.DEFAULT_VALUE_LABEL)
                .description(Property.DEFAULT_VALUE_DOC)
                .stepOut()
                .value((expr != null && expr.kind() != SyntaxKind.REQUIRED_EXPRESSION) ? expr.toSourceCode() : "")
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .optional(true)
                .modified(false)
                .editable(editable);
        addProperty(Property.DEFAULT_VALUE_KEY, expr);
        return this;
    }

    public FormBuilder<T> configValue(ExpressionNode expr) {
        propertyBuilder
                .metadata()
                .label(Property.CONFIG_VALUE_LABEL)
                .description(Property.CONFIG_VALUE_DOC)
                .stepOut()
                .value((expr != null && expr.kind() != SyntaxKind.REQUIRED_EXPRESSION) ? expr.toSourceCode() : "")
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .optional(true)
                .modified(false)
                .hidden()
                .editable();
        addProperty(Property.CONFIG_VALUE_KEY, expr);
        return this;
    }

    public FormBuilder<T> testConfigValue(ExpressionNode expr) {
        propertyBuilder
                .metadata()
                .label(Property.TEST_CONFIG_VALUE_LABEL)
                .description(Property.TEST_CONFIG_VALUE_DOC)
                .stepOut()
                .value((expr != null && expr.kind() != SyntaxKind.REQUIRED_EXPRESSION) ? expr.toSourceCode() : "")
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .optional(true)
                .modified(false)
                .hidden()
                .editable();
        addProperty(Property.TEST_CONFIG_VALUE_KEY, expr);
        return this;
    }

    public FormBuilder<T> documentation(Node docNode) {
        return documentation(docNode, true);
    }

    public FormBuilder<T> documentation(Node docNode, boolean editable) {
        propertyBuilder
                .metadata()
                .label(Property.CONFIG_VAR_DOC_LABEL)
                .description(Property.CONFIG_VAR_DOC_DOC)
                .stepOut()
                .value(concatDocLines(docNode))
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .selected(true)
                    .stepOut()
                .optional(true)
                .editable(editable)
                .modified(false);
        addProperty(Property.CONFIG_VAR_DOC_KEY, docNode);
        return this;
    }

    private static String concatDocLines(Node docNode) {
        StringJoiner docLineJoiner = new StringJoiner(System.lineSeparator());
        if (docNode == null || docNode.kind() != SyntaxKind.MARKDOWN_DOCUMENTATION) {
            return "";
        }

        NodeList<Node> docLineNodes = ((MarkdownDocumentationNode) docNode).documentationLines();
        for (Node docLineNode : docLineNodes) {
            String docLine = docLineNode.toSourceCode().trim();
            docLineJoiner.add(docLine.replaceFirst("# ", ""));
        }

        return docLineJoiner.toString();
    }

    public FormBuilder<T> statement(Node node) {
        propertyBuilder
                .metadata()
                    .label(ExpressionBuilder.STATEMENT_LABEL)
                    .description(ExpressionBuilder.STATEMENT_DOC)
                    .stepOut()
                .value(node == null ? "" : node.toSourceCode().strip())
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(ExpressionBuilder.STATEMENT_KEY, node);
        return this;
    }

    public FormBuilder<T> ignore(boolean ignore) {
        propertyBuilder
                .metadata()
                    .label(Property.IGNORE_LABEL)
                    .description(Property.IGNORE_DOC)
                    .stepOut()
                .value(String.valueOf(ignore))
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.IGNORE_KEY);
        return this;
    }

    public FormBuilder<T> comment(String comment) {
        propertyBuilder
                .metadata()
                    .label(Property.COMMENT_LABEL)
                    .description(Property.COMMENT_DOC)
                    .stepOut()
                .value(comment)
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.COMMENT_KEY);
        return this;
    }

    public FormBuilder<T> onErrorVariable(TypedBindingPatternNode typedBindingPatternNode) {
        propertyBuilder
                .metadata()
                    .label(Property.ON_ERROR_VARIABLE_LABEL)
                    .description(Property.ON_ERROR_VARIABLE_DOC)
                    .stepOut()
                .value(typedBindingPatternNode == null ? "" :
                        typedBindingPatternNode.bindingPattern().toString())
                .placeholder("err")
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.ON_ERROR_VARIABLE_KEY,
                typedBindingPatternNode == null ? null : typedBindingPatternNode.bindingPattern());

        if (typedBindingPatternNode == null) {
            propertyBuilder.value("");
        } else {
            CommonUtils.getTypeSymbol(semanticModel, typedBindingPatternNode)
                    .ifPresent(typeSymbol -> propertyBuilder.value(
                            CommonUtils.getTypeSignature(semanticModel, typeSymbol, false, moduleInfo)));
        }
        propertyBuilder
                .metadata()
                    .label(Property.ON_ERROR_TYPE_LABEL)
                    .description(Property.ON_ERROR_TYPE_DOC)
                    .stepOut()
                .placeholder("error")
                .editable()
                .type()
                        .fieldType(Property.ValueType.TYPE)
                        .selected(true)
                        .stepOut();
        addProperty(Property.ON_ERROR_TYPE_KEY);

        return this;
    }

    public FormBuilder<T> functionName(IdentifierToken identifierToken) {
        return functionName(identifierToken, FunctionDefinitionBuilder.FUNCTION_NAME_DOC);
    }

    public FormBuilder<T> functionName(IdentifierToken identifierToken, String description) {
        String functionName = identifierToken.text() == null ? "" : identifierToken.text();

        propertyBuilder
                .metadata()
                    .label(FunctionDefinitionBuilder.FUNCTION_NAME_LABEL)
                    .description(description)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .scope(Property.GLOBAL_SCOPE)
                    .selected(true)
                    .stepOut()
                .value(functionName);

        if (!functionName.equals(Constants.MAIN_FUNCTION_NAME)) {
            propertyBuilder.codedata()
                    .lineRange(identifierToken.lineRange());
        }

        addProperty(Property.FUNCTION_NAME_KEY);
        return this;
    }

    public FormBuilder<T> annotations(String annotations) {
        propertyBuilder
                .metadata()
                .label(FunctionDefinitionBuilder.ANNOTATIONS_LABEL)
                .description(FunctionDefinitionBuilder.ANNOTATION_DOC)
                .stepOut()
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut()
                .hidden()
                .value(annotations);

        addProperty(Property.ANNOTATIONS_KEY);
        return this;
    }

    public FormBuilder<T> functionNameTemplate(String templatePrefix, Set<String> visibleSymbols) {
        return functionNameTemplate(templatePrefix, visibleSymbols, FunctionDefinitionBuilder.FUNCTION_NAME_LABEL,
                FunctionDefinitionBuilder.FUNCTION_NAME_DOC);
    }

    public FormBuilder<T> functionNameTemplate(String templatePrefix, Set<String> visibleSymbols, String label,
                                               String description) {
        String generatedName = NameUtil.generateTypeName(templatePrefix, visibleSymbols);
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(description)
                    .stepOut()
                .value(generatedName)
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .scope(Property.GLOBAL_SCOPE)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.FUNCTION_NAME_KEY);
        return this;
    }

    public FormBuilder<T> scope(String scope) {
        propertyBuilder
                .metadata()
                    .label(Property.SCOPE_LABEL)
                    .description(Property.SCOPE_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.ENUM)
                    .selected(true)
                    .stepOut()
                .value(scope)
                .hidden()
                .advanced(true)
                .editable();
        addProperty(Property.SCOPE_KEY);
        return this;
    }

    public FormBuilder<T> view(LineRange lineRange) {
        propertyBuilder
                .metadata()
                    .label(DataMapperBuilder.VIEW_LABEL)
                    .description(DataMapperBuilder.VIEW_DOC)
                    .stepOut()
                .value(lineRange)
                .type()
                    .fieldType(Property.ValueType.VIEW)
                    .selected(true)
                    .stepOut();
        addProperty(DataMapperBuilder.VIEW_KEY);
        return this;
    }

    public FormBuilder<T> collection(Node expressionNode) {
        propertyBuilder
                .metadata()
                    .label(Property.COLLECTION_LABEL)
                    .description(Property.COLLECTION_DOC)
                    .stepOut()
                .editable()
                .placeholder("[]")
                .value(expressionNode == null ? "" : expressionNode.kind() == SyntaxKind.CHECK_EXPRESSION ?
                        ((CheckExpressionNode) expressionNode).expression().toString() : expressionNode.toString())
                .type()
                    .fieldType(Property.ValueType.ACTION_OR_EXPRESSION)
                    .ballerinaType(COLLECTION_TYPE_CONSTRAINT)
                    .selected(true)
                    .stepOut();
        addProperty(Property.COLLECTION_KEY, expressionNode);
        return this;
    }

    public FormBuilder<T> name(String value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.TYPE_NAME_LABEL)
                    .description(Property.TYPE_NAME_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(value)
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut();
        addProperty(Property.NAME_KEY);
        return this;
    }

    public FormBuilder<T> description(String value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.TYPE_DESC_LABEL)
                    .description(Property.TYPE_DESC_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(value)
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .selected(true)
                    .stepOut();
        addProperty(Property.DESCRIPTION_KEY);
        return this;
    }

    public FormBuilder<T> isArray(String value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.TYPE_IS_ARRAY_LABEL)
                    .description(Property.TYPE_IS_ARRAY_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(value)
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut();
        addProperty(Property.IS_ARRAY_KEY);
        return this;
    }

    public FormBuilder<T> arraySize(String value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.TYPE_ARRAY_SIZE_LABEL)
                    .description(Property.TYPE_ARRAY_SIZE_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(value)
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .selected(true)
                    .stepOut();
        addProperty(Property.ARRAY_SIZE);
        return this;
    }

    public FormBuilder<T> qualifiers(List<String> value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                .label(Property.TYPE_QUALIFIERS_LABEL)
                .description(Property.TYPE_QUALIFIERS_DOC)
                .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(value)
                .type()
                    .fieldType(Property.ValueType.MULTIPLE_SELECT)
                    .selected(true)
                    .stepOut();
        addProperty(Property.QUALIFIERS_KEY);
        return this;
    }

    public FormBuilder<T> isPublic(boolean value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.IS_PUBLIC_LABEL)
                    .description(Property.IS_PUBLIC_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(String.valueOf(value))
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.IS_PUBLIC_KEY);
        return this;
    }

    public FormBuilder<T> isPrivate(boolean value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                .label(Property.IS_PRIVATE_LABEL)
                .description(Property.IS_PRIVATE_DOC)
                .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(String.valueOf(value))
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.IS_PRIVATE_KEY);
        return this;
    }

    public FormBuilder<T> isIsolated(boolean value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.IS_ISOLATED_LABEL)
                    .description(Property.IS_ISOLATED_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(String.valueOf(value))
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.IS_ISOLATED_KEY);
        return this;
    }

    public FormBuilder<T> isReadOnly(boolean value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.IS_READ_ONLY_LABEL)
                    .description(Property.IS_READ_ONLY_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(String.valueOf(value))
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.IS_READ_ONLY_KEY);
        return this;
    }

    public FormBuilder<T> isDistinct(boolean value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.IS_DISTINCT_LABEL)
                    .description(Property.IS_DISTINCT_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(String.valueOf(value))
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(Property.IS_DISTINCT_KEY);
        return this;
    }

    public FormBuilder<T> networkQualifier(String value, boolean optional, boolean editable, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(Property.NETWORK_QUALIFIER_LABEL)
                    .description(Property.NETWORK_QUALIFIER_DOC)
                    .stepOut()
                .editable(editable)
                .optional(optional)
                .advanced(advanced)
                .value(value)
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(Option.of(List.of("service", "client")))
                    .selected(true)
                    .stepOut();
        addProperty(Property.NETWORK_QUALIFIER_KEY);
        return this;
    }

    public FormBuilder<T> futures(Property template) {
        propertyBuilder
                .metadata()
                    .label(WaitBuilder.FUTURE_LABEL)
                    .description(WaitBuilder.DESCRIPTION)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.REPEATABLE_MAP)
                    .template(template)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(WaitBuilder.FUTURES_KEY);
        return this;
    }

    public FormBuilder<T> futureTemplate() {
        propertyBuilder.
                metadata()
                    .label(WaitBuilder.FUTURE_LABEL)
                    .description(WaitBuilder.FUTURE_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(WaitBuilder.FUTURE_TYPE_BALLERINA_TYPE)
                    .selected(true)
                    .stepOut()
                .editable();
        addProperty(WaitBuilder.FUTURES_KEY);
        return this;
    }

    public FormBuilder<T> parameter(String type, String name, Token token, Property.ValueType valueType,
                                    List<Option> options) {
        propertyBuilder.typeWithOptions(valueType, options);
        return parameter(type, name, token);
    }

    public FormBuilder<T> dataMapperParameter(String type, String name, Property.ValueType valueType,
                                              String fieldType) {
        nestedProperty();
        propertyBuilder
                .metadata()
                    .label(Property.IMPLICIT_TYPE_LABEL)
                    .description(Property.PARAMETER_TYPE_DOC)
                    .stepOut()
                .type(valueType, fieldType)
                .value(type)
                .hidden()
                .editable();
        addProperty(Property.TYPE_KEY);

        // Build the parameter name property
        propertyBuilder
                .metadata()
                    .label(Property.ARGUMENT_LABEL)
                    .description(Property.ARGUMENT_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.LV_EXPRESSION)
                    .selected(true)
                    .stepOut()
                .editable()
                .value(name);
        addProperty(Property.VARIABLE_KEY);

        return endNestedProperty(Property.ValueType.FIXED_PROPERTY, name, Property.PARAMETER_LABEL,
                Property.PARAMETER_DOC);
    }

    public FormBuilder<T> parameter(String type, String name, Token token, Property.ValueType valueType,
                                    String fieldType) {
        propertyBuilder.type(valueType, fieldType);
        return parameter(type, name, token);
    }

    public FormBuilder<T> parameter(String type, String name, Token token) {
        nestedProperty();

        // Build the parameter type property
        propertyBuilder
                .metadata()
                    .label(Property.IMPLICIT_TYPE_LABEL)
                    .description(Property.PARAMETER_TYPE_DOC)
                    .stepOut()
                .value(type)
                .editable();
        addProperty(Property.TYPE_KEY);

        // Build the parameter name property
        propertyBuilder
                .metadata()
                    .label(Property.IMPLICIT_VARIABLE_LABEL)
                    .description(Property.PARAMETER_VARIABLE_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.IDENTIFIER)
                    .selected(true)
                    .stepOut()
                .editable()
                .value(name);

        if (token == null) {
            propertyBuilder.editable();
        } else {
            propertyBuilder.codedata()
                    .lineRange(token.lineRange());
        }

        addProperty(Property.VARIABLE_KEY);

        return endNestedProperty(Property.ValueType.FIXED_PROPERTY, name, Property.PARAMETER_LABEL,
                Property.PARAMETER_DOC);
    }

    public FormBuilder<T> parameterWithDescription(String type, String name, Token token, Property.ValueType valueType,
                                                   String description) {
        nestedProperty();

        // Build the parameter type property
        propertyBuilder
                .metadata()
                .label(Property.IMPLICIT_TYPE_LABEL)
                .description(Property.PARAMETER_TYPE_DOC)
                .stepOut()
                .type(valueType)
                .value(type)
                .editable();
        addProperty(Property.TYPE_KEY);

        // Build the parameter name property
        propertyBuilder
                .metadata()
                .label(Property.IMPLICIT_VARIABLE_LABEL)
                .description(Property.PARAMETER_VARIABLE_DOC)
                .stepOut()
                .type(Property.ValueType.IDENTIFIER)
                .value(name);

        if (token == null) {
            propertyBuilder.editable();
        } else {
            propertyBuilder.codedata()
                    .lineRange(token.lineRange());
        }

        addProperty(Property.VARIABLE_KEY);

        propertyBuilder
                .metadata()
                .label(Property.DESCRIPTION_LABEL)
                .description(Property.PARAMETER_DESCRIPTION_TYPE_DOC)
                .stepOut()
                .type(Property.ValueType.DOC_TEXT)
                .value(description)
                .optional(true)
                .editable();
        addProperty(Property.PARAMETER_DESCRIPTION_KEY);

        return endNestedProperty(Property.ValueType.FIXED_PROPERTY, name, Property.PARAMETER_LABEL,
                Property.PARAMETER_DOC);
    }

    public FormBuilder<T> nestedProperty() {
        Map<String, Property> newProperties = new LinkedHashMap<>();
        nodePropertiesStack.push(nodeProperties);
        nodeProperties = newProperties;
        return this;
    }

    public FormBuilder<T> endNestedProperty(Property.ValueType valueType, String key, String label, String doc,
                                            Property template, boolean optional, boolean advanced) {
        propertyBuilder
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .value(nodeProperties)
                .typeWithTemplate(valueType, template)
                .optional(optional)
                .advanced(advanced);
        if (!nodePropertiesStack.isEmpty()) {
            nodeProperties = nodePropertiesStack.pop();
        }
        addProperty(key);
        return this;
    }

    public FormBuilder<T> endNestedProperty(Property.ValueType valueType, String key, String label, String doc) {
        return endNestedProperty(valueType, key, label, doc, null, false, false);
    }

    public final FormBuilder<T> addProperty(String key, Node node) {
        if (node != null && diagnosticHandler != null) {
            diagnosticHandler.handle(propertyBuilder, node.lineRange(), true);
        }
        Property property = propertyBuilder.build();
        this.nodeProperties.put(key, property);
        return this;
    }

    public final FormBuilder<T> addProperty(String key) {
        return addProperty(key, (Node) null);
    }

    public final FormBuilder<T> addProperty(String key, LineRange lineRange) {
        if (lineRange != null && diagnosticHandler != null) {
            diagnosticHandler.handle(propertyBuilder, lineRange, true);
        }
        Property property = propertyBuilder.build();
        this.nodeProperties.put(key, property);
        return this;
    }

    /**
     * Reserves a slot in the node properties map for the given key so that a subsequent
     * {@code addProperty(key, ...)} call preserves the originally reserved position (LinkedHashMap
     * retains insertion order across put-overwrites of an existing key). No-op if the key is already
     * present.
     *
     * @param key the property key whose source-code position should be locked in
     * @return this builder for fluent chaining
     */
    public final FormBuilder<T> reserveProperty(String key) {
        this.nodeProperties.putIfAbsent(key, new Property.Builder<>(null).build());
        return this;
    }

    /**
     * Removes a previously reserved slot when the caller decides not to emit a real Property under
     * this key — prevents an empty placeholder from leaking into the serialized node properties.
     *
     * @param key the property key to drop
     * @return this builder for fluent chaining
     */
    public final FormBuilder<T> removeProperty(String key) {
        this.nodeProperties.remove(key);
        return this;
    }

    /**
     * Bulk-adds all entries from the given map into the node properties, skipping the operation silently
     * if the map is {@code null}. Existing properties with the same key will be overwritten.
     *
     * @param properties the map of property key to {@link Property} to merge in; may be {@code null}
     * @return this builder for fluent chaining
     */
    public final FormBuilder<T> addProperties(Map<String, Property> properties) {
        if (properties != null) {
            this.nodeProperties.putAll(properties);
        }
        return this;
    }

    public Map<String, Property> build() {
        return this.nodeProperties;
    }
}
