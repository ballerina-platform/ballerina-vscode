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

package io.ballerina.designmodelgenerator.extension;

import io.ballerina.artifactsgenerator.ArtifactsCache;
import io.ballerina.artifactsgenerator.ArtifactsGenerator;
import io.ballerina.artifactsgenerator.codemap.CodeMapGenerator;
import io.ballerina.designmodelgenerator.core.DesignModelGenerator;
import io.ballerina.designmodelgenerator.core.model.DesignModel;
import io.ballerina.designmodelgenerator.extension.request.ArtifactsRequest;
import io.ballerina.designmodelgenerator.extension.request.CodeMapRequest;
import io.ballerina.designmodelgenerator.extension.request.GetDesignModelRequest;
import io.ballerina.designmodelgenerator.extension.request.ProjectInfoRequest;
import io.ballerina.designmodelgenerator.extension.response.ArtifactResponse;
import io.ballerina.designmodelgenerator.extension.response.CodeMapResponse;
import io.ballerina.designmodelgenerator.extension.response.GetDesignModelResponse;
import io.ballerina.designmodelgenerator.extension.response.ProjectInfoResponse;
import io.ballerina.projects.Project;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
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
@JsonSegment("designModelService")
public class DesignModelGeneratorService implements ExtendedLanguageServerService {

    private WorkspaceManagerProxy workspaceManagerProxy;

    @Override
    public void init(LanguageServer langServer,
                     WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManagerProxy = workspaceManagerProxy;
        ArtifactsCache.initialize();
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @JsonRequest
    public CompletableFuture<GetDesignModelResponse> getDesignModel(GetDesignModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetDesignModelResponse response = new GetDesignModelResponse();
            try {
                Path filePath = PathUtil.convertUriStringToPath(request.projectPath());
                WorkspaceManager workspaceManager = workspaceManagerProxy.get(request.projectPath());
                Project project = workspaceManager.loadProject(filePath);
                DesignModelGenerator designModelGenerator = new DesignModelGenerator(project.currentPackage());
                DesignModel designModel = designModelGenerator.generate();
                response.setDesignModel(designModel);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<ArtifactResponse> artifacts(ArtifactsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ArtifactResponse response = new ArtifactResponse();
            try {
                Path projectPath = Path.of(request.projectPath());
                WorkspaceManager workspaceManager = workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(projectPath);
                response.setArtifacts(ArtifactsGenerator.artifacts(project));
                response.setUri(request.projectPath());
                String projectName = project.currentPackage().packageName().value();
                String moduleName = workspaceManager.module(projectPath)
                        .map(module -> module.moduleName().moduleNamePart()).orElse(null);
                response.setProjectAndModuleName(projectName, moduleName);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<CodeMapResponse> codeMap(CodeMapRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path projectPath = Path.of(request.projectPath());
                WorkspaceManager workspaceManager = workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(projectPath);

                BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
                boolean isWorkspace = compilerApi.isWorkspaceProject(project);

                if (isWorkspace) {
                    return new CodeMapResponse(CodeMapGenerator.renderWorkspaceMarkdown(
                            project, workspaceManager));
                } else {
                    return new CodeMapResponse(CodeMapGenerator.renderPackageMarkdown(
                            project, workspaceManager));
                }
            } catch (Throwable e) {
                return new CodeMapResponse(null);
            }
        });
    }

    @JsonRequest
    public CompletableFuture<ProjectInfoResponse> projectInfo(ProjectInfoRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ProjectInfoResponse response = new ProjectInfoResponse();
            try {
                Path projectPath = Path.of(request.projectPath());
                WorkspaceManager workspaceManager = workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(projectPath);
                ProjectInfoBuilder visitor = new ProjectInfoBuilder(response, project, true);
                visitor.populate();
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }
}
