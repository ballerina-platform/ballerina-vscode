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

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.ServiceDeclarationSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.AssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.flowmodelgenerator.core.model.Diagram;
import io.ballerina.flowmodelgenerator.core.model.ExtendedDiagram;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectKind;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.common.utils.PositionUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Stream;

import static io.ballerina.modelgenerator.commons.CommonUtils.isAgentClass;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiFixedReturnAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiInferredReturnAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiKnowledgeBase;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiMemoryStore;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiVectorStore;

/**
 * Generator for the flow model.
 *
 * @since 1.0.0
 */
public class ModelGenerator {

    private final SemanticModel semanticModel;
    private final Path filePath;
    private final Gson gson;
    private final Project project;
    private final WorkspaceManager workspaceManager;

    private static final Comparator<FlowNode> FLOW_NODE_COMPARATOR = Comparator.comparing(
            node -> Optional.ofNullable(node.properties().get(Property.VARIABLE_KEY))
                    .map(property -> property.value().toString())
                    .orElse("")
    );
    private static final String NODE_KIND_FILTER = "kind";
    private static final String EXACT_MATCH_FILTER = "exactMatch";
    private static final String TYPE_MATCH_FILTER = "typeMatch";
    private static final String TYPE_MATCH_EXACT = "exact";
    private static final String TYPE_MATCH_SUBTYPE = "subtype";
    private static final String TYPE_ORG_FILTER = "typeOrg";
    private static final String TYPE_PACKAGE_FILTER = "typePackage";
    private static final String TYPE_MODULE_FILTER = "typeModule";
    private static final String TYPE_NAME_FILTER = "typeName";
    private static final String TYPE_VERSION_FILTER = "typeVersion";

    public ModelGenerator(Project project, SemanticModel model, Path filePath, WorkspaceManager workspaceManager) {
        this.semanticModel = model;
        this.filePath = filePath;
        this.project = project;
        this.gson = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create();
        this.workspaceManager = workspaceManager;
    }

    /**
     * Generates a flow model for the given canvas node.
     *
     * @return JSON representation of the flow model
     */
    public JsonElement getFlowModel(Document document, LineRange lineRange, Document dataMappingDoc,
                                    Document functionsDoc) {
        // Obtain the code block representing the canvas
        SyntaxTree syntaxTree = document.syntaxTree();
        ModulePartNode modulePartNode = syntaxTree.rootNode();
        TextDocument textDocument = syntaxTree.textDocument();
        int start = textDocument.textPositionFrom(lineRange.startLine());
        int end = textDocument.textPositionFrom(lineRange.endLine());
        NonTerminalNode canvasNode = modulePartNode.findNode(TextRange.from(start, end - start), true);

        if (canvasNode instanceof ClassDefinitionNode classDefinitionNode) {
            canvasNode = narrowToInnerAgent(classDefinitionNode, canvasNode);
        }

        // Obtain the connections visible at the module-level
        List<FlowNode> moduleConnections =
                semanticModel.visibleSymbols(document, canvasNode.lineRange().startLine()).stream()
                        .flatMap(symbol -> buildConnection(symbol).stream())
                        .sorted(Comparator.comparing(
                                node -> Optional.ofNullable(node.properties().get(Property.VARIABLE_KEY))
                                        .map(property -> property.value().toString())
                                        .orElse("")))
                        .toList();

        // Obtain the data mapping function names
        Map<String, LineRange> dataMappings = new HashMap<>();
        if (dataMappingDoc != null) {
            ModulePartNode dataMappingModulePartNode = dataMappingDoc.syntaxTree().rootNode();
            for (ModuleMemberDeclarationNode member : dataMappingModulePartNode.members()) {
                if (member.kind() == SyntaxKind.FUNCTION_DEFINITION) {
                    FunctionDefinitionNode functionNode = (FunctionDefinitionNode) member;
                    String functionName = functionNode.functionName().text();
                    LineRange functionLineRange = functionNode.lineRange();
                    dataMappings.put(functionName, functionLineRange);
                }
            }
        }

        // Obtain the natural function names
        Map<String, LineRange> naturalFunctions = new HashMap<>();
        if (functionsDoc != null) {
            ModulePartNode functionsModulePartNode = functionsDoc.syntaxTree().rootNode();
            for (ModuleMemberDeclarationNode member : functionsModulePartNode.members()) {
                if (member.kind() == SyntaxKind.FUNCTION_DEFINITION
                        && BallerinaCompilerApi.getInstance()
                        .isNaturalExpressionBodiedFunction((FunctionDefinitionNode) member)) {
                    FunctionDefinitionNode functionDef = (FunctionDefinitionNode) member;
                    naturalFunctions.put(functionDef.functionName().text(), functionDef.lineRange());
                }
            }
        }

        // Analyze the code block to find the flow nodes
        CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, Property.LOCAL_SCOPE, dataMappings,
                naturalFunctions, textDocument, ModuleInfo.from(document.module().descriptor()), false,
                workspaceManager, filePath);
        canvasNode.accept(codeAnalyzer);

        // Generate the flow model
        Diagram diagram = new Diagram(filePath.toString(), codeAnalyzer.getFlowNodes(), moduleConnections);
        return gson.toJsonTree(diagram);
    }

    private NonTerminalNode narrowToInnerAgent(ClassDefinitionNode classDefinitionNode, NonTerminalNode fallback) {
        Optional<Symbol> symbol = semanticModel.symbol(classDefinitionNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof ClassSymbol classSymbol)
                || !(isAiFixedReturnAgent(classSymbol) || isAiInferredReturnAgent(classSymbol))) {
            return fallback;
        }
        for (Node member : classDefinitionNode.members()) {
            if (!(member instanceof FunctionDefinitionNode function)
                    || !function.functionName().text().equals("init")
                    || !(function.functionBody() instanceof FunctionBodyBlockNode body)) {
                continue;
            }
            for (StatementNode statement : body.statements()) {
                if (statement instanceof AssignmentStatementNode assignment) {
                    if (!isInnerAgentAssignment(assignment, classSymbol)) {
                        continue;
                    }
                    ExpressionNode expr = assignment.expression();
                    if (expr instanceof CheckExpressionNode check) {
                        expr = check.expression();
                    }
                    if (expr instanceof ImplicitNewExpressionNode) {
                        return assignment;
                    }
                }
            }
        }
        return fallback;
    }

    private boolean isInnerAgentAssignment(AssignmentStatementNode assignment, ClassSymbol classSymbol) {
        String variableReference = assignment.varRef().toSourceCode().replaceAll("\\s", "");
        if (!variableReference.startsWith("self.")) {
            return false;
        }
        ClassFieldSymbol fieldSymbol = classSymbol.fieldDescriptors()
                .get(variableReference.substring("self.".length()));
        if (fieldSymbol == null) {
            return false;
        }
        TypeSymbol fieldType = fieldSymbol.typeDescriptor();
        if (fieldType instanceof TypeReferenceTypeSymbol typeReference) {
            fieldType = typeReference.typeDescriptor();
        }
        return fieldType instanceof ClassSymbol resolvedClassSymbol && isAgentClass(resolvedClassSymbol);
    }

    public JsonElement getModuleNodes() {
        List<FlowNode> connectionsList = new ArrayList<>();
        List<FlowNode> variablesList = new ArrayList<>();

        for (Symbol symbol : semanticModel.moduleSymbols()) {
            buildConnection(symbol).ifPresent(connectionsList::add);
            if (symbol instanceof VariableSymbol) {
                buildVariables(symbol).ifPresent(variablesList::add);
            }
        }

        // TODO: Going with the following approach since the semantic model for the `tests` directory cannot be
        //  obtained.
        // Check for symbols in the tests folder by directly analyzing test document syntax trees
        Module defaultModule = project.currentPackage().getDefaultModule();
        for (DocumentId testDocId : defaultModule.testDocumentIds()) {
            Document testDoc = defaultModule.document(testDocId);
            Optional<Path> testDocPathOpt = project.documentPath(testDocId);
            if (testDocPathOpt.isEmpty()) {
                continue;
            }
            Path testDocPath = testDocPathOpt.get();
            SyntaxTree syntaxTree = testDoc.syntaxTree();
            ModulePartNode modulePartNode = syntaxTree.rootNode();
            for (ModuleMemberDeclarationNode member : modulePartNode.members()) {
                if (member.kind() != SyntaxKind.MODULE_VAR_DECL) {
                    continue;
                }
                Optional<Symbol> symbolOpt = semanticModel.symbol(
                        ((ModuleVariableDeclarationNode) member).typedBindingPattern().bindingPattern());
                if (!(symbolOpt.orElse(null) instanceof VariableSymbol varSymbol)) {
                    continue;
                }
                boolean isConnection;
                try {
                    isConnection = isClassOrObject(
                            ((TypeReferenceTypeSymbol) varSymbol.typeDescriptor()).typeDescriptor());
                } catch (RuntimeException ignored) {
                    isConnection = false;
                }
                CodeAnalyzer codeAnalyzer = new CodeAnalyzer(
                        project, semanticModel, Property.GLOBAL_SCOPE, Map.of(), Map.of(),
                        syntaxTree.textDocument(), ModuleInfo.from(testDoc.module().descriptor()),
                        false, workspaceManager, testDocPath);
                member.accept(codeAnalyzer);
                for (FlowNode node : codeAnalyzer.getFlowNodes()) {
                    if (isConnection) {
                        connectionsList.add(node);
                    } else {
                        variablesList.add(node);
                    }
                }
            }
        }

        connectionsList.sort(FLOW_NODE_COMPARATOR);
        variablesList.sort(FLOW_NODE_COMPARATOR);

        ExtendedDiagram diagram = new ExtendedDiagram(filePath.toString(), List.of(), connectionsList, variablesList);
        return gson.toJsonTree(diagram);
    }

    public JsonElement getClassOwnedNodes(LineRange classLineRange) {
        Document document = FileSystemUtils.getDocument(workspaceManager, filePath);
        SyntaxTree syntaxTree = document.syntaxTree();
        ModuleInfo moduleInfo = ModuleInfo.from(document.module().descriptor());
        ModulePartNode modulePartNode = syntaxTree.rootNode();
        TextDocument textDocument = syntaxTree.textDocument();
        int start = textDocument.textPositionFrom(classLineRange.startLine());
        int end = textDocument.textPositionFrom(classLineRange.endLine());
        NonTerminalNode node = modulePartNode.findNode(TextRange.from(start, Math.max(0, end - start)), true);
        if (!(node instanceof ClassDefinitionNode classDefinitionNode)) {
            return gson.toJsonTree(new ExtendedDiagram(filePath.toString(), List.of(), List.of(), List.of()));
        }

        Optional<Symbol> symbol = semanticModel.symbol(classDefinitionNode);
        if (symbol.isEmpty() || !(symbol.get() instanceof ClassSymbol classSymbol)) {
            return gson.toJsonTree(new ExtendedDiagram(filePath.toString(), List.of(), List.of(), List.of()));
        }

        List<FlowNode> nodes = classSymbol.fieldDescriptors().entrySet().stream()
                .flatMap(entry -> buildFlowNode(entry.getValue()).stream()
                        .map(flowNode -> normalizeClassOwnedNode(flowNode, entry.getKey(), entry.getValue(),
                                moduleInfo)))
                .filter(flowNode -> flowNode.codedata().node() == NodeKind.MCP_TOOL_KIT
                        || flowNode.codedata().node() == NodeKind.NEW_CONNECTION)
                .sorted(FLOW_NODE_COMPARATOR)
                .toList();
        ExtendedDiagram diagram = new ExtendedDiagram(filePath.toString(), List.of(), List.of(), nodes);
        return gson.toJsonTree(diagram);
    }

    public JsonElement getServiceFieldNodes(LinePosition pos) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() != SymbolKind.SERVICE_DECLARATION) {
                continue;
            }
            ServiceDeclarationSymbol serviceDeclarationSymbol = (ServiceDeclarationSymbol) symbol;
            if (!PositionUtil.isWithinLineRange(new Position(pos.line(), pos.offset()),
                    serviceDeclarationSymbol.getLocation().orElseThrow().lineRange())) {
                continue;
            }
            Map<String, ClassFieldSymbol> fieldsMap = serviceDeclarationSymbol.fieldDescriptors();
            Set<String> classFieldRefs = new HashSet<>();
            for (Map.Entry<String, ClassFieldSymbol> field : fieldsMap.entrySet()) {
                if (isClassOrObject(CommonUtils.getRawType(field.getValue().typeDescriptor()))) {
                    classFieldRefs.add("self." + field.getKey());
                }
            }
            Optional<Location> optLocation = serviceDeclarationSymbol.getLocation();
            if (optLocation.isEmpty()) {
                continue;
            }
            Location location = optLocation.get();
            Path docFilePath = project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                    project.sourceRoot().resolve(location.lineRange().fileName());
            DocumentId documentId = project.documentId(docFilePath);
            Document document = project.currentPackage().module(documentId.moduleId()).document(documentId);
            NonTerminalNode node = CommonUtils.getNode(document.syntaxTree(), location.textRange());
            if (node.kind() != SyntaxKind.SERVICE_DECLARATION) {
                continue;
            }

            List<FlowNode> connections = new ArrayList<>();
            ServiceDeclarationNode serviceDeclarationNode = (ServiceDeclarationNode) node;
            for (Node member : serviceDeclarationNode.members()) {
                if (member.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
                    continue;
                }
                FunctionDefinitionNode functionDefinitionNode = (FunctionDefinitionNode) member;
                if (!functionDefinitionNode.functionName().text().equals("init")) {
                    continue;
                }
                for (StatementNode statement :
                        ((FunctionBodyBlockNode) functionDefinitionNode.functionBody()).statements()) {
                    if (statement.kind() != SyntaxKind.ASSIGNMENT_STATEMENT) {
                        continue;
                    }
                    if (!classFieldRefs
                            .contains(((AssignmentStatementNode) statement).varRef().toSourceCode().trim())) {
                        continue;
                    }
                    CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, Property.SERVICE_SCOPE,
                            Map.of(), Map.of(), document.textDocument(),
                            ModuleInfo.from(document.module().descriptor()), false, workspaceManager, docFilePath);
                    statement.accept(codeAnalyzer);
                    List<FlowNode> nodes = codeAnalyzer.getFlowNodes();
                    connections.add(nodes.stream().findFirst().orElseThrow());
                }
            }
            Diagram diagram = new Diagram(filePath.toString(), List.of(), connections);
            return gson.toJsonTree(diagram);
        }
        return null;
    }

    private FlowNode normalizeClassOwnedNode(FlowNode flowNode, String fieldName, ClassFieldSymbol fieldSymbol,
                                             ModuleInfo moduleInfo) {
        Map<String, Property> properties = new HashMap<>(flowNode.properties());
        Property variable = properties.get(Property.VARIABLE_KEY);
        if (variable != null && variable.value() instanceof String value && value.startsWith("self.")) {
            properties.put(Property.VARIABLE_KEY, Property.Builder.copyFrom(variable)
                    .value(value.substring("self.".length()))
                    .build());
        } else if (variable == null) {
            properties.put(Property.VARIABLE_KEY, new Property.Builder<>(null)
                    .metadata().label(Property.VARIABLE_NAME).description(Property.VARIABLE_DOC).stepOut()
                    .type(Property.ValueType.IDENTIFIER)
                    .value(fieldName)
                    .editable()
                    .codedata().kind(Property.ValueType.IDENTIFIER.name()).stepOut()
                    .build());
        }
        if (flowNode.codedata().node() == NodeKind.NEW_CONNECTION && properties.get(Property.TYPE_KEY) == null
                && fieldSymbol != null) {
            properties.put(Property.TYPE_KEY, new Property.Builder<>(null)
                    .metadata().label(Property.TYPE_LABEL).description(Property.TYPE_LABEL).stepOut()
                    .type(Property.ValueType.TYPE)
                    .value(CommonUtils.getTypeSignature(fieldSymbol.typeDescriptor(), moduleInfo))
                    .editable()
                    .hidden()
                    .codedata().kind(Property.ValueType.TYPE.name()).stepOut()
                    .build());
        }
        return new FlowNode(flowNode.id(), flowNode.metadata(), flowNode.codedata(), flowNode.returning(),
                flowNode.branches(), properties, flowNode.diagnostics(), flowNode.flags());
    }

    /**
     * Search semantic model symbols with given configurations and convert them to FlowNodes.
     *
     * @param document the document to search in
     * @param position the line position (nullable - if null, uses moduleSymbols, else visibleSymbols)
     * @param queryMap the map containing query parameters (kind, exactMatch, type* filters)
     * @return List of FlowNodes that match the search criteria
     */
    public List<FlowNode> searchNodes(Document document, LinePosition position, Map<String, String> queryMap) {
        // Get symbols based on position
        List<Symbol> symbols = position != null
                ? semanticModel.visibleSymbols(document, position)
                : semanticModel.moduleSymbols();

        // Extract filter parameters
        String kindFilter = queryMap != null ? queryMap.get(NODE_KIND_FILTER) : null;
        String exactMatchFilter = queryMap != null ? queryMap.get(EXACT_MATCH_FILTER) : null;
        Optional<TypeConstraint> typeConstraint = TypeConstraint.from(queryMap);

        // Apply symbol-level filters first (exactMatch)
        Stream<Symbol> stream = symbols.stream()
                .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE || symbol.kind() == SymbolKind.CLASS_FIELD)
                .sorted(Comparator.comparing(symbol -> symbol.getName().orElse("")));
        if (exactMatchFilter != null) {
            // Strip "self." prefix if present for class field matching
            String fieldName = exactMatchFilter.startsWith("self.")
                    ? exactMatchFilter.substring(5)
                    : exactMatchFilter;
            stream = stream.filter(symbol -> symbol.nameEquals(fieldName));
        }
        if (typeConstraint.isPresent()) {
            stream = stream.filter(symbol -> matchesTypeConstraint(symbol, typeConstraint.get()));
        }
        List<Symbol> filteredSymbols = stream.toList();

        // Convert symbols to FlowNodes
        List<FlowNode> flowNodesList = new ArrayList<>();
        for (Symbol symbol : filteredSymbols) {
            buildFlowNode(symbol).ifPresent(flowNodesList::add);
        }

        // Apply NodeKind filter if present
        if (kindFilter != null && !kindFilter.isEmpty()) {
            Optional<NodeKind> nodeKindOpt = Stream.of(NodeKind.values())
                    .filter(n -> n.name().equalsIgnoreCase(kindFilter))
                    .findFirst();
            if (nodeKindOpt.isPresent()) {
                NodeKind requiredNodeKind = nodeKindOpt.get();
                flowNodesList = flowNodesList.stream()
                        .filter(node -> node.codedata().node() == requiredNodeKind)
                        .toList();
            } else {
                // kindFilter is not a NodeKind enum value — treat as a case-insensitive module
                // prefix filter so that connection-kind strings like "HTTP", "SOAP", "EMAIL"
                // can match nodes whose codedata.module starts with the same prefix.
                // e.g. "HTTP"  → module="http"
                //      "SOAP"  → module="soap.soap11" / "soap.soap12"
                //      "EMAIL" → module="email"
                String kindLower = kindFilter.toLowerCase(Locale.ROOT);
                flowNodesList = flowNodesList.stream()
                        .filter(node -> {
                            String module = node.codedata() != null ? node.codedata().module() : null;
                            return module != null
                                    && module.toLowerCase(Locale.ROOT).startsWith(kindLower);
                        })
                        .toList();
            }
        }
        return flowNodesList;
    }

    private boolean matchesTypeConstraint(Symbol symbol, TypeConstraint constraint) {
        Optional<TypeSymbol> optType = getSymbolType(symbol);
        if (optType.isEmpty()) {
            return false;
        }
        TypeSymbol candidateType = optType.get();
        if (TYPE_MATCH_SUBTYPE.equals(constraint.match())) {
            return resolveTypeConstraint(constraint)
                    .map(target -> CommonUtils.subTypeOf(candidateType, target))
                    .orElseGet(() -> matchesExactType(candidateType, constraint));
        }
        return matchesExactType(candidateType, constraint);
    }

    private Optional<TypeSymbol> getSymbolType(Symbol symbol) {
        return switch (symbol.kind()) {
            case VARIABLE -> Optional.of(((VariableSymbol) symbol).typeDescriptor());
            case CLASS_FIELD -> Optional.of(((ClassFieldSymbol) symbol).typeDescriptor());
            default -> Optional.empty();
        };
    }

    private boolean matchesExactType(TypeSymbol typeSymbol, TypeConstraint constraint) {
        TypeSymbol rawType = CommonUtils.getRawType(typeSymbol);
        Optional<ModuleID> moduleId = rawType.getModule().map(module -> module.id());
        Optional<String> typeName = rawType.getName();
        if (moduleId.isEmpty() || typeName.isEmpty() || !typeName.get().equals(constraint.typeName())) {
            return false;
        }
        ModuleID id = moduleId.get();
        if (constraint.org() != null && !constraint.org().equals(id.orgName())) {
            return false;
        }
        if (constraint.packageName() != null && !constraint.packageName().equals(id.packageName())) {
            return false;
        }
        if (constraint.moduleName() != null && !constraint.moduleName().equals(id.moduleName())) {
            return false;
        }
        return constraint.version() == null
                || constraint.version().isBlank()
                || constraint.version().equals(id.version());
    }

    private Optional<TypeSymbol> resolveTypeConstraint(TypeConstraint constraint) {
        if (constraint.org() == null || constraint.moduleName() == null) {
            return Optional.empty();
        }
        return semanticModel.types()
                .typesInModule(constraint.org(), constraint.moduleName(),
                        constraint.version() == null ? "" : constraint.version())
                .flatMap(types -> Optional.ofNullable(types.get(constraint.typeName())))
                .flatMap(symbol -> {
                    if (symbol instanceof TypeDefinitionSymbol typeDefinitionSymbol) {
                        return Optional.of(typeDefinitionSymbol.typeDescriptor());
                    }
                    if (symbol instanceof TypeSymbol typeSymbol) {
                        return Optional.of(typeSymbol);
                    }
                    return Optional.empty();
                });
    }

    private record TypeConstraint(String org, String packageName, String moduleName, String typeName, String version,
                                  String match) {

        private static Optional<TypeConstraint> from(Map<String, String> queryMap) {
            if (queryMap == null) {
                return Optional.empty();
            }
            String typeName = queryMap.get(TYPE_NAME_FILTER);
            if (typeName == null || typeName.isBlank()) {
                return Optional.empty();
            }
            String match = queryMap.getOrDefault(TYPE_MATCH_FILTER, TYPE_MATCH_EXACT);
            return Optional.of(new TypeConstraint(
                    blankToNull(queryMap.get(TYPE_ORG_FILTER)),
                    blankToNull(queryMap.get(TYPE_PACKAGE_FILTER)),
                    blankToNull(queryMap.get(TYPE_MODULE_FILTER)),
                    typeName,
                    blankToNull(queryMap.get(TYPE_VERSION_FILTER)),
                    TYPE_MATCH_SUBTYPE.equals(match) ? TYPE_MATCH_SUBTYPE : TYPE_MATCH_EXACT
            ));
        }

        private static String blankToNull(String value) {
            return value == null || value.isBlank() ? null : value;
        }
    }

    /**
     * Builds a client from the given type symbol.
     *
     * @return the client if the type symbol is a client, otherwise empty
     */
    private Optional<FlowNode> buildConnection(Symbol symbol) {
        Function<NonTerminalNode, NonTerminalNode> getStatementNode;
        NonTerminalNode statementNode;
        TypeSymbol typeSymbol;
        String scope;
        Document document;
        Path docFilePath = null;

        switch (symbol.kind()) {
            case VARIABLE -> {
                getStatementNode = (NonTerminalNode node) -> node.parent().parent();
                typeSymbol = ((VariableSymbol) symbol).typeDescriptor();
                scope = Property.GLOBAL_SCOPE;
            }
            case CLASS_FIELD -> {
                getStatementNode = (NonTerminalNode node) -> node;
                typeSymbol = ((ClassFieldSymbol) symbol).typeDescriptor();
                scope = Property.SERVICE_SCOPE;
            }
            default -> {
                return Optional.empty();
            }
        }
        try {
            TypeSymbol typeDescriptorSymbol = ((TypeReferenceTypeSymbol) typeSymbol).typeDescriptor();
            if (!isClassOrObject(typeDescriptorSymbol)) {
                return Optional.empty();
            }
            Location location = symbol.getLocation().orElseThrow();
            docFilePath = project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                    project.sourceRoot().resolve(location.lineRange().fileName());
            DocumentId documentId = project.documentId(docFilePath);
            document = project.currentPackage().module(documentId.moduleId()).document(documentId);
            NonTerminalNode childNode =
                    symbol.getLocation().map(loc -> CommonUtils.getNode(document.syntaxTree(), loc.textRange()))
                            .orElseThrow();
            statementNode = getStatementNode.apply(childNode);
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
        if (statementNode == null) {
            return Optional.empty();
        }
        CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, scope, Map.of(), Map.of(),
                document.textDocument(), ModuleInfo.from(document.module().descriptor()), false,
                workspaceManager, docFilePath);
        statementNode.accept(codeAnalyzer);
        List<FlowNode> connections = codeAnalyzer.getFlowNodes();
        return connections.stream().findFirst();
    }

    private Optional<FlowNode> buildVariables(Symbol symbol) {
        Function<NonTerminalNode, NonTerminalNode> getStatementNode;
        NonTerminalNode statementNode;
        TypeSymbol typeSymbol;
        String scope;
        Document document;
        Path docFilePath = null;

        switch (symbol.kind()) {
            case VARIABLE -> {
                getStatementNode = (NonTerminalNode node) -> node.parent().parent();
                typeSymbol = ((VariableSymbol) symbol).typeDescriptor();
                scope = Property.GLOBAL_SCOPE;
            }
            case CLASS_FIELD -> {
                getStatementNode = (NonTerminalNode node) -> node;
                typeSymbol = ((ClassFieldSymbol) symbol).typeDescriptor();
                scope = Property.SERVICE_SCOPE;
            }
            default -> {
                return Optional.empty();
            }
        }
        try {
            TypeSymbol typeDescriptorSymbol = CommonUtils.getRawType(typeSymbol);
            if (isClassOrObject(typeDescriptorSymbol)) {
                return Optional.empty();
            }
            Location location = symbol.getLocation().orElseThrow();
            docFilePath = project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                    project.sourceRoot().resolve(location.lineRange().fileName());
            DocumentId documentId = project.documentId(docFilePath);
            document = project.currentPackage().module(documentId.moduleId()).document(documentId);
            NonTerminalNode childNode =
                    symbol.getLocation().map(loc -> CommonUtils.getNode(document.syntaxTree(), loc.textRange()))
                            .orElseThrow();
            statementNode = getStatementNode.apply(childNode);
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
        if (statementNode == null) {
            return Optional.empty();
        }
        CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, scope, Map.of(), Map.of(),
                document.textDocument(), ModuleInfo.from(document.module().descriptor()),
                false, workspaceManager, docFilePath);
        statementNode.accept(codeAnalyzer);
        List<FlowNode> connections = codeAnalyzer.getFlowNodes();
        return connections.stream().findFirst();
    }

    private Optional<FlowNode> buildFlowNode(Symbol symbol) {
        Function<NonTerminalNode, NonTerminalNode> getStatementNode;
        NonTerminalNode statementNode;
        TypeSymbol typeSymbol;
        String scope;
        Document document;
        Path docFilePath = null;

        switch (symbol.kind()) {
            case VARIABLE -> {
                getStatementNode = (NonTerminalNode node) -> node.parent().parent();
                typeSymbol = ((VariableSymbol) symbol).typeDescriptor();
                scope = Property.GLOBAL_SCOPE;
            }
            case CLASS_FIELD -> {
                ClassFieldSymbol classFieldSymbol = (ClassFieldSymbol) symbol;
                typeSymbol = classFieldSymbol.typeDescriptor();

                // Check if the field is initialized in init() function
                Optional<NonTerminalNode> initAssignment = getInitAssignmentNode(classFieldSymbol);
                if (initAssignment.isPresent()) {
                    // Field is initialized in init() - use the assignment statement node
                    scope = Property.SERVICE_INIT_SCOPE;
                    statementNode = initAssignment.get();

                    // Get the document for the assignment
                    try {
                        Location location = classFieldSymbol.getLocation().orElseThrow();
                        docFilePath = project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                                project.sourceRoot().resolve(location.lineRange().fileName());
                        DocumentId documentId = project.documentId(docFilePath);
                        document = project.currentPackage().module(documentId.moduleId()).document(documentId);
                    } catch (RuntimeException ignored) {
                        return Optional.empty();
                    }

                    // Process and return early
                    TypeSymbol typeDescriptorSymbol;
                    boolean shouldProcess = false;

                    try {
                        typeDescriptorSymbol = ((TypeReferenceTypeSymbol) typeSymbol).typeDescriptor();
                        shouldProcess = isClassOrObject(typeDescriptorSymbol);
                    } catch (ClassCastException e) {
                        // TypeReferenceTypeSymbol cast failed, this is fine
                    }

                    if (!shouldProcess) {
                        try {
                            typeDescriptorSymbol = CommonUtils.getRawType(typeSymbol);
                            shouldProcess = !isClassOrObject(typeDescriptorSymbol);
                        } catch (RuntimeException ignored) {
                            return Optional.empty();
                        }
                    }

                    if (!shouldProcess) {
                        return Optional.empty();
                    }

                    CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, scope, Map.of(), Map.of(),
                            document.textDocument(), ModuleInfo.from(document.module().descriptor()), false,
                            workspaceManager, docFilePath);
                    statementNode.accept(codeAnalyzer);
                    return codeAnalyzer.getFlowNodes().stream().findFirst();
                }

                // Not initialized in init() - use the field declaration
                getStatementNode = (NonTerminalNode node) -> node;
                scope = Property.SERVICE_SCOPE;
            }
            default -> {
                return Optional.empty();
            }
        }

        TypeSymbol typeDescriptorSymbol;
        boolean shouldProcess = false;

        try {
            // Try connection path (TypeReferenceTypeSymbol cast)
            typeDescriptorSymbol = ((TypeReferenceTypeSymbol) typeSymbol).typeDescriptor();
            shouldProcess = isClassOrObject(typeDescriptorSymbol);
        } catch (ClassCastException e) {
            // TypeReferenceTypeSymbol cast failed, this is fine
        }

        if (!shouldProcess) {
            // Try variable path with getRawType
            try {
                typeDescriptorSymbol = CommonUtils.getRawType(typeSymbol);
                shouldProcess = !isClassOrObject(typeDescriptorSymbol);
            } catch (RuntimeException ignored) {
                return Optional.empty();
            }
        }

        if (!shouldProcess) {
            return Optional.empty();
        }

        // Continue with common processing
        try {
            Location location = symbol.getLocation().orElseThrow();
            docFilePath = project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                    project.sourceRoot().resolve(location.lineRange().fileName());
            DocumentId documentId = project.documentId(docFilePath);
            document = project.currentPackage().module(documentId.moduleId()).document(documentId);
            NonTerminalNode childNode =
                    symbol.getLocation().map(loc -> CommonUtils.getNode(document.syntaxTree(), loc.textRange()))
                            .orElseThrow();
            statementNode = getStatementNode.apply(childNode);
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }

        if (statementNode == null) {
            return Optional.empty();
        }

        CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, scope, Map.of(), Map.of(),
                document.textDocument(), ModuleInfo.from(document.module().descriptor()), false,
                workspaceManager, docFilePath);
        statementNode.accept(codeAnalyzer);
        return codeAnalyzer.getFlowNodes().stream().findFirst();
    }

    /**
     * Gets the assignment statement node if a ClassFieldSymbol is initialized in an init() function.
     *
     * @param classFieldSymbol the class field symbol to check
     * @return Optional containing the assignment statement node if initialized in init(), empty otherwise
     */
    private Optional<NonTerminalNode> getInitAssignmentNode(ClassFieldSymbol classFieldSymbol) {
        try {
            // If the field has a default value at declaration, it's not initialized in init()
            if (classFieldSymbol.hasDefaultValue()) {
                return Optional.empty();
            }

            // Get all references to this field
            List<Location> references = semanticModel.references(classFieldSymbol);

            for (Location location : references) {
                try {
                    DocumentId documentId = project.documentId(
                            project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                                    project.sourceRoot().resolve(location.lineRange().fileName()));
                    Document document = project.currentPackage().module(documentId.moduleId()).document(documentId);
                    NonTerminalNode node = CommonUtils.getNode(document.syntaxTree(), location.textRange());

                    // Check if this reference is within an assignment statement
                    NonTerminalNode current = node;
                    while (current != null && current.kind() != SyntaxKind.ASSIGNMENT_STATEMENT) {
                        current = current.parent();
                    }

                    if (current == null || current.kind() != SyntaxKind.ASSIGNMENT_STATEMENT) {
                        continue;
                    }

                    NonTerminalNode assignmentNode = current;

                    // Now check if this assignment is within an init() function
                    current = current.parent();
                    while (current != null && current.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
                        current = current.parent();
                    }

                    if (current != null && current.kind() == SyntaxKind.OBJECT_METHOD_DEFINITION) {
                        FunctionDefinitionNode functionNode = (FunctionDefinitionNode) current;
                        if (functionNode.functionName().text().equals("init")) {
                            return Optional.of(assignmentNode);
                        }
                    }
                } catch (RuntimeException ignored) {
                    // Continue to next reference
                }
            }

            return Optional.empty();
        } catch (RuntimeException e) {
            // If we can't determine, return empty
            return Optional.empty();
        }
    }

    private boolean isClassOrObject(TypeSymbol typeSymbol) {
        if (typeSymbol.kind() == SymbolKind.CLASS) {
            if (((ClassSymbol) typeSymbol).qualifiers().contains(Qualifier.CLIENT) || isAgentClass(typeSymbol) ||
                    isAiFixedReturnAgent(typeSymbol) || isAiInferredReturnAgent(typeSymbol) ||
                    isAiVectorStore(typeSymbol) || isAiKnowledgeBase(typeSymbol) || isAiMemoryStore(typeSymbol)) {
                return true;
            }
        }
        if (typeSymbol.typeKind() == TypeDescKind.OBJECT) {
            return ((ObjectTypeSymbol) typeSymbol).qualifiers().contains(Qualifier.CLIENT);
        }
        return false;
    }
}
