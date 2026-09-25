/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
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

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.PropertyType;
import io.ballerina.servicemodelgenerator.extension.model.Service;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.ModelFromSourceContext;
import io.ballerina.servicemodelgenerator.extension.util.AiSourceUtils;
import io.ballerina.servicemodelgenerator.extension.util.ListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.BALLERINA;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_BASE_PATH;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.PROP_KEY_LISTENER;
import static io.ballerina.servicemodelgenerator.extension.util.ListenerUtil.getDefaultListenerDeclarationStmt;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getBasePathProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getListenersProperty;
import static io.ballerina.servicemodelgenerator.extension.util.ServiceModelUtils.getProtocol;
import static io.ballerina.servicemodelgenerator.extension.util.Utils.importExists;

/**
 * Builder for an agent-shaped trigger connector's service, e.g. {@code vinoth/ai.wso2.integration}'s
 * Voice Agent Service. Handler name, parameter and return type are read from {@link
 * TriggerModelReader} rather than hardcoded, so another connector shaped the same way needs no new
 * Java.
 *
 * @since 1.10.0
 */
public final class AiAgentTriggerServiceBuilder extends AbstractServiceBuilder {

    private static final String AGENT_NAME_PROPERTY = "agentName";
    private static final String DEFAULT_AGENT_NAME = "voiceAgent";

    // Matches the field names ballerina/ai's own ChatReqMessage uses.
    private static final String MESSAGE_FIELD = "message";
    private static final String SESSION_FIELD = "sessionId";

    private record HandlerFacts(String name, String paramType, String paramName, String returnType) {
    }

    @Override
    public Optional<Service> getModelTemplate(GetModelContext context) {
        Optional<TriggerUISchemaModel> triggerModel = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(context.orgName(), context.moduleName());
        if (triggerModel.isEmpty()) {
            return Optional.empty();
        }
        TriggerUISchemaModel model = triggerModel.get();
        String protocol = getProtocol(context.moduleName());

        Map<String, Value> properties = new LinkedHashMap<>();
        Service.ServiceModelBuilder serviceBuilder = new Service.ServiceModelBuilder();
        serviceBuilder
                .setId(model.id())
                .setName(model.displayName())
                .setType(context.moduleName())
                .setDisplayName(model.displayName())
                .setModuleName(context.moduleName())
                .setOrgName(model.orgName())
                .setVersion(model.version())
                .setPackageName(model.packageName())
                .setListenerProtocol(protocol)
                .setIcon(model.icon())
                .setProperties(properties)
                .setFunctions(new ArrayList<>());
        Service service = serviceBuilder.build();

        properties.put(PROP_KEY_LISTENER, getListenersProperty(protocol, Value.FieldType.SINGLE_SELECT_LISTENER));
        properties.put(PROP_KEY_BASE_PATH, getBasePathProperty("/"));

        Value agentNameProperty = new Value.ValueBuilder()
                .metadata("Agent Name", "The name of the agent variable")
                .types(List.of(PropertyType.types(Value.FieldType.IDENTIFIER)))
                .enabled(true)
                .editable(true)
                .build();
        properties.put(AGENT_NAME_PROPERTY, agentNameProperty);

        return Optional.of(service);
    }

    @Override
    protected Service createBaseServiceModel(ModelFromSourceContext context) {
        Optional<Service> serviceTemplate = getModelTemplate(
                GetModelContext.fromOrgAndModule(context.orgName(), context.moduleName()));
        if (serviceTemplate.isEmpty()) {
            return null;
        }
        Service serviceModel = serviceTemplate.get();
        serviceModel.getProperties().remove(AGENT_NAME_PROPERTY);
        return serviceModel;
    }

    @Override
    public Map<String, List<TextEdit>> addModel(AddModelContext context) throws Exception {
        List<TextEdit> edits = new ArrayList<>();
        Service service = context.service();

        String agentVarName = getAgentNameFromService(service);
        HandlerFacts handler = resolveHandlerFacts(service);
        String agentModuleOrg = resolveAgentModuleOrg(context.semanticModel());

        addDefaultListenerEdit(context, edits);

        StringBuilder serviceBuilder = new StringBuilder(NEW_LINE);
        buildServiceNodeStr(service, serviceBuilder);
        buildServiceNodeBody(getServiceMembers(handler, agentVarName, agentModuleOrg), serviceBuilder);

        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().endLine()), serviceBuilder.toString()));

        addRequiredImports(service, rootNode, edits);

        return Map.of(context.filePath(), edits);
    }

    private HandlerFacts resolveHandlerFacts(Service service) {
        Optional<TriggerUISchemaModel> triggerModel = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(service.getOrgName(), service.getModuleName());
        if (triggerModel.isEmpty() || triggerModel.get().serviceTypes() == null
                || triggerModel.get().serviceTypes().isEmpty()) {
            throw new IllegalStateException("No schema-driven trigger model found for "
                    + service.getOrgName() + "/" + service.getModuleName());
        }
        List<TriggerUISchemaModel.FunctionModel> functions = triggerModel.get().serviceTypes().getFirst().functions();
        if (functions == null || functions.isEmpty()) {
            throw new IllegalStateException("The trigger model for " + service.getOrgName() + "/"
                    + service.getModuleName() + " declares no handler function");
        }
        TriggerUISchemaModel.FunctionModel function = functions.getFirst();
        TriggerUISchemaModel.Parameter param = function.parameters().getFirst();
        String paramType = String.valueOf(param.type().value());
        String paramName = String.valueOf(param.name().value());

        String returnTypeStr = function.returnType().type();

        return new HandlerFacts(function.name(), paramType, paramName, returnTypeStr);
    }

    private String resolveAgentModuleOrg(SemanticModel semanticModel) {
        if (semanticModel == null) {
            return BALLERINA;
        }
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (symbol.kind() == SymbolKind.CLASS && "Agent".equals(symbol.getName().orElse(""))) {
                return ((ClassSymbol) symbol).getModule()
                        .map(module -> module.id().orgName())
                        .orElse(BALLERINA);
            }
        }
        return BALLERINA;
    }

    private String getAgentNameFromService(Service service) {
        Value agentNameValue = service.getProperty(AGENT_NAME_PROPERTY);
        String rawAgentName = agentNameValue != null && agentNameValue.isEnabledWithValue()
                ? agentNameValue.getValue()
                : DEFAULT_AGENT_NAME;
        return sanitizeIdentifier(rawAgentName);
    }

    private String sanitizeIdentifier(String name) {
        if (name == null || name.trim().isEmpty()) {
            return DEFAULT_AGENT_NAME;
        }

        String sanitized = name.replaceAll("[^A-Za-z0-9_]", "_");
        if (!sanitized.isEmpty() && Character.isDigit(sanitized.charAt(0))) {
            sanitized = "_" + sanitized;
        }
        if (sanitized.isEmpty() || sanitized.matches("_+")) {
            return DEFAULT_AGENT_NAME;
        }

        return sanitized;
    }

    private void addDefaultListenerEdit(AddModelContext context, List<TextEdit> edits) {
        ListenerUtil.DefaultListener defaultListener = ListenerUtil.getDefaultListener(context);
        if (Objects.nonNull(defaultListener)) {
            String stmt = getDefaultListenerDeclarationStmt(defaultListener);
            edits.add(new TextEdit(Utils.toRange(defaultListener.linePosition()), stmt));
        }
    }

    private List<String> getServiceMembers(HandlerFacts handler, String agentVarName, String orgName) {
        List<String> members = new ArrayList<>();
        members.add(AiSourceUtils.agentTriggerFunctionSource(handler.name(), handler.paramType(), handler.paramName(),
                handler.returnType(), MESSAGE_FIELD, SESSION_FIELD, agentVarName, AiSourceUtils.runOperator(orgName)));
        return members;
    }

    private void addRequiredImports(Service service, ModulePartNode rootNode, List<TextEdit> edits) {
        Set<String> importStmts = new LinkedHashSet<>();
        if (!importExists(rootNode, service.getOrgName(), service.getModuleName())) {
            importStmts.add(Utils.getImportStmt(service.getOrgName(), service.getModuleName()));
        }
        if (!importStmts.isEmpty()) {
            String importsStmts = String.join(NEW_LINE, importStmts);
            edits.addFirst(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), importsStmts));
        }
    }

    @Override
    public String kind() {
        return "ai-agent-trigger";
    }
}
