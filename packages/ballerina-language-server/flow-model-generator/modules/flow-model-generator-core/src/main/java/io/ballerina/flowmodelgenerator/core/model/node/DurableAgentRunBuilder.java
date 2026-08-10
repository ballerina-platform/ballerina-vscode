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
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.TypeUtils;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.FunctionDataBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_DURABLE_AGENT_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_DURABLE_AGENT_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.RUN_DURABLE_AGENT_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Runs the durable agent loop. The form mirrors a regular {@code ai:Agent}: Role and Instructions
 * prompt fields (composed into the {@code ai:SystemPrompt}), the query, a model-provider dropdown,
 * tools, and the iteration limit. Generates
 * {@code check agentContext.runDurableAgent(<query>, systemPrompt = {role: ..., instructions: ...},
 * model = <m>, tools = [...]);}.
 *
 * @since 1.8.0
 */
public class DurableAgentRunBuilder extends CallBuilder {

    public static final String QUERY_KEY = "query";
    public static final String CONTEXT_KEY = "context";
    public static final String SYSTEM_PROMPT_KEY = "systemPrompt";
    public static final String ROLE_KEY = "role";
    public static final String INSTRUCTIONS_KEY = "instructions";
    public static final String MODEL_KEY = "model";
    public static final String MAX_ITER_KEY = "maxIter";
    public static final String VERBOSE_KEY = "verbose";

    public static final String ROLE_LABEL = "Role";
    public static final String ROLE_DOC = "Define the agent's primary function";
    public static final String ROLE_PLACEHOLDER = "e.g., Customer Support Assistant";
    public static final String INSTRUCTIONS_LABEL = "Instructions";
    public static final String INSTRUCTIONS_DOC = "Detailed instructions for the agent";
    public static final String INSTRUCTIONS_PLACEHOLDER = "e.g., You are a friendly assistant. Your goal is to...";

    // The order the form fields appear in: agent identity first, then the query and capabilities.
    private static final List<String> FORM_ORDER =
            List.of(ROLE_KEY, INSTRUCTIONS_KEY, QUERY_KEY, MODEL_KEY, MAX_ITER_KEY);

    private static final String STRING_TYPE = "string";
    private static final String MODEL_TYPE = "ai:ModelProvider";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DURABLE_AGENT_RUN;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(RUN_DURABLE_AGENT_LABEL).description(RUN_DURABLE_AGENT_DESCRIPTION);
        // The object identity is the DurableAgent class: NodeBuilder.build() re-runs this
        // const data over analyzer-time writes, and the FE keys the agent-box behavior
        // (capability delete, model configuration routing) off codedata.object.
        codedata()
                .node(NodeKind.DURABLE_AGENT_RUN)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(DURABLE_AGENT_OBJECT_CLASS_NAME)
                .symbol(RUN_DURABLE_AGENT_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();

        boolean fallbackTemplate = false;
        try {
            ModuleInfo workflowModuleInfo = new ModuleInfo(WORKFLOW_ORG, WORKFLOW_MODULE, WORKFLOW_MODULE, null);
            FunctionData functionData = new FunctionDataBuilder()
                    .name(RUN_DURABLE_AGENT_METHOD_NAME)
                    .moduleInfo(workflowModuleInfo)
                    .parentSymbolType(AGENT_CONTEXT_CLASS_NAME)
                    .functionResultKind(FunctionData.Kind.FUNCTION)
                    .project(PackageUtil.loadProject(context.workspaceManager(), context.filePath()))
                    .userModuleInfo(moduleInfo)
                    .workspaceManager(context.workspaceManager())
                    .filePath(context.filePath())
                    .build();

            if (functionData == null || functionData.parameters() == null || functionData.parameters().isEmpty()) {
                fallbackTemplate = true;
            } else {
                LinkedHashMap<String, ParameterData> params = new LinkedHashMap<>(functionData.parameters());
                params.remove(CONTEXT_KEY);
                functionData.setParameters(params);

                Module module = context.workspaceManager().module(context.filePath()).orElse(null);
                setParameterProperties(functionData, module);
            }
        } catch (RuntimeException e) {
            // runDurableAgent may not be resolvable yet (module not pulled); fall back to a
            // stable static form so the node still opens.
            fallbackTemplate = true;
        }

        if (fallbackTemplate) {
            setFallbackProperties();
        }

        applyAgentFormShape(this, Map.of());
        List<Option> providerOptions = getModelProviderVariables(context);
        convertModelToSelect(this, providerOptions);
        // The model field is hidden (configured via the agent box circle); prefill it with
        // an existing provider so a fresh buildAndRun form saves without touching it.
        if (!providerOptions.isEmpty()) {
            Map<String, Property> templateProps = properties().build();
            Property model = templateProps.get(MODEL_KEY);
            if (model != null && (model.value() == null || model.value().toString().isEmpty())) {
                templateProps.put(MODEL_KEY,
                        Property.Builder.copyFrom(model).value(providerOptions.get(0).value()).build());
            }
        }
        properties().checkError(true);
    }

    /**
     * Reshapes the raw signature-derived properties into the agent form: the record-typed
     * {@code systemPrompt} field is replaced by Role and Instructions prompt fields (same shape as
     * the regular AI agent node), the reserved/unused parameters are dropped, and the fields are
     * reordered. Shared with CodeAnalyzer's source re-read path so both render the same form.
     *
     * @param nodeBuilder the builder holding raw properties
     * @param promptValues optional parsed values keyed by {@link #ROLE_KEY}/{@link #INSTRUCTIONS_KEY}
     */
    public static void applyAgentFormShape(NodeBuilder nodeBuilder,
                                           Map<String, AiUtils.AgentPropertyValue> promptValues) {
        Map<String, Property> props = nodeBuilder.properties().build();
        props.remove(SYSTEM_PROMPT_KEY);
        props.remove(CONTEXT_KEY);
        props.remove(VERBOSE_KEY);

        AiUtils.AgentPropertyValue role = promptValues.get(ROLE_KEY);
        AiUtils.AgentPropertyValue instructions = promptValues.get(INSTRUCTIONS_KEY);
        AiUtils.addStringProperty(nodeBuilder, ROLE_KEY, ROLE_LABEL, ROLE_DOC, ROLE_PLACEHOLDER,
                role == null ? "" : AiUtils.restoreBackticksFromStringTemplate(role.value()),
                role == null ? Property.ValueType.PROMPT : role.selectedType(), false);
        AiUtils.addStringProperty(nodeBuilder, INSTRUCTIONS_KEY, INSTRUCTIONS_LABEL, INSTRUCTIONS_DOC,
                INSTRUCTIONS_PLACEHOLDER,
                instructions == null ? "" : AiUtils.restoreBackticksFromStringTemplate(instructions.value()),
                instructions == null ? Property.ValueType.PROMPT : instructions.selectedType(), false);

        // Reorder in place: identity fields first, then everything else in its original order.
        Map<String, Property> ordered = new LinkedHashMap<>();
        for (String key : FORM_ORDER) {
            Property property = props.remove(key);
            if (property != null) {
                ordered.put(key, property);
            }
        }
        ordered.putAll(props);
        props.clear();
        props.putAll(ordered);
    }

    // Static form used when the workflow module signature is unavailable.
    private void setFallbackProperties() {
        addCustomProperty(QUERY_KEY, "Query", "The initial user query; when omitted the agent waits for the "
                + "first chat event", STRING_TYPE, false, "");
        addCustomProperty(MODEL_KEY, "Model", "The model provider used for the agent's LLM calls",
                MODEL_TYPE, true, "");
        addCustomProperty(MAX_ITER_KEY, "Maximum Iterations", "Maximum LLM reasoning iterations per turn",
                "int", false, "");
    }

    private void addCustomProperty(String key, String label, String doc, String ballerinaType, boolean required,
                                   String value) {
        properties().custom()
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(ballerinaType)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(required ? ParameterData.Kind.REQUIRED.name() : ParameterData.Kind.DEFAULTABLE.name())
                    .originalName(key)
                    .stepOut()
                .value(value)
                .editable(true)
                .optional(!required)
                .stepOut()
                .addProperty(key);
    }

    /**
     * Converts the {@code model} property into a dropdown of the module-level
     * {@code ai:ModelProvider} variables (typically the shared {@code wso2ModelProvider}).
     * Rebuilding the property on its existing key keeps its position in the form. Shared with
     * CodeAnalyzer's source re-read path.
     *
     * @param nodeBuilder the builder holding the model property
     * @param options the model provider variable options
     */
    public static void convertModelToSelect(NodeBuilder nodeBuilder, List<Option> options) {
        Map<String, Property> props = nodeBuilder.properties().build();
        Property model = props.get(MODEL_KEY);
        if (model == null) {
            return;
        }
        String label = model.metadata() != null && model.metadata().label() != null
                ? model.metadata().label() : "Model";
        String doc = model.metadata() != null && model.metadata().description() != null
                ? model.metadata().description() : "The model provider used for the agent's LLM calls";
        String value = model.value() == null ? "" : model.value().toString();
        nodeBuilder.properties().custom()
                .metadata()
                    .label(label)
                    .description(doc)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .ballerinaType(MODEL_TYPE)
                    .options(options)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .originalName(MODEL_KEY)
                    .stepOut()
                .placeholder("Select a model provider")
                .value(value)
                .editable(true)
                // The model is configured through the agent box's attached model-provider
                // circle, not the run form; keep the property so it round-trips on save.
                .hidden()
                .stepOut()
                .addProperty(MODEL_KEY);
    }

    /**
     * Lists the module-level variables whose type is (or includes) {@code ai:ModelProvider}.
     *
     * @param context the template context to resolve the project from
     * @return dropdown options, one per provider variable
     */
    public static List<Option> getModelProviderVariables(TemplateContext context) {
        List<Option> options = new ArrayList<>();
        try {
            Package currentPackage = PackageUtil.loadProject(context.workspaceManager(), context.filePath())
                    .currentPackage();
            PackageUtil.getCompilation(currentPackage);
            currentPackage.modules().forEach(module ->
                    module.getCompilation().getSemanticModel().moduleSymbols().stream()
                            .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE)
                            .map(symbol -> (VariableSymbol) symbol)
                            .filter(variable -> isModelProviderType(variable.typeDescriptor()))
                            .forEach(variable -> variable.getName().ifPresent(name ->
                                    options.add(new Option(name, name)))));
        } catch (RuntimeException e) {
            // Project resolution failures leave the dropdown empty; the field is still editable.
        }
        return options;
    }

    /**
     * Lists the module-level {@code ai:ModelProvider} variables visible in the given semantic
     * model. Used by CodeAnalyzer's source re-read path, which has no template context.
     *
     * @param semanticModel the semantic model of the module being analyzed
     * @return dropdown options, one per provider variable
     */
    public static List<Option> modelProviderOptions(SemanticModel semanticModel) {
        List<Option> options = new ArrayList<>();
        try {
            semanticModel.moduleSymbols().stream()
                    .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE)
                    .map(symbol -> (VariableSymbol) symbol)
                    .filter(variable -> isModelProviderType(variable.typeDescriptor()))
                    .forEach(variable -> variable.getName().ifPresent(name ->
                            options.add(new Option(name, name))));
        } catch (RuntimeException e) {
            // Leave the dropdown empty on resolution failures.
        }
        return options;
    }

    private static boolean isModelProviderType(TypeSymbol typeSymbol) {
        return isModelProviderType(typeSymbol, 0);
    }

    private static boolean isModelProviderType(TypeSymbol typeSymbol, int depth) {
        if (typeSymbol == null || depth > 4) {
            return false;
        }
        TypeSymbol resolved = TypeUtils.resolveTypeReference(typeSymbol);
        if (isAiModelProviderRef(typeSymbol) || isAiModelProviderRef(resolved)) {
            return true;
        }
        if (resolved instanceof ClassSymbol classSymbol) {
            for (TypeSymbol inclusion : classSymbol.typeInclusions()) {
                if (isModelProviderType(inclusion, depth + 1)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean isAiModelProviderRef(Symbol symbol) {
        if (symbol == null) {
            return false;
        }
        Optional<String> name = symbol.getName();
        if (name.isEmpty() || !name.get().endsWith(Constants.Ai.MODEL_PROVIDER_TYPE_NAME)) {
            return false;
        }
        return symbol.getModule()
                .map(module -> Constants.Ai.AI_PACKAGE.equals(module.id().moduleName()))
                .orElse(false);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Object model: the box's form edits the agent DECLARATION — the systemPrompt
        // (role/instructions) and model fields of the config literal. The run statement
        // itself is not rewritten here.
        WorkflowUtil.requireDurableAgentObjectTarget(sourceBuilder);
        String agentVarName = sourceBuilder.flowNode.codedata().parentSymbol();
        Property role = sourceBuilder.getProperty(ROLE_KEY).orElse(null);
        Property instructions = sourceBuilder.getProperty(INSTRUCTIONS_KEY).orElse(null);
        String modelValue = sourceBuilder.getProperty(MODEL_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        LinkedHashMap<String, String> fields = new LinkedHashMap<>();
        // The prompt fields only exist on the form when the declaration's systemPrompt was read
        // as a role/instructions mapping. Absent means the form never showed them (the prompt is
        // a reference, say), so leave the declared systemPrompt alone rather than blanking it.
        if (role != null || instructions != null) {
            fields.put(SYSTEM_PROMPT_KEY, "{role: " + promptFieldSource(role)
                    + ", instructions: " + promptFieldSource(instructions) + "}");
        }
        if (!modelValue.isBlank()) {
            fields.put(MODEL_KEY, modelValue);
        }
        // The form offers the reasoning cap, so a change to it has to reach the declaration;
            // otherwise the field accepts an edit that goes nowhere.
            String maxIterValue = sourceBuilder.getProperty(MAX_ITER_KEY)
                    .map(property -> property.value() == null ? "" : property.value().toString().trim())
                    .orElse("");
            if (!maxIterValue.isBlank()) {
                fields.put(MAX_ITER_KEY, maxIterValue);
            }
            return WorkflowUtil.setAgentConfigFields(sourceBuilder, agentVarName, fields);
        }

    /**
     * Renders a Role/Instructions field as the expression to write into the declaration's
     * {@code systemPrompt}, following the same convention as the AI agent node.
     *
     * <p>A prompt field's value reaches here either as the prompt text or as the string-template
     * expression it was read from, so wrapping it unconditionally double-wraps an unchanged field
     * on every save. {@link AiUtils#replaceBackticksForStringTemplate} handles both, and escapes a
     * backtick inside the prompt as an interpolation instead of rewriting it to something else —
     * which is what {@link AiUtils#restoreBackticksFromStringTemplate} reverses when the form is
     * populated. When the field holds an expression rather than a prompt (a config variable, say),
     * it is written through as-is.
     *
     * @param property the Role or Instructions property, or null when only its sibling is present
     * @return the expression source for the field
     */
    private static String promptFieldSource(Property property) {
        if (property == null) {
            return "string ``";
        }
        String value = property.value() == null ? "" : property.value().toString();
        boolean promptSelected = property.types() != null && property.types().stream()
                .anyMatch(type -> type.fieldType() == Property.ValueType.PROMPT && type.selected());
        return promptSelected ? AiUtils.replaceBackticksForStringTemplate(value) : value;
    }
}
