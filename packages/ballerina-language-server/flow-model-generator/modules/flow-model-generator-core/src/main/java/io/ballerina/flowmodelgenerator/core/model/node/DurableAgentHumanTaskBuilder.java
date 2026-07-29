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
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_HUMAN_TASK_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_HUMAN_TASK_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_HUMAN_TASK_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Registers a human task the durable agent can create and wait on. Generates
 * {@code check ctx.registerHumanTask(<taskName>, <userRoles>, title = ..., description = ...);}.
 *
 * @since 1.8.0
 */
public class DurableAgentHumanTaskBuilder extends CallBuilder {

    public static final String TASK_NAME_KEY = "taskName";
    // Signature parameters surfaced when a call is re-read from source.
    public static final String RESULT_TYPE_KEY = "resultType";
    public static final String TIMEOUT_KEY = "timeout";
    public static final String USER_ROLES_KEY = "userRoles";
    public static final String TITLE_KEY = "title";
    public static final String DESCRIPTION_KEY = "description";
    private static final String STRING_TYPE = "string";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DURABLE_AGENT_HUMAN_TASK;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(REGISTER_HUMAN_TASK_LABEL).description(REGISTER_HUMAN_TASK_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_HUMAN_TASK)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(AGENT_CONTEXT_CLASS_NAME)
                .symbol(REGISTER_HUMAN_TASK_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();
        addStringProperty(TASK_NAME_KEY, "Task Name",
                "Identifies the task type; also the tool name advertised to the agent",
                "approveRequest", true);
        addStringProperty(USER_ROLES_KEY, "User Roles",
                "Role(s) permitted to complete this task", "MANAGER", true);
        // The completion type drives the task inbox's completion form (schema generation and
        // runtime validation of the submitted payload) — typically a record type.
        properties().custom()
                .metadata()
                    .label("Completion Type")
                    .description("The type of the result a person submits when completing this task; "
                            + "drives the completion form rendered in the task inbox")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .ballerinaType("")
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .placeholder("ApprovalResult")
                .value("")
                .editable(true)
                .stepOut()
                .addProperty(RESULT_TYPE_KEY);
        addStringProperty(TITLE_KEY, "Title",
                "Short summary shown in the task inbox", "", false);
        addDocTextProperty(DESCRIPTION_KEY, "Description",
                "Context shown to the person completing the task");
        // Deadline for the task: on expiry the agent is told the task timed out so it
        // can react. Rendered with a timer badge on the capability when configured.
        properties().custom()
                .metadata()
                    .label("Timeout")
                    .description("Maximum time to wait for completion, e.g. {hours: 4}. On expiry "
                            + "the agent is told the task timed out so it can react; omit to wait "
                            + "indefinitely")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("time:Duration?")
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .originalName(TIMEOUT_KEY)
                    .stepOut()
                .placeholder("{hours: 4}")
                .value("")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(TIMEOUT_KEY);
        properties().checkError(true);
    }

    // Multi-line text field (rendered as a text area) with an expression fallback.
    private void addDocTextProperty(String key, String label, String doc) {
        properties().custom()
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.DOC_TEXT)
                    .ballerinaType(STRING_TYPE)
                    .selected(true)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(STRING_TYPE)
                    .selected(false)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(key);
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

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Object model: the human task lives on the declaration's `humanTasks` list.
        if (WorkflowUtil.isDurableAgentObjectTarget(sourceBuilder)) {
            if (WorkflowUtil.isCapabilityDeleteRequest(sourceBuilder)) {
                return WorkflowUtil.removeAgentCapabilityEntry(sourceBuilder);
            }
            String name = sourceBuilder.getProperty(TASK_NAME_KEY)
                    .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
            if (name.isBlank()) {
                throw new IllegalStateException("A human task name is required");
            }
            String roles = sourceBuilder.getProperty(USER_ROLES_KEY)
                    .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
            String title = sourceBuilder.getProperty(TITLE_KEY)
                    .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
            String taskDescription = sourceBuilder.getProperty(DESCRIPTION_KEY)
                    .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
            String resultType = sourceBuilder.getProperty(RESULT_TYPE_KEY)
                    .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
            String timeout = sourceBuilder.getProperty(TIMEOUT_KEY)
                    .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
            StringBuilder entry = new StringBuilder("{name: ").append(WorkflowUtil.quoteIfPlain(name))
                    .append(", roles: ").append(roles.isBlank() ? "\"manager\""
                            : WorkflowUtil.quoteIfPlain(roles));
            if (!resultType.isBlank()) {
                entry.append(", resultType: ").append(resultType);
            }
            if (!title.isBlank()) {
                entry.append(", title: ").append(WorkflowUtil.quoteIfPlain(title));
            }
            if (!taskDescription.isBlank()) {
                entry.append(", description: ").append(WorkflowUtil.quoteIfPlain(taskDescription));
            }
            if (!timeout.isBlank()) {
                entry.append(", timeout: ").append(timeout);
            }
            entry.append("}");
            return WorkflowUtil.upsertAgentCapabilityEntry(sourceBuilder, "humanTasks", entry.toString());
        }

        String ctxParamName = WorkflowUtil.resolveAgentContextParamName(sourceBuilder);
        String taskName = sourceBuilder.getProperty(TASK_NAME_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(DurableAgentHumanTaskBuilder::quotedIfText)
                .orElseThrow(() -> new IllegalStateException("Task name is required"));
        String userRoles = sourceBuilder.getProperty(USER_ROLES_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(DurableAgentHumanTaskBuilder::quotedIfText)
                .orElseThrow(() -> new IllegalStateException("User roles are required"));

        sourceBuilder.token()
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .name(ctxParamName)
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(REGISTER_HUMAN_TASK_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(taskName)
                .keyword(SyntaxKind.COMMA_TOKEN)
                .name(userRoles);

        appendNamedArg(sourceBuilder, RESULT_TYPE_KEY);
        appendNamedArg(sourceBuilder, TITLE_KEY);
        appendNamedArg(sourceBuilder, DESCRIPTION_KEY);
        appendNamedArg(sourceBuilder, TIMEOUT_KEY);

        sourceBuilder.token()
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }


    // Renders a string-valued field: TEXT-mode values are quoted (with escaping) while
    // expression-mode values pass through as written.
    private static String quotedIfText(Property property) {
        String value = property.value() == null ? "" : property.value().toString();
        boolean textSelected = property.types() == null || property.types().stream()
                .anyMatch(type -> (type.fieldType() == Property.ValueType.TEXT
                        || type.fieldType() == Property.ValueType.DOC_TEXT) && type.selected());
        if (!textSelected || (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2)) {
            return property.toSourceCode();
        }
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static void appendNamedArg(SourceBuilder sourceBuilder, String key) {
        Optional<Property> property = sourceBuilder.getProperty(key);
        String value = property.map(p -> p.value() == null ? "" : p.value().toString()).orElse("");
        if (!value.isBlank()) {
            sourceBuilder.token()
                    .keyword(SyntaxKind.COMMA_TOKEN)
                    .name(key)
                    .keyword(SyntaxKind.EQUAL_TOKEN)
                    .name(value);
        }
    }
}
