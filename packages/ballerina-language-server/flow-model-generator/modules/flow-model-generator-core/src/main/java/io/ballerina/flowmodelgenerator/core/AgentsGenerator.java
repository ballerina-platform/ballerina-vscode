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
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.analyzers.function.ModuleNodeAnalyzer;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocumentChange;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.TextEdit;
import org.wso2.ballerinalang.compiler.tree.BLangPackage;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

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

    public static ModuleInfo resolveHostModule(Path filePath, WorkspaceManager workspaceManager) {
        try {
            workspaceManager.loadProject(filePath);
            return workspaceManager.module(filePath).map(module -> ModuleInfo.from(module.descriptor())).orElse(null);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
    }

    public static String resolveAgentRunReturnType(SemanticModel semanticModel, String agentVarName,
                                                   ModuleInfo hostModule, SourceBuilder sourceBuilder) {
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

    private static void acceptTypeImports(TypeSymbol typeSymbol, ModuleInfo hostModule, SourceBuilder sourceBuilder) {
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

    public JsonElement genAgentDefinition(String name, String description, Path filePath,
                                          WorkspaceManager workspaceManager) {
        Codedata codedata = new Codedata.Builder<>(null).node(NodeKind.AGENT).isNew().build();
        FlowNode flowNode = new FlowNode(null, null, codedata, false, null, null, null, 0);
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath);
        sourceBuilder.acceptImport(Constants.Ai.BALLERINA_ORG, Constants.Ai.AI_PACKAGE);

        sourceBuilder.token().name(buildAgentClassSource(name, description));
        sourceBuilder.textEdit(SourceBuilder.SourceKind.DECLARATION);
        return gson.toJsonTree(sourceBuilder.build());
    }

    private static String buildAgentClassSource(String name, String description) {
        String body = """
                public isolated class %s {
                    *ai:FixedTypedAgent;

                    private final ai:Agent agent;

                    # Initializes the agent
                    # + model - The AI model provider to use
                    # + memory - The memory implementation to use
                    public function init(ai:ModelProvider model, ai:Memory? memory = ()) returns error? {
                        self.agent = check new (
                            systemPrompt = {
                                role: string ``,
                                instructions: string ``
                            },
                            model = model,
                            memory = memory,
                            tools = []
                        );
                    }

                    public isolated function run(string|ai:Prompt query,
                            string sessionId = "sessionId",
                            ai:Context context = new) returns string|ai:Error {
                        return self.agent.run(query, sessionId, context);
                    }

                    public isolated function trace(string|ai:Prompt query,
                            string sessionId = "sessionId",
                            ai:Context context = new) returns ai:Trace|ai:Error {
                        return self.agent.run(query, sessionId, context);
                    }
                }""".replace("%s", name);
        return buildClassDoc(description) + body;
    }

    private static String buildClassDoc(String description) {
        String text = (description == null || description.isBlank()) ? "An AI agent." : description.strip();
        StringBuilder sb = new StringBuilder();
        for (String line : text.split("\\R", -1)) {
            sb.append("# ").append(line).append(System.lineSeparator());
        }
        return sb.toString();
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

}
