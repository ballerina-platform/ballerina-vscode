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

package io.ballerina.flowmodelgenerator.core;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.flowmodelgenerator.core.analyzers.function.ModuleNodeAnalyzer;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.PropertyCodedata;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
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
import io.ballerina.projects.Project;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocumentChange;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;
import org.wso2.ballerinalang.compiler.tree.BLangPackage;

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

import static io.ballerina.flowmodelgenerator.core.Constants.AI;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINA;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINAX;
import static io.ballerina.flowmodelgenerator.core.Constants.DEFAULT_MODEL_PROVIDER;
import static io.ballerina.modelgenerator.commons.CommonUtils.importExists;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiModule;

/**
 * This class is responsible for managing agents.
 *
 * @since 1.0.0
 */
public class AgentsGenerator {

    public static final String MODEL = "ModelProvider";
    public static final String TOOL_ANNOTATION = "AgentTool";
    public static final String MEMORY = "Memory";
    public static final String TARGET_TYPE = "targetType";
    private final Gson gson;
    private final SemanticModel semanticModel;
    private static final String INIT = "init";
    private static final String AGENT_FILE = "agents.bal";
    public static final String AGENT = "Agent";
    public static final String RUN = "run";
    private static final String HTTP_MODULE = "http";
    private static final List<String> HTTP_REMOTE_METHOD_SKIP_LIST = List.of("get", "put", "post", "head",
            "delete", "patch", "options");
    private static final String OPENAI_MODEL_PROVIDER = "OpenAiModelProvider";

    public AgentsGenerator() {
        this.gson = new Gson();
        this.semanticModel = null;
    }

    public AgentsGenerator(SemanticModel semanticModel) {
        this.gson = new Gson();
        this.semanticModel = semanticModel;
    }

    public static String getAiModuleOrgName(String path, WorkspaceManager workspaceManager)
            throws WorkspaceDocumentException, EventSyncException {
        Path projectPath = Path.of(path);
        Project project = workspaceManager.loadProject(projectPath);
        BLangPackage bLangPackage = PackageUtil.getCompilation(project.currentPackage()).defaultModuleBLangPackage();
        return importExists(bLangPackage, BALLERINAX, AI) ? BALLERINAX : BALLERINA;
    }

    public JsonArray getAllAgents(SemanticModel agentSymbol) {
        List<Codedata> agents = new ArrayList<>();
        for (Symbol symbol : agentSymbol.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.CLASS) {
                continue;
            }
            ClassSymbol classSymbol = (ClassSymbol) symbol;
            if (classSymbol.getName().orElse("").equals(AGENT)) {
                Optional<ModuleSymbol> optModule = classSymbol.getModule();
                if (optModule.isEmpty()) {
                    throw new IllegalStateException("Agent module id not found");
                }
                ModuleID id = optModule.get().id();

                agents.add(new Codedata.Builder<>(null).node(NodeKind.AGENT)
                        .org(id.orgName())
                        .module(id.moduleName())
                        .packageName(id.packageName())
                        .object(classSymbol.getName().orElse(AGENT))
                        .symbol(INIT)
                        .build());
            }
        }
        return gson.toJsonTree(agents).getAsJsonArray();
    }

    public JsonArray getNewBallerinaxModels() {
        JsonArray models = new JsonArray();
        models.add(createModelObject(CommonUtils.AI_OPENAI));
        models.add(createModelObject(CommonUtils.AI_ANTHROPIC));
        models.add(createModelObject(CommonUtils.AI_DEEPSEEK));
        models.add(createModelObject(CommonUtils.AI_MISTRAL));
        models.add(createModelObject(CommonUtils.AI_OLLAMA));
        models.add(createModelObject(NodeKind.CLASS_INIT, CommonUtils.AI_AZURE, OPENAI_MODEL_PROVIDER));
        models.add(createModelObject(NodeKind.FUNCTION_CALL, Constants.AI, DEFAULT_MODEL_PROVIDER));
        return models;
    }

    private JsonObject createModelObject(String moduleName) {
        return createModelObject(NodeKind.CLASS_INIT, moduleName, MODEL);
    }

    private JsonObject createModelObject(NodeKind nodeKind, String moduleName, String objectOrFuncName) {
        JsonObject model = new JsonObject();
        model.addProperty("node", nodeKind.toString());
        model.addProperty("org", nodeKind.equals(NodeKind.CLASS_INIT) ?
                Constants.BALLERINAX : Constants.BALLERINA);
        model.addProperty("module", moduleName);
        model.addProperty("packageName", moduleName);
        if (nodeKind.equals(NodeKind.CLASS_INIT)) {
            model.addProperty("object", objectOrFuncName);
            model.addProperty("symbol", INIT);
        } else {
            model.addProperty("symbol", objectOrFuncName);
        }
        return model;
    }

    public JsonArray getAllBallerinaxModels(SemanticModel agentSymbol) {
        List<ClassSymbol> modelSymbols = new ArrayList<>();
        for (Symbol symbol : agentSymbol.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.CLASS) {
                continue;
            }
            ClassSymbol classSymbol = (ClassSymbol) symbol;
            if (!classSymbol.qualifiers().contains(Qualifier.CLIENT)) {
                continue;
            }
            List<TypeSymbol> inclusionsTypes = classSymbol.typeInclusions();
            for (TypeSymbol typeSymbol : inclusionsTypes) {
                if (typeSymbol.getName().isPresent() && typeSymbol.getName().get().equals(MODEL)) {
                    modelSymbols.add(classSymbol);
                    break;
                }
            }
        }

        List<Codedata> models = new ArrayList<>();
        for (ClassSymbol model : modelSymbols) {
            Optional<ModuleSymbol> optModule = model.getModule();
            if (optModule.isEmpty()) {
                throw new IllegalStateException("Agent module id not found");
            }
            ModuleID id = optModule.get().id();
            models.add(new Codedata.Builder<>(null).node(NodeKind.CLASS_INIT)
                    .org(id.orgName())
                    .module(id.moduleName())
                    .packageName(id.packageName())
                    .version(id.version())
                    .object(model.getName().orElse(MODEL))
                    .symbol(INIT)
                    .build());
        }
        return gson.toJsonTree(models).getAsJsonArray();
    }

    public JsonArray getAllMemoryManagers(SemanticModel agentSymbol) {
        List<ClassSymbol> memoryManagerSymbols = new ArrayList<>();
        for (Symbol symbol : agentSymbol.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.CLASS) {
                continue;
            }
            ClassSymbol classSymbol = (ClassSymbol) symbol;
            List<TypeSymbol> inclusionsTypes = classSymbol.typeInclusions();
            for (TypeSymbol typeSymbol : inclusionsTypes) {
                if (typeSymbol.getName().isPresent() && typeSymbol.getName().get().equals(MEMORY)) {
                    memoryManagerSymbols.add(classSymbol);
                    break;
                }
            }
        }

        List<Codedata> models = new ArrayList<>();
        for (ClassSymbol model : memoryManagerSymbols) {
            Optional<ModuleSymbol> optModule = model.getModule();
            if (optModule.isEmpty()) {
                throw new IllegalStateException("Memory Manager module id not found");
            }
            ModuleID id = optModule.get().id();
            models.add(new Codedata.Builder<>(null).node(NodeKind.CLASS_INIT)
                    .org(id.orgName())
                    .module(id.moduleName())
                    .packageName(id.packageName())
                    .object(model.getName().orElse(MEMORY))
                    .symbol(INIT)
                    .build());
        }
        return gson.toJsonTree(models).getAsJsonArray();
    }

    public JsonArray getModels() {
        List<Symbol> moduleSymbols = semanticModel.moduleSymbols();
        List<String> models = new ArrayList<>();
        for (Symbol moduleSymbol : moduleSymbols) {
            if (moduleSymbol.kind() != SymbolKind.VARIABLE) {
                continue;
            }
            VariableSymbol variableSymbol = (VariableSymbol) moduleSymbol;
            TypeSymbol typeSymbol = CommonUtils.getRawType(variableSymbol.typeDescriptor());
            if (typeSymbol.kind() != SymbolKind.CLASS) {
                continue;
            }
            List<TypeSymbol> typeInclusions = ((ClassSymbol) typeSymbol).typeInclusions();
            for (TypeSymbol typeInclusion : typeInclusions) {
                Optional<String> optName = typeInclusion.getName();
                if (optName.isPresent() && optName.get().equals(MODEL)) {
                    models.add(variableSymbol.getName().orElse(""));
                }
            }
        }
        return gson.toJsonTree(models).getAsJsonArray();
    }

    public JsonArray getTools(SemanticModel semanticModel) {
        List<Symbol> moduleSymbols = semanticModel.moduleSymbols();
        List<String> functionNames = new ArrayList<>();
        TypeSymbol anydata = semanticModel.types().ANYDATA;
        for (Symbol moduleSymbol : moduleSymbols) {
            if (moduleSymbol.kind() != SymbolKind.FUNCTION) {
                continue;
            }

            FunctionSymbol functionSymbol = (FunctionSymbol) moduleSymbol;
            if (!functionSymbol.qualifiers().contains(Qualifier.ISOLATED)) {
                continue;
            }

            FunctionTypeSymbol functionTypeSymbol = functionSymbol.typeDescriptor();
            Optional<List<ParameterSymbol>> optParams = functionTypeSymbol.params();
            if (optParams.isPresent()) {
                boolean isAnydataSubType = true;
                for (ParameterSymbol parameterSymbol : optParams.get()) {
                    if (!CommonUtils.subTypeOf(parameterSymbol.typeDescriptor(), anydata)) {
                        isAnydataSubType = false;
                        break;
                    }
                }
                if (!isAnydataSubType) {
                    continue;
                }
            }
            Optional<TypeSymbol> optReturnTypeSymbol = functionTypeSymbol.returnTypeDescriptor();
            if (optReturnTypeSymbol.isPresent()) {
                if (!CommonUtils.subTypeOf(optReturnTypeSymbol.get(), anydata)) {
                    continue;
                }
            }
            if (isToolAnnotated(functionSymbol)) {
                functionNames.add(moduleSymbol.getName().orElse(""));
            }
        }

        return gson.toJsonTree(functionNames).getAsJsonArray();
    }

    public JsonElement genTool(JsonElement node, String toolName, JsonElement toolParameters, String connectionName,
                               String description, Path filePath, WorkspaceManager workspaceManager) {
        FlowNode flowNode = gson.fromJson(node, FlowNode.class);
        Property toolParams = gson.fromJson(toolParameters, Property.class);
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

            sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
            if (hasReturn) {
                sourceBuilder.token()
                        .name(returnTypeStr)
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
            return gson.toJsonTree(textEdits);
        } else if (nodeKind == NodeKind.REMOTE_ACTION_CALL) {
            boolean hasDescription = genDescription(description, sourceBuilder);
            Set<String> ignoredKeys = new HashSet<>(List.of(Property.VARIABLE_KEY, Property.TYPE_KEY, TARGET_TYPE,
                    Property.CONNECTION_KEY, Property.CHECK_ERROR_KEY));

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
            return gson.toJsonTree(sourceBuilder.build());
        } else if (nodeKind == NodeKind.RESOURCE_ACTION_CALL) {
            boolean hasDescription = genDescription(description, sourceBuilder);
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
            return gson.toJsonTree(sourceBuilder.build());
        }
        throw new IllegalStateException("Unsupported node kind to generate tool");
    }

    /**
     * Generates an {@code @ai:AgentTool} wrapper that delegates to {@code agentVarName}'s {@code run} method.
     */
    public JsonElement genAgentTool(String agentVarName, boolean includeContext, String toolName,
                                    String description, Path filePath, WorkspaceManager workspaceManager) {
        ModuleInfo hostModule = resolveHostModule(filePath, workspaceManager);

        // Synthetic node: AGENT + isNew routes the SourceBuilder to write at the end of agents.bal.
        Codedata codedata = new Codedata.Builder<>(null).node(NodeKind.AGENT).isNew().build();
        FlowNode flowNode = new FlowNode(null, null, codedata, false, null, null, null, 0);
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath);
        sourceBuilder.acceptImport(Constants.Ai.BALLERINA_ORG, Constants.Ai.AI_PACKAGE);

        String returnType = resolveAgentRunReturnType(agentVarName, hostModule, sourceBuilder);

        String desc = (description == null || description.isBlank())
                ? "Delegates a query to the " + agentVarName + " agent." : description;
        sourceBuilder.token().descriptionDoc(desc);
        sourceBuilder.token().parameterDoc("query", "The request to send to the " + agentVarName + " agent.");
        sourceBuilder.token().returnDoc("The response from the " + agentVarName + " agent.");

        // ai:Context is hidden from the LLM; passing it threads the caller's context to the delegated agent.
        String paramList = includeContext ? "ai:Context context, string query" : "string query";
        String runArgs = includeContext ? "query, context = context" : "query";

        sourceBuilder.token().name("@ai:AgentTool").name(System.lineSeparator());
        sourceBuilder.token().keyword(SyntaxKind.ISOLATED_KEYWORD).keyword(SyntaxKind.FUNCTION_KEYWORD);
        sourceBuilder.token().name(toolName).keyword(SyntaxKind.OPEN_PAREN_TOKEN);
        sourceBuilder.token().name(paramList);
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_PAREN_TOKEN);
        sourceBuilder.token()
                .keyword(SyntaxKind.RETURNS_KEYWORD)
                .name(returnType)
                .keyword(SyntaxKind.PIPE_TOKEN)
                .keyword(SyntaxKind.ERROR_KEYWORD);

        sourceBuilder.token().keyword(SyntaxKind.OPEN_BRACE_TOKEN);
        sourceBuilder.token()
                .name(returnType)
                .keyword(SyntaxKind.PIPE_TOKEN)
                .keyword(SyntaxKind.ERROR_KEYWORD)
                .name("response")
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .name(agentVarName)
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(RUN)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(runArgs)
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();
        sourceBuilder.token()
                .keyword(SyntaxKind.RETURN_KEYWORD)
                .name("response")
                .endOfStatement();
        sourceBuilder.token().keyword(SyntaxKind.CLOSE_BRACE_TOKEN);

        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
        return gson.toJsonTree(sourceBuilder.build());
    }

    private ModuleInfo resolveHostModule(Path filePath, WorkspaceManager workspaceManager) {
        try {
            workspaceManager.loadProject(filePath);
            return workspaceManager.module(filePath).map(module -> ModuleInfo.from(module.descriptor())).orElse(null);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }

    // Wrapper return type from <agentVarName>.run(...); built-in/unresolvable/anydata fall back to string.
    private String resolveAgentRunReturnType(String agentVarName, ModuleInfo hostModule, SourceBuilder sourceBuilder) {
        if (semanticModel == null) {
            return "string";
        }
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.VARIABLE || !agentVarName.equals(symbol.getName().orElse(""))) {
                continue;
            }
            TypeSymbol type = CommonUtils.getRawType(((VariableSymbol) symbol).typeDescriptor());
            if (type.kind() != SymbolKind.CLASS || CommonUtils.isAgentClass(type)) {
                return "string";
            }
            MethodSymbol runMethod = ((ClassSymbol) type).methods().get(RUN);
            if (runMethod == null) {
                return "string";
            }
            Optional<TypeSymbol> optReturn = runMethod.typeDescriptor().returnTypeDescriptor();
            if (optReturn.isEmpty()) {
                return "string";
            }
            acceptTypeImports(optReturn.get(), hostModule, sourceBuilder);
            String signature = CommonUtils.getTypeSignature(semanticModel, optReturn.get(), true, hostModule);
            if (signature.isBlank() || signature.equals("anydata") || signature.equals("()")) {
                return "string";
            }
            return signature;
        }
        return "string";
    }

    private void acceptTypeImports(TypeSymbol typeSymbol, ModuleInfo hostModule, SourceBuilder sourceBuilder) {
        if (typeSymbol instanceof UnionTypeSymbol union) {
            union.memberTypeDescriptors().forEach(member -> acceptTypeImports(member, hostModule, sourceBuilder));
            return;
        }
        typeSymbol.getModule().ifPresent(moduleSymbol -> {
            ModuleID id = moduleSymbol.id();
            if (id.orgName().equals(BALLERINA) && id.moduleName().startsWith("lang.")) {
                return;
            }
            boolean sameModule = hostModule != null && id.orgName().equals(hostModule.org())
                    && id.moduleName().equals(hostModule.moduleName());
            if (sameModule) {
                return;
            }
            sourceBuilder.acceptImport(id.orgName(), id.moduleName());
        });
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

    private boolean isToolAnnotated(FunctionSymbol functionSymbol) {
        for (AnnotationAttachmentSymbol annotAttachment : functionSymbol.annotAttachments()) {
            AnnotationSymbol annotationSymbol = annotAttachment.typeDescriptor();
            Optional<ModuleSymbol> optModule = annotationSymbol.getModule();
            if (optModule.isEmpty()) {
                continue;
            }
            ModuleID id = optModule.get().id();
            if (!isAiModule(id.orgName(), id.packageName())) {
                continue;
            }
            Optional<String> optName = annotationSymbol.getName();
            if (optName.isEmpty()) {
                continue;
            }
            if (optName.get().equals(TOOL_ANNOTATION)) {
                return true;
            }
        }
        return false;
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

    public JsonArray getActions(JsonElement node, Path filePath, Project project, WorkspaceManager workspaceManager) {
        FlowNode flowNode = gson.fromJson(node, FlowNode.class);
        Document document = workspaceManager.document(filePath).orElseThrow();
        TextDocument textDocument = document.textDocument();
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath);
        Path connectionPath = workspaceManager.projectRoot(filePath).resolve("connections.bal");
        List<TextEdit> connectionTextEdits = NodeBuilder.getNodeFromKind(flowNode.codedata().node())
                .toSource(sourceBuilder).get(connectionPath);
        io.ballerina.tools.text.TextEdit[] textEdits = new io.ballerina.tools.text.TextEdit[connectionTextEdits.size()];
        for (int i = 0; i < connectionTextEdits.size(); i++) {
            TextEdit connectionTextEdit = connectionTextEdits.get(i);
            Position start = connectionTextEdit.getRange().getStart();
            int startTextPosition = textDocument.textPositionFrom(LinePosition.from(start.getLine(),
                    start.getCharacter()));
            Position end = connectionTextEdit.getRange().getEnd();
            int endTextPosition = textDocument.textPositionFrom(LinePosition.from(end.getLine(), end.getCharacter()));
            io.ballerina.tools.text.TextEdit textEdit =
                    io.ballerina.tools.text.TextEdit.from(TextRange.from(startTextPosition,
                            endTextPosition - startTextPosition), connectionTextEdit.getNewText());
            textEdits[i] = textEdit;
        }
        TextDocument modifiedTextDoc = textDocument.apply(TextDocumentChange.from(textEdits));
        Document modifiedDoc =
                project.duplicate().currentPackage().module(document.module().moduleId())
                        .document(document.documentId()).modify().withContent(String.join(System.lineSeparator(),
                                modifiedTextDoc.textLines())).apply();

        SemanticModel newSemanticModel = PackageUtil.getCompilation(modifiedDoc.module().packageInstance())
                .getSemanticModel(modifiedDoc.module().moduleId());
        Optional<Property> property = flowNode.getProperty(Property.VARIABLE_KEY);
        if (property.isEmpty()) {
            throw new IllegalStateException("Variable name is not present");
        }
        String variableName = property.get().value().toString();
        VariableSymbol variableSymbol = null;
        List<Symbol> moduleSymbols = newSemanticModel.moduleSymbols();
        for (Symbol moduleSymbol : moduleSymbols) {
            if (moduleSymbol.kind() != SymbolKind.VARIABLE) {
                continue;
            }
            if (moduleSymbol.getName().orElse("").equals(variableName)) {
                variableSymbol = (VariableSymbol) moduleSymbol;
            }
        }
        List<Item> methods = new ArrayList<>();
        if (variableSymbol == null) {
            return gson.toJsonTree(methods).getAsJsonArray();
        }

        // TODO: Derive this logic from AvailableNodeGenerator
        TypeReferenceTypeSymbol typeDescriptorSymbol =
                (TypeReferenceTypeSymbol) variableSymbol.typeDescriptor();
        ClassSymbol classSymbol = (ClassSymbol) typeDescriptorSymbol.typeDescriptor();
        if (!(classSymbol.qualifiers().contains(Qualifier.CLIENT))) {
            return gson.toJsonTree(methods).getAsJsonArray();
        }
        String parentSymbolName = variableSymbol.getName().orElseThrow();
        String className = classSymbol.getName().orElseThrow();
        ModuleInfo moduleInfo = classSymbol.getModule()
                .map(moduleSymbol -> ModuleInfo.from(moduleSymbol.id()))
                .orElse(null);

        // Obtain methods of the connector
        List<FunctionData> methodFunctionsData = new FunctionDataBuilder()
                .parentSymbol(classSymbol)
                .moduleInfo(moduleInfo)
                .workspaceManager(workspaceManager)
                .filePath(filePath)
                .buildChildNodes();

        for (FunctionData methodFunction : methodFunctionsData) {
            String org = methodFunction.org();
            String packageName = methodFunction.packageName();
            String moduleName = methodFunction.moduleName();
            String version = methodFunction.version();
            boolean isHttpModule = org.equals(Constants.BALLERINA) && packageName.equals(HTTP_MODULE);

            NodeBuilder nodeBuilder;
            String label;
            if (methodFunction.kind() == FunctionData.Kind.RESOURCE) {
                if (isHttpModule && HTTP_REMOTE_METHOD_SKIP_LIST.contains(methodFunction.name())) {
                    continue;
                }
                label = methodFunction.name() + (isHttpModule ? "" : methodFunction.resourcePath());
                nodeBuilder = NodeBuilder.getNodeFromKind(NodeKind.RESOURCE_ACTION_CALL);
            } else {
                label = methodFunction.name();
                nodeBuilder = switch (methodFunction.kind()) {
                    case REMOTE -> NodeBuilder.getNodeFromKind(NodeKind.REMOTE_ACTION_CALL);
                    case FUNCTION -> NodeBuilder.getNodeFromKind(NodeKind.METHOD_CALL);
                    default -> throw new IllegalStateException("Unexpected value: " + methodFunction.kind());
                };
            }

            Item item = nodeBuilder
                    .metadata()
                    .label(label)
                    .icon(CommonUtils.generateIcon(org, packageName, version))
                    .description(methodFunction.description())
                    .stepOut()
                    .codedata()
                    .org(org)
                    .module(moduleName)
                    .packageName(packageName)
                    .object(className)
                    .symbol(methodFunction.name())
                    .version(version)
                    .parentSymbol(parentSymbolName)
                    .resourcePath(methodFunction.resourcePath())
                    .id(methodFunction.functionId())
                    .stepOut()
                    .buildAvailableNode();
            methods.add(item);
        }
        return gson.toJsonTree(methods).getAsJsonArray();
    }

    public FunctionDefinitionNode getToolFunction(String toolName, Document document) {
        return ((ModulePartNode) document.syntaxTree().rootNode()).members().stream()
                .filter(member -> member.kind() == SyntaxKind.FUNCTION_DEFINITION)
                .map(member -> (FunctionDefinitionNode) member)
                .filter(function -> function.functionName().text().equals(toolName))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Function with name " + toolName + " not found"));
    }

    public JsonElement getToolFlowNode(FunctionDefinitionNode functionDefinitionNode, Document document) {
        ModuleNodeAnalyzer moduleNodeAnalyzer =
                new ModuleNodeAnalyzer(ModuleInfo.from(document.module().descriptor()), semanticModel);
        functionDefinitionNode.accept(moduleNodeAnalyzer);
        return moduleNodeAnalyzer.getNode();
    }

    public JsonElement getMethodCallFlowNode(FunctionDefinitionNode functionDefinitionNode, Project project,
                                             Document document, WorkspaceManager workspaceManager, Path filePath) {
        FunctionBodyNode fnBodyNode = functionDefinitionNode.functionBody();
        if (functionDefinitionNode.functionBody().kind() != SyntaxKind.FUNCTION_BODY_BLOCK) {
            return null;
        }
        NodeList<StatementNode> statements = ((FunctionBodyBlockNode) fnBodyNode).statements();
        if (statements.isEmpty()) {
            return null;
        }
        CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, Property.LOCAL_SCOPE, Map.of(), Map.of(),
                document.textDocument(), ModuleInfo.from(document.module().descriptor()),
                false, workspaceManager, filePath);
        StatementNode firstStmt = statements.get(0);
        firstStmt.accept(codeAnalyzer);

        List<FlowNode> flowNodes = codeAnalyzer.getFlowNodes();
        if (flowNodes.isEmpty()) {
            return null;
        }
        FlowNode flowNode = flowNodes.getFirst();
        NodeKind nodeKind = flowNode.codedata().node();
        if (!(nodeKind == NodeKind.FUNCTION_DEFINITION || nodeKind == NodeKind.REMOTE_ACTION_CALL ||
                nodeKind == NodeKind.RESOURCE_ACTION_CALL)) {
            return null;
        }
        return gson.toJsonTree(flowNode);
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
}
