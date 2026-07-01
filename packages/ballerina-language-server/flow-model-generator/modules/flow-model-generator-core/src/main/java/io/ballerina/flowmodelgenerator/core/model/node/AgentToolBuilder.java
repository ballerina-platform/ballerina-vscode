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

package io.ballerina.flowmodelgenerator.core.model.node;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyCodedata;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.AgentsGenerator.TARGET_TYPE;

/**
 * Builds an {@code @ai:AgentTool} wrapper function — a function/connection/resource action exposed as an agent tool.
 *
 * @since 1.0.0
 */
public class AgentToolBuilder extends NodeBuilder {

    public static final String LABEL = "Agent Tool";
    public static final String DESCRIPTION = "Expose a function, action, or connection as an agent tool";

    // codedata.data keys carrying the wrapped node + its connection (the parts that drive the generated body).
    public static final String WRAPPED_NODE_KEY = "node";
    public static final String CONNECTION_KEY = "connection";
    public static final String DESCRIPTION_KEY = "description";

    private static final Gson gson = new Gson();
    private SemanticModel semanticModel;

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata().node(NodeKind.AGENT_TOOL);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        // The tool signature (function name + parameters) is supplied by the caller; the wrapped node / connection
        // ride in codedata.data. A function-shaped template is provided for completeness.
        properties().functionNameTemplate("tool", context.getAllVisibleSymbolNames());
        FunctionDefinitionBuilder.setMandatoryProperties(this, "", "", "");
        FunctionDefinitionBuilder.setOptionalProperties(this);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        FlowNode toolNode = sourceBuilder.flowNode;
        Map<String, Object> data = toolNode.codedata() != null ? toolNode.codedata().data() : null;
        if (data == null || data.get(WRAPPED_NODE_KEY) == null) {
            throw new IllegalStateException("Agent tool node is missing the wrapped node in codedata.data");
        }
        FlowNode wrappedNode = gson.fromJson(gson.toJsonTree(data.get(WRAPPED_NODE_KEY)), FlowNode.class);
        String connection = data.get(CONNECTION_KEY) != null ? data.get(CONNECTION_KEY).toString() : "";
        String description = data.get(DESCRIPTION_KEY) != null ? data.get(DESCRIPTION_KEY).toString() : "";

        String toolName = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY)
                .map(property -> property.value().toString())
                .orElseThrow(() -> new IllegalStateException("Tool name (functionName) is required"));
        Property toolParams = sourceBuilder.getProperty(Property.PARAMETERS_KEY).orElse(null);

        this.semanticModel = sourceBuilder.workspaceManager.semanticModel(sourceBuilder.filePath).orElse(null);
        return buildToolSource(wrappedNode, toolParams, toolName, connection, description, sourceBuilder.filePath,
                sourceBuilder.workspaceManager);
    }

    private Map<Path, List<TextEdit>> buildToolSource(FlowNode flowNode, Property toolParams, String toolName,
                                                      String connectionName, String description, Path filePath,
                                                      WorkspaceManager workspaceManager) {
        NodeKind nodeKind = flowNode.codedata().node();
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath);
        String path = flowNode.metadata().icon();
        sourceBuilder.acceptImport(Constants.Ai.BALLERINA_ORG, Constants.Ai.AI_PACKAGE);
        if (nodeKind == NodeKind.FUNCTION_DEFINITION || nodeKind == NodeKind.FUNCTION_CALL) {
            boolean hasDescription = genDescription(description, sourceBuilder);
            List<String> paramList = populateToolParams(toolParams, hasDescription, sourceBuilder);

            genAgentToolAnnotation(flowNode, sourceBuilder);
            sourceBuilder.token()
                    .name("@display {")
                    .name("label: \"\",")
                    .name("iconPath: \"")
                    .name(path == null ? "" : path)
                    .name("\"}")
                    .name(System.lineSeparator());

            sourceBuilder.token().keyword(SyntaxKind.ISOLATED_KEYWORD).keyword(SyntaxKind.FUNCTION_KEYWORD);
            sourceBuilder.token().name(toolName).keyword(SyntaxKind.OPEN_PAREN_TOKEN);
            sourceBuilder.token().name(String.join(", ", paramList));
            sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);

            Optional<Property> returnType = sourceBuilder.getProperty(Property.TYPE_KEY);
            String returnTypeStr = returnType.isPresent()
                    ? resolveTypeInferParams(returnType.get().value().toString(), flowNode) : "";
            boolean hasReturn = !returnTypeStr.isEmpty();
            boolean hasCheckError = FlowNodeUtil.hasCheckKeyFlagSet(flowNode);
            if (hasReturn) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURNS_KEYWORD)
                        .name(returnTypeStr);
                if (hasCheckError) {
                    sourceBuilder.token().keyword(SyntaxKind.PIPE_TOKEN).keyword(SyntaxKind.ERROR_KEYWORD);
                }
            } else if (hasCheckError) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURNS_KEYWORD)
                        .name("error?");
            }

            return buildToolBody(sourceBuilder, flowNode, nodeKind, returnTypeStr, connectionName,
                    paramList, filePath, workspaceManager);
        } else if (nodeKind == NodeKind.REMOTE_ACTION_CALL) {
            boolean hasDescription = genDescription(description, sourceBuilder);

            List<String> paramList = populateToolParams(toolParams, hasDescription, sourceBuilder);

            Optional<Property> optReturnType = sourceBuilder.getProperty(Property.TYPE_KEY);
            String returnType = "";
            if (optReturnType.isPresent()) {
                Property returnProperty = optReturnType.get();
                returnType = resolveReturnType(flowNode, returnProperty, sourceBuilder);
                sourceBuilder.token().returnDoc(returnProperty.metadata().description());
            }

            genAgentToolAnnotation(flowNode, sourceBuilder);
            sourceBuilder.token()
                    .name("@display {")
                    .name("label: \"\",")
                    .name("iconPath: \"")
                    .name(path == null ? "" : path)
                    .name("\"}")
                    .name(System.lineSeparator());

            sourceBuilder.token().keyword(SyntaxKind.ISOLATED_KEYWORD).keyword(SyntaxKind.FUNCTION_KEYWORD);
            sourceBuilder.token().name(toolName).keyword(SyntaxKind.OPEN_PAREN_TOKEN);
            sourceBuilder.token().name(String.join(", ", paramList));
            sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);

            if (!returnType.isEmpty()) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURNS_KEYWORD)
                        .name(returnType);
                if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
                    sourceBuilder.token().keyword(SyntaxKind.PIPE_TOKEN).keyword(SyntaxKind.ERROR_KEYWORD);
                }
            } else if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURNS_KEYWORD)
                        .name("error?");
            }

            return buildToolBody(sourceBuilder, flowNode, nodeKind, returnType, connectionName,
                    paramList, filePath, workspaceManager);
        } else if (nodeKind == NodeKind.RESOURCE_ACTION_CALL) {
            boolean hasDescription = genDescription(description, sourceBuilder);

            List<String> paramList = populateToolParams(toolParams, hasDescription, sourceBuilder);
            genAgentToolAnnotation(flowNode, sourceBuilder);
            sourceBuilder.token()
                    .name("@display {")
                    .name("label: \"\",")
                    .name("iconPath: \"")
                    .name(path == null ? "" : path)
                    .name("\"}")
                    .name(System.lineSeparator());

            sourceBuilder.token().keyword(SyntaxKind.ISOLATED_KEYWORD).keyword(SyntaxKind.FUNCTION_KEYWORD);
            sourceBuilder.token().name(toolName).keyword(SyntaxKind.OPEN_PAREN_TOKEN);
            sourceBuilder.token().name(String.join(", ", paramList));
            sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);

            Optional<Property> optReturnType = sourceBuilder.getProperty(Property.TYPE_KEY);
            String returnType = "";
            if (optReturnType.isPresent()) {
                returnType = resolveReturnType(flowNode, optReturnType.get(), sourceBuilder);
            }

            if (!returnType.isEmpty()) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURNS_KEYWORD)
                        .name(returnType);
                if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
                    sourceBuilder.token().keyword(SyntaxKind.PIPE_TOKEN).keyword(SyntaxKind.ERROR_KEYWORD);
                }
            } else if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURNS_KEYWORD)
                        .name("error?");
            }

            return buildToolBody(sourceBuilder, flowNode, nodeKind, returnType, connectionName,
                    paramList, filePath, workspaceManager);
        }
        throw new IllegalStateException("Unsupported node kind to generate tool");
    }

    private Map<Path, List<TextEdit>> buildToolBody(SourceBuilder sourceBuilder, FlowNode flowNode,
                                                    NodeKind nodeKind, String returnType, String connectionName,
                                                    List<String> paramList, Path filePath,
                                                    WorkspaceManager workspaceManager) {
        boolean hasReturn = !returnType.isEmpty();
        boolean hasCheckError = FlowNodeUtil.hasCheckKeyFlagSet(flowNode);
        if (nodeKind == NodeKind.FUNCTION_DEFINITION || nodeKind == NodeKind.FUNCTION_CALL) {
            sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
            if (hasReturn) {
                sourceBuilder.token()
                        .name(returnType)
                        .whiteSpace()
                        .name("result")
                        .whiteSpace()
                        .keyword(SyntaxKind.EQUAL_TOKEN);
            }
            if (hasCheckError) {
                sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
            }
            Optional<Property> optFuncName = flowNode.getProperty(Property.FUNCTION_NAME_KEY);
            String funcName;
            if (optFuncName.isPresent()) {
                funcName = optFuncName.get().value().toString();
            } else if (flowNode.codedata().symbol() != null) {
                funcName = flowNode.codedata().symbol();
            } else {
                throw new IllegalStateException("Function name is not present");
            }
            if (nodeKind == NodeKind.FUNCTION_CALL) {
                String module = flowNode.codedata().module();
                if (module != null) {
                    funcName = flowNode.codedata().getModulePrefix() + ":" + funcName;
                }
            }

            // Build a lookup of tool input variable names keyed by parameter name
            Map<String, String> toolInputVarNames = new LinkedHashMap<>();
            Optional<Property> funcCallArgs = flowNode.getProperty(Property.PARAMETERS_KEY);
            if (funcCallArgs.isPresent() && funcCallArgs.get().value() instanceof Map<?, ?> paramMap) {
                for (Map.Entry<?, ?> paramEntry : paramMap.entrySet()) {
                    Property paramProperty = gson.fromJson(gson.toJsonTree(paramEntry.getValue()),
                            Property.class);
                    if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                        continue;
                    }
                    Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                            FormBuilder.NODE_PROPERTIES_TYPE);
                    toolInputVarNames.put(paramEntry.getKey().toString(),
                            paramProperties.get(Property.VARIABLE_KEY).value().toString());
                }
            }

            List<String> args = new ArrayList<>();
            if (nodeKind == NodeKind.FUNCTION_CALL && flowNode.properties() != null) {
                // FUNCTION_CALL: iterate properties in order to preserve argument position.
                // Only include properties that are actual function call arguments (have a
                // codedata.kind like REQUIRED or DEFAULTABLE), not metadata properties.
                for (Map.Entry<String, Property> entry : flowNode.properties().entrySet()) {
                    String key = entry.getKey();
                    Property prop = entry.getValue();
                    PropertyCodedata propCodedata = prop.codedata();
                    if (propCodedata == null || propCodedata.kind() == null
                            || propCodedata.kind().equals(
                            ParameterData.Kind.PARAM_FOR_TYPE_INFER.name())) {
                        continue;
                    }

                    String toolInputVar = toolInputVarNames.get(key);
                    if (toolInputVar != null) {
                        // Has a tool input — use mapping override if set, otherwise the variable name
                        if (prop.value() instanceof List<?> valueList) {
                            List<String> listArgs = extractListArgs(valueList);
                            if (!listArgs.isEmpty()) {
                                args.addAll(listArgs);
                            } else {
                                args.add(toolInputVar);
                            }
                        } else if (prop.value() != null && !prop.value().toString().isEmpty()
                                && !prop.value().toString().equals(toolInputVar)) {
                            args.add(prop.value().toString());
                        } else {
                            args.add(toolInputVar);
                        }
                    } else if (prop.value() instanceof List<?> valueList) {
                        List<String> listArgs = extractListArgs(valueList);
                        args.addAll(listArgs);
                    } else if (prop.value() != null && !prop.value().toString().isEmpty()) {
                        // No tool input — use the mapping expression directly
                        args.add(prop.value().toString());
                    }
                }
            } else {
                // FUNCTION_DEFINITION: arguments come only from the parameters map
                for (String varName : toolInputVarNames.values()) {
                    args.add(varName);
                }
            }

            sourceBuilder.token()
                    .name(funcName)
                    .keyword(SyntaxKind.OPEN_PAREN_TOKEN);
            sourceBuilder.token()
                    .name(String.join(", ", args))
                    .keyword(SyntaxKind.CLOSE_PAREN_TOKEN).endOfStatement();

            if (hasReturn) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURN_KEYWORD)
                        .name("result")
                        .endOfStatement();
            }

            sourceBuilder.token()
                    .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
            sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION).acceptImport();
            Map<Path, List<TextEdit>> textEdits = sourceBuilder.build();
            List<TextEdit> te = new ArrayList<>();
            Path p = addIsolateKeyword(funcName.trim(), filePath, te, workspaceManager);
            if (p != null) {
                textEdits.put(p, te);
            }
            return textEdits;
        } else if (nodeKind == NodeKind.REMOTE_ACTION_CALL) {
            Set<String> ignoredKeys = new HashSet<>(List.of(Property.VARIABLE_KEY, Property.TYPE_KEY, TARGET_TYPE,
                    Property.CONNECTION_KEY, Property.CHECK_ERROR_KEY));
            sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);

            if (!returnType.isEmpty()) {
                sourceBuilder.token().expressionWithType(returnType,
                        flowNode.getProperty(Property.VARIABLE_KEY).orElseThrow()).keyword(SyntaxKind.EQUAL_TOKEN);
            }
            if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
                sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
            }
            sourceBuilder.token()
                    .name(connectionName)
                    .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                    .name(flowNode.metadata().label())
                    .stepOut()
                    .functionParameters(flowNode, ignoredKeys);

            if (!returnType.isEmpty()) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURN_KEYWORD)
                        .name(flowNode.getProperty(Property.VARIABLE_KEY).get().value().toString())
                        .endOfStatement();
            }
            sourceBuilder.token()
                    .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
            sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
            if (needsModuleImport(flowNode, returnType, paramList)) {
                sourceBuilder.acceptImport();
            }
            return sourceBuilder.build();
        } else if (nodeKind == NodeKind.RESOURCE_ACTION_CALL) {
            Map<String, Property> properties = flowNode.properties();
            Set<String> keys = new LinkedHashSet<>(properties != null ? properties.keySet() : Set.of());
            Set<String> ignoredKeys = new HashSet<>(List.of(Property.CONNECTION_KEY, Property.VARIABLE_KEY,
                    Property.TYPE_KEY, TARGET_TYPE, Property.RESOURCE_PATH_KEY, Property.CHECK_ERROR_KEY));
            keys.removeAll(ignoredKeys);
            Set<String> pathParams = new HashSet<>();
            for (String k : keys) {
                Property property = properties.get(k);
                if (property == null) {
                    continue;
                }
                String key = k;
                if (k.startsWith("$")) {
                    key = "'" + k.substring(1);
                }
                PropertyCodedata codedata = property.codedata();
                if (codedata != null) {
                    String kind = codedata.kind();
                    if (kind.equals(ParameterData.Kind.PATH_PARAM.name()) ||
                            kind.equals(ParameterData.Kind.PATH_REST_PARAM.name())) {
                        pathParams.add(key);
                    }
                }
            }
            sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);

            if (!returnType.isEmpty()) {
                sourceBuilder.token().expressionWithType(returnType,
                        flowNode.getProperty(Property.VARIABLE_KEY).orElseThrow()).keyword(SyntaxKind.EQUAL_TOKEN);
            }
            if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
                sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
            }

            String resourcePath = flowNode.properties().get(Property.RESOURCE_PATH_KEY)
                    .codedata().originalName();

            if (resourcePath.equals(ParamUtils.REST_RESOURCE_PATH)) {
                resourcePath = flowNode.properties().get(Property.RESOURCE_PATH_KEY).value().toString();
            }

            for (String key : pathParams) {
                Optional<Property> property = flowNode.getProperty(key);
                if (property.isEmpty()) {
                    continue;
                }
                PropertyCodedata propCodedata = property.get()
                        .codedata();
                if (propCodedata == null) {
                    continue;
                }
                if (propCodedata.kind().equals(ParameterData.Kind.PATH_REST_PARAM.name())) {
                    String replacement = property.get().value().toString();
                    resourcePath = resourcePath.replace(ParamUtils.REST_PARAM_PATH, replacement);
                }
            }
            ignoredKeys.addAll(pathParams);

            sourceBuilder.token()
                    .name(connectionName)
                    .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                    .resourcePath(resourcePath)
                    .keyword(SyntaxKind.DOT_TOKEN)
                    .name(sourceBuilder.flowNode.codedata().symbol())
                    .stepOut()
                    .functionParameters(flowNode, ignoredKeys);

            if (!returnType.isEmpty()) {
                sourceBuilder.token()
                        .keyword(SyntaxKind.RETURN_KEYWORD)
                        .name(flowNode.getProperty(Property.VARIABLE_KEY).get().value().toString())
                        .endOfStatement();
            }
            sourceBuilder.token()
                    .keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
            sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
            if (needsModuleImport(flowNode, returnType, paramList)) {
                sourceBuilder.acceptImport();
            }
            return sourceBuilder.build();
        }
        throw new IllegalStateException("Unsupported node kind to generate tool");
    }

    private List<String> populateToolParams(Property toolParams, boolean hasDescription,
                                            SourceBuilder sourceBuilder) {
        List<String> paramList = new ArrayList<>();
        if (toolParams == null || toolParams.value() == null) {
            return paramList;
        }
        if (toolParams.value() instanceof Map<?, ?> paramMap) {
            for (Object obj : paramMap.values()) {
                Property paramProperty = gson.fromJson(gson.toJsonTree(obj), Property.class);
                if (!(paramProperty.value() instanceof Map<?, ?> paramData)) {
                    continue;
                }
                Map<String, Property> paramProperties = gson.fromJson(gson.toJsonTree(paramData),
                        FormBuilder.NODE_PROPERTIES_TYPE);

                String paramType = paramProperties.get(Property.TYPE_KEY).value().toString();
                String paramName = paramProperties.get(Property.VARIABLE_KEY).value().toString();
                Property property = paramProperties.get(Property.PARAMETER_DESCRIPTION_KEY);
                paramList.add(paramType + " " + paramName);
                if (hasDescription && property != null) {
                    sourceBuilder.token().parameterDoc(paramName, property.value().toString());
                }
            }
        }
        return paramList;
    }

    private boolean needsModuleImport(FlowNode flowNode, String returnType, List<String> paramList) {
        String modulePrefix = flowNode.codedata().getModulePrefix() + ":";
        if (returnType.contains(modulePrefix)) {
            return true;
        }
        for (String param : paramList) {
            if (param.contains(modulePrefix)) {
                return true;
            }
        }
        return false;
    }

    private String resolveTypeInferParams(String returnType, FlowNode flowNode) {
        if (flowNode.properties() == null) {
            return returnType;
        }
        for (Map.Entry<String, Property> entry : flowNode.properties().entrySet()) {
            PropertyCodedata propCodedata = entry.getValue()
                    .codedata();
            if (propCodedata != null
                    && ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(propCodedata.kind())) {
                String paramName = entry.getKey();
                // Use user-provided value if set, otherwise fall back to defaultValue
                String resolvedType = null;
                Object value = entry.getValue().value();
                if (value != null && !value.toString().isEmpty()) {
                    resolvedType = value.toString();
                } else {
                    resolvedType = entry.getValue().defaultValue();
                }
                if (resolvedType == null || resolvedType.isEmpty()) {
                    resolvedType = "json";
                }
                returnType = returnType.replace(paramName, resolvedType);
            }
        }
        return returnType;
    }

    private String resolveReturnType(FlowNode flowNode, Property returnProperty, SourceBuilder sourceBuilder) {
        if (flowNode.codedata().inferredReturnType() != null && hasRecordFieldSelector(flowNode)) {
            Optional<Property> variable = flowNode.getProperty(Property.VARIABLE_KEY);
            if (variable.isPresent()) {
                // Ensure the variable name produces a unique type name by checking types.bal
                Property varProp = variable.get();
                Path typesFilePath = sourceBuilder.filePath.resolveSibling("types.bal");
                Document typesDoc = FileSystemUtils.getDocument(
                        sourceBuilder.workspaceManager, typesFilePath);
                if (typesDoc != null) {
                    ModulePartNode typesRoot = typesDoc.syntaxTree().rootNode();
                    Set<String> existingTypeNames = typesRoot.members().stream()
                            .filter(m -> m.kind() == SyntaxKind.TYPE_DEFINITION)
                            .map(m -> ((TypeDefinitionNode) m).typeName().text())
                            .collect(Collectors.toSet());
                    String varName = varProp.toSourceCode();
                    String candidateTypeName = varName.substring(0, 1).toUpperCase(Locale.ROOT)
                            + varName.substring(1) + "Type";
                    if (existingTypeNames.contains(candidateTypeName)) {
                        // Strip trailing digits to get the base prefix (e.g. "var1" -> "var"),
                        // matching how the LS generates unique variable names (var, var1, var2...)
                        String baseVarName = varName.replaceAll("\\d+$", "");
                        // Convert type names to their variable form for collision checking
                        Set<String> usedVarNames = new HashSet<>();
                        // Include the base name so numbering starts from 1 (var1, var2...)
                        usedVarNames.add(baseVarName);
                        for (String typeName : existingTypeNames) {
                            if (typeName.endsWith("Type") && typeName.length() > 4) {
                                String prefix = typeName.substring(0, typeName.length() - 4);
                                usedVarNames.add(prefix.substring(0, 1).toLowerCase(Locale.ROOT) + prefix.substring(1));
                            }
                        }
                        String uniqueVarName = NameUtil.generateTypeName(baseVarName, usedVarNames);
                        varProp = new Property.Builder<>(null).value(uniqueVarName).build();
                    }
                }
                return sourceBuilder.getTypeNameForInferredParam(varProp,
                        returnProperty.value().toString());
            }
        }
        Optional<Property> optTargetType = flowNode.getProperty(TARGET_TYPE);
        String returnType;
        if (optTargetType.isPresent() && optTargetType.get().value() != null
                && !optTargetType.get().value().toString().isEmpty()) {
            returnType = optTargetType.get().value().toString();
        } else if (optTargetType.isPresent()) {
            String defaultType = optTargetType.get().defaultValue();
            returnType = (defaultType != null && !defaultType.isEmpty()) ? defaultType : "json";
        } else {
            returnType = returnProperty.value().toString();
        }
        return resolveTypeInferParams(returnType, flowNode);
    }

    private boolean genDescription(String description, SourceBuilder sourceBuilder) {
        boolean hasDescription = !description.isEmpty();
        if (hasDescription) {
            sourceBuilder.token().descriptionDoc(description);
        }
        return hasDescription;
    }

    private static List<String> extractListArgs(List<?> valueList) {
        return valueList.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .map(val -> Property.convertToProperty(val).toSourceCode())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    // TODO: The agent tool annotation form is currently in the extension side, need to move to LS
    private void genAgentToolAnnotation(FlowNode flowNode, SourceBuilder sourceBuilder) {
        Map<String, Object> data = flowNode.codedata().data();
        if (data == null || !data.containsKey("auth")) {
            sourceBuilder.token()
                    .name("@ai:AgentTool")
                    .name(System.lineSeparator());
            return;
        }

        String authStr = data.get("auth").toString();
        JsonObject authConfig = gson.fromJson(authStr, JsonObject.class);

        StringBuilder sb = new StringBuilder();
        sb.append("@ai:AgentTool {").append(System.lineSeparator());
        sb.append("    auth: {").append(System.lineSeparator());

        List<String> fields = new ArrayList<>();
        for (Map.Entry<String, JsonElement> entry : authConfig.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue().getAsString();

            // Skip fields with empty or default values
            if (value == null || value.isEmpty() || value.equals("()") || value.trim().matches("\\{\\s*}")) {
                continue;
            }

            if (key.equals("scopes")) {
                String[] scopeParts = value.split(",");
                List<String> scopeItems = new ArrayList<>();
                for (String part : scopeParts) {
                    String trimmed = part.trim();
                    if (!trimmed.isEmpty()) {
                        scopeItems.add(trimmed);
                    }
                }
                if (scopeItems.isEmpty()) {
                    continue;
                }
                fields.add("        " + key + ": [" + String.join(", ", scopeItems) + "]");
            } else {
                fields.add("        " + key + ": " + value);
            }
        }

        if (fields.isEmpty()) {
            sourceBuilder.token()
                    .name("@ai:AgentTool")
                    .name(System.lineSeparator());
            return;
        }

        sb.append(String.join("," + System.lineSeparator(), fields)).append(System.lineSeparator());
        sb.append("    }").append(System.lineSeparator());
        sb.append("}");

        sourceBuilder.token()
                .name(sb.toString())
                .name(System.lineSeparator());
    }

    private Path addIsolateKeyword(String name, Path filePath, List<TextEdit> textEdits,
                                   WorkspaceManager workspaceManager) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.FUNCTION) {
                continue;
            }
            FunctionSymbol functionSymbol = (FunctionSymbol) symbol;
            if (!functionSymbol.getName().orElseThrow().equals(name)) {
                continue;
            }
            Path parent = filePath.getParent();
            Location location = functionSymbol.getLocation().orElseThrow();
            LineRange lineRange = location.lineRange();
            if (parent == null) {
                break;
            }
            Path functionFile = parent.resolve(lineRange.fileName());
            Optional<Document> optDocument = workspaceManager.document(functionFile);
            if (optDocument.isEmpty()) {
                break;
            }
            Document document = optDocument.get();
            Optional<NonTerminalNode> optNode = CommonUtil.findNode(functionSymbol, document.syntaxTree());
            if (optNode.isEmpty()) {
                break;
            }
            NonTerminalNode node = optNode.get();
            if (node.kind() != SyntaxKind.FUNCTION_DEFINITION) {
                break;
            }
            FunctionDefinitionNode functionDefinitionNode = (FunctionDefinitionNode) node;
            boolean isIsolated = false;
            for (Token token : functionDefinitionNode.qualifierList()) {
                if (token.text().trim().equals("isolated")) {
                    isIsolated = true;
                }
            }

            if (isIsolated) {
                break;
            }
            LinePosition startLine = lineRange.startLine();
            int offset = startLine.offset() - SyntaxKind.FUNCTION_KEYWORD.stringValue().length() - 1;
            int line = startLine.line();
            Position position = new Position(line, offset);
            textEdits.add(new TextEdit(new Range(position, position), "isolated "));
            return functionFile;
        }
        return null;
    }

    private boolean hasRecordFieldSelector(FlowNode flowNode) {
        if (flowNode.properties() == null) {
            return false;
        }
        return flowNode.properties().values().stream()
                .anyMatch(p -> p.codedata() != null
                        && ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(p.codedata().kind())
                        && p.types() != null && !p.types().isEmpty()
                        && p.types().getFirst().recordSelectorType() != null);
    }
}
