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

package io.ballerina.servicemodelgenerator.extension.builder;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.servicemodelgenerator.extension.builder.service.AiChatServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.service.DefaultServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.service.GraphqlServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.service.HttpServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.service.SchemaDrivenServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.builder.service.TCPServiceBuilder;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.ServiceMetadata;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModelRequest;
import io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils;
import org.ballerinalang.langserver.commons.workspace.WorkspaceManager;
import org.eclipse.lsp4j.TextEdit;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.AI;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TCP;

/**
 * ServiceBuilderRouter is responsible for routing service building requests to the appropriate service builder
 * based on the protocol type.
 *
 * @since 1.2.0
 */
public class ServiceBuilderRouter {
    private static final Map<String, Supplier<? extends ServiceNodeBuilder>> CONSTRUCTOR_MAP = new HashMap<>() {{
        put(HTTP, HttpServiceBuilder::new);
        put(AI, AiChatServiceBuilder::new);
        put(TCP, TCPServiceBuilder::new);
        put(GRAPHQL, GraphqlServiceBuilder::new);
    }};

    /** Protocols with dedicated, mature builders that must never fall through to the schema-driven
     * path, regardless of what {@link TriggerModelReader} resolves for them now or in the future. */
    private static final Set<String> NEVER_SCHEMA_DRIVEN = Set.of(HTTP, GRAPHQL, TCP, AI);

    public static ServiceNodeBuilder getServiceBuilder(String protocol) {
        return CONSTRUCTOR_MAP.getOrDefault(protocol, DefaultServiceBuilder::new).get();
    }

    /**
     * Returns {@code true} when the connector's schema is bundled as a classpath resource in this jar,
     * or -- on a miss, when {@code orgName} is known -- synthesizable from the connector's own shipped
     * {@code resources/trigger-authoring.json} plus semantic-API introspection of its {@code .bala}
     * (see {@link TriggerModelReader#getSchemaDrivenTriggerModel}). The hardcoded builder still wins
     * whenever neither source has a model, so an unrecognized connector's behavior is unchanged.
     * {@link #NEVER_SCHEMA_DRIVEN} short-circuits this to {@code false} unconditionally.
     */
    private static boolean useSchemaDrivenPath(String orgName, String moduleName) {
        return useSchemaDrivenPath(orgName, moduleName, null, false);
    }

    /** {@code isLocalRepository} variant, checking the Ballerina local repository instead. */
    private static boolean useSchemaDrivenPath(String orgName, String moduleName, String version,
                                               boolean isLocalRepository) {
        return !NEVER_SCHEMA_DRIVEN.contains(moduleName) && TriggerModelReader.getInstance()
                .hasSchemaDrivenModel(orgName, moduleName, version, isLocalRepository);
    }

    public static Optional<Service> getModelTemplate(String orgName, String moduleName) {
        NodeBuilder<?> serviceBuilder = useSchemaDrivenPath(orgName, moduleName)
                ? new SchemaDrivenServiceBuilder()
                : getServiceBuilder(moduleName);
        GetModelContext context = GetModelContext.fromOrgAndModule(orgName, moduleName);
        Optional<?> modelTemplate = serviceBuilder.getModelTemplate(context);
        if (modelTemplate.isEmpty() || !(modelTemplate.get() instanceof Service)) {
            return Optional.empty();
        }
        return Optional.of((Service) modelTemplate.get());
    }

    public static Service getServiceFromSource(Node node, Project project,
                                               SemanticModel semanticModel,
                                               WorkspaceManager workspaceManager, String filePath) {
        ServiceMetadata serviceMetadata = ServiceModelUtils.deriveServiceType(
                (ServiceDeclarationNode) node, semanticModel);
        if (Objects.isNull(serviceMetadata.moduleId())) {
            return null;
        }
        ModuleID moduleID = serviceMetadata.moduleId();

        NodeBuilder<Service> serviceBuilder = useSchemaDrivenPath(moduleID.orgName(), moduleID.moduleName())
                        ? new SchemaDrivenServiceBuilder()
                        : getServiceBuilder(moduleID.moduleName());
        ModelFromSourceContext context = new ModelFromSourceContext(node, project, semanticModel,
                workspaceManager, filePath, serviceMetadata.serviceType(), moduleID.orgName(),
                moduleID.packageName(), moduleID.moduleName(), moduleID.version());
        Service service = serviceBuilder.getModelFromSource(context);
        if (service != null) {
            service.getProperties().forEach((k, v) -> v.setAdvanced(false));
        }
        return service;
    }

    public static Map<String, List<TextEdit>> addService(Service service,
                                                         SemanticModel semanticModel, Project project,
                                                         WorkspaceManager workspaceManager,
                                                         String filePath, Document document) throws Exception {
        NodeBuilder<Service> serviceBuilder = useSchemaDrivenPath(service.getOrgName(), service.getModuleName())
                        ? new SchemaDrivenServiceBuilder()
                        : getServiceBuilder(service.getModuleName());
        AddModelContext context = new AddModelContext(service, null, semanticModel, project,
                workspaceManager, filePath, document, null);
        return serviceBuilder.addModel(context);
    }

    public static Map<String, List<TextEdit>> updateService(Service service,
                                                            SemanticModel semanticModel,
                                                            WorkspaceManager workspaceManager,
                                                            String filePath, Document document,
                                                            ServiceDeclarationNode serviceNode) throws Exception {
        NodeBuilder<?> serviceBuilder = useSchemaDrivenPath(service.getOrgName(), service.getModuleName())
                        ? new SchemaDrivenServiceBuilder()
                        : getServiceBuilder(service.getModuleName());
        UpdateModelContext context = new UpdateModelContext(service, null, semanticModel, null,
                workspaceManager, filePath, document, serviceNode, null);
        return serviceBuilder.updateModel(context);
    }

    public static ServiceInitModel getServiceInitModel(ServiceModelRequest request, Project project,
                                                       SemanticModel semanticModel, Document document) {
        GetServiceInitModelContext context = new GetServiceInitModelContext(
                request.orgName(), request.pkgName(), request.moduleName(), request.version(),
                project, semanticModel, document, request.isLocalRepository());
        ServiceNodeBuilder serviceBuilder =
                useSchemaDrivenPath(request.orgName(), request.moduleName(), request.version(),
                        request.isLocalRepository())
                        ? new SchemaDrivenServiceBuilder()
                        : getServiceBuilder(request.moduleName());
        return serviceBuilder.getServiceInitModel(context);
    }

    public static Map<String, List<TextEdit>> addServiceInitSource(ServiceInitModel serviceInitModel,
                                                                   SemanticModel semanticModel,
                                                                   Project project, WorkspaceManager workspaceManager,
                                                                   String filePath,
                                                                   Document document)
            throws Exception {
        AddServiceInitModelContext context = new AddServiceInitModelContext(serviceInitModel, semanticModel, project,
                workspaceManager, filePath, document);
        ServiceNodeBuilder serviceBuilder = useSchemaDrivenPath(
                        serviceInitModel.getOrgName(), serviceInitModel.getModuleName(),
                        serviceInitModel.getVersion(), serviceInitModel.isLocalRepository())
                        ? new SchemaDrivenServiceBuilder()
                        : getServiceBuilder(serviceInitModel.getModuleName());
        return serviceBuilder.addServiceInitSource(context);
    }
}
