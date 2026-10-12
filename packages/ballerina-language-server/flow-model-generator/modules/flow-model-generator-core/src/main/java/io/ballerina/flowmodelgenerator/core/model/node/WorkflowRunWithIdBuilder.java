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
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_IF_CLOSED_PARAM;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_IF_RUNNING_PARAM;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_INSTANCE_ID_PARAM;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_WITH_ID_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_WITH_ID_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_WITH_ID_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a workflow start node that generates {@code workflow:runWithId} calls: the Run Workflow form plus the
 * instance id the caller chooses and the policies for an id already held.
 *
 * @since 1.8.0
 */
public class WorkflowRunWithIdBuilder extends WorkflowRunBuilder {

    public static final String INSTANCE_ID_KEY = RUN_INSTANCE_ID_PARAM;
    public static final String INSTANCE_ID_LABEL = "Instance ID";
    public static final String INSTANCE_ID_DOC = "The instance id to start under, such as an order number";
    public static final String IF_RUNNING_KEY = RUN_IF_RUNNING_PARAM;
    public static final String IF_RUNNING_LABEL = "If Running";
    public static final String IF_RUNNING_DOC = "What to do when an instance with this id is running";
    public static final String IF_CLOSED_KEY = RUN_IF_CLOSED_PARAM;
    public static final String IF_CLOSED_LABEL = "If Closed";
    public static final String IF_CLOSED_DOC = "What to do when an instance with this id has closed";
    private static final String STRING = "string";
    private static final String RUNNING_POLICY_TYPE = "workflow:RunningInstancePolicy";
    private static final String CLOSED_POLICY_TYPE = "workflow:ClosedInstancePolicy";
    // The module's policies are string unions; their literals are what the call is written with.
    private static final List<Option> RUNNING_POLICIES = List.of(
            new Option("FAIL", "\"FAIL\""), new Option("USE_EXISTING", "\"USE_EXISTING\""));
    private static final List<Option> CLOSED_POLICIES = List.of(
            new Option("ALLOW_DUPLICATE", "\"ALLOW_DUPLICATE\""),
            new Option("ALLOW_DUPLICATE_FAILED_ONLY", "\"ALLOW_DUPLICATE_FAILED_ONLY\""),
            new Option("REJECT_DUPLICATE", "\"REJECT_DUPLICATE\""));

    @Override
    protected NodeKind nodeKind() {
        return NodeKind.WORKFLOW_RUN_WITH_ID;
    }

    @Override
    protected String label() {
        return RUN_WITH_ID_LABEL;
    }

    @Override
    protected String description() {
        return RUN_WITH_ID_DESCRIPTION;
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        super.setConcreteTemplateData(context);

        properties().custom()
                .metadata()
                    .label(INSTANCE_ID_LABEL)
                    .description(INSTANCE_ID_DOC)
                    .stepOut()
                // Text and expression, the same two modes the node offers when it is read back from source.
                .type().fieldType(Property.ValueType.TEXT).ballerinaType(STRING).selected(true).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(STRING).selected(false).stepOut()
                .placeholder("\"\"")
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(INSTANCE_ID_KEY);
        addPolicyProperty(IF_RUNNING_KEY, IF_RUNNING_LABEL, IF_RUNNING_DOC, RUNNING_POLICY_TYPE, RUNNING_POLICIES);
        addPolicyProperty(IF_CLOSED_KEY, IF_CLOSED_LABEL, IF_CLOSED_DOC, CLOSED_POLICY_TYPE, CLOSED_POLICIES);

        // The id follows the workflow it is for; the policies are advanced and come before the variable.
        WorkflowUtil.reorderProperties(properties().build(), WORKFLOW_NAME_KEY, INSTANCE_ID_KEY, INPUT_KEY,
                IF_RUNNING_KEY, IF_CLOSED_KEY, Property.VARIABLE_KEY);
    }

    private void addPolicyProperty(String key, String label, String doc, String type, List<Option> options) {
        properties().custom()
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .ballerinaType(type)
                    .options(options)
                    .selected(true)
                    .stepOut()
                .placeholder(options.getFirst().value())
                .value("")
                .optional(true)
                .advanced(true)
                .editable(true)
                .stepOut()
                .addProperty(key);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Generate: string workflowId = check workflow:runWithId(workflowFunction, instanceId, input, ifRunning = ...);
        startAssignment(sourceBuilder);
        String workflowFunction = workflowFunction(sourceBuilder);
        Optional<String> instanceId = propertyValue(sourceBuilder, INSTANCE_ID_KEY);
        if (instanceId.isEmpty() && !sourceBuilder.isForDiagnostics()) {
            throw new UserFacingException("Enter an id in the " + INSTANCE_ID_LABEL + " field");
        }

        sourceBuilder.token()
                .name(WORKFLOW_MODULE)
                .keyword(SyntaxKind.COLON_TOKEN)
                .name(RUN_WITH_ID_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(workflowFunction)
                .keyword(SyntaxKind.COMMA_TOKEN)
                .whiteSpace()
                .name(instanceId.orElse("\"\""));
        propertyValue(sourceBuilder, INPUT_KEY).ifPresent(input -> sourceBuilder.token()
                .keyword(SyntaxKind.COMMA_TOKEN)
                .whiteSpace()
                .name(input));
        // The policies are defaultable and the input may be left out, so they are written by name.
        for (String policy : List.of(IF_RUNNING_KEY, IF_CLOSED_KEY)) {
            propertyValue(sourceBuilder, policy).ifPresent(value -> sourceBuilder.token()
                    .keyword(SyntaxKind.COMMA_TOKEN)
                    .whiteSpace()
                    .name(policy)
                    .whiteSpace()
                    .keyword(SyntaxKind.EQUAL_TOKEN)
                    .name(value));
        }
        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }
}
