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

import io.ballerina.compiler.api.symbols.AnnotationAttachPoint;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.AnnotationAttachment;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ServiceDatabaseManager;
import io.ballerina.modelgenerator.commons.ServiceDeclaration;
import io.ballerina.modelgenerator.commons.ServiceInitInfo;
import io.ballerina.modelgenerator.commons.ServiceInitProperty;
import io.ballerina.openapi.core.generators.common.exception.BallerinaOpenApiException;
import io.ballerina.servicemodelgenerator.extension.builder.ServiceBuilderRouter;
import io.ballerina.servicemodelgenerator.extension.builder.ServiceNodeBuilder;
import io.ballerina.servicemodelgenerator.extension.extractor.CustomExtractor;
import io.ballerina.servicemodelgenerator.extension.extractor.ReadOnlyMetadataManager;
import io.ballerina.servicemodelgenerator.extension.model.Codedata;
import io.ballerina.servicemodelgenerator.extension.model.Function;
import io.ballerina.servicemodelgenerator.extension.model.MetaData;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.model.context.UpdateModelContext;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.ServiceClassUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.formatter.core.FormatterException;
import org.ballerinalang.langserver.commons.eventsync.exceptions.EventSyncException;
import org.ballerinalang.langserver.commons.workspace.WorkspaceDocumentException;
import org.eclipse.lsp4j.TextEdit;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.model.PropertyType.deserializeTypes;
import static io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel.KEY_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ANNOT_PREFIX;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_PARAM_REQUIRED;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ARG_TYPE_LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.CLOSE_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.LISTENER_VAR_NAME;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE_WITH_TAB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.ON;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.OPEN_BRACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_SERVICE_TYPE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_STRING_LITERAL;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_READONLY_METADATA_KEY;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SERVICE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.SPACE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TAB;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;
import static io.ballerina.servicemodelgenerator.extension.util.ListenerUtil.getDefaultListenerDeclarationStmt;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.createFallbackServiceModel;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.extractFunctionsFromSource;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.extractServicePathInfo;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getAnnotationAttachmentProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getBasePathProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getFunctionFromServiceTypeFunction;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getListenersProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getProtocol;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getReadonlyMetadata;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getRequiredFunctionsForServiceType;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getServiceDocumentation;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getServiceTypeIdentifier;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getStringLiteral;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getTypeDescriptorProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.populateRequiredFunctionsForServiceType;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.updateListenerItems;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.updateServiceInfoNew;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.FunctionAddContext.TRIGGER_ADD;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.FunctionSignatureContext.FUNCTION_ADD;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.addServiceAnnotationTextEdits;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.addServiceDocTextEdits;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.generateFunctionDefSource;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getAnnotationEdits;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getDocumentationEdits;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getImportStmt;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getListenerExpressionsLineRange;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getPath;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.getValueString;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateListenerInfo;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.populateRequiredFuncsDesignApproachAndServiceType;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateAnnotationAttachmentProperty;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.updateServiceDocs;

/**
 * Abstract class for building service models.
 *
 * @since 1.2.0
 */
public abstract class AbstractServiceBuilder implements ServiceNodeBuilder {

    static Map<String, List<TextEdit>> getServiceDeclarationEdits(AddServiceInitModelContext context,
                                                                  ListenerDTO result) {
        ServiceInitModel serviceInitModel = context.serviceInitModel();
        ModulePartNode modulePartNode = context.document().syntaxTree().rootNode();
        List<Function> functions = getRequiredFunctionsForServiceType(serviceInitModel);
        List<String> functionsStr = buildMethodDefinitions(functions, TRIGGER_ADD, new HashMap<>());

        StringBuilder builder = new StringBuilder(NEW_LINE)
                .append(result.listenerDeclaration())
                .append(NEW_LINE)
                .append(SERVICE).append(SPACE).append(serviceInitModel.getBasePath(result.listenerProtocol()))
                .append(SPACE).append(ON).append(SPACE).append(result.listenerVarName()).append(SPACE)
                .append(OPEN_BRACE)
                .append(NEW_LINE)
                .append(String.join(TWO_NEW_LINES, functionsStr)).append(NEW_LINE)
                .append(CLOSE_BRACE).append(NEW_LINE);

        List<TextEdit> edits = new ArrayList<>();
        if (!importExists(modulePartNode, serviceInitModel.getOrgName(), serviceInitModel.getModuleName())) {
            String importText = getImportStmt(serviceInitModel.getOrgName(), serviceInitModel.getModuleName());
            edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().startLine()), importText));
        }
        edits.add(new TextEdit(Utils.toRange(modulePartNode.lineRange().endLine()), builder.toString()));

        return Map.of(context.filePath(), edits);
    }

    protected static ListenerDTO buildListenerDTO(AddServiceInitModelContext context) {
        return buildListenerDTO(context, "Listener");
    }

    protected static ListenerDTO buildListenerDTO(AddServiceInitModelContext context, String listenerClassName) {
        ServiceInitModel serviceInitModel = context.serviceInitModel();
        Map<String, Value> properties = serviceInitModel.getProperties();
        List<String> requiredParams = new ArrayList<>();
        List<String> includedParams = new ArrayList<>();
        List<String> lnConfigParams = new ArrayList<>();
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value value = entry.getValue();
            if (value.getCodedata() == null) {
                continue;
            }
            Codedata codedata = value.getCodedata();
            String argType = codedata.getArgType();
            if (Objects.isNull(argType) || argType.isEmpty()) {
                continue;
            }
            if (argType.equals(ARG_TYPE_LISTENER_PARAM_REQUIRED)) {
                requiredParams.add(value.getValue());
            } else if (argType.equals(ARG_TYPE_LISTENER_PARAM_INCLUDED_FIELD)
                    || argType.equals(ARG_TYPE_LISTENER_PARAM_INCLUDED_DEFAULTABLE_FIELD)) {
                includedParams.add(entry.getKey() + " = " + value.getValue());
            } else if (argType.equals(ARG_TYPE_LISTENER_PARAM_CONFIG_FIELD)) {
                lnConfigParams.add(String.format("%s: %s", entry.getKey(), value.getValue()));
            }
        }
        String listenerProtocol = getProtocol(serviceInitModel.getModuleName());
        String listenerVarName = properties.get(KEY_LISTENER_VAR_NAME).getValue();
        if (!lnConfigParams.isEmpty()) {
            String configParams = String.format("{%s}", String.join(", ", lnConfigParams));
            requiredParams.add(configParams);
        }
        requiredParams.addAll(includedParams);
        String args = String.join(", ", requiredParams);
        String listenerDeclaration = String.format("listener %s:%s %s = new (%s);",
                listenerProtocol, listenerClassName, listenerVarName, args);
        return new ListenerDTO(listenerProtocol, listenerVarName, listenerDeclaration);
    }

    /**
     * Builds the service node string representation.
     * `service <serviceType> <serviceContractTypeName>|<basePath>|<stringLiteral> on <listener> {`
     *
     * @param service the service model
     * @param builder the StringBuilder to append the service node string
     */
    static void buildServiceNodeStr(Service service, StringBuilder builder) {
        String docEdits = getDocumentationEdits(service);
        if (!docEdits.isEmpty()) {
            builder.append(docEdits).append(NEW_LINE);
        }

        List<String> annotationEdits = getAnnotationEdits(service);
        if (!annotationEdits.isEmpty()) {
            builder.append(String.join(NEW_LINE, annotationEdits)).append(NEW_LINE);
        }

        builder.append(SERVICE).append(SPACE);
        if (Objects.nonNull(service.getServiceType()) && service.getServiceType().isEnabledWithValue()) {
            builder.append(service.getServiceTypeName()).append(SPACE);
        }
        Value serviceContract = service.getServiceContractTypeNameValue();
        Value serviceBasePath = service.getBasePath();
        Value stringLiteralProperty = service.getStringLiteralProperty();
        if (Objects.nonNull(serviceContract) && serviceContract.isEnabledWithValue()) {
            builder.append(service.getServiceContractTypeName()).append(SPACE);
        } else if (Objects.nonNull(serviceBasePath) && serviceBasePath.isEnabledWithValue()) {
            builder.append(getValueString(serviceBasePath)).append(SPACE);
        } else if (Objects.nonNull(stringLiteralProperty) && stringLiteralProperty.isEnabledWithValue()) {
            builder.append(getValueString(stringLiteralProperty)).append(SPACE);
        }

        builder.append(ON).append(SPACE);
        if (Objects.nonNull(service.getListener()) && service.getListener().isEnabledWithValue()) {
            builder.append(service.getListener().getValue());
        }
        builder.append(SPACE).append(OPEN_BRACE).append(NEW_LINE);
    }

    /**
     * Return a list of required method definitions for the service.
     *
     * @param serviceFunctions the list of functions in the service model
     * @param context          the function-add context
     * @param imports          a map of imports to be used in the function definitions
     * @return a list of method definitions as strings
     */
    static List<String> buildMethodDefinitions(List<Function> serviceFunctions, Utils.FunctionAddContext context,
                                               Map<String, String> imports) {
        List<String> functions = new ArrayList<>();
        serviceFunctions.forEach(function -> {
            if (function.isEnabled()) {
                String functionNode = TAB;
                functionNode += generateFunctionDefSource(function, new ArrayList<>(), context, FUNCTION_ADD, imports)
                        .replace(NEW_LINE, NEW_LINE_WITH_TAB);
                functions.add(functionNode);
            }
        });
        return functions;
    }

    /**
     * Append the function definitions to the service node body and close the service node with a brace.
     *
     * @param functions the list of function definitions
     * @param builder   the StringBuilder to append the service node body
     */
    static void buildServiceNodeBody(List<String> functions, StringBuilder builder) {
        builder.append(String.join(TWO_NEW_LINES, functions)).append(NEW_LINE).append(CLOSE_BRACE);
    }

    protected static Value listenerNameProperty(GetServiceInitModelContext context) {

        String listenerName = Utils.generateVariableIdentifier(context.semanticModel(), context.document(),
                context.document().syntaxTree().rootNode().lineRange().endLine(),
                LISTENER_VAR_NAME.formatted(getProtocol(context.moduleName())));

        Value.ValueBuilder valueBuilder = new Value.ValueBuilder();
        valueBuilder
                .setMetadata(new MetaData("Listener Name", "Provide a name for the listener being created"))
                .setCodedata(new Codedata(ARG_TYPE_LISTENER_VAR_NAME))
                .value(listenerName)
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .editable(true)
                .enabled(true)
                .optional(false)
                .setAdvanced(true);

        return valueBuilder.build();
    }

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        Optional<ServiceInitInfo> serviceInitInfo = ServiceDatabaseManager.getInstance()
                .getServiceInitInfo(context.orgName(), context.moduleName());
        if (serviceInitInfo.isEmpty()) {
            return null;
        }
        ServiceInitInfo initInfo = serviceInitInfo.get();
        ServiceDeclaration.Package pkg = initInfo.packageInfo();

        ServiceInitModel serviceInitModel = new ServiceInitModel.Builder()
                .setId(String.valueOf(pkg.packageId()))
                .setDisplayName(initInfo.displayName())
                .setDescription(initInfo.description())
                .setOrgName(pkg.org())
                .setVersion(pkg.version())
                .setPackageName(pkg.name())
                .setModuleName(context.moduleName())
                .setType(context.moduleName())
                .setIcon(CommonUtils.generateIcon(pkg.org(), pkg.name(), pkg.version()))
                .build();

        for (ServiceInitProperty property : initInfo.properties()) {
            Codedata.Builder codedataBuilder = new Codedata.Builder()
                    .setArgType(property.sourceKind());

            Value.ValueBuilder builder = new Value.ValueBuilder()
                    .metadata(property.label(), property.description())
                    .setCodedata(codedataBuilder.build())
                    .value(property.defaultValue())
                    .setPlaceholder(property.placeholder())
                    .types(deserializeTypes(property.types()))
                    .enabled(true)
                    .editable(true);
            serviceInitModel.addProperty(property.keyName(), builder.build());
        }

        serviceInitModel.addProperty(KEY_LISTENER_VAR_NAME, listenerNameProperty(context));
        return serviceInitModel;
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context)
            throws WorkspaceDocumentException, FormatterException, IOException, BallerinaOpenApiException,
            EventSyncException {
        return getServiceDeclarationEdits(context, buildListenerDTO(context));
    }

    @Override
    public Optional<Service> getModelTemplate(GetModelContext context) {
        Optional<ServiceDeclaration> serviceDeclaration = ServiceDatabaseManager.getInstance()
                .getServiceDeclaration(context.orgName(), context.moduleName());
        if (serviceDeclaration.isEmpty()) {
            return Optional.empty();
        }
        ServiceDeclaration serviceTemplate = serviceDeclaration.get();
        ServiceDeclaration.Package pkg = serviceTemplate.packageInfo();

        String protocol = getProtocol(context.moduleName());

        String label = serviceTemplate.displayName();
        Value documentation = getServiceDocumentation(ServiceClassUtil.ServiceClassContext.SERVICE_DIAGRAM);
        String icon = CommonUtils.generateIcon(pkg.org(), pkg.name(), pkg.version());

        Map<String, Value> properties = new LinkedHashMap<>();

        Service.ServiceModelBuilder serviceBuilder = new Service.ServiceModelBuilder();
        serviceBuilder
                .setId(String.valueOf(pkg.packageId()))
                .setName(label)
                .setType(context.moduleName())
                .setDisplayName(label)
                .setModuleName(context.moduleName())
                .setOrgName(pkg.org())
                .setVersion(pkg.version())
                .setPackageName(pkg.name())
                .setListenerProtocol(protocol)
                .setIcon(icon)
                .setDocumentation(documentation)
                .setProperties(properties)
                .setFunctions(new ArrayList<>());

        Service service = serviceBuilder.build();
        properties.put(PROP_KEY_LISTENER, getListenersProperty(protocol,
                Value.FieldType.valueOf(serviceTemplate.listenerKind())));

        // type descriptor
        properties.put(PROP_KEY_SERVICE_TYPE, getTypeDescriptorProperty(serviceTemplate, pkg.packageId()));

        // base path
        if (serviceTemplate.optionalAbsoluteResourcePath() == 0) {
            properties.put(PROP_KEY_BASE_PATH, getBasePathProperty(serviceTemplate));
        }

        // string literal
        if (serviceTemplate.optionalStringLiteral() == 0) {
            properties.put(PROP_KEY_STRING_LITERAL, getStringLiteral(serviceTemplate));
        }
        // Get the service type for metadata retrieval
        List<String> serviceTypes = ServiceDatabaseManager.getInstance().getServiceTypes(pkg.packageId());
        String serviceType = serviceTypes.isEmpty() ? null : serviceTypes.getFirst();
        properties.put(PROP_READONLY_METADATA_KEY, getReadonlyMetadata(pkg.org(), pkg.name(), serviceType));
        List<AnnotationAttachment> annotationAttachments = ServiceDatabaseManager.getInstance()
                .getAnnotationAttachments(pkg.packageId());
        for (AnnotationAttachment annotationAttachment : annotationAttachments) {
            if (annotationAttachment.attachmentPoints().contains(AnnotationAttachPoint.SERVICE)) {
                String key = ANNOT_PREFIX + annotationAttachment.annotName();
                properties.put(key, getAnnotationAttachmentProperty(annotationAttachment));
            }
        }

        return Optional.of(service);
    }

    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        ListenerUtil.DefaultListener defaultListener = ListenerUtil.getDefaultListener(context);
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
        List<String> functionsStr = buildMethodDefinitions(service.getFunctions(), TRIGGER_ADD, imports);
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

        if (!importStmts.isEmpty()) {
            String importsStmts = String.join(NEW_LINE, importStmts);
            edits.addFirst(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), importsStmts));
        }

        return Map.of(context.filePath(), edits);
    }

    @Override
    public Map<String, List<TextEdit>> updateModel(UpdateModelContext context) {
        List<TextEdit> edits = new ArrayList<>();

        ServiceDeclarationNode serviceNode = context.serviceNode();
        Service service = context.service();
        LineRange lineRange = service.getCodedata().getLineRange();
        addServiceDocTextEdits(service, serviceNode, edits);
        addServiceAnnotationTextEdits(service, serviceNode, edits);

        Value basePathValue = service.getBasePath();
        if (Objects.nonNull(basePathValue) && basePathValue.isEnabledWithValue()) {
            String basePath = basePathValue.getValue();
            NodeList<Node> nodes = serviceNode.absoluteResourcePath();
            String currentPath = getPath(nodes);
            if (!currentPath.equals(basePath) && !nodes.isEmpty()) {
                LinePosition startPos = nodes.get(0).lineRange().startLine();
                LinePosition endPos = nodes.get(nodes.size() - 1).lineRange().endLine();
                LineRange basePathLineRange = LineRange.from(lineRange.fileName(), startPos, endPos);
                TextEdit basePathEdit = new TextEdit(Utils.toRange(basePathLineRange), basePath);
                edits.add(basePathEdit);
            }
        }

        Value stringLiteral = service.getStringLiteralProperty();
        if (Objects.nonNull(stringLiteral) && stringLiteral.isEnabledWithValue()) {
            String stringLiteralValue = stringLiteral.getValue();
            NodeList<Node> nodes = serviceNode.absoluteResourcePath();
            String currentPath = getPath(nodes);
            if (!currentPath.equals(stringLiteralValue) && !nodes.isEmpty()) {
                LinePosition startPos = nodes.get(0).lineRange().startLine();
                LinePosition endPos = nodes.get(nodes.size() - 1).lineRange().endLine();
                LineRange basePathLineRange = LineRange.from(lineRange.fileName(), startPos, endPos);
                TextEdit basePathEdit = new TextEdit(Utils.toRange(basePathLineRange), stringLiteralValue);
                edits.add(basePathEdit);
            }
        }

        Value listener = service.getListener();
        ListenerUtil.DefaultListener defaultListener = null;
        if (Objects.nonNull(listener) && listener.isEnabledWithValue()) {
            defaultListener = ListenerUtil.getDefaultListener(service.getListener(), context.semanticModel(),
                    context.document(), context.document().syntaxTree().rootNode(), service.getModuleName());

            String listenerName = listener.getValue();
            Optional<LineRange> listenerExprsLineRange = getListenerExpressionsLineRange(serviceNode);
            if (listenerExprsLineRange.isPresent()) {
                TextEdit listenerEdit = new TextEdit(Utils.toRange(listenerExprsLineRange.get()), listenerName);
                edits.add(listenerEdit);
            }
        }

        if (Objects.nonNull(defaultListener)) {
            String stmt = getDefaultListenerDeclarationStmt(defaultListener);
            edits.add(new TextEdit(Utils.toRange(defaultListener.linePosition()), stmt));
        }
        return Map.of(context.filePath(), edits);
    }

    @Override
    public Service getModelFromSource(ModelFromSourceContext context) {
        if (Objects.isNull(context.moduleName())) {
            return null;
        }

        Service serviceModel = createBaseServiceModel(context);
        if (Objects.isNull(serviceModel)) {
            return createFallbackServiceModel(context);
        }

        ServiceDeclarationNode serviceNode = (ServiceDeclarationNode) context.node();
        populateServiceModelFromSource(serviceModel, serviceNode, context);

        return serviceModel;
    }

    /**
     * Creates the base service model from the service template.
     *
     * @param context the model context
     * @return the base service model or null if template not found
     */
    protected Service createBaseServiceModel(ModelFromSourceContext context) {
        String serviceType = getServiceTypeIdentifier(context.serviceType());
        Optional<Service> serviceTemplate = ServiceBuilderRouter.getModelTemplate(
                context.orgName(), context.moduleName());

        if (serviceTemplate.isEmpty()) {
            return null;
        }

        Service serviceModel = serviceTemplate.get();
        populateServiceTypeFunctions(serviceModel, serviceType);
        configureServiceType(serviceModel, serviceType);

        return serviceModel;
    }

    /**
     * Populates the service model with information extracted from the source.
     *
     * @param serviceModel the service model to populate
     * @param serviceNode  the service declaration node from source
     * @param context      the model context
     */
    private void populateServiceModelFromSource(Service serviceModel, ServiceDeclarationNode serviceNode,
                                                ModelFromSourceContext context) {
        extractServicePathInfo(serviceNode, serviceModel);

        List<Function> functionsInSource = extractFunctionsFromSource(serviceNode);
        updateServiceInfoNew(serviceModel, functionsInSource);

        // Set code metadata
        Codedata codedata = new Codedata.Builder()
                .setLineRange(serviceNode.lineRange())
                .setOrgName(context.orgName())
                .setPackageName(context.packageName())
                .setModuleName(context.moduleName())
                .build();
        serviceModel.setCodedata(codedata);

        // Populate additional service properties
        populateListenerInfo(serviceModel, serviceNode);
        updateServiceDocs(serviceNode, serviceModel);
        updateAnnotationAttachmentProperty(serviceNode, serviceModel);
        updateListenerItems(context.moduleName(), context.semanticModel(), context.project(), serviceModel);
        updateReadOnlyMetadataWithAnnotations(serviceModel, serviceNode, context);
    }

    /**
     * Configures the service type property in the service model.
     *
     * @param serviceModel the service model
     * @param serviceType  the service type identifier
     */
    private void configureServiceType(Service serviceModel, String serviceType) {
        serviceModel.getServiceType().setValue(serviceType);
        serviceModel.getServiceType().setEditable(false);
    }

    /**
     * Populates the service model with functions from the service type definition.
     *
     * @param serviceModel the service model
     * @param serviceType  the service type identifier
     */
    private void populateServiceTypeFunctions(Service serviceModel, String serviceType) {
        int packageId = Integer.parseInt(serviceModel.getId());
        ServiceDatabaseManager.getInstance()
                .getMatchingServiceTypeFunctions(packageId, serviceType)
                .forEach(funInDb -> serviceModel.getFunctions().add(getFunctionFromServiceTypeFunction(funInDb)));
    }

    /**
     * Updates the readOnly metadata in the service model using the new extraction architecture.
     * This method uses the ReadOnlyMetadataManager to extract values from different sources
     * based on the metadata kind (ANNOTATION, LISTENER_PARAM, SERVICE_DESCRIPTION, CUSTOM).
     *
     * @param serviceModel The service model to update
     * @param serviceNode  The service declaration node containing annotations
     * @param context      The model context containing service information
     */
    protected void updateReadOnlyMetadataWithAnnotations(Service serviceModel, ServiceDeclarationNode serviceNode,
                                                         ModelFromSourceContext context) {
        // Get the current readOnly metadata property
        Value currentReadOnlyMetadata = serviceModel.getProperty(PROP_READONLY_METADATA_KEY);
        if (currentReadOnlyMetadata == null) {
            // readOnlyMetaData property should be initialized by service builders before calling this method
            return;
        }

        // Create the ReadOnlyMetadataManager
        ReadOnlyMetadataManager metadataManager = new ReadOnlyMetadataManager();

        // Check if the current service builder supports custom extraction
        Optional<CustomExtractor> customExtractor = Optional.empty();
        if (this instanceof CustomExtractor customServiceBuilder) {
            customExtractor = Optional.of(customServiceBuilder);
        }

        // Extract all metadata values using the new architecture
        Map<String, List<String>> extractedValues = metadataManager.extractAllMetadata(serviceNode, context,
                customExtractor);

        // Get or initialize the metadata map
        HashMap<String, List<String>> currentProps;
        try {
            currentProps = (HashMap<String, List<String>>) currentReadOnlyMetadata.getValueAsObject();
            if (currentProps == null) {
                currentProps = new HashMap<>();
                currentReadOnlyMetadata.setValue(currentProps);
            }
        } catch (ClassCastException e) {
            // Value is not the expected type, reinitialize
            currentProps = new HashMap<>();
            currentReadOnlyMetadata.setValue(currentProps);
        }

        // Process extracted values - put all values directly into the readOnlyMetaData property
        for (Map.Entry<String, List<String>> entry : extractedValues.entrySet()) {
            String displayName = entry.getKey();
            List<String> values = entry.getValue();

            // Convert List<String> to ArrayList<String> and put directly in readOnlyMetaData
            currentProps.put(displayName, new ArrayList<>(values));
        }
    }

    /**
     * Recursively unwraps GROUP_SECTION values by promoting their children into the parent map.
     *
     * @param properties the properties map to unwrap in-place
     */
    protected static void unwrapGroupSections(Map<String, Value> properties) {
        List<String> groupKeys = new ArrayList<>();
        Map<String, Value> childProps = new LinkedHashMap<>();
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value value = entry.getValue();
            if (value.getTypes() != null && value.getTypes().stream()
                    .anyMatch(t -> t.fieldType() == Value.FieldType.GROUP_SECTION)) {
                groupKeys.add(entry.getKey());
                if (value.getProperties() != null) {
                    unwrapGroupSections(value.getProperties());
                    childProps.putAll(value.getProperties());
                }
            }
        }
        groupKeys.forEach(properties::remove);
        properties.putAll(childProps);
    }

    public abstract String kind();

    protected record ListenerDTO(String listenerProtocol, String listenerVarName, String listenerDeclaration) {
    }
}

