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

package io.ballerina.servicemodelgenerator.extension.core;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.google.gson.stream.JsonReader;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ObjectFieldNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.ModulePrefixContext;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.modelgenerator.commons.ServiceDeclaration;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleId;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.builder.FunctionBuilderRouter;
import io.ballerina.servicemodelgenerator.extension.builder.ServiceBuilderRouter;
import io.ballerina.servicemodelgenerator.extension.connector.PlatformDependencyEditUtil;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.Listener;
import io.ballerina.servicemodelgenerator.extension.model.Option;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceClass;
import io.ballerina.servicemodelgenerator.extension.model.TriggerBasicInfo;
import io.ballerina.servicemodelgenerator.extension.model.TriggerProperty;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.request.AddFieldRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ClassFieldModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ClassModelFromSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.CommonModelFromSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.CreateClassDependencyRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionModelRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.FunctionSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerDiscoveryRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerModelRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ListenerSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ModifyClassDependencyRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceClassSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceInitSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModelRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModifierRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceSourceRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.TriggerListRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.TriggerRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.TypesRequest;
import io.ballerina.servicemodelgenerator.extension.model.request.ValidatePropertyRequest;
import io.ballerina.servicemodelgenerator.extension.model.response.AddOrGetDefaultListenerResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.CommonSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.FunctionFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.FunctionModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ListenerDiscoveryResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ListenerFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ListenerModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceClassModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceFromSourceResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceInitModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ServiceModelResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.TriggerListResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.TriggerResponse;
import io.ballerina.servicemodelgenerator.extension.model.response.ValidatePropertyResponse;
import io.ballerina.servicemodelgenerator.extension.util.FTPListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.FunctionBadge;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil;
import io.ballerina.servicemodelgenerator.extension.util.TriggerSearchUtil;
import io.ballerina.servicemodelgenerator.extension.util.TypeCompletionGenerator;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.servicemodelgenerator.extension.validation.SaveTimeValidator;
import io.ballerina.servicemodelgenerator.extension.validation.ValidationContext;
import io.ballerina.servicemodelgenerator.extension.validation.ValidationEngine;
import io.ballerina.servicemodelgenerator.extension.validation.ValidationResult;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextDocument;
import io.ballerina.tools.text.TextRange;
import org.ballerinalang.annotation.JavaSPIService;
import org.ballerinalang.langserver.LSClientLogger;
import org.ballerinalang.langserver.commons.LanguageServerContext;
import org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionList;
import org.eclipse.lsp4j.TextEdit;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.jsonrpc.services.JsonRequest;
import org.eclipse.lsp4j.jsonrpc.services.JsonSegment;
import org.eclipse.lsp4j.services.LanguageServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.DEFAULT;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.FTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE_WITH_TAB;
import static io.ballerina.servicemodelgenerator.extension.util.ListenerUtil.getDefaultListenerDeclarationStmt;
import static io.ballerina.servicemodelgenerator.extension.util.ListenerUtil.processListenerNode;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil.addServiceClassDocTextEdits;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getProtocol;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.expectsTriggerByName;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.filterTriggers;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getImportStmt;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

/**
 * Represents the extended language server service for the trigger model generator service.
 *
 * @since 1.0.0
 */
@JavaSPIService("org.ballerinalang.langserver.commons.service.spi.ExtendedLanguageServerService")
@JsonSegment("serviceDesign")
public class ServiceModelGeneratorService implements ExtendedLanguageServerService {

    // Built once: the registries are immutable, and `validateProperty` runs on a per-keystroke
    // debounce where rebuilding both catalogs per call is pure waste.
    private static final ValidationEngine LIVE_VALIDATION_ENGINE = ValidationEngine.withAllRules();

    private static final Type propertyMapType = new TypeToken<Map<String, TriggerProperty>>() {
    }.getType();
    private final Map<String, TriggerProperty> triggerProperties;
    private LSClientLogger lsClientLogger;
    private WorkspaceManager workspaceManager;

    public ServiceModelGeneratorService() {
        InputStream newPropertiesStream = getClass().getClassLoader()
                .getResourceAsStream("trigger_properties.json");
        Map<String, TriggerProperty> newTriggerProperties = Map.of();
        if (newPropertiesStream != null) {
            try (JsonReader reader = new JsonReader(new InputStreamReader(newPropertiesStream,
                    StandardCharsets.UTF_8))) {
                newTriggerProperties = new Gson().fromJson(reader, propertyMapType);
                reader.close();
                newPropertiesStream.close();
            } catch (IOException e) {
                // Ignore
            }
        }
        this.triggerProperties = newTriggerProperties;
    }

    private static NonTerminalNode findNonTerminalNode(Codedata codedata, Document document) {
        SyntaxTree syntaxTree = document.syntaxTree();
        ModulePartNode modulePartNode = syntaxTree.rootNode();
        TextDocument textDocument = syntaxTree.textDocument();
        LineRange lineRange = codedata.getLineRange();
        int start = textDocument.textPositionFrom(lineRange.startLine());
        int end = textDocument.textPositionFrom(lineRange.endLine());
        return modulePartNode.findNode(TextRange.from(start, end - start), true);
    }

    @Override
    public void init(LanguageServer langServer, WorkspaceManager workspaceManager,
                     LanguageServerContext serverContext) {
        this.workspaceManager = workspaceManager;
        this.lsClientLogger = LSClientLogger.getInstance(serverContext);
    }

    @Override
    public Class<?> getRemoteInterface() {
        return null;
    }

    /**
     * Get the compatible listeners for the given module.
     *
     * @param request Listener discovery request
     * @return {@link ListenerDiscoveryResponse} of the listener discovery response
     */
    @JsonRequest
    public CompletableFuture<ListenerDiscoveryResponse> getListeners(ListenerDiscoveryRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);
                Package currentPackage = project.currentPackage();
                Module module = currentPackage.module(ModuleName.from(currentPackage.packageName()));
                ModuleId moduleId = module.moduleId();
                SemanticModel semanticModel = PackageUtil.getCompilation(currentPackage).getSemanticModel(moduleId);
                Set<String> listeners = ListenerUtil.getCompatibleListeners(request.moduleName(),
                        semanticModel, project);
                if (FTP.equals(request.moduleName()) && request.removeDeprecated() != null) {
                    listeners = FTPListenerUtil.filterFtpListenersByDeprecatedMode(listeners,
                            request.removeDeprecated(), semanticModel, project);
                }
                return new ListenerDiscoveryResponse(listeners);
            } catch (Throwable e) {
                return new ListenerDiscoveryResponse(e);
            }
        });
    }

    /**
     * Get the listener model template for the given module.
     *
     * @param request Listener model request
     * @return {@link ListenerModelResponse} of the listener model response
     */
    @JsonRequest
    public CompletableFuture<ListenerModelResponse> getListenerModel(ListenerModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());

                Project project = this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> documentOpt = this.workspaceManager.document(filePath);

                if (documentOpt.isEmpty() || semanticModel.isEmpty()) {
                    throw new RuntimeException("Unable to load the document or semantic model for the " +
                            "provided file path: " + filePath);
                }

                Document document = documentOpt.get();
                ModuleInfo moduleInfo = ModuleInfo.from(document.module().descriptor());

                boolean removeDeprecated = request.removeDeprecated() == null || request.removeDeprecated();
                return ListenerUtil.getListenerModelByName(request.codedata(), semanticModel.get(), moduleInfo,
                                removeDeprecated)
                        .map(listenerModel -> {
                            if (FTP.equals(request.codedata().getModuleName())
                                    && request.removeDeprecated() != null) {
                                FTPListenerUtil.adjustFtpListenerModelForDeprecatedMode(
                                        listenerModel, request.removeDeprecated(), semanticModel.get(), document);
                            }
                            PlatformDependencyEditUtil.overlayDriverDependencies(listenerModel,
                                    request.codedata().getOrgName(), request.codedata().getModuleName(),
                                    request.codedata().getVersion(), project);
                            return new ListenerModelResponse(listenerModel);
                        })
                        .orElseGet(ListenerModelResponse::new);
            } catch (Throwable e) {
                return new ListenerModelResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to add a listener to the given module.
     *
     * @param request Listener source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addListener(ListenerSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);

                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }

                ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();
                Listener listener = request.listener();

                List<TextEdit> edits = new ArrayList<>();
                LineRange lineRange = modulePartNode.lineRange();
                if (!importExists(modulePartNode, listener.getOrgName(), listener.getModuleName())) {
                    String importText = getImportStmt(listener.getOrgName(), listener.getModuleName());
                    edits.add(new TextEdit(Utils.toRange(lineRange.startLine()), importText));
                }
                String listenerDeclaration = listener.getListenerDeclaration();
                edits.add(new TextEdit(Utils.toRange(lineRange.endLine()), NEW_LINE + listenerDeclaration));

                Map<String, List<TextEdit>> allEdits = new LinkedHashMap<>();
                allEdits.put(request.filePath(), edits);
                PlatformDependencyEditUtil.addDriverDependenciesIfPresent(allEdits, project,
                        listener.getProperties());

                return new CommonSourceResponse(allEdits);
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the http default listener reference or send text edits to add a default listener.
     *
     * @param request Listener discovery request
     * @return {@link AddOrGetDefaultListenerResponse} of the add or get default listener response
     */
    @JsonRequest
    public CompletableFuture<AddOrGetDefaultListenerResponse> addOrGetDefaultListener(
            ListenerDiscoveryRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                AddOrGetDefaultListenerResponse response = new AddOrGetDefaultListenerResponse();
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);
                Package currentPackage = project.currentPackage();
                Module module = currentPackage.module(ModuleName.from(currentPackage.packageName()));
                ModuleId moduleId = module.moduleId();
                SemanticModel semanticModel = PackageUtil.getCompilation(currentPackage).getSemanticModel(moduleId);

                Optional<String> httpDefaultListenerNameRef = ListenerUtil.getHttpDefaultListenerNameRef(
                        semanticModel, project);
                if (httpDefaultListenerNameRef.isPresent()) {
                    response.setDefaultListenerRef(httpDefaultListenerNameRef.get());
                    return response;
                }
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return response;
                }
                ModulePartNode node = document.get().syntaxTree().rootNode();
                LineRange lineRange = node.lineRange();

                List<TextEdit> edits = new ArrayList<>();
                if (!importExists(node, "ballerina", "http")) {
                    String importText = getImportStmt("ballerina", "http");
                    edits.add(new TextEdit(Utils.toRange(lineRange.startLine()), importText));
                }

                ListenerUtil.DefaultListener defaultListener = ListenerUtil.defaultListener(
                        semanticModel, document.get(), node, "http");
                String stmt = getDefaultListenerDeclarationStmt(defaultListener);
                edits.add(new TextEdit(Utils.toRange(defaultListener.linePosition()), stmt));

                response.setTextEdits(Map.of(request.filePath(), edits));
                return response;
            } catch (Throwable e) {
                return new AddOrGetDefaultListenerResponse(e);
            }
        });
    }

    /**
     * Get the service model template for the given module.
     *
     * @param request Service model request
     * @return {@link ServiceModelResponse} of the service model response
     */
    @Deprecated
    @JsonRequest
    public CompletableFuture<ServiceModelResponse> getServiceModel(ServiceModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Optional<Service> service = ServiceBuilderRouter.getModelTemplate(request.orgName(),
                        request.moduleName());
                if (service.isEmpty()) {
                    return new ServiceModelResponse();
                }
                Service serviceModel = service.get();
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);

                Package currentPackage = project.currentPackage();
                Module module = currentPackage.module(ModuleName.from(currentPackage.packageName()));
                SemanticModel semanticModel = currentPackage.getCompilation().getSemanticModel(module.moduleId());
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new ServiceModelResponse();
                }
                Set<String> listenersList = ListenerUtil.getCompatibleListeners(request.moduleName(), semanticModel,
                        project);
                serviceModel.getListener().getTypes().getFirst().options().addAll(Option.of(listenersList));
                return new ServiceModelResponse(serviceModel);
            } catch (Throwable e) {
                return new ServiceModelResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to add a service to the given module.
     *
     * @param request Service source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    @Deprecated
    public CompletableFuture<CommonSourceResponse> addService(ServiceSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return new CommonSourceResponse();
                }
                Map<String, List<TextEdit>> textEdits = ServiceBuilderRouter.addService(request.service(),
                        semanticModel.get(), project, workspaceManager, filePath.toString(), document.get());
                return new CommonSourceResponse(textEdits);
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Find matching trigger models for the given request.
     *
     * @param request Trigger list request
     * @return {@link TriggerListResponse} of the trigger list response
     */
    @JsonRequest
    public CompletableFuture<TriggerListResponse> getTriggerModels(TriggerListRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            List<TriggerBasicInfo> triggerBasicInfoList = triggerProperties.values().stream()
                    .filter(triggerProperty -> filterTriggers(triggerProperty, request))
                    .map(this::getTriggerBasicInfoByName)
                    .flatMap(Optional::stream)
                    .toList();
            return new TriggerListResponse(triggerBasicInfoList);
        });
    }

    /**
     * Discover event-integration trigger packages on Ballerina Central ("Search more"). Complements
     * {@link #getTriggerModels} (local index) with a live Central search; connectors that ship their
     * trigger models are then addable with no language-server release. Excludes triggers already known
     * locally and degrades to an empty list when Central is unavailable.
     *
     * @param request Trigger list request ({@code query} is the search term)
     * @return {@link TriggerListResponse} of the matching triggers
     */
    @JsonRequest
    public CompletableFuture<TriggerListResponse> searchTriggers(TriggerListRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            Set<String> localKeys = triggerProperties.values().stream()
                    .map(tp -> tp.orgName() + "/" + tp.name())
                    .collect(Collectors.toSet());
            String query = request == null ? null : request.query();
            List<TriggerBasicInfo> centralTriggers = TriggerSearchUtil.searchCentral(
                    RemoteCentral.getInstance(), query, null, localKeys);
            List<TriggerBasicInfo> localRepositoryTriggers = (request != null && request.includeLocalRepository())
                    ? TriggerSearchUtil.searchLocalRepository(localKeys)
                    : List.of();
            return new TriggerListResponse(centralTriggers, localRepositoryTriggers);
        });
    }

    /**
     * Get the function model template for a given function in a service type.
     *
     * @return {@link FunctionModelResponse} of the resource model response
     */
    @JsonRequest
    public CompletableFuture<FunctionModelResponse> getFunctionModel(FunctionModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                return FunctionBuilderRouter.getModelTemplate(request.type(), request.functionName())
                        .map(FunctionModelResponse::new)
                        .orElseGet(FunctionModelResponse::new);
            } catch (Throwable e) {
                return new FunctionModelResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to add a http resource function.
     *
     * @param request Function source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addResource(FunctionSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Optional<SemanticModel> semanticModelOp;
                Optional<Document> document;
                try {
                    this.workspaceManager.loadProject(filePath);
                    semanticModelOp = this.workspaceManager.semanticModel(filePath);
                    document = this.workspaceManager.document(filePath);
                } catch (Exception e) {
                    return new CommonSourceResponse(e);
                }
                if (semanticModelOp.isEmpty() || document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                NonTerminalNode node = findNonTerminalNode(request.codedata(), document.get());
                if (!(node instanceof ServiceDeclarationNode || node instanceof ClassDefinitionNode)) {
                    return new CommonSourceResponse();
                }
                Map<String, List<TextEdit>> textEdits = FunctionBuilderRouter.addFunction(HTTP,
                        request.function(), request.filePath(), semanticModelOp.get(), document.get(), node,
                        this.workspaceManager);
                return new CommonSourceResponse(textEdits);
            } catch (Exception e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the service model for the given line range.
     *
     * @param request Common model from source request
     * @return {@link ServiceFromSourceResponse} of the service from source response
     */
    @JsonRequest
    public CompletableFuture<ServiceFromSourceResponse> getServiceFromSource(CommonModelFromSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            Path filePath = Path.of(request.filePath());
            Optional<SemanticModel> semanticModelOp;
            Optional<Document> document;
            Project project;
            try {
                project = this.workspaceManager.loadProject(filePath);
                semanticModelOp = this.workspaceManager.semanticModel(filePath);
                document = this.workspaceManager.document(filePath);
            } catch (Exception e) {
                return new ServiceFromSourceResponse(e);
            }

            if (Objects.isNull(project) || document.isEmpty() || semanticModelOp.isEmpty()) {
                return new ServiceFromSourceResponse();
            }
            NonTerminalNode node = findNonTerminalNode(request.codedata(), document.get());
            if (node.kind() != SyntaxKind.SERVICE_DECLARATION) {
                return new ServiceFromSourceResponse();
            }
            ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) node;
            SemanticModel semanticModel = semanticModelOp.get();
            Service service = ServiceBuilderRouter.getServiceFromSource(serviceNode, project, semanticModel,
                    workspaceManager, request.filePath());
            FunctionBadge.stamp(service);
            return new ServiceFromSourceResponse(service);
        });
    }

    /**
     * Get the function model for the given line range.
     *
     * @param request Common model from source request
     * @return {@link FunctionFromSourceResponse} of the function from source response
     */
    @JsonRequest
    public CompletableFuture<FunctionFromSourceResponse> getFunctionFromSource(CommonModelFromSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            Path filePath = Path.of(request.filePath());
            Optional<SemanticModel> semanticModelOp;
            Optional<Document> document;
            Project project;
            try {
                project = this.workspaceManager.loadProject(filePath);
                semanticModelOp = this.workspaceManager.semanticModel(filePath);
                document = this.workspaceManager.document(filePath);
            } catch (Exception e) {
                return new FunctionFromSourceResponse(e);
            }

            if (Objects.isNull(project) || document.isEmpty() || semanticModelOp.isEmpty()) {
                return new FunctionFromSourceResponse();
            }

            NonTerminalNode node = findNonTerminalNode(request.codedata(), document.get());
            if (!(node instanceof FunctionDefinitionNode functionDefinitionNode)) {
                return new FunctionFromSourceResponse();
            }
            String moduleName = (request.codedata().getModuleName() != null) ?
                    request.codedata().getModuleName() : DEFAULT;
            Function function = FunctionBuilderRouter.getFunctionFromSource(moduleName, semanticModelOp.get(),
                    functionDefinitionNode);
            return new FunctionFromSourceResponse(function);
        });
    }

    /**
     * Get the listener model for the given line range.
     *
     * @param request Common model from source request
     * @return {@link ListenerFromSourceResponse} of the listener from source response
     */
    @JsonRequest
    public CompletableFuture<ListenerFromSourceResponse> getListenerFromSource(CommonModelFromSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());

                this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                Optional<Document> documentOpt = this.workspaceManager.document(filePath);

                if (documentOpt.isEmpty() || semanticModel.isEmpty()) {
                    return new ListenerFromSourceResponse();
                }

                Document document = documentOpt.get();
                NonTerminalNode node = findNonTerminalNode(request.codedata(), document);
                String orgName = request.codedata().getOrgName();

                ModuleInfo moduleInfo = ModuleInfo.from(document.module().descriptor());
                return processListenerNode(node, orgName, semanticModel.get(), moduleInfo);
            } catch (Exception e) {
                return new ListenerFromSourceResponse(e);
            }
        });
    }

    /**
     * Get the list of triggers for a given search query.
     *
     * @param request Trigger list request
     * @return {@link TriggerListResponse} of the trigger list response
     */
    @JsonRequest
    public CompletableFuture<TriggerResponse> getTriggerModel(TriggerRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            if (expectsTriggerByName(request)) {
                return new TriggerResponse(getTriggerBasicInfoByName(request.organization(),
                        request.packageName()).orElse(null));
            }

            TriggerProperty triggerProperty = triggerProperties.get(request.id());
            if (triggerProperty == null) {
                return new TriggerResponse();
            }
            return new TriggerResponse(getTriggerBasicInfoByName(triggerProperty.orgName(),
                    triggerProperty.name()).orElse(null));
        });
    }

    /**
     * Get the list of text edits to add a function skeleton to the given service.
     *
     * @param request Function source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addFunction(FunctionSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Optional<SemanticModel> semanticModelOp;
                Optional<Document> document;
                try {
                    this.workspaceManager.loadProject(filePath);
                    semanticModelOp = this.workspaceManager.semanticModel(filePath);
                    document = this.workspaceManager.document(filePath);
                } catch (Exception e) {
                    return new CommonSourceResponse(e);
                }
                if (semanticModelOp.isEmpty() || document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                NonTerminalNode node = findNonTerminalNode(request.codedata(), document.get());
                if (!(node instanceof ServiceDeclarationNode || node instanceof ClassDefinitionNode)) {
                    return new CommonSourceResponse();
                }
                Codedata codedata = request.function().getCodedata();
                String moduleName = (codedata != null && codedata.getModuleName() != null) ? codedata.getModuleName() :
                        DEFAULT;
                List<ValidationResult> validations = validateFunction(request.function(),
                        new ValidationContext(semanticModelOp.get(), null, document.get(), moduleName, node, null));
                if (SaveTimeValidator.blocksGeneration(validations)) {
                    return CommonSourceResponse.validationFailure(validations);
                }
                Map<String, List<TextEdit>> textEdits = FunctionBuilderRouter.addFunction(moduleName,
                        request.function(), request.filePath(), semanticModelOp.get(), document.get(), node,
                        this.workspaceManager);
                return new CommonSourceResponse(textEdits, validations);
            } catch (Exception e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to modify a function in the given service.
     *
     * @param request Function modifier request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateFunction(FunctionModifierRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);
                Optional<SemanticModel> semanticModelOp;
                Optional<Document> document;
                try {
                    semanticModelOp = this.workspaceManager.semanticModel(filePath);
                    document = this.workspaceManager.document(filePath);
                } catch (Exception e) {
                    return new CommonSourceResponse(e);
                }
                if (semanticModelOp.isEmpty() || document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                Function function = request.function();
                Codedata codedata = function.getCodedata();
                NonTerminalNode node = findNonTerminalNode(codedata, document.get());
                if (!(node instanceof FunctionDefinitionNode functionDefinitionNode)) {
                    return new CommonSourceResponse();
                }
                NonTerminalNode parentNode = functionDefinitionNode.parent();
                if (!(parentNode instanceof ServiceDeclarationNode || parentNode instanceof ClassDefinitionNode)) {
                    return new CommonSourceResponse();
                }
                String moduleName = codedata.getModuleName() != null ? codedata.getModuleName() : DEFAULT;
                List<ValidationResult> validations = validateFunction(function,
                        new ValidationContext(semanticModelOp.get(), project, document.get(), moduleName,
                                parentNode, functionDefinitionNode.lineRange()));
                if (SaveTimeValidator.blocksGeneration(validations)) {
                    return CommonSourceResponse.validationFailure(validations);
                }
                Map<String, List<TextEdit>> textEdits = FunctionBuilderRouter.updateFunction(moduleName, function,
                        request.filePath(), document.get(), functionDefinitionNode, semanticModelOp.get(), project,
                        this.workspaceManager);
                return new CommonSourceResponse(textEdits, validations);
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to modify a service in the given module.
     *
     * @param request Service modifier request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateService(ServiceModifierRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Service service = request.service();
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return new CommonSourceResponse();
                }
                NonTerminalNode node = findNonTerminalNode(service.getCodedata(), document.get());
                if (node.kind() != SyntaxKind.SERVICE_DECLARATION) {
                    return new CommonSourceResponse();
                }
                List<ValidationResult> validations = SaveTimeValidator.validate(service.getProperties(),
                        SaveTimeValidator.context(semanticModel.get(), null, document.get(),
                                service.getModuleName()));
                if (SaveTimeValidator.blocksGeneration(validations)) {
                    return CommonSourceResponse.validationFailure(validations);
                }
                Map<String, List<TextEdit>> textEdits = ServiceBuilderRouter.updateService(service,
                        semanticModel.get(), workspaceManager, filePath.toString(), document.get(),
                        (ServiceDeclarationNode) node);
                return new CommonSourceResponse(textEdits, validations);
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to modify a listener in the given module.
     *
     * @param request Listener modifier request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateListener(ListenerModifierRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Listener listener = request.listener();

                Project project = this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }

                NonTerminalNode node = findNonTerminalNode(listener.getCodedata(), document.get());
                if (!(node instanceof ListenerDeclarationNode) && !(node instanceof ExplicitNewExpressionNode)) {
                    return new CommonSourceResponse();
                }

                LineRange lineRange = listener.getCodedata().getLineRange();
                ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();

                // Save-time gate: an ERROR here means no edits are generated at all. editedRange is the
                // listener's own declaration range, so a uniqueness rule (e.g.
                // ls.validate.unique.listener.name) recognises re-saving it as itself, not a collision.
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (semanticModel.isPresent()) {
                    ValidationContext context = new ValidationContext(semanticModel.get(), null, document.get(),
                            listener.getModuleName(), null, lineRange);
                    List<ValidationResult> validations = SaveTimeValidator.validate(listener.getProperties(),
                            context);
                    if (SaveTimeValidator.blocksGeneration(validations)) {
                        return CommonSourceResponse.validationFailure(validations);
                    }
                }

                // The protocol is derived from the package name (the module's natural prefix), which is
                // not what the file binds the module to when it is imported under an alias. Regenerating
                // the declaration with the natural prefix would rewrite a working `triggerTwilio:Listener`
                // into an out-of-scope `twilio:Listener`, so re-resolve it against the file first.
                if (listener.getModuleName() != null && !listener.getModuleName().isBlank()) {
                    listener.setListenerProtocol(ModulePrefixContext.from(modulePartNode)
                            .prefixFor(listener.getOrgName(), listener.getModuleName()));
                }
                String listenerDeclaration = listener.getListenerDefinition();

                List<TextEdit> edits = new ArrayList<>();
                edits.add(new TextEdit(Utils.toRange(lineRange), listenerDeclaration));

                // Add imports required by the FTP coordination config type cast
                FTPListenerUtil.addCoordinationConfigImports(listenerDeclaration, modulePartNode, edits);

                Map<String, List<TextEdit>> allEdits = new LinkedHashMap<>();
                allEdits.put(request.filePath(), edits);
                PlatformDependencyEditUtil.addDriverDependenciesIfPresent(allEdits, project,
                        listener.getProperties());

                return new CommonSourceResponse(allEdits);
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the JSON model for a service class from the source.
     *
     * @param request Service lass model request
     * @return Service class model response
     */
    @JsonRequest
    public CompletableFuture<ServiceClassModelResponse> getServiceClassModelFromSource(
            ClassModelFromSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                try {
                    this.workspaceManager.loadProject(filePath);
                } catch (Exception e) {
                    return new ServiceClassModelResponse(e);
                }
                Optional<Document> document = this.workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = this.workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return new ServiceClassModelResponse();
                }
                NonTerminalNode node = findNonTerminalNode(request.codedata(), document.get());
                if (!(node instanceof ClassDefinitionNode classDefinitionNode)) {
                    return new ServiceClassModelResponse();
                }
                ServiceClassUtil.ServiceClassContext context = ServiceClassUtil.ServiceClassContext
                        .valueOf(request.context());
                ServiceClass serviceClass = ServiceClassUtil.getServiceClass(semanticModel.get(), classDefinitionNode,
                        context);
                return new ServiceClassModelResponse(serviceClass);
            } catch (Throwable e) {
                return new ServiceClassModelResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to modify a service class.
     *
     * @param request Service class source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateServiceClass(ServiceClassSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                List<TextEdit> edits = new ArrayList<>();
                ServiceClass serviceClass = request.serviceClass();
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                SyntaxTree syntaxTree = document.get().syntaxTree();
                ModulePartNode modulePartNode = syntaxTree.rootNode();
                TextDocument textDocument = syntaxTree.textDocument();
                LineRange lineRange = serviceClass.codedata().getLineRange();
                int start = textDocument.textPositionFrom(lineRange.startLine());
                int end = textDocument.textPositionFrom(lineRange.endLine());
                NonTerminalNode node = modulePartNode.findNode(TextRange.from(start, end - start), true);
                if (node.kind() != SyntaxKind.CLASS_DEFINITION) {
                    return new CommonSourceResponse();
                }
                ClassDefinitionNode classDefinitionNode = (ClassDefinitionNode) node;
                Value className = serviceClass.className();
                if (Objects.nonNull(className) && className.isEnabledWithValue()
                        && !className.getValue().equals(classDefinitionNode.className().text().trim())) {
                    LineRange nameRange = classDefinitionNode.className().lineRange();
                    edits.add(new TextEdit(Utils.toRange(nameRange), className.getValue()));
                }
                addServiceClassDocTextEdits(serviceClass, classDefinitionNode, edits);
                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Add an attribute to the given class or service.
     *
     * @param request Function source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addField(AddFieldRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                List<TextEdit> edits = new ArrayList<>();
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                SyntaxTree syntaxTree = document.get().syntaxTree();
                ModulePartNode modulePartNode = syntaxTree.rootNode();
                TextDocument textDocument = syntaxTree.textDocument();
                LineRange lineRange = request.codedata().getLineRange();
                int start = textDocument.textPositionFrom(lineRange.startLine());
                int end = textDocument.textPositionFrom(lineRange.endLine());
                NonTerminalNode node = modulePartNode.findNode(TextRange.from(start, end - start), true);
                if (!(node instanceof ClassDefinitionNode || node instanceof ServiceDeclarationNode)) {
                    return new CommonSourceResponse();
                }
                LineRange functionLineRange;
                if (node instanceof ServiceDeclarationNode serviceDeclarationNode) {
                    functionLineRange = serviceDeclarationNode.openBraceToken().lineRange();
                } else {
                    ClassDefinitionNode classDefinitionNode = (ClassDefinitionNode) node;
                    functionLineRange = classDefinitionNode.openBrace().lineRange();
                }

                String functionNode = NEW_LINE_WITH_TAB + ServiceClassUtil.buildObjectFiledString(request.field());
                edits.add(new TextEdit(Utils.toRange(functionLineRange.endLine()), functionNode));
                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Add an attribute of a class or a service.
     *
     * @param request Class field source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateClassField(ClassFieldModifierRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                List<TextEdit> edits = new ArrayList<>();
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                LineRange lineRange = request.field()
                        .codedata().getLineRange();
                NonTerminalNode node = findNonTerminalNode(request.field()
                        .codedata(), document.get());
                if (!(node instanceof ObjectFieldNode)) {
                    return new CommonSourceResponse();
                }
                TextEdit fieldEdit = new TextEdit(Utils.toRange(lineRange),
                        ServiceClassUtil.buildObjectFiledString(request.field()));
                edits.add(fieldEdit);
                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    @JsonRequest
    public CompletableFuture<CommonSourceResponse> createClassDependency(CreateClassDependencyRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                SyntaxTree syntaxTree = document.get().syntaxTree();
                ModulePartNode modulePartNode = syntaxTree.rootNode();
                TextDocument textDocument = syntaxTree.textDocument();
                LineRange lineRange = request.classLineRange();
                int start = textDocument.textPositionFrom(lineRange.startLine());
                int end = textDocument.textPositionFrom(lineRange.endLine());
                NonTerminalNode node = modulePartNode.findNode(TextRange.from(start, end - start), true);
                if (!(node instanceof ClassDefinitionNode classDefinitionNode)) {
                    return new CommonSourceResponse();
                }
                List<TextEdit> edits = ServiceClassUtil.buildAddInitParameterEdits(classDefinitionNode,
                        request.field(), textDocument, modulePartNode);
                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    @JsonRequest
    public CompletableFuture<CommonSourceResponse> updateClassDependency(ModifyClassDependencyRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                NonTerminalNode node = findNonTerminalNode(request.field().codedata(), document.get());
                if (!(node instanceof ObjectFieldNode fieldNode)) {
                    return new CommonSourceResponse();
                }
                ModulePartNode modulePartNode = document.get().syntaxTree().rootNode();
                List<TextEdit> edits = ServiceClassUtil.buildUpdateInitParameterEdits(fieldNode, request.field(),
                        modulePartNode);
                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    @JsonRequest
    public CompletableFuture<CommonSourceResponse> removeClassDependency(ModifyClassDependencyRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                this.workspaceManager.loadProject(filePath);
                Optional<Document> document = this.workspaceManager.document(filePath);
                if (document.isEmpty()) {
                    return new CommonSourceResponse();
                }
                SyntaxTree syntaxTree = document.get().syntaxTree();
                TextDocument textDocument = syntaxTree.textDocument();
                NonTerminalNode node = findNonTerminalNode(request.field().codedata(), document.get());
                if (!(node instanceof ObjectFieldNode fieldNode)) {
                    return new CommonSourceResponse();
                }
                List<TextEdit> edits = ServiceClassUtil.buildRemoveInitParameterEdits(fieldNode, textDocument);
                return new CommonSourceResponse(Map.of(request.filePath(), edits));
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Get the filtered list of types for a given protocol context.
     *
     * @param request Class field modifier request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<Either<List<CompletionItem>, CompletionList>> types(TypesRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = this.workspaceManager.loadProject(filePath);
                return Either.forLeft(TypeCompletionGenerator.getTypes(project, request.context()));
            } catch (Throwable e) {
                return Either.forRight(new CompletionList());
            }
        });
    }

    /**
     * Get the initial service model which is a unification of service and listener models.
     *
     * @param request Service model request
     * @return {@link ServiceInitModelResponse} of the service init model response
     */
    @JsonRequest
    public CompletableFuture<ServiceInitModelResponse> getServiceInitModel(ServiceModelRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    throw new IllegalStateException("Failed to load the document or semantic model");
                }
                Utils.resolveModule(request.orgName(), request.pkgName(), request.moduleName(),
                        request.version(), request.isLocalRepository(), lsClientLogger);
                return new ServiceInitModelResponse(ServiceBuilderRouter.getServiceInitModel(request,
                        project, semanticModel.get(), document.get()));
            } catch (Throwable e) {
                return new ServiceInitModelResponse(e);
            }
        });
    }

    /**
     * Get the list of text edits to add a service and a listener to the given module.
     *
     * @param request Service source request
     * @return {@link CommonSourceResponse} of the common source response
     */
    @JsonRequest
    public CompletableFuture<CommonSourceResponse> addServiceAndListener(ServiceInitSourceRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Path filePath = Path.of(request.filePath());
                Project project = workspaceManager.loadProject(filePath);
                Optional<Document> document = workspaceManager.document(filePath);
                Optional<SemanticModel> semanticModel = workspaceManager.semanticModel(filePath);
                if (document.isEmpty() || semanticModel.isEmpty()) {
                    return new CommonSourceResponse();
                }
                // Save-time gate: an ERROR here means no edits are generated at all.
                List<ValidationResult> validations = SaveTimeValidator.validate(
                        request.serviceInitModel().getProperties(),
                        SaveTimeValidator.context(semanticModel.get(), project, document.get(),
                                request.serviceInitModel().getModuleName()));
                if (SaveTimeValidator.blocksGeneration(validations)) {
                    return CommonSourceResponse.validationFailure(validations);
                }
                Map<String, List<TextEdit>> textEdits = ServiceBuilderRouter.addServiceInitSource(
                        request.serviceInitModel(), semanticModel.get(), project, workspaceManager,
                        request.filePath(), document.get());
                return new CommonSourceResponse(textEdits, validations);
            } catch (Throwable e) {
                return new CommonSourceResponse(e);
            }
        });
    }

    /**
     * Validates a single form node while the user types.
     *
     * <p>Read-only and stateless: it reuses whatever the workspace manager already holds and never
     * calls {@code loadProject}, because this runs on a debounce per keystroke. If the project is
     * not loaded yet the call yields no results rather than forcing a load — the save-time gate is
     * what actually guarantees correctness, so degrading here only costs live feedback.
     *
     * @param request Validate property request
     * @return {@link ValidatePropertyResponse} carrying the failures and the echoed version
     */
    @JsonRequest
    public CompletableFuture<ValidatePropertyResponse> validateProperty(ValidatePropertyRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                if (request.property() == null) {
                    return new ValidatePropertyResponse(request.propertyPath(), request.version(), List.of());
                }
                Path filePath = Path.of(request.filePath());
                Optional<SemanticModel> semanticModel;
                Optional<Document> document;
                try {
                    semanticModel = this.workspaceManager.semanticModel(filePath);
                    document = this.workspaceManager.document(filePath);
                } catch (Throwable e) {
                    // Not loaded (or mid-reload) — no verdict, and never a hard failure.
                    return new ValidatePropertyResponse(request.propertyPath(), request.version(), List.of());
                }
                if (semanticModel.isEmpty() || document.isEmpty()) {
                    return new ValidatePropertyResponse(request.propertyPath(), request.version(), List.of());
                }

                NonTerminalNode serviceNode = null;
                if (request.codedata() != null && request.codedata().getLineRange() != null) {
                    NonTerminalNode node = findNonTerminalNode(request.codedata(), document.get());
                    serviceNode = node instanceof ServiceDeclarationNode ? node : null;
                }
                ValidationContext context = new ValidationContext(semanticModel.get(), null, document.get(),
                        request.moduleName(), serviceNode,
                        request.codedata() == null ? null : request.codedata().getLineRange());
                List<ValidationResult> results = LIVE_VALIDATION_ENGINE
                        .validateNode(request.property(), request.propertyPath(), context);
                return new ValidatePropertyResponse(request.propertyPath(), request.version(), results);
            } catch (Throwable e) {
                return new ValidatePropertyResponse(request.propertyPath(), request.version(), e);
            }
        });
    }

    /**
     * Runs the save-time gate over a handler function: its property tree plus the name node, which
     * carries its own rules for {@code nameEditable} handlers.
     */
    private static List<ValidationResult> validateFunction(Function function, ValidationContext context) {
        Map<String, Value> extraNodes = function.getName() == null ? null : Map.of("name", function.getName());
        return SaveTimeValidator.validate(function.getProperties(), context, extraNodes);
    }

    /**
     * Resolves a trigger's basic info, preferring a schema-driven {@code TriggerUISchemaModel} -- bundled in
     * this jar, or (on a miss) synthesized from the connector's own shipped
     * {@code resources/trigger-metadata.json} plus semantic-API introspection of its {@code .bala} --
     * over the legacy sqlite index derived from {@code service_artifacts.json}. This lets a
     * schema-driven trigger appear in the picker with no {@code service_artifacts.json} entry or index
     * rebuild; a trigger with neither source (e.g. HTTP, AI, TCP, GraphQL) falls through to the
     * legacy index.
     *
     * <p>Package-visible for unit testing without a full LS bootstrap.
     */
    Optional<TriggerBasicInfo> getTriggerBasicInfoByName(String orgName, String name) {
        Optional<TriggerUISchemaModel> schemaDriven = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(orgName, name);
        if (schemaDriven.isPresent()) {
            return schemaDriven.map(this::toTriggerBasicInfo);
        }

        return getTriggerBasicInfoFromLegacyIndex(orgName, name);
    }

    /** Builds {@link TriggerBasicInfo} straight from a resolved schema-driven {@link TriggerUISchemaModel}. */
    TriggerBasicInfo toTriggerBasicInfo(TriggerUISchemaModel model) {
        String protocol = getProtocol(model.moduleName());
        String label = model.displayName();
        String icon = (model.icon() == null || model.icon().isBlank())
                ? CommonUtils.generateIcon(model.orgName(), model.packageName(), model.version())
                : model.icon();
        // TriggerUISchemaModel.id is a String catalog id and is inconsistently populated across real models
        // (null / numeric / a slug), so it can't be reused as TriggerBasicInfo's int id. Nothing
        // downstream looks a trigger up by this id (the frontend only uses it as a list key, and
        // getTriggerModel's id-based lookup keys off the separate trigger_properties.json entry id),
        // so a deterministic hash of moduleName is a safe, stable substitute.
        int id = model.moduleName().hashCode();
        return new TriggerBasicInfo(id, label, model.orgName(), model.packageName(), model.moduleName(),
                model.version(), model.kind(), label, "", protocol, icon);
    }

    /** The legacy sqlite-index lookup (seeded from {@code service_artifacts.json}), reached only when
     * no bundled {@link TriggerUISchemaModel} resolves for {@code orgName}/{@code name}. */
    private Optional<TriggerBasicInfo> getTriggerBasicInfoFromLegacyIndex(String orgName, String name) {
        Optional<ServiceDeclaration> serviceDeclaration = ServiceDatabaseManager.getInstance()
                .getServiceDeclaration(orgName, name); // TODO: improve this to use a single query

        if (serviceDeclaration.isEmpty()) {
            return Optional.empty();
        }
        ServiceDeclaration serviceTemplate = serviceDeclaration.get();
        ServiceDeclaration.Package pkg = serviceTemplate.packageInfo();
        String protocol = getProtocol(name);
        String label = serviceTemplate.displayName();
        String icon = CommonUtils.generateIcon(pkg.org(), pkg.name(), pkg.version());
        TriggerBasicInfo triggerBasicInfo = new TriggerBasicInfo(pkg.packageId(),
                label, pkg.org(), pkg.name(), pkg.name(),
                pkg.version(), serviceTemplate.kind(), label, "",
                protocol, icon);

        return Optional.of(triggerBasicInfo);
    }

    /**
     * Resolves a trigger picker entry's basic info. When {@code trigger_properties.json} already
     * carries {@code version}/{@code kind} for this entry, builds {@link TriggerBasicInfo} straight from
     * those scalars (deriving the icon URL from {@code orgName}/{@code packageName}/{@code version}) --
     * no {@code TriggerUISchemaModel} is parsed or cached just to render a list row. Only an entry
     * missing those fields (a legacy trigger with no schema-driven model, e.g. HTTP, or one not yet
     * backfilled) falls back to the fuller {@link #getTriggerBasicInfoByName(String, String)} chain.
     *
     * <p>Package-visible for unit testing without a full LS bootstrap.
     */
    Optional<TriggerBasicInfo> getTriggerBasicInfoByName(TriggerProperty triggerProperty) {
        if (triggerProperty.version() != null && triggerProperty.kind() != null) {
            return Optional.of(toTriggerBasicInfo(triggerProperty));
        }

        if (triggerProperty.triggerName() == null) {
            return getTriggerBasicInfoByName(triggerProperty.orgName(), triggerProperty.name());
        }

        return getTriggerBasicInfoByName(triggerProperty.orgName(), triggerProperty.name())
                .map(original -> new TriggerBasicInfo(original.id(), triggerProperty.triggerName(), original.orgName(),
                        original.packageName(), original.moduleName(), original.version(), original.type(),
                        original.displayName(), original.documentation(), original.listenerProtocol(),
                        original.icon()));
    }

    /** Builds {@link TriggerBasicInfo} straight from a self-describing {@link TriggerProperty} entry. */
    private TriggerBasicInfo toTriggerBasicInfo(TriggerProperty triggerProperty) {
        String label = triggerProperty.triggerName() != null ? triggerProperty.triggerName() : triggerProperty.name();
        String protocol = getProtocol(triggerProperty.name());
        int id = triggerProperty.name().hashCode();
        String icon = CommonUtils.generateIcon(triggerProperty.orgName(), triggerProperty.packageName(),
                triggerProperty.version());
        return new TriggerBasicInfo(id, label, triggerProperty.orgName(), triggerProperty.packageName(),
                triggerProperty.name(), triggerProperty.version(), triggerProperty.kind(), label, "",
                protocol, icon);
    }
}
