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

package io.ballerina.flowmodelgenerator.core;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.node.AgentRunBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ChunkerBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.DataLoaderBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.EmbeddingProviderBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.KnowledgeBaseBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.ModelProviderBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.NPFunctionCall;
import io.ballerina.flowmodelgenerator.core.model.node.VectorStoreBuilder;
import io.ballerina.flowmodelgenerator.core.utils.ConnectorUtil;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.Constants.Ai;
import static io.ballerina.flowmodelgenerator.core.Constants.NaturalFunctions;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow;
import static io.ballerina.modelgenerator.commons.CommonUtils.CONNECTOR_TYPE;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST_MODEL_FILE;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistDatabaseIcon;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistModelFilePath;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAgentClass;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiEmbeddingProvider;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiFixedTypedAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiDependentlyTypedAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiModelProvider;
import static io.ballerina.modelgenerator.commons.CommonUtils.isPersistClient;

/**
 * Generates available nodes for a given position in the diagram.
 *
 * @since 1.0.0
 */
public class AvailableNodesGenerator {

    private final Category.Builder rootBuilder;
    private final SemanticModel semanticModel;
    private final Document document;
    private final Package pkg;
    private final Gson gson;
    private final Path filePath;
    private WorkflowArtifacts workflowArtifacts;
    private static final String BALLERINAX = "ballerinax";
    private static final String TEST_MODULE_PREFIX = "test";
    private static final String TEST_CONFIG_ANNOTATION = "Config";

    /**
     * Which workflow artifacts each package declares, keyed by the package instance.
     *
     * <p>Weak keys make Caffeine compare by identity, which is what gives this its invalidation:
     * every edit rebuilds the package ({@code Package.Modifier} hands the project a new instance),
     * so a changed source is always a new key and the scan reruns. A superseded package is only
     * held here weakly, so it is collected with the entry rather than kept alive by it. The size
     * bound is a backstop for the handful of packages a session has open at once.
     */
    private static final Cache<Package, WorkflowArtifacts> WORKFLOW_ARTIFACTS_CACHE =
            Caffeine.newBuilder().weakKeys().maximumSize(16).build();

    public AvailableNodesGenerator(SemanticModel semanticModel, Document document, Package pkg, Path filePath) {
        this.rootBuilder = new Category.Builder(null).name(Category.Name.ROOT);
        this.gson = new Gson();
        this.semanticModel = semanticModel;
        this.document = document;
        this.pkg = pkg;
        this.filePath = filePath;
    }

    public JsonArray getAvailableNodes(boolean disableBallerinaAiNodes, LinePosition position,
                                       Map<String, String> queryMap) {
        boolean checkAgentToolCompatibility = queryMap != null
                && "true".equals(queryMap.get("checkAgentToolCompatibility"));

        boolean isInWorkflowFunction = isInsideWorkflowFunction(position);

        if (!isInWorkflowFunction) {
            List<Category> connections = new ArrayList<>();
            for (Symbol symbol : getScopedSymbols(position).values()) {
                Optional<Category> connection = getConnection(symbol, checkAgentToolCompatibility);
                if (connection.isEmpty()) {
                    continue;
                }
                connections.add(connection.get());
            }
            connections.sort(Comparator.comparing(connection -> connection.metadata().label()));
            this.rootBuilder.stepIn(Category.Name.CONNECTIONS).items(new ArrayList<>(connections)).stepOut();
        }

        boolean insideTestFunction = isInsideTestFunction(position);
        List<Item> items = new ArrayList<>();
        items.addAll(getAvailableFlowNodes(position, disableBallerinaAiNodes, isInWorkflowFunction));
        if (!isInWorkflowFunction) {
            items.addAll(LocalIndexCentral.getInstance().getFunctions());
        }
        if (insideTestFunction) {
            items.addAll(LocalIndexCentral.getInstance().getTestFunctions());
        }
        JsonArray jsonArray = gson.toJsonTree(items).getAsJsonArray();

        if (insideTestFunction) {
            Path relativePath = pkg.project().sourceRoot().relativize(this.filePath);
            addFilePathToNodes(jsonArray, relativePath.toString());
        }

        return jsonArray;
    }

    private boolean isInsideWorkflowFunction(LinePosition position) {
        try {
            int txtPos = this.document.textDocument().textPositionFrom(position);
            TextRange range = TextRange.from(txtPos, 0);
            NonTerminalNode node = ((ModulePartNode) document.syntaxTree().rootNode()).findNode(range);
            return WorkflowUtil.isInsideWorkflowFunction(this.semanticModel, node);
        } catch (RuntimeException e) {
            // Defensive: position resolution / syntax-tree lookups can fail on malformed sources.
            return false;
        }
    }

    private List<ClassFieldSymbol> getEnclosingClassFields(LinePosition position) {
        int textPosition;
        try {
            textPosition = document.textDocument().textPositionFrom(position);
        } catch (Exception e) {
            return List.of();
        }
        Node node = ((ModulePartNode) document.syntaxTree().rootNode())
                .findNode(TextRange.from(textPosition, 0));
        boolean insideFunctionBody = false;
        while (node != null) {
            if (node.kind() == SyntaxKind.FUNCTION_BODY_BLOCK) {
                insideFunctionBody = true;
            }
            if (node.kind() == SyntaxKind.CLASS_DEFINITION) {
                if (!insideFunctionBody) {
                    return List.of();
                }
                Optional<Symbol> classSymbol = semanticModel.symbol((ClassDefinitionNode) node);
                if (classSymbol.isPresent() && classSymbol.get() instanceof ClassSymbol resolvedClassSymbol
                        && (isAiFixedTypedAgent(resolvedClassSymbol)
                        || isAiDependentlyTypedAgent(resolvedClassSymbol))) {
                    return new ArrayList<>(resolvedClassSymbol.fieldDescriptors().values());
                }
                return List.of();
            }
            node = node.parent();
        }
        return List.of();
    }

    private Map<String, Symbol> getScopedSymbols(LinePosition position) {
        Map<String, Symbol> symbols = new LinkedHashMap<>();
        semanticModel.visibleSymbols(document, position).forEach(symbol ->
                symbol.getName().ifPresent(name -> symbols.put(name, symbol)));
        getEnclosingClassFields(position).forEach(field ->
                field.getName().ifPresent(name -> symbols.putIfAbsent(name, field)));
        return symbols;
    }

    public JsonArray getAvailableNodes(LinePosition position) {
        return getAvailableNodes(true, position, null);
    }

    public JsonArray getAvailableAgents(LinePosition position) {
        boolean includeTraceMethod = isInsideTestFunction(position);
        return this.getAvailableItemsByCategory(position, Category.Name.AGENT,
                symbol -> getAgent(symbol, includeTraceMethod));
    }

    public JsonArray getAvailableModelProviders(LinePosition position) {
        return this.getAvailableItemsByCategory(position, Category.Name.MODEL_PROVIDER, this::getModelProvider);
    }

    public JsonArray getAvailableEmbeddingProviders(LinePosition position) {
        return this.getAvailableItemsByCategory(position, Category.Name.EMBEDDING_PROVIDER, this::getEmbeddingProvider);
    }

    public JsonArray getAvailableVectorStores(LinePosition position) {
        return this.getAvailableItemsByCategory(position, Category.Name.VECTOR_STORE, this::getVectorStore);
    }

    public JsonArray getAvailableVectorKnowledgeBases(LinePosition position) {
        return this.getAvailableItemsByCategory(position, Category.Name.KNOWLEDGE_BASE, this::getKnowledgeBase);
    }

    public JsonArray getAvailableDataLoaders(LinePosition position) {
        return this.getAvailableItemsByCategory(position, Category.Name.DATA_LOADER, this::getDataLoader);
    }

    public JsonArray getAvailableChunkers(LinePosition position) {
        return this.getAvailableItemsByCategory(position, Category.Name.CHUNKER, this::getChunkers);
    }

    private JsonArray getAvailableItemsByCategory(LinePosition position, Category.Name categoryName,
                                                  Function<Symbol, Optional<Category>> symbolToCategoryTransformer) {
        List<Item> providers = semanticModel.visibleSymbols(document, position).stream()
                .map(symbolToCategoryTransformer)
                .flatMap(Optional::stream)
                .sorted(Comparator.comparing(connection -> connection.metadata().label()))
                .collect(Collectors.toList());
        List<Item> items = this.rootBuilder.stepIn(categoryName).items(providers)
                .stepOut().build().items();
        return gson.toJsonTree(items).getAsJsonArray();
    }

    private List<Item> getAvailableFlowNodes(LinePosition cursorPosition, boolean disableBallerinaAiNodes,
                                              boolean isInWorkflowFunction) {
        int txtPos = this.document.textDocument().textPositionFrom(cursorPosition);
        TextRange range = TextRange.from(txtPos, 0);
        NonTerminalNode nonTerminalNode = ((ModulePartNode) document.syntaxTree().rootNode()).findNode(range);
        NonTerminalNode iterationNode = nonTerminalNode;

        while (iterationNode != null) {
            SyntaxKind kind = iterationNode.kind();
            switch (kind) {
                case WHILE_STATEMENT, FOREACH_STATEMENT -> {
                    setAvailableNodesForIteratingBlock(nonTerminalNode, disableBallerinaAiNodes, isInWorkflowFunction);
                    return this.rootBuilder.build().items();
                }
                default -> iterationNode = iterationNode.parent();
            }
        }

        while (nonTerminalNode != null) {
            SyntaxKind kind = nonTerminalNode.kind();
            switch (kind) {
                case IF_ELSE_STATEMENT, LOCK_STATEMENT, TRANSACTION_STATEMENT, MATCH_STATEMENT, DO_STATEMENT,
                     ON_FAIL_CLAUSE -> {
                    setAvailableDefaultNodes(nonTerminalNode, disableBallerinaAiNodes, isInWorkflowFunction);
                    return this.rootBuilder.build().items();
                }
                default -> nonTerminalNode = nonTerminalNode.parent();
            }
        }
        setDefaultNodes(disableBallerinaAiNodes, isInWorkflowFunction);
        return this.rootBuilder.build().items();
    }

    private boolean isInsideTestFunction(LinePosition cursorPosition) {
        return isInsideTestFunction(this.document, cursorPosition);
    }

    public static boolean isInsideTestFunction(Document document, LinePosition cursorPosition) {
        int txtPos;
        try {
            txtPos = document.textDocument().textPositionFrom(cursorPosition);
        } catch (Exception e) {
            return false;
        }
        TextRange range = TextRange.from(txtPos, 0);
        NonTerminalNode node = ((ModulePartNode) document.syntaxTree().rootNode()).findNode(range);
        while (node != null) {
            if (node.kind() == SyntaxKind.FUNCTION_DEFINITION) {
                FunctionDefinitionNode functionDef = (FunctionDefinitionNode) node;
                boolean isTest = functionDef.metadata().map(metadataNode ->
                        metadataNode.annotations().stream().anyMatch(annotationNode -> {
                            Node annotRef = annotationNode.annotReference();
                            if (annotRef.kind() == SyntaxKind.QUALIFIED_NAME_REFERENCE) {
                                QualifiedNameReferenceNode qualifiedRef = (QualifiedNameReferenceNode) annotRef;
                                return TEST_MODULE_PREFIX.equals(qualifiedRef.modulePrefix().text()) &&
                                        TEST_CONFIG_ANNOTATION.equals(qualifiedRef.identifier().text());
                            }
                            return false;
                        })
                ).orElse(false);
                if (isTest) {
                    return true;
                }
            }
            node = node.parent();
        }
        return false;
    }

    public static void addFilePathToNodes(JsonArray items, String filePathStr) {
        for (JsonElement item : items) {
            if (!item.isJsonObject()) {
                continue;
            }
            JsonObject obj = item.getAsJsonObject();
            if (obj.has("codedata")) {
                JsonObject codedata = obj.getAsJsonObject("codedata");
                JsonObject data;
                if (codedata.has("data") && codedata.get("data").isJsonObject()) {
                    data = codedata.getAsJsonObject("data");
                } else {
                    data = new JsonObject();
                    codedata.add("data", data);
                }
                data.addProperty(Constants.FILE_PATH_KEY, filePathStr);
            }
            if (obj.has("items") && obj.get("items").isJsonArray()) {
                addFilePathToNodes(obj.getAsJsonArray("items"), filePathStr);
            }
        }
    }

    private void setAvailableDefaultNodes(NonTerminalNode node, boolean disableBallerinaAiNodes,
                                          boolean isInWorkflowFunction) {
        setDefaultNodes(disableBallerinaAiNodes, isInWorkflowFunction);
        setStopNode(node);
    }

    private void setAvailableNodesForIteratingBlock(NonTerminalNode node, boolean disableBallerinaAiNodes,
                                                     boolean isInWorkflowFunction) {
        setDefaultNodes(disableBallerinaAiNodes, isInWorkflowFunction);
        setStopNode(node);
        this.rootBuilder.stepIn(Category.Name.CONTROL)
                .node(NodeKind.BREAK)
                .node(NodeKind.CONTINUE)
                .stepOut();
    }

    private void setDefaultNodes(boolean disableBallerinaAiNodes, boolean isInWorkflowFunction) {
        if (!isInWorkflowFunction) {
            this.rootBuilder.stepIn(Category.Name.AI)
                    .items(getAiNodes(disableBallerinaAiNodes))
                    .stepOut();

            // The client-side workflow verbs, right after AI so they are easy to reach:
            // shown only when the integration defines the matching artifacts — workflow
            // functions enable Run Workflow / Send Data Event, durable agents enable the
            // agent interaction nodes.
            WorkflowArtifacts artifacts = workflowArtifacts();
            if (artifacts.hasWorkflows() || artifacts.hasDurableAgents()) {
                this.rootBuilder.stepIn(Category.Name.WORKFLOW)
                        .items(getWorkflowNodes(false, artifacts.hasWorkflows(), artifacts.hasDurableAgents()))
                        .stepOut();
            }
        }

        // Inside a workflow function the Workflow section leads the palette — it holds the
        // durable steps that make up the flow.
        if (isInWorkflowFunction) {
            this.rootBuilder.stepIn(Category.Name.WORKFLOW)
                    .items(getWorkflowNodes(true, true, true))
                    .stepOut();
        }

        AvailableNode function = new AvailableNode(
                new Metadata.Builder<>(null)
                        .label("Call Function")
                        .description("Both project and utility functions")
                        .build(),
                new Codedata.Builder<>(null)
                        .node(NodeKind.FUNCTION)
                        .build(),
                true
        );

        this.rootBuilder.stepIn(Category.Name.STATEMENT)
                .node(NodeKind.VARIABLE)
                .node(NodeKind.ASSIGN)
                .node(function)
                .node(NodeKind.DATA_MAPPER_CALL);

        this.rootBuilder.stepIn(Category.Name.CONTROL)
                .node(NodeKind.IF)
                .node(NodeKind.MATCH)
                .node(NodeKind.WHILE)
                .node(NodeKind.FOREACH)
                .node(NodeKind.RETURN);

        this.rootBuilder
                .stepIn(Category.Name.ERROR_HANDLING)
                    .node(NodeKind.ERROR_HANDLER)
                    .node(NodeKind.FAIL)
                    .node(NodeKind.PANIC)
                    .stepOut();

        if (!isInWorkflowFunction) {
            this.rootBuilder
                    .stepIn(Category.Name.CONCURRENCY)
                        .node(NodeKind.FORK)
                        .node(NodeKind.PARALLEL_FLOW)
                        .node(NodeKind.WAIT)
                        .node(NodeKind.LOCK)
                        .node(NodeKind.START)
                        .node(NodeKind.TRANSACTION)
                        .node(NodeKind.COMMIT)
                        .node(NodeKind.ROLLBACK)
                        .node(NodeKind.RETRY)
                        .stepOut();

        }
    }

    /**
     * Which workflow artifacts the package declares.
     *
     * @param hasWorkflows     whether it declares a {@code @workflow:Workflow} function
     * @param hasDurableAgents whether it declares a module-level {@code workflow:DurableAgent}
     */
    private record WorkflowArtifacts(boolean hasWorkflows, boolean hasDurableAgents) { }

    /**
     * Whether the package declares workflow functions and durable agents, scanned across every
     * module rather than the default one alone — a multi-module package whose workflows live
     * outside the default module would otherwise lose the whole Workflow category. Both answers
     * come from one pass, memoized on this generator and, behind it, on the package itself.
     *
     * <p>The scan walks every module symbol, so its cost grows with the package. That is fine
     * once per package version and wasteful once per palette open, which is what a
     * generator-lifetime memo alone would give — a generator is built fresh for every request.
     * {@link #WORKFLOW_ARTIFACTS_CACHE} carries the answer across opens instead, for as long as
     * the package it was computed from is the current one.
     *
     * @return the artifacts the package declares
     */
    private WorkflowArtifacts workflowArtifacts() {
        if (this.workflowArtifacts == null) {
            this.workflowArtifacts =
                    WORKFLOW_ARTIFACTS_CACHE.get(this.pkg, AvailableNodesGenerator::scanWorkflowArtifacts);
        }
        return this.workflowArtifacts;
    }

    /**
     * Scans every module of the package for a {@code @workflow:Workflow} function and a
     * module-level {@code workflow:DurableAgent}, resolving both against the semantic model so an
     * aliased import prefix cannot change the answer.
     *
     * @param pkg the package to scan
     * @return the artifacts the package declares
     */
    private static WorkflowArtifacts scanWorkflowArtifacts(Package pkg) {
        boolean hasWorkflows = false;
        boolean hasDurableAgents = false;
        for (Module module : pkg.modules()) {
            for (Symbol symbol : module.getCompilation().getSemanticModel().moduleSymbols()) {
                hasWorkflows = hasWorkflows || WorkflowUtil.isWorkflowFunction(symbol);
                hasDurableAgents = hasDurableAgents || WorkflowUtil.isDurableAgentVariable(symbol);
                if (hasWorkflows && hasDurableAgents) {
                    return new WorkflowArtifacts(true, true);
                }
            }
        }
        return new WorkflowArtifacts(hasWorkflows, hasDurableAgents);
    }

    private List<Item> getAiNodes(boolean disableBallerinaAiNodes) {
        String aiPackageVersion = AiUtils.getBallerinaAiModuleVersion(pkg.project());
        Set<NodeKind> supportedFeatures = AiUtils.getSupportedFeatures(aiPackageVersion);

        AvailableNode modelProvider = new AvailableNode(new Metadata.Builder<>(null)
                .label(ModelProviderBuilder.LABEL).description(ModelProviderBuilder.DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.MODEL_PROVIDERS).build(),
                !disableBallerinaAiNodes && supportedFeatures.contains(NodeKind.MODEL_PROVIDERS));

        AvailableNode npFunction = new AvailableNode(
                new Metadata.Builder<>(null).label(NPFunctionCall.LABEL)
                        .description(NPFunctionCall.DESCRIPTION).icon(NaturalFunctions.ICON).build(),
                new Codedata.Builder<>(null).node(NodeKind.NP_FUNCTION).build(), true);

        Category directLlmCategory = new Category.Builder(null).name(Category.Name.DIRECT_LLM)
                .items(List.of(modelProvider, npFunction)).build();

        AvailableNode knowledgeBase = new AvailableNode(
                new Metadata.Builder<>(null).label(KnowledgeBaseBuilder.LABEL)
                        .description(KnowledgeBaseBuilder.DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.KNOWLEDGE_BASES).org(Ai.BALLERINA_ORG)
                        .module(Ai.AI_PACKAGE).packageName(Ai.AI_PACKAGE)
                        .object(Ai.KNOWLEDGE_BASE_TYPE_NAME).symbol("init").version(aiPackageVersion).build(),
                !disableBallerinaAiNodes && supportedFeatures.contains(NodeKind.KNOWLEDGE_BASES));

        AvailableNode recursiveDocumentChunker = new AvailableNode(new Metadata.Builder<>(null)
                .label(Ai.RECURSIVE_DOCUMENT_CHUNKER_LABEL).build(), new Codedata.Builder<>(null)
                .node(NodeKind.FUNCTION_CALL).org(Ai.BALLERINA_ORG).module(Ai.AI_PACKAGE).packageName(Ai.AI_PACKAGE)
                .symbol(Ai.CHUNK_DOCUMENT_RECURSIVELY_METHOD_NAME).version(aiPackageVersion).build(),
                !disableBallerinaAiNodes);
        AvailableNode chunkers = new AvailableNode(
                new Metadata.Builder<>(null).label(ChunkerBuilder.LABEL)
                        .description(ChunkerBuilder.DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.CHUNKERS).build(),
                !disableBallerinaAiNodes && supportedFeatures.contains(NodeKind.CHUNKERS));

        AvailableNode augmentUserQuery = new AvailableNode(
                new Metadata.Builder<>(null).label(Ai.AUGMENT_QUERY_LABEL).build(),
                new Codedata.Builder<>(null).node(NodeKind.FUNCTION_CALL).org(Ai.BALLERINA_ORG)
                        .module(Ai.AI_PACKAGE).packageName(Ai.AI_PACKAGE).symbol(Ai.AUGMENT_USER_QUERY_METHOD_NAME)
                        .version(aiPackageVersion).build(), !disableBallerinaAiNodes);

        AvailableNode vectorStore = new AvailableNode(
                new Metadata.Builder<>(null).label(VectorStoreBuilder.LABEL)
                        .description(VectorStoreBuilder.DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.VECTOR_STORES).build(),
                !disableBallerinaAiNodes && supportedFeatures.contains(NodeKind.VECTOR_STORES));

        AvailableNode embeddingProvider = new AvailableNode(
                new Metadata.Builder<>(null).label(EmbeddingProviderBuilder.LABEL)
                        .description(EmbeddingProviderBuilder.DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.EMBEDDING_PROVIDERS).build(),
                !disableBallerinaAiNodes && supportedFeatures.contains(NodeKind.EMBEDDING_PROVIDERS));

        AvailableNode dataLoaders = new AvailableNode(
                new Metadata.Builder<>(null).label(DataLoaderBuilder.LABEL)
                        .description(DataLoaderBuilder.DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.DATA_LOADERS).build(),
                !disableBallerinaAiNodes && supportedFeatures.contains(NodeKind.DATA_LOADERS));

        Category ragCategory = new Category.Builder(null).name(Category.Name.RAG)
                .items(List.of(knowledgeBase, dataLoaders, recursiveDocumentChunker, chunkers, augmentUserQuery,
                        vectorStore, embeddingProvider)).build();

        AvailableNode agent = new AvailableNode(
                new Metadata.Builder<>(null).label(AgentRunBuilder.LABEL)
                        .description(AgentRunBuilder.CATEGORY_DESCRIPTION).build(),
                new Codedata.Builder<>(null).node(NodeKind.AGENTS).build(), true);

        Category agentCategory = new Category.Builder(null).name(Category.Name.AGENT)
                .items(List.of(agent)).build();

        return List.of(directLlmCategory, ragCategory, agentCategory);
    }


    private List<Item> getWorkflowNodes(boolean isInWorkflowFunction, boolean hasWorkflows,
                                        boolean hasDurableAgents) {
        List<Item> workflowNodes = new ArrayList<>();

        if (isInWorkflowFunction) {
            // Inside a workflow function the single Workflow section groups its items by
            // functionality: durable Steps, Child Workflows, and the (advanced) context
            // utility functions.
            Category steps = new Category.Builder(null).name(Category.Name.WORKFLOW_STEPS)
                    .items(List.of(
                            workflowNode(Workflow.CALL_ACTIVITY_LABEL, Workflow.CALL_ACTIVITY_DESCRIPTION,
                                    NodeKind.ACTIVITY_CALL),
                            workflowNode(Workflow.HUMAN_TASK_LABEL, Workflow.HUMAN_TASK_DESCRIPTION,
                                    NodeKind.HUMAN_TASK),
                            workflowNode(Workflow.WAIT_DATA_LABEL, Workflow.WAIT_DATA_DESCRIPTION,
                                    NodeKind.WAIT_DATA),
                            workflowNode(Workflow.SLEEP_LABEL, Workflow.SLEEP_DESCRIPTION, NodeKind.SLEEP)))
                    .build();

            Category childWorkflows = new Category.Builder(null).name(Category.Name.CHILD_WORKFLOWS)
                    .items(List.of(
                            workflowNode(Workflow.RUN_CHILD_WORKFLOW_LABEL, Workflow.RUN_CHILD_WORKFLOW_DESCRIPTION,
                                    NodeKind.CHILD_WORKFLOW_RUN),
                            workflowNode(Workflow.CALL_CHILD_WORKFLOW_LABEL, Workflow.CALL_CHILD_WORKFLOW_DESCRIPTION,
                                    NodeKind.CHILD_WORKFLOW_CALL),
                            workflowNode(Workflow.WAIT_CHILD_WORKFLOW_LABEL, Workflow.WAIT_CHILD_WORKFLOW_DESCRIPTION,
                                    NodeKind.CHILD_WORKFLOW_WAIT),
                            workflowNode(Workflow.SEND_DATA_CHILD_WORKFLOW_LABEL,
                                    Workflow.SEND_DATA_CHILD_WORKFLOW_DESCRIPTION,
                                    NodeKind.CHILD_WORKFLOW_SEND_DATA)))
                    .build();

            Category workflowFunctions = new Category.Builder(null).name(Category.Name.WORKFLOW_FUNCTIONS)
                    .items(List.of(
                            workflowNode(Workflow.CURRENT_TIME_LABEL, Workflow.CURRENT_TIME_DESCRIPTION,
                                    NodeKind.WORKFLOW_CURRENT_TIME),
                            workflowNode(Workflow.IS_REPLAYING_LABEL, Workflow.IS_REPLAYING_DESCRIPTION,
                                    NodeKind.WORKFLOW_IS_REPLAYING),
                            workflowNode(Workflow.GET_WORKFLOW_ID_LABEL, Workflow.GET_WORKFLOW_ID_DESCRIPTION,
                                    NodeKind.WORKFLOW_GET_ID),
                            workflowNode(Workflow.GET_WORKFLOW_TYPE_LABEL, Workflow.GET_WORKFLOW_TYPE_DESCRIPTION,
                                    NodeKind.WORKFLOW_GET_TYPE)))
                    .build();

            workflowNodes.add(steps);
            workflowNodes.add(childWorkflows);
            workflowNodes.add(workflowFunctions);
        } else {
            // Outside workflow functions the items follow the integration's artifacts:
            // workflow functions bring the workflow verbs, durable agents bring theirs.
            if (hasWorkflows) {
                workflowNodes.add(workflowNode(Workflow.RUN_LABEL, Workflow.RUN_DESCRIPTION,
                        NodeKind.WORKFLOW_RUN));
                workflowNodes.add(workflowNode(Workflow.SEND_DATA_LABEL, Workflow.SEND_DATA_DESCRIPTION,
                        NodeKind.SEND_DATA));
            }
            if (hasDurableAgents) {
                workflowNodes.add(workflowNode(Workflow.AGENT_START_LABEL, Workflow.AGENT_START_DESCRIPTION,
                        NodeKind.DURABLE_AGENT_START));
                workflowNodes.add(workflowNode(Workflow.AGENT_SEND_DATA_LABEL, Workflow.AGENT_SEND_DATA_DESCRIPTION,
                        NodeKind.DURABLE_AGENT_UPDATE));
                workflowNodes.add(workflowNode(Workflow.AGENT_RESULT_LABEL, Workflow.AGENT_RESULT_DESCRIPTION,
                        NodeKind.DURABLE_AGENT_RESULT));
                workflowNodes.add(workflowNode(Workflow.AGENT_DATA_RESULT_LABEL,
                        Workflow.AGENT_DATA_RESULT_DESCRIPTION, NodeKind.DURABLE_AGENT_DATA_RESULT));
            }
        }

        return workflowNodes;
    }

    // Builds a plain palette entry: a label/description pair whose click resolves to the node kind.
    private static AvailableNode workflowNode(String label, String description, NodeKind kind) {
        return new AvailableNode(
                new Metadata.Builder<>(null).label(label).description(description).build(),
                new Codedata.Builder<>(null).node(kind).build(),
                true);
    }

    private void setStopNode(NonTerminalNode node) {
        Node parent = node;
        while (parent != null) {
            if (isStopNodeAvailable(parent)) {
                this.rootBuilder.stepIn(Category.Name.CONTROL)
                        .node(NodeKind.STOP)
                        .stepOut();
            }
            parent = parent.parent();
        }
    }

    private boolean isStopNodeAvailable(Node node) {
        if (node.kind() != SyntaxKind.FUNCTION_DEFINITION &&
                node.kind() != SyntaxKind.RESOURCE_ACCESSOR_DEFINITION &&
                node.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
            return false;
        }
        Optional<Symbol> symbol = this.semanticModel.symbol(node);
        if (symbol.isEmpty()) {
            return false;
        }
        Optional<TypeSymbol> typeSymbol = ((FunctionSymbol) symbol.get()).typeDescriptor().returnTypeDescriptor();
        return typeSymbol.isEmpty() || typeSymbol.get().subtypeOf(semanticModel.types().NIL);
    }

    private Optional<Category> getConnection(Symbol symbol, boolean checkAgentToolCompatibility) {
        return getCategory(symbol, classSymbol -> classSymbol.qualifiers().contains(Qualifier.CLIENT) &&
                !isAiModelProvider(classSymbol) && !isAiEmbeddingProvider(classSymbol), checkAgentToolCompatibility);
    }

    private Optional<Category> getCategory(Symbol symbol, Predicate<ClassSymbol> condition) {
        return getCategory(symbol, condition, false);
    }

    private Optional<Category> getCategory(Symbol symbol, Predicate<ClassSymbol> condition,
                                           boolean checkAgentToolCompatibility) {
        try {
            TypeReferenceTypeSymbol typeDescriptorSymbol;
            if (symbol instanceof VariableSymbol variableSymbol) {
                typeDescriptorSymbol = (TypeReferenceTypeSymbol) variableSymbol.typeDescriptor();
            } else if (symbol instanceof ParameterSymbol parameterSymbol) {
                typeDescriptorSymbol = (TypeReferenceTypeSymbol) parameterSymbol.typeDescriptor();
            } else if (symbol instanceof ClassFieldSymbol classFieldSymbol) {
                typeDescriptorSymbol = (TypeReferenceTypeSymbol) classFieldSymbol.typeDescriptor();
            } else {
                return Optional.empty();
            }
            ClassSymbol classSymbol = (ClassSymbol) typeDescriptorSymbol.typeDescriptor();
            if (!condition.test(classSymbol)) {
                return Optional.empty();
            }
            String symbolName = symbol.getName().orElseThrow();
            String parentSymbolName = symbol instanceof ClassFieldSymbol ? "self." + symbolName : symbolName;
            ModuleInfo moduleInfo = classSymbol.getModule()
                    .map(moduleSymbol -> ModuleInfo.from(moduleSymbol.id()))
                    .orElse(null);

            boolean persistClient = isPersistClient(classSymbol, semanticModel);
            Optional<String> persistIcon = persistClient ? getPersistDatabaseIcon(classSymbol) : Optional.empty();
            List<Item> methods = ConnectionActionProvider.getInstance().getActions(classSymbol, parentSymbolName,
                    pkg.project(), semanticModel, checkAgentToolCompatibility);

            Metadata.Builder<?> metadataBuilder = new Metadata.Builder<>(null)
                    .label(parentSymbolName);
            if (persistClient) {
                persistIcon.ifPresent(metadataBuilder::icon);
                metadataBuilder.addData(CONNECTOR_TYPE, PERSIST);
                Optional<Package> resolvedPackage = moduleInfo != null
                        ? PackageUtil.resolveModulePackage(moduleInfo.org(), moduleInfo.packageName(),
                                moduleInfo.version())
                        : Optional.empty();
                getPersistModelFilePath(
                        resolvedPackage.map(p -> p.project().sourceRoot())
                                .orElse(pkg.project().sourceRoot()),
                        classSymbol)
                        .ifPresent(modelFile -> metadataBuilder.addData(PERSIST_MODEL_FILE, modelFile));
            } else if (moduleInfo != null) {
                metadataBuilder.addData(CONNECTOR_TYPE,
                        ConnectorUtil.getConnectionCategory(moduleInfo.moduleName()));
            }

            Metadata metadata = metadataBuilder.build();
            return Optional.of(new Category(metadata, methods));
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
    }

    private Optional<Category> getAgent(Symbol symbol, boolean includeTraceMethod) {
        Optional<Category> agent = getCategory(symbol, classSymbol -> {
            try {
                return isAgentClass(classSymbol)
                        || isAiFixedTypedAgent(classSymbol)
                        || isAiDependentlyTypedAgent(classSymbol);
            } catch (Exception e) {
                return false;
            }
        });
        return includeTraceMethod ? agent : agent.map(AvailableNodesGenerator::withoutTraceMethod);
    }

    private static Category withoutTraceMethod(Category agent) {
        List<Item> methods = agent.items().stream()
                .filter(item -> !(item instanceof AvailableNode availableNode
                        && Ai.AGENT_TRACE_METHOD_NAME.equals(availableNode.codedata().symbol())))
                .toList();
        return methods.size() == agent.items().size() ? agent : new Category(agent.metadata(), methods);
    }

    private Optional<Category> getModelProvider(Symbol symbol) {
        return getCategory(symbol, classSymbol -> classSymbol.qualifiers().contains(Qualifier.CLIENT)
                && isAiModelProvider(classSymbol)
        );
    }

    private Optional<Category> getEmbeddingProvider(Symbol symbol) {
        return getCategory(symbol, classSymbol -> classSymbol.qualifiers().contains(Qualifier.CLIENT) &&
                isAiEmbeddingProvider(classSymbol)
        );
    }

    private Optional<Category> getKnowledgeBase(Symbol symbol) {
        return getCategory(symbol, CommonUtils::isAiKnowledgeBase);
    }

    private Optional<Category> getVectorStore(Symbol symbol) {
        return getCategory(symbol, CommonUtils::isAiVectorStore);
    }

    private Optional<Category> getDataLoader(Symbol symbol) {
        return getCategory(symbol, CommonUtils::isAiDataLoader);
    }

    private Optional<Category> getChunkers(Symbol symbol) {
        return getCategory(symbol, CommonUtils::isAiChunker);
    }
}
