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

import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WAIT_CHILD_WORKFLOW_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WAIT_CHILD_WORKFLOW_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WAIT_CHILD_WORKFLOW_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a durable wait on a started child workflow. Generates a
 * {@code ctx->waitForChildWorkflow(childWorkflowId)} call that suspends until the child
 * completes and binds its result — the gather half of fan-out/fan-in composition.
 *
 * <p>Generated source example:
 * <pre>{@code
 * KycResult childResult = check ctx->waitForChildWorkflow(kycId);
 * }</pre>
 *
 * @since 1.9.0
 */
public class ChildWorkflowWaitBuilder extends NodeBuilder {

    public static final String LABEL = WAIT_CHILD_WORKFLOW_LABEL;
    public static final String DESCRIPTION = WAIT_CHILD_WORKFLOW_DESCRIPTION;

    public static final String CHILD_WORKFLOW_ID_KEY = "childWorkflowId";
    private static final String DEFAULT_VARIABLE_NAME = "childResult";
    private static final String DEFAULT_RESULT_TYPE = "json";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.CHILD_WORKFLOW_WAIT)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(WAIT_CHILD_WORKFLOW_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();

        properties().custom()
                .metadata()
                    .label("Child Workflow ID")
                    .description("The child workflow ID returned by Run Child Workflow.")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("string").selected(true).stepOut()
                .placeholder("childWorkflowId")
                .editable(true)
                .stepOut()
                .addProperty(CHILD_WORKFLOW_ID_KEY);

        // waitForChildWorkflow is dependently typed: a concrete contextually-expected type is
        // required, matching the child workflow's return type.
        properties().custom()
                .metadata()
                    .label("Result Type")
                    .description("Type of the child workflow's result.")
                    .stepOut()
                .type(Property.ValueType.TYPE)
                .value(DEFAULT_RESULT_TYPE)
                .editable(true)
                .stepOut()
                .addProperty(Property.TYPE_KEY);

        String resultVarName = NameUtil.generateTypeName(DEFAULT_VARIABLE_NAME,
                context.getAllVisibleSymbolNames());
        properties().custom()
                .metadata()
                    .label("Result Variable Name")
                    .description("Variable name to receive the child workflow's result.")
                    .stepOut()
                .type(Property.ValueType.IDENTIFIER)
                .value(resultVarName)
                .editable(true)
                .stepOut()
                .addProperty(Property.VARIABLE_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String childWorkflowId = sourceBuilder.getProperty(CHILD_WORKFLOW_ID_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString())
                .filter(value -> !value.isBlank())
                .orElseThrow(() -> new IllegalStateException(
                        "A child workflow ID expression is required for CHILD_WORKFLOW_WAIT"));
        String resultType = sourceBuilder.getProperty(Property.TYPE_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse(DEFAULT_RESULT_TYPE);
        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse(DEFAULT_VARIABLE_NAME);

        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        sourceBuilder.token()
                .name(resultType)
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN)
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(WAIT_CHILD_WORKFLOW_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(childWorkflowId)
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }
}
