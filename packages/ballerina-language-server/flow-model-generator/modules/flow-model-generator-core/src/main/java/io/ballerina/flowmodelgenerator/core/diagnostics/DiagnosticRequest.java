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

package io.ballerina.flowmodelgenerator.core.diagnostics;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.flowmodelgenerator.core.CodeAnalyzer;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocumentChange;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Callable;

/**
 * Represents a request for obtaining diagnostics for the entire flow node. This class implements {@link Callable}, and
 * returns a {@link JsonElement} with the diagnostics annotated to the flow node.
 *
 * @since 1.0.0
 */
public class DiagnosticRequest implements Callable<JsonElement> {

    private static final Gson gson = new Gson();

    private final String filePath;
    private final JsonElement flowNode;
    private final WorkspaceManager workspaceManager;
    private final Map<Path, TextDocument> prevDocs;

    public DiagnosticRequest(String filePath, JsonElement flowNode, WorkspaceManager workspaceManager) {
        this.filePath = filePath;
        this.flowNode = flowNode;
        this.workspaceManager = workspaceManager;
        this.prevDocs = new HashMap<>();
    }

    @Override
    public JsonElement call() {
        // Get the project and document
        Path path = Path.of(filePath);
        Project project;
        try {
            project = workspaceManager.loadProject(path);
        } catch (WorkspaceDocumentException | EventSyncException e) {
            return null;
        }
        Optional<Document> document = workspaceManager.document(path);
        Optional<SemanticModel> semanticModelOp = workspaceManager.semanticModel(path);

        if (document.isEmpty() || semanticModelOp.isEmpty()) {
            return null;
        }

        // Parse the flow node
        FlowNode flowNodeObj = gson.fromJson(flowNode, FlowNode.class);
        if (flowNodeObj == null || flowNodeObj.codedata() == null) {
            return null;
        }

        // Generate text edits using SourceBuilder (similar to SourceGenerator)
        SourceBuilder sourceBuilder = new SourceBuilder(flowNodeObj, workspaceManager, path);
        Map<Path, List<TextEdit>> textEdits = NodeBuilder
                .getNodeFromKind(flowNodeObj.codedata().node())
                .semanticModel(semanticModelOp.get())
                .toSource(sourceBuilder);

        // Apply edits for the primary file. The returned metadata pinpoints the main statement
        // edit (last sorted edit) in the updated document, which is needed below to find its
        // ST node.
        EditApplication primary = applyLspEdits(path, textEdits.get(path));
        if (primary == null) {
            return null;
        }
        Document updatedDoc = primary.updatedDoc();

        // Apply edits for any other affected files (e.g. types defined in a separate .bal file) so
        // that the project compiles before the semantic model is retrieved below.
        for (Map.Entry<Path, List<TextEdit>> entry : textEdits.entrySet()) {
            Path otherPath = entry.getKey();
            if (otherPath.equals(path)) {
                continue;
            }
            applyLspEdits(otherPath, entry.getValue());
        }

        // Find the ST node relevant to the modified range
        TextDocument updatedTextDocument = updatedDoc.textDocument();
        ModulePartNode modulePartNode = updatedDoc.syntaxTree().rootNode();
        NonTerminalNode node = modulePartNode.findNode(TextRange.from(primary.mainEditStart(),
                updatedTextDocument.textPositionFrom(primary.mainEditEnd()) - primary.mainEditStart()), true);

        // Generate the flow node for the ST node with the respective diagnostics annotated. CodeAnalyzer's default
        // DiagnosticHandler already sources from the package compilation, which includes compiler plugin diagnostics.
        SemanticModel semanticModel = project.currentPackage().getCompilation()
                .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
        NodeKind flowKind = flowNodeObj.codedata().node();
        CodeAnalyzer codeAnalyzer = new CodeAnalyzer(project, semanticModel, Property.LOCAL_SCOPE, Map.of(),
                Map.of(), updatedTextDocument, ModuleInfo.from(updatedDoc.module().descriptor()),
                (flowKind == NodeKind.VARIABLE || flowKind == NodeKind.ASSIGN),
                workspaceManager, path);
        node.accept(codeAnalyzer);
        List<FlowNode> flowNodes = codeAnalyzer.getFlowNodes();
        if (flowNodes.size() != 1) {
            return null;
        }
        FlowNode resultNode = flowNodes.getFirst();
        return gson.toJsonTree(resultNode);
    }

    public String getKey() {
        return filePath + ":" + flowNode.hashCode();
    }

    public void revertDocument() {
        for (Map.Entry<Path, TextDocument> entry : prevDocs.entrySet()) {
            TextDocument prev = entry.getValue();
            workspaceManager.document(entry.getKey()).ifPresent(value -> value
                    .modify()
                    .withContent(String.join(System.lineSeparator(), prev.textLines()))
                    .apply());
        }
    }

    private EditApplication applyLspEdits(Path targetPath, List<TextEdit> lspEdits) {
        if (lspEdits == null || lspEdits.isEmpty()) {
            return null;
        }
        Optional<Document> documentOp = workspaceManager.document(targetPath);
        if (documentOp.isEmpty()) {
            return null;
        }
        Document document = documentOp.get();
        TextDocument textDocument = document.textDocument();

        // Sort edits by ascending file position so that:
        // 1. TextDocument.apply() receives them in the required ascending order.
        // 2. Secondary edits (e.g. parameter insertions) always precede the main statement edit,
        //    making the cumulativeLength offset calculation correct regardless of the order in
        //    which builders called SourceBuilder.textEdit() (which uses addFirst and therefore
        //    produces a reverse-position list).
        List<TextEdit> sortedEdits = lspEdits.stream()
                .sorted(Comparator.comparingInt((TextEdit e) -> e.getRange().getStart().getLine())
                        .thenComparingInt(e -> e.getRange().getStart().getCharacter()))
                .toList();

        int numTotalEdits = sortedEdits.size();
        int mainEditStart = 0;
        int cumulativeLength = 0;
        LinePosition mainEditEnd = null;
        List<io.ballerina.tools.text.TextEdit> ballerinaEdits = new ArrayList<>();

        for (int editIndex = 0; editIndex < numTotalEdits; editIndex++) {
            TextEdit edit = sortedEdits.get(editIndex);
            Range editRange = edit.getRange();
            int startLine = editRange.getStart().getLine();
            int endLine = editRange.getEnd().getLine();
            int startCharacter = editRange.getStart().getCharacter();
            int endCharacter = editRange.getEnd().getCharacter();
            int startPos = textDocument.textPositionFrom(LinePosition.from(startLine, startCharacter));
            int endPos = textDocument.textPositionFrom(LinePosition.from(endLine, endCharacter));

            // The last edit (highest file position after sorting) is the main statement node.
            // All preceding edits are secondary (e.g. parameter insertions) that shift the
            // main node's position in the updated document by their cumulative text length.
            if (editIndex == numTotalEdits - 1) {
                mainEditStart = cumulativeLength + startPos;
                // Calculate the end position after the edit:
                // - If multi-line edit: position is at the end of the last inserted text line
                // - If single-line edit: position is start character + length of inserted text. (We need to
                // account the existing indentation at the start)
                List<String> textEditLines = edit.getNewText().lines().toList();
                String lastLine = textEditLines.getLast();
                int numLines = textEditLines.size();
                // For multi-line new text, the end line in the updated document is always
                // startLine + (numNewLines - 1), regardless of the original edit range's endLine.
                // This handles existing nodes that get replaced by content with a different line count.
                int endLineForRange = numLines > 1 ? startLine + numLines - 1 : endLine;
                mainEditEnd = LinePosition.from(endLineForRange,
                        numLines > 1 ? lastLine.length() : startCharacter + lastLine.length());
            } else {
                cumulativeLength += edit.getNewText().length();
            }

            ballerinaEdits.add(io.ballerina.tools.text.TextEdit.from(
                    TextRange.from(startPos, endPos - startPos), edit.getNewText()));
        }

        TextDocument newTextDocument = textDocument.apply(
                TextDocumentChange.from(ballerinaEdits.toArray(new io.ballerina.tools.text.TextEdit[0])));
        prevDocs.put(targetPath, document.textDocument());
        Document updatedDoc = document.modify()
                .withContent(String.join(System.lineSeparator(), newTextDocument.textLines()))
                .apply();
        return new EditApplication(updatedDoc, mainEditStart, mainEditEnd);
    }

    private record EditApplication(Document updatedDoc, int mainEditStart, LinePosition mainEditEnd) { }
}
