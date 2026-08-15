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
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SEND_DATA_CHILD_WORKFLOW_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SEND_DATA_CHILD_WORKFLOW_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.SEND_DATA_CHILD_WORKFLOW_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents sending a data event to a running child workflow. Generates a
 * {@code ctx->sendDataToChildWorkflow(childWorkflowId, dataName, data)} call; the child
 * receives it on the matching {@code future} field of its data-events record.
 *
 * <p>Generated source example:
 * <pre>{@code
 * check ctx->sendDataToChildWorkflow(disbursementId, "fundsRelease", release);
 * }</pre>
 *
 * @since 1.9.0
 */
public class ChildWorkflowSendDataBuilder extends NodeBuilder {

    public static final String LABEL = SEND_DATA_CHILD_WORKFLOW_LABEL;
    public static final String DESCRIPTION = SEND_DATA_CHILD_WORKFLOW_DESCRIPTION;

    public static final String CHILD_WORKFLOW_ID_KEY = "childWorkflowId";
    public static final String WORKFLOW_NAME_KEY = "workflow";
    public static final String WORKFLOW_NAME_LABEL = "Child Workflow";
    public static final String WORKFLOW_NAME_DOC =
            "The workflow the child workflow ID belongs to; its data events are offered below";
    public static final String DATA_NAME_KEY = "dataName";
    public static final String DATA_KEY = "data";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.CHILD_WORKFLOW_SEND_DATA)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(SEND_DATA_CHILD_WORKFLOW_METHOD_NAME);
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

        // Which workflow the ID belongs to is not derivable from the ID expression, and the data
        // event has to be picked from that workflow's declared channels — so the form asks for
        // the workflow, then the channel, the way the plain send-data form does.
        properties().custom()
                .metadata()
                    .label(WORKFLOW_NAME_LABEL)
                    .description(WORKFLOW_NAME_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(SendDataBuilder.getAvailableWorkflowFunctions(context))
                    .selected(true)
                    .stepOut()
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(WORKFLOW_NAME_KEY);

        properties().custom()
                .metadata()
                    .label("Data Event")
                    .description("The data event name: the field name of the child workflow's "
                            + "data-events record this payload is delivered to.")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .ballerinaType("string")
                    .options(List.of())
                    .selected(true)
                    .stepOut()
                .placeholder("\"dataName\"")
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(DATA_NAME_KEY);

        properties().custom()
                .metadata()
                    .label("Data")
                    .description("The payload to send; must match the data event's declared type.")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("anydata").selected(true).stepOut()
                .placeholder("")
                .editable(true)
                .stepOut()
                .addProperty(DATA_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        String childWorkflowId = sourceBuilder.getProperty(CHILD_WORKFLOW_ID_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElseThrow(() -> new IllegalStateException(
                        "A child workflow ID expression is required for CHILD_WORKFLOW_SEND_DATA"));
        String dataName = sourceBuilder.getProperty(DATA_NAME_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElseThrow(() -> new IllegalStateException(
                        "A data name is required for CHILD_WORKFLOW_SEND_DATA"));
        String data = sourceBuilder.getProperty(DATA_KEY)
                .map(p -> p.value().toString())
                .filter(value -> !value.isBlank())
                .orElseThrow(() -> new IllegalStateException(
                        "A data payload expression is required for CHILD_WORKFLOW_SEND_DATA"));

        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        sourceBuilder.token()
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(SEND_DATA_CHILD_WORKFLOW_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(childWorkflowId)
                .keyword(SyntaxKind.COMMA_TOKEN)
                .whiteSpace()
                // The data name correlates with an event declared by the child workflow function,
                // so it must always be a string literal even when the form submits the bare name.
                .name(SendDataBuilder.toStringLiteral(dataName))
                .keyword(SyntaxKind.COMMA_TOKEN)
                .whiteSpace()
                .name(data)
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }
}
