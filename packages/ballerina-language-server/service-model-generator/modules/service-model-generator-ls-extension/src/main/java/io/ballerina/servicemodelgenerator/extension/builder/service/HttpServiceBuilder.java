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

package io.ballerina.servicemodelgenerator.extension.builder.service;

import com.google.gson.Gson;
import com.google.gson.stream.JsonReader;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.openapi.core.generators.common.exception.BallerinaOpenApiException;
import io.ballerina.projects.Document;
import io.ballerina.servicemodelgenerator.extension.core.OpenApiServiceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.compiler.syntax.tree.SyntaxKind.OBJECT_TYPE_DESC;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_CONFIGURE_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.HTTP;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROPERTY_DESIGN_APPROACH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_READONLY_METADATA_KEY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.HttpUtil.updateHttpServiceContractModel;
import static io.ballerina.servicemodelgenerator.extension.util.HttpUtil.updateHttpServiceModel;
import static io.ballerina.servicemodelgenerator.extension.util.ListenerUtil.getDefaultListenerDeclarationStmt;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getReadonlyMetadata;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.populateRequiredFunctionsForServiceType;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.updateListenerItems;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.FunctionAddContext.HTTP_SERVICE_ADD;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.applyEnabledChoiceProperty;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getHttpServiceContractSym;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getImportStmt;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateDesignApproach;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateRequiredFuncsDesignApproachAndServiceType;

/**
 * Builder class for HTTP service.
 *
 * @since 1.2.0
 */
public final class HttpServiceBuilder extends AbstractServiceBuilder {

    private static final String HTTP_SERVICE_MODEL_LOCATION = "services/http.json";
    private static final String NEW_HTTP_SERVICE_MODEL_LOCATION = "services/http_new.json";

    public HttpServiceBuilder() {
    }

    @Override
    public Optional<Service> getModelTemplate(GetModelContext context) {
        InputStream resourceStream = HttpServiceBuilder.class.getClassLoader()
                .getResourceAsStream(HTTP_SERVICE_MODEL_LOCATION);
        if (resourceStream == null) {
            return Optional.empty();
        }

        try (JsonReader reader = new JsonReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8))) {
            Service service = new Gson().fromJson(reader, Service.class);
            return Optional.of(service);
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        InputStream resourceStream = HttpServiceBuilder.class.getClassLoader()
                .getResourceAsStream(NEW_HTTP_SERVICE_MODEL_LOCATION);
        if (resourceStream == null) {
            return null;
        }

        try (JsonReader reader = new JsonReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8))) {
            ServiceInitModel serviceInitModel = new Gson().fromJson(reader, ServiceInitModel.class);
            Value listenerNameProp = listenerNameProperty(context);
            Value listener = serviceInitModel.getProperties().get(KEY_CONFIGURE_LISTENER);
            listener.getChoices().get(1).getProperties().get(KEY_LISTENER_VAR_NAME)
                    .setValue(listenerNameProp.getValue());
            return serviceInitModel;
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context)
            throws WorkspaceDocumentException, FormatterException, IOException, BallerinaOpenApiException,
            EventSyncException {
        ServiceInitModel serviceInitModel = context.serviceInitModel();
        applyEnabledChoiceProperty(serviceInitModel, PROPERTY_DESIGN_APPROACH);
        applyEnabledChoiceProperty(serviceInitModel, KEY_CONFIGURE_LISTENER);

        Map<String, Value> properties = serviceInitModel.getProperties();

        StringBuilder listenerDeclaration = new StringBuilder("listener http:Listener ");
        String listenerVarName;
        if (Objects.nonNull(properties.get("port")) && Objects.nonNull(properties.get("listenerVarName"))) {
            listenerVarName = properties.get("listenerVarName").getValue();
            listenerDeclaration.append(listenerVarName).append(" = ").append("new (")
                    .append(properties.get("port").getValue()).append(");");
        } else {
            listenerVarName = Utils.generateVariableIdentifier(context.semanticModel(), context.document(),
                    context.document().syntaxTree().rootNode().lineRange().endLine(), "httpDefaultListener");
            listenerDeclaration.append(listenerVarName).append(" = ").append("http:getDefaultListener();");
        }

        if (Objects.nonNull(serviceInitModel.getOpenAPISpec())) {
            return new OpenApiServiceGenerator(Path.of(serviceInitModel.getOpenAPISpec().getValue()),
                    context.project().sourceRoot(), context.workspaceManager())
                    .generateService(serviceInitModel, listenerVarName, listenerDeclaration.toString());
        }

        ModulePartNode modulePartNode = context.document().syntaxTree().rootNode();

        String basePath = properties.get("basePath").getValue();
        StringBuilder builder = new StringBuilder(NEW_LINE)
                .append(listenerDeclaration)
                .append(NEW_LINE)
                .append(SERVICE).append(SPACE).append(basePath)
                .append(SPACE).append(ON).append(SPACE).append(listenerVarName).append(SPACE).append(OPEN_BRACE)
                .append(NEW_LINE)
                .append(CLOSE_BRACE).append(NEW_LINE);

        List<TextEdit> edits = new ArrayList<>();
        Utils.getServiceInitImportEdit(modulePartNode, serviceInitModel).ifPresent(edits::add);
        edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), builder.toString()));

        return Map.of(context.filePath(), edits);
    }

    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        ListenerUtil.DefaultListener defaultListener = ListenerUtil.getDefaultListener(context);
        populateDesignApproach(context.service());
        if (Objects.nonNull(context.service().getOpenAPISpec())) {
            return new OpenApiServiceGenerator(Path.of(context.service().getOpenAPISpec().getValue()),
                    context.project().sourceRoot(), context.workspaceManager())
                    .generateService(context.service(), defaultListener);
        }
        List<TextEdit> edits = new ArrayList<>();
        if (Objects.nonNull(defaultListener)) {
            String stmt = getDefaultListenerDeclarationStmt(defaultListener);
            edits.add(new TextEdit(Utils.toRange(defaultListener.linePosition()), stmt));
        }

        Service service = context.service();
        populateRequiredFuncsDesignApproachAndServiceType(service);
        populateRequiredFunctionsForServiceType(service);

        Map<String, String> imports = new HashMap<>();
        StringBuilder serviceBuilder = new StringBuilder(NEW_LINE);
        buildServiceNodeStr(service, serviceBuilder);
        List<String> functionsStr = buildMethodDefinitions(service.getFunctions(), HTTP_SERVICE_ADD, imports);
        buildServiceNodeBody(functionsStr, serviceBuilder);

        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().endLine()), serviceBuilder.toString()));

        Set<String> importStmts = new HashSet<>();
        if (!importExists(rootNode, service.getOrgName(), service.getModuleName())) {
            importStmts.add(Utils.getImportStmt(service.getOrgName(), service.getModuleName()));
        }
        imports.values().forEach(moduleId -> {
            String[] importParts = moduleId.split("/");
            String orgName = importParts[0];
            String moduleName = importParts[1].split(":")[0];
            if (!importExists(rootNode, orgName, moduleName)) {
                importStmts.add(getImportStmt(orgName, moduleName));
            }
        });
        importStmts.addAll(Utils.getMissingPropertyImportStmts(rootNode, service.getProperties()));

        if (!importStmts.isEmpty()) {
            String importsStmts = String.join(NEW_LINE, importStmts);
            edits.addFirst(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), importsStmts));
        }

        return Map.of(context.filePath(), edits);
    }

    @Override
    public Service getModelFromSource(ModelFromSourceContext context) {
        Optional<Service> service = getModelTemplate(GetModelContext.fromServiceAndFunctionType(BALLERINA, HTTP));
        if (service.isEmpty()) {
            return null;
        }
        Service serviceModel = service.get();
        serviceModel.setFunctions(new ArrayList<>());
        boolean serviceContractExists = false;
        ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) context.node();
        SemanticModel semanticModel = context.semanticModel();
        if (serviceNode.typeDescriptor().isPresent()) {
            Optional<Symbol> httpServiceContractSym = getHttpServiceContractSym(semanticModel,
                    serviceNode.typeDescriptor().get());
            if (httpServiceContractSym.isPresent() && httpServiceContractSym.get().getLocation().isPresent()) {
                Path contractPath = context.project().sourceRoot().toAbsolutePath()
                        .resolve(httpServiceContractSym.get().getLocation().get().lineRange().fileName());
                Optional<Document> contractDoc = context.workspaceManager().document(contractPath);
                if (contractDoc.isPresent()) {
                    ModulePartNode contractModulePartNode = contractDoc.get().syntaxTree().rootNode();
                    Optional<TypeDefinitionNode> serviceContractType = contractModulePartNode.members().stream()
                            .filter(member -> member.kind().equals(SyntaxKind.TYPE_DEFINITION))
                            .map(member -> ((TypeDefinitionNode) member))
                            .filter(member -> member.typeDescriptor().kind().equals(OBJECT_TYPE_DESC))
                            .findFirst();
                    if (serviceContractType.isPresent()) {
                        serviceContractExists = true;
                        updateHttpServiceContractModel(serviceModel, serviceContractType.get(), serviceNode);
                    }
                }
            }
        }

        if (!serviceContractExists) {
            updateHttpServiceModel(serviceModel, serviceNode);
        }

        updateListenerItems(HTTP, semanticModel, context.project(), serviceModel);

        // Initialize readOnly metadata if not present in template (HttpServiceBuilder uses custom template)
        if (serviceModel.getProperty(PROP_READONLY_METADATA_KEY) == null) {
            String serviceType = serviceModel.getType();
            Value readOnlyMetadata = getReadonlyMetadata(serviceModel.getOrgName(), serviceModel.getPackageName(),
                    serviceType);
            serviceModel.getProperties().put(PROP_READONLY_METADATA_KEY, readOnlyMetadata);
        }

        // Add readOnly metadata extraction (same logic as parent class)
        updateReadOnlyMetadataWithAnnotations(serviceModel, serviceNode, context);

        return serviceModel;
    }

    @Override
    public String kind() {
        return HTTP;
    }
}
