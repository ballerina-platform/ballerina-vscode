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
import io.ballerina.modelgenerator.commons.FormattedEdits;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
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
     * Converts several flow nodes, each against its own file, into one formatted edit per Ballerina document, so
     * a change spanning nodes (an agent and the tool it gains) is applied in a single step.
     *
     * @param workspaceManager The workspace manager holding the current documents.
     * @param nodes            The nodes to convert, keyed in order by the file each belongs to.
     * @param lsClientLogger   The client logger.
     * @return The formatted edits with the merged raw edits; the formatted edits are null when a document could not
     *         be formatted.
     */
    public static FormattedSource toFormattedSourceCode(WorkspaceManager workspaceManager,
                                                        List<Map.Entry<Path, JsonElement>> nodes,
                                                        LSClientLogger lsClientLogger) {
        Map<Path, List<TextEdit>> sourceEdits = new LinkedHashMap<>();
        for (Map.Entry<Path, JsonElement> node : nodes) {
            SourceGenerator generator = new SourceGenerator(workspaceManager, node.getKey());
            generator.generateTextEdits(node.getValue(), lsClientLogger).forEach((path, edits) -> {
                List<TextEdit> merged = sourceEdits.computeIfAbsent(path, key -> new ArrayList<>());
                // Nodes generated against the same document can each add the same import.
                edits.stream().filter(edit -> !merged.contains(edit)).forEach(merged::add);
            });
        }
        SourceGenerator generator = new SourceGenerator(workspaceManager, nodes.get(0).getKey());
        return new FormattedSource(generator.formatTextEdits(sourceEdits).orElse(null),
                generator.gson.toJsonTree(sourceEdits));
    }

    private Optional<JsonElement> formatTextEdits(Map<Path, List<TextEdit>> textEdits) {
        return FormattedEdits.fold(workspaceManager, textEdits).map(gson::toJsonTree);
    }

    /**
     * Formatted edits and the raw edits they were folded from.
     *
     * @param textEdits   one formatted edit per Ballerina document, or null when formatting failed
     * @param sourceEdits the raw edits produced by the node builder
     */
    public record FormattedSource(JsonElement textEdits, JsonElement sourceEdits) {
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
