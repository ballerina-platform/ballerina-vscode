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
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_ACTIVITY_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_ACTIVITY_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_ACTIVITY_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Registers a workflow activity as a durable agent tool. Generates
 * {@code check durableAgentContext.registerActivity(<activity>);}.
 *
 * <p>Built-in activities (Call REST API, Call SOAP API, Send Email) are registered as-is — no wrapper
 * function. Their form reuses the built-in strategy fields plus a connection selector; every value the
 * user fills is fixed at registration via {@code bindings} (the connection travels as a
 * {@code "connection:<name>"} marker), and everything left blank stays model-controlled:
 * {@code check durableAgentContext.registerActivity(activity:callRestAPI, name = ..., description = ...,
 * bindings = {connection: api, method: "GET"});}
 *
 * @since 1.8.0
 */
public class DurableAgentAddActivityBuilder extends CallBuilder {

    // Binding properties are keyed by parameter name so toSource can rebuild the mapping.
    public static final String BINDING_KEY_PREFIX = "bindings.";

    public static final String ACTIVITY_KEY = "activity";
    public static final String ACTIVITY_LABEL = "Activity";
    public static final String ACTIVITY_DOC = "The @workflow:Activity function to expose as an agent tool";

    public static final String TOOL_NAME_KEY = "name";
    public static final String TOOL_NAME_LABEL = "Tool Name";
    public static final String TOOL_NAME_DOC = "The tool name advertised to the model. Defaults to the function name";
    public static final String TOOL_DESCRIPTION_KEY = "description";
    public static final String TOOL_DESCRIPTION_LABEL = "Description";
    public static final String TOOL_DESCRIPTION_DOC =
            "Tells the model what this tool does and when to use it";

    public static final String REQUIRES_APPROVAL_KEY = "requiresApproval";
    public static final String USER_ROLES_KEY = "userRoles";
    public static final String REQUIRES_APPROVAL_LABEL = "Requires Approval";
    public static final String REQUIRES_APPROVAL_DOC =
            "Gate this tool: before the agent runs it, a review activity is created and the agent suspends "
            + "durably until a reviewer proceeds (optionally editing the arguments) or rejects.";



    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DURABLE_AGENT_ADD_ACTIVITY;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(REGISTER_ACTIVITY_LABEL).description(REGISTER_ACTIVITY_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_ADD_ACTIVITY)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(AGENT_CONTEXT_CLASS_NAME)
                .symbol(REGISTER_ACTIVITY_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();

        // When the node comes from the activity search list, its codedata symbol is the chosen
        // activity function — pre-select it. (The palette entry's symbol is the method name.)
        String preSelected = "";
        String contextSymbol = context.codedata() == null ? null : context.codedata().symbol();
        if (contextSymbol != null && !contextSymbol.isEmpty()
                && !REGISTER_ACTIVITY_METHOD_NAME.equals(contextSymbol)) {
            preSelected = contextSymbol;
        }

        properties().custom()
                .metadata()
                    .label(ACTIVITY_LABEL)
                    .description(ACTIVITY_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(getActivityFunctions(context))
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value(preSelected)
                .editable(true)
                .stepOut()
                .addProperty(ACTIVITY_KEY);
        addBindingProperties(context, preSelected);
        addToolIdentityProperties();
        addRequiresApprovalProperty();
        properties().checkError(true);
    }

    /**
     * Adds a selector for every parameter of the chosen activity the model cannot supply — a
     * client, typically. Their values are fixed at registration through {@code bindings}, and the
     * remaining data parameters stay model-controlled. Options are the module-level variables
     * assignable to the parameter, so a connection is picked rather than typed.
     */
    private void addBindingProperties(TemplateContext context, String activityName) {
        if (activityName == null || activityName.isEmpty()) {
            return;
        }
        Package currentPackage = PackageUtil.loadProject(context.workspaceManager(), context.filePath())
                .currentPackage();
        PackageUtil.getCompilation(currentPackage);
        for (Module module : currentPackage.modules()) {
            SemanticModel semanticModel;
            try {
                semanticModel = module.getCompilation().getSemanticModel();
            } catch (RuntimeException e) {
                continue;
            }
            Optional<FunctionSymbol> activity = semanticModel.moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                    .map(symbol -> (FunctionSymbol) symbol)
                    .filter(WorkflowUtil::isActivityFunction)
                    .filter(symbol -> activityName.equals(symbol.getName().orElse("")))
                    .findFirst();
            if (activity.isEmpty()) {
                continue;
            }
            List<ParameterSymbol> params = activity.get().typeDescriptor().params().orElse(List.of());
            for (ParameterSymbol parameter : params) {
                TypeSymbol type = parameter.typeDescriptor();
                if (type.subtypeOf(semanticModel.types().ANYDATA)) {
                    continue;
                }
                String paramName = parameter.getName().orElse("");
                if (paramName.isEmpty()) {
                    continue;
                }
                properties().custom()
                        .metadata()
                            .label(paramName.substring(0, 1).toUpperCase(java.util.Locale.ROOT)
                                    + paramName.substring(1))
                            .description("Fixed at registration and hidden from the model: "
                                    + "the agent cannot supply a '" + type.signature() + "'")
                            .stepOut()
                        .type()
                            .fieldType(Property.ValueType.SINGLE_SELECT)
                            .ballerinaType(type.signature())
                            .options(moduleVariablesOfType(semanticModel, type))
                            .selected(true)
                            .stepOut()
                        .codedata()
                            .kind(ParameterData.Kind.REQUIRED.name())
                            .stepOut()
                        .value("")
                        .editable(true)
                        .stepOut()
                        .addProperty(BINDING_KEY_PREFIX + paramName);
            }
            return;
        }
    }

    // Module-level variables assignable to the parameter — the connections a binding can name.
    private static List<Option> moduleVariablesOfType(SemanticModel semanticModel, TypeSymbol type) {
        List<Option> options = new ArrayList<>();
        semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof VariableSymbol)
                .map(symbol -> (VariableSymbol) symbol)
                .filter(variable -> variable.typeDescriptor().subtypeOf(type))
                .forEach(variable -> variable.getName().ifPresent(name -> options.add(new Option(name, name))));
        return options;
    }

    // The name/description advertised to the model, mirroring the workflow activity form's
    // identity fields; both default to the function's own name and doc comment.
    private void addToolIdentityProperties() {
        properties().custom()
                .metadata()
                    .label(TOOL_NAME_LABEL)
                    .description(TOOL_NAME_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.TEXT)
                    .ballerinaType("string")
                    .selected(true)
                    .stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(TOOL_NAME_KEY);
        properties().custom()
                .metadata()
                    .label(TOOL_DESCRIPTION_LABEL)
                    .description(TOOL_DESCRIPTION_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.DOC_TEXT)
                    .ballerinaType("string")
                    .selected(true)
                    .stepOut()
                .value("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(TOOL_DESCRIPTION_KEY);
    }

    // A FLAG that, when true, emits `requiresApproval = true` so the tool is gated by a review activity.
    private void addRequiresApprovalProperty() {
        properties().custom()
                .metadata()
                    .label(REQUIRES_APPROVAL_LABEL)
                    .description(REQUIRES_APPROVAL_DOC)
                    .stepOut()
                .type().fieldType(Property.ValueType.FLAG).ballerinaType("boolean").selected(true).stepOut()
                .value("false")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(REQUIRES_APPROVAL_KEY);
        properties().custom()
                .metadata()
                    .label("Reviewer Roles")
                    .description("Role(s) permitted to decide the approval review of this activity, "
                            + "e.g. \"support-lead\" or [\"finance\", \"manager\"].")
                    .stepOut()
                .type().fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType("string|string[]").selected(true).stepOut()
                .placeholder("")
                .editable(true)
                .optional(true)
                .advanced(true)
                .stepOut()
                .addProperty(USER_ROLES_KEY);
        // Feature parity with workflow Call Activity: agent-declared activities can be
        // auto-retried by the engine or gated by a human review on failure.
        ActivityCallBuilder.addRetryPolicyFormProperties(this, ActivityCallBuilder.NO_RETRY_VALUE,
                "", "", "", "", "");
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Object model: the capability lives on the declaration's `activities` list.
        WorkflowUtil.requireDurableAgentObjectTarget(sourceBuilder);
        if (WorkflowUtil.isCapabilityDeleteRequest(sourceBuilder)) {
            return WorkflowUtil.removeAgentCapabilityEntry(sourceBuilder);
        }
        String activityRef = sourceBuilder.getProperty(ACTIVITY_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        if (activityRef.isBlank()) {
            throw new UserFacingException("An activity function must be selected");
        }
        String toolName = sourceBuilder.getProperty(TOOL_NAME_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String toolDescription = sourceBuilder.getProperty(TOOL_DESCRIPTION_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        String userRoles = sourceBuilder.getProperty(USER_ROLES_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        boolean requiresApproval = isRequiresApproval(sourceBuilder);
        String retryPolicyValue = ActivityCallBuilder.retryPolicyEntryValue(
                sourceBuilder.flowNode.properties());
        List<String> bindings = new ArrayList<>();
        sourceBuilder.flowNode.properties().forEach((key, property) -> {
            if (!key.startsWith(BINDING_KEY_PREFIX) || property.value() == null
                    || property.value().toString().isBlank()) {
                return;
            }
            bindings.add(key.substring(BINDING_KEY_PREFIX.length()) + ": "
                    + property.value().toString().trim());
        });
        String entry;
        if (toolName.isBlank() && toolDescription.isBlank() && !requiresApproval && userRoles.isBlank()
                && retryPolicyValue == null && bindings.isEmpty()) {
            entry = activityRef;
        } else {
            StringBuilder mapping = new StringBuilder("{activity: ").append(activityRef);
            if (!toolName.isBlank()) {
                mapping.append(", name: ").append(WorkflowUtil.quoteIfPlain(toolName));
            }
            if (!toolDescription.isBlank()) {
                mapping.append(", description: ").append(WorkflowUtil.quoteIfPlain(toolDescription));
            }
            if (requiresApproval) {
                mapping.append(", requiresApproval: true");
            }
            if (!userRoles.isBlank()) {
                mapping.append(", userRoles: ").append(WorkflowUtil.quoteIfBareRole(userRoles));
            }
            if (retryPolicyValue != null) {
                mapping.append(", retryPolicy: ").append(retryPolicyValue);
            }
            if (!bindings.isEmpty()) {
                mapping.append(", bindings: {").append(String.join(", ", bindings)).append("}");
            }
            entry = mapping.append("}").toString();
        }
        return WorkflowUtil.upsertAgentCapabilityEntry(sourceBuilder, "activities", entry);
    }

    private static boolean isRequiresApproval(SourceBuilder sourceBuilder) {
        return sourceBuilder.getProperty(REQUIRES_APPROVAL_KEY)
                .map(p -> p.value() != null && "true".equals(p.value().toString()))
                .orElse(false);
    }

    private List<Option> getActivityFunctions(TemplateContext context) {
        List<Option> options = new ArrayList<>();
        Package currentPackage = PackageUtil.loadProject(context.workspaceManager(), context.filePath())
                .currentPackage();
        PackageUtil.getCompilation(currentPackage);
        // A module whose compilation fails (e.g. an unresolvable dependency) is skipped so the
        // selector still lists the activities from the modules that do resolve.
        currentPackage.modules().forEach(module -> {
            try {
                module.getCompilation().getSemanticModel().moduleSymbols().stream()
                        .filter(symbol -> symbol.kind() == SymbolKind.FUNCTION)
                        .map(symbol -> (FunctionSymbol) symbol)
                        .filter(WorkflowUtil::isActivityFunction)
                        .forEach(funcSymbol -> funcSymbol.getName().ifPresent(name ->
                                options.add(new Option(name, name))));
            } catch (RuntimeException e) {
                // Skip unresolvable module.
            }
        });
        return options;
    }
}
