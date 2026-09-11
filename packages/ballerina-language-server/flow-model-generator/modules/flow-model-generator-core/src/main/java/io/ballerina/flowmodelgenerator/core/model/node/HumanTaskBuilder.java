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

import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

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
 *         taskInput = {"amount": 1200},
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
    public static final String ADDITIONAL_VALUES_KEY = "additionalValues";
    public static final String TASK_INPUT_KEY = "taskInput";
    /**
     * The task input's name before 0.9.0 renamed it {@code taskInput}. Read, so a program written
     * against an older release opens in the form, and relabelled when a resolved signature of such a
     * release carries it; never written — the form emits the module's current name.
     */
    public static final String PAYLOAD_KEY = "payload";
    public static final String TITLE_KEY = "title";
    public static final String DESCRIPTION_KEY = "description";
    public static final String TIMEOUT_KEY = "timeout";
    /**
     * {@code awaitHumanTask(stepId = ...)} — the step's identity in the workflow graph, set by the
     * compiler when a call omits it. Not a form field; see
     * {@link #relabelHumanTaskFormProperties(Map)}.
     */
    public static final String STEP_ID_KEY = "stepId";
    /**
     * Two more {@code HumanTaskDefinition} fields the form does not offer. {@code resultType} is
     * the completion type, which the form already edits through the inferred {@code T} selector;
     * {@code taskInputType} constrains the input the decider sees, a shape the runtime derives
     * from the input itself. Hidden, not removed: a program that states either keeps it — see
     * {@link #relabelHumanTaskFormProperties(Map)}.
     */
    public static final String RESULT_TYPE_KEY = "resultType";
    public static final String TASK_INPUT_TYPE_KEY = "taskInputType";

    // Form field labels.
    private static final String TASK_NAME_LABEL = "Task Name";
    private static final String USER_ROLES_LABEL = "User Roles";
    private static final String TASK_INPUT_LABEL = "Task Input";
    private static final String TITLE_LABEL = "Title";
    private static final String PAYLOAD_LABEL = "Payload";
    private static final String DESCRIPTION_LABEL = "Description";
    private static final String TIMEOUT_LABEL = "Timeout";

    // Form field descriptions.
    private static final String TASK_NAME_DOC = "Identifies the task type";
    private static final String USER_ROLES_DOC = "One or more roles permitted to complete this task";
    // The input field's documentation. The module renamed the parameter — `payload` before 0.9.0,
    // `taskInput` after — and a resolved form carries whichever key the pinned bala declares, so both
    // spellings are needed. One template, so the wording cannot drift while the pre-rename pin lives.
    private static final String INPUT_DOC_TEMPLATE =
            "Read-only JSON object shown alongside the form. Required — a task with nothing to show "
                    + "says so with {}, and the runtime checks this against the task's %s";
    private static final String TASK_INPUT_DOC = INPUT_DOC_TEMPLATE.formatted("taskInputType");
    private static final String PAYLOAD_DOC = INPUT_DOC_TEMPLATE.formatted("payloadType");
    /** What an unstated task input is: a task that shows nothing, said explicitly. */
    private static final String EMPTY_TASK_INPUT = "{}";
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
                // Build each parameter (taskName, userRoles, taskInput, title, description, timeout) with its
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
     * Builds the {@code awaitHumanTask} form parameters (taskName, userRoles, taskInput, title, description,
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
                .codedata().kind(ParameterData.Kind.INCLUDED_FIELD.name()).originalName(USER_ROLES_KEY).stepOut()
                .value(values.get(USER_ROLES_KEY))
                .editable(true)
                .stepOut()
                .addProperty(USER_ROLES_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(TASK_INPUT_LABEL)
                    .description(TASK_INPUT_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("map<json>").selected(true).stepOut()
                .codedata().kind(ParameterData.Kind.REQUIRED.name()).originalName(TASK_INPUT_KEY).stepOut()
                // The task input is a required argument of awaitHumanTask, not a field of the
                // definition record: a task with nothing to show says so with `{}` rather than
                // by omission. The form defaults to `{}` for the same reason — leaving the
                // field blank would emit a call that does not compile.
                .value(values.get(TASK_INPUT_KEY) == null ? EMPTY_TASK_INPUT : values.get(TASK_INPUT_KEY))
                .editable(true)
                .optional(false)
                .stepOut()
                .addProperty(TASK_INPUT_KEY);

        nodeBuilder.properties().custom()
                .metadata()
                    .label(TITLE_LABEL)
                    .description(TITLE_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.TEXT).ballerinaType(OPTIONAL_STRING_TYPE).selected(true).stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType(OPTIONAL_STRING_TYPE).selected(false)
                    .stepOut()
                .codedata().kind(ParameterData.Kind.INCLUDED_FIELD.name()).originalName(TITLE_KEY).stepOut()
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
                .codedata().kind(ParameterData.Kind.INCLUDED_FIELD.name()).originalName(DESCRIPTION_KEY).stepOut()
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
                .type().fieldType(Property.ValueType.EXPRESSION).ballerinaType("workflow:Duration?").selected(true)
                    .stepOut()
                .codedata().kind(ParameterData.Kind.INCLUDED_FIELD.name()).originalName(TIMEOUT_KEY).stepOut()
                .imports("ballerina/workflow")
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
        // `stepId` identifies this step in the workflow's graph. It is optional and the compiler
        // generates one when a call omits it, so nothing needs it in the form — and offering it here
        // would put an identity among the task's business fields, with no advanced group to hold it.
        // Hide it until this form gains one; Call Activity already shows it under its advanced
        // configurations. Hidden, not removed: a call that names its step keeps that name through
        // an edit, because toSource writes every property that holds a value. Both render paths
        // (the node template and CodeAnalyzer's source re-read) go through here, so doing it once
        // keeps the two forms identical.
        hide(properties, STEP_ID_KEY);
        // 0.9.0 declares the task through an included record, and two of its fields have no place
        // in this form: resultType is what the Completion Type selector already edits, and
        // taskInputType is derived from the input. Both are hidden the same way as stepId, so a
        // program that states them keeps them through an edit.
        hide(properties, RESULT_TYPE_KEY);
        hide(properties, TASK_INPUT_TYPE_KEY);
        // The record's fields arrive after the positional parameters and the inferred type, which
        // puts the required roles below the type selector. The form is what it was before the
        // record: name, roles, input, then the optional details, then the completion type. Keys
        // the module does not declare are simply absent; anything else keeps its place after. Both
        // spellings of the description are named for the same reason `relabel` looks up both: the
        // signature-derived path escapes the reserved name to `$description`.
        reorder(properties, TASK_NAME_KEY, USER_ROLES_KEY, TASK_INPUT_KEY, PAYLOAD_KEY,
                TITLE_KEY, DESCRIPTION_KEY, FlowNodeUtil.getPropertyKey(DESCRIPTION_KEY),
                TIMEOUT_KEY, DATABINDING_TYPE_KEY);

        relabel(properties, TASK_NAME_KEY, TASK_NAME_LABEL, TASK_NAME_DOC);
        relabel(properties, USER_ROLES_KEY, USER_ROLES_LABEL, USER_ROLES_DOC);
        relabel(properties, TASK_INPUT_KEY, TASK_INPUT_LABEL, TASK_INPUT_DOC);
        // The pinned workflow bala still names this parameter `payload`; a resolved-signature
        // form therefore carries that key, and the emitted argument keeps the module's own
        // name, so the label must not pretend otherwise. Dies with the pre-rename pin.
        relabel(properties, PAYLOAD_KEY, PAYLOAD_LABEL, PAYLOAD_DOC);
        relabel(properties, TITLE_KEY, TITLE_LABEL, TITLE_DOC);
        relabel(properties, DESCRIPTION_KEY, DESCRIPTION_LABEL, DESCRIPTION_DOC);
        relabel(properties, TIMEOUT_KEY, TIMEOUT_LABEL, TIMEOUT_DOC);
        // The inferred result type is the human task's completion type; re-label it from the generic
        // "Databinding Type" set by CallBuilder.normalizeDatabindingTypeProperty. Must run after
        // normalization so the DATABINDING_TYPE_KEY property exists.
        relabel(properties, DATABINDING_TYPE_KEY, COMPLETION_TYPE_LABEL, COMPLETION_TYPE_DESCRIPTION);
    }

    /**
     * Folds a positional {@code HumanTaskOptions} record literal back into the form's option
     * properties, for a call written as {@code awaitHumanTask(taskName, taskInput, {title: ...})}.
     *
     * <p>Only the options argument is read. The required arguments come first, positionally, and the
     * task input among them is itself a record whose business fields may be named like an option —
     * a payload with a {@code title} is not the task's title. So every positional argument up to the
     * number of required parameters is skipped, and only properties that are fields of the options
     * record ({@link ParameterData.Kind#INCLUDED_FIELD}) take a value. A signature without an
     * options record has no such fields, and nothing is overlaid.
     *
     * @param properties the live property map, as built from the resolved signature
     * @param arguments  the call's arguments
     */
    public static void overlayOptionsLiteral(Map<String, Property> properties,
                                             SeparatedNodeList<FunctionArgumentNode> arguments) {
        long requiredCount = properties.values().stream()
                .filter(p -> p.codedata() != null
                        && ParameterData.Kind.REQUIRED.name().equals(p.codedata().kind()))
                .count();
        int position = 0;
        for (FunctionArgumentNode arg : arguments) {
            if (!(arg instanceof PositionalArgumentNode positional)) {
                continue;
            }
            int index = position++;
            if (index < requiredCount
                    || !(positional.expression() instanceof MappingConstructorExpressionNode mapping)) {
                continue;
            }
            for (MappingFieldNode field : mapping.fields()) {
                if (!(field instanceof SpecificFieldNode specificField) || specificField.valueExpr().isEmpty()) {
                    continue;
                }
                String name = specificField.fieldName().toSourceCode().strip();
                if (name.length() >= 2 && name.startsWith("\"") && name.endsWith("\"")) {
                    name = name.substring(1, name.length() - 1);
                }
                Property existing = properties.get(name);
                if (existing == null || existing.codedata() == null
                        || !ParameterData.Kind.INCLUDED_FIELD.name().equals(existing.codedata().kind())
                        || (existing.value() != null && !existing.value().toString().isEmpty())) {
                    continue;
                }
                properties.put(name, Property.Builder.copyFrom(existing)
                        .value(specificField.valueExpr().get().toSourceCode().strip())
                        .build());
            }
        }
    }

    // Keeps the property but takes it out of the form: not offered, not editable, still emitted
    // by toSource when it holds a value.
    private static void hide(Map<String, Property> properties, String key) {
        Property existing = properties.get(key);
        if (existing != null) {
            properties.put(key, Property.Builder.copyFrom(existing).hidden(true).editable(false).build());
        }
    }

    // Moves the named keys, those present, to the front in the given order; the rest follow in
    // their existing order. The map is rebuilt in place because callers hold the same instance.
    private static void reorder(Map<String, Property> properties, String... keysInOrder) {
        Map<String, Property> ordered = new LinkedHashMap<>();
        for (String key : keysInOrder) {
            Property property = properties.get(key);
            if (property != null) {
                ordered.put(key, property);
            }
        }
        for (Map.Entry<String, Property> entry : properties.entrySet()) {
            ordered.putIfAbsent(entry.getKey(), entry.getValue());
        }
        properties.clear();
        properties.putAll(ordered);
    }

    private static void relabel(Map<String, Property> properties, String key, String label, String description) {
        String actualKey = presentKey(properties, key);
        Property existing = properties.get(actualKey);
        if (existing == null) {
            return;
        }
        properties.put(actualKey, Property.Builder.copyFrom(existing)
                .metadata().label(label).description(description).stepOut()
                .build());
    }

    /**
     * The key a parameter's property actually sits under. The signature-derived path escapes a
     * reserved name — {@code description} lands under {@code $description} — while the fallback form
     * uses the plain name, so every lookup by parameter name tries the plain key first and the
     * escaped one second. Source generation needs no such lookup: it walks the properties and
     * writes each argument under its codedata original name.
     *
     * @param properties the node's properties
     * @param key        the parameter name as {@code awaitHumanTask} declares it
     * @return the plain key when present, else its reserved-escaped form
     */
    static String presentKey(Map<String, Property> properties, String key) {
        return properties.containsKey(key) ? key : FlowNodeUtil.getPropertyKey(key);
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

        // Required values. taskName is the only positional argument the signature keeps; the
        // rest — userRoles included — are fields of the HumanTaskOptions record and travel as
        // named arguments. Both are still required by the form: surface a validation error
        // when they are missing rather than silently emitting an empty value (in particular,
        // never fall back to a privileged role for userRoles).
        sourceBuilder.getProperty(TASK_NAME_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .orElseThrow(() -> new IllegalStateException(
                        "A task name is required for the human task. Provide a value for '"
                                + TASK_NAME_LABEL + "'."));
        sourceBuilder.getProperty(USER_ROLES_KEY)
                .filter(p -> p.value() != null && !p.value().toString().isEmpty())
                .orElseThrow(() -> new IllegalStateException(
                        "At least one user role is required for the human task. Provide a value for '"
                                + USER_ROLES_LABEL + "'."));
        // The task input is required where the module declares it so (the form marks that field
        // REQUIRED) and the generic emitter below skips empty values — so a cleared field would
        // silently drop a required argument. A defaultable input, as older releases declare, may
        // be left out and is not checked here.
        sourceBuilder.getProperty(TASK_INPUT_KEY)
                .filter(p -> p.codedata() != null && ParameterData.Kind.REQUIRED.name().equals(p.codedata().kind()))
                .filter(p -> p.value() == null || p.value().toString().isBlank())
                .ifPresent(p -> {
                    throw new IllegalStateException("A task input is required for the human task. Provide a "
                            + "value for '" + TASK_INPUT_LABEL + "' — use {} for a task with nothing to show.");
                });

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
                .name(CALL_HUMAN_TASK_METHOD_NAME);

        // The argument list comes from the node's own properties, generically: taskName emits
        // positionally, and every other value-bearing property — userRoles, taskInput, title,
        // description, timeout, stepId, and whatever field a future module adds — emits as a
        // named argument (a HumanTaskOptions record field). No fixed field list on purpose:
        // this is what keeps the form forward compatible — a new record field surfaces in the
        // form from the resolved signature and emits here without this builder ever learning
        // its name. Deliberately tolerant of properties without codedata kinds, which older
        // clients still send.
        Set<String> excludedKeys = Set.of(TASK_NAME_KEY, Property.VARIABLE_KEY, Property.CHECK_ERROR_KEY,
                DATABINDING_TYPE_KEY, Property.RESULT_NAME, Property.CONNECTION_KEY, ADDITIONAL_VALUES_KEY);
        List<String> callArgs = new ArrayList<>();
        callArgs.add(sourceBuilder.getProperty(TASK_NAME_KEY).map(Property::toSourceCode).orElse(""));
        for (Map.Entry<String, Property> entry : sourceBuilder.flowNode.properties().entrySet()) {
            String key = entry.getKey();
            Property prop = entry.getValue();
            if (excludedKeys.contains(key) || prop.value() == null || prop.value().toString().isEmpty()) {
                continue;
            }
            String kind = prop.codedata() != null ? prop.codedata().kind() : null;
            if (ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(kind)
                    || ParameterData.Kind.INCLUDED_RECORD.name().equals(kind)
                    || ParameterData.Kind.INCLUDED_RECORD_REST.name().equals(kind)) {
                continue;
            }
            String argName = prop.codedata() != null && prop.codedata().originalName() != null
                    ? prop.codedata().originalName() : key;
            callArgs.add(argName + " = " + prop.toSourceCode());
        }

        sourceBuilder.token()
                .keyword(SyntaxKind.OPEN_PAREN_TOKEN)
                .name(String.join(", ", callArgs))
                .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                .endOfStatement();

        return sourceBuilder
                .textEdit()
                .acceptImport(WORKFLOW_ORG, WORKFLOW_MODULE)
                .build();
    }

    /**
     * The open rest of {@code HumanTaskOptions} is the module's forward door for hand-written
     * record literals; a generic key-value editor here would emit named arguments the compiler
     * rejects for unknown names, so the form offers declared fields only.
     */
    @Override
    protected boolean processSpecialParameter(ParameterData paramData) {
        return paramData.kind() == ParameterData.Kind.INCLUDED_RECORD_REST
                || super.processSpecialParameter(paramData);
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
