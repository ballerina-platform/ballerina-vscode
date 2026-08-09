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

import io.ballerina.compiler.syntax.tree.ModulePartNode;
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
import io.ballerina.servicemodelgenerator.extension.util.Utils;
import org.eclipse.lsp4j.TextEdit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.servicemodelgenerator.extension.util.Constants.NEW_LINE;

/**
 * Builds a trigger that is wired to an AI agent.
 *
 * @since 1.9.0
 */
public class AgentTriggerServiceBuilder extends SchemaDrivenServiceBuilder {

    public static final String KIND = "agent-trigger";
    private static final String AGENT_NAME_PROPERTY = "agentName";
    private static final String AGENT_ORG_PROPERTY = "agentOrg";
    private static final String BALLERINA_ORG = "ballerina";

    public static boolean handles(String moduleName, String agentName) {
        return agentName != null && !agentName.isBlank() && AgentTriggerChannels.supports(moduleName);
    }

    public static boolean handles(ServiceInitModel initModel) {
        return initModel != null
                && handles(initModel.getModuleName(), flattenFormValues(initModel.getProperties())
                        .get(AGENT_NAME_PROPERTY));
    }

    @Override
    public String kind() {
        return KIND;
    }

    @Override
    public ServiceInitModel getServiceInitModel(GetServiceInitModelContext context) {
        Optional<AgentTriggerChannel> channel = AgentTriggerChannels.forModule(context.moduleName());
        ServiceInitModel initModel = channel.flatMap(c -> c.initModel(context))
                .orElseGet(() -> super.getServiceInitModel(context));
        if (initModel == null) {
            return null;
        }
        initModel.addProperty(AGENT_NAME_PROPERTY, hiddenValue(context.agentName()));
        if (context.agentOrgName() != null && !context.agentOrgName().isBlank()) {
            initModel.addProperty(AGENT_ORG_PROPERTY, hiddenValue(context.agentOrgName()));
        }
        channel.ifPresent(c -> c.additionalProperties().forEach(initModel::addProperty));
        return initModel;
    }

    @Override
    public Map<String, List<TextEdit>> addServiceInitSource(AddServiceInitModelContext context) {
        ServiceInitModel filledModel = context.serviceInitModel();
        Optional<AgentTriggerChannel> channel = AgentTriggerChannels.forModule(filledModel.getModuleName());
        Optional<TriggerUISchemaModel> triggerModel = TriggerModelReader.getInstance()
                .getSchemaDrivenTriggerModel(filledModel.getOrgName(), filledModel.getModuleName(),
                        filledModel.getVersion(), filledModel.isLocalRepository());
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

    public static Map<String, List<TextEdit>> buildEdits(ServiceInitModel filledModel,
                                                         TriggerUISchemaModel triggerModel,
                                                         AgentTriggerChannel channel, ModulePartNode rootNode,
                                                         String filePath) {
        String emitAlias = SchemaDrivenSourceGenerator.resolveEmitAlias(rootNode, filledModel, triggerModel);
        Map<String, String> formValues = flattenFormValues(filledModel.getProperties());
        List<TextEdit> edits = new ArrayList<>();
        String imports = SchemaDrivenSourceGenerator.buildImports(filledModel, triggerModel, rootNode, emitAlias,
                channel.imports());
        if (!imports.isEmpty()) {
            edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().startLine()), imports));
        }
        SchemaDrivenSourceGenerator.ResolvedListener listener = channel.listener(rootNode, emitAlias)
                .orElseGet(() -> SchemaDrivenSourceGenerator.resolveListener(filledModel, emitAlias));
        AgentTriggerContext channelContext = new AgentTriggerContext(emitAlias, listener.varName(),
                formValues.get(AGENT_NAME_PROPERTY), formValues.getOrDefault(AGENT_ORG_PROPERTY, BALLERINA_ORG),
                formValues, filledModel, triggerModel);
        StringBuilder block = new StringBuilder(NEW_LINE);
        if (listener.declaration() != null) {
            block.append(listener.declaration()).append(NEW_LINE);
        }
        block.append(channel.serviceBlock(channelContext));
        edits.add(new TextEdit(Utils.toRange(rootNode.lineRange().endLine()), block.toString()));
        return Map.of(filePath, edits);
    }

    private static Value hiddenValue(String value) {
        return new Value.ValueBuilder()
                .enabled(true)
                .editable(false)
                .setHidden(true)
                .value(value)
                .build();
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
            collect(field.getProperties(), flat);
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
