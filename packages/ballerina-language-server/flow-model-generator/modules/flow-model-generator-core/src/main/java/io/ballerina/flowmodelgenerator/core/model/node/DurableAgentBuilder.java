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

import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.Constants.Ai.AI_PACKAGE;
import static io.ballerina.flowmodelgenerator.core.Constants.Ai.BALLERINA_ORG;
import static io.ballerina.flowmodelgenerator.core.Constants.Ai.GET_DEFAULT_MODEL_PROVIDER_METHOD;
import static io.ballerina.flowmodelgenerator.core.Constants.Ai.WSO2_MODEL_PROVIDER_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
Represents a durable agent artifact. Creation generates the module-level object-model
 * declaration {@code final workflow:DurableAgent <name> = check new ({...});}; every capability
 * (tools, events, human tasks) is edited on the declaration's config literal afterwards.
 */
public class DurableAgentBuilder extends FunctionDefinitionBuilder {

    public static final String LABEL = "Durable Agentic Workflow";
    public static final String DESCRIPTION = "Define a durable workflow driven by an agentic model";

    private static final String RETURN_TYPE = "error?";

    // Name given to the WSO2 default model provider declared alongside an agent created in a
    // package that has none. Matches the name the webview's own bootstrap paths use, so an agent
    // created here and one created from the AI chat agent wizard converge on the same variable.
    private static final String DEFAULT_MODEL_PROVIDER_VAR = "wso2ModelProvider";

    // The expression the webview's model-provider dropdown yields for its "Default WSO2 Model
    // Provider" entry (ballerina-core's DEFAULT_MODEL_PROVIDER_EXPR).
    private static final String DEFAULT_MODEL_PROVIDER_EXPR = "check ai:getDefaultModelProvider()";

    private static final String MODEL_TYPE = "ai:ModelProvider";
    private static final String MODEL_LABEL = "Model";
    private static final String MODEL_DOC = "The model provider used for the agent's LLM calls";

    private static final String INPUT_TYPE_LABEL = "Input Data Type";
    private static final String INPUT_TYPE_DOC =
            "Type of the structured payload the agent is started with. Leave it empty to start the "
                    + "agent with the query text itself.";

    // The name identifies the agent (used to reference it in management and execution), not a
    // function — the generic "Name of the function" doc would be wrong here.
    public static final String NAME_DOC =
            "Unique name of the Durable Agentic Workflow, used to reference it in workflow "
                    + "management and execution.";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL).description(DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        ModuleInfo workflowModuleInfo = new ModuleInfo(WORKFLOW_ORG, WORKFLOW_MODULE, WORKFLOW_MODULE, null);
        PackageUtil.pullModuleAndNotify(context.lsClientLogger(), workflowModuleInfo);
        properties().functionNameTemplate("durableAgenticWorkflow", context.getAllVisibleSymbolNames(),
                FunctionDefinitionBuilder.FUNCTION_NAME_LABEL, NAME_DOC);
        WorkflowBuilder.setMandatoryProperties(this, RETURN_TYPE, "", "");
        // The identity fields the declaration cannot be generated without: the model provider and
        // the system prompt. Role and Instructions take a prompt or an expression, the same shape
        // the chat agent service's own creation form uses.
        setModelProperty();
        AiUtils.addStringProperty(this, DurableAgentRunBuilder.ROLE_KEY, DurableAgentRunBuilder.ROLE_LABEL,
                DurableAgentRunBuilder.ROLE_DOC, DurableAgentRunBuilder.ROLE_PLACEHOLDER, "",
                Property.ValueType.PROMPT, false);
        AiUtils.addStringProperty(this, DurableAgentRunBuilder.INSTRUCTIONS_KEY,
                DurableAgentRunBuilder.INSTRUCTIONS_LABEL, DurableAgentRunBuilder.INSTRUCTIONS_DOC,
                DurableAgentRunBuilder.INSTRUCTIONS_PLACEHOLDER, "", Property.ValueType.PROMPT, false);
        // Optional: `inputType` defaults to `string` in the module, i.e. the query text is the input.
        WorkflowBuilder.setInputTypeProperty(this, "", INPUT_TYPE_LABEL, INPUT_TYPE_DOC);
    }

    /**
     * Adds the model-provider field. Declaring it as an {@code ai:ModelProvider}-typed expression
     * is what makes the webview render it as the model-provider selector (the module's provider
     * variables plus the WSO2 default) — the same field the chat agent service creation form gets
     * from the {@code ai:Agent} signature.
     *
     * <p>The value is left empty on purpose: the selector fetches the package's provider variables
     * itself and falls back to the WSO2 default, so resolving them here would only make fetching a
     * node template compile the package — which is both needless work and enough to leave the
     * workflow compiler plugin unable to initialize on a later compilation of the same session.
     */
    private void setModelProperty() {
        properties().custom()
                .metadata()
                    .label(MODEL_LABEL)
                    .description(MODEL_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.EXPRESSION)
                    .ballerinaType(MODEL_TYPE)
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .originalName(DurableAgentRunBuilder.MODEL_KEY)
                    .stepOut()
                .placeholder("")
                .value("")
                .editable(true)
                .optional(false)
                .stepOut()
                .addProperty(DurableAgentRunBuilder.MODEL_KEY);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        Optional<Property> funcNameProperty = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY);
        if (funcNameProperty.isEmpty()) {
            throw new IllegalStateException("Function name is not present");
        }
        String funcName = funcNameProperty.get().value().toString();

        boolean isNew = Boolean.TRUE.equals(sourceBuilder.flowNode.codedata().isNew());
        if (!isNew && sourceBuilder.flowNode.codedata().lineRange() != null) {
            // Object-model agents have no function form; identity/config edits go through
            // the declaration's own forms, never this builder.
            throw new UserFacingException("A durable agent can only be created, not regenerated: "
                    + "edit the declaration through its capability forms");
        }

        // Object model: the agent IS the workflow — only the module-level declaration is
        // generated. It is started from other artifacts via `<name>.run(...)` or through the
        // management API, and its capabilities all live on the declaration's config.
        String modelValue = sourceBuilder.getProperty(DurableAgentRunBuilder.MODEL_KEY)
                .map(property -> property.value() == null ? "" : property.value().toString().trim())
                .orElse("");
        if (modelValue.isEmpty()) {
            // No model reached the builder (a client that predates the field, say): fall back to
            // whatever provider the package declares, and to the WSO2 default when it declares none.
            String existingProvider = resolveExistingModelProvider(sourceBuilder);
            modelValue = existingProvider == null ? DEFAULT_MODEL_PROVIDER_EXPR : existingProvider;
        }
        String modelProviderDeclaration = "";
        if (isDefaultModelProviderExpr(modelValue)) {
            // Bind the WSO2 default to a named module-level variable instead of inlining
            // `check ai:getDefaultModelProvider()` in the config: the agent box's model circle is a
            // dropdown over module-level provider variables, so an inline expression would leave it
            // with nothing to point at. Referencing a name without declaring it is what used to
            // leave the generated package failing to compile on `wso2ModelProvider`.
            String existingWso2Provider = resolveWso2ModelProvider(sourceBuilder);
            if (existingWso2Provider != null) {
                modelValue = existingWso2Provider;
            } else {
                modelValue = DEFAULT_MODEL_PROVIDER_VAR;
                modelProviderDeclaration = defaultModelProviderDeclaration();
                sourceBuilder.acceptImport(BALLERINA_ORG, AI_PACKAGE);
            }
        }

        // A backtick in a prompt is escaped as an interpolation rather than rewritten, so the text
        // the user typed survives the round trip through the declaration's own edit form.
        String role = DurableAgentRunBuilder.promptFieldSource(
                sourceBuilder.getProperty(DurableAgentRunBuilder.ROLE_KEY).orElse(null));
        String instructions = DurableAgentRunBuilder.promptFieldSource(
                sourceBuilder.getProperty(DurableAgentRunBuilder.INSTRUCTIONS_KEY).orElse(null));
        String inputType = sourceBuilder.getProperty(WorkflowBuilder.INPUT_KEY)
                .map(property -> property.value() == null ? "" : property.value().toString().trim())
                .orElse("");

        // Both declarations go out as one edit: `skipFormatting` passes the text through
        // verbatim, whereas a DECLARATION edit is parsed as a single module member.
        String newLine = System.lineSeparator();
        StringBuilder declaration = new StringBuilder(modelProviderDeclaration)
                .append("final workflow:DurableAgent ").append(funcName).append(" = check new ({").append(newLine)
                .append("    systemPrompt: {").append(newLine)
                .append("        role: ").append(role).append(",").append(newLine)
                .append("        instructions: ").append(instructions).append(newLine)
                .append("    },").append(newLine)
                .append("    model: ").append(modelValue);
        if (!inputType.isEmpty()) {
            declaration.append(",").append(newLine).append("    inputType: ").append(inputType);
        }
        declaration.append(newLine).append("});");
        sourceBuilder
                .token()
                    .skipFormatting()
                    .name(declaration.toString())
                    .stepOut()
                .textEdit(SourceBuilder.SourceKind.DECLARATION)
                .acceptImport();

        return sourceBuilder.build();
    }

    // `final ai:Wso2ModelProvider wso2ModelProvider = check ai:getDefaultModelProvider();` — the
    // same provider declaration ModelProviderBuilder emits for the WSO2 default, and the one
    // NPFunctionDefinitionBuilder bootstraps for a new natural function.
    private static String defaultModelProviderDeclaration() {
        return "final " + AI_PACKAGE + ":" + WSO2_MODEL_PROVIDER_NAME + " " + DEFAULT_MODEL_PROVIDER_VAR
                + " = check " + AI_PACKAGE + ":" + GET_DEFAULT_MODEL_PROVIDER_METHOD + "();"
                + System.lineSeparator();
    }

    private static boolean isDefaultModelProviderExpr(String value) {
        return DEFAULT_MODEL_PROVIDER_EXPR.equals(value.replaceAll("\\s+", " ").trim());
    }

    // Picks an existing module-level ai:ModelProvider variable, so an agent created in a project
    // that already has a provider does not force a new WSO2 one. Returns null when the package has
    // none, which makes the caller fall back to the WSO2 default.
    private static String resolveExistingModelProvider(SourceBuilder sourceBuilder) {
        try {
            Package currentPackage = PackageUtil
                    .loadProject(sourceBuilder.workspaceManager, sourceBuilder.filePath).currentPackage();
            PackageUtil.getCompilation(currentPackage);
            for (Module module : currentPackage.modules()) {
                List<Option> options = DurableAgentRunBuilder.modelProviderOptions(
                        module.getCompilation().getSemanticModel());
                if (!options.isEmpty()) {
                    return options.get(0).value();
                }
            }
        } catch (RuntimeException e) {
            // Project resolution can fail before the module is pulled; omit the model.
        }
        return null;
    }

    // Narrower than resolveExistingModelProvider: only an `ai:Wso2ModelProvider` variable answers
    // for an explicit "Default WSO2 Model Provider" pick. Binding that choice to, say, an existing
    // OpenAI provider variable would silently run the agent on a model the user did not choose.
    private static String resolveWso2ModelProvider(SourceBuilder sourceBuilder) {
        try {
            Package currentPackage = PackageUtil
                    .loadProject(sourceBuilder.workspaceManager, sourceBuilder.filePath).currentPackage();
            PackageUtil.getCompilation(currentPackage);
            for (Module module : currentPackage.modules()) {
                for (Symbol symbol : module.getCompilation().getSemanticModel().moduleSymbols()) {
                    if (symbol.kind() != SymbolKind.VARIABLE) {
                        continue;
                    }
                    VariableSymbol variable = (VariableSymbol) symbol;
                    if (isWso2ModelProviderType(variable.typeDescriptor()) && variable.getName().isPresent()) {
                        return variable.getName().get();
                    }
                }
            }
        } catch (RuntimeException e) {
            // Project resolution can fail before the module is pulled; declare the provider instead.
        }
        return null;
    }

    private static boolean isWso2ModelProviderType(TypeSymbol typeSymbol) {
        if (typeSymbol == null) {
            return false;
        }
        Optional<String> typeName = typeSymbol.getName();
        return typeName.isPresent() && WSO2_MODEL_PROVIDER_NAME.equals(typeName.get())
                && typeSymbol.getModule().map(module -> AI_PACKAGE.equals(module.id().moduleName())).orElse(false);
    }
}
