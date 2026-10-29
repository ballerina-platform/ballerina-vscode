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
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Document;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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
    private static final String DEFAULT_TOKEN_VAR = "eventToken";
    private static final String RESULT_DOC = "Name of the result variable: the correlation token to read the "
            + "channel's response with. Left aside on a one-way channel, which has no response to read";

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
        // offered. An agent that declares none offers none: inventing a default would name a
        // channel the agent cannot receive on, and the send would fail at runtime.
        String targetAgent = context.codedata() == null ? null : context.codedata().parentSymbol();
        List<Option> eventOptions = WorkflowUtil.declaredAgentEventOptions(
                context.workspaceManager(), context.filePath(), targetAgent);
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
                .value(eventOptions.isEmpty() ? "" : eventOptions.get(0).value())
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

        // Optional: a one-way channel's send has no readable result, and the token is discarded.
        properties().data(Property.RESULT_NAME, RESULT_DOC,
                NameUtil.generateVariableName(DEFAULT_TOKEN_VAR, context.getAllVisibleSymbolNames()), true);
        properties().checkError(true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String agent = requireValue(sourceBuilder, AGENT_KEY, "A durable agent function must be selected");
        String agentId = requireValue(sourceBuilder, AGENT_ID_KEY, "The agent ID is required");
        // The event dropdown submits the bare channel name; sendData takes it as a string.
        String eventName = WorkflowUtil.eventNameLiteral(
                requireValue(sourceBuilder, EVENT_NAME_KEY, "The event name is required"));
        String data = requireValue(sourceBuilder, DATA_KEY, "The request payload is required");

        boolean checkError = FlowNodeUtil.hasCheckKeyFlagSet(sourceBuilder.flowNode);
        // A cleared Result falls back to the same deduplicated name the template offered, so two
        // sends in one function do not declare the token twice.
        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null || p.value().toString().isEmpty() ? null : p.value().toString())
                .orElse(null);
        if (variableName == null) {
            variableName = NameUtil.generateVariableName(DEFAULT_TOKEN_VAR, visibleSymbolNames(sourceBuilder));
        }

        String expression = agent + "." + AGENT_SEND_DATA_METHOD_NAME
                + "(" + String.join(", ", List.of(agentId, eventName, data)) + ")";

        // sendData answers `string|error` on every channel: that value is the turn's correlation
        // token, never the channel's declared `response`. On a channel that declares one, the token
        // is what Get Agent Data Result reads the response with; on a one-way channel there is
        // nothing to read, the compiler plugin rejects any binding of the token (WORKFLOW_153 accepts only
        // `_ = ...`), and `_` cannot take the error member: the discard goes through `check`, or
        // `checkpanic` when Check Error is off. A declaration that cannot be read keeps the binding: the
        // compiler says which one it is, a silent discard would not.
        boolean oneWay = WorkflowUtil.agentEventDeclaresResponse(sourceBuilder.workspaceManager,
                sourceBuilder.filePath, agent, WorkflowUtil.capabilityName(eventName))
                .map(declares -> !declares).orElse(false);
        if (oneWay) {
            sourceBuilder.token().name("_").whiteSpace().keyword(SyntaxKind.EQUAL_TOKEN)
                    .keyword(checkError ? FlowNodeUtil.checkKeyword(sourceBuilder.flowNode)
                            : SyntaxKind.CHECKPANIC_KEYWORD);
        } else {
            sourceBuilder.token()
                    .name(checkError ? STRING_TYPE : STRING_TYPE + "|error")
                    .whiteSpace()
                    .name(variableName)
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN);
            if (checkError) {
                sourceBuilder.token().keyword(FlowNodeUtil.checkKeyword(sourceBuilder.flowNode));
            }
        }
        sourceBuilder.token()
                .name(expression)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    // The names in scope at the statement, as the template saw them.
    private static Set<String> visibleSymbolNames(SourceBuilder sourceBuilder) {
        Set<String> names = new HashSet<>();
        try {
            SemanticModel semanticModel =
                    FileSystemUtils.getSemanticModel(sourceBuilder.workspaceManager, sourceBuilder.filePath);
            Document document = FileSystemUtils.getDocument(sourceBuilder.workspaceManager, sourceBuilder.filePath);
            for (Symbol symbol : semanticModel.visibleSymbols(document,
                    sourceBuilder.flowNode.codedata().lineRange().startLine())) {
                symbol.getName().ifPresent(names::add);
            }
        } catch (RuntimeException e) {
            // Without the scope the plain default is still a valid name.
        }
        return names;
    }

    private static String requireValue(SourceBuilder sourceBuilder, String key, String message) {
        return sourceBuilder.getProperty(key)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(Property::toSourceCode)
                .orElseThrow(() -> new UserFacingException(message));
    }

}
