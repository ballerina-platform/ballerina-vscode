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
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FileSystemUtils;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_DATA_RESULT_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_DATA_RESULT_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_GET_DATA_RESULT_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_WAIT_DATA_RESULT_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Reads the agent's answer for a specific data-event turn by its correlation token. With Wait
 * for Answer checked it generates {@code string reply = check agent.waitForDataResult(instanceId,
 * token);}; unchecked it uses {@code getDataResult}, which returns a
 * {@code workflow:AgentBusyError} while the turn is unanswered.
 *
 * @since 1.8.0
 */
public class DurableAgentDataResultBuilder extends FunctionCall {

    public static final String AGENT_KEY = "agent";
    public static final String AGENT_LABEL = "Durable Agentic Workflow";
    public static final String AGENT_DOC = "The durable agent to read the answer from";
    public static final String AGENT_ID_KEY = "agentId";
    public static final String AGENT_ID_LABEL = "Instance Id";
    public static final String AGENT_ID_DOC = "The running agent's instance ID (returned by `run`)";
    public static final String TOKEN_KEY = "token";
    public static final String TOKEN_LABEL = "Correlation Token";
    public static final String TOKEN_DOC = "The correlation token returned by Send Agent Data Event";

    public static final String WAIT_KEY = "waitForAnswer";
    public static final String WAIT_LABEL = "Wait for Answer";
    public static final String WAIT_DOC = "Wait until the turn is answered (blocking). Uncheck to read "
            + "without waiting: while the turn is unanswered a workflow:AgentBusyError is returned - "
            + "check back later.";

    private static final String STRING_TYPE = "string";
    private static final String DEFAULT_RESULT_VAR = "agentReply";
    private static final String DEFAULT_RESULT_TYPE = "string";

    @Override
    public void setConcreteConstData() {
        metadata().label(AGENT_DATA_RESULT_LABEL).description(AGENT_DATA_RESULT_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_DATA_RESULT)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .symbol(AGENT_WAIT_DATA_RESULT_METHOD_NAME);
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

        properties().custom()
                .metadata()
                    .label(TOKEN_LABEL)
                    .description(TOKEN_DOC)
                    .stepOut()
                .typeWithExpression(semanticModel.types().STRING, moduleInfo)
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(TOKEN_KEY);

        properties().custom()
                .metadata()
                    .label(WAIT_LABEL)
                    .description(WAIT_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.FLAG).ballerinaType("boolean").selected(true).stepOut()
                .value("true")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(WAIT_KEY);

        // The read is dependently typed: the expected answer type is part of the driver
        // signature, so the form takes it as an editable parameter.
        properties().custom()
                .metadata()
                    .label("Result Type")
                    .description("The expected type of the agent's answer")
                    .stepOut()
                .type().fieldType(Property.ValueType.TYPE).ballerinaType(DEFAULT_RESULT_TYPE).selected(true).stepOut()
                .value(DEFAULT_RESULT_TYPE)
                .editable(true)
                .stepOut()
                .addProperty(Property.TYPE_KEY);
        properties().data(DEFAULT_RESULT_VAR, context.getAllVisibleSymbolNames(),
                Property.RESULT_NAME, Property.RESULT_DOC, false);
        properties().checkError(true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String agent = DurableAgentStartBuilder.requireValue(sourceBuilder, AGENT_KEY,
                "A durable agent must be selected");
        String agentId = DurableAgentStartBuilder.requireValue(sourceBuilder, AGENT_ID_KEY,
                "The agent instance ID is required");
        String token = DurableAgentStartBuilder.requireValue(sourceBuilder, TOKEN_KEY,
                "The correlation token is required");
        boolean waitForAnswer = sourceBuilder.getProperty(WAIT_KEY)
                .map(p -> p.value() == null || !"false".equals(p.value().toString()))
                .orElse(true);
        String resultType = sourceBuilder.getProperty(Property.TYPE_KEY)
                .map(p -> p.value() == null || p.value().toString().isBlank()
                        ? DEFAULT_RESULT_TYPE : p.value().toString())
                .orElse(DEFAULT_RESULT_TYPE);
        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null || p.value().toString().isBlank()
                        ? DEFAULT_RESULT_VAR : p.value().toString())
                .orElse(DEFAULT_RESULT_VAR);
        boolean checkError = FlowNodeUtil.hasCheckKeyFlagSet(sourceBuilder.flowNode);

        String method = waitForAnswer ? AGENT_WAIT_DATA_RESULT_METHOD_NAME : AGENT_GET_DATA_RESULT_METHOD_NAME;
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
                .name(agent + "." + method + "(" + agentId + ", " + token + ")")
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }
}
