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
 * Folds generated edits into one formatted edit per Ballerina document, so a client applies the final source in a
 * single step instead of applying the raw edits and formatting afterwards.
 *
 * @since 1.9.0
 */
public final class FormattedEdits {

    private FormattedEdits() {
    }

    /**
     * Folds the edits of each Ballerina document into one formatted edit; other files keep their edits.
     *
     * @param workspaceManager The workspace manager holding the current documents.
     * @param textEdits        The edits per file.
     * @return The folded edits, or empty when a document could not be formatted.
     */
    public static Optional<Map<Path, List<TextEdit>>> fold(WorkspaceManager workspaceManager,
                                                           Map<Path, List<TextEdit>> textEdits) {
        Map<Path, List<TextEdit>> formattedEdits = new LinkedHashMap<>();
        for (Map.Entry<Path, List<TextEdit>> entry : textEdits.entrySet()) {
            Path path = entry.getKey();
            if (!path.toString().endsWith(ProjectConstants.BLANG_SOURCE_EXT)) {
                formattedEdits.put(path, entry.getValue());
                continue;
            }
            Optional<TextEdit> documentEdit = formattedDocumentEdit(workspaceManager, path, entry.getValue());
            if (documentEdit.isEmpty()) {
                return Optional.empty();
            }
            formattedEdits.put(path, List.of(documentEdit.get()));
        }
        return Optional.of(formattedEdits);
    }

    /**
     * Same as {@link #fold(WorkspaceManager, Map)} for edits keyed by file path strings.
     *
     * @param workspaceManager The workspace manager holding the current documents.
     * @param textEdits        The edits per file path.
     * @return The folded edits, or empty when a document could not be formatted.
     */
    public static Optional<Map<String, List<TextEdit>>> foldByPathString(WorkspaceManager workspaceManager,
                                                                         Map<String, List<TextEdit>> textEdits) {
        Map<Path, List<TextEdit>> editsByPath = new LinkedHashMap<>();
        textEdits.forEach((file, edits) -> editsByPath.put(Path.of(file), edits));
        return fold(workspaceManager, editsByPath).map(folded -> {
            Map<String, List<TextEdit>> editsByFile = new LinkedHashMap<>();
            folded.forEach((path, edits) -> editsByFile.put(path.toString(), edits));
            return editsByFile;
        });
    }

    private static Optional<TextEdit> formattedDocumentEdit(WorkspaceManager workspaceManager, Path path,
                                                            List<TextEdit> edits) {
        String original = currentText(workspaceManager, path);
        TextDocument document = TextDocuments.from(original);
        StringBuilder source = new StringBuilder(original);
        try {
            List<TextEdit> ordered = new ArrayList<>(edits);
            ordered.sort(Comparator.comparingInt(edit -> offset(document, edit.getRange().getStart())));
            // Applied back to front so earlier offsets stay valid; inserts at one position keep their list order.
            for (int i = ordered.size() - 1; i >= 0; i--) {
                TextEdit edit = ordered.get(i);
                source.replace(offset(document, edit.getRange().getStart()),
                        offset(document, edit.getRange().getEnd()), edit.getNewText());
            }
            String formatted = Formatter.format(SyntaxTree.from(TextDocuments.from(source.toString())),
                    formattingOptions(workspaceManager, path)).toSourceCode();
            LinePosition end = document.linePositionFrom(original.length());
            return Optional.of(new TextEdit(new Range(new Position(0, 0), new Position(end.line(), end.offset())),
                    formatted));
        } catch (FormatterException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    private static String currentText(WorkspaceManager workspaceManager, Path path) {
        if (!Files.exists(path)) {
            return "";
        }
        return workspaceManager.document(path)
                .map(document -> document.textDocument().toString())
                .orElseGet(() -> {
                    try {
                        return Files.readString(path);
                    } catch (IOException e) {
                        return "";
                    }
                });
    }

    private static FormattingOptions formattingOptions(WorkspaceManager workspaceManager, Path path)
            throws FormatterException {
        // shortcut: a file the edits create formats with default options, not its package's [format] config.
        Optional<Project> project = Files.exists(path) ? workspaceManager.project(path) : Optional.empty();
        return project.isPresent() && project.get() instanceof BuildProject buildProject
                ? FormatterUtils.buildFormattingOptions(buildProject)
                : FormattingOptions.builder().build();
    }

    private static int offset(TextDocument document, Position position) {
        return document.textPositionFrom(LinePosition.from(position.getLine(), position.getCharacter()));
    }
}
