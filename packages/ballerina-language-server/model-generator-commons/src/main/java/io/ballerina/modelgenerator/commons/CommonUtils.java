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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ArrayTypeSymbol;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.ConstantSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FutureTypeSymbol;
import io.ballerina.compiler.api.symbols.IntersectionTypeSymbol;
import io.ballerina.compiler.api.symbols.MapTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.StreamTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TableTypeSymbol;
import io.ballerina.compiler.api.symbols.TupleTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeDescTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.BindingPatternNode;
import io.ballerina.compiler.syntax.tree.BuiltinSimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.ChildNodeList;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.DoStatementNode;
import io.ballerina.compiler.syntax.tree.EnumMemberNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.InterpolationNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.RecordFieldWithDefaultValueNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.compiler.syntax.tree.TemplateExpressionNode;
import io.ballerina.compiler.syntax.tree.TypedBindingPatternNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleDescriptor;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import io.ballerina.projects.ProjectKind;
import io.ballerina.tools.diagnostics.DiagnosticInfo;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;
import org.eclipse.lsp4j.Diagnostic;
import org.eclipse.lsp4j.DiagnosticSeverity;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.jsonrpc.validation.NonNull;
import org.wso2.ballerinalang.compiler.tree.BLangPackage;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Common utility functions used in the project.
 *
 * @since 1.0.0
 */
public class CommonUtils {

    private static final String CENTRAL_ICON_URL = "https://bcentral-packageicons.azureedge.net/images/%s_%s_%s.png";
    private static final Pattern FULLY_QUALIFIED_MODULE_ID_PATTERN =
            Pattern.compile("(\\w+)/([\\w.]+):([^:]+):(\\w+)[|]?");
    private static final String KNOWLEDGE_BASE_TYPE_NAME = "KnowledgeBase";
    private static final String EMBEDDING_PROVIDER_TYPE_NAME = "EmbeddingProvider";
    private static final String MODEL_PROVIDER_TYPE_NAME = "ModelProvider";
    private static final String VECTOR_STORE_TYPE_NAME = "VectorStore";
    private static final String DATA_LOADER_TYPE_NAME = "DataLoader";
    private static final String CHUNKER_TYPE_NAME = "Chunker";
    private static final String MEMORY_TYPE_NAME = "Memory";
    private static final String ST_MEMORY_STORE_TYPE_NAME = "ShortTermMemoryStore";
    private static final String MCP_BASE_TOOL_KIT_TYPE_NAME = "McpBaseToolKit";
    private static final String BASE_AGENT_TYPE_NAME = "BaseAgent";
    private static final String FIXED_RETURN_AGENT_TYPE_NAME = "FixedReturnAgentType";
    private static final String INFERRED_RETURN_AGENT_TYPE_NAME = "InferredReturnAgentType";
    public static final String BALLERINA_ORG_NAME = "ballerina";
    public static final String BALLERINAX_ORG_NAME = "ballerinax";
    public static final String LANG_LIB_PREFIX = "lang.";
    private static final String UNKNOWN_TYPE = "Unknown Type";
    private static final String AI = "ai";
    private static final String AGENT = "Agent";
    private static final String AGENT_TOOL = "AgentTool";
    public static final String CONNECTOR_TYPE = "connectorType";
    public static final String PERSIST = "persist";
    public static final String PERSIST_MODEL_FILE = "persistModelFile";
    public static final String PERSIST_DB_CLIENT_FIELD = "dbClient";
    public static final String DEFAULT_PERSIST_MODEL_FILE = "model.bal";
    public static final String ABSTRACT_PERSIST_CLIENT = "AbstractPersistClient";
    public static final List<String> PERSIST_DB_DRIVERS = List.of("ballerinax/mysql", "ballerinax/postgresql",
            "ballerinax/oracledb", "ballerinax/mssql");
    public static final String AI_OPENAI = "ai.openai";
    public static final String AI_ANTHROPIC = "ai.anthropic";
    public static final String AI_DEEPSEEK = "ai.deepseek";
    public static final String AI_MISTRAL = "ai.mistral";
    public static final String AI_OLLAMA = "ai.ollama";
    public static final String AI_AZURE = "ai.azure";
    public static final List<String> AI_MODULE_NAMES = List.of(AI_OPENAI, AI_ANTHROPIC, AI_DEEPSEEK,
            AI_MISTRAL, AI_OLLAMA, AI_AZURE);

    private static final String DOUBLE_QUOTE = "\"";
    public static final Pattern STRING_TEMPLATE_PATTERN = Pattern.compile("string\\s*`.*`", Pattern.DOTALL);
    private static final String LS = System.lineSeparator();

    /**
     * Removes the quotes from the given string.
     *
     * @param inputString the input string
     * @return the string without quotes
     */
    public static String removeQuotes(String inputString) {
        return inputString.replaceAll("^\"|\"$", "");
    }

    public static String getProjectName(Document document) {
        return document.module().descriptor().packageName().value();
    }

    /**
     * Retrieves the type signature of the given type symbol.
     *
     * @param semanticModel the semantic model
     * @param typeSymbol    the type symbol
     * @param ignoreError   whether to ignore errors
     * @param moduleInfo    the default module descriptor
     * @return the type signature
     * @see #getTypeSignature(TypeSymbol, ModuleInfo)
     */
    public static String getTypeSignature(SemanticModel semanticModel, TypeSymbol typeSymbol, boolean ignoreError,
                                          ModuleInfo moduleInfo) {
        return switch (typeSymbol.typeKind()) {
            case COMPILATION_ERROR -> UNKNOWN_TYPE;
            case UNION -> {
                UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) typeSymbol;
                yield unionTypeSymbol.memberTypeDescriptors().stream()
                        .filter(memberType -> !ignoreError || !memberType.subtypeOf(semanticModel.types().ERROR))
                        .map(type -> getTypeSignature(semanticModel, type, ignoreError, moduleInfo))
                        .reduce((s1, s2) -> s1 + "|" + s2)
                        .orElse(getTypeSignature(unionTypeSymbol, moduleInfo));
            }
            // TODO: This only address how type descriptors work with dependent types. Need to extend this to improve
            //  on handling cases where functions take type descriptors as parameters.
            case TYPEDESC -> {
                TypeDescTypeSymbol typeDescTypeSymbol = (TypeDescTypeSymbol) typeSymbol;
                yield typeDescTypeSymbol.typeParameter()
                        .map(typeParameter -> getTypeSignature(semanticModel, typeParameter, ignoreError, null))
                        .orElse(getTypeSignature(typeDescTypeSymbol, moduleInfo));
            }
            default -> getTypeSignature(typeSymbol, moduleInfo);
        };
    }

    /**
     * Retrieves the type signature of the given type symbol.
     *
     * @param semanticModel the semantic model
     * @param typeSymbol    the type symbol
     * @param ignoreError   whether to ignore errors
     * @return the type signature
     * @see #getTypeSignature(TypeSymbol, ModuleInfo)
     */
    public static String getTypeSignature(SemanticModel semanticModel, TypeSymbol typeSymbol, boolean ignoreError) {
        return getTypeSignature(semanticModel, typeSymbol, ignoreError, null);
    }

    /**
     * Returns the processed type signature of the type symbol. It removes the organization and the package, and checks
     * if it is the default module which will remove the prefix.
     *
     * @param typeSymbol the type symbol
     * @param moduleInfo the default module name descriptor
     * @return the processed type signature
     */
    public static String getTypeSignature(TypeSymbol typeSymbol, ModuleInfo moduleInfo) {
        String text = typeSymbol.signature();
        StringBuilder newText = new StringBuilder();
        Matcher matcher = FULLY_QUALIFIED_MODULE_ID_PATTERN.matcher(text);
        int nextStart = 0;
        while (matcher.find()) {
            // Append up-to start of the match
            newText.append(text, nextStart, matcher.start(1));

            String modPart = matcher.group(2);
            int last = modPart.lastIndexOf(".");
            if (last != -1) {
                modPart = modPart.substring(last + 1);
            }

            String typeName = matcher.group(4);

            if (moduleInfo == null || !modPart.equals(moduleInfo.packageName())) {
                newText.append(modPart);
                newText.append(":");
            }
            newText.append(typeName);
            // Update next-start position
            nextStart = matcher.end(4);
        }
        // Append the remaining
        if (nextStart != 0 && nextStart < text.length()) {
            newText.append(text.substring(nextStart));
        }
        return !newText.isEmpty() ? newText.toString() : text;
    }

    /**
     * Returns the module name of the given symbol.
     *
     * @param symbol the symbol to get the module name
     * @return the module name
     */
    public static String getModuleName(Symbol symbol) {
        return symbol.getModule().flatMap(Symbol::getName).orElse("");
    }

    /**
     * Returns the organization name of the given symbol.
     *
     * @param symbol the symbol to get the organization name
     * @return the organization name
     */
    public static String getOrgName(Symbol symbol) {
        return symbol.getModule()
                .map(module -> module.id().orgName())
                .orElse("");
    }

    /**
     * Returns the expression node with check expression if exists.
     *
     * @param expressionNode the expression node
     * @return the expression node with check expression if exists
     */
    public static NonTerminalNode getExpressionWithCheck(NonTerminalNode expressionNode) {
        NonTerminalNode parentNode = expressionNode.parent();
        return parentNode.kind() == SyntaxKind.CHECK_EXPRESSION ? parentNode : expressionNode;
    }

    /**
     * Returns the node in the syntax tree for the given text range.
     *
     * @param syntaxTree the syntax tree in which the node resides
     * @param textRange  the text range of the node
     * @return the node in the syntax tree
     */
    public static NonTerminalNode getNode(SyntaxTree syntaxTree, TextRange textRange) {
        ModulePartNode modulePartNode = syntaxTree.rootNode();
        return modulePartNode.findNode(textRange, true);
    }

    /**
     * Converts a LineRange to a TextRange using the provided TextDocument.
     *
     * @param textDocument the text document
     * @param lineRange    the line range to convert
     * @return the corresponding TextRange
     */
    public static TextRange toTextRange(TextDocument textDocument, LineRange lineRange) {
        int start = textDocument.textPositionFrom(lineRange.startLine());
        int end = textDocument.textPositionFrom(lineRange.endLine());
        return TextRange.from(start, end - start);
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
     * Convert the syntax-node line range into a lsp4j range.
     *
     * @param line   start line
     * @param offset character offset
     * @return {@link Range} converted range
     */
    public static Range toRange(int line, int offset) {
        return toRange(LinePosition.from(line, offset));
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
     * @param start start line position
     * @param end   end line position
     * @return {@link Range} converted range
     */
    public static Range toRange(LinePosition start, LinePosition end) {
        return new Range(toPosition(start), toPosition(end));
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

    /**
     * Get the type symbol of the given node.
     *
     * @param semanticModel the semantic model
     * @param node          the node to get the type symbol
     * @return the type symbol
     */
    public static Optional<TypeSymbol> getTypeSymbol(SemanticModel semanticModel, Node node) {
        if (node.kind() == SyntaxKind.TYPED_BINDING_PATTERN) {
            TypedBindingPatternNode typedBindingPatternNode = (TypedBindingPatternNode) node;
            BindingPatternNode bindingPatternNode = typedBindingPatternNode.bindingPattern();

            Optional<Symbol> typeDescriptorSymbol = semanticModel.symbol(typedBindingPatternNode.typeDescriptor());
            if (typeDescriptorSymbol.isPresent() && typeDescriptorSymbol.get().kind() == SymbolKind.TYPE) {
                return Optional.of((TypeSymbol) typeDescriptorSymbol.get());
            }

            Optional<Symbol> bindingPatternSymbol = semanticModel.symbol(bindingPatternNode);
            if (bindingPatternSymbol.isPresent() && bindingPatternSymbol.get().kind() == SymbolKind.VARIABLE) {
                return Optional.ofNullable(((VariableSymbol) bindingPatternSymbol.get()).typeDescriptor());
            }
        }
        return semanticModel.typeOf(node);
    }

    /**
     * Get the variable name from the given node.
     *
     * @param node the node to get the variable name
     * @return the variable name
     */
    public static String getVariableName(Node node) {
        if (node.kind() == SyntaxKind.TYPED_BINDING_PATTERN) {
            return ((TypedBindingPatternNode) node).bindingPattern().toString().strip();
        }
        if (node instanceof BuiltinSimpleNameReferenceNode builtinSimpleNameReferenceNode) {
            return builtinSimpleNameReferenceNode.name().text();
        }
        if (node instanceof SimpleNameReferenceNode simpleNameReferenceNode) {
            return simpleNameReferenceNode.name().text();
        }
        return node.toString().strip();
    }

    /**
     * Returns the default value for the given API doc type.
     *
     * @param type the type to get the default value for
     * @return the default value for the given type
     */
    public static String getDefaultValueForType(String type) {
        if (type == null) {
            return "";
        }
        return switch (type) {
            case "inclusion", "record" -> "{}";
            case "string" -> "\"\"";
            default -> "";
        };
    }

    /**
     * Checks if the query map has no keyword.
     *
     * @param queryMap the query map to check
     * @return true if the query map has no keyword, false otherwise
     */
    public static boolean hasNoKeyword(Map<String, String> queryMap, String keyName) {
        return queryMap == null || queryMap.isEmpty() || !queryMap.containsKey(keyName) ||
                queryMap.get(keyName).isEmpty();
    }

    /**
     * Get the raw type of the type descriptor. If the type descriptor is a type reference then return the associated
     * type descriptor.
     *
     * @param typeDescriptor type descriptor to evaluate
     * @return {@link TypeSymbol} extracted type descriptor
     */
    public static TypeSymbol getRawType(TypeSymbol typeDescriptor) {
        if (typeDescriptor.typeKind() == TypeDescKind.INTERSECTION) {
            return getRawType(((IntersectionTypeSymbol) typeDescriptor).effectiveTypeDescriptor());
        }
        if (typeDescriptor.typeKind() == TypeDescKind.TYPE_REFERENCE) {
            TypeReferenceTypeSymbol typeRef = (TypeReferenceTypeSymbol) typeDescriptor;
            if (typeRef.typeDescriptor().typeKind() == TypeDescKind.INTERSECTION) {
                return getRawType(((IntersectionTypeSymbol) typeRef.typeDescriptor()).effectiveTypeDescriptor());
            }
            TypeSymbol rawType = typeRef.typeDescriptor();
            if (rawType.typeKind() == TypeDescKind.TYPE_REFERENCE) {
                return getRawType(rawType);
            }
            return rawType;
        }
        return typeDescriptor;
    }

    /**
     * Retrieves the document from the given project and location.
     *
     * @param project  the project to retrieve the document from
     * @param location the location of the document
     * @return the document at the specified location, or null if the file does not belong to the current project
     */
    public static Document getDocument(Project project, Location location) {
        try {
            DocumentId documentId = project.documentId(
                    project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? project.sourceRoot() :
                            project.sourceRoot().resolve(location.lineRange().fileName()));
            return project.currentPackage().getDefaultModule().document(documentId);
        } catch (ProjectException ex) {
            return null;
        }
    }

    /***
     * Check whether the given line range is within a do clause.
     *
     * @param workspaceManager the workspace manager
     * @param filePath the file path
     * @param lineRange the line range
     * @return true if the line range is within a do clause, false otherwise
     */
    public static boolean withinDoClause(WorkspaceManager workspaceManager, Path filePath, LineRange lineRange) {
        try {
            workspaceManager.loadProject(filePath);
            Document document = workspaceManager.document(filePath).orElseThrow();
            int startPos = document.textDocument().textPositionFrom(lineRange.startLine());
            int endPos = document.textDocument().textPositionFrom(lineRange.endLine());
            ModulePartNode node = document.syntaxTree().rootNode();
            NonTerminalNode currentNode = node.findNode(TextRange.from(startPos, endPos - startPos),
                    true);
            return withinDoClause(currentNode);
        } catch (Throwable t) {
            return false;
        }
    }

    /**
     * Check whether the given node is within a do clause.
     *
     * @param node the node to check
     * @return true if the node is within a do clause, false otherwise
     */
    public static boolean withinDoClause(NonTerminalNode node) {
        while (node != null) {
            if (node.kind() == SyntaxKind.DO_STATEMENT) {
                return ((DoStatementNode) node).onFailClause().isPresent();
            }
            node = node.parent();
        }
        return false;
    }

    /**
     * Generates the URL for the icon in the Ballerina central.
     *
     * @param orgName     the organization name
     * @param packageName the package name
     * @param versionName the version name
     * @return the URL for the icon
     */
    public static String generateIcon(String orgName, String packageName, String versionName) {
        return String.format(CENTRAL_ICON_URL, orgName, packageName, versionName);
    }

    /**
     * Extracts the database-specific icon URL from the persist client class by inspecting its fields.
     * The persist-generated client always has a private field (e.g., {@code private final postgresql:Client dbClient})
     * whose type's module carries the DB driver package info (org, packageName, version).
     *
     * @param persistClientClassSymbol the ClassSymbol of the persist-generated Client class
     * @return an Optional containing the icon URL for the underlying DB driver, or empty if not found
     */
    public static Optional<String> getPersistDatabaseIcon(ClassSymbol persistClientClassSymbol) {
        for (Map.Entry<String, ClassFieldSymbol> entry : persistClientClassSymbol.fieldDescriptors().entrySet()) {
            if (!PERSIST_DB_CLIENT_FIELD.equals(entry.getKey())) {
                continue;
            }
            ClassFieldSymbol fieldSymbol = entry.getValue();
            TypeSymbol fieldType = getRawType(fieldSymbol.typeDescriptor());
            if (!(fieldType instanceof ClassSymbol)) {
                continue;
            }
            Optional<ModuleSymbol> moduleOpt = fieldType.getModule();
            if (moduleOpt.isEmpty()) {
                continue;
            }
            ModuleID id = moduleOpt.get().id();
            if (!PERSIST_DB_DRIVERS.contains(id.orgName() + "/" + id.packageName())) {
                continue;
            }
            return Optional.of(generateIcon(id.orgName(), id.packageName(), id.version()));

        }
        return Optional.empty();
    }

    /**
     * Check whether the given type is a subtype of the target type.
     *
     * @param source the source type
     * @param target the target type
     * @return true if the source type is a subtype of the target type, false otherwise
     */
    public static boolean subTypeOf(TypeSymbol source, TypeSymbol target) {
        TypeSymbol sourceRawType = CommonUtils.getRawType(source);
        switch (sourceRawType.typeKind()) {
            case UNION -> {
                UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) sourceRawType;
                return unionTypeSymbol.memberTypeDescriptors().stream().anyMatch(type -> subTypeOf(type, target));
            }
            case TYPEDESC -> {

            }
            case INTERSECTION -> {
                IntersectionTypeSymbol intersectionTypeSymbol = (IntersectionTypeSymbol) sourceRawType;
                return intersectionTypeSymbol.memberTypeDescriptors().stream()
                        .anyMatch(t -> subTypeOf(t, target));
            }
            case TYPE_REFERENCE -> {
                return subTypeOf(sourceRawType, target);
            }
            default -> {
                return sourceRawType.subtypeOf(target);
            }
        }
        return sourceRawType.subtypeOf(target);
    }

    //TODO: Remove this once the diagnostic helper is exposed to LS extensions
    public static Diagnostic transformBallerinaDiagnostic(io.ballerina.tools.diagnostics.Diagnostic diag) {
        DiagnosticInfo diagnosticInfo = diag.diagnosticInfo();
        return createDiagnostic(diag.message(), diag.location().lineRange(), diagnosticInfo.code(),
                diagnosticInfo.severity());
    }

    public static Diagnostic createDiagnostic(String message, LineRange lineRange, DiagnosticErrorCode errorCode) {
        return createDiagnostic(message, lineRange, errorCode.diagnosticId(), errorCode.severity());
    }

    public static Diagnostic createDiagnostic(String message, LineRange lineRange, String code,
                                              io.ballerina.tools.diagnostics.DiagnosticSeverity severity) {
        int startLine = lineRange.startLine().line();
        int startChar = lineRange.startLine().offset();
        int endLine = lineRange.endLine().line();
        int endChar = lineRange.endLine().offset();

        endLine = (endLine <= 0) ? startLine : endLine;
        endChar = (endChar <= 0) ? startChar + 1 : endChar;

        Range range = new Range(new Position(startLine, startChar), new Position(endLine, endChar));
        Diagnostic diagnostic = new Diagnostic(range, message, null, null, code);

        switch (severity) {
            case ERROR -> diagnostic.setSeverity(DiagnosticSeverity.Error);
            case WARNING -> diagnostic.setSeverity(DiagnosticSeverity.Warning);
            case HINT -> diagnostic.setSeverity(DiagnosticSeverity.Hint);
            case INFO -> diagnostic.setSeverity(DiagnosticSeverity.Information);
            default -> {
                // Ignored
            }
        }
        return diagnostic;
    }

    /**
     * Get the line range of a block node, excluding the opening and closing braces if they exist.
     *
     * @param node the block node
     * @return the line range of the block node
     */
    public static LineRange getLineRangeOfBlockNode(NonTerminalNode node) {
        ChildNodeList children = node.children();
        int size = children.size();

        if (size < 2) {
            return node.lineRange();
        }

        Node startToken = children.get(0);
        Node endToken = children.get(size - 1);

        if (startToken.kind() == SyntaxKind.OPEN_BRACE_TOKEN && endToken.kind() == SyntaxKind.CLOSE_BRACE_TOKEN) {
            return LineRange.from(node.lineRange().fileName(), startToken.lineRange().endLine(),
                    endToken.lineRange().startLine());
        }
        return node.lineRange();
    }

    /**
     * Checks if the given symbol belongs to the default package.
     *
     * @param symbol     the symbol to check
     * @param moduleInfo the module descriptor of the current module
     * @return true if the symbol belongs to the default package, false otherwise
     * @see #isDefaultPackage(String, String, ModuleInfo)
     */
    public static boolean isDefaultPackage(Symbol symbol, ModuleInfo moduleInfo) {
        Optional<ModuleID> moduleId = symbol.getModule().map(ModuleSymbol::id);
        return moduleId.filter(
                moduleID -> isDefaultPackage(moduleID.orgName(), moduleID.moduleName(), moduleInfo)).isPresent();
    }

    /**
     * Checks if the given module is the default package.
     *
     * @param orgName     the organization name
     * @param packageName the package name
     * @param moduleInfo  the module descriptor of the current module
     * @return true if the module is the default package, false otherwise
     */
    public static boolean isDefaultPackage(String orgName, String packageName, ModuleInfo moduleInfo) {
        return (orgName.equals(moduleInfo.org()) && packageName.equals(moduleInfo.packageName()));
    }

    /**
     * Checks if the given line position is after another line position.
     *
     * @param position the line position to check
     * @param other    the other line position to compare against
     * @return true if the given line position is after the other line position, false otherwise
     */
    public static boolean isLinePositionAfter(LinePosition position, LinePosition other) {
        return position.line() > other.line() ||
                (position.line() == other.line() && position.offset() > other.offset());
    }

    /**
     * Checks if the given type name has a return type.
     *
     * @param typeName the type name to check
     * @return true if the type name has a return type, false otherwise
     */
    public static boolean hasReturn(String typeName) {
        return !typeName.equals("()");
    }

    /**
     * Generates the URI for the given source path.
     *
     * @param sourcePath the source path
     * @return the generated URI as a string
     */
    public static String getExprUri(String sourcePath) {
        String exprUriString = "expr" + Paths.get(sourcePath).toUri().toString().substring(4);
        return URI.create(exprUriString).toString();
    }

    /**
     * Generates a comma-separated list of import statements required for the given type symbol.
     *
     * @param typeSymbol the type symbol to analyze
     * @param moduleInfo the module information of the current module
     * @return an Optional containing comma-separated list of import statements, or empty if no imports needed
     */
    public static Optional<String> getImportStatements(TypeSymbol typeSymbol, ModuleInfo moduleInfo) {
        Set<String> imports = new HashSet<>();
        analyzeTypeSymbolForImports(imports, typeSymbol, moduleInfo);
        if (imports.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(String.join(",", imports));
    }

    private static void analyzeTypeSymbolForImports(Set<String> imports, TypeSymbol typeSymbol,
                                                    ModuleInfo moduleInfo) {
        switch (typeSymbol.typeKind()) {
            case UNION -> {
                UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) typeSymbol;
                unionTypeSymbol.memberTypeDescriptors()
                        .forEach(memberType -> analyzeTypeSymbolForImports(imports, memberType, moduleInfo));
            }
            case INTERSECTION -> {
                IntersectionTypeSymbol intersectionTypeSymbol = (IntersectionTypeSymbol) typeSymbol;
                intersectionTypeSymbol.memberTypeDescriptors()
                        .forEach(memberType -> analyzeTypeSymbolForImports(imports, memberType, moduleInfo));
            }
            case TABLE -> {
                TableTypeSymbol tableTypeSymbol = (TableTypeSymbol) typeSymbol;
                analyzeTypeSymbolForImports(imports, tableTypeSymbol.rowTypeParameter(), moduleInfo);
                tableTypeSymbol.keyConstraintTypeParameter()
                        .ifPresent(keyType -> analyzeTypeSymbolForImports(imports, keyType, moduleInfo));
            }
            case TUPLE -> {
                TupleTypeSymbol tupleTypeSymbol = (TupleTypeSymbol) typeSymbol;
                tupleTypeSymbol.memberTypeDescriptors()
                        .forEach(memberType -> analyzeTypeSymbolForImports(imports, memberType, moduleInfo));
            }
            case STREAM -> {
                StreamTypeSymbol streamTypeSymbol = (StreamTypeSymbol) typeSymbol;
                analyzeTypeSymbolForImports(imports, streamTypeSymbol.typeParameter(), moduleInfo);
                analyzeTypeSymbolForImports(imports, streamTypeSymbol.completionValueTypeParameter(), moduleInfo);
            }
            case FUTURE -> {
                FutureTypeSymbol futureTypeSymbol = (FutureTypeSymbol) typeSymbol;
                futureTypeSymbol.typeParameter()
                        .ifPresent(typeParam -> analyzeTypeSymbolForImports(imports, typeParam, moduleInfo));
            }
            case TYPEDESC -> {
                TypeDescTypeSymbol typeDescTypeSymbol = (TypeDescTypeSymbol) typeSymbol;
                typeDescTypeSymbol.typeParameter()
                        .ifPresent(typeParam -> analyzeTypeSymbolForImports(imports, typeParam, moduleInfo));
            }
            case ARRAY -> {
                ArrayTypeSymbol arrayTypeSymbol = (ArrayTypeSymbol) typeSymbol;
                analyzeTypeSymbolForImports(imports, arrayTypeSymbol.memberTypeDescriptor(), moduleInfo);
            }
            case MAP -> {
                MapTypeSymbol memberTypeSymbol = (MapTypeSymbol) typeSymbol;
                analyzeTypeSymbolForImports(imports, memberTypeSymbol.typeParam(), moduleInfo);
            }
            default -> {
                Optional<ModuleSymbol> moduleSymbol = typeSymbol.getModule();
                if (moduleSymbol.isEmpty()) {
                    return;
                }
                ModuleID moduleId = moduleSymbol.get().id();
                String orgName = moduleId.orgName();
                String packageName = moduleId.packageName();
                String moduleName = moduleId.moduleName();
                String modulePrefix = moduleId.modulePrefix();

                if (isPredefinedLangLib(orgName, packageName) || isAnnotationLangLib(orgName, packageName) ||
                        isWithinCurrentModule(moduleInfo, orgName, packageName, moduleName)) {
                    return;
                }

                // Check if this is within the current package
                if (orgName.equals(moduleInfo.org()) && modulePrefix.equals((moduleInfo.moduleName()))) {
                    imports.add(getImportStatement("", packageName, modulePrefix));
                } else {
                    imports.add(getImportStatement(orgName, packageName, moduleName));
                }
            }
        }
    }

    private static boolean isAnnotationLangLib(String orgName, String packageName) {
        return orgName.equals(CommonUtil.BALLERINA_ORG_NAME) && packageName.equals("lang.annotations");
    }

    /**
     * Generates the import statement  of the format `<org>/<package>[.<module>]`.
     *
     * @param orgName     the organization name
     * @param packageName the package name
     * @param moduleName  the module name
     * @return the import statement
     */
    public static String getImportStatement(String orgName, String packageName, String moduleName) {
        StringBuilder importStatement = new StringBuilder();
        if (!orgName.isEmpty()) {
            importStatement.append(orgName).append("/");
        }
        if (moduleName != null && moduleName.startsWith(packageName + ".")) {
            importStatement.append(moduleName);
        } else if (moduleName != null && !packageName.equals(moduleName)) {
            importStatement.append(packageName).append(".").append(moduleName);
        } else {
            importStatement.append(packageName);
        }
        return importStatement.toString();
    }

    /**
     * Checks if the given module is a predefined language library.
     *
     * @param orgName     the organization name
     * @param packageName the package name
     * @return true if the module is a predefined language library, false otherwise
     */
    public static boolean isPredefinedLangLib(String orgName, String packageName) {
        return orgName.equals(CommonUtil.BALLERINA_ORG_NAME) &&
                CommonUtil.PRE_DECLARED_LANG_LIBS.contains(packageName);
    }

    private static boolean isWithinCurrentModule(ModuleInfo defaultModuleInfo, String orgName, String packageName,
                                                 String moduleName) {
        return orgName.equals(defaultModuleInfo.org()) &&
                packageName.equals(defaultModuleInfo.packageName()) &&
                moduleName.equals(defaultModuleInfo.moduleName());
    }

    /**
     * Checks if the given symbol is within the given package.
     *
     * @param symbol     the symbol to check
     * @param moduleInfo the module descriptor of the current module
     * @return true if the symbol is within the given package, false otherwise
     */
    public static boolean isWithinPackage(Symbol symbol, ModuleInfo moduleInfo) {
        if (symbol.getModule().isEmpty()) {
            return false;
        }
        ModuleID moduleID = symbol.getModule().get().id();
        return moduleID.orgName().equals(moduleInfo.org()) &&
                moduleID.packageName().equals(moduleInfo.packageName());
    }

    /**
     * Checks if the given symbol is within the given package module.
     *
     * @param symbol     the symbol to check
     * @param moduleInfo the module descriptor of the current module
     * @return true if the symbol is within the given package module, false otherwise
     */
    public static boolean isWithinPackageModule(Symbol symbol, ModuleInfo moduleInfo) {
        if (symbol.getModule().isEmpty()) {
            return false;
        }
        ModuleID moduleID = symbol.getModule().get().id();
        return moduleID.orgName().equals(moduleInfo.org()) &&
                moduleID.packageName().equals(moduleInfo.packageName()) &&
                moduleID.moduleName().equals(moduleInfo.moduleName());
    }

    /**
     * Converts a multi-line string into a formatted Ballerina documentation. Each line starts with a "#".
     *
     * @param text The input string.
     * @return The formatted Ballerina documentation string.
     */
    public static String convertToBalDocs(String text) {
        // Split the input text into lines
        String[] lines = text.split("\n");

        // Use StringBuilder for efficient string manipulation
        StringBuilder formattedComment = new StringBuilder();

        // Add "#" before each line and append to the result
        for (String line : lines) {
            formattedComment.append("# ").append(line).append(System.lineSeparator());
        }

        // Convert StringBuilder to String and return
        return formattedComment.toString();
    }

    /**
     * Checks if the given function symbol is a value language library function.
     *
     * @param functionSymbol the function symbol to check
     * @return true if the function symbol is a value language library function, false otherwise
     */
    public static boolean isValueLangLibFunction(FunctionSymbol functionSymbol) {
        Optional<ModuleSymbol> module = functionSymbol.getModule();
        if (module.isEmpty()) {
            return false;
        }
        ModuleID id = module.get().id();
        return id.orgName().equals(BALLERINA_ORG_NAME) && id.packageName().startsWith(LANG_LIB_PREFIX);
    }

    /**
     * Check whether the given symbol is a http module.
     *
     * @param symbol symbol to check
     * @return true if the symbol is a http module, false otherwise
     */
    public static boolean isHttpModule(Symbol symbol) {
        Optional<ModuleSymbol> module = symbol.getModule();
        if (module.isEmpty()) {
            return false;
        }

        ModuleID moduleId = module.get().id();
        return moduleId.orgName().equals(CommonUtils.BALLERINA_ORG_NAME) && moduleId.packageName().equals("http");
    }

    public static boolean isBallerinaAiModule(Symbol symbol) {
        Optional<ModuleSymbol> module = symbol.getModule();
        if (module.isEmpty()) {
            return false;
        }

        ModuleID moduleId = module.get().id();
        return moduleId.orgName().equals(CommonUtils.BALLERINA_ORG_NAME) && moduleId.packageName().equals("ai");
    }

    public static boolean isNaturalExpressionBodiedFunction(SyntaxTree syntaxTree, FunctionSymbol functionSymbol) {
        if (functionSymbol.getLocation().isEmpty()) {
            return false;
        }
        NonTerminalNode node = getNode(syntaxTree, functionSymbol.getLocation().get().textRange());
        if (node.kind() != SyntaxKind.FUNCTION_DEFINITION) {
            return false;
        }
        FunctionDefinitionNode functionDefNode = (FunctionDefinitionNode) node;
        return BallerinaCompilerApi.getInstance().isNaturalExpressionBodiedFunction(functionDefNode);
    }

    public static String getClassType(String packageName, String clientName) {
        String importPrefix = packageName.substring(packageName.lastIndexOf('.') + 1);
        return String.format("%s:%s", importPrefix, clientName);
    }

    /**
     * Returns the specified position if not null, or the end of the document otherwise.
     *
     * @param position The line position to check; if not null, it is returned as is
     * @param document The document to get the end position from if the position parameter is null
     * @return The original position if not null, or the line position at the end of the document
     */
    public static LinePosition getPosition(LinePosition position, Document document) {
        if (position != null) {
            return position;
        }

        // Get the end of the document
        TextDocument textDocument = document.textDocument();
        int textPosition = textDocument.toCharArray().length;
        return textDocument.linePositionFrom(textPosition);
    }

    /**
     * Extracts the default module prefix from a package name. The prefix is the last segment of the package name after
     * splitting by dots.
     *
     * @param packageName The fully qualified package name to extract the prefix from
     * @return The last segment of the package name as the default module prefix
     */
    public static String getDefaultModulePrefix(String packageName) {
        String[] parts = packageName.split("\\.");
        return parts.length > 0 ? parts[parts.length - 1] : packageName;
    }

    /**
     * Constructs a fully qualified ID from a module descriptor in the format:
     * <org>/<package-name>.<module-name>:<version>
     *
     * @param descriptor The module descriptor to construct ID from
     * @return The formatted ID string
     */
    public static String constructModuleId(ModuleDescriptor descriptor) {
        StringBuilder idBuilder = new StringBuilder();

        // Add organization
        idBuilder.append(descriptor.org().value()).append('/');

        // Add package name
        idBuilder.append(descriptor.name().packageName().value());

        // Add module name if it's not the default module
        String moduleNamePart = descriptor.name().moduleNamePart();
        if (moduleNamePart != null && !moduleNamePart.isEmpty()) {
            idBuilder.append('.').append(moduleNamePart);
        }

        // Add version
        idBuilder.append(':').append(descriptor.version());

        return idBuilder.toString();
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
     * Checks whether the given same-package module import exists in the given module part node.
     * This handles imports of the form {@code import mypackage.submodule;} which have no org name.
     *
     * @param node   module part node
     * @param module full module name (e.g. {@code mypackage.submodule})
     * @return true if the import exists, false otherwise
     */
    public static boolean importExists(ModulePartNode node, String module) {
        return node.imports().stream().anyMatch(importDeclarationNode -> {
            String moduleName = importDeclarationNode.moduleName().stream()
                    .map(IdentifierToken::text)
                    .collect(Collectors.joining("."));
            return importDeclarationNode.orgName().isEmpty() && module.equals(moduleName);
        });
    }

    /**
     * Checks whether the given import exists in the given blangPackage.
     *
     * @param blangPackage blangPackage
     * @param org          organization name
     * @param module       module name
     * @return true if the import exists, false otherwise
     */
    public static boolean importExists(BLangPackage blangPackage, String org, String module) {
        return blangPackage.imports.stream().anyMatch(importDeclarationNode ->
                org.equals(importDeclarationNode.orgName.value) &&
                        module.equals(importDeclarationNode.pkgNameComps.stream()
                                .map(identifierNode -> identifierNode.value)
                                .collect(Collectors.joining("."))));
    }

    public static boolean isAiModule(String org, String module) {
        return (BALLERINAX_ORG_NAME.equals(org) || BALLERINA_ORG_NAME.equals(org)) && module.equals(AI);
    }

    public static boolean isAiModelModule(String org, String module) {
        return BALLERINAX_ORG_NAME.equals(org) && (AI.equals(module) || AI_MODULE_NAMES.contains(module));
    }

    public static boolean isAgentToolFunction(Symbol symbol) {
        if (!(symbol instanceof FunctionSymbol functionSymbol)) {
            return false;
        }
        for (AnnotationAttachmentSymbol annotAttachment : functionSymbol.annotAttachments()) {
            AnnotationSymbol annotationSymbol = annotAttachment.typeDescriptor();
            Optional<ModuleSymbol> optModule = annotationSymbol.getModule();
            if (optModule.isEmpty()) {
                continue;
            }
            ModuleID id = optModule.get().id();
            if (isAiModule(id.orgName(), id.packageName())
                    && annotationSymbol.getName().filter(AGENT_TOOL::equals).isPresent()) {
                return true;
            }
        }
        return false;
    }

    public static boolean isAgentClass(Symbol symbol) {
        Optional<ModuleSymbol> optModule = symbol.getModule();
        if (optModule.isEmpty()) {
            return false;
        }
        ModuleID id = optModule.get().id();
        if (!isAiModule(id.orgName(), id.packageName())) {
            return false;
        }

        return symbol.getName().isPresent() && symbol.getName().get().equals(AGENT);
    }

    public static boolean isAiFixedReturnAgent(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, FIXED_RETURN_AGENT_TYPE_NAME);
    }

    public static boolean isAiInferredReturnAgent(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, INFERRED_RETURN_AGENT_TYPE_NAME);
    }

    public static boolean isAiAgentType(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && (hasAiAgentTypeInclusion(classSymbol, BASE_AGENT_TYPE_NAME)
                || hasAiAgentTypeInclusion(classSymbol, FIXED_RETURN_AGENT_TYPE_NAME)
                || hasAiAgentTypeInclusion(classSymbol, INFERRED_RETURN_AGENT_TYPE_NAME));
    }

    public static boolean isAiKnowledgeBase(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, KNOWLEDGE_BASE_TYPE_NAME);
    }

    public static boolean isAiVectorStore(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, VECTOR_STORE_TYPE_NAME);
    }

    public static boolean isAiModelProvider(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, MODEL_PROVIDER_TYPE_NAME);
    }

    public static boolean isAiEmbeddingProvider(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, EMBEDDING_PROVIDER_TYPE_NAME);
    }

    public static boolean isAiDataLoader(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, DATA_LOADER_TYPE_NAME);
    }

    public static boolean isAiChunker(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, CHUNKER_TYPE_NAME);
    }

    public static boolean isAiMemory(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && (hasAiTypeInclusion(classSymbol, MEMORY_TYPE_NAME) ||
                hasBallerinaxAiTypeInclusion(classSymbol, MEMORY_TYPE_NAME));
    }

    public static boolean isAiMemoryStore(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, ST_MEMORY_STORE_TYPE_NAME);
    }

    public static boolean isAiMcpBaseToolKit(Symbol symbol) {
        ClassSymbol classSymbol = getClassSymbol(symbol);
        return classSymbol != null && hasAiTypeInclusion(classSymbol, MCP_BASE_TOOL_KIT_TYPE_NAME);
    }

    /**
     * Checks if the given class symbol is a subtype of AbstractPersistClient from the ballerina/persist module.
     *
     * @param semanticModel the semantic model used to resolve types
     * @param functionData  the function data containing module and organization information
     * @param name          the name of the class symbol to check
     * @return true if the class symbol is a subtype of AbstractPersistClient, false otherwise
     */
    public static boolean isPersistClient(SemanticModel semanticModel, FunctionData functionData, String name) {
        Optional<Map<String, Symbol>> moduleTypesOpt = semanticModel.types()
                .typesInModule(functionData.org(), functionData.moduleName(), functionData.version());
        if (moduleTypesOpt.isEmpty()) {
            return false;
        }

        Map<String, Symbol> moduleTypes = moduleTypesOpt.get();
        Symbol symbol = moduleTypes.get(name);
        if (!(symbol instanceof ClassSymbol classSymbol)) {
            return false;
        }

        return isPersistClient(classSymbol, semanticModel);
    }

    /**
     * Looks up a {@link ClassSymbol} by name within the module described by the given {@link FunctionData}.
     * This is used to retrieve the client class (e.g. a persist client) associated with a function call
     * so that additional metadata (like persist model file paths) can be derived from it.
     *
     * @param semanticModel the semantic model of the current compilation
     * @param functionData  function metadata containing the org, module name, and version to look up
     * @param name          the unqualified class name to look up within the module
     * @return an {@link Optional} containing the {@link ClassSymbol} if found, or empty otherwise
     */
    public static Optional<ClassSymbol> getClientClassSymbol(SemanticModel semanticModel, FunctionData functionData,
                                                             String name) {
        Optional<Map<String, Symbol>> moduleTypesOpt = semanticModel.types()
                .typesInModule(functionData.org(), functionData.moduleName(), functionData.version());
        if (moduleTypesOpt.isEmpty()) {
            return Optional.empty();
        }

        Map<String, Symbol> moduleTypes = moduleTypesOpt.get();
        Symbol symbol = moduleTypes.get(name);
        if (!(symbol instanceof ClassSymbol classSymbol)) {
            return Optional.empty();
        }

        return Optional.of(classSymbol);
    }

    /**
     * Checks if the given class symbol is a subtype of AbstractPersistClient from the ballerina/persist module.
     *
     * @param classSymbol   the class symbol to check
     * @param semanticModel the semantic model used to resolve types
     * @return true if the class symbol is a subtype of AbstractPersistClient, false otherwise
     */
    public static boolean isPersistClient(ClassSymbol classSymbol, SemanticModel semanticModel) {
        Optional<Map<String, Symbol>> persistTypesOpt = semanticModel.types()
                .typesInModule(BALLERINA_ORG_NAME, PERSIST, "");
        if (persistTypesOpt.isEmpty()) {
            return false;
        }

        Map<String, Symbol> persistTypes = persistTypesOpt.get();
        Symbol abstractClientSymbol = persistTypes.get(ABSTRACT_PERSIST_CLIENT);
        if (!(abstractClientSymbol instanceof TypeDefinitionSymbol abstractClientTypeDefSymbol)) {
            return false;
        }

        return classSymbol.subtypeOf(abstractClientTypeDefSymbol.typeDescriptor());
    }

    /**
     * Extracts a user-friendly label for a persist client from its module name.
     *
     * @param packageName the package name of the persist module
     * @param moduleName  the full module name of the persist client
     * @return an Optional containing the formatted client label, or empty if extraction fails
     */
    public static Optional<String> getPersistClientLabel(String packageName, String moduleName) {
        if (packageName == null || packageName.isEmpty() || moduleName == null ||
                !moduleName.startsWith(packageName + ".")) {
            return Optional.empty();
        }
        String modulePartName = moduleName.substring(packageName.length() + 1);
        // The modulePartName follows the pattern <database-type>.<database-name>
        if (modulePartName.isEmpty()) {
            return Optional.empty();
        }
        String[] moduleParts = modulePartName.split("\\.");
        if (moduleParts.length == 2 && !moduleParts[0].isEmpty() && !moduleParts[1].isEmpty()) {
            String dbType = moduleParts[0];
            String dbName = moduleParts[1];
            return Optional.of(getPersistDatabaseName(dbType) + " " + dbName);
        }
        return Optional.empty();
    }

    private static String getPersistDatabaseName(String dbType) {
        // Currently persist supports only PostgreSQL, MySQL and MSSQL
        return switch (dbType.toLowerCase(Locale.getDefault())) {
            case "postgresql" -> "Postgres";
            case "mysql" -> "MySQL";
            case "mssql" -> "MSSQL";
            default -> dbType.substring(0, 1).toUpperCase(Locale.getDefault()) + dbType.substring(1);
        };
    }

    /**
     * Retrieves the file path of the persist model file in the given project directory.
     *
     * @param projectPath the path to the project directory as a string
     * @param classSymbol the class symbol representing the persist model
     * @return an Optional containing the file path if it exists, or empty if not found
     */
    public static Optional<String> getPersistModelFilePath(String projectPath, ClassSymbol classSymbol) {
        if (projectPath == null || projectPath.isEmpty()) {
            return Optional.empty();
        }
        return getPersistModelFilePath(Path.of(projectPath), classSymbol);
    }

    /**
     * Retrieves the file path of the persist model file in the given project directory.
     *
     * @param projectPath the path to the project directory
     * @param classSymbol the class symbol representing the persist model
     * @return an Optional containing the file path if it exists, or empty if not found
     */
    public static Optional<String> getPersistModelFilePath(Path projectPath, ClassSymbol classSymbol) {
        Optional<ModuleSymbol> module = classSymbol.getModule();
        if (module.isEmpty()) {
            return Optional.empty();
        }
        String modelName = module.get().id().modulePrefix();
        Path persistModelPath = projectPath.resolve(PERSIST)
                .resolve(modelName)
                .resolve(DEFAULT_PERSIST_MODEL_FILE)
                .toAbsolutePath();
        if (!Files.exists(persistModelPath)) {
            return Optional.empty();
        }
        return Optional.of(persistModelPath.toString());
    }

    private static ClassSymbol getClassSymbol(Symbol symbol) {
        if (symbol instanceof ClassSymbol classSymbol) {
            return classSymbol;
        }
        TypeSymbol typeDescriptor;
        if (symbol instanceof VariableSymbol variableSymbol) {
            typeDescriptor = variableSymbol.typeDescriptor();
        } else if (symbol instanceof ParameterSymbol parameterSymbol) {
            typeDescriptor = parameterSymbol.typeDescriptor();
        } else {
            return null;
        }
        if (typeDescriptor instanceof TypeReferenceTypeSymbol typeRef
                && typeRef.typeDescriptor() instanceof ClassSymbol classSymbol) {
            return classSymbol;
        }
        return null;
    }

    private static boolean hasAiTypeInclusion(ClassSymbol classSymbol, String includedTypeName) {
        return classSymbol.typeInclusions().stream()
                .filter(typeSymbol -> typeSymbol instanceof TypeReferenceTypeSymbol)
                .map(typeSymbol -> (TypeReferenceTypeSymbol) typeSymbol)
                .filter(typeRef -> typeRef.definition().nameEquals(includedTypeName))
                .map(TypeSymbol::getModule)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .anyMatch(moduleId -> (BALLERINA_ORG_NAME.equals(moduleId.id().orgName())) &&
                        AI.equals(moduleId.id().moduleName()));
    }

    private static boolean hasAiAgentTypeInclusion(ClassSymbol classSymbol, String includedTypeName) {
        return classSymbol.typeInclusions().stream()
                .filter(typeSymbol -> typeSymbol instanceof TypeReferenceTypeSymbol)
                .map(typeSymbol -> (TypeReferenceTypeSymbol) typeSymbol)
                .filter(typeRef -> typeRef.definition().nameEquals(includedTypeName))
                .map(TypeSymbol::getModule)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .anyMatch(moduleSymbol -> isAiModule(moduleSymbol.id().orgName(), moduleSymbol.id().moduleName()));
    }

    private static boolean hasBallerinaxAiTypeInclusion(ClassSymbol classSymbol, String includedTypeName) {
        return classSymbol.typeInclusions().stream()
                .filter(typeSymbol -> typeSymbol instanceof TypeReferenceTypeSymbol)
                .map(typeSymbol -> (TypeReferenceTypeSymbol) typeSymbol)
                .filter(typeRef -> typeRef.definition().nameEquals(includedTypeName))
                .map(TypeSymbol::getModule)
                .filter(Optional::isPresent)
                .map(Optional::get)
                .anyMatch(moduleId -> BALLERINAX_ORG_NAME.equals(moduleId.id().orgName()) &&
                        AI.equals(moduleId.id().moduleName()));
    }

    /**
     * Extracts the default package name from a module signature. i.e. if ballerina/lang.value:1.0.0 -> value,
     * ballerina/io:1.0.0 -> io
     *
     * @param moduleId The module signature to extract the package name from
     * @return The last segment of the module name as the package name
     */
    public static String getPackageName(String moduleId) {
        String moduleName = moduleId.split("/")[1].split(":")[0];
        int lastDot = moduleName.lastIndexOf('.');
        if (lastDot > 0) {
            return moduleName.substring(lastDot + 1);
        }
        return moduleName;
    }

    /**
     * Checks if the given node is a Markdown documentation line.
     *
     * @param node the node to check
     * @return true if the node is a Markdown documentation line, false otherwise
     */
    public static boolean isMarkdownDocumentationLine(Node node) {
        SyntaxKind nodeKind = node.kind();
        return nodeKind == SyntaxKind.MARKDOWN_DOCUMENTATION_LINE ||
                nodeKind == SyntaxKind.MARKDOWN_REFERENCE_DOCUMENTATION_LINE ||
                nodeKind == SyntaxKind.MARKDOWN_DEPRECATION_DOCUMENTATION_LINE;
    }

    /**
     * Gets the view line range for a symbol if it belongs to the current package or a workspace project.
     *
     * <p>
     * TODO: The API currently relies on the syntax tree to determine the corresponding line range. The communication
     * between the extension and the LS should be improved so it can reuse the go-to-def implementation and use the
     * symbol location instead.
     *
     * @param symbol     the symbol to get the view line range for
     * @param moduleInfo the module descriptor of the current module
     * @param project    the current project
     * @return Optional containing the line range if the symbol is viewable, empty otherwise
     */
    public static Optional<LineRange> getViewLineRange(Symbol symbol, ModuleInfo moduleInfo, Project project) {
        Optional<Location> symbolLocation = symbol.getLocation();
        if (symbolLocation.isEmpty()) {
            return Optional.empty();
        }

        Optional<ModuleID> moduleId = symbol.getModule().map(ModuleSymbol::id);
        if (moduleId.isEmpty()) {
            return Optional.empty();
        }

        String symbolOrg = moduleId.get().orgName();
        String symbolPackage = moduleId.get().packageName();
        Location location = symbolLocation.get();

        // Only check if the organization matches
        if (!symbolOrg.equals(moduleInfo.org())) {
            return Optional.empty();
        }

        // Check if it's the default package
        if (symbolPackage.equals(moduleInfo.packageName())) {
            return CommonUtil.findNode(symbol, CommonUtils.getDocument(project, location).syntaxTree())
                    .map(Node::lineRange);
        }

        // Check if the symbol is from a sibling workspace project
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
        if (workspaceProject.isEmpty()) {
            return Optional.empty();
        }

        List<Project> workspaceProjects = compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get());

        for (Project wsProject : workspaceProjects) {
            String wsPackageName = wsProject.currentPackage().packageName().value();
            if (wsPackageName.equals(symbolPackage)) {
                // Use the sibling project to get the document
                return CommonUtil.findNode(symbol, CommonUtils.getDocument(wsProject, location).syntaxTree())
                        .map(Node::lineRange);
            }
        }

        return Optional.empty();
    }

    /**
     * Removes a leading single quote from the given identifier, if present.
     *
     * <p>
     * TODO: The utility assumes that every leading `'` is an escaped identifier. This does not correctly handle
     * inputs where `'` is part of the identifier, such as `\'value`.
     *
     * @param identifier the identifier to process
     * @return the identifier without the leading single quote, or the original identifier if no leading quote exists
     */
    public static String removeQuotedIdentifier(String identifier) {
        return identifier.startsWith("'") ? identifier.substring(1) : identifier;
    }

    /**
     * Extracts the literal content from a Ballerina string template if it does not contain interpolations.
     *
     * <p>This method analyzes string templates (e.g., string `Hello`) and extracts the literal content
     * if no interpolations are present. If interpolations exist (e.g., `string Hello ${name}`),
     * the original value is returned unchanged.
     *
     * @param value the string template value to process
     * @return the extracted literal content wrapped in double quotes if no interpolations are found,
     *         or the original value if it contains interpolations or is not a valid string template
     */
    public static String extractLiteralFromStringTemplate(String value) {
        if (value == null) {
            return null;
        }

        if (!STRING_TEMPLATE_PATTERN.matcher(value).matches() || value.contains(LS)) {
            return value;
        }

        TemplateExpressionNode exprNode = (TemplateExpressionNode) NodeParser.parseExpression(value);
        boolean hasInterpolations = exprNode.content().stream()
                .anyMatch(node -> node instanceof InterpolationNode);

        if (hasInterpolations) {
            return value;
        }

        String content = exprNode.content().size() == 1
                ? exprNode.content().get(0).toString().trim()
                : exprNode.toString().trim();

        return DOUBLE_QUOTE + escapeContent(content) + DOUBLE_QUOTE;
    }

    /**
     * Escapes backslashes and double quotes in the given content string.
     *
     * @param content the content string to escape
     * @return the escaped content string
     */
    public static String escapeContent(String content) {
        return content.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /**
     * Unescapes backslashes and double quotes in the given content string.
     *
     * @param content the content string to unescape
     * @return the unescaped content string
     */
    public static String unescapeContent(String content) {
        return content.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    /**
     * Removes the leading single quote from the specified string if present.
     *
     * @param input the string to be processed
     * @return the string without the leading single quote, or the original string
     */
    public static String removeLeadingSingleQuote(String input) {
        if (input != null && input.startsWith("'")) {
            return input.substring(1);
        }
        return input;
    }

    /**
     * Converts a map to a string representation.
     *
     * @param map the map to convert
     * @return the string representation of the map
     */
    public static String convertMapToString(Map<?, ?> map) {
        if (map == null || map.isEmpty()) {
            return "{}";
        }
        return map.entrySet()
                .stream()
                .map(entry -> entry.getKey() + ": " + entry.getValue())
                .collect(Collectors.joining(", ", "{ ", " }"));
    }

    /**
     * Convert mapping expression to a map.
     *
     * @param mapExpr the map expression node
     * @return the map representation of the mapping expression node
     */
    public static Map<String, Object> convertMappingExprToMap(MappingConstructorExpressionNode mapExpr) {
        Map<String, Object> resultMap = new LinkedHashMap<>();
        for (MappingFieldNode fieldNode : mapExpr.fields()) {
            if (fieldNode instanceof SpecificFieldNode specificFieldNode) {
                String key = specificFieldNode.fieldName().toString().trim();
                Object value = specificFieldNode.valueExpr().map(exprNode -> exprNode.toString().trim())
                        .orElse("");
                resultMap.put(key, value);
            }
        }
        return resultMap;
    }

    /**
     * Directly extracts the default value from a symbol without requiring FunctionDataBuilder.
     * This method contains the core default value extraction logic decoupled from function building.
     *
     * @param paramSymbol     the parameter or record field symbol
     * @param typeSymbol      the type descriptor of the parameter
     * @param semanticModel   the semantic model for symbol resolution (can be null)
     * @param resolvedPackage the resolved package containing the symbol (can be null)
     * @return the extracted default value as a string
     */
    public static String resolveDefaultValue(Symbol paramSymbol, TypeSymbol typeSymbol,
                                             SemanticModel semanticModel, Package resolvedPackage) {
        return resolveDefaultValue(paramSymbol, typeSymbol, semanticModel, resolvedPackage, null);
    }

    /**
     * Directly extracts the default value from a symbol without requiring FunctionDataBuilder.
     * This method contains the core default value extraction logic decoupled from function building.
     *
     * @param paramSymbol     the parameter or record field symbol
     * @param typeSymbol      the type descriptor of the parameter
     * @param semanticModel   the semantic model for symbol resolution (can be null)
     * @param resolvedPackage the resolved package containing the symbol (can be null)
     * @param document        the document containing the symbol (can be null for optimization)
     * @return the extracted default value as a string
     */
    public static String resolveDefaultValue(Symbol paramSymbol, TypeSymbol typeSymbol,
                                             SemanticModel semanticModel, Package resolvedPackage,
                                             Document document) {
        String defaultValue = DefaultValueGeneratorUtil.getDefaultValueForType(typeSymbol);

        Optional<Location> symbolLocation = paramSymbol.getLocation();
        if (resolvedPackage == null || symbolLocation.isEmpty()) {
            return defaultValue;
        }
        if (document == null) {
            // TODO: Remove the document passing logic to separate imported and local packages
            document = findDocument(resolvedPackage, symbolLocation.get().lineRange().fileName());
            if (document == null) {
                return defaultValue;
            }
        }

        ModulePartNode rootNode = document.syntaxTree().rootNode();
        TextRange textRange = symbolLocation.get().textRange();
        NonTerminalNode node = rootNode.findNode(TextRange.from(textRange.startOffset(), textRange.length()));

        ExpressionNode expression;
        switch (node.kind()) {
            case DEFAULTABLE_PARAM -> expression = (ExpressionNode) ((DefaultableParameterNode) node).expression();
            case RECORD_FIELD_WITH_DEFAULT_VALUE -> expression = ((RecordFieldWithDefaultValueNode) node).expression();
            default -> {
                return defaultValue;
            }
        }

        if (expression instanceof SimpleNameReferenceNode simpleNameReferenceNode) {
            String enumValue = resolveEnumMemberValue(simpleNameReferenceNode, resolvedPackage,
                    semanticModel, document);
            return enumValue != null ? enumValue : simpleNameReferenceNode.name().text();
        } else if (expression instanceof QualifiedNameReferenceNode qualifiedNameReferenceNode) {
            String enumValue = resolveEnumMemberValue(qualifiedNameReferenceNode, resolvedPackage,
                    semanticModel, document);
            return enumValue != null ? enumValue :
                    qualifiedNameReferenceNode.modulePrefix().text() + ":" + qualifiedNameReferenceNode.identifier()
                            .text();
        } else {
            return expression.toSourceCode();
        }
    }

    /**
     * Helper method to find a document in a package by file path.
     */
    public static Document findDocument(Package pkg, String path) {
        if (pkg == null) {
            return null;
        }
        Project project = pkg.project();
        Module defaultModule = pkg.getDefaultModule();
        String module = pkg.packageName().value();
        // TODO: Unify the supported for the submodules
        Path docPath = project.sourceRoot().resolve("modules").resolve(module).resolve(path);
        try {
            DocumentId documentId = project.documentId(docPath);
            return defaultModule.document(documentId);
        } catch (RuntimeException ex) {
            return null;
        }
    }

    /**
     * Helper method to resolve enum member values from expressions.
     */
    private static String resolveEnumMemberValue(ExpressionNode expression, Package resolvedPackage,
                                                 SemanticModel semanticModel, Document document) {
        if (semanticModel == null) {
            return null;
        }

        Optional<Symbol> symbolOpt = semanticModel.symbol(expression);
        if (symbolOpt.isEmpty()) {
            return null;
        }

        Symbol symbol = symbolOpt.get();
        if (symbol.kind() == SymbolKind.CONSTANT) {
            if (symbol instanceof ConstantSymbol constantSymbol) {
                return String.valueOf(constantSymbol.constValue());
            }
            // Handle case where kind is CONSTANT but not instanceof ConstantSymbol
            return null;
        }

        if (symbol.kind() != SymbolKind.ENUM_MEMBER) {
            return null;
        }

        Optional<Location> symbolLocation = symbol.getLocation();
        if (resolvedPackage == null || symbolLocation.isEmpty()) {
            return null;
        }

        if (document == null) {
            document = findDocument(resolvedPackage, symbolLocation.get().lineRange().fileName());
            if (document == null) {
                return null;
            }
        }

        ModulePartNode rootNode = document.syntaxTree().rootNode();
        TextRange textRange = symbolLocation.get().textRange();
        NonTerminalNode node = rootNode.findNode(TextRange.from(textRange.startOffset(), textRange.length()));

        if (!(node instanceof EnumMemberNode enumMemberNode)) {
            return null;
        }

        if (enumMemberNode.constExprNode().isEmpty()) {
            return enumMemberNode.identifier().text();
        }

        ExpressionNode valueExpression = enumMemberNode.constExprNode().get();
        return valueExpression.toSourceCode().trim();
    }

    /**
     * Escapes a form field name to a valid Ballerina identifier by replacing the leading {@code $} with a
     * single quote prefix.
     *
     * @param name the form field name to escape
     * @return the escaped identifier
     */
    public static String escapeIdentifierFromFormField(@NonNull String name) {
        return name.startsWith("$") ? "'" + name.substring(1) : name;
    }

}
