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
import io.ballerina.compiler.syntax.tree.BlockStatementNode;
import io.ballerina.compiler.syntax.tree.CaptureBindingPatternNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds the edit that pastes copied statements into a flow, renaming pasted variables that clash with names in scope.
 *
 * @since 1.7.0
 */
public class PasteNodesHandler {

    private static final Gson gson = new Gson();
    private static final String SCRATCH_FUNCTION = "__flowPaste";
    private static final Pattern TRAILING_NUMBER = Pattern.compile("^(.*?)(\\d*)$");
    private static final Set<String> PREDECLARED_PREFIXES = Set.of("boolean", "decimal", "error", "float", "function",
            "future", "int", "map", "object", "regexp", "stream", "string", "table", "transaction", "typedesc", "xml");

    private PasteNodesHandler() {
    }

    /**
     * Builds the paste edit, with an import for each module the statements use that the file does not import yet.
     *
     * @param text           the copied statements
     * @param target         where the statements go
     * @param filePath       the file to paste into
     * @param document       the document to paste into
     * @param semanticModel  the semantic model of that document
     * @param source         the document the statements were copied from, if known
     * @param visibleModules the modules that can be imported, as {@code org/name}
     * @return the text edits by file path
     */
    public static JsonElement getTextEditsToPaste(String text, LinePosition target, Path filePath, Document document,
                                                  SemanticModel semanticModel, Document source,
                                                  List<String> visibleModules) {
        String statements = text.strip();
        BlockStatementNode block = parseStatements(statements);
        if (block == null) {
            throw new IllegalArgumentException("The clipboard does not hold Ballerina statements");
        }

        Set<String> taken = new HashSet<>();
        semanticModel.visibleSymbols(document, target).forEach(symbol -> symbol.getName().ifPresent(taken::add));
        taken.addAll(localNamesAround(document, target));
        String renamed = renameClashes(statements, block, document, taken);

        List<TextEdit> edits = new ArrayList<>(importEdits(block, document, source, visibleModules));
        edits.add(new TextEdit(CommonUtils.toRange(target), System.lineSeparator() + renamed));
        return gson.toJsonTree(Map.of(filePath.toString(), edits));
    }

    /**
     * Whether the text parses as one or more Ballerina statements.
     *
     * @param text the text to check
     * @return true when it can be pasted into a flow
     */
    public static boolean isPasteable(String text) {
        return text != null && parseStatements(text.strip()) != null;
    }

    private static BlockStatementNode parseStatements(String statements) {
        if (statements.isEmpty()) {
            return null;
        }
        BlockStatementNode block = NodeParser.parseBlockStatement("{" + System.lineSeparator() + statements +
                System.lineSeparator() + "}");
        return block.hasDiagnostics() || block.statements().isEmpty() ? null : block;
    }

    // A scratch function keeps the pasted names from resolving to same-named variables at the target.
    private static String renameClashes(String statements, BlockStatementNode block, Document document,
                                        Set<String> taken) {
        // Without a clash there is nothing to rename, so the project is not compiled at all.
        List<String> declared = new ArrayList<>();
        walk(block, node -> {
            if (node instanceof CaptureBindingPatternNode capture) {
                declared.add(capture.variableName().text());
            }
        });
        if (declared.stream().noneMatch(taken::contains)) {
            return statements;
        }
        String prefix = document.textDocument().toString() + System.lineSeparator() + "function " + SCRATCH_FUNCTION +
                "() {" + System.lineSeparator();
        // A duplicate project, since applying a modification makes it the project's current package.
        Document scratch = document.module().project().duplicate().currentPackage().module(document.module().moduleId())
                .document(document.documentId()).modify()
                .withContent(prefix + statements + System.lineSeparator() + "}").apply();
        SemanticModel model = scratch.module().getCompilation().getSemanticModel();
        FunctionDefinitionNode function = scratchFunction(scratch);
        if (function == null) {
            return statements;
        }

        List<CaptureBindingPatternNode> declarations = new ArrayList<>();
        walk(function.functionBody(), node -> {
            if (node instanceof CaptureBindingPatternNode capture) {
                declarations.add(capture);
            }
        });
        Set<String> used = new HashSet<>(taken);
        declarations.forEach(capture -> used.add(capture.variableName().text()));

        TextDocument scratchText = scratch.textDocument();
        TreeMap<Integer, String[]> replacements = new TreeMap<>();
        for (CaptureBindingPatternNode capture : declarations) {
            String name = capture.variableName().text();
            if (!taken.contains(name)) {
                continue;
            }
            String fresh = freshName(name, used);
            used.add(fresh);
            Symbol symbol = model.symbol(capture).orElse(null);
            if (symbol == null) {
                continue;
            }
            for (var location : model.references(symbol)) {
                LineRange range = location.lineRange();
                if (!range.fileName().equals(scratch.name())) {
                    continue;
                }
                int start = scratchText.textPositionFrom(range.startLine()) - prefix.length();
                int end = scratchText.textPositionFrom(range.endLine()) - prefix.length();
                if (start >= 0 && end <= statements.length()) {
                    replacements.put(start, new String[]{String.valueOf(end), fresh});
                }
            }
        }

        StringBuilder result = new StringBuilder(statements);
        for (var entry : replacements.descendingMap().entrySet()) {
            result.replace(entry.getKey(), Integer.parseInt(entry.getValue()[0]), entry.getValue()[1]);
        }
        return result.toString();
    }

    // A missing prefix takes the source file's import, else the one module whose name ends with it; none if ambiguous.
    private static List<TextEdit> importEdits(BlockStatementNode block, Document document, Document source,
                                              List<String> visibleModules) {
        Set<String> used = new TreeSet<>();
        walk(block, node -> {
            if (node instanceof QualifiedNameReferenceNode reference) {
                used.add(reference.modulePrefix().text());
            }
        });
        ModulePartNode root = document.syntaxTree().rootNode();
        root.imports().forEach(importNode -> used.remove(importPrefix(importNode)));
        used.removeAll(PREDECLARED_PREFIXES);
        if (used.isEmpty()) {
            return List.of();
        }

        Map<String, String> fromSource = new HashMap<>();
        if (source != null) {
            ((ModulePartNode) source.syntaxTree().rootNode()).imports().forEach(importNode ->
                    fromSource.putIfAbsent(importPrefix(importNode), importNode.toSourceCode().strip()));
        }
        List<String> candidates = new ArrayList<>(visibleModules);
        Package currentPackage = document.module().packageInstance();
        currentPackage.modules().forEach(module -> {
            if (!module.isDefaultModule()) {
                candidates.add(currentPackage.packageOrg().value() + "/" + module.moduleName().toString());
            }
        });

        StringBuilder imports = new StringBuilder();
        for (String prefix : used) {
            String statement = fromSource.get(prefix);
            if (statement == null) {
                List<String> matches = candidates.stream().distinct()
                        .filter(module -> module.endsWith("/" + prefix) || module.endsWith("." + prefix)).toList();
                statement = matches.size() == 1 ? "import " + matches.get(0) + ";" : null;
            }
            if (statement != null) {
                imports.append(statement).append(System.lineSeparator());
            }
        }
        if (imports.isEmpty()) {
            return List.of();
        }
        NodeList<ImportDeclarationNode> existing = root.imports();
        LinePosition at = existing.isEmpty() ? LinePosition.from(0, 0)
                : LinePosition.from(existing.get(existing.size() - 1).lineRange().endLine().line() + 1, 0);
        return List.of(new TextEdit(CommonUtils.toRange(at), imports.toString()));
    }

    private static String importPrefix(ImportDeclarationNode importNode) {
        return importNode.prefix().map(prefix -> prefix.prefix().text())
                .orElseGet(() -> importNode.moduleName().get(importNode.moduleName().size() - 1).text());
    }

    // `name` becomes `name1`, and `name1` becomes `name2`, skipping any already in use.
    private static String freshName(String name, Set<String> used) {
        Matcher matcher = TRAILING_NUMBER.matcher(name);
        String base = matcher.matches() ? matcher.group(1) : name;
        int next = matcher.matches() && !matcher.group(2).isEmpty() ? Integer.parseInt(matcher.group(2)) + 1 : 1;
        while (used.contains(base + next)) {
            next++;
        }
        return base + next;
    }

    // Variables declared anywhere in the function body around the target also clash, even after the target.
    private static Set<String> localNamesAround(Document document, LinePosition target) {
        Set<String> names = new HashSet<>();
        int offset = document.textDocument().textPositionFrom(target);
        walk(document.syntaxTree().rootNode(), node -> {
            if (node instanceof CaptureBindingPatternNode capture && enclosingBody(capture) != null
                    && covers(enclosingBody(capture).textRange(), offset)) {
                names.add(capture.variableName().text());
            }
        });
        return names;
    }

    private static Node enclosingBody(Node node) {
        Node current = node.parent();
        while (current != null && current.kind() != SyntaxKind.FUNCTION_BODY_BLOCK) {
            current = current.parent();
        }
        return current instanceof FunctionBodyBlockNode ? current : null;
    }

    private static boolean covers(TextRange range, int offset) {
        return offset >= range.startOffset() && offset <= range.endOffset();
    }

    private static FunctionDefinitionNode scratchFunction(Document scratch) {
        for (ModuleMemberDeclarationNode member : ((ModulePartNode) scratch.syntaxTree().rootNode()).members()) {
            if (member instanceof FunctionDefinitionNode function
                    && function.functionName().text().equals(SCRATCH_FUNCTION)) {
                return function;
            }
        }
        return null;
    }

    private static void walk(Node node, Consumer<Node> visit) {
        visit.accept(node);
        if (node instanceof NonTerminalNode nonTerminal) {
            for (Node child : nonTerminal.children()) {
                walk(child, visit);
            }
        }
    }
}
