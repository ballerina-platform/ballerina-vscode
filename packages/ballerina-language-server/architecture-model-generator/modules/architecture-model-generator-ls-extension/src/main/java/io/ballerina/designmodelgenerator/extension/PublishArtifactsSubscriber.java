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

package io.ballerina.designmodelgenerator.extension;

import io.ballerina.artifactsgenerator.ArtifactGenerationDebouncer;
import io.ballerina.artifactsgenerator.ArtifactsGenerator;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.designmodelgenerator.extension.response.ArtifactsParams;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.DocumentServiceContext;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.client.ExtendedLanguageClient;
import org.ballerinalang.langserver.commons.eventsync.EventKind;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.eventsync.spi.EventSubscriber;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;

import java.nio.file.Path;
import java.util.Optional;

/**
 * Publishes the artifacts to the client.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.eventsync.spi.EventSubscriber")
public class PublishArtifactsSubscriber implements EventSubscriber {

    public static final String NAME = "Publish artifacts subscriber";
    private static final String EXPR_URI = "expr";
    private static final String AI_URI = "ai";
    private static final String LOAD_PROJECT = "loadProject";
    private static final String RELOAD_PROJECT = "reloadProject";
    private static final String DID_OPEN = "text/didOpen";

    @Override
    public EventKind eventKind() {
        return EventKind.PROJECT_UPDATE;
    }

    @Override
    public void onEvent(ExtendedLanguageClient client, DocumentServiceContext context,
                        LanguageServerContext serverContext) {
        // Skip producing events for the following cases
        // 1. If the event occurred in the cloned project
        // 2. During the loading of the project
        String operationName = context.operation().getName();
        // Opening a file does not change its artifacts.
        if (context.fileUri().startsWith(AI_URI) || context.fileUri().startsWith(EXPR_URI)
                || LOAD_PROJECT.equals(operationName) || DID_OPEN.equals(operationName)) {
            return;
        }

        Path projectPath = context.workspace().projectRoot(context.filePath());
        String projectKey = projectPath.toUri().toString();

        // Handle reloadProject operation
        if (RELOAD_PROJECT.equals(operationName)) {
            Project project;
            try {
                project = context.workspace().loadProject(context.filePath());
            } catch (WorkspaceDocumentException | EventSyncException e) {
                return;
            }

            // Use the debouncer to schedule the full project artifact generation
            ArtifactGenerationDebouncer.getInstance().debounceProject(projectKey, () -> {
                ArtifactsParams artifactsParams = new ArtifactsParams();
                artifactsParams.setUri(projectKey);
                artifactsParams.setProjectAndModuleName(project.currentPackage().packageName().value(),
                        project.currentPackage().getDefaultModule().moduleName().moduleNamePart());
                artifactsParams.setArtifacts(ArtifactsGenerator.projectArtifactChanges(project));
                client.publishArtifacts(artifactsParams);
            });
            return;
        }

        // Handle regular file changes
        Optional<SyntaxTree> syntaxTree = context.currentSyntaxTree();
        Optional<SemanticModel> semanticModel = context.currentSemanticModel();
        if (syntaxTree.isEmpty() || semanticModel.isEmpty()) {
            return;
        }

        Optional<Module> currentModule = context.currentModule();
        String projectName = currentModule.map(m -> m.packageInstance().packageName().value()).orElse(null);
        String moduleName = currentModule.map(m -> m.moduleName().moduleNamePart()).orElse(null);

        // Use the debouncer to schedule the artifact generation
        ArtifactGenerationDebouncer.getInstance().debounceFile(context.fileUri(), projectKey, () -> {
            ArtifactsParams artifactsParams = new ArtifactsParams();
            artifactsParams.setUri(projectKey);
            artifactsParams.setProjectAndModuleName(projectName, moduleName);
            artifactsParams.setArtifacts(
                    ArtifactsGenerator.artifactChanges(projectPath.toString(), syntaxTree.get(),
                            semanticModel.get()));
            client.publishArtifacts(artifactsParams);
        });
    }

    @Override
    public String getName() {
        return NAME;
    }
}
