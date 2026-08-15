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

import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_EVENT_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_EVENT_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_UPDATE_EVENTS_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Declares a named two-way update channel for a durable agent. Generates
 * {@code check durableAgentContext.registerUpdateEvents(<name>, <requestType>[, <responseType>]);}.
 *
 * @since 1.8.0
 */
public class DurableAgentRegisterEventBuilder extends CallBuilder {

    public static final String NAME_KEY = "name";
    public static final String NAME_LABEL = "Event Name";
    public static final String NAME_DOC =
            "The data-event channel name (\"chat\" drives the conversation itself)";
    public static final String REQUEST_TYPE_KEY = "requestType";
    public static final String REQUEST_TYPE_LABEL = "Request Type";
    public static final String REQUEST_TYPE_DOC = "Type of the payload sent to the agent on this channel";
    public static final String RESPONSE_TYPE_KEY = "responseType";
    public static final String RESPONSE_TYPE_LABEL = "Response Type";
    public static final String RESPONSE_TYPE_DOC = "Type of the agent's reply for this channel. Declaring a "
            + "response makes the channel request-response (read with getDataResult/waitForDataResult); "
            + "leave empty for a one-way channel";
    public static final String CARDINALITY_KEY = "cardinality";
    public static final String CARDINALITY_LABEL = "Cardinality";
    public static final String CARDINALITY_DOC = "How the channel consumes its events: MULTI_EVENT (the "
            + "default) re-arms after every turn so events can arrive repeatedly and from multiple senders; "
            + "SINGLE_EVENT is consumed exactly once per run";
    public static final String MULTI_EVENT = "MULTI_EVENT";
    public static final String SINGLE_EVENT = "SINGLE_EVENT";

    private static final String STRING_TYPE = "string";
    private static final String DEFAULT_REQUEST_TYPE = "string";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DURABLE_AGENT_REGISTER_EVENT;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(REGISTER_EVENT_LABEL).description(REGISTER_EVENT_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_REGISTER_EVENT)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(AGENT_CONTEXT_CLASS_NAME)
                .symbol(REGISTER_UPDATE_EVENTS_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();

        properties().custom()
                .metadata()
                    .label(NAME_LABEL)
                    .description(NAME_DOC)
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
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .placeholder("chat")
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(NAME_KEY);

        properties().custom()
                .metadata()
                    .label(REQUEST_TYPE_LABEL)
                    .description(REQUEST_TYPE_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .ballerinaType(DEFAULT_REQUEST_TYPE)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value(DEFAULT_REQUEST_TYPE)
                .editable(true)
                .stepOut()
                .addProperty(REQUEST_TYPE_KEY);

        properties().custom()
                .metadata()
                    .label(RESPONSE_TYPE_LABEL)
                    .description(RESPONSE_TYPE_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .ballerinaType("")
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(RESPONSE_TYPE_KEY);

        properties().custom()
                .metadata()
                    .label(CARDINALITY_LABEL)
                    .description(CARDINALITY_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(List.of(new Option(MULTI_EVENT, MULTI_EVENT),
                            new Option(SINGLE_EVENT, SINGLE_EVENT)))
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .placeholder("(default)")
                .value("")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(CARDINALITY_KEY);

        properties().checkError(true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Object model: the event lives on the declaration's `events` list.
        WorkflowUtil.requireDurableAgentObjectTarget(sourceBuilder);
        if (WorkflowUtil.isCapabilityDeleteRequest(sourceBuilder)) {
            return WorkflowUtil.removeAgentCapabilityEntry(sourceBuilder);
        }
        String eventName = sourceBuilder.getProperty(NAME_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        if (eventName.isBlank()) {
            throw new UserFacingException("An event name is required");
        }
        String requestType = sourceBuilder.getProperty(REQUEST_TYPE_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String responseType = sourceBuilder.getProperty(RESPONSE_TYPE_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String cardinality = sourceBuilder.getProperty(CARDINALITY_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        StringBuilder entry = new StringBuilder("{name: ")
                .append(WorkflowUtil.constantNameLiteral(eventName))
                .append(", request: ").append(requestType.isBlank() ? DEFAULT_REQUEST_TYPE : requestType);
        if (!responseType.isBlank()) {
            entry.append(", response: ").append(responseType);
        }
        // MULTI_EVENT is the module default; only a SINGLE_EVENT opt-in is written out.
        if (SINGLE_EVENT.equals(cardinality)) {
            entry.append(", cardinality: ").append(WORKFLOW_MODULE).append(":").append(SINGLE_EVENT);
        }
        entry.append("}");
        return WorkflowUtil.upsertAgentCapabilityEntry(sourceBuilder, "events", entry.toString());
    }

}
