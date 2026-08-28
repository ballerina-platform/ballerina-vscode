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
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_START_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_START_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_START_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Starts a durable agent instance. Mirrors the driver signature
 * {@code run(string query, anydata input = ())} and generates
 * {@code string instanceId = check agent.run(query, input);} — always binding the new
 * instance ID, never the result (a durable agent may suspend for days on a human task).
 *
 * @since 1.8.0
 */
public class DurableAgentStartBuilder extends FunctionCall {

    public static final String AGENT_KEY = "agent";
    public static final String AGENT_LABEL = "Durable Agentic Workflow";
    public static final String AGENT_DOC = "The durable agent to start";
    public static final String QUERY_KEY = "query";
    public static final String QUERY_LABEL = "Query";
    public static final String QUERY_DOC = "The user turn appended to the agent's system prompt";
    public static final String INPUT_KEY = "input";
    public static final String INPUT_LABEL = "Input";
    public static final String INPUT_DOC = "Optional structured input for the run";

    private static final String STRING_TYPE = "string";
    private static final String ANYDATA_TYPE = "anydata";
    private static final String DEFAULT_RESULT_VAR = "instanceId";

    @Override
    public void setConcreteConstData() {
        metadata().label(AGENT_START_LABEL).description(AGENT_START_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_START)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .symbol(AGENT_START_METHOD_NAME);
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
                    .label(QUERY_LABEL)
                    .description(QUERY_DOC)
                    .stepOut()
                .typeWithExpression(semanticModel.types().STRING, moduleInfo)
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(QUERY_KEY);

        properties().custom()
                .metadata()
                    .label(INPUT_LABEL)
                    .description(INPUT_DOC)
                    .stepOut()
                .typeWithExpression(semanticModel.types().ANYDATA, moduleInfo)
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(INPUT_KEY);

        properties().data(DEFAULT_RESULT_VAR, context.getAllVisibleSymbolNames(),
                "Instance ID Variable Name", "Variable name to receive the new agent instance ID", false);
        properties().checkError(true);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String agent = requireValue(sourceBuilder, AGENT_KEY, "A durable agent must be selected");
        String query = requireValue(sourceBuilder, QUERY_KEY, "The query is required");
        Optional<String> input = sourceBuilder.getProperty(INPUT_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isBlank())
                .map(Property::toSourceCode);

        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null || p.value().toString().isBlank()
                        ? DEFAULT_RESULT_VAR : p.value().toString())
                .orElse(DEFAULT_RESULT_VAR);
        boolean checkError = FlowNodeUtil.hasCheckKeyFlagSet(sourceBuilder.flowNode);

        // run() returns string|error; without `check` the binding keeps the error in the union.
        sourceBuilder.token()
                .name(checkError ? STRING_TYPE : STRING_TYPE + "|error")
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN);
        if (checkError) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
        sourceBuilder.token()
                .name(agent + "." + AGENT_START_METHOD_NAME
                        + "(" + query + input.map(i -> ", " + i).orElse("") + ")")
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    static String requireValue(SourceBuilder sourceBuilder, String key, String message) {
        return sourceBuilder.getProperty(key)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(Property::toSourceCode)
                .orElseThrow(() -> new UserFacingException(message));
    }
}
