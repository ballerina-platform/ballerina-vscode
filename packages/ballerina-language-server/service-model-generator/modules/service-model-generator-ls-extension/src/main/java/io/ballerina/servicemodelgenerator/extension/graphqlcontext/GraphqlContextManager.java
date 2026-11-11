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

package io.ballerina.servicemodelgenerator.extension.graphqlcontext;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeVisitor;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ImportPrefixReader;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import static io.ballerina.servicemodelgenerator.extension.util.Utils.toPosition;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.toRange;

/**
 * The request context of a GraphQL service: the function its {@code contextInit} field names, which builds the
 * {@code graphql:Context} each resolver receives.
 *
 * <p>
 * A {@code contextInit} function must be {@code isolated function (http:RequestContext, http:Request) returns
 * graphql:Context|error}, and must be in scope with the {@code ballerina/http} import its signature needs. The
 * designer creates one that compiles as generated, so a user who does not know that signature never has to write it.
 * </p>
 */
public final class GraphqlContextManager {

    private static final String ACTION_CREATE = "create";
    private static final String ACTION_USE = "use";
    private static final String ACTION_REMOVE = "remove";
    private static final String ACTION_SET_ENTRIES = "setEntries";

    static final String FIELD = "contextInit";

    private static final String GRAPHQL = "graphql";
    private static final String SERVICE_CONFIG = "ServiceConfig";
    private static final String HTTP = "http";
    private static final String BALLERINA = "ballerina";
    private static final String FUNCTIONS_FILE = "functions.bal";
    private static final String NAME_SUFFIX = "ContextInit";
    private static final String DEFAULT_BASE_NAME = "graphql";
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final String NEW_LINE = "\n";

    private GraphqlContextManager() {
    }

    /**
     * Where the context function is defined.
     *
     * @param filePath the file defining it; null when the project cannot name the file
     * @param node     the function's definition
     */
    private record FunctionLocation(String filePath, FunctionDefinitionNode node) {
    }

    /**
     * The service's request context: whether it is set, the function it names, where that function is, and the
     * module functions that could be picked instead.
     */
    public static GraphqlContextResponse read(ServiceDeclarationNode serviceNode, SemanticModel semanticModel,
                                              Document document) {
        Optional<Target> target = graphqlTarget(serviceNode, semanticModel);
        if (target.isEmpty()) {
            return GraphqlContextResponse.unsupported();
        }
        List<String> candidates = candidates(semanticModel);
        Optional<String> configured = target.get().annotation().fieldSource(FIELD);
        if (configured.isEmpty()) {
            return GraphqlContextResponse.notConfigured(candidates);
        }
        String expression = configured.get();
        Optional<String> functionName = functionName(target.get());
        if (functionName.isEmpty()) {
            // A lambda or a qualified reference: shown as written, and edited only in source.
            return new GraphqlContextResponse(true, true, null, expression, null, null, false, candidates,
                    List.of(), false, "The context is set to an expression. Edit it in the source code.", null, null);
        }
        Optional<FunctionLocation> location = findFunction(document.module(), functionName.get());
        boolean signatureValid = candidates.contains(functionName.get());
        List<ContextFunctionBody.ContextEntry> entries = List.of();
        boolean editable = false;
        String notEditableReason = null;
        LineRange valueScope = null;
        if (location.isEmpty()) {
            notEditableReason = "The function " + functionName.get() + " is not in this integration.";
        } else if (!signatureValid) {
            notEditableReason = "The function does not have the signature a context function needs.";
        } else {
            try {
                ContextFunctionBody body = ContextFunctionBody.parse(location.get().node());
                entries = body.entries();
                editable = true;
                LinePosition position = body.valuePosition();
                valueScope = LineRange.from(location.get().node().lineRange().fileName(), position, position);
            } catch (ContextFunctionBody.NotEditableException e) {
                notEditableReason = e.getMessage() + " Edit it in the flow diagram.";
            }
        }
        return new GraphqlContextResponse(true, true, functionName.get(), expression,
                location.map(FunctionLocation::filePath).orElse(null),
                location.map(found -> found.node().lineRange()).orElse(null),
                signatureValid, candidates, entries, editable, notEditableReason, valueScope, null);
    }

    /**
     * The edits for the given action, keyed by file path, with a note when the change did less than was asked.
     *
     * @param action         {@link #ACTION_CREATE} generates a new function and points the field at it,
     *                       {@link #ACTION_USE} points the field at the existing function named by
     *                       {@code functionName}, and {@link #ACTION_REMOVE} removes the field
     * @param deleteFunction for {@link #ACTION_REMOVE}, also delete the function when nothing else references it
     * @param entries        for {@link #ACTION_SET_ENTRIES}, the values the context should carry, replacing the
     *                       ones the function sets now
     * @throws IllegalArgumentException when the service is not a GraphQL service, or the action or function is not
     *                                  valid
     */
    public static GraphqlContextEditResponse apply(String action, String functionName, boolean deleteFunction,
                                                    List<ContextFunctionBody.ContextEntry> entries,
                                                    Path serviceFile, ServiceDeclarationNode serviceNode,
                                                    SemanticModel semanticModel, Document document,
                                                    WorkspaceManager workspaceManager) {
        Target target = graphqlTarget(serviceNode, semanticModel)
                .orElseThrow(() -> new IllegalArgumentException("Not a GraphQL service"));
        if (action == null) {
            throw new IllegalArgumentException("No action given");
        }
        return switch (action) {
            case ACTION_CREATE -> new GraphqlContextEditResponse(
                    create(target, serviceFile, serviceNode, semanticModel, workspaceManager));
            case ACTION_USE -> new GraphqlContextEditResponse(use(target, serviceFile, functionName, semanticModel));
            case ACTION_REMOVE -> remove(target, serviceFile, semanticModel, document, deleteFunction);
            case ACTION_SET_ENTRIES -> new GraphqlContextEditResponse(
                    setEntries(target, semanticModel, document, entries));
            default -> throw new IllegalArgumentException("Unknown action: " + action);
        };
    }

    private static Map<String, List<TextEdit>> create(Target target, Path serviceFile,
                                                      ServiceDeclarationNode serviceNode,
                                                      SemanticModel semanticModel,
                                                      WorkspaceManager workspaceManager) {
        String name = Utils.generateTypeIdentifier(moduleLevelNames(semanticModel), baseName(serviceNode));
        // functions.bal sits beside the service, in the same module directory.
        Path moduleDirectory = serviceFile.toAbsolutePath().getParent();
        if (moduleDirectory == null) {
            throw new IllegalArgumentException("Cannot locate the module directory of " + serviceFile);
        }
        Path functionsFile = moduleDirectory.resolve(FUNCTIONS_FILE);
        Document functionsDocument = FileSystemUtils.getDocument(workspaceManager, functionsFile);
        ModulePartNode root = functionsDocument.syntaxTree().rootNode();

        StringBuilder imports = new StringBuilder();
        String httpPrefix = prefixFor(root, BALLERINA, HTTP, imports);
        String graphqlPrefix = prefixFor(root, target.org(), target.module(), imports);
        String function = functionSource(name, httpPrefix, graphqlPrefix);

        List<TextEdit> functionEdits = new ArrayList<>();
        Range fileStart = toRange(root.lineRange().startLine());
        if (root.imports().isEmpty() && root.members().isEmpty()) {
            String text = imports.isEmpty() ? function : imports + NEW_LINE + function;
            functionEdits.add(new TextEdit(fileStart, text + NEW_LINE));
        } else {
            if (!imports.isEmpty()) {
                functionEdits.add(new TextEdit(fileStart, imports.toString()));
            }
            functionEdits.add(Utils.appendAtEndOfModule(root, function));
        }

        List<TextEdit> configEdits = target.annotation().setField(FIELD, name);
        if (!imports.isEmpty() && functionsFile.normalize().equals(serviceFile.toAbsolutePath().normalize())) {
            // The service is in functions.bal itself: an import a new annotation needs is already being added.
            Set<String> pending = Set.of(imports.toString().split(NEW_LINE));
            configEdits = configEdits.stream().filter(edit -> !pending.contains(edit.getNewText().strip())).toList();
        }

        Map<String, List<TextEdit>> edits = new LinkedHashMap<>();
        addEdits(edits, functionsFile.toString(), functionEdits);
        addEdits(edits, serviceFile.toString(), configEdits);
        return edits;
    }

    private static Map<String, List<TextEdit>> setEntries(Target target,
                                                          SemanticModel semanticModel, Document document,
                                                          List<ContextFunctionBody.ContextEntry> entries) {
        if (entries == null) {
            throw new IllegalArgumentException("No context values given");
        }
        String functionName = functionName(target)
                .orElseThrow(() -> new IllegalArgumentException("This service has no context function to edit"));
        requireContextInit(semanticModel, functionName);
        FunctionLocation location = findFunction(document.module(), functionName)
                .filter(found -> found.filePath() != null)
                .orElseThrow(() -> new IllegalArgumentException(functionName + " is not in this integration"));
        ContextFunctionBody body;
        try {
            body = ContextFunctionBody.parse(location.node());
        } catch (ContextFunctionBody.NotEditableException e) {
            // Never rewrite a body the designer does not fully understand.
            throw new IllegalArgumentException(e.getMessage() + " Edit it in the flow diagram.", e);
        }
        ContextFunctionBody.Replacement replacement = body.replaceEntries(entries);
        return Map.of(location.filePath(), List.of(new TextEdit(
                new Range(toPosition(replacement.start()), toPosition(replacement.end())), replacement.text())));
    }

    private static Map<String, List<TextEdit>> use(Target target, Path serviceFile,
                                                   String functionName, SemanticModel semanticModel) {
        if (functionName == null || !IDENTIFIER.matcher(functionName).matches()) {
            throw new IllegalArgumentException("Not a valid function name: " + functionName);
        }
        requireContextInit(semanticModel, functionName);
        return Map.of(serviceFile.toString(), target.annotation().setField(FIELD, functionName));
    }

    private static GraphqlContextEditResponse remove(Target target, Path serviceFile,
                                                     SemanticModel semanticModel, Document document,
                                                     boolean deleteFunction) {
        Map<String, List<TextEdit>> edits = new LinkedHashMap<>();
        addEdits(edits, serviceFile.toString(), target.annotation().removeField(FIELD));
        if (!deleteFunction) {
            return new GraphqlContextEditResponse(edits);
        }
        Optional<String> functionName = functionName(target);
        if (functionName.isEmpty()) {
            return new GraphqlContextEditResponse(edits);
        }
        Optional<FunctionSymbol> symbol = moduleFunction(semanticModel, functionName.get());
        Optional<FunctionLocation> location = findFunction(document.module(), functionName.get());
        if (symbol.isEmpty() || location.isEmpty() || location.get().filePath() == null) {
            return new GraphqlContextEditResponse(edits, "Kept " + functionName.get()
                    + " because it could not be found in this integration.", null);
        }
        // The definition and this service's reference are the only two a function used nowhere else has. The same
        // reference can be reported more than once, so distinct locations are counted.
        if (distinctReferences(semanticModel, symbol.get()) > 2) {
            return new GraphqlContextEditResponse(edits, "Kept " + functionName.get()
                    + " because it is used elsewhere.", null);
        }
        FunctionDefinitionNode function = location.get().node();
        List<int[]> spans = new ArrayList<>();
        spans.add(lineSpan(function.lineRange()));
        // An import left unused is a compile error, so drop the ones only this function needed.
        if (function.syntaxTree().rootNode() instanceof ModulePartNode root) {
            Set<String> usedByFunction = prefixesUsedIn(List.of(function));
            Set<String> usedElsewhere = prefixesUsedIn(root.members().stream()
                    .filter(member -> !member.equals(function))
                    .map(member -> (Node) member)
                    .toList());
            for (ImportDeclarationNode importNode : root.imports()) {
                String prefix = ImportPrefixReader.prefixOf(importNode);
                if (usedByFunction.contains(prefix) && !usedElsewhere.contains(prefix)) {
                    spans.add(lineSpan(importNode.lineRange()));
                }
            }
        }
        addEdits(edits, location.get().filePath(), deleteLines(spans, function.syntaxTree().textDocument()));
        return new GraphqlContextEditResponse(edits);
    }

    private static long distinctReferences(SemanticModel semanticModel, FunctionSymbol symbol) {
        return semanticModel.references(symbol).stream()
                .map(location -> location.lineRange().fileName() + ":" + location.lineRange())
                .distinct()
                .count();
    }

    /**
     * The module prefixes the nodes use in qualified references, such as {@code http} in {@code http:Request}.
     */
    private static Set<String> prefixesUsedIn(List<Node> nodes) {
        Set<String> prefixes = new HashSet<>();
        NodeVisitor visitor = new NodeVisitor() {
            @Override
            public void visit(QualifiedNameReferenceNode reference) {
                prefixes.add(reference.modulePrefix().text());
            }
        };
        nodes.forEach(node -> node.accept(visitor));
        return prefixes;
    }

    private static int[] lineSpan(LineRange lineRange) {
        return new int[]{lineRange.startLine().line(), lineRange.endLine().line()};
    }

    /**
     * Deletes the given spans of whole lines. Adjacent spans are deleted as one, and a span that follows a blank line
     * (or starts the file) also takes the blank lines after it, so no run of blank lines is left where it was.
     */
    private static List<TextEdit> deleteLines(List<int[]> spans, TextDocument textDocument) {
        spans.sort((a, b) -> Integer.compare(a[0], b[0]));
        List<int[]> merged = new ArrayList<>();
        for (int[] span : spans) {
            if (!merged.isEmpty() && span[0] <= merged.getLast()[1] + 1) {
                merged.getLast()[1] = Math.max(merged.getLast()[1], span[1]);
            } else {
                merged.add(new int[]{span[0], span[1]});
            }
        }
        int lineCount = textDocument.textLines().size();
        List<TextEdit> edits = new ArrayList<>();
        for (int[] span : merged) {
            int end = span[1];
            if (span[0] == 0 || isBlank(textDocument, span[0] - 1)) {
                while (end + 1 < lineCount && isBlank(textDocument, end + 1)) {
                    end++;
                }
            }
            LinePosition start = LinePosition.from(span[0], 0);
            LinePosition stop = end + 1 < lineCount ? LinePosition.from(end + 1, 0)
                    : LinePosition.from(end, textDocument.line(end).length());
            edits.add(new TextEdit(new Range(toPosition(start), toPosition(stop)), ""));
        }
        return edits;
    }

    private static boolean isBlank(TextDocument textDocument, int line) {
        return textDocument.line(line).text().isBlank();
    }

    /**
     * Refuses a function that is not a module function with the signature a {@code contextInit} field accepts.
     *
     * @throws IllegalArgumentException when it is not
     */
    private static void requireContextInit(SemanticModel semanticModel, String functionName) {
        if (moduleFunction(semanticModel, functionName).filter(GraphqlContextManager::isContextInit).isEmpty()) {
            throw new IllegalArgumentException(functionName + " does not have the signature a contextInit "
                    + "function needs");
        }
    }

    /**
     * The module functions whose signature a {@code contextInit} field accepts, sorted by name.
     */
    static List<String> candidates(SemanticModel semanticModel) {
        List<String> names = new ArrayList<>();
        semanticModel.moduleSymbols().forEach(symbol -> {
            if (symbol instanceof FunctionSymbol function && isContextInit(function)) {
                function.getName().ifPresent(names::add);
            }
        });
        names.sort(String::compareTo);
        return names;
    }

    /**
     * Whether the function is {@code isolated function (http:RequestContext, http:Request) returns
     * graphql:Context|error}, or a narrower return type such as {@code graphql:Context}.
     */
    static boolean isContextInit(FunctionSymbol function) {
        if (!function.qualifiers().contains(Qualifier.ISOLATED)) {
            return false;
        }
        FunctionTypeSymbol type = function.typeDescriptor();
        List<ParameterSymbol> params = type.params().orElse(List.of());
        if (params.size() != 2 || type.restParam().isPresent()) {
            return false;
        }
        if (!isModuleType(params.get(0).typeDescriptor(), HTTP, "RequestContext")
                || !isModuleType(params.get(1).typeDescriptor(), HTTP, "Request")) {
            return false;
        }
        Optional<TypeSymbol> returnType = type.returnTypeDescriptor();
        if (returnType.isEmpty()) {
            return false;
        }
        List<TypeSymbol> members = returnType.get() instanceof UnionTypeSymbol union
                ? union.memberTypeDescriptors() : List.of(returnType.get());
        boolean returnsContext = false;
        for (TypeSymbol member : members) {
            if (isModuleType(member, GRAPHQL, "Context")) {
                returnsContext = true;
            } else if (!isError(member)) {
                return false;
            }
        }
        return returnsContext;
    }

    private static boolean isModuleType(TypeSymbol type, String module, String name) {
        return type instanceof TypeReferenceTypeSymbol reference
                && reference.getName().filter(name::equals).isPresent()
                && reference.getModule().filter(m -> module.equals(m.id().moduleName())).isPresent();
    }

    private static boolean isError(TypeSymbol type) {
        if (type.typeKind() == TypeDescKind.ERROR) {
            return true;
        }
        return type instanceof TypeReferenceTypeSymbol reference
                && reference.typeDescriptor().typeKind() == TypeDescKind.ERROR;
    }

    /**
     * A GraphQL service's module and its config annotation.
     *
     * @param org        the organization of the service's module
     * @param module     the service's module, {@code graphql}
     * @param annotation the service's {@code @graphql:ServiceConfig}, which may not exist yet
     */
    private record Target(String org, String module, ServiceConfigAnnotation annotation) {
    }

    /**
     * The service's GraphQL module and config annotation; empty when the service is not a GraphQL service.
     */
    private static Optional<Target> graphqlTarget(ServiceDeclarationNode serviceNode, SemanticModel semanticModel) {
        ModuleID moduleId = ServiceModelUtils.deriveServiceType(serviceNode, semanticModel).moduleId();
        if (moduleId == null || !GRAPHQL.equals(moduleId.moduleName())) {
            return Optional.empty();
        }
        return Optional.of(new Target(moduleId.orgName(), moduleId.moduleName(),
                ServiceConfigAnnotation.of(serviceNode, moduleId.orgName(), moduleId.moduleName(), SERVICE_CONFIG)));
    }

    /**
     * The names declared at module level, which a generated function name must not reuse.
     */
    private static Set<String> moduleLevelNames(SemanticModel semanticModel) {
        Set<String> names = new HashSet<>();
        semanticModel.moduleSymbols().forEach(symbol -> {
            if (!(symbol instanceof ModuleSymbol)) {
                symbol.getName().ifPresent(names::add);
            }
        });
        return names;
    }

    /**
     * The function the field names, when it names one by a plain reference.
     */
    private static Optional<String> functionName(Target target) {
        Optional<ExpressionNode> value = target.annotation().valueOf(FIELD);
        if (value.isEmpty()) {
            // Written in shorthand, `{contextInit}`, the field names the function of that name.
            return target.annotation().fieldSource(FIELD).map(source -> FIELD);
        }
        if (value.get() instanceof SimpleNameReferenceNode reference) {
            return Optional.of(reference.name().text());
        }
        return Optional.empty();
    }

    private static Optional<FunctionSymbol> moduleFunction(SemanticModel semanticModel, String name) {
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof FunctionSymbol)
                .map(symbol -> (FunctionSymbol) symbol)
                .filter(function -> function.getName().filter(name::equals).isPresent())
                .findFirst();
    }

    private static Optional<FunctionLocation> findFunction(Module module, String name) {
        for (DocumentId documentId : module.documentIds()) {
            Node root = module.document(documentId).syntaxTree().rootNode();
            if (!(root instanceof ModulePartNode modulePart)) {
                continue;
            }
            for (ModuleMemberDeclarationNode member : modulePart.members()) {
                if (member instanceof FunctionDefinitionNode function
                        && name.equals(function.functionName().text())) {
                    String filePath = module.project().documentPath(documentId).map(Path::toString).orElse(null);
                    return Optional.of(new FunctionLocation(filePath, function));
                }
            }
        }
        return Optional.empty();
    }

    /**
     * A name for the generated function, from the service's base path: {@code /graphql} gives
     * {@code graphqlContextInit} and {@code /api/books} gives {@code apiBooksContextInit}.
     */
    static String baseName(ServiceDeclarationNode serviceNode) {
        StringBuilder base = new StringBuilder();
        for (Node pathSegment : serviceNode.absoluteResourcePath()) {
            String text = pathSegment.toSourceCode().strip().replace("\"", "");
            for (String part : text.split("[^A-Za-z0-9]+")) {
                if (part.isEmpty()) {
                    continue;
                }
                char first = base.isEmpty() ? Character.toLowerCase(part.charAt(0))
                        : Character.toUpperCase(part.charAt(0));
                base.append(first).append(part.substring(1));
            }
        }
        if (base.isEmpty() || !Character.isLetter(base.charAt(0))) {
            base.insert(0, DEFAULT_BASE_NAME);
        }
        return base + NAME_SUFFIX;
    }

    static String functionSource(String name, String httpPrefix, String graphqlPrefix) {
        return "isolated function " + name + "(" + httpPrefix + ":RequestContext requestContext, " + httpPrefix
                + ":Request request) returns " + graphqlPrefix + ":Context|error {" + NEW_LINE
                + "    " + graphqlPrefix + ":Context context = new;" + NEW_LINE
                + "    return context;" + NEW_LINE
                + "}";
    }

    /**
     * The prefix the file binds the module to, adding its import to {@code imports} when the file has none.
     */
    private static String prefixFor(ModulePartNode root, String org, String module, StringBuilder imports) {
        Optional<String> existing = ImportPrefixReader.existingImportPrefix(root, org, module);
        if (existing.isPresent()) {
            return existing.get();
        }
        String prefix = ImportPrefixReader.resolve(root, org, module, null);
        imports.append(ServiceConfigAnnotation.importStatement(org, module, prefix));
        return prefix;
    }

    private static void addEdits(Map<String, List<TextEdit>> edits, String filePath, List<TextEdit> fileEdits) {
        if (fileEdits.isEmpty()) {
            return;
        }
        edits.computeIfAbsent(filePath, key -> new ArrayList<>()).addAll(fileEdits);
    }
}
