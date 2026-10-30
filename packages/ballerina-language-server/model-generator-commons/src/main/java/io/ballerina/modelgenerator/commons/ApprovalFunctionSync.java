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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.DefaultableParameterNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.FunctionSignatureNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.MetadataNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.projects.Document;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Keeps the approval function referenced by an {@code @ai:AgentTool {requiresApproval: <fn>}} annotation in step
 * with its tool. The {@code ai} module binds a tool call's arguments to that function by name, and its compiler
 * plugin (AI_111) requires the same parameters as the tool, minus a leading {@code ai:Context}, returning
 * {@code boolean}.
 *
 * <p>When a tool is saved, the approval function's parameter list is rewritten to match the tool's (name, body,
 * docs and qualifiers are kept), or a stub is generated when the referenced function doesn't exist yet. A function
 * that is also referenced from anywhere else is never rewritten, since that would break the other reference.</p>
 *
 * @since 2.0.0
 */
public final class ApprovalFunctionSync {

    private static final String AGENT_TOOL_ANNOTATION = "AgentTool";
    private static final String REQUIRES_APPROVAL_FIELD = "requiresApproval";
    // Annotation text from a form has no function after it; this gives the parser one to attach it to.
    private static final String PARSE_ANCHOR = "function __approvalProbe() {}";
    private static final String AI_CONTEXT_TYPE = "ai:Context";

    /**
     * A tool or approval-function parameter.
     *
     * @param type the parameter's type as written in source
     * @param name the parameter name
     */
    public record Param(String type, String name) {

        String declaration() {
            return type + " " + name;
        }
    }

    private ApprovalFunctionSync() {
    }

    /**
     * Returns the {@code requiresApproval} field of an {@code @ai:AgentTool} annotation. The field is read from the
     * syntax tree, so a commented-out field is never taken for the real one.
     *
     * @param annotation the annotation
     * @return the field, or empty when the annotation isn't {@code @ai:AgentTool} or has no such field
     */
    public static Optional<SpecificFieldNode> requiresApprovalField(AnnotationNode annotation) {
        if (!(annotation.annotReference() instanceof QualifiedNameReferenceNode reference)
                || !AGENT_TOOL_ANNOTATION.equals(reference.identifier().text().trim())
                || annotation.annotValue().isEmpty()) {
            return Optional.empty();
        }
        for (MappingFieldNode field : annotation.annotValue().get().fields()) {
            if (field instanceof SpecificFieldNode specificField
                    && REQUIRES_APPROVAL_FIELD.equals(fieldName(specificField))) {
                return Optional.of(specificField);
            }
        }
        return Optional.empty();
    }

    /**
     * Returns the {@code requiresApproval} field of the first {@code @ai:AgentTool} annotation among a function's
     * annotations.
     *
     * @param metadata the function's metadata
     * @return the field, or empty when the function isn't an agent tool or has no such field
     */
    public static Optional<SpecificFieldNode> requiresApprovalField(Optional<MetadataNode> metadata) {
        if (metadata.isEmpty()) {
            return Optional.empty();
        }
        for (AnnotationNode annotation : metadata.get().annotations()) {
            if (annotation.annotReference() instanceof QualifiedNameReferenceNode reference
                    && AGENT_TOOL_ANNOTATION.equals(reference.identifier().text().trim())) {
                return requiresApprovalField(annotation);
            }
        }
        return Optional.empty();
    }

    /**
     * Whether a function's {@code @ai:AgentTool} annotation gates it for approval: it has a {@code requiresApproval}
     * field whose value isn't the literal {@code false}.
     *
     * @param metadata the function's metadata
     * @return true when the tool requires approval
     */
    public static boolean requiresApproval(Optional<MetadataNode> metadata) {
        return requiresApprovalField(metadata).map(field -> !isFalseLiteral(field)).orElse(false);
    }

    /**
     * Returns the approval function a function's {@code @ai:AgentTool} annotation refers to, if it refers to one by
     * a plain name. {@code true}/{@code false}, qualified references ({@code mod:fn}) and inline functions yield
     * nothing.
     *
     * @param metadata the function's metadata
     * @return the function name
     */
    public static Optional<String> approvalFunctionName(Optional<MetadataNode> metadata) {
        return requiresApprovalField(metadata)
                .flatMap(SpecificFieldNode::valueExpr)
                .filter(value -> value.kind() == SyntaxKind.SIMPLE_NAME_REFERENCE)
                .map(value -> ((SimpleNameReferenceNode) value).name().text().trim());
    }

    /**
     * Returns the approval function named by annotation source text, such as the annotations property of a
     * function form. The text is parsed, then read as {@link #approvalFunctionName(Optional)} does.
     *
     * @param annotations the annotation source attached to the tool
     * @return the function name
     */
    public static Optional<String> approvalFunctionName(String annotations) {
        if (annotations == null || annotations.isBlank()) {
            return Optional.empty();
        }
        ModuleMemberDeclarationNode member =
                NodeParser.parseModuleMemberDeclaration(annotations + System.lineSeparator() + PARSE_ANCHOR);
        return member instanceof FunctionDefinitionNode function
                ? approvalFunctionName(function.metadata())
                : Optional.empty();
    }

    // The field's own name token, without the comments and whitespace that lead it.
    private static String fieldName(SpecificFieldNode field) {
        Node name = field.fieldName();
        return name instanceof Token token ? token.text().trim() : name.toSourceCode().trim();
    }

    private static boolean isFalseLiteral(SpecificFieldNode field) {
        return field.valueExpr()
                .filter(value -> value.kind() == SyntaxKind.BOOLEAN_LITERAL)
                .map(value -> ((BasicLiteralNode) value).literalToken().text().trim().equals("false"))
                .orElse(false);
    }

    /**
     * Names of the agent tools whose {@code @ai:AgentTool} annotation names the given function as their approval
     * function, across the given module documents. Covers module-level tools and tools defined inside classes.
     *
     * @param roots        root nodes of the module's documents
     * @param functionName the approval function's name
     * @return tool names in document order; empty when the function isn't an approval function
     */
    public static List<String> toolsUsing(Collection<ModulePartNode> roots, String functionName) {
        List<String> tools = new ArrayList<>();
        for (ModulePartNode root : roots) {
            for (ModuleMemberDeclarationNode member : root.members()) {
                if (member.kind() == SyntaxKind.FUNCTION_DEFINITION) {
                    addIfGated(tools, (FunctionDefinitionNode) member, functionName);
                } else if (member.kind() == SyntaxKind.CLASS_DEFINITION) {
                    for (Node classMember : ((ClassDefinitionNode) member).members()) {
                        if (classMember.kind() == SyntaxKind.OBJECT_METHOD_DEFINITION) {
                            addIfGated(tools, (FunctionDefinitionNode) classMember, functionName);
                        }
                    }
                }
            }
        }
        return tools;
    }

    /**
     * Whether a function is referenced anywhere other than its own definition and the given number of
     * {@code requiresApproval} annotation fields, such as a call from business logic or an {@code ai:ToolConfig}.
     * Such a function is never deleted along with the tools that used it.
     *
     * @param semanticModel the function's semantic model
     * @param function      the function definition
     * @param approvalUses  how many agent tool annotations name the function
     * @return true when something else refers to the function
     */
    public static boolean referencedOutsideApprovals(SemanticModel semanticModel, FunctionDefinitionNode function,
                                                     int approvalUses) {
        Optional<Symbol> symbol = semanticModel.symbol(function);
        if (symbol.isEmpty()) {
            return true;
        }
        Optional<Location> definition = symbol.get().getLocation();
        long references = semanticModel.references(symbol.get()).stream()
                .filter(reference -> definition.isEmpty()
                        || !definition.get().lineRange().equals(reference.lineRange()))
                .count();
        return references > approvalUses;
    }

    private static void addIfGated(List<String> tools, FunctionDefinitionNode function, String functionName) {
        Optional<String> approvalFunction = approvalFunctionName(function.metadata());
        if (approvalFunction.isPresent() && stripQuote(approvalFunction.get()).equals(stripQuote(functionName))) {
            tools.add(function.functionName().text().trim());
        }
    }

    private static String stripQuote(String name) {
        return name.startsWith("'") ? name.substring(1) : name;
    }

    /**
     * The parameters an approval function must declare for a tool: the tool's own, minus a leading
     * {@code ai:Context}.
     *
     * @param toolParams the tool's parameters in order
     * @return the approval function's parameters
     */
    public static List<Param> approvalParams(List<Param> toolParams) {
        if (!toolParams.isEmpty() && isAiContext(toolParams.get(0).type())) {
            return toolParams.subList(1, toolParams.size());
        }
        return toolParams;
    }

    /**
     * Source of a new approval function stub, matching the one generated when a tool is created.
     *
     * @param name   function name
     * @param params the approval function's parameters
     * @return the function source
     */
    public static String stubSource(String name, List<Param> params) {
        return "isolated function " + name + "(" + declarations(params) + ") returns boolean {"
                + System.lineSeparator()
                + "    // TODO: inspect the proposed arguments and return true to require approval"
                + System.lineSeparator()
                + "    return true;"
                + System.lineSeparator()
                + "}";
    }

    /**
     * Computes the edits that bring the approval function in line with the tool's parameters.
     *
     * @param workspaceManager  workspace manager
     * @param toolFile          file the tool is defined in
     * @param functionName      the approval function's name
     * @param toolParams        the tool's parameters as they will be saved
     * @param toolRange         the tool's current range, used to tell the tool's own reference apart from others;
     *                          {@code null} for a tool not yet in source
     * @param generateIfMissing whether to generate a stub when no function with that name exists
     * @return text edits keyed by file; empty when nothing needs to change
     */
    public static Map<Path, List<TextEdit>> sync(WorkspaceManager workspaceManager, Path toolFile,
                                                  String functionName, List<Param> toolParams, LineRange toolRange,
                                                  boolean generateIfMissing) {
        Map<Path, List<TextEdit>> edits = new HashMap<>();
        Optional<SemanticModel> optSemanticModel = workspaceManager.semanticModel(toolFile);
        if (optSemanticModel.isEmpty()) {
            return edits;
        }
        SemanticModel semanticModel = optSemanticModel.get();
        List<Param> params = approvalParams(toolParams);
        String bareName = functionName.startsWith("'") ? functionName.substring(1) : functionName;

        Optional<FunctionSymbol> optSymbol = findModuleFunction(semanticModel, bareName);
        if (optSymbol.isEmpty()) {
            if (generateIfMissing) {
                stubEdit(workspaceManager, toolFile, functionName, params)
                        .ifPresent(edit -> edits.put(toolFile, new ArrayList<>(List.of(edit))));
            }
            return edits;
        }
        FunctionSymbol symbol = optSymbol.get();
        if (isReferencedElsewhere(semanticModel, symbol, toolFile, toolRange)) {
            return edits;
        }
        Optional<FunctionLocation> optLocation = locate(workspaceManager, toolFile, symbol);
        if (optLocation.isEmpty()) {
            return edits;
        }
        FunctionLocation location = optLocation.get();
        signatureEdit(location.node(), params)
                .ifPresent(edit -> edits.put(location.file(), new ArrayList<>(List.of(edit))));
        return edits;
    }

    /**
     * The edit that rewrites an approval function's parameter list, if it differs from the given parameters.
     *
     * @param function the approval function
     * @param params   the parameters it must declare
     * @return the edit, or empty when the parameters already match
     */
    public static Optional<TextEdit> signatureEdit(FunctionDefinitionNode function, List<Param> params) {
        FunctionSignatureNode signature = function.functionSignature();
        List<String> current = new ArrayList<>();
        for (ParameterNode parameter : signature.parameters()) {
            current.add(normalize(parameter.toSourceCode()));
        }
        List<String> expected = params.stream().map(param -> normalize(param.declaration())).toList();
        if (current.equals(expected)) {
            return Optional.empty();
        }
        LinePosition start = signature.openParenToken().lineRange().endLine();
        LinePosition end = signature.closeParenToken().lineRange().startLine();
        Range range = new Range(new Position(start.line(), start.offset()), new Position(end.line(), end.offset()));
        return Optional.of(new TextEdit(range, declarations(params)));
    }

    /**
     * Reads a function's parameters from its definition. A defaultable parameter contributes its type and name; the
     * approval function takes it without the default. Rest parameters aren't read: the {@code ai} module doesn't
     * allow them on agent tools.
     *
     * @param function the function
     * @return its parameters in order; parameters without a name are skipped
     */
    public static List<Param> params(FunctionDefinitionNode function) {
        List<Param> params = new ArrayList<>();
        for (ParameterNode parameter : function.functionSignature().parameters()) {
            Node type;
            Optional<Token> name;
            if (parameter.kind() == SyntaxKind.REQUIRED_PARAM) {
                RequiredParameterNode required = (RequiredParameterNode) parameter;
                type = required.typeName();
                name = required.paramName();
            } else if (parameter.kind() == SyntaxKind.DEFAULTABLE_PARAM) {
                DefaultableParameterNode defaultable = (DefaultableParameterNode) parameter;
                type = defaultable.typeName();
                name = defaultable.paramName();
            } else {
                continue;
            }
            name.ifPresent(token -> params.add(new Param(type.toSourceCode().trim(), token.text().trim())));
        }
        return params;
    }

    private static Optional<FunctionSymbol> findModuleFunction(SemanticModel semanticModel, String name) {
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() == SymbolKind.FUNCTION && symbol.getName().map(name::equals).orElse(false)) {
                return Optional.of((FunctionSymbol) symbol);
            }
        }
        return Optional.empty();
    }

    // Any reference outside the tool being saved (another tool's annotation, a ToolConfig, a call) means the
    // function serves more than this tool, so its signature is left alone.
    private static boolean isReferencedElsewhere(SemanticModel semanticModel, FunctionSymbol symbol, Path toolFile,
                                                 LineRange toolRange) {
        Optional<Location> definition = symbol.getLocation();
        Path toolFilePath = toolFile.getFileName();
        String toolFileName = toolFilePath == null ? "" : toolFilePath.toString();
        for (Location reference : semanticModel.references(symbol)) {
            LineRange range = reference.lineRange();
            if (definition.isPresent() && definition.get().lineRange().equals(range)) {
                continue;
            }
            boolean inTool = toolRange != null
                    && range.fileName().equals(toolFileName)
                    && range.startLine().line() >= toolRange.startLine().line()
                    && range.endLine().line() <= toolRange.endLine().line();
            if (!inTool) {
                return true;
            }
        }
        return false;
    }

    private record FunctionLocation(Path file, FunctionDefinitionNode node) {
    }

    private static Optional<FunctionLocation> locate(WorkspaceManager workspaceManager, Path toolFile,
                                                     FunctionSymbol symbol) {
        Path parent = toolFile.getParent();
        Optional<Location> location = symbol.getLocation();
        if (parent == null || location.isEmpty()) {
            return Optional.empty();
        }
        Path functionFile = parent.resolve(location.get().lineRange().fileName());
        Optional<Document> document = workspaceManager.document(functionFile);
        if (document.isEmpty()) {
            return Optional.empty();
        }
        Optional<NonTerminalNode> node = CommonUtil.findNode(symbol, document.get().syntaxTree());
        if (node.isEmpty() || node.get().kind() != SyntaxKind.FUNCTION_DEFINITION) {
            return Optional.empty();
        }
        return Optional.of(new FunctionLocation(functionFile, (FunctionDefinitionNode) node.get()));
    }

    private static Optional<TextEdit> stubEdit(WorkspaceManager workspaceManager, Path toolFile, String name,
                                               List<Param> params) {
        Optional<Document> document = workspaceManager.document(toolFile);
        if (document.isEmpty()) {
            return Optional.empty();
        }
        LinePosition end = document.get().syntaxTree().rootNode().lineRange().endLine();
        Position position = new Position(end.line(), end.offset());
        String lineSeparator = System.lineSeparator();
        return Optional.of(new TextEdit(new Range(position, position),
                lineSeparator + stubSource(name, params) + lineSeparator));
    }

    private static boolean isAiContext(String type) {
        return type.replaceAll("\\s", "").equals(AI_CONTEXT_TYPE);
    }

    private static String declarations(List<Param> params) {
        return String.join(", ", params.stream().map(Param::declaration).toList());
    }

    private static String normalize(String source) {
        return source.replaceAll("\\s+", " ").trim();
    }
}
