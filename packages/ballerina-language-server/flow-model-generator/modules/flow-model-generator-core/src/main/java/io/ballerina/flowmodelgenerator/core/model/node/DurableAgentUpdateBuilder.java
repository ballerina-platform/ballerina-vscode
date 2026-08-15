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
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FileSystemUtils;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_SEND_DATA_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_SEND_DATA_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_SEND_DATA_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Sends a data event to a running durable agent. Always generates
 * {@code string <token> = check <agent>.sendData(<instanceId>, <eventName>, <data>);} — the
 * correlation token for reading that turn's answer via Get Agent Data Result.
 *
 * @since 1.8.0
 */
public class DurableAgentUpdateBuilder extends FunctionCall {

    public static final String AGENT_KEY = "agent";
    public static final String AGENT_LABEL = "Durable Agentic Workflow";
    public static final String AGENT_DOC = "The durable agent to send the data event to";
    public static final String AGENT_ID_KEY = "agentId";
    public static final String AGENT_ID_LABEL = "Instance Id";
    public static final String AGENT_ID_DOC = "The running agent's instance ID (returned by `run`)";
    public static final String EVENT_NAME_KEY = "eventName";
    public static final String EVENT_NAME_LABEL = "Data Event";
    public static final String EVENT_NAME_DOC =
            "An event channel declared in the agent's `events`. New channels are declared on the "
                    + "durable agent itself (Add Data Event on the agent diagram), not here";
    public static final String DATA_KEY = "data";
    public static final String DATA_LABEL = "Data";
    public static final String DATA_DOC = "The data payload sent on the channel; must match its request type";

    private static final String STRING_TYPE = "string";
    private static final String DEFAULT_EVENT_NAME = "chat";
    private static final String DEFAULT_TOKEN_VAR = "eventToken";

    @Override
    public void setConcreteConstData() {
        metadata().label(AGENT_SEND_DATA_LABEL).description(AGENT_SEND_DATA_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_UPDATE)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .symbol(AGENT_SEND_DATA_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();
        SemanticModel semanticModel =
                FileSystemUtils.getSemanticModel(context.workspaceManager(), context.filePath());

        properties().custom()
                .metadata()
                    .label(AGENT_LABEL)
                    .description(AGENT_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(WorkflowUtil.durableAgentOptions(context.workspaceManager(), context.filePath()))
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(AGENT_KEY);

        properties().custom()
                .metadata()
                    .label(AGENT_ID_LABEL)
                    .description(AGENT_ID_DOC)
                    .stepOut()
                .typeWithExpression(semanticModel.types().STRING, moduleInfo)
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(AGENT_ID_KEY);

        // Channels are declared on the agent (Add Data Event), so the call site offers them
        // as a fixed dropdown; when the form targets a known agent only ITS channels are
        // offered, and the conversational default "chat" is offered when none is declared.
        String targetAgent = context.codedata() == null ? null : context.codedata().parentSymbol();
        List<Option> eventOptions = WorkflowUtil.declaredAgentEventOptions(
                context.workspaceManager(), context.filePath(), targetAgent);
        if (eventOptions.isEmpty()) {
            eventOptions = List.of(new Option(DEFAULT_EVENT_NAME, DEFAULT_EVENT_NAME));
        }
        properties().custom()
                .metadata()
                    .label(EVENT_NAME_LABEL)
                    .description(EVENT_NAME_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(eventOptions)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value(eventOptions.get(0).value())
                .editable(true)
                .stepOut()
                .addProperty(EVENT_NAME_KEY);

        properties().custom()
                .metadata()
                    .label(DATA_LABEL)
                    .description(DATA_DOC)
                    .stepOut()
                .typeWithExpression(semanticModel.types().ANYDATA, moduleInfo)
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(DATA_KEY);

        properties().data(DEFAULT_TOKEN_VAR, context.getAllVisibleSymbolNames(),
                Property.RESULT_NAME, Property.RESULT_DOC, false);
        properties().checkError(true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String agent = requireValue(sourceBuilder, AGENT_KEY, "A durable agent function must be selected");
        String agentId = requireValue(sourceBuilder, AGENT_ID_KEY, "The agent ID is required");
        // The event dropdown submits the bare channel name; sendData takes it as a string.
        String eventName = toStringLiteral(
                requireValue(sourceBuilder, EVENT_NAME_KEY, "The event name is required"));
        String data = requireValue(sourceBuilder, DATA_KEY, "The request payload is required");

        boolean checkError = FlowNodeUtil.hasCheckKeyFlagSet(sourceBuilder.flowNode);
        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null || p.value().toString().isEmpty()
                        ? DEFAULT_TOKEN_VAR : p.value().toString())
                .orElse(DEFAULT_TOKEN_VAR);

        // sendData always returns the turn's correlation token; the answer is read via
        // getDataResult/waitForDataResult (the Get Agent Data Result node).
        String expression = agent + "." + AGENT_SEND_DATA_METHOD_NAME
                + "(" + String.join(", ", List.of(agentId, eventName, data)) + ")";
        String resultType = STRING_TYPE;

        sourceBuilder.token()
                .name(checkError ? resultType : resultType + "|error")
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN);
        if (checkError) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
        sourceBuilder.token()
                .name(expression)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    // The channel name correlates with an event declared on the agent, so it is always emitted
    // as a string literal even when the form submits the bare name.
    private static String toStringLiteral(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed;
        }
        // The field is editable, so a free-form value can carry characters that would otherwise
        // close the literal early and produce source that does not compile.
        return "\"" + trimmed.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String requireValue(SourceBuilder sourceBuilder, String key, String message) {
        return sourceBuilder.getProperty(key)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(Property::toSourceCode)
                .orElseThrow(() -> new UserFacingException(message));
    }

}
