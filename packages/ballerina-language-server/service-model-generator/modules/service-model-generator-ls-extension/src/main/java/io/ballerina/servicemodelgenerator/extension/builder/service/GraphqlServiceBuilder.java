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
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.openapi.core.generators.common.exception.BallerinaOpenApiException;
import io.ballerina.servicemodelgenerator.extension.builder.ServiceBuilderRouter;
import io.ballerina.servicemodelgenerator.extension.core.GraphqlServiceGenerator;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.Constants;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.builder.FunctionBuilderRouter.getFunctionFromSource;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_CONFIGURE_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.GRAPHQL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROPERTY_DESIGN_APPROACH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_READONLY_METADATA_KEY;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.extractServicePathInfo;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getFunctionFromServiceTypeFunction;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getReadonlyMetadata;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getServiceTypeIdentifier;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.updateFunction;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.updateListenerItems;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.applyEnabledChoiceProperty;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.isPresent;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateListenerInfo;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateAnnotationAttachmentProperty;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateServiceDocs;

/**
 * Builder class for GraphQL service.
 *
 * @since 1.2.0
 */
public class GraphqlServiceBuilder extends AbstractServiceBuilder {

    private static final String GRAPHQL_SERVICE_MODEL_LOCATION = "services/graphql.json";
    private static final String LISTENER_VAR_NAME = "listenerVarName";
    private static final String DEFAULT_LISTENER_NAME = "graphqlListener";
    private static final String DEFAULT_SERVICE_PATH = "/graphql";
    private static final String DEFAULT_PORT = "8080";
    private static final String PORT = "port";

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        InputStream resourceStream = GraphqlServiceBuilder.class.getClassLoader()
                .getResourceAsStream(GRAPHQL_SERVICE_MODEL_LOCATION);
        if (resourceStream == null) {
            return null;
        }

        try (JsonReader reader = new JsonReader(new InputStreamReader(resourceStream, StandardCharsets.UTF_8))) {
            ServiceInitModel serviceInitModel = new Gson().fromJson(reader, ServiceInitModel.class);
            Value listenerNameProp = listenerNameProperty(context);
            serviceInitModel.getProperties().get(KEY_LISTENER_VAR_NAME).setValue(listenerNameProp.getValue());
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

        StringBuilder listenerDeclaration = new StringBuilder("listener graphql:Listener ");
        String listenerVarName = Objects.nonNull(properties.get(LISTENER_VAR_NAME)) ?
                properties.get(LISTENER_VAR_NAME).getValue() : DEFAULT_LISTENER_NAME;
        String port = DEFAULT_PORT;
        if (Objects.nonNull(properties.get(PORT))) {
            port = properties.get(PORT).getValue();
        }
        listenerDeclaration.append(listenerVarName).append(" = new (")
                .append(port).append(");");
        if (Objects.nonNull(serviceInitModel.getGraphqlSchema())) {
            return new GraphqlServiceGenerator(context.project().sourceRoot(), context.workspaceManager())
                    .generateService(serviceInitModel, DEFAULT_SERVICE_PATH, listenerVarName,
                            listenerDeclaration.toString());
        }

        ModulePartNode modulePartNode = context.document().syntaxTree().rootNode();

        String basePath = properties.get(BASE_PATH).getValue();
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
    public Service getModelFromSource(ModelFromSourceContext context) {
        if (Objects.isNull(context.moduleName())) {
            return null;
        }
        String serviceType = getServiceTypeIdentifier(context.serviceType());
        Optional<Service> service = ServiceBuilderRouter.getModelTemplate(context.orgName(), context.moduleName());
        if (service.isEmpty()) {
            return null;
        }
        Service serviceModel = service.get();
        int packageId = Integer.parseInt(serviceModel.getId());
        ServiceDatabaseManager.getInstance().getMatchingServiceTypeFunctions(packageId, serviceType)
                .forEach(function -> serviceModel.getFunctions().add(getFunctionFromServiceTypeFunction(function)));
        serviceModel.getServiceType().setValue(serviceType);

        ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) context.node();
        extractServicePathInfo(serviceNode, serviceModel);
        List<Function> functionsInSource = serviceNode.members().stream()
                .filter(member -> member instanceof FunctionDefinitionNode)
                .map(member -> getFunctionFromSource(context.moduleName(), context.semanticModel(), member))
                .toList();

        updateGraphqlServiceInfo(serviceModel, functionsInSource);
        serviceModel.setCodedata(new Codedata(serviceNode.lineRange(), serviceModel.getModuleName(),
                serviceModel.getOrgName()));
        populateListenerInfo(serviceModel, serviceNode);
        updateServiceDocs(serviceNode, serviceModel);
        updateAnnotationAttachmentProperty(serviceNode, serviceModel);
        updateListenerItems(context.moduleName(), context.semanticModel(), context.project(), serviceModel);

        // Initialize readOnly metadata if not present in template (GraphqlServiceBuilder uses custom template)
        if (serviceModel.getProperty(PROP_READONLY_METADATA_KEY) == null) {
            String modelServiceType = serviceModel.getType();
            Value readOnlyMetadata = getReadonlyMetadata(serviceModel.getOrgName(), serviceModel.getPackageName(),
                    modelServiceType);
            serviceModel.getProperties().put(PROP_READONLY_METADATA_KEY, readOnlyMetadata);
        }

        // Add readOnly metadata extraction (same logic as parent class)
        updateReadOnlyMetadataWithAnnotations(serviceModel, serviceNode, context);

        return serviceModel;
    }

    @Override
    public String kind() {
        return GRAPHQL;
    }

    public static void updateGraphqlServiceInfo(Service serviceModel, List<Function> functionsInSource) {
        Utils.populateRequiredFunctions(serviceModel);

        // mark the enabled functions as true if they present in the source
        serviceModel.getFunctions().forEach(functionModel -> {
            Optional<Function> function = functionsInSource.stream()
                    .filter(newFunction -> isPresent(functionModel, newFunction)
                            && newFunction.getKind().equals(functionModel.getKind()))
                    .findFirst();
            functionModel.setEditable(false);
            function.ifPresentOrElse(
                    func -> updateFunction(functionModel, func, serviceModel),
                    () -> functionModel.setEnabled(false));
        });

        functionsInSource.forEach(funcInSource -> {
            if (serviceModel.getFunctions().stream().noneMatch(newFunction -> isPresent(funcInSource, newFunction))) {
                updateGraphqlFunctionMetaData(funcInSource);
                serviceModel.addFunction(funcInSource);
                funcInSource.setOptional(true);
            }
        });
    }

    public static void updateGraphqlFunctionMetaData(Function function) {
        switch (function.getKind()) {
            case Constants.KIND_QUERY -> {
                function.setMetadata(new MetaData("Graphql Query", "Graphql Query"));
                function.getName().setMetadata(new MetaData("Field Name", "The name of the field"));
            }
            case Constants.KIND_MUTATION -> {
                function.setMetadata(new MetaData("Graphql Mutation", "Graphql Mutation"));
                function.getName().setMetadata(new MetaData("Mutation Name", "The name of the mutation"));
            }
            case Constants.KIND_SUBSCRIPTION -> {
                function.setMetadata(new MetaData("Graphql Subscription", "Graphql Subscription"));
                function.getName().setMetadata(
                        new MetaData("Subscription Name", "The name of the subscription"));
            }
            default -> { }
        }
    }
}
