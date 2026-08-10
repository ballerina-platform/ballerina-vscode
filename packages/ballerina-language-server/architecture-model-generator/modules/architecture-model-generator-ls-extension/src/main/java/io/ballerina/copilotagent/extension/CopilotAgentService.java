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

package io.ballerina.copilotagent.extension;

import io.ballerina.copilotagent.core.SemanticDiffComputer;
import io.ballerina.copilotagent.core.models.Result;
import io.ballerina.copilotagent.extension.request.SemanticDiffRequest;
import io.ballerina.copilotagent.extension.response.SemanticDiffResponse;
import io.ballerina.projects.Project;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;

@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("copilotAgentService")
public class CopilotAgentService implements ExtendedLanguageServerService {

    private WorkspaceManager workspaceManager;
    private WorkspaceManager aiWorkspaceManager;

    @Override
    public void init(LanguageServer langServer,
                     WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManager = workspaceManagerProxy.get();
        this.aiWorkspaceManager = workspaceManagerProxy.get("ai://file.bal");
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @JsonRequest
    public CompletableFuture<SemanticDiffResponse> getSemanticDiff(SemanticDiffRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            SemanticDiffResponse response = new SemanticDiffResponse();
            Path path = PathUtil.convertUriStringToPath(request.projectPath());
            Project originalProject;
            Project shadowProject;
            try {
                // ai:// holds the frozen pre-generation baseline; file:// is the live, directly-edited project.
                originalProject = this.aiWorkspaceManager.loadProject(path);
                shadowProject = this.workspaceManager.loadProject(path);

                SemanticDiffComputer diffComputer = new SemanticDiffComputer(originalProject, shadowProject);
                Result result = diffComputer.computeSemanticDiffs();
                response.setLoadDesignDiagrams(result.loadDesignDiagrams());
                response.setSemanticDiffs(result.semanticDiffs());
            } catch (Exception e) {
                response.setError(e);
            }
            return response;
        });
    }
}
