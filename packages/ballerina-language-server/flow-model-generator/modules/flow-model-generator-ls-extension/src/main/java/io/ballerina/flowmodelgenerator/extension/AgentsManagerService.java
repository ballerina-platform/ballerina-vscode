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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.JsonArray;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.flowmodelgenerator.core.AgentChatServiceGenerator;
import io.ballerina.flowmodelgenerator.core.AgentsGenerator;
import io.ballerina.flowmodelgenerator.core.McpClient;
import io.ballerina.flowmodelgenerator.extension.request.AddAgentChatServiceRequest;
import io.ballerina.flowmodelgenerator.extension.request.GenAgentDefinitionRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetAiModuleOrgRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetAllAgentsRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetAllMemoryManagersRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetAllModelsRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetConnectorActionsRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetModelsRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetPackageVersionRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetToolRequest;
import io.ballerina.flowmodelgenerator.extension.request.GetToolsRequest;
import io.ballerina.flowmodelgenerator.extension.request.McpToolsRequest;
import io.ballerina.flowmodelgenerator.extension.request.SecureSocketConfig;
import io.ballerina.flowmodelgenerator.extension.response.AddAgentChatServiceResponse;
import io.ballerina.flowmodelgenerator.extension.response.GenToolResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetAgentsResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetAiModuleOrgResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetConnectorActionsResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetMcpToolsResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetMemoryManagersResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetModelsResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetPackageVersionResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetToolResponse;
import io.ballerina.flowmodelgenerator.extension.response.GetToolsResponse;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.DependenciesToml;
import io.ballerina.projects.Document;
import io.ballerina.projects.PackageDescriptor;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.Project;
import io.ballerina.projects.TomlDocument;
import io.ballerina.projects.environment.PackageMetadataResponse;
import io.ballerina.projects.environment.PackageResolver;
import io.ballerina.projects.environment.ResolutionOptions;
import io.ballerina.projects.environment.ResolutionRequest;
import io.ballerina.projects.environment.ResolutionResponse;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Path;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import static io.ballerina.flowmodelgenerator.core.Constants.AI;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINA;
import static io.ballerina.flowmodelgenerator.core.Constants.BALLERINAX;

@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("agentManager")
public class AgentsManagerService implements ExtendedLanguageServerService {

    private WorkspaceManager workspaceManager;

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager) {
        this.workspaceManager = workspaceManager;
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @JsonRequest
    public CompletableFuture<GetAiModuleOrgResponse> getAiModuleOrg(GetAiModuleOrgRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetAiModuleOrgResponse response = new GetAiModuleOrgResponse();
            try {
                response.setOrg(AgentsGenerator.getAiModuleOrgName(request.projectPath(), workspaceManager));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetAgentsResponse> getAllAgents(GetAllAgentsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetAgentsResponse response = new GetAgentsResponse();
            try {
                AgentsGenerator agentsGenerator = new AgentsGenerator();
                String orgName = request.orgName() != null ? request.orgName() : BALLERINAX;
                Optional<SemanticModel> semanticModel = PackageUtil.getSemanticModel(orgName, AI);
                if (semanticModel.isEmpty()) {
                    return response;
                }

                response.setAgents(agentsGenerator.getAllAgents(semanticModel.get()));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetModelsResponse> getAllModels(GetAllModelsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetModelsResponse response = new GetModelsResponse();
            try {
                AgentsGenerator agentsGenerator = new AgentsGenerator();
                if (BALLERINA.equals(request.orgName())) {
                    response.setModels(agentsGenerator.getNewBallerinaxModels());
                } else {
                    Optional<SemanticModel> semanticModel = PackageUtil.getSemanticModel(BALLERINAX, AI);
                    semanticModel.ifPresent(model -> response.setModels(agentsGenerator.getAllBallerinaxModels(model)));
                }
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetMemoryManagersResponse> getAllMemoryManagers(GetAllMemoryManagersRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetMemoryManagersResponse response = new GetMemoryManagersResponse();
            try {
                AgentsGenerator agentsGenerator = new AgentsGenerator();
                String orgName = request.orgName() != null ? request.orgName() : BALLERINAX;
                Optional<SemanticModel> semanticModel = PackageUtil.getSemanticModel(orgName, AI);
                if (semanticModel.isEmpty()) {
                    return response;
                }

                response.setMemoryManagers(agentsGenerator.getAllMemoryManagers(semanticModel.get()));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetModelsResponse> getModels(GetModelsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetModelsResponse response = new GetModelsResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> optSemanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> optDocument = this.workspaceManager.document(filePath);
                if (optSemanticModel.isEmpty() || optDocument.isEmpty()) {
                    return response;
                }

                AgentsGenerator agentsGenerator = new AgentsGenerator(optSemanticModel.get());
                response.setModels(agentsGenerator.getModels());
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetToolsResponse> getTools(GetToolsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetToolsResponse response = new GetToolsResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (semanticModel.isEmpty()) {
                    return response;
                }

                AgentsGenerator agentsGenerator = new AgentsGenerator();
                response.setTools(agentsGenerator.getTools(semanticModel.get()));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetMcpToolsResponse> getMcpTools(McpToolsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetMcpToolsResponse response = new GetMcpToolsResponse();
            try {
                // Validate URL format
                String serviceUrl = request.serviceUrl();
                if (serviceUrl == null || serviceUrl.trim().isEmpty()) {
                    response.setError(new IllegalArgumentException("Service URL cannot be empty"));
                    return response;
                }

                try {
                    java.net.URI uri = new java.net.URI(serviceUrl);
                    if (uri.getHost() == null) {
                        response.setError(new IllegalArgumentException("Invalid URL: missing host"));
                        return response;
                    }
                    if (uri.getScheme() == null || !uri.getScheme().matches("https?")) {
                        response.setError(
                                new IllegalArgumentException("Invalid URL: only http/https protocols are supported"));
                        return response;
                    }
                } catch (java.net.URISyntaxException e) {
                    response.setError(new IllegalArgumentException("Invalid URL format: " + e.getMessage(), e));
                    return response;
                }

                // Get the access token from the request (if provided)
                String accessToken = request.accessToken();

                // Validate: SSL config should only be used with HTTPS URLs
                if (request.secureSocket() != null && "http".equals(new java.net.URI(serviceUrl).getScheme())) {
                    response.setError(new IllegalArgumentException(
                            "Secure socket configuration is only applicable for HTTPS URLs"));
                    return response;
                }

                // Build SSL config if provided
                McpClient.SslConfig sslConfig = null;
                if (request.secureSocket() != null) {
                    SecureSocketConfig sc = request.secureSocket();
                    sslConfig = new McpClient.SslConfig(
                            sc.cert() != null ? sc.cert().path() : null,
                            sc.cert() != null ? sc.cert().password() : null,
                            sc.key() != null ? sc.key().path() : null,
                            sc.key() != null ? sc.key().password() : null,
                            sc.insecure()
                    );
                }

                // Send initialize request with optional authentication
                String sessionId = McpClient.sendInitializeRequest(serviceUrl, accessToken, sslConfig);

                // Send initialized notification to complete the handshake
                McpClient.sendInitializedNotification(serviceUrl, sessionId, accessToken, sslConfig);

                // Now we can send operational requests
                JsonArray toolsJsonArray = McpClient.sendToolsListRequest(serviceUrl, sessionId, accessToken,
                        sslConfig);

                response.setTools(toolsJsonArray);
                return response;
            } catch (java.net.ConnectException e) {
                response.setError(
                        new RuntimeException("Connection failed: Unable to connect to " + request.serviceUrl(), e));
                return response;
            } catch (java.net.SocketTimeoutException e) {
                response.setError(new RuntimeException("Connection timeout: Server did not respond in time", e));
                return response;
            } catch (java.io.IOException e) {
                response.setError(new RuntimeException("Network error: " + e.getMessage(), e));
                return response;
            } catch (Exception e) {
                String errorMsg = e.getMessage() != null ? e.getMessage() :
                        e.getClass().getSimpleName() + " (no error message)";
                response.setError(new RuntimeException("Failed to get MCP tools: " + errorMsg, e));
                return response;
            }
        });
    }

    @JsonRequest
    public CompletableFuture<GenToolResponse> genAgentDefinition(GenAgentDefinitionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GenToolResponse response = new GenToolResponse();
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                AgentsGenerator agentsGenerator = new AgentsGenerator();
                response.setTextEdits(agentsGenerator.genAgentDefinition(request.name(), request.description(),
                        filePath, this.workspaceManager));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetConnectorActionsResponse> getActions(GetConnectorActionsRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetConnectorActionsResponse response = new GetConnectorActionsResponse();
            try {
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (semanticModel.isEmpty()) {
                    return response;
                }

                AgentsGenerator agentsGenerator = new AgentsGenerator();
                response.setActions(agentsGenerator.getActions(request.flowNode(), filePath, project,
                        this.workspaceManager));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetToolResponse> getTool(GetToolRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetToolResponse response = new GetToolResponse();
            try {
                Path projectPath = Path.of(request.projectPath());
                Path filePath = projectPath.resolve("agents.bal");
                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> optDocument = this.workspaceManager.document(filePath);
                Optional<Project> optProject = this.workspaceManager.project(projectPath);

                if (semanticModel.isEmpty() || optDocument.isEmpty() || optProject.isEmpty()) {
                    return response;
                }

                AgentsGenerator agentsGenerator = new AgentsGenerator(semanticModel.get());
                Document document = optDocument.get();
                FunctionDefinitionNode functionDefinitionNode = agentsGenerator.getToolFunction(request.toolName(),
                        document);
                response.setToolName(request.toolName());
                response.setFlowNode(agentsGenerator.getToolFlowNode(functionDefinitionNode, document));
                response.setMethodCallFlowNode(agentsGenerator.getMethodCallFlowNode(functionDefinitionNode,
                        optProject.get(), document, this.workspaceManager, filePath));
            } catch (Throwable e) {
                throw new RuntimeException(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<AddAgentChatServiceResponse> addAgentChatService(
            AddAgentChatServiceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            AddAgentChatServiceResponse response = new AddAgentChatServiceResponse();
            try {
                if (request.agentVariableName() == null || request.agentVariableName().isBlank()) {
                    throw new IllegalArgumentException("agentVariableName must not be null or blank");
                }
                Path filePath = Path.of(request.filePath());
                Path projectRoot = this.workspaceManager.projectRoot(filePath);

                AgentChatServiceGenerator generator = new AgentChatServiceGenerator();
                String serviceName = request.serviceName() != null && !request.serviceName().isEmpty()
                        ? request.serviceName() : request.agentVariableName();
                AgentChatServiceGenerator.AgentChatResult result =
                        generator.addAgentService(request.agentVariableName(), serviceName, projectRoot);

                response.setChatEndpointPath(result.endpointPath());
                response.setAlreadyExists(result.alreadyExists());
                response.setFilePath(result.filePath());
                response.setStartLine(result.startLine());
                response.setStartColumn(result.startColumn());
                response.setEndLine(result.endLine());
                response.setEndColumn(result.endColumn());
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<GetPackageVersionResponse> getPackageVersion(GetPackageVersionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            GetPackageVersionResponse response = new GetPackageVersionResponse();
            try {
                String org = request.org();
                String packageName = request.packageName();
                Path projectPath = Path.of(request.projectPath());
                Project project = this.workspaceManager.loadProject(projectPath);

                // First, check Dependencies.toml for the pinned version
                Optional<String> depsVersion = project.currentPackage().dependenciesToml()
                        .map(DependenciesToml::tomlDocument)
                        .map(TomlDocument::toml)
                        .map(toml -> toml.getTables("package")).orElse(List.of()).stream()
                        .filter(pkg -> org.equals(pkg.get("org").map(Object::toString).orElse(""))
                                && packageName.equals(pkg.get("name").map(Object::toString).orElse("")))
                        .findFirst()
                        .flatMap(pkg -> pkg.get("version").map(Object::toString));

                if (depsVersion.isPresent()) {
                    response.setVersion(depsVersion.get());
                    return response;
                }

                // Fallback: resolve from local/distribution repo (offline, no network calls)
                PackageResolver resolver = project
                        .projectEnvironmentContext().getService(PackageResolver.class);
                ResolutionRequest resolutionRequest = ResolutionRequest.from(
                        PackageDescriptor.from(PackageOrg.from(org), PackageName.from(packageName)));
                Collection<PackageMetadataResponse> metadataResponses = resolver.resolvePackageMetadata(
                        Collections.singletonList(resolutionRequest),
                        ResolutionOptions.builder().setOffline(true).build());
                metadataResponses.stream().findFirst()
                        .filter(meta -> meta.resolutionStatus() != ResolutionResponse.ResolutionStatus.UNRESOLVED)
                        .map(PackageMetadataResponse::resolvedDescriptor)
                        .ifPresent(descriptor -> response.setVersion(descriptor.version().value().toString()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }
}
