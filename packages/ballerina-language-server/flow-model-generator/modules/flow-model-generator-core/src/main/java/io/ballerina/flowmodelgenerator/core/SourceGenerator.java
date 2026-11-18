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
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.model.node.NewConnectionBuilder;
import io.ballerina.flowmodelgenerator.core.utils.ConnectionConfigurables;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

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
     * The configurables a new connection's literals get when it is saved, or why one can't, computed without
     * changing anything: what the connection form shows beside each field.
     *
     * @param diagramNode the new connection's flow node, carrying the user's choices in its properties' codedata
     * @return each field a configurable can stand for, and each argument as saving would write it
     */
    public ConnectionConfigurables.PreviewResult previewConnectionConfigurables(JsonElement diagramNode,
                                                                               LSClientLogger lsClientLogger) {
        FlowNode flowNode = gson.fromJson(diagramNode, FlowNode.class);
        if (flowNode.codedata() == null || flowNode.codedata().node() != NodeKind.NEW_CONNECTION) {
            throw new UserFacingException("Only a new connection's values can be made configurable.");
        }
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath, lsClientLogger);
        return new NewConnectionBuilder().previewConfigurables(sourceBuilder);
    }

    /**
     * Converts the flow model to source code.
     *
     * @param diagramNode The flow model node to be converted.
     * @return The source code of the flow model node.
     */
    public JsonElement toSourceCode(JsonElement diagramNode, LSClientLogger lsClientLogger) {
        FlowNode flowNode = gson.fromJson(diagramNode, FlowNode.class);
        SourceBuilder sourceBuilder = new SourceBuilder(flowNode, workspaceManager, filePath, lsClientLogger);
        Map<Path, List<TextEdit>> textEdits =
                NodeBuilder.getNodeFromKind(flowNode.codedata().node()).toSource(sourceBuilder);
        if (textEdits == null) {
            throw new IllegalStateException("The operation produced no source edits; "
                    + "the diagram may be out of date — refresh and try again");
        }
        addNewLine(textEdits);
        return gson.toJsonTree(textEdits);
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
