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
import io.ballerina.flowmodelgenerator.core.Constants.Workflow;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents the workflow context's utility functions (the "Workflow Functions" palette group).
 * Each variant generates a simple typed binding of a {@code ctx.<method>()} call:
 *
 * <pre>{@code
 * time:Utc now = ctx.currentTime();
 * boolean replaying = ctx.isReplaying();
 * string workflowId = check ctx.getWorkflowId();
 * string workflowType = check ctx.getWorkflowType();
 * }</pre>
 *
 * @since 1.9.0
 */
public abstract class WorkflowContextFunctionBuilder extends NodeBuilder {

    // The static shape of one context utility function. `takesTaskName` marks the two that accept
    // an optional task name; the rest take no arguments.
    public record FunctionSpec(NodeKind kind, String methodName, String label, String description,
                               String resultType, boolean returnsError, String defaultVariableName,
                               String importOrg, String importModule, boolean takesTaskName) {

        FunctionSpec(NodeKind kind, String methodName, String label, String description, String resultType,
                     boolean returnsError, String defaultVariableName, String importOrg, String importModule) {
            this(kind, methodName, label, description, resultType, returnsError, defaultVariableName,
                    importOrg, importModule, false);
        }
    }

    private static final FunctionSpec CURRENT_TIME_SPEC = new FunctionSpec(NodeKind.WORKFLOW_CURRENT_TIME,
            Workflow.CURRENT_TIME_METHOD_NAME, Workflow.CURRENT_TIME_LABEL, Workflow.CURRENT_TIME_DESCRIPTION,
            "time:Utc", false, "now", "ballerina", "time");
    private static final FunctionSpec IS_REPLAYING_SPEC = new FunctionSpec(NodeKind.WORKFLOW_IS_REPLAYING,
            Workflow.IS_REPLAYING_METHOD_NAME, Workflow.IS_REPLAYING_LABEL, Workflow.IS_REPLAYING_DESCRIPTION,
            "boolean", false, "replaying", null, null);
    private static final FunctionSpec GET_WORKFLOW_ID_SPEC = new FunctionSpec(NodeKind.WORKFLOW_GET_ID,
            Workflow.GET_WORKFLOW_ID_METHOD_NAME, Workflow.GET_WORKFLOW_ID_LABEL,
            Workflow.GET_WORKFLOW_ID_DESCRIPTION, "string", true, "workflowId", null, null);
    private static final FunctionSpec GET_WORKFLOW_TYPE_SPEC = new FunctionSpec(NodeKind.WORKFLOW_GET_TYPE,
            Workflow.GET_WORKFLOW_TYPE_METHOD_NAME, Workflow.GET_WORKFLOW_TYPE_LABEL,
            Workflow.GET_WORKFLOW_TYPE_DESCRIPTION, "string", true, "workflowType", null, null);
    private static final FunctionSpec LAST_HUMAN_TASK_COMPLETION_SPEC = new FunctionSpec(
            NodeKind.WORKFLOW_LAST_HUMAN_TASK_COMPLETION, Workflow.LAST_HUMAN_TASK_COMPLETION_METHOD_NAME,
            Workflow.LAST_HUMAN_TASK_COMPLETION_LABEL,
            Workflow.LAST_HUMAN_TASK_COMPLETION_DESCRIPTION, Workflow.HUMAN_TASK_COMPLETION_TYPE, false,
            "completion", null, null, true);
    private static final FunctionSpec LAST_REVIEW_DECISION_SPEC = new FunctionSpec(
            NodeKind.WORKFLOW_LAST_REVIEW_DECISION, Workflow.LAST_REVIEW_DECISION_METHOD_NAME,
            Workflow.LAST_REVIEW_DECISION_LABEL,
            Workflow.LAST_REVIEW_DECISION_DESCRIPTION, Workflow.REVIEW_DECISION_TYPE, false,
            "decision", null, null, true);

    // Every context utility function, by the method name a `ctx.<method>()` call carries, so
    // reading a workflow back can rebuild the same node the palette wrote. The specs live here
    // rather than on the subclasses so this map does not read a class that is not initialized yet.
    private static final Map<String, FunctionSpec> SPECS_BY_METHOD = Stream.of(
                    CURRENT_TIME_SPEC, IS_REPLAYING_SPEC, GET_WORKFLOW_ID_SPEC, GET_WORKFLOW_TYPE_SPEC,
                    LAST_HUMAN_TASK_COMPLETION_SPEC, LAST_REVIEW_DECISION_SPEC)
            .collect(Collectors.toMap(FunctionSpec::methodName, spec -> spec, (a, b) -> a, LinkedHashMap::new));

    public static FunctionSpec specForMethod(String methodName) {
        return SPECS_BY_METHOD.get(methodName);
    }

    private static final String VARIABLE_NAME_LABEL = "Variable Name";
    private static final String VARIABLE_NAME_DESCRIPTION = "Variable name to receive the value.";
    private static final String ASSIGNS_EXISTING_LABEL = "Assigns an existing variable";
    private static final String ASSIGNS_EXISTING_DESCRIPTION =
            "Whether the source assigns a variable that is already declared.";
    private static final String STRING_TYPE = "string";

    protected abstract FunctionSpec spec();

    @Override
    public void setConcreteConstData() {
        FunctionSpec spec = spec();
        metadata().label(spec.label()).description(spec.description());
        codedata()
                .node(spec.kind())
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(spec.methodName());
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();
        FunctionSpec spec = spec();
        String variableName = NameUtil.generateTypeName(spec.defaultVariableName(),
                context.getAllVisibleSymbolNames());
        addVariableProperty(this, variableName);
        if (spec.takesTaskName()) {
            addTaskNameProperty(this, "", false);
        }
    }

    // The name the call's result binds to. Reading a workflow back builds the same field, so the
    // form a saved call opens in is the one the palette wrote.
    public static void addVariableProperty(NodeBuilder nodeBuilder, String variableName) {
        nodeBuilder.properties().custom()
                .metadata()
                    .label(VARIABLE_NAME_LABEL)
                    .description(VARIABLE_NAME_DESCRIPTION)
                    .stepOut()
                // Selected explicitly: a field whose only mode is unselected renders as blank.
                .type().fieldType(Property.ValueType.IDENTIFIER).selected(true).stepOut()
                .value(variableName)
                .editable(true)
                .stepOut()
                .addProperty(Property.VARIABLE_KEY);
    }

    /**
     * The optional {@code taskName} argument: empty means the most recent task. It carries both a
     * text box and the expression editor, because a call may name the task with a constant rather
     * than a literal, and a decoded literal is otherwise indistinguishable from a reference.
     *
     * @param nodeBuilder the node being built
     * @param value       the decoded text, or the expression as written
     * @param expression  whether the value is an expression rather than text
     */
    public static void addTaskNameProperty(NodeBuilder nodeBuilder, String value, boolean expression) {
        nodeBuilder.properties().custom()
                .metadata()
                    .label(Workflow.CONTEXT_TASK_NAME_LABEL)
                    .description(Workflow.CONTEXT_TASK_NAME_DESCRIPTION)
                    .stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType(STRING_TYPE)
                    .selected(!expression).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(STRING_TYPE)
                    .selected(expression).stepOut()
                .value(value)
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(Workflow.CONTEXT_TASK_NAME_KEY);
    }

    // Whether the call was written as an assignment to a variable that already exists, rather than
    // a declaration. Hidden: the form has nothing to ask, but a save has to write back the same
    // statement shape or the variable would be declared a second time.
    public static void addAssignmentProperty(NodeBuilder nodeBuilder) {
        nodeBuilder.properties().custom()
                .metadata()
                    .label(ASSIGNS_EXISTING_LABEL)
                    .description(ASSIGNS_EXISTING_DESCRIPTION)
                    .stepOut()
                .type().fieldType(Property.ValueType.FLAG).selected(true).stepOut()
                .value(true)
                .editable(false)
                .optional(true)
                .hidden(true)
                .stepOut()
                .addProperty(Workflow.CONTEXT_ASSIGNS_EXISTING_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        FunctionSpec spec = spec();
        String variableName = sourceBuilder.getProperty(Property.VARIABLE_KEY)
                .map(p -> p.value() == null ? null : p.value().toString())
                .filter(value -> !value.isBlank())
                .orElse(spec.defaultVariableName());

        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        // A call read back from an assignment is written back as one: declaring its type again
        // would declare the variable twice.
        boolean assignsExisting = sourceBuilder.getProperty(Workflow.CONTEXT_ASSIGNS_EXISTING_KEY)
                .map(property -> property.value() != null && Boolean.parseBoolean(property.value().toString()))
                .orElse(false);
        if (!assignsExisting) {
            sourceBuilder.token().name(spec.resultType()).whiteSpace();
        }
        sourceBuilder.token()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN);
        if (spec.returnsError()) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
        sourceBuilder.token()
                .name(ctxParamName)
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(spec.methodName())
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN);
        if (spec.takesTaskName()) {
            sourceBuilder.getProperty(Workflow.CONTEXT_TASK_NAME_KEY)
                    .filter(property -> property.value() != null && !property.value().toString().isBlank())
                    .ifPresent(property -> {
                        // The text box holds decoded text, so it is escaped back into a literal
                        // unconditionally and keeps its own spaces, which are part of the name.
                        // The expression editor holds source, where surrounding space is not.
                        String taskName = property.value().toString();
                        sourceBuilder.token().name(WorkflowUtil.isExpressionModeSelected(property)
                                ? taskName.trim() : WorkflowUtil.stringLiteral(taskName));
                    });
        }
        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        sourceBuilder.textEdit().acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE);
        if (spec.importModule() != null) {
            sourceBuilder.acceptImport(spec.importOrg(), spec.importModule());
        }
        return sourceBuilder.build();
    }

    /** Generates {@code time:Utc now = ctx.currentTime();}. */
    public static class CurrentTime extends WorkflowContextFunctionBuilder {

        @Override
        protected FunctionSpec spec() {
            return CURRENT_TIME_SPEC;
        }
    }

    /** Generates {@code boolean replaying = ctx.isReplaying();}. */
    public static class IsReplaying extends WorkflowContextFunctionBuilder {

        @Override
        protected FunctionSpec spec() {
            return IS_REPLAYING_SPEC;
        }
    }

    /** Generates {@code string workflowId = check ctx.getWorkflowId();}. */
    public static class GetWorkflowId extends WorkflowContextFunctionBuilder {

        @Override
        protected FunctionSpec spec() {
            return GET_WORKFLOW_ID_SPEC;
        }
    }

    /** Generates {@code workflow:HumanTaskCompletion? completion = ctx.lastHumanTaskCompletion();}. */
    public static class LastHumanTaskCompletion extends WorkflowContextFunctionBuilder {

        @Override
        protected FunctionSpec spec() {
            return LAST_HUMAN_TASK_COMPLETION_SPEC;
        }
    }

    /** Generates {@code workflow:ReviewDecisionRecord? decision = ctx.lastReviewDecision();}. */
    public static class LastReviewDecision extends WorkflowContextFunctionBuilder {

        @Override
        protected FunctionSpec spec() {
            return LAST_REVIEW_DECISION_SPEC;
        }
    }

    /** Generates {@code string workflowType = check ctx.getWorkflowType();}. */
    public static class GetWorkflowType extends WorkflowContextFunctionBuilder {

        @Override
        protected FunctionSpec spec() {
            return GET_WORKFLOW_TYPE_SPEC;
        }
    }
}
