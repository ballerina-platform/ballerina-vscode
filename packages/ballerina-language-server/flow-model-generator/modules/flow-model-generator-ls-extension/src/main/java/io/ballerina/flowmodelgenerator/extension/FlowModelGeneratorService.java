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

package io.ballerina.flowmodelgenerator.extension;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.flowmodelgenerator.core.AgentsGenerator;
import io.ballerina.flowmodelgenerator.core.AvailableNodesGenerator;
import io.ballerina.flowmodelgenerator.core.ClassOwnedNodeManager;
import io.ballerina.flowmodelgenerator.core.CopilotContextGenerator;
import io.ballerina.flowmodelgenerator.core.DeleteNodeHandler;
import io.ballerina.flowmodelgenerator.core.EnclosedNodeFinder;
import io.ballerina.flowmodelgenerator.core.ErrorHandlerGenerator;
import io.ballerina.flowmodelgenerator.core.ModelGenerator;
import io.ballerina.flowmodelgenerator.core.NodeTemplateGenerator;
import io.ballerina.flowmodelgenerator.core.SourceGenerator;
import io.ballerina.flowmodelgenerator.core.SuggestedComponentService;
import io.ballerina.flowmodelgenerator.core.SuggestedModelGenerator;
import io.ballerina.flowmodelgenerator.core.analyzers.function.ModuleNodeAnalyzer;
import io.ballerina.flowmodelgenerator.core.diagnostics.DiagnosticRequest;
import io.ballerina.flowmodelgenerator.core.diagnostics.DiagnosticsDebouncer;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.search.SearchCommand;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.extension.request.ClassOwnedNodeDeleteRequest;
import io.ballerina.flowmodelgenerator.extension.request.ClassOwnedNodeRequest;
import io.ballerina.flowmodelgenerator.extension.request.ClassOwnedNodeSourceRequest;
import io.ballerina.flowmodelgenerator.extension.request.ComponentDeleteRequest;
import io.ballerina.flowmodelgenerator.extension.request.CopilotContextRequest;
import io.ballerina.flowmodelgenerator.extension.request.EnclosedFuncDefRequest;
import io.ballerina.flowmodelgenerator.extension.request.FilePathRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelAvailableNodesRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelGeneratorRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelNodeTemplateRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSourceGeneratorRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowModelSuggestedGenerationRequest;
import io.ballerina.flowmodelgenerator.extension.request.FlowNodeDeleteRequest;
import io.ballerina.flowmodelgenerator.extension.request.FunctionDefinitionRequest;
import io.ballerina.flowmodelgenerator.extension.request.SearchNodesRequest;
import io.ballerina.flowmodelgenerator.extension.request.SearchRequest;
import io.ballerina.flowmodelgenerator.extension.request.ServiceFieldNodesRequest;
import io.ballerina.flowmodelgenerator.extension.request.SuggestedComponentRequest;
import io.ballerina.flowmodelgenerator.extension.response.ComponentDeleteResponse;
import io.ballerina.flowmodelgenerator.extension.response.CopilotContextResponse;
import io.ballerina.flowmodelgenerator.extension.response.EnclosedFuncDefResponse;
import io.ballerina.flowmodelgenerator.extension.response.FlowModelAvailableNodesResponse;
import io.ballerina.flowmodelgenerator.extension.response.FlowModelGeneratorResponse;
import io.ballerina.flowmodelgenerator.extension.response.FlowModelNodeTemplateResponse;
import io.ballerina.flowmodelgenerator.extension.response.FlowModelSourceGeneratorResponse;
import io.ballerina.flowmodelgenerator.extension.response.FlowNodeDeleteResponse;
import io.ballerina.flowmodelgenerator.extension.response.FunctionDefinitionResponse;
import io.ballerina.flowmodelgenerator.extension.response.SearchNodesResponse;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.projects.ProjectKind;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextDocumentChange;
import io.ballerina.tools.text.TextEdit;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.common.utils.PathUtil;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManagerProxy;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;

import static io.ballerina.modelgenerator.commons.CommonUtils.BALLERINAX_ORG_NAME;

/**
 * Represents the extended language server service for the flow model generator service.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("flowDesignService")
public class FlowModelGeneratorService implements ExtendedLanguageServerService {

    private WorkspaceManagerProxy workspaceManagerProxy;
    private LSClientLogger lsClientLogger;

    @Override
    public void init(LanguageServer langServer, WorkspaceManagerProxy workspaceManagerProxy,
                     LanguageServerContext serverContext) {
        this.workspaceManagerProxy = workspaceManagerProxy;
        this.lsClientLogger = LSClientLogger.getInstance(serverContext);
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    @JsonRequest
    public CompletableFuture<FlowModelGeneratorResponse> getFlowModel(FlowModelGeneratorRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FlowModelGeneratorResponse response = new FlowModelGeneratorResponse();
            try {
                Path filePath = PathUtil.convertUriStringToPath(request.filePath());
                // Obtain the semantic model and the document
                WorkspaceManager workspaceManager = workspaceManagerProxy.get(request.filePath());
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                // TODO: Check how we can delegate this to the model generator
                Path projectPath = workspaceManager.projectRoot(filePath);
                Optional<Document> dataMappingsDoc = getDocumentFromFile(projectPath, "data_mappings.bal");
                Optional<Document> functionsDoc = getDocumentFromFile(projectPath, "functions.bal");

                // Generate the flow design model
                ModelGenerator modelGenerator =
                        new ModelGenerator(project, semanticModel.get(), filePath, workspaceManager);
                response.setFlowDesignModel(
                        modelGenerator.getFlowModel(document.get(), request.lineRange(),
                                dataMappingsDoc.orElse(null),
                                functionsDoc.orElse(null)));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelGeneratorResponse> getSuggestedFlowModel(
            FlowModelSuggestedGenerationRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelGeneratorResponse response = new FlowModelGeneratorResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();

                // Obtain the semantic model and the document
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                // TODO: Check how we can delegate this to the model generator
                Path projectPath = workspaceManager.projectRoot(filePath);
                Optional<Document> dataMappingsDoc = getDocumentFromFile(projectPath, "data_mappings.bal");
                Optional<Document> functionsDoc = getDocumentFromFile(projectPath, "functions.bal");

                // Generate the flow design model
                ModelGenerator modelGenerator =
                        new ModelGenerator(project, semanticModel.get(), filePath, workspaceManager);
                JsonElement oldFlowModel =
                        modelGenerator.getFlowModel(document.get(), request.lineRange(),
                                dataMappingsDoc.orElse(null),
                                functionsDoc.orElse(null));

                // Create a temporary directory for the in-memory cache
                Project newProject = project.duplicate();
                DocumentId documentId = newProject.documentId(filePath);
                Module newModule = newProject.currentPackage().module(documentId.moduleId());
                SemanticModel newSemanticModel =
                        PackageUtil.getCompilation(newProject).getSemanticModel(newModule.moduleId());
                Document newDocument = newModule.document(documentId);
                if (newSemanticModel == null || newDocument == null) {
                    return response;
                }
                Optional<Document> newDataMappingsDoc;
                Optional<Document> newFunctionsDoc;
                try {
                    DocumentId dataMappingDocId = newProject.documentId(projectPath.resolve("data_mappings.bal"));
                    Module dataMappingModule = newProject.currentPackage().module(dataMappingDocId.moduleId());
                    newDataMappingsDoc = Optional.of(dataMappingModule.document(dataMappingDocId));

                    DocumentId functionsDocId = newProject.documentId(projectPath.resolve("functions.bal"));
                    Module functionsModule = newProject.currentPackage().module(functionsDocId.moduleId());
                    newFunctionsDoc = Optional.of(functionsModule.document(functionsDocId));
                } catch (Throwable e) {
                    newDataMappingsDoc = Optional.empty();
                    newFunctionsDoc = Optional.empty();
                }

                TextDocument textDocument = newDocument.textDocument();
                int textPosition = textDocument.textPositionFrom(request.position());

                TextEdit textEdit = TextEdit.from(TextRange.from(textPosition, 0), request.text());
                TextDocument newTextDocument =
                        textDocument.apply(TextDocumentChange.from(List.of(textEdit).toArray(new TextEdit[0])));
                Document newDoc = newDocument.modify()
                        .withContent(String.join(System.lineSeparator(), newTextDocument.textLines()))
                        .apply();

                int end = textDocument.textPositionFrom(request.endLine());
                LineRange endLineRange = LineRange.from(request.lineRange().fileName(), request.lineRange().startLine(),
                        newTextDocument.linePositionFrom(end + request.text().length()));

                ModelGenerator suggestedModelGenerator =
                        new ModelGenerator(newProject, PackageUtil.getCompilation(newProject)
                                .getSemanticModel(newDoc.module().moduleId()), filePath, workspaceManager);
                JsonElement newFlowModel = suggestedModelGenerator.getFlowModel(newDoc,
                        endLineRange, newDataMappingsDoc.orElse(null), newFunctionsDoc.orElse(null));

                LinePosition endPosition = newTextDocument.linePositionFrom(textPosition + request.text().length());
                LineRange newLineRange =
                        LineRange.from(getRelativePath(projectPath, filePath), request.position(), endPosition);

                JsonArray newNodes = newFlowModel.getAsJsonObject().getAsJsonArray("nodes");
                SuggestedModelGenerator suggestedNodesGenerator =
                        new SuggestedModelGenerator(newDoc, newLineRange, newSemanticModel);
                suggestedNodesGenerator.markSuggestedNodes(newNodes, 1);
                if (!suggestedNodesGenerator.hasSuggestedNodes()) {
                    newFlowModel.getAsJsonObject().add("nodes", new JsonArray());
                }
                response.setFlowDesignModel(newFlowModel);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<JsonObject> getSuggestedComponents(SuggestedComponentRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            JsonObject response = new JsonObject();
            try {
                String fileContent = request.content();
                Path tempDir = Files.createTempDirectory("single-file-project");
                Path tempFilePath = tempDir.resolve("file.bal");
                Files.writeString(tempFilePath, fileContent);

                SuggestedComponentService suggestedComponentService = new SuggestedComponentService();
                Project project = this.workspaceManagerProxy.get().loadProject(tempFilePath);
                return suggestedComponentService.getPackageComponent(project);
            } catch (Throwable e) {
                return response;
            }
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelSourceGeneratorResponse> getSourceCode(FlowModelSourceGeneratorRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelSourceGeneratorResponse response = new FlowModelSourceGeneratorResponse();
            try {
                SourceGenerator sourceGenerator =
                        new SourceGenerator(this.workspaceManagerProxy.get(), Path.of(request.filePath()));
                response.setTextEdits(sourceGenerator.toSourceCode(request.flowNode(), lsClientLogger));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelGeneratorResponse> getClassOwnedNodes(ClassOwnedNodeRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FlowModelGeneratorResponse response = new FlowModelGeneratorResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(filePath);
                SemanticModel semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);
                ModelGenerator modelGenerator = new ModelGenerator(project, semanticModel, filePath, workspaceManager);
                response.setFlowDesignModel(modelGenerator.getClassOwnedNodes(request.classLineRange()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelSourceGeneratorResponse> upsertClassOwnedNode(
            ClassOwnedNodeSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FlowModelSourceGeneratorResponse response = new FlowModelSourceGeneratorResponse();
            try {
                FlowNode flowNode = new Gson().fromJson(request.flowNode(), FlowNode.class);
                Map<Path, List<org.eclipse.lsp4j.TextEdit>> edits = ClassOwnedNodeManager.upsert(
                        this.workspaceManagerProxy.get(), Path.of(request.filePath()), flowNode,
                        request.classLineRange(), wiringKind(request.wiring()), lsClientLogger);
                response.setTextEdits(new Gson().toJsonTree(edits));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelSourceGeneratorResponse> removeClassOwnedNode(
            ClassOwnedNodeDeleteRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FlowModelSourceGeneratorResponse response = new FlowModelSourceGeneratorResponse();
            try {
                boolean cleanupGeneratedHelper = request.cleanup() != null
                        && Boolean.TRUE.equals(request.cleanup().generatedHelperClass());
                Map<Path, List<org.eclipse.lsp4j.TextEdit>> edits = ClassOwnedNodeManager.remove(
                        this.workspaceManagerProxy.get(), Path.of(request.filePath()), request.fieldName(),
                        request.classLineRange(), wiringKind(request.wiring()), cleanupGeneratedHelper);
                response.setTextEdits(new Gson().toJsonTree(edits));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableNodes(
            FlowModelAvailableNodesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FlowModelAvailableNodesResponse response = new FlowModelAvailableNodesResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }

                AvailableNodesGenerator generator = new AvailableNodesGenerator(semanticModel.get(),
                        document.get(), project.currentPackage(), filePath);
                boolean disableBallerinaAiNodes = AgentsGenerator.getAiModuleOrgName(request.filePath(),
                        workspaceManager).equals(BALLERINAX_ORG_NAME);
                response.setCategories(generator.getAvailableNodes(disableBallerinaAiNodes, request.position(),
                        request.queryMap()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableVectorStores(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableVectorStores(request.position()));
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableEmbeddingProviders(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableEmbeddingProviders(request.position()));
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableDataLoaders(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableDataLoaders(request.position()));
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableChunkers(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableChunkers(request.position()));
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableVectorKnowledgeBases(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableVectorKnowledgeBases(request.position()));
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableAgents(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableAgents(request.position()));
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> getAvailableModelProviders(
            FlowModelAvailableNodesRequest request) {
        return handleAvailableNodesRequest(request,
                generator -> generator.getAvailableModelProviders(request.position()));
    }

    private CompletableFuture<FlowModelAvailableNodesResponse> handleAvailableNodesRequest(
            FlowModelAvailableNodesRequest request,
            Function<AvailableNodesGenerator, JsonArray> categoryProvider) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelAvailableNodesResponse response = new FlowModelAvailableNodesResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }

                AvailableNodesGenerator generator = new AvailableNodesGenerator(semanticModel.get(),
                        document.get(), project.currentPackage(), filePath);
                response.setCategories(categoryProvider.apply(generator));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelNodeTemplateResponse> getNodeTemplate(FlowModelNodeTemplateRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelNodeTemplateResponse response = new FlowModelNodeTemplateResponse();
            try {
                Path filePath = Path.of(request.filePath());
                workspaceManagerProxy.get().loadProject(filePath);
                NodeTemplateGenerator generator = new NodeTemplateGenerator(lsClientLogger);
                JsonElement nodeTemplate = generator.getNodeTemplate(this.workspaceManagerProxy.get(),
                        filePath, request.position(), request.id());
                propagateCodedataDataToTemplate(request.id(), nodeTemplate);
                response.setFlowNode(nodeTemplate);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelGeneratorResponse> getModuleNodes(FilePathRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelGeneratorResponse response = new FlowModelGeneratorResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();

                // Obtain the semantic model and the document
                Project project = workspaceManager.loadProject(filePath);
                SemanticModel semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);

                // Generate the flow design model
                ModelGenerator modelGenerator = new ModelGenerator(project, semanticModel, filePath, workspaceManager);
                response.setFlowDesignModel(modelGenerator.getModuleNodes());
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelGeneratorResponse> getServiceNodes(ServiceFieldNodesRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelGeneratorResponse response = new FlowModelGeneratorResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();

                // Obtain the semantic model and the document
                Project project = workspaceManager.loadProject(filePath);
                SemanticModel semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);

                // Generate the flow design model
                ModelGenerator modelGenerator = new ModelGenerator(project, semanticModel, filePath, workspaceManager);
                response.setFlowDesignModel(modelGenerator.getServiceFieldNodes(request.linePosition()));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<CopilotContextResponse> getCopilotContext(CopilotContextRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            CopilotContextResponse response = new CopilotContextResponse();
            try {
                Path filePath = Path.of(request.filePath());
                CopilotContextGenerator connectorGenerator =
                        new CopilotContextGenerator(workspaceManagerProxy.get(), filePath, request.position());
                connectorGenerator.generate();
                response.setPrefix(connectorGenerator.prefix());
                response.setSuffix(connectorGenerator.suffix());
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    @Deprecated
    // TODO: Need to remove this API and usages must be migrated to `deleteComponent(ComponentDeleteRequest request)`
    public CompletableFuture<FlowNodeDeleteResponse> deleteFlowNode(FlowNodeDeleteRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowNodeDeleteResponse response = new FlowNodeDeleteResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                DeleteNodeHandler deleteNodeHandler = new DeleteNodeHandler(request.flowNode(), filePath);
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                response.setTextEdits(
                        deleteNodeHandler.getTextEditsToDeletedNode(document.get(), project));
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<ComponentDeleteResponse> deleteComponent(ComponentDeleteRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            ComponentDeleteResponse response = new ComponentDeleteResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return response;
                }
                response.setTextEdits(DeleteNodeHandler.getTextEditsToDeletedNode(
                        request.component(), filePath, document.get(), project
                ));
            } catch (Throwable e) {
                response.setError(e);
            }

            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelSourceGeneratorResponse> addErrorHandler(FilePathRequest request) {

        return CompletableFuture.supplyAsync(() -> {
            FlowModelSourceGeneratorResponse response = new FlowModelSourceGeneratorResponse();
            try {
                ErrorHandlerGenerator errorHandlerGenerator =
                        new ErrorHandlerGenerator(workspaceManagerProxy.get(), Path.of(request.filePath()));
                response.setTextEdits(errorHandlerGenerator.getTextEdits());
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<EnclosedFuncDefResponse> getEnclosedFunctionDef(EnclosedFuncDefRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            EnclosedFuncDefResponse response = new EnclosedFuncDefResponse();
            try {
                Path path = PathUtil.convertUriStringToPath(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get(request.filePath());
                Project project = workspaceManager.loadProject(path);
                Optional<Document> document = workspaceManager.document(path);
                if (document.isEmpty()) {
                    return response;
                }
                EnclosedNodeFinder enclosedNodeFinder =
                        new EnclosedNodeFinder(document.get(), request.position(), request.findClass());
                LineRange enclosedRange = enclosedNodeFinder.findEnclosedNode();
                response.setFilePath(project.sourceRoot().resolve(enclosedRange.fileName()).toString());
                response.setStartLine(enclosedRange.startLine());
                response.setEndLine(enclosedRange.endLine());
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FunctionDefinitionResponse> functionDefinition(FunctionDefinitionRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FunctionDefinitionResponse response = new FunctionDefinitionResponse();
            try {
                Path projectPath = Path.of(request.projectPath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(projectPath);

                Path documentPath = project.kind() == ProjectKind.SINGLE_FILE_PROJECT ? projectPath :
                        projectPath.resolve(request.fileName());
                Optional<Document> optDocument = workspaceManager.document(documentPath);
                Optional<SemanticModel> optSemanticModel = workspaceManager.semanticModel(documentPath);
                if (optDocument.isEmpty() || optSemanticModel.isEmpty()) {
                    return response;
                }
                Document document = optDocument.get();

                ModuleNodeAnalyzer moduleNodeAnalyzer =
                        new ModuleNodeAnalyzer(ModuleInfo.from(document.module().descriptor()), optSemanticModel.get());
                ModulePartNode rootNode = document.syntaxTree().rootNode();
                Optional<JsonElement> function = moduleNodeAnalyzer.findFunction(rootNode, request.functionName());
                function.ifPresent(response::setFunctionDefinition);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelNodeTemplateResponse> diagnostics(FlowModelSourceGeneratorRequest request) {
        DiagnosticRequest diagnosticsRequest = new DiagnosticRequest(
                request.filePath(),
                request.flowNode(),
                workspaceManagerProxy.get(CommonUtils.getExprUri(request.filePath()))
        );

        // Use debouncer to schedule the diagnostics request
        return DiagnosticsDebouncer.getInstance().debounce(diagnosticsRequest)
                .thenApply(flowNode -> {
                    FlowModelNodeTemplateResponse response = new FlowModelNodeTemplateResponse();
                    try {
                        response.setFlowNode(flowNode);
                    } catch (Throwable e) {
                        response.setError(e);
                    }
                    return response;
                })
                .exceptionally(throwable -> {
                    FlowModelNodeTemplateResponse response = new FlowModelNodeTemplateResponse();
                    response.setError(throwable);
                    return response;
                });
    }

    @JsonRequest
    public CompletableFuture<SearchNodesResponse> searchNodes(SearchNodesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            SearchNodesResponse response = new SearchNodesResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();

                Project project = workspaceManager.loadProject(filePath);
                SemanticModel semanticModel;
                Document document = null;
                LinePosition position = request.position();

                if (Files.isDirectory(filePath)) {
                    // For project paths, use the default module's semantic model
                    semanticModel = PackageUtil.getCompilation(project.currentPackage())
                            .getSemanticModel(project.currentPackage().getDefaultModule().moduleId());
                    position = null;
                } else {
                    semanticModel = FileSystemUtils.getSemanticModel(workspaceManager, filePath);
                    Optional<Document> optDocument = workspaceManager.document(filePath);
                    if (optDocument.isEmpty()) {
                        return response;
                    }
                    document = optDocument.get();
                }

                // Generate the flow nodes based on search criteria
                ModelGenerator modelGenerator = new ModelGenerator(project, semanticModel, filePath, workspaceManager);
                var nodes = modelGenerator.searchNodes(document, position, request.queryMap());
                Gson gson = new Gson();
                JsonElement jsonElement = gson.toJsonTree(nodes);
                response.setOutput(jsonElement.getAsJsonArray());
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    @JsonRequest
    public CompletableFuture<FlowModelAvailableNodesResponse> search(SearchRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            FlowModelAvailableNodesResponse response = new FlowModelAvailableNodesResponse();
            try {
                Path filePath = Path.of(request.filePath());
                WorkspaceManager workspaceManager = this.workspaceManagerProxy.get();
                Project project = workspaceManager.loadProject(filePath);
                SearchCommand.Kind searchKind = SearchCommand.Kind.valueOf(request.searchKind());
                LineRange position = request.position();
                if (request.position() != null) {
                    position = LineRange.from(
                            Optional.ofNullable(filePath.getFileName()).map(Path::toString).orElse(""),
                            request.position().startLine(),
                            request.position().endLine());
                }

                Path projectPath = workspaceManager.projectRoot(filePath);
                Optional<Document> functionsDoc = getDocumentFromFile(projectPath, "functions.bal");

                SearchCommand command = SearchCommand.from(searchKind, project, position, request.queryMap(),
                        functionsDoc.orElse(null));
                JsonArray categories = command.execute();
                if (request.position() != null) {
                    Optional<Document> document = workspaceManager.document(filePath);
                    LinePosition cursorPosition = request.position().startLine();
                    if (document.isPresent() &&
                            AvailableNodesGenerator.isInsideTestFunction(document.get(), cursorPosition)) {
                        AvailableNodesGenerator.addFilePathToNodes(categories, filePath.toString());
                    }
                }
                response.setCategories(categories);
            } catch (Throwable e) {
                response.setError(e);
            }
            return response;
        });
    }

    private static String getRelativePath(Path projectPath, Path filePath) {
        if (projectPath == null || filePath == null) {
            return "";
        }
        if (projectPath.equals(filePath)) {
            Path fileName = filePath.getFileName();
            return fileName != null ? fileName.toString() : "";
        }
        Path relativePath = projectPath.relativize(filePath);
        return relativePath.toString();
    }

    private Optional<Document> getDocumentFromFile(Path projectPath, String fileName) {
        try {
            return this.workspaceManagerProxy.get().document(projectPath.resolve(fileName));
        } catch (Throwable e) {
            return Optional.empty();
        }
    }

    private String wiringKind(ClassOwnedNodeSourceRequest.ClassOwnedNodeWiring wiring) {
        return wiring == null ? null : wiring.kind();
    }

    private void propagateCodedataDataToTemplate(JsonObject requestId, JsonElement nodeTemplate) {
        if (!requestId.has("data") || !requestId.get("data").isJsonObject()) {
            return;
        }
        JsonObject requestData = requestId.getAsJsonObject("data");
        if (!requestData.has("filePath")) {
            return;
        }
        String testFilePath = requestData.get("filePath").getAsString();
        if (!nodeTemplate.isJsonObject()) {
            return;
        }
        JsonObject templateObj = nodeTemplate.getAsJsonObject();
        if (!templateObj.has("codedata")) {
            return;
        }
        JsonObject codedata = templateObj.getAsJsonObject("codedata");
        JsonObject data;
        if (codedata.has("data") && codedata.get("data").isJsonObject()) {
            data = codedata.getAsJsonObject("data");
        } else {
            data = new JsonObject();
            codedata.add("data", data);
        }
        data.addProperty("filePath", testFilePath);
    }
}
