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

import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerUISchemaModel;
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentTriggerChannel;
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentTriggerChannels;
import io.ballerina.servicemodelgenerator.extension.builder.service.agent.AgentTriggerContext;
import io.ballerina.servicemodelgenerator.extension.connector.LocalDependencyEditUtil;
import io.ballerina.servicemodelgenerator.extension.connector.SchemaDrivenSourceGenerator;
import io.ballerina.servicemodelgenerator.extension.connector.TriggerModelReader;
import io.ballerina.servicemodelgenerator.extension.model.ServiceInitModel;
import io.ballerina.servicemodelgenerator.extension.model.Value;
import io.ballerina.servicemodelgenerator.extension.model.context.AddServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.context.GetServiceInitModelContext;
import io.ballerina.servicemodelgenerator.extension.model.request.ServiceModelRequest;
import io.ballerina.servicemodelgenerator.extension.util.FTPListenerUtil;
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;
import static io.ballerina.servicemodelgenerator.extension.util.Constants.TWO_NEW_LINES;

/**
 * Builds a trigger that is wired to an AI agent.
 *
 * @since 1.9.0
 */
public class AgentTriggerServiceBuilder extends SchemaDrivenServiceBuilder {

    public static final String KIND = "agent-trigger";
    private static final String AGENT_NAME_PROPERTY = "agentName";
    private static final String TYPES_BAL = "types.bal";
    private static final String AGENT_ORG_PROPERTY = "agentOrg";
    private static final String BALLERINA_ORG = "ballerina";
    private static final String INDENT = "    ";

    public static boolean handles(ServiceModelRequest request) {
        return request != null && handles(request.orgName(), request.moduleName(), request.version(),
                request.isLocalRepository(), request.agentName());
    }

    public static boolean handles(ServiceInitModel initModel) {
        return initModel != null && handles(initModel.getOrgName(), initModel.getModuleName(),
                initModel.getVersion(), initModel.isLocalRepository(),
                flattenFormValues(initModel.getProperties()).get(AGENT_NAME_PROPERTY));
    }

    private static boolean handles(String orgName, String moduleName, String version, boolean isLocalRepository,
                                   String agentName) {
        return agentName != null && !agentName.isBlank()
                && AgentTriggerChannels.forModule(orgName, moduleName, version, isLocalRepository).isPresent();
    }

    @Override
    public String kind() {
        return KIND;
    }

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        Optional<AgentTriggerChannel> channel = AgentTriggerChannels.forModule(context.orgName(),
                context.moduleName(), context.version(), context.isLocalRepository());
        ServiceInitModel initModel = channel.flatMap(c -> c.initModel(context))
                .orElseGet(() -> super.getServiceInitModel(context));
        if (initModel == null) {
            return null;
        }
        initModel.addProperty(AGENT_NAME_PROPERTY, hiddenValue(context.agentName()));
        if (context.agentOrgName() != null && !context.agentOrgName().isBlank()) {
            initModel.addProperty(AGENT_ORG_PROPERTY, hiddenValue(context.agentOrgName()));
        }
        channel.ifPresent(c -> {
            c.additionalProperties().forEach(initModel::addProperty);
            c.customizeInitModel(initModel, triggerModelFor(initModel).orElse(null));
        });
        return initModel;
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context) {
        ServiceInitModel filledModel = context.serviceInitModel();
        Optional<AgentTriggerChannel> channel = AgentTriggerChannels.forModule(filledModel.getOrgName(),
                filledModel.getModuleName(), filledModel.getVersion(), filledModel.isLocalRepository());
        Optional<TriggerUISchemaModel> triggerModel = triggerModelFor(filledModel);
        if (channel.isEmpty() || (channel.get().isSchemaDriven() && triggerModel.isEmpty())) {
            return super.addServiceInitSource(context);
        }
        ModulePartNode rootNode = context.document().syntaxTree().rootNode();
        Map<String, List<TextEdit>> edits = new LinkedHashMap<>(buildEdits(filledModel, triggerModel.orElse(null),
                channel.get(), rootNode, context.filePath()));
        if (filledModel.isLocalRepository()) {
            LocalDependencyEditUtil.addIfMissing(edits, context.project(), filledModel.getOrgName(),
                    filledModel.getPackageName(), filledModel.getVersion());
        }
        return edits;
    }

    private static Optional<TriggerUISchemaModel> triggerModelFor(ServiceInitModel model) {
        return TriggerModelReader.getInstance().getSchemaDrivenTriggerModel(model.getOrgName(),
                model.getModuleName(), model.getVersion(), model.isLocalRepository());
    }

    public static Map<String, List<TextEdit>> buildEdits(ServiceInitModel filledModel,
                                                         TriggerUISchemaModel triggerModel,
                                                         AgentTriggerChannel channel, ModulePartNode rootNode,
                                                         String filePath) {
        String emitAlias = SchemaDrivenSourceGenerator.resolveEmitAlias(rootNode, filledModel, triggerModel);
        Map<String, String> formValues = flattenFormValues(filledModel.getProperties());
        reclaimChannelKeys(formValues, filledModel, channel);
        List<TextEdit> edits = new ArrayList<>();
        String imports = SchemaDrivenSourceGenerator.buildImports(filledModel, triggerModel, rootNode, emitAlias,
                channel.imports());
        if (!imports.isEmpty()) {
            edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), imports));
        }
        SchemaDrivenSourceGenerator.ResolvedListener listener = channel.listener(rootNode, emitAlias, formValues)
                .orElseGet(() -> SchemaDrivenSourceGenerator.resolveListener(filledModel, emitAlias));
        AgentTriggerContext channelContext = new AgentTriggerContext(emitAlias, listener.varName(),
                formValues.get(AGENT_NAME_PROPERTY), formValues.getOrDefault(AGENT_ORG_PROPERTY, BALLERINA_ORG),
                formValues, filledModel, triggerModel);

        Optional<List<TextEdit>> appended = channel.appendToExistingService(rootNode, channelContext);
        if (appended.isPresent()) {
            edits.addAll(appended.get());
            return withAuxiliaryEdits(filePath, edits, channelContext);
        }

        Optional<ServiceDeclarationNode> existing = listener.declaration() != null ? Optional.empty()
                : findService(rootNode, listener.varName(), channelContext.serviceDescriptor());
        Optional<AgentTriggerChannel.HandlerBinding> binding = channel.handlerBinding(channelContext);
        if (existing.isPresent()) {
            if (binding.isEmpty()) {
                throw new IllegalStateException("A " + channelContext.serviceDescriptor()
                        + " service is already attached to listener '" + listener.varName()
                        + "'. Create the trigger on its own listener.");
            }
            edits.addAll(mergeIntoService(existing.get(), binding.get()));
            return withAuxiliaryEdits(filePath, edits, channelContext);
        }

        StringBuilder block = new StringBuilder(NEW_LINE);
        if (listener.declaration() != null) {
            block.append(listener.declaration()).append(NEW_LINE);
        }
        block.append(channel.serviceBlock(channelContext));
        edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().endLine()), block.toString()));
        return withAuxiliaryEdits(filePath, edits, channelContext);
    }

    private static Map<String, List<TextEdit>> withAuxiliaryEdits(String filePath, List<TextEdit> edits,
                                                                 AgentTriggerContext context) {
        Map<String, List<TextEdit>> byFile = new LinkedHashMap<>();
        byFile.put(filePath, edits);
        if (context.auxiliaryTypes().isEmpty()) {
            return byFile;
        }
        Path typesBal = Path.of(filePath).resolveSibling(TYPES_BAL);
        String source = NEW_LINE + String.join(TWO_NEW_LINES, context.auxiliaryTypes()) + NEW_LINE;
        byFile.put(typesBal.toString(), new ArrayList<>(List.of(
                new TextEdit(Utils.toRange(LinePosition.from(0, 0)), source))));
        return byFile;
    }

    private static Optional<ServiceDeclarationNode> findService(ModulePartNode rootNode, String listenerVarName,
                                                                String descriptor) {
        return rootNode.members().stream()
                .filter(ServiceDeclarationNode.class::isInstance)
                .map(ServiceDeclarationNode.class::cast)
                .filter(service -> FTPListenerUtil.isServiceAttachedToListener(service, listenerVarName)
                        && descriptor.equals(service.typeDescriptor().map(Node::toSourceCode).orElse("").strip()))
                .findFirst();
    }

    private static List<TextEdit> mergeIntoService(ServiceDeclarationNode service,
                                                   AgentTriggerChannel.HandlerBinding binding) {
        NodeList<Node> members = service.members();
        Optional<FunctionBodyBlockNode> body = members.stream()
                .filter(FunctionDefinitionNode.class::isInstance)
                .map(FunctionDefinitionNode.class::cast)
                .filter(fn -> fn.functionName().text().equals(binding.handlerName()))
                .map(FunctionDefinitionNode::functionBody)
                .filter(FunctionBodyBlockNode.class::isInstance)
                .map(FunctionBodyBlockNode.class::cast)
                .findFirst();
        LineRange lastMember = members.isEmpty() ? service.openBraceToken().lineRange()
                : members.get(members.size() - 1).lineRange();
        boolean replyMethodExists = hasMethod(members, binding.replyMethodName());
        if (body.isEmpty()) {
            String appended = replyMethodExists ? binding.handler()
                    : binding.handler() + TWO_NEW_LINES + binding.replyMethod();
            return List.of(new TextEdit(Utils.toRange(lastMember.endLine()), TWO_NEW_LINES + appended));
        }
        if (body.get().toSourceCode().contains(offloadCall(binding))) {
            return List.of();
        }
        List<TextEdit> edits = new ArrayList<>();
        edits.add(new TextEdit(Utils.toRange(body.get().closeBraceToken().lineRange().startLine()),
                INDENT + binding.offload() + NEW_LINE + INDENT));
        if (!replyMethodExists) {
            edits.add(new TextEdit(Utils.toRange(lastMember.endLine()),
                    TWO_NEW_LINES + binding.replyMethod()));
        }
        return edits;
    }

    private static String offloadCall(AgentTriggerChannel.HandlerBinding binding) {
        return "start self." + binding.replyMethodName() + "(";
    }

    private static boolean hasMethod(NodeList<Node> members, String name) {
        return members.stream()
                .filter(FunctionDefinitionNode.class::isInstance)
                .map(FunctionDefinitionNode.class::cast)
                .anyMatch(fn -> fn.functionName().text().equals(name));
    }

    private static Value hiddenValue(String value) {
        return new Value.ValueBuilder()
                .enabled(true)
                .editable(false)
                .setHidden(true)
                .value(value)
                .build();
    }

    private static Map<String, Value> selectedBranch(Value field) {
        Map<String, Value> properties = field.getProperties();
        if (properties == null || properties.isEmpty() || !properties.containsKey(field.getValue())) {
            return properties;
        }
        Value branch = properties.get(field.getValue());
        return branch == null ? null : branch.getProperties();
    }

    private static void reclaimChannelKeys(Map<String, String> flat, ServiceInitModel model,
                                          AgentTriggerChannel channel) {
        Map<String, Value> properties = model.getProperties();
        if (properties == null) {
            return;
        }
        Set<String> owned = new LinkedHashSet<>(channel.additionalProperties().keySet());
        owned.add(AGENT_NAME_PROPERTY);
        owned.add(AGENT_ORG_PROPERTY);
        for (String key : owned) {
            Value field = properties.get(key);
            String value = field == null ? null : field.getValue();
            if (value != null && !value.isBlank()) {
                flat.put(key, value);
            }
        }
    }

    private static Map<String, String> flattenFormValues(Map<String, Value> properties) {
        Map<String, String> flat = new LinkedHashMap<>();
        collect(properties, flat);
        return flat;
    }

    private static void collect(Map<String, Value> properties, Map<String, String> flat) {
        if (properties == null) {
            return;
        }
        for (Map.Entry<String, Value> entry : properties.entrySet()) {
            Value field = entry.getValue();
            if (field == null) {
                continue;
            }
            String value = field.getValue();
            if (value != null && !value.isBlank()) {
                flat.putIfAbsent(entry.getKey(), value);
            }
            collect(selectedBranch(field), flat);
            List<Value> choices = field.getChoices();
            if (choices == null) {
                continue;
            }
            for (Value choice : choices) {
                if (choice != null && choice.isEnabled()) {
                    collect(choice.getProperties(), flat);
                }
            }
        }
    }
}
