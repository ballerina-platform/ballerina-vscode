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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyCodedata;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ActivityBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.ParamUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Range;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Generates {@code @workflow:Activity} functions that wrap a connection action call. The connection is
 * a module-level global variable (created via the connection wizard) referenced by name in the activity
 * body; it is not a parameter of the activity function. Mirrors {@link AgentsGenerator#genTool}, which
 * generates agent tools closing over the module-level connection in the same way.
 *
 * @since 1.5.0
 */
public class ActivityGenerator {

    // Short, conventional name for the result variable inside the generated activity body.
    private static final String RESULT_VARIABLE = "result";
    // Name of the intermediate stream variable when the action's stream return is collected.
    private static final String STREAM_VARIABLE = "streamResult";
    // Name of the connection parameter when the connection is exposed on the activity signature.
    private static final String CONNECTION_PARAM_NAME = "connection";
    private static final String CONNECTION_PARAM_DOC = "Connection to invoke the action on";
    // Fallback databinding type when the action's return type is ambiguous (see normalizeReturnType).
    private static final String DEFAULT_RETURN_TYPE = "json";
    private static final String ERROR_UNION_SUFFIX = "|error";
    // Name of the typedesc parameter used for return-type inference on connector actions.
    private static final String TARGET_TYPE = "targetType";
    // Activities are always generated in functions.bal (created if absent) so that the imports the
    // activity may need — e.g. an http:Client parameter when the connection is exposed — are added to
    // that file and never shift the workflow's own line positions in the workflow file.
    private static final String FUNCTIONS_BAL = "functions.bal";

    private final Gson gson;
    private final SemanticModel semanticModel;

    public ActivityGenerator(SemanticModel semanticModel) {
        this.gson = new Gson();
        this.semanticModel = semanticModel;
    }

    /**
     * Generates an activity function wrapping the given connection action call.
     *
     * @param node               the action call flow node (REMOTE_ACTION_CALL or RESOURCE_ACTION_CALL template
     *                           with the argument values set)
     * @param activityName       name of the activity function to generate
     * @param activityParameters activity function parameters property node (REPEATABLE_PROPERTY)
     * @param connectionName     name of the module-level connection variable the action was selected from;
     *                           referenced by name in the generated activity body
     * @param description        description of the activity (emitted as the doc comment)
     * @param streamElementType  when the action returns a stream, its element type {@code T}: the
     *                           body collects the stream and returns {@code T[]}; else null
     * @param connectionAsParam  when {@code true}, the connection is exposed as the activity's first
     *                           parameter (built-in activity style) instead of closing over the
     *                           module-level connection
     * @param filePath           path of the file to add the activity function to
     * @param workspaceManager   the workspace manager
     * @return the text edits to apply
     */
    public JsonElement genActivity(JsonElement node, String activityName, JsonElement activityParameters,
                                   String connectionName, String description,
                                   String streamElementType, boolean connectionAsParam,
                                   Path filePath, WorkspaceManager workspaceManager) {
        FlowNode flowNode = gson.fromJson(node, FlowNode.class);
        Property activityParams = gson.fromJson(activityParameters, Property.class);
        NodeKind nodeKind = flowNode.codedata().node();
        if (nodeKind != NodeKind.REMOTE_ACTION_CALL && nodeKind != NodeKind.RESOURCE_ACTION_CALL) {
            throw new IllegalStateException("Unsupported node kind to generate an activity: " + nodeKind);
        }

        // Generate the activity in functions.bal (created if absent) instead of the caller's file, so the
        // activity — and any import it pulls in, e.g. an http:Client parameter — never shifts the
        // workflow's own line positions. The connection is a module-level global, visible across files.
        Path activityFilePath = workspaceManager.projectRoot(filePath).resolve(FUNCTIONS_BAL);
        FileSystemUtils.getDocument(workspaceManager, activityFilePath);
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, activityFilePath);
        sourceBuilder.acceptImport(Constants.Workflow.WORKFLOW_ORG, Constants.Workflow.WORKFLOW_MODULE);

        // Property-level imports describe the ORIGINAL action's types (io/mime/... editors), which the
        // derived data-only signature mostly never references — yet SourceBuilder.getProperty() adds
        // them to the emitted imports as a side effect, producing unused imports. Detach them here and
        // add back (below) only the ones whose prefix actually appears in the generated signature.
        Map<String, String> detachedPropertyImports = detachPropertyImports(flowNode);

        Set<String> ignoredKeys = new HashSet<>(List.of(Property.VARIABLE_KEY, Property.TYPE_KEY,
                TARGET_TYPE, Property.CONNECTION_KEY, Property.CHECK_ERROR_KEY));
        Set<String> pathParams = Set.of();
        if (nodeKind == NodeKind.RESOURCE_ACTION_CALL) {
            ignoredKeys.add(Property.RESOURCE_PATH_KEY);
            pathParams = collectPathParams(flowNode, ignoredKeys);
        }

        // The connection is a module-level global referenced by name in the body (not a parameter);
        // validate it exists so a stale/deleted connection surfaces a clear error.
        validateConnectionExists(connectionName);

        // Documentation: description, connection parameter (when exposed), activity inputs, return value
        boolean hasDescription = genDescription(description, sourceBuilder);
        List<String> paramList = new ArrayList<>();
        if (connectionAsParam) {
            if (hasDescription) {
                sourceBuilder.token().parameterDoc(CONNECTION_PARAM_NAME, CONNECTION_PARAM_DOC);
            }
            paramList.add(resolveConnectionType(connectionName) + " " + CONNECTION_PARAM_NAME);
        }
        paramList.addAll(populateActivityParams(activityParams, hasDescription, sourceBuilder));

        Optional<Property> optReturnType = sourceBuilder.getProperty(Property.TYPE_KEY);
        String returnType = "";
        if (optReturnType.isPresent()) {
            Property returnProperty = optReturnType.get();
            returnType = normalizeReturnType(
                    resolveReturnType(flowNode, returnProperty, sourceBuilder));
            if (hasDescription) {
                sourceBuilder.token().returnDoc(returnProperty.metadata().description());
            }
        }
        boolean hasCheckError = FlowNodeUtil.hasCheckKeyFlagSet(flowNode);

        // Annotation and signature
        String icon = flowNode.metadata().icon();
        sourceBuilder.token()
                .name(ActivityBuilder.ACTIVITY_ANNOTATION)
                .name(System.lineSeparator())
                .name("@display {label: \"")
                .name(activityName == null ? "" : activityName)
                .name("\", iconPath: \"")
                .name(icon == null ? "" : icon)
                .name("\"}")
                .name(System.lineSeparator());
        sourceBuilder.token().keyword(SyntaxKind.ISOLATED_KEYWORD).keyword(SyntaxKind.FUNCTION_KEYWORD);
        sourceBuilder.token().name(activityName).keyword(SyntaxKind.OPEN_PAREN_TOKEN);
        sourceBuilder.token().name(String.join(", ", paramList));
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);

        if (!returnType.isEmpty()) {
            sourceBuilder.token().keyword(SyntaxKind.RETURNS_KEYWORD).name(returnType);
            if (hasCheckError) {
                sourceBuilder.token().keyword(SyntaxKind.PIPE_TOKEN).keyword(SyntaxKind.ERROR_KEYWORD);
            }
        } else if (hasCheckError) {
            sourceBuilder.token().keyword(SyntaxKind.RETURNS_KEYWORD).name("error?");
        }

        // Body: invoke the action on the module-level connection. Use a short, fixed result variable
        // name ("result") since it is local to the generated function body. When the action returns a
        // stream, the stream is collected into an array of its element type after the call.
        boolean collectStream = streamElementType != null && !streamElementType.isBlank();
        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        if (collectStream) {
            sourceBuilder.token()
                    .name("var")
                    .whiteSpace()
                    .name(STREAM_VARIABLE)
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN);
        } else if (!returnType.isEmpty()) {
            sourceBuilder.token()
                    .name(returnType)
                    .whiteSpace()
                    .name(RESULT_VARIABLE)
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN);
        }
        if (hasCheckError) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        String callTarget = connectionAsParam ? CONNECTION_PARAM_NAME : connectionName;
        if (nodeKind == NodeKind.REMOTE_ACTION_CALL) {
            sourceBuilder.token()
                    .name(callTarget)
                    .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                    .name(flowNode.metadata().label())
                    .stepOut()
                    .functionParameters(flowNode, ignoredKeys);
        } else {
            String resourcePath = resolveResourcePath(flowNode, pathParams);
            ignoredKeys.addAll(pathParams);
            sourceBuilder.token()
                    .name(callTarget)
                    .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                    .resourcePath(resourcePath)
                    .keyword(SyntaxKind.DOT_TOKEN)
                    .name(flowNode.codedata().symbol())
                    .stepOut()
                    .functionParameters(flowNode, ignoredKeys);
        }

        if (collectStream) {
            // <T>[] result = check from var item in streamResult select item; return result;
            // (compound element types are parenthesized: (byte[] & readonly)[])
            sourceBuilder.token()
                    .name(ActionSignatureAnalyzer.arrayOf(streamElementType))
                    .whiteSpace()
                    .name(RESULT_VARIABLE)
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN)
                    .keyword(SyntaxKind.CHECK_KEYWORD)
                    .name("from var item in " + STREAM_VARIABLE + " select item")
                    .endOfStatement()
                    .keyword(SyntaxKind.RETURN_KEYWORD)
                    .name(RESULT_VARIABLE)
                    .endOfStatement();
        } else if (!returnType.isEmpty()) {
            sourceBuilder.token()
                    .keyword(SyntaxKind.RETURN_KEYWORD)
                    .name(RESULT_VARIABLE)
                    .endOfStatement();
        }
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_BRACE_TOKEN);
        // Append the activity function at the end of the target file (after imports/existing
        // declarations) rather than at the action-call site — the flow node's line range points at
        // the selected action, which for a freshly picked action is line 0 (before the imports).
        Document targetDoc = FileSystemUtils.getDocument(workspaceManager, sourceBuilder.filePath);
        Range endOfFile = CommonUtils.toRange(targetDoc.syntaxTree().rootNode().lineRange().endLine());
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION, sourceBuilder.filePath, endOfFile);
        if (needsModuleImport(flowNode, returnType, paramList)) {
            sourceBuilder.acceptImport();
        }
        // Re-attach only the detached property imports whose prefix the generated signature uses
        // (e.g. a derived union member like time:Utc), so no unused imports are emitted.
        String signatureText = returnType + " " + String.join(", ", paramList);
        for (Map.Entry<String, String> entry : detachedPropertyImports.entrySet()) {
            if (signatureText.contains(entry.getKey() + ":")) {
                String[] importParts = entry.getValue().split("/");
                if (importParts.length == 2) {
                    sourceBuilder.acceptImport(importParts[0], importParts[1].split(":")[0]);
                }
            }
        }
        return gson.toJsonTree(sourceBuilder.build());
    }

    /**
     * Removes the {@code imports} maps from the flow node's properties — {@link SourceBuilder}
     * silently adds them to the generated imports on every {@code getProperty} call — and returns
     * their union as a prefix-to-moduleId map so the caller can re-add only the ones the generated
     * code actually references.
     */
    private static Map<String, String> detachPropertyImports(FlowNode flowNode) {
        Map<String, String> detached = new HashMap<>();
        if (flowNode.properties() == null) {
            return detached;
        }
        for (Property property : flowNode.properties().values()) {
            Map<String, String> propertyImports = property.imports();
            if (propertyImports != null && !propertyImports.isEmpty()) {
                detached.putAll(propertyImports);
                propertyImports.clear();
            }
        }
        return detached;
    }

    /**
     * Emits the description doc line when a description is present.
     */
    private static boolean genDescription(String description, SourceBuilder sourceBuilder) {
        boolean hasDescription = !description.isEmpty();
        if (hasDescription) {
            sourceBuilder.token().descriptionDoc(description);
        }
        return hasDescription;
    }

    /**
     * Builds the {@code "<type> <name>"} signature entries (and parameter docs) from the activity
     * parameters property node (REPEATABLE_PROPERTY).
     */
    private List<String> populateActivityParams(Property activityParams, boolean hasDescription,
                                                SourceBuilder sourceBuilder) {
        List<String> paramList = new ArrayList<>();
        if (activityParams == null || activityParams.value() == null) {
            return paramList;
        }
        if (activityParams.value() instanceof Map<?, ?> paramMap) {
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
                if (hasDescription) {
                    // Every parameter gets a doc line when the function is documented — otherwise the
                    // generated activity raises undocumented-parameter warnings (BCE20001).
                    String paramDoc = property != null && property.value() != null
                            && !property.value().toString().isBlank()
                            ? property.value().toString()
                            : "The " + paramName + " value";
                    sourceBuilder.token().parameterDoc(paramName, paramDoc);
                }
            }
        }
        return paramList;
    }

    /**
     * Whether the connector module of the wrapped action must be imported: true when its module prefix
     * appears in the generated return type or parameter list.
     */
    private static boolean needsModuleImport(FlowNode flowNode, String returnType, List<String> paramList) {
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

    /**
     * Replaces any type-infer parameter name embedded in the return type with its resolved concrete
     * type (user value, default value, or {@code json}).
     */
    private static String resolveTypeInferParams(String returnType, FlowNode flowNode) {
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

    private static boolean hasRecordFieldSelector(FlowNode flowNode) {
        if (flowNode.properties() == null) {
            return false;
        }
        return flowNode.properties().values().stream()
                .anyMatch(p -> p.codedata() != null
                        && ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(p.codedata().kind())
                        && p.types() != null && !p.types().isEmpty()
                        && p.types().getFirst().recordSelectorType() != null);
    }

    /**
     * Resolves the activity return type from the action node: a generated named type for
     * record-field-selector inference, the {@code targetType} value/default for dependently-typed
     * actions, or the declared result type otherwise.
     */
    private static String resolveReturnType(FlowNode flowNode, Property returnProperty, SourceBuilder sourceBuilder) {
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
                                usedVarNames.add(prefix.substring(0, 1).toLowerCase(Locale.ROOT)
                                        + prefix.substring(1));
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

    /**
     * Normalizes the databinding/return type for the generated activity. The activity signature adds
     * {@code |error} separately and the body uses {@code check}, so the declared type must be the
     * success type; and when the action's return type is unspecified or ambiguous ({@code anydata} /
     * {@code any} / empty) we fall back to {@code json}.
     */
    private static String normalizeReturnType(String returnType) {
        if (returnType == null) {
            return DEFAULT_RETURN_TYPE;
        }
        String type = returnType.strip();
        if (type.endsWith(ERROR_UNION_SUFFIX)) {
            type = type.substring(0, type.length() - ERROR_UNION_SUFFIX.length()).strip();
        }
        if (type.isEmpty() || type.equals("anydata") || type.equals("any")) {
            return DEFAULT_RETURN_TYPE;
        }
        return type;
    }

    /**
     * Validates that the given connection name resolves to a module-level variable. The generated
     * activity body references the connection by name, so a missing connection must fail with a clear
     * error rather than producing a body that references an undefined symbol.
     */
    private void validateConnectionExists(String connectionName) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.VARIABLE) {
                continue;
            }
            if (symbol.getName().orElse("").equals(connectionName)) {
                return;
            }
        }
        throw new IllegalStateException("Connection '" + connectionName + "' is not found in the module");
    }

    /**
     * Resolves the type of the module-level connection variable (e.g. {@code http:Client}) to use as
     * the type of the exposed connection parameter.
     */
    private String resolveConnectionType(String connectionName) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.VARIABLE) {
                continue;
            }
            if (symbol.getName().orElse("").equals(connectionName)) {
                return CommonUtils.getTypeSignature(semanticModel,
                        ((VariableSymbol) symbol).typeDescriptor(), true);
            }
        }
        throw new IllegalStateException("Connection '" + connectionName + "' is not found in the module");
    }

    private static Set<String> collectPathParams(FlowNode flowNode, Set<String> ignoredKeys) {
        Map<String, Property> properties = flowNode.properties();
        if (properties == null) {
            return Set.of();
        }
        Set<String> pathParams = new HashSet<>();
        for (Map.Entry<String, Property> entry : properties.entrySet()) {
            if (ignoredKeys.contains(entry.getKey()) || Property.RESOURCE_PATH_KEY.equals(entry.getKey())) {
                continue;
            }
            PropertyCodedata codedata = entry.getValue().codedata();
            if (codedata == null || codedata.kind() == null) {
                continue;
            }
            if (codedata.kind().equals(ParameterData.Kind.PATH_PARAM.name())
                    || codedata.kind().equals(ParameterData.Kind.PATH_REST_PARAM.name())) {
                // Keep the raw property key so it matches the flow node's property map (getProperty)
                // and the ignoredKeys set; any identifier escaping must happen only at render time.
                pathParams.add(entry.getKey());
            }
        }
        return pathParams;
    }

    private static String resolveResourcePath(FlowNode flowNode, Set<String> pathParams) {
        Property resourcePathProperty = flowNode.properties().get(Property.RESOURCE_PATH_KEY);
        String resourcePath = resourcePathProperty.codedata().originalName();
        if (resourcePath.equals(ParamUtils.REST_RESOURCE_PATH)) {
            resourcePath = resourcePathProperty.value().toString();
        }
        for (String key : pathParams) {
            Optional<Property> property = flowNode.getProperty(key);
            if (property.isEmpty() || property.get().codedata() == null) {
                continue;
            }
            if (property.get().codedata().kind().equals(ParameterData.Kind.PATH_REST_PARAM.name())) {
                resourcePath = resourcePath.replace(ParamUtils.REST_PARAM_PATH, property.get().value().toString());
            }
        }
        return resourcePath;
    }
}
