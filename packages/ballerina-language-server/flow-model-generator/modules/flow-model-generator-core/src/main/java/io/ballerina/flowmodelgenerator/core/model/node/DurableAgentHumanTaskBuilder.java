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
    // Named on the Duration record's type-member metadata only when the project pins no
    // ballerina/workflow version of its own; the resolved version wins.
    private static final String FALLBACK_WORKFLOW_VERSION = "0.8.0";

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
        // Optional: the module defaults the completion type to anydata (a free-form
        // completion form), so a declaration without resultType loads as a valid form.
        properties().custom()
                .metadata()
                    .label("Completion Type")
                    .description("The type of the result a person submits when completing this task; "
                            + "drives the completion form rendered in the task inbox. Defaults to "
                            + "anydata (a free-form completion form)")
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TYPE)
                    .ballerinaType("")
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .stepOut()
                .placeholder("ApprovalResult")
                .value("")
                .editable(true)
                .optional(true)
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
                    .ballerinaType("workflow:Duration?")
                    .typeMembers(java.util.List.of(new io.ballerina.flowmodelgenerator.core.model
                            .PropertyTypeMemberInfo("Duration",
                            "ballerina:workflow:" + WorkflowUtil.workflowModuleVersion(
                                    context.workspaceManager(), context.filePath(),
                                    FALLBACK_WORKFLOW_VERSION),
                            "workflow", "RECORD_TYPE", false)))
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.DEFAULTABLE.name())
                    .originalName(TIMEOUT_KEY)
                    .stepOut()
                .imports("ballerina/workflow")
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
        WorkflowUtil.requireDurableAgentObjectTarget(sourceBuilder);
        if (WorkflowUtil.isCapabilityDeleteRequest(sourceBuilder)) {
            return WorkflowUtil.removeAgentCapabilityEntry(sourceBuilder);
        }
        String name = sourceBuilder.getProperty(TASK_NAME_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        if (name.isBlank()) {
            throw new UserFacingException("A human task name is required");
        }
        String roles = sourceBuilder.getProperty(USER_ROLES_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        // Surface the omission rather than picking a role on the user's behalf — same stance as
        // the non-agent HumanTaskBuilder, which never falls back to a privileged role.
        if (roles.isBlank()) {
            throw new UserFacingException("At least one user role is required for the human task");
        }
        String title = sourceBuilder.getProperty(TITLE_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String taskDescription = sourceBuilder.getProperty(DESCRIPTION_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String resultType = sourceBuilder.getProperty(RESULT_TYPE_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String timeout = sourceBuilder.getProperty(TIMEOUT_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        StringBuilder entry = new StringBuilder("{name: ").append(WorkflowUtil.constantNameLiteral(name))
                .append(", roles: ").append(WorkflowUtil.quoteIfBareRole(roles));
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

}
