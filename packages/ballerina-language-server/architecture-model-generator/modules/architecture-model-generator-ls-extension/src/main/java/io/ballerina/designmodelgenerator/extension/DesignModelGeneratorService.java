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

import io.ballerina.artifactsgenerator.ArtifactGenerationDebouncer;
import io.ballerina.artifactsgenerator.ArtifactsCache;
import io.ballerina.artifactsgenerator.ArtifactsGenerator;
import io.ballerina.designmodelgenerator.core.DesignModelGenerator;
import io.ballerina.designmodelgenerator.core.model.DesignModel;
import io.ballerina.designmodelgenerator.extension.request.ArtifactsRequest;
import io.ballerina.designmodelgenerator.extension.request.FlushArtifactsRequest;
import io.ballerina.designmodelgenerator.extension.request.GetDesignModelRequest;
import io.ballerina.designmodelgenerator.extension.request.ProjectInfoRequest;
import io.ballerina.designmodelgenerator.extension.response.ArtifactResponse;
import io.ballerina.designmodelgenerator.extension.response.GetDesignModelResponse;
import io.ballerina.designmodelgenerator.extension.response.ProjectInfoResponse;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectException;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.capability.LSClientCapabilities;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;

@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("designModelService")
public class DesignModelGeneratorService implements ExtendedLanguageServerService {

    private WorkspaceManagerProxy workspaceManagerProxy;
    private LanguageServerContext serverContext;

    @Override
    public void init(LanguageServer langServer,
                     WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManagerProxy = workspaceManagerProxy;
        this.serverContext = serverContext;
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

    private boolean isAgentBuilder() {
        LSClientCapabilities capabilities = serverContext.get(LSClientCapabilities.class);
        return capabilities != null && capabilities.getInitializationOptions().isAgentBuilderMode();
    }

    @JsonRequest
    public CompletableFuture<ArtifactResponse> artifacts(ArtifactsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ArtifactResponse response = new ArtifactResponse();
            try {
                Path projectPath = Path.of(request.projectPath());
                WorkspaceManager workspaceManager = workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(projectPath);
                // Every project view loads this; only the Agent Builder warms ballerina/ai for a project without it.
                try {
                    PackageUtil.prewarmAgentLibrary(project, isAgentBuilder());
                } catch (RuntimeException ignored) {
                    // A failed warm-up must not cost the artifacts response.
                }
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

    /**
     * Publishes pending artifact updates at once, for an edit the client applied on purpose rather than typed.
     *
     * @param request The files or projects the edit touched; every pending update when there are none
     * @return true once the pending updates are scheduled
     */
    @JsonRequest
    public CompletableFuture<Boolean> flushArtifacts(FlushArtifactsRequest request) {
        // The edits' didChange ran before this request, as notifications are handled in order on the reader thread.
        List<Path> roots = request == null || request.uris() == null ? List.of() : projectRoots(request.uris());
        if (roots.isEmpty()) {
            ArtifactGenerationDebouncer.getInstance().flushAll();
        } else {
            // Other packages keep their delay, so one package's save does not cut their typing bursts short.
            ArtifactGenerationDebouncer.getInstance().flush(key -> PathUtil.getPathFromURI(key)
                    .map(path -> roots.stream().anyMatch(path::startsWith)).orElse(false));
        }
        return CompletableFuture.completedFuture(true);
    }

    private List<Path> projectRoots(List<String> uris) {
        WorkspaceManager workspaceManager = workspaceManagerProxy.get();
        List<Path> roots = new ArrayList<>();
        for (String uri : uris) {
            PathUtil.getPathFromURI(uri).ifPresent(path -> {
                try {
                    roots.add(workspaceManager.projectRoot(path));
                } catch (ProjectException e) {
                    // Not in a project the workspace knows; nothing of it is pending.
                }
            });
        }
        return roots;
    }
}
