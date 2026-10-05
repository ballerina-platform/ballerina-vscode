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
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.util.ProjectConstants;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocuments;
import org.ballerinalang.formatter.core.Formatter;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.formatter.core.FormatterUtils;
import org.ballerinalang.formatter.core.options.FormattingOptions;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Generates source code from the flow model.
 *
 * @since 1.0.0
 */
public class SourceGenerator {

    private final Gson gson;
    private final WorkspaceManager workspaceManager;
    private Path filePath;

    public SourceGenerator(WorkspaceManager workspaceManager, Path filePath) {
        this.workspaceManager = workspaceManager;
        this.filePath = filePath;
        gson = new GsonBuilder()
                .setPrettyPrinting()
                .disableHtmlEscaping()
                .create();
    }

    /**
     * Converts the flow model to source code.
     *
     * @param diagramNode The flow model node to be converted.
     * @return The source code of the flow model node.
     */
    public JsonElement toSourceCode(JsonElement diagramNode, LSClientLogger lsClientLogger) {
        return gson.toJsonTree(generateTextEdits(diagramNode, lsClientLogger));
    }

    /**
     * Converts the flow model to one formatted edit per Ballerina document, so the client applies the final source
     * in a single step instead of applying the raw edits and formatting afterwards.
     *
     * @param diagramNode    The flow model node to be converted.
     * @param lsClientLogger The client logger.
     * @return The formatted edits with the raw edits they came from; the formatted edits are null when a document
     *         could not be formatted.
     */
    public FormattedSource toFormattedSourceCode(JsonElement diagramNode, LSClientLogger lsClientLogger) {
        Map<Path, List<TextEdit>> sourceEdits = generateTextEdits(diagramNode, lsClientLogger);
        return new FormattedSource(formatTextEdits(sourceEdits).orElse(null), gson.toJsonTree(sourceEdits));
    }

    /**
     * Folds the edits of each Ballerina document into one formatted edit; other files keep their edits.
     *
     * @param textEdits The edits per file.
     * @return The folded edits, or empty when a document could not be formatted.
     */
    public Optional<JsonElement> formatTextEdits(Map<Path, List<TextEdit>> textEdits) {
        Map<Path, List<TextEdit>> formattedEdits = new LinkedHashMap<>();
        for (Map.Entry<Path, List<TextEdit>> entry : textEdits.entrySet()) {
            Path path = entry.getKey();
            if (!path.toString().endsWith(ProjectConstants.BLANG_SOURCE_EXT)) {
                formattedEdits.put(path, entry.getValue());
                continue;
            }
            Optional<TextEdit> documentEdit = formattedDocumentEdit(path, entry.getValue());
            if (documentEdit.isEmpty()) {
                return Optional.empty();
            }
            formattedEdits.put(path, List.of(documentEdit.get()));
        }
        return Optional.of(gson.toJsonTree(formattedEdits));
    }

    /**
     * Formatted edits and the raw edits they were folded from.
     *
     * @param textEdits   one formatted edit per Ballerina document, or null when formatting failed
     * @param sourceEdits the raw edits produced by the node builder
     */
    public record FormattedSource(JsonElement textEdits, JsonElement sourceEdits) {
    }

    private Optional<TextEdit> formattedDocumentEdit(Path path, List<TextEdit> edits) {
        String original = currentText(path);
        TextDocument document = TextDocuments.from(original);
        StringBuilder source = new StringBuilder(original);
        List<TextEdit> ordered = new ArrayList<>(edits);
        ordered.sort(Comparator.comparingInt(edit -> offset(document, edit.getRange().getStart())));
        // Applied back to front so earlier offsets stay valid; inserts at one position keep their list order.
        for (int i = ordered.size() - 1; i >= 0; i--) {
            TextEdit edit = ordered.get(i);
            source.replace(offset(document, edit.getRange().getStart()), offset(document, edit.getRange().getEnd()),
                    edit.getNewText());
        }
        try {
            String formatted = Formatter.format(SyntaxTree.from(TextDocuments.from(source.toString())),
                    formattingOptions(path)).toSourceCode();
            LinePosition end = document.linePositionFrom(original.length());
            return Optional.of(new TextEdit(new Range(new Position(0, 0), new Position(end.line(), end.offset())),
                    formatted));
        } catch (FormatterException e) {
            return Optional.empty();
        }
    }

    private String currentText(Path path) {
        return workspaceManager.document(path)
                .map(document -> document.textDocument().toString())
                .orElseGet(() -> {
                    try {
                        return Files.exists(path) ? Files.readString(path) : "";
                    } catch (IOException e) {
                        return "";
                    }
                });
    }

    private FormattingOptions formattingOptions(Path path) throws FormatterException {
        Optional<Project> project = workspaceManager.project(path);
        return project.isPresent() && project.get() instanceof BuildProject buildProject
                ? FormatterUtils.buildFormattingOptions(buildProject)
                : FormattingOptions.builder().build();
    }

    private static int offset(TextDocument document, Position position) {
        return document.textPositionFrom(LinePosition.from(position.getLine(), position.getCharacter()));
    }

    private Map<Path, List<TextEdit>> generateTextEdits(JsonElement diagramNode, LSClientLogger lsClientLogger) {
        FlowNode flowNode = gson.fromJson(diagramNode, FlowNode.class);
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath, lsClientLogger);
        Map<Path, List<TextEdit>> textEdits =
                NodeBuilder.getNodeFromKind(flowNode.codedata().node()).toSource(sourceBuilder);
        if (textEdits == null) {
            throw new IllegalStateException("The operation produced no source edits; "
                    + "the diagram may be out of date — refresh and try again");
        }
        addNewLine(textEdits);
        return textEdits;
    }

    // If text edit add new change, add new line to the text edit
    private void addNewLine(Map<Path, List<TextEdit>> textEdits) {
        for (Map.Entry<Path, List<TextEdit>> pathListEntry : textEdits.entrySet()) {
            List<TextEdit> edits = pathListEntry.getValue();
            for (TextEdit edit : edits) {
                Range range = edit.getRange();
                if (!range.getStart().equals(new Position(0, 0)) && range.getStart().equals(range.getEnd())) {
                    edit.setNewText(System.lineSeparator() + edit.getNewText());
                    break;
                }
            }
        }
    }
}
