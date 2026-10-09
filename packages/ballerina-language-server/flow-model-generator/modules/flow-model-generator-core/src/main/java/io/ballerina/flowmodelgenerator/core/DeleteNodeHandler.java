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
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.BlockStatementNode;
import io.ballerina.compiler.syntax.tree.DoStatementNode;
import io.ballerina.compiler.syntax.tree.ElseBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.IfElseStatementNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ImportOrgNameNode;
import io.ballerina.compiler.syntax.tree.ImportPrefixNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.FormBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.node.WaitDataBuilder;
import io.ballerina.flowmodelgenerator.core.utils.TypeUtils;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.model.node.WaitDataBuilder.DATA_WAITS_KEY;

/**
 * Generates text edits for the nodes that are requested to delete.
 *
 * @since 1.0.0
 */
public class DeleteNodeHandler {

    private static final Gson gson = new Gson();
    private final FlowNode nodeToDelete;
    private final Path filePath;
    private static final String EXPECTED_PREFIX = "_";
    private static final String DRIVER_SUFFIX = ".driver";
    private static final Set<String> DB_DRIVERS = CommonUtils.PERSIST_DB_DRIVERS.stream()
            .map(driver -> driver.substring(driver.lastIndexOf('/') + 1))
            .collect(Collectors.toSet());

    public DeleteNodeHandler(JsonElement nodeToDelete, Path filePath) {
        this.nodeToDelete = new Gson().fromJson(nodeToDelete, FlowNode.class);
        this.filePath = filePath;
    }

    @Deprecated
    public JsonElement getTextEditsToDeletedNode(Document document, Project project) {
        if (nodeToDelete.codedata() != null) {
            if (nodeToDelete.codedata().node() == NodeKind.ERROR_HANDLER) {
                return handleErrorHandlerDeletion(nodeToDelete.codedata().lineRange(), filePath, document, project);
            }
            if (nodeToDelete.codedata().node() == NodeKind.WAIT_DATA) {
                return handleWaitDataDeletion(nodeToDelete, nodeToDelete.codedata().lineRange(), filePath,
                        document, project);
            }
        }

        LineRange lineRange = nodeToDelete.codedata().lineRange();
        return getTextEditsToDeletedNode(lineRange, filePath, document, project);
    }

    public static JsonElement getTextEditsToDeletedNode(JsonElement node, Path filePath,
                                                        Document document, Project project) {
        FlowNode flowNode = gson.fromJson(node, FlowNode.class);
        LineRange lineRange = getNodeLineRange(node);

        if (flowNode.codedata() != null) {
            if (flowNode.codedata().node() == NodeKind.ERROR_HANDLER) {
                return handleErrorHandlerDeletion(lineRange, filePath, document, project);
            }
            if (flowNode.codedata().node() == NodeKind.WAIT_DATA) {
                return handleWaitDataDeletion(flowNode, lineRange, filePath, document, project);
            }
        }

        return getTextEditsToDeletedNode(lineRange, filePath, document, project);
    }

    private static JsonElement getTextEditsToDeletedNode(LineRange lineRange, Path filePath,
                                                         Document document, Project project) {
        TextDocument textDocument = document.textDocument();
        int startTextPosition = textDocument.textPositionFrom(lineRange.startLine());
        int endTextPosition = textDocument.textPositionFrom(lineRange.endLine());

        List<TextEdit> textEdits = unusedImportEdits(document, startTextPosition, endTextPosition);

        LineRange nodeRangeToDelete = checkElseToDelete(document, startTextPosition, endTextPosition);
        if (nodeRangeToDelete == null) {
            nodeRangeToDelete = lineRange;
        }
        TextEdit textEdit = new TextEdit(CommonUtils.toRange(nodeRangeToDelete), "");
        textEdits.add(textEdit);
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        textEditsMap.put(filePath, textEdits);
        return gson.toJsonTree(textEditsMap);
    }

    // Imports whose prefix has no `prefix:name` reference left once the range is deleted, as the compiler reports them.
    private static List<TextEdit> unusedImportEdits(Document document, int start, int end) {
        ModulePartNode root = document.syntaxTree().rootNode();
        Set<String> deletedPrefixes = new HashSet<>();
        Set<String> remainingPrefixes = new HashSet<>();
        collectModulePrefixes(root, start, end, deletedPrefixes, remainingPrefixes);

        List<TextEdit> textEdits = new ArrayList<>();
        if (deletedPrefixes.isEmpty()) {
            return textEdits;
        }
        NodeList<ImportDeclarationNode> imports = root.imports();
        for (ImportDeclarationNode importNode : imports) {
            String prefix = importPrefix(importNode);
            if (prefix.equals(EXPECTED_PREFIX) || remainingPrefixes.contains(prefix)) {
                continue;
            }
            textEdits.add(new TextEdit(CommonUtils.toRange(importNode.lineRange()), ""));
            if (DB_DRIVERS.contains(prefix)) {
                driverImport(imports, prefix + DRIVER_SUFFIX).ifPresent(driverImport ->
                        textEdits.add(new TextEdit(CommonUtils.toRange(driverImport.lineRange()), "")));
            }
        }
        return textEdits;
    }

    private static void collectModulePrefixes(Node node, int start, int end, Set<String> deletedPrefixes,
                                              Set<String> remainingPrefixes) {
        if (node.kind() == SyntaxKind.QUALIFIED_NAME_REFERENCE) {
            TextRange range = node.textRange();
            boolean deleted = range.startOffset() >= start && range.endOffset() <= end;
            String prefix = ((QualifiedNameReferenceNode) node).modulePrefix().text();
            (deleted ? deletedPrefixes : remainingPrefixes).add(prefix);
            return;
        }
        if (node instanceof NonTerminalNode nonTerminalNode) {
            for (Node child : nonTerminalNode.children()) {
                collectModulePrefixes(child, start, end, deletedPrefixes, remainingPrefixes);
            }
        }
    }

    private static String importPrefix(ImportDeclarationNode importNode) {
        return importNode.prefix()
                .map(prefix -> prefix.prefix().text())
                .orElseGet(() -> importNode.moduleName().get(importNode.moduleName().size() - 1).text());
    }

    private static Optional<ImportDeclarationNode> driverImport(NodeList<ImportDeclarationNode> imports,
                                                                String driverModuleName) {
        for (ImportDeclarationNode importNode : imports) {
            Optional<ImportOrgNameNode> orgName = importNode.orgName();
            Optional<ImportPrefixNode> prefix = importNode.prefix();
            if (prefix.isPresent() && prefix.get().prefix().text().equals(EXPECTED_PREFIX)
                    && orgName.isPresent() && orgName.get().toString().equals("ballerinax/")
                    && importNode.moduleName().stream().map(Token::text).collect(Collectors.joining("."))
                    .equals(driverModuleName)) {
                return Optional.of(importNode);
            }
        }
        return Optional.empty();
    }

    private static LineRange getNodeLineRange(JsonElement node) {
        FlowNode nodeToDelete = gson.fromJson(node, FlowNode.class);
        if (nodeToDelete.codedata() != null) {
            return nodeToDelete.codedata().lineRange();
        }

        // Assume that the node has the following attributes: startLine, startColumn, endLine, endColumn
        JsonObject jsonObject = node.getAsJsonObject();
        LinePosition startLinePosition = LinePosition.from(
                jsonObject.get("startLine").getAsInt(), jsonObject.get("startColumn").getAsInt());
        LinePosition endLinePosition = LinePosition.from(
                jsonObject.get("endLine").getAsInt(), jsonObject.get("endColumn").getAsInt());
        return LineRange.from(jsonObject.get("filePath").getAsString(), startLinePosition, endLinePosition);
    }

    private static LineRange checkElseToDelete(Document document, int nodeStart, int nodeEnd) {
        ModulePartNode modulePartNode = document.syntaxTree().rootNode();
        NonTerminalNode node = modulePartNode.findNode(TextRange.from(nodeStart, nodeEnd - nodeStart)).parent();
        if (node != null && node.kind() == SyntaxKind.BLOCK_STATEMENT) {
            BlockStatementNode blockStatementNode = (BlockStatementNode) node;
            if (blockStatementNode.statements().size() == 1) {
                NonTerminalNode parent = node.parent();
                if (parent.kind() == SyntaxKind.ELSE_BLOCK) {
                    return parent.lineRange();
                }
                if (parent.kind() == SyntaxKind.IF_ELSE_STATEMENT) {
                    IfElseStatementNode ifElseStmt = (IfElseStatementNode) parent;
                    NonTerminalNode p = ifElseStmt.parent();
                    if (p != null && p.kind() == SyntaxKind.ELSE_BLOCK) {
                        ElseBlockNode elseBlock = (ElseBlockNode) p;
                        return LineRange.from(parent.lineRange().fileName(), elseBlock.lineRange().startLine(),
                                ifElseStmt.ifBody().lineRange().endLine());
                    }
                }
            }
        }
        return null;
    }

    /**
     * Handles deletion of WAIT_DATA nodes by also removing the corresponding future field(s)
     * from the data record type definition.
     *
     * @param flowNode  the flow node being deleted
     * @param lineRange the line range of the WAIT_DATA node
     * @param filePath  the file path
     * @param document  the document
     * @param project   the project
     * @return the text edits including field deletions from the data record type
     */
    private static JsonElement handleWaitDataDeletion(FlowNode flowNode, LineRange lineRange,
                                                       Path filePath, Document document, Project project) {
        // Standard deletion of the wait statement
        JsonElement standardResult = getTextEditsToDeletedNode(lineRange, filePath, document, project);

        // Extract field names from the futures property
        Optional<Property> futuresProp = flowNode.getProperty(DATA_WAITS_KEY);
        if (futuresProp.isEmpty()) {
            return standardResult;
        }

        Set<String> fieldNamesToDelete = new LinkedHashSet<>();
        Object futuresValue = futuresProp.get().value();
        if (futuresValue instanceof Map<?, ?> futuresMap && !futuresMap.isEmpty()) {
            extractFieldNamesFromDataWaits(futuresMap, fieldNamesToDelete);
        }

        if (fieldNamesToDelete.isEmpty()) {
            return standardResult;
        }

        FunctionDefinitionNode functionNode = findEnclosingFunction(document, lineRange);
        if (functionNode == null) {
            return standardResult;
        }

        // Find the data parameter (last param that is a record with all-future fields)
        SeparatedNodeList<ParameterNode> parameters = functionNode.functionSignature().parameters();
        if (parameters.isEmpty()) {
            return standardResult;
        }

        SemanticModel semanticModel = project.currentPackage().module(document.module().moduleId())
                .getCompilation().getSemanticModel();

        Optional<Symbol> paramSymbol = semanticModel.symbol(parameters.get(parameters.size() - 1));
        if (paramSymbol.isEmpty() || paramSymbol.get().kind() != SymbolKind.PARAMETER) {
            return standardResult;
        }

        TypeSymbol typeSymbol = TypeUtils.resolveTypeReference(((ParameterSymbol) paramSymbol.get()).typeDescriptor());
        if (typeSymbol.typeKind() != TypeDescKind.RECORD) {
            return standardResult;
        }

        RecordTypeSymbol recordType = (RecordTypeSymbol) typeSymbol;
        Map<String, RecordFieldSymbol> allFields = recordType.fieldDescriptors();

        // Generate field deletion edits
        JsonObject resultObject = standardResult.getAsJsonObject();
        Path projectRoot = project.sourceRoot();

        if (fieldNamesToDelete.containsAll(allFields.keySet())) {
            deleteTypeDefinitionAndParam(typeSymbol, parameters, project, projectRoot, filePath,
                    resultObject);
        } else {
            for (String fieldName : fieldNamesToDelete) {
                deleteRecordField(allFields.get(fieldName), project, projectRoot, resultObject);
            }
        }

        return resultObject;
    }

    /**
     * Extracts field names from the dataWaits property value.
     * The value is a map of indexed entries (e.g., "0", "1"), each containing a nested Property
     * with sub-properties including "dataName".
     *
     * @param dataWaitsMap the dataWaits map value
     * @param fieldNames   the set to add extracted field names to
     */
    private static void extractFieldNamesFromDataWaits(Map<?, ?> dataWaitsMap, Set<String> fieldNames) {
        for (Object entry : dataWaitsMap.values()) {
            Property entryProperty = gson.fromJson(gson.toJsonTree(entry), Property.class);
            if (!(entryProperty.value() instanceof Map<?, ?> entryData)) {
                continue;
            }
            Map<String, Property> entryProperties = gson.fromJson(gson.toJsonTree(entryData),
                    FormBuilder.NODE_PROPERTIES_TYPE);
            Property dataNameProp = entryProperties.get(WaitDataBuilder.DATA_NAME_KEY);
            if (dataNameProp != null && dataNameProp.value() != null) {
                String dataName = dataNameProp.value().toString();
                if (!dataName.isBlank()) {
                    fieldNames.add(dataName);
                }
            }
        }
    }

    /**
     * Finds the enclosing function definition for a given line range.
     */
    private static FunctionDefinitionNode findEnclosingFunction(Document document, LineRange lineRange) {
        int txtPos = document.textDocument().textPositionFrom(lineRange.startLine());
        Node node = ((ModulePartNode) document.syntaxTree().rootNode()).findNode(TextRange.from(txtPos, 0));
        while (node != null) {
            if (node.kind() == SyntaxKind.FUNCTION_DEFINITION) {
                return (FunctionDefinitionNode) node;
            }
            node = node.parent();
        }
        return null;
    }

    /**
     * Deletes the entire type definition and removes the last parameter (events param) from the function signature.
     */
    private static void deleteTypeDefinitionAndParam(TypeSymbol typeSymbol,
                                                      SeparatedNodeList<ParameterNode> parameters,
                                                      Project project, Path projectRoot,
                                                      Path functionFilePath,
                                                      JsonObject resultObject) {
        // 1. Delete the type definition
        if (typeSymbol.getLocation().isPresent()) {
            LineRange typeNameRange = typeSymbol.getLocation().get().lineRange();
            Path typesFilePath = projectRoot.resolve(typeNameRange.fileName());
            DocumentId typesDocId = project.documentId(typesFilePath);
            Document typesDocument = project.currentPackage()
                    .module(typesDocId.moduleId()).document(typesDocId);
            int textPos = typesDocument.textDocument()
                    .textPositionFrom(typeNameRange.startLine());
            Node typeNode = ((ModulePartNode) typesDocument.syntaxTree().rootNode())
                    .findNode(TextRange.from(textPos, 0));
            while (typeNode != null && typeNode.kind() != SyntaxKind.TYPE_DEFINITION) {
                typeNode = typeNode.parent();
            }
            if (typeNode != null) {
                LineRange typeDefLineRange = typeNode.lineRange();
                String pathKey = typesFilePath.toString();
                TextEdit deleteTypeEdit = new TextEdit(CommonUtils.toRange(typeDefLineRange), "");
                addEditToResult(resultObject, pathKey, deleteTypeEdit);
            }
        }

        // 2. Remove the last parameter (events param) from the function signature
        ParameterNode lastParam = parameters.get(parameters.size() - 1);
        LineRange paramLineRange = lastParam.lineRange();
        String functionPathKey = functionFilePath.toString();

        if (parameters.size() == 1) {
            // Only parameter — delete just the parameter
            TextEdit deleteParamEdit = new TextEdit(CommonUtils.toRange(paramLineRange), "");
            addEditToResult(resultObject, functionPathKey, deleteParamEdit);
        } else {
            // Multiple parameters — delete the preceding comma separator and the parameter
            // The separator before the last param is at index (size - 2) in the separator list
            Token separator = parameters.getSeparator(parameters.size() - 2);
            LineRange commaRange = separator.lineRange();
            // Build a range from the start of the comma to the end of the parameter
            Range deleteRange = new Range(
                    new Position(commaRange.startLine().line(), commaRange.startLine().offset()),
                    new Position(paramLineRange.endLine().line(), paramLineRange.endLine().offset()));
            TextEdit deleteParamEdit = new TextEdit(deleteRange, "");
            addEditToResult(resultObject, functionPathKey, deleteParamEdit);
        }
    }

    /**
     * Deletes a single record field from the type definition.
     */
    private static void deleteRecordField(RecordFieldSymbol fieldSymbol, Project project,
                                           Path projectRoot, JsonObject resultObject) {
        Optional<TextEdit> edit = getRecordFieldDeleteEdit(fieldSymbol, project, projectRoot);
        if (edit.isEmpty() || fieldSymbol.getLocation().isEmpty()) {
            return;
        }
        LineRange symbolLineRange = fieldSymbol.getLocation().get().lineRange();
        Path typesFilePath = projectRoot.resolve(symbolLineRange.fileName());
        addEditToResult(resultObject, typesFilePath.toString(), edit.get());
    }

    /**
     * Computes a {@link TextEdit} that deletes a record field from its source file.
     *
     * @param fieldSymbol the record field symbol to delete
     * @param project     the project containing the field
     * @param projectRoot the project root path
     * @return the delete edit, or empty if the field cannot be resolved
     */
    public static Optional<TextEdit> getRecordFieldDeleteEdit(RecordFieldSymbol fieldSymbol,
                                                              Project project, Path projectRoot) {
        if (fieldSymbol == null || fieldSymbol.getLocation().isEmpty()) {
            return Optional.empty();
        }
        LineRange symbolLineRange = fieldSymbol.getLocation().get().lineRange();
        Path typesFilePath = projectRoot.resolve(symbolLineRange.fileName());

        // Find the full RecordFieldNode in the syntax tree to get the complete line range
        // (including type descriptor and semicolon), not just the field name.
        // If the expanded node is not found, skip emitting the edit to avoid deleting only the
        // identifier and leaving a broken field fragment.
        DocumentId typesDocId = project.documentId(typesFilePath);
        Document typesDocument = project.currentPackage()
                .module(typesDocId.moduleId()).document(typesDocId);
        int textPos = typesDocument.textDocument()
                .textPositionFrom(symbolLineRange.startLine());
        Node fieldNode = ((ModulePartNode) typesDocument.syntaxTree().rootNode())
                .findNode(TextRange.from(textPos, 0));
        while (fieldNode != null && fieldNode.kind() != SyntaxKind.RECORD_FIELD
                && fieldNode.kind() != SyntaxKind.RECORD_FIELD_WITH_DEFAULT_VALUE) {
            fieldNode = fieldNode.parent();
        }
        if (fieldNode == null) {
            return Optional.empty();
        }

        return Optional.of(new TextEdit(CommonUtils.toRange(fieldNode.lineRange()), ""));
    }

    /**
     * Adds a text edit to the result JSON object under the given path key.
     */
    private static void addEditToResult(JsonObject resultObject, String pathKey, TextEdit edit) {
        JsonArray editsArray;
        if (resultObject.has(pathKey)) {
            editsArray = resultObject.getAsJsonArray(pathKey);
        } else {
            editsArray = new JsonArray();
            resultObject.add(pathKey, editsArray);
        }
        editsArray.add(gson.toJsonTree(edit));
    }

    /**
     * Handles deletion of ERROR_HANDLER nodes by replacing the do-on-fail block with just the body statements.
     *
     * @param lineRange the line range of the ERROR_HANDLER node
     * @param filePath  the file path
     * @param document  the document
     * @param project   the project
     * @return the text edits to replace the do-on-fail block with just the body statements
     */
    private static JsonElement handleErrorHandlerDeletion(LineRange lineRange, Path filePath,
                                                          Document document, Project project) {
        TextDocument textDocument = document.textDocument();
        int startTextPosition = textDocument.textPositionFrom(lineRange.startLine());
        int endTextPosition = textDocument.textPositionFrom(lineRange.endLine());
        ModulePartNode modulePartNode = document.syntaxTree().rootNode();
        NonTerminalNode foundNode = modulePartNode.findNode(TextRange.from(startTextPosition,
                endTextPosition - startTextPosition));

        if (foundNode == null || foundNode.kind() != SyntaxKind.DO_STATEMENT) {
            return getTextEditsToDeletedNode(lineRange, filePath, document, project);
        }

        DoStatementNode doStatementNode = (DoStatementNode) foundNode;
        BlockStatementNode blockStatement = doStatementNode.blockStatement();
        StringBuilder bodyStatements = new StringBuilder();
        NodeList<StatementNode> statements = blockStatement.statements();
        for (StatementNode statement : statements) {
            bodyStatements.append(statement.toSourceCode());
        }

        List<TextEdit> textEdits = new ArrayList<>();
        TextEdit textEdit = new TextEdit(CommonUtils.toRange(lineRange), bodyStatements.toString().trim());
        textEdits.add(textEdit);
        Map<Path, List<TextEdit>> textEditsMap = new HashMap<>();
        textEditsMap.put(filePath, textEdits);
        return gson.toJsonTree(textEditsMap);
    }
}

