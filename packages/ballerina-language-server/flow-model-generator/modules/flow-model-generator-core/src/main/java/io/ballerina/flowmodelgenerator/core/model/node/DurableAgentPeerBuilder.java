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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * A peer of a durable agent: another agent this one delegates to, advertised to the model as a
 * tool. Edits the {@code peers} list of the agent's declaration.
 *
 * <p>Generated entry example:
 * <pre>{@code
 * {agent: hotelAgent, name: "askHotelDesk", description: "...", 'wait: false,
 *  callbackChannel: "hotelResults"}
 * }</pre>
 *
 * @since 1.9.0
 */
public class DurableAgentPeerBuilder extends CallBuilder {

    public static final String AGENT_KEY = "agent";
    public static final String NAME_KEY = "name";
    public static final String DESCRIPTION_KEY = "description";
    public static final String WAIT_KEY = "wait";
    public static final String CALLBACK_CHANNEL_KEY = "callbackChannel";
    private static final String STRING_TYPE = "string";
    private static final String LABEL = "Peer Agent";
    private static final String DESCRIPTION =
            "Another durable agent this agent can delegate to, advertised to the model as a tool";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DURABLE_AGENT_PEER;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_PEER)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(AGENT_CONTEXT_CLASS_NAME)
                .symbol(AGENT_KEY);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();

        // Which agent is delegated to is the entry's whole point, and the choices are the other
        // durable agents declared in the project.
        properties().custom()
                .metadata()
                    .label("Peer Agent")
                    .description("The durable agent to delegate to")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(durableAgentVariables(context))
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(AGENT_KEY);

        addStringProperty(NAME_KEY, "Tool Name",
                "The name the model calls this peer by; must be a constant string",
                "askHotelDesk", true);
        addStringProperty(DESCRIPTION_KEY, "Description",
                "What the peer does, for the model to decide when to delegate",
                "Asks the hotel specialist to research and recommend hotels.", false);

        // Waiting inline is the simple case; an async delegation has to say where the answer
        // lands, which is why the channel sits next to the flag.
        properties().custom()
                .metadata()
                    .label("Wait for the Answer")
                    .description("When set, the delegation blocks durably for the peer's result; "
                            + "otherwise the peer runs async and replies on the callback channel")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.FLAG)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .value("true")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(WAIT_KEY);

        addStringProperty(CALLBACK_CHANNEL_KEY, "Callback Channel",
                "The declared data event channel the async peer replies on; required when the "
                        + "delegation does not wait",
                "hotelResults", false);
    }

    private void addStringProperty(String key, String label, String doc, String placeholder, boolean required) {
        properties().custom()
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .ballerinaType(STRING_TYPE)
                    .selected(true)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(STRING_TYPE)
                    .selected(false)
                    .stepOut()
                .codedata()
                    .kind(required ? ParameterData.Kind.REQUIRED.name() : ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .placeholder(placeholder)
                .value("")
                .editable(true)
                .optional(!required)
                .stepOut()
                .addProperty(key);
    }

    // The module-level durable agents a peer entry can name.
    private static List<Option> durableAgentVariables(TemplateContext context) {
        List<Option> options = new ArrayList<>();
        try {
            Package currentPackage = PackageUtil.loadProject(context.workspaceManager(), context.filePath())
                    .currentPackage();
            PackageUtil.getCompilation(currentPackage);
            for (Module module : currentPackage.modules()) {
                SemanticModel semanticModel = module.getCompilation().getSemanticModel();
                semanticModel.moduleSymbols().stream()
                        .filter(symbol -> symbol instanceof VariableSymbol)
                        .map(symbol -> (VariableSymbol) symbol)
                        .filter(variable -> variable.typeDescriptor().signature()
                                .endsWith(Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME))
                        .forEach(variable -> variable.getName()
                                .ifPresent(name -> options.add(new Option(name, name))));
            }
        } catch (RuntimeException e) {
            // A project that does not compile yet still opens the form; it just offers no choices.
            return options;
        }
        return options;
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Object model: a peer lives on the declaration's `peers` list.
        WorkflowUtil.requireDurableAgentObjectTarget(sourceBuilder);
        if (WorkflowUtil.isCapabilityDeleteRequest(sourceBuilder)) {
            return WorkflowUtil.removeAgentCapabilityEntry(sourceBuilder);
        }
        String agent = propertyValue(sourceBuilder, AGENT_KEY);
        if (agent.isBlank()) {
            throw new UserFacingException("A peer agent is required");
        }
        String name = propertyValue(sourceBuilder, NAME_KEY);
        if (name.isBlank()) {
            throw new UserFacingException("A peer tool name is required");
        }
        String description = propertyValue(sourceBuilder, DESCRIPTION_KEY);
        String callbackChannel = propertyValue(sourceBuilder, CALLBACK_CHANNEL_KEY);
        boolean waits = !"false".equalsIgnoreCase(propertyValue(sourceBuilder, WAIT_KEY));
        if (!waits && callbackChannel.isBlank()) {
            throw new UserFacingException("A peer that does not wait must name the callback "
                    + "channel its answer arrives on");
        }

        // 'wait is a keyword, so the field is written quoted; it is only emitted when it differs
        // from the declaration's default.
        StringBuilder entry = new StringBuilder("{agent: ").append(agent)
                .append(", name: ").append(WorkflowUtil.constantNameLiteral(name));
        if (!description.isBlank()) {
            entry.append(", description: ").append(WorkflowUtil.quoteIfPlain(description));
        }
        if (!waits) {
            entry.append(", 'wait: false");
            entry.append(", callbackChannel: ").append(WorkflowUtil.quoteIfPlain(callbackChannel));
        }
        entry.append("}");
        return WorkflowUtil.upsertAgentCapabilityEntry(sourceBuilder, "peers", entry.toString());
    }

    private static String propertyValue(SourceBuilder sourceBuilder, String key) {
        return sourceBuilder.getProperty(key)
                .map(property -> property.value() == null ? "" : property.value().toString().trim())
                .orElse("");
    }
}
