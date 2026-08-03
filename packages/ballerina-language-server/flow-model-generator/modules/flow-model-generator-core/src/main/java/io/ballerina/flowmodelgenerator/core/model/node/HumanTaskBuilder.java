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
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CALL_HUMAN_TASK_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.HUMAN_TASK_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.HUMAN_TASK_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents a workflow human task node. Generates a {@code ctx->awaitHumanTask(...)} call
 * that blocks until a human completes the task or the optional timeout elapses.
 *
 * <p>Generated source example:
 * <pre>{@code
 * ApprovalDecision result = check ctx->awaitHumanTask("approveExpense", ["FINANCE_APPROVER"],
 *         payload = {"amount": 1200},
 *         title = "Approve order",
 *         timeout = {hours: 24});
 * }</pre>
 *
 * @since 1.9.0
 */
public class HumanTaskBuilder extends CallBuilder {

    public static final String LABEL = HUMAN_TASK_LABEL;
    public static final String DESCRIPTION = HUMAN_TASK_DESCRIPTION;
    // A human task typically completes with an approve/reject decision, so the completion type
    // defaults to boolean (the user can still pick any concrete type).
    public static final String DEFAULT_RETURN_TYPE = "boolean";
    // The human task result type is the data a human submits to complete the task, so it is labelled
    // as the task's "completion type" rather than a generic databinding/return type.
    public static final String COMPLETION_TYPE_LABEL = "Completion Type";
    public static final String COMPLETION_TYPE_DESCRIPTION =
            "The type of the data returned when the human task is completed";

    // awaitHumanTask parameter names (keys). Public so CodeAnalyzer can reuse them when re-reading
    // a human task call from source, keeping the template and source-analysis paths in sync.
    public static final String TASK_NAME_KEY = "taskName";
    public static final String USER_ROLES_KEY = "userRoles";
    public static final String PAYLOAD_KEY = "payload";
    public static final String TITLE_KEY = "title";
    public static final String DESCRIPTION_KEY = "description";
    public static final String TIMEOUT_KEY = "timeout";

    // Form field labels.
    private static final String TASK_NAME_LABEL = "Task Name";
    private static final String USER_ROLES_LABEL = "User Roles";
    private static final String PAYLOAD_LABEL = "Payload";
    private static final String TITLE_LABEL = "Title";
    private static final String DESCRIPTION_LABEL = "Description";
    private static final String TIMEOUT_LABEL = "Timeout";

    // Form field descriptions.
    private static final String TASK_NAME_DOC = "Identifies the task type";
    private static final String USER_ROLES_DOC = "One or more roles permitted to complete this task";
    private static final String PAYLOAD_DOC = "Read-only JSON object shown alongside the form";
    private static final String TITLE_DOC = "Short summary shown in the inbox";
    private static final String DESCRIPTION_DOC = "Additional context shown alongside the form";
    private static final String TIMEOUT_DOC = "Maximum time to wait; omit to wait indefinitely";

    // Ballerina type signatures used by the fallback form fields.
    private static final String STRING_TYPE = "string";
    private static final String OPTIONAL_STRING_TYPE = "string?";

    // Default result variable name and the error-union suffix appended to unchecked calls.
    private static final String DEFAULT_RESULT_VAR = "result";
    private static final String ERROR_UNION_SUFFIX = "|error";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.HUMAN_TASK;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.REMOTE;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.HUMAN_TASK)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(CALL_HUMAN_TASK_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.HUMAN_TASK)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(CONTEXT_CLASS_NAME)
                .symbol(CALL_HUMAN_TASK_METHOD_NAME);

        boolean fallbackTemplate = false;
        try {
            ModuleInfo workflowModuleInfo = new ModuleInfo(WORKFLOW_ORG, WORKFLOW_MODULE, WORKFLOW_MODULE, null);
            FunctionData functionData = new FunctionDataBuilder()
                    .name(CALL_HUMAN_TASK_METHOD_NAME)
                    .moduleInfo(workflowModuleInfo)
                    .parentSymbolType(CONTEXT_CLASS_NAME)
                    .functionResultKind(FunctionData.Kind.REMOTE)
                    .project(PackageUtil.loadProject(context.workspaceManager(), context.filePath()))
                    .userModuleInfo(moduleInfo)
                    .workspaceManager(context.workspaceManager())
                    .filePath(context.filePath())
                    .build();

            if (functionData == null || functionData.parameters() == null || functionData.parameters().isEmpty()) {
                fallbackTemplate = true;
            } else {
                Module module = context.workspaceManager().module(context.filePath()).orElse(null);
                // Build each parameter (taskName, userRoles, payload, title, description, timeout) with its
                // real compiler-derived type metadata, and let the inferred {@code typedesc<anydata> T}
                // parameter become a rich result-type selector (record-field-selector for record types) —
                // the same mechanism the builtin Call REST activity uses for its databinding type.
                setParameterProperties(functionData, module);
                // Re-key the inferred type to the canonical databindingType/"Databinding Type" form.
                normalizeDatabindingTypeProperty(this);

                // The inferred result type defaults to anydata until the user picks a concrete type.
                Property resultType = properties().build().get(DATABINDING_TYPE_KEY);
                if (resultType != null && (resultType.value() == null || resultType.value().toString().isEmpty())) {
                    properties().build().put(DATABINDING_TYPE_KEY,
                            Property.Builder.copyFrom(resultType).value(DEFAULT_RETURN_TYPE).build());
                }
            }
        } catch (RuntimeException e) {
            // awaitHumanTask may not be resolvable yet, or project/dependency loading may fail.
            // Use a stable, static form so opening/editing HUMAN_TASK nodes still works.
            fallbackTemplate = true;
        }

        if (fallbackTemplate) {
            setFallbackHumanTaskProperties();
        }

        // Apply friendly form labels/descriptions without discarding the rich type metadata above.
        relabelHumanTaskFormProperties(properties().build());

        properties().data(Property.RESULT_NAME, context.getAllVisibleSymbolNames(),
                Property.RESULT_NAME, Property.RESULT_DOC, false);

        properties().checkError(true);
    }

    private void setFallbackHumanTaskProperties() {
        // No source values available in the template path; pass an empty value map.
        addFallbackHumanTaskParameters(this, Map.of());

        // Inferred databinding type — bare type selector when the module signature is unavailable.
        properties().custom()
                .metadata()
                    .label(COMPLETION_TYPE_LABEL)
                    .description(COMPLETION_TYPE_DESCRIPTION)
                    .stepOut()
                .type().fieldType(Property.ValueType.TYPE).ballerinaType(DEFAULT_RETURN_TYPE).selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.PARAM_FOR_TYPE_INFER.name()).originalName(DATABINDING_TYPE_KEY)
                    .stepOut()
                .value(DEFAULT_RETURN_TYPE)
                .editable(true)
                .stepOut()
                .addProperty(DATABINDING_TYPE_KEY);
    }

    /**
     * Builds the {@code awaitHumanTask} form parameters (taskName, userRoles, payload, title, description,
     * timeout) into {@code nodeBuilder}, in their canonical order. Shared by the node-template fallback
     * ({@link #setFallbackHumanTaskProperties}, with an empty value map) and {@code CodeAnalyzer}'s source
     * re-read path (with values parsed from the call arguments), so both render an identical form. A
     * {@code null} value yields a field with no preset value; callers normalize empty strings to {@code null}.
     *
     * @param nodeBuilder the builder to attach the properties to
     * @param values      param-name to source value; absent/{@code null} entries produce an empty field
     */
    public static void addFallbackHumanTaskParameters(NodeBuilder nodeBuilder, Map<String, String> values) {
        nodeBuilder.properties().custom()
                .metadata()
                    .label(TASK_NAME_LABEL)
                    .description(TASK_NAME_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType(STRING_TYPE).selected(true).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(STRING_TYPE).selected(false).stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).originalName(TASK_NAME_KEY).stepOut()
                .value(values.get(TASK_NAME_KEY))
                .editable(true)
                .stepOut()
                .addProperty(TASK_NAME_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(USER_ROLES_LABEL)
                    .description(USER_ROLES_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("string|string[]").selected(true)
                    .stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).originalName(USER_ROLES_KEY).stepOut()
                .value(values.get(USER_ROLES_KEY))
                .editable(true)
                .stepOut()
                .addProperty(USER_ROLES_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(PAYLOAD_LABEL)
                    .description(PAYLOAD_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("map<json>").selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.DEFAULTABLE.name()).originalName(PAYLOAD_KEY).stepOut()
                .value(values.get(PAYLOAD_KEY))
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(PAYLOAD_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(TITLE_LABEL)
                    .description(TITLE_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType(OPTIONAL_STRING_TYPE).selected(true).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING_TYPE).selected(false)
                    .stepOut()
                .codedata().kind(ParameterData.Kind.DEFAULTABLE.name()).originalName(TITLE_KEY).stepOut()
                .value(values.get(TITLE_KEY))
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(TITLE_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(DESCRIPTION_LABEL)
                    .description(DESCRIPTION_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType(OPTIONAL_STRING_TYPE).selected(true).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING_TYPE).selected(false)
                    .stepOut()
                .codedata().kind(ParameterData.Kind.DEFAULTABLE.name()).originalName(DESCRIPTION_KEY).stepOut()
                .value(values.get(DESCRIPTION_KEY))
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(DESCRIPTION_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(TIMEOUT_LABEL)
                    .description(TIMEOUT_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("time:Duration?").selected(true)
                    .stepOut()
                .codedata().kind(ParameterData.Kind.DEFAULTABLE.name()).originalName(TIMEOUT_KEY).stepOut()
                .value(values.get(TIMEOUT_KEY))
                .editable(true)
                .optional(true)
                .stepOut()
                .addProperty(TIMEOUT_KEY);
    }

    /**
     * Applies friendly form labels and descriptions to the {@code awaitHumanTask} properties without
     * discarding their compiler-derived type metadata (type symbols, imports, record-field selectors).
     * Shared by the template ({@link #setConcreteTemplateData}) and the source re-read path in
     * {@code CodeAnalyzer}, so both render an identical, type-aware form.
     *
     * @param properties the live property map to relabel in place
     */
    public static void relabelHumanTaskFormProperties(Map<String, Property> properties) {
        relabel(properties, TASK_NAME_KEY, TASK_NAME_LABEL, TASK_NAME_DOC);
        relabel(properties, USER_ROLES_KEY, USER_ROLES_LABEL, USER_ROLES_DOC);
        relabel(properties, PAYLOAD_KEY, PAYLOAD_LABEL, PAYLOAD_DOC);
        relabel(properties, TITLE_KEY, TITLE_LABEL, TITLE_DOC);
        relabel(properties, DESCRIPTION_KEY, DESCRIPTION_LABEL, DESCRIPTION_DOC);
        relabel(properties, TIMEOUT_KEY, TIMEOUT_LABEL, TIMEOUT_DOC);
        // The inferred result type is the human task's completion type; re-label it from the generic
        // "Databinding Type" set by CallBuilder.normalizeDatabindingTypeProperty. Must run after
        // normalization so the DATABINDING_TYPE_KEY property exists.
        relabel(properties, DATABINDING_TYPE_KEY, COMPLETION_TYPE_LABEL, COMPLETION_TYPE_DESCRIPTION);
    }

    private static void relabel(Map<String, Property> properties, String key, String label, String description) {
        Property existing = properties.get(key);
        if (existing == null) {
            return;
        }
        properties.put(key, Property.Builder.copyFrom(existing)
                .metadata().label(label).description(description).stepOut()
                .build());
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        Optional<Property> typeProp = sourceBuilder.getProperty(DATABINDING_TYPE_KEY);
        Optional<Property> variableProp = sourceBuilder.getProperty(Property.VARIABLE_KEY);
        Optional<Property> checkErrorProp = sourceBuilder.getProperty(Property.CHECK_ERROR_KEY);

        String resultType = normalizeResultType(typeProp
                .map(p -> p.value() != null ? p.value().toString() : DEFAULT_RETURN_TYPE)
                .orElse(DEFAULT_RETURN_TYPE));
        String variableName = variableProp
                .map(p -> p.value() != null ? p.value().toString() : DEFAULT_RESULT_VAR)
                .orElse(DEFAULT_RESULT_VAR);
        boolean useCheck = checkErrorProp
                .map(p -> p.value() == null || !"false".equals(p.value().toString()))
                .orElse(true);

        // Required positional args. taskName and userRoles are required by the awaitHumanTask signature,
        // so surface a validation error when they are missing rather than silently emitting an empty
        // value (in particular, never fall back to a privileged role for userRoles). Use toSourceCode()
        // (not the raw value) so structured/templated values are converted to valid Ballerina source.
        String taskName = sourceBuilder.getProperty(TASK_NAME_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(Property::toSourceCode)
                .orElseThrow(() -> new IllegalStateException(
                        "A task name is required for the human task. Provide a value for '"
                                + TASK_NAME_LABEL + "'."));
        String userRoles = sourceBuilder.getProperty(USER_ROLES_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .map(Property::toSourceCode)
                .orElseThrow(() -> new IllegalStateException(
                        "At least one user role is required for the human task. Provide a value for '"
                                + USER_ROLES_LABEL + "'."));

        // Optional named args (only when the user provided a value)
        List<String> callArgs = new ArrayList<>();
        callArgs.add(taskName);
        callArgs.add(userRoles);
        addNamedArg(sourceBuilder, callArgs, PAYLOAD_KEY);
        addNamedArg(sourceBuilder, callArgs, TITLE_KEY);
        addNamedArg(sourceBuilder, callArgs, DESCRIPTION_KEY);
        addNamedArg(sourceBuilder, callArgs, TIMEOUT_KEY);

        String ctxParamName = ActivityCallBuilder.resolveContextParamName(sourceBuilder);

        sourceBuilder.token()
                .name(useCheck ? resultType : resultType + ERROR_UNION_SUFFIX)
                .whiteSpace()
                .name(variableName)
                .whiteSpace()
                .keyword(SyntaxKind.EQUAL_TOKEN);

        if (useCheck) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        sourceBuilder.token()
                .name(ctxParamName)
                .keyword(SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(CALL_HUMAN_TASK_METHOD_NAME)
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(String.join(", ", callArgs))
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    private static void addNamedArg(SourceBuilder sourceBuilder, List<String> args, String key) {
        sourceBuilder.getProperty(key).ifPresent(p -> {
            // toSourceCode() converts structured values (e.g. a map<json> payload) into a Ballerina
            // literal; the raw value.toString() would emit the internal form-field object.
            String source = p.toSourceCode();
            if (source != null && !source.isEmpty()) {
                args.add(key + " = " + source);
            }
        });
    }

    /**
     * Strips any trailing {@code |error} from the stored result type so that the unchecked branch of
     * {@link #toSource} (which appends {@code |error}) does not produce a duplicated — and on each
     * round-trip, accumulating — {@code ...|error|error} union. When a human task binds to a generic
     * {@code T|error} variable, the inferred-type derivation keeps the {@code |error}; the result type
     * field is meant to hold only the success type {@code T}.
     */
    private static String normalizeResultType(String resultType) {
        String normalized = resultType.strip();
        while (normalized.endsWith(ERROR_UNION_SUFFIX)) {
            normalized = normalized.substring(0, normalized.length() - ERROR_UNION_SUFFIX.length()).strip();
        }
        return normalized.isEmpty() ? DEFAULT_RETURN_TYPE : normalized;
    }
}
