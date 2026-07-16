/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

package io.ballerina.flowmodelgenerator.core;

import io.ballerina.compiler.syntax.tree.AssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ReturnTypeDescriptorNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.McpToolKitBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.NewConnectionBuilder;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Creates, updates and removes flow nodes owned by a class field and initialized inside {@code init}.
 *
 * @since 1.0.0
 */
public final class ClassOwnedNodeManager {

    public static final String INNER_AGENT_TOOLS = "INNER_AGENT_TOOLS";
    private static final String INDENT = "    ";
    private static final String TOOLS_ARG = "tools";

    private ClassOwnedNodeManager() {
    }

    public static Map<Path, List<TextEdit>> upsert(WorkspaceManager workspaceManager, Path filePath, FlowNode flowNode,
                                                    LineRange classLineRange, String wiringKind,
                                                    LSClientLogger lsClientLogger) {
        ClassContext context = loadContext(workspaceManager, filePath, classLineRange);
        String fieldName = fieldName(flowNode);
        Map<Path, List<TextEdit>> edits = new HashMap<>();

        findField(context.classDefinition(), fieldName)
                .ifPresent(node -> addEdit(edits, filePath, new TextEdit(toRange(node.lineRange()), "")));
        findAssignment(context.classDefinition(), fieldName)
                .ifPresent(node -> addEdit(edits, filePath, new TextEdit(toRange(node.lineRange()), "")));

        GeneratedClassNode generated = generateClassOwnedSource(workspaceManager, filePath, flowNode, classLineRange,
                context.modulePart(), lsClientLogger);
        mergeEdits(edits, generated.edits());

        String memberIndent = detectMemberIndent(context.classDefinition(), context.document().textDocument());
        addEdit(edits, filePath, new TextEdit(toRange(context.classDefinition().openBrace().lineRange().endLine()),
                System.lineSeparator() + memberIndent + "private final " + generated.type() + " " + fieldName + ";"));

        LinePosition insertion = findInitInsertionPoint(context.initBody())
                .orElse(context.initBody().closeBraceToken().lineRange().startLine());
        addEdit(edits, filePath, new TextEdit(toRange(insertion), System.lineSeparator() + memberIndent + memberIndent
                + generated.assignment()));
        if (INNER_AGENT_TOOLS.equals(wiringKind)) {
            wireToolIntoList(context.classDefinition(), fieldName).ifPresent(edit -> addEdit(edits, filePath, edit));
        }
        ensureErrorReturn(context.init(), edits, filePath);
        return edits;
    }

    public static Map<Path, List<TextEdit>> remove(WorkspaceManager workspaceManager, Path filePath,
                                                   String fieldName, LineRange classLineRange, String wiringKind,
                                                   boolean cleanupGeneratedHelperClass) {
        ClassContext context = loadContext(workspaceManager, filePath, classLineRange);
        Map<Path, List<TextEdit>> edits = new HashMap<>();
        Optional<Node> field = findField(context.classDefinition(), fieldName);
        String fieldType = field.map(node -> extractFieldType(node.toSourceCode(), fieldName)).orElse(null);

        field.ifPresent(node -> addEdit(edits, filePath, new TextEdit(toRange(node.lineRange()), "")));
        findAssignment(context.classDefinition(), fieldName)
                .ifPresent(node -> addEdit(edits, filePath, new TextEdit(toRange(node.lineRange()), "")));
        if (INNER_AGENT_TOOLS.equals(wiringKind)) {
            removeToolFromList(context.classDefinition(), fieldName)
                    .ifPresent(edit -> addEdit(edits, filePath, edit));
        }
        if (cleanupGeneratedHelperClass && fieldType != null
                && !isFieldTypeUsedByAnotherField(context.modulePart(), fieldType, fieldName)) {
            findGeneratedToolKitClass(context.modulePart(), fieldType)
                    .ifPresent(node -> addEdit(edits, filePath, new TextEdit(toRange(node.lineRange()), "")));
        }
        return edits;
    }

    private static GeneratedClassNode generateClassOwnedSource(WorkspaceManager workspaceManager, Path filePath,
                                                               FlowNode flowNode, LineRange classLineRange,
                                                               ModulePartNode modulePart,
                                                               LSClientLogger lsClientLogger) {
        return switch (flowNode.codedata().node()) {
            case NEW_CONNECTION -> generateConnectionSource(workspaceManager, filePath, flowNode, classLineRange,
                    modulePart, lsClientLogger);
            case MCP_TOOL_KIT -> generateMcpToolKitSource(workspaceManager, filePath, flowNode, classLineRange,
                    lsClientLogger);
            default -> throw new IllegalArgumentException("Unsupported class-owned node: "
                    + flowNode.codedata().node());
        };
    }

    private static GeneratedClassNode generateConnectionSource(WorkspaceManager workspaceManager, Path filePath,
                                                               FlowNode connection, LineRange classLineRange,
                                                               ModulePartNode modulePart,
                                                               LSClientLogger lsClientLogger) {
        String connectionName = fieldName(connection);
        Property typeProperty = connection.getProperty(Property.TYPE_KEY)
                .orElseThrow(() -> new IllegalArgumentException("Connection type is required"));
        String requestedType = typeProperty.value().toString();

        SourceBuilder sourceBuilder = new SourceBuilder(localConnection(connection, classLineRange),
                workspaceManager, filePath, lsClientLogger);
        Map<Path, List<TextEdit>> generated = new NewConnectionBuilder().toSource(sourceBuilder);
        List<TextEdit> generatedEdits = new ArrayList<>(generated.getOrDefault(filePath, List.of()));
        String declaration = removeDeclaration(generatedEdits, connectionName, "connection");

        ImportResolution importResolution = resolveImport(modulePart, connection.codedata(), requestedType);
        String type = replacePrefix(extractType(declaration, connectionName), importResolution.requestedPrefix(),
                importResolution.effectivePrefix());
        String assignment = toAssignment(declaration, connectionName, importResolution.requestedPrefix(),
                importResolution.effectivePrefix());

        generatedEdits.removeIf(edit -> edit.getNewText().contains("import " + connection.codedata().org() + "/"
                + connection.codedata().module()));
        if (generatedEdits.isEmpty()) {
            generated.remove(filePath);
        } else {
            generated.put(filePath, generatedEdits);
        }
        if (importResolution.importText() != null) {
            addEdit(generated, filePath, importEdit(modulePart, importResolution.importText()));
        }
        return new GeneratedClassNode(type, assignment, generated);
    }

    private static GeneratedClassNode generateMcpToolKitSource(WorkspaceManager workspaceManager, Path filePath,
                                                               FlowNode mcpToolKit, LineRange classLineRange,
                                                               LSClientLogger lsClientLogger) {
        String toolKitName = fieldName(mcpToolKit);
        SourceBuilder sourceBuilder = new SourceBuilder(classOwnedToolKit(mcpToolKit, filePath, classLineRange),
                workspaceManager, filePath, lsClientLogger);
        Map<Path, List<TextEdit>> generated = new McpToolKitBuilder().toSource(sourceBuilder);
        List<TextEdit> generatedEdits = new ArrayList<>(generated.getOrDefault(filePath, List.of()));
        String declaration = removeDeclaration(generatedEdits, toolKitName, "MCP toolkit");
        if (generatedEdits.isEmpty()) {
            generated.remove(filePath);
        } else {
            generated.put(filePath, generatedEdits);
        }
        return new GeneratedClassNode(extractType(declaration, toolKitName),
                toAssignment(declaration, toolKitName, null, null), generated);
    }

    private static ClassContext loadContext(WorkspaceManager workspaceManager, Path filePath,
                                            LineRange classLineRange) {
        try {
            workspaceManager.loadProject(filePath);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            throw new IllegalArgumentException("Unable to load the project", e);
        }
        Document document = workspaceManager.document(filePath)
                .orElseThrow(() -> new IllegalArgumentException("Class file is not available"));
        ModulePartNode modulePart = document.syntaxTree().rootNode();
        ClassDefinitionNode classDefinition = findClass(modulePart, document.textDocument(), classLineRange)
                .orElseThrow(() -> new IllegalArgumentException("Class was not found"));
        FunctionDefinitionNode init = findInit(classDefinition)
                .orElseThrow(() -> new IllegalArgumentException("Class constructor was not found"));
        if (!(init.functionBody() instanceof FunctionBodyBlockNode body)) {
            throw new IllegalArgumentException("Class constructor must have a block body");
        }
        return new ClassContext(document, modulePart, classDefinition, init, body);
    }

    private static FlowNode localConnection(FlowNode connection, LineRange classLineRange) {
        Map<String, Property> properties = new HashMap<>(connection.properties());
        properties.put(Property.SCOPE_KEY, new Property.Builder<FlowNode>(null)
                .value(Property.LOCAL_SCOPE)
                .build());
        Codedata cd = connection.codedata();
        Codedata localCodedata = new Codedata(NodeKind.NEW_CONNECTION, cd.org(), cd.module(), cd.packageName(),
                cd.object(), cd.symbol(), cd.version(), classLineRange, cd.sourceCode(), cd.parentSymbol(),
                cd.resourcePath(), cd.id(), false, cd.isGenerated(), cd.inferredReturnType(), cd.data());
        return new FlowNode(connection.id(), connection.metadata(), localCodedata, connection.returning(),
                connection.branches(), properties, connection.diagnostics(), connection.flags());
    }

    private static FlowNode classOwnedToolKit(FlowNode toolKit, Path filePath, LineRange classLineRange) {
        Map<String, Object> data = new HashMap<>();
        if (toolKit.codedata().data() != null) {
            data.putAll(toolKit.codedata().data());
        }
        data.put(Constants.FILE_PATH_KEY, filePath.toString());
        data.put(McpToolKitBuilder.AGENT_DEFINITION_MCP_TOOL_KIT, true);

        Codedata cd = toolKit.codedata();
        Codedata classOwnedCodedata = new Codedata(cd.node(), cd.org(), cd.module(), cd.packageName(),
                cd.object(), cd.symbol(), cd.version(), classLineRange, cd.sourceCode(), cd.parentSymbol(),
                cd.resourcePath(), cd.id(), true, cd.isGenerated(), cd.inferredReturnType(), data);
        return new FlowNode(toolKit.id(), toolKit.metadata(), classOwnedCodedata, toolKit.returning(),
                toolKit.branches(), new HashMap<>(toolKit.properties()), toolKit.diagnostics(), toolKit.flags());
    }

    private static String removeDeclaration(List<TextEdit> edits, String fieldName, String nodeLabel) {
        Pattern declarationPattern = Pattern.compile("(?s).*\\bfinal\\s+.+?\\s+" + Pattern.quote(fieldName)
                + "\\s*=\\s*check\\s+new.*");
        for (int index = 0; index < edits.size(); index++) {
            TextEdit edit = edits.get(index);
            if (declarationPattern.matcher(edit.getNewText()).matches()) {
                edits.remove(index);
                return edit.getNewText().strip();
            }
        }
        throw new IllegalArgumentException("Unable to generate the " + nodeLabel + " initializer");
    }

    private static String extractType(String declaration, String fieldName) {
        Pattern pattern = Pattern.compile("(?s)^final\\s+(.+?)\\s+" + Pattern.quote(fieldName) + "\\s*=");
        Matcher matcher = pattern.matcher(declaration);
        if (!matcher.find()) {
            throw new IllegalArgumentException("Unable to determine the class-owned field type");
        }
        return matcher.group(1).strip();
    }

    private static String toAssignment(String declaration, String fieldName, String requestedPrefix,
                                       String effectivePrefix) {
        Pattern pattern = Pattern.compile("(?s)^final\\s+.+?\\s+" + Pattern.quote(fieldName) + "\\s*=\\s*");
        Matcher matcher = pattern.matcher(declaration);
        if (!matcher.find()) {
            throw new IllegalArgumentException("Unable to determine the class-owned initializer");
        }
        String initializer = declaration.substring(matcher.end());
        return "self." + fieldName + " = " + replacePrefix(initializer, requestedPrefix, effectivePrefix);
    }

    private static String replacePrefix(String source, String requestedPrefix, String effectivePrefix) {
        if (requestedPrefix == null || requestedPrefix.equals(effectivePrefix)) {
            return source;
        }
        return source.replace(requestedPrefix + ":", effectivePrefix + ":");
    }

    private static Optional<ClassDefinitionNode> findClass(ModulePartNode modulePart, TextDocument textDocument,
                                                            LineRange classLineRange) {
        int start = textDocument.textPositionFrom(classLineRange.startLine());
        int end = textDocument.textPositionFrom(classLineRange.endLine());
        NonTerminalNode node = modulePart.findNode(TextRange.from(start, Math.max(0, end - start)), true);
        if (node instanceof ClassDefinitionNode classDefinition) {
            return Optional.of(classDefinition);
        }
        return modulePart.members().stream()
                .filter(ClassDefinitionNode.class::isInstance)
                .map(ClassDefinitionNode.class::cast)
                .filter(classDefinition -> classDefinition.lineRange().equals(classLineRange))
                .findFirst();
    }

    private static Optional<FunctionDefinitionNode> findInit(ClassDefinitionNode classDefinition) {
        return classDefinition.members().stream()
                .filter(FunctionDefinitionNode.class::isInstance)
                .map(FunctionDefinitionNode.class::cast)
                .filter(function -> "init".equals(function.functionName().text().trim()))
                .findFirst();
    }

    private static Optional<LinePosition> findInitInsertionPoint(FunctionBodyBlockNode body) {
        for (StatementNode statement : body.statements()) {
            if (statement instanceof AssignmentStatementNode assignment
                    && "self.agent".equals(assignment.varRef().toSourceCode().trim())) {
                return Optional.of(statement.lineRange().startLine());
            }
        }
        return Optional.empty();
    }

    private static Optional<Node> findField(ClassDefinitionNode classDefinition, String fieldName) {
        Pattern fieldPattern = Pattern.compile("(?s).*\\b" + Pattern.quote(fieldName) + "\\s*;\\s*");
        return classDefinition.members().stream()
                .filter(member -> fieldPattern.matcher(member.toSourceCode()).matches())
                .findFirst();
    }

    private static Optional<StatementNode> findAssignment(ClassDefinitionNode classDefinition, String fieldName) {
        Optional<FunctionDefinitionNode> init = findInit(classDefinition);
        if (init.isEmpty() || !(init.get().functionBody() instanceof FunctionBodyBlockNode body)) {
            return Optional.empty();
        }
        String selfField = "self." + fieldName;
        return body.statements().stream()
                .filter(AssignmentStatementNode.class::isInstance)
                .map(AssignmentStatementNode.class::cast)
                .filter(assignment -> selfField.equals(assignment.varRef().toSourceCode().trim()))
                .map(StatementNode.class::cast)
                .findFirst();
    }

    private static Optional<TextEdit> wireToolIntoList(ClassDefinitionNode classDefinition, String fieldName) {
        ListConstructorExpressionNode toolsList = findInnerToolsList(classDefinition);
        if (toolsList == null) {
            return Optional.empty();
        }
        String element = "self." + fieldName;
        boolean exists = toolsList.expressions().stream()
                .map(expression -> expression.toSourceCode().trim())
                .anyMatch(element::equals);
        if (exists) {
            return Optional.empty();
        }
        if (toolsList.expressions().isEmpty()) {
            return Optional.of(new TextEdit(toRange(toolsList.openBracket().lineRange().endLine()), element));
        }
        return Optional.of(new TextEdit(toRange(toolsList.closeBracket().lineRange().startLine()), ", " + element));
    }

    private static Optional<TextEdit> removeToolFromList(ClassDefinitionNode classDefinition, String fieldName) {
        ListConstructorExpressionNode toolsList = findInnerToolsList(classDefinition);
        if (toolsList == null) {
            return Optional.empty();
        }
        String element = "self." + fieldName;
        List<String> retained = toolsList.expressions().stream()
                .map(expression -> expression.toSourceCode())
                .map(String::trim)
                .filter(tool -> !element.equals(tool))
                .toList();
        if (retained.size() == toolsList.expressions().size()) {
            return Optional.empty();
        }
        return Optional.of(new TextEdit(toRange(toolsList.lineRange()), "[" + String.join(", ", retained) + "]"));
    }

    private static ListConstructorExpressionNode findInnerToolsList(ClassDefinitionNode classDefinition) {
        for (Node member : classDefinition.members()) {
            if (!(member instanceof FunctionDefinitionNode function) || !"init".equals(function.functionName().text())
                    || !(function.functionBody() instanceof FunctionBodyBlockNode body)) {
                continue;
            }
            for (StatementNode statement : body.statements()) {
                ListConstructorExpressionNode tools = extractToolsFromAssignment(statement);
                if (tools != null) {
                    return tools;
                }
            }
        }
        return null;
    }

    private static ListConstructorExpressionNode extractToolsFromAssignment(StatementNode statement) {
        if (!(statement instanceof AssignmentStatementNode assignment)) {
            return null;
        }
        ExpressionNode expression = assignment.expression();
        if (expression instanceof CheckExpressionNode checkExpression) {
            expression = checkExpression.expression();
        }
        SeparatedNodeList<FunctionArgumentNode> args;
        if (expression instanceof ImplicitNewExpressionNode implicitNew) {
            if (implicitNew.parenthesizedArgList().isEmpty()) {
                return null;
            }
            args = implicitNew.parenthesizedArgList().get().arguments();
        } else if (expression instanceof ExplicitNewExpressionNode explicitNew) {
            args = explicitNew.parenthesizedArgList().arguments();
        } else {
            return null;
        }
        for (FunctionArgumentNode arg : args) {
            if (arg instanceof NamedArgumentNode namedArg && TOOLS_ARG.equals(namedArg.argumentName().name().text())
                    && namedArg.expression() instanceof ListConstructorExpressionNode list) {
                return list;
            }
        }
        return null;
    }

    private static String extractFieldType(String fieldSource, String fieldName) {
        Pattern pattern = Pattern.compile("(?s).*\\bfinal\\s+(.+?)\\s+" + Pattern.quote(fieldName) + "\\s*;.*");
        Matcher matcher = pattern.matcher(fieldSource);
        if (matcher.matches()) {
            return matcher.group(1).strip();
        }
        pattern = Pattern.compile("(?s).*\\b(.+?)\\s+" + Pattern.quote(fieldName) + "\\s*;.*");
        matcher = pattern.matcher(fieldSource);
        if (!matcher.matches()) {
            return null;
        }
        return matcher.group(1).replace("private", "").strip();
    }

    private static boolean isFieldTypeUsedByAnotherField(ModulePartNode modulePart, String fieldType,
                                                          String fieldName) {
        Pattern fieldPattern = Pattern.compile("(?s).*\\b" + Pattern.quote(fieldType)
                + "\\s+(?!\\Q" + fieldName + "\\E\\b)\\w+\\s*;.*");
        return modulePart.members().stream()
                .filter(ClassDefinitionNode.class::isInstance)
                .map(ClassDefinitionNode.class::cast)
                .flatMap(classDefinition -> classDefinition.members().stream())
                .anyMatch(member -> fieldPattern.matcher(member.toSourceCode()).matches());
    }

    private static Optional<ClassDefinitionNode> findGeneratedToolKitClass(ModulePartNode modulePart,
                                                                            String fieldType) {
        return modulePart.members().stream()
                .filter(ClassDefinitionNode.class::isInstance)
                .map(ClassDefinitionNode.class::cast)
                .filter(classDefinition -> fieldType.equals(classDefinition.className().text().trim()))
                .filter(classDefinition -> classDefinition.toSourceCode().contains("McpBaseToolKit"))
                .findFirst();
    }

    private static void ensureErrorReturn(FunctionDefinitionNode init, Map<Path, List<TextEdit>> edits,
                                          Path filePath) {
        Optional<ReturnTypeDescriptorNode> returnType = init.functionSignature().returnTypeDesc();
        if (returnType.isPresent()) {
            if (!returnType.get().toSourceCode().contains("error")) {
                throw new IllegalArgumentException("Class constructor must return error?");
            }
            return;
        }
        addEdit(edits, filePath, new TextEdit(toRange(init.functionSignature().closeParenToken().lineRange().endLine()),
                " returns error?"));
    }

    private static ImportResolution resolveImport(ModulePartNode modulePart, Codedata codedata, String type) {
        String requestedPrefix = type.contains(":") ? type.substring(0, type.indexOf(':')) : null;
        if (requestedPrefix == null) {
            return new ImportResolution(null, null, null);
        }
        String moduleId = codedata.org() + "/" + codedata.module();
        Set<String> usedPrefixes = new HashSet<>();
        for (ImportDeclarationNode importDeclaration : modulePart.imports()) {
            String importedModule = importModuleId(importDeclaration);
            String prefix = importPrefix(importDeclaration);
            usedPrefixes.add(prefix);
            if (moduleId.equals(importedModule)) {
                return new ImportResolution(requestedPrefix, prefix, null);
            }
        }
        String effectivePrefix = requestedPrefix;
        for (int suffix = 2; usedPrefixes.contains(effectivePrefix); suffix++) {
            effectivePrefix = requestedPrefix + suffix;
        }
        String importText = "import " + moduleId
                + (effectivePrefix.equals(requestedPrefix) ? "" : " as " + effectivePrefix) + ";";
        return new ImportResolution(requestedPrefix, effectivePrefix, importText);
    }

    private static TextEdit importEdit(ModulePartNode modulePart, String importText) {
        if (modulePart.imports().isEmpty()) {
            return new TextEdit(toRange(modulePart.lineRange().startLine()), importText + System.lineSeparator());
        }
        return new TextEdit(toRange(modulePart.imports().get(modulePart.imports().size() - 1).lineRange().endLine()),
                System.lineSeparator() + importText);
    }

    private static String importModuleId(ImportDeclarationNode declaration) {
        String org = declaration.orgName().map(value -> value.orgName().text().trim()).orElse("");
        String module = declaration.moduleName().stream().map(token -> token.text().trim())
                .reduce((left, right) -> left + "." + right).orElse("");
        return org.isEmpty() ? module : org + "/" + module;
    }

    private static String importPrefix(ImportDeclarationNode declaration) {
        if (declaration.prefix().isPresent()) {
            return declaration.prefix().get().prefix().text().trim();
        }
        List<String> segments = declaration.moduleName().stream().map(token -> token.text().trim()).toList();
        return segments.get(segments.size() - 1);
    }

    private static String detectMemberIndent(ClassDefinitionNode classDefinition, TextDocument textDocument) {
        for (Node member : classDefinition.members()) {
            int offset = textDocument.textPositionFrom(member.lineRange().startLine());
            String source = textDocument.toString();
            int lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
            String indent = source.substring(lineStart, Math.min(offset, source.length()));
            if (!indent.isBlank()) {
                return indent;
            }
        }
        return INDENT;
    }

    private static String fieldName(FlowNode flowNode) {
        return flowNode.getProperty(Property.VARIABLE_KEY)
                .map(Property::value)
                .map(Object::toString)
                .map(ClassOwnedNodeManager::stripSelf)
                .filter(name -> !name.isBlank())
                .orElseThrow(() -> new IllegalArgumentException("Class-owned field name is required"));
    }

    private static String stripSelf(String name) {
        String trimmed = name.trim();
        return trimmed.startsWith("self.") ? trimmed.substring("self.".length()) : trimmed;
    }

    private static void mergeEdits(Map<Path, List<TextEdit>> target, Map<Path, List<TextEdit>> source) {
        source.forEach((path, edits) -> edits.forEach(edit -> addEdit(target, path, edit)));
    }

    private static Range toRange(LinePosition linePosition) {
        return new Range(new org.eclipse.lsp4j.Position(linePosition.line(), linePosition.offset()),
                new org.eclipse.lsp4j.Position(linePosition.line(), linePosition.offset()));
    }

    private static Range toRange(LineRange lineRange) {
        return new Range(new org.eclipse.lsp4j.Position(lineRange.startLine().line(), lineRange.startLine().offset()),
                new org.eclipse.lsp4j.Position(lineRange.endLine().line(), lineRange.endLine().offset()));
    }

    private static void addEdit(Map<Path, List<TextEdit>> edits, Path filePath, TextEdit edit) {
        edits.computeIfAbsent(filePath, ignored -> new ArrayList<>()).add(edit);
    }

    private record ClassContext(Document document, ModulePartNode modulePart, ClassDefinitionNode classDefinition,
                                FunctionDefinitionNode init, FunctionBodyBlockNode initBody) {
    }

    private record GeneratedClassNode(String type, String assignment, Map<Path, List<TextEdit>> edits) {
    }

    private record ImportResolution(String requestedPrefix, String effectivePrefix, String importText) {
    }
}
