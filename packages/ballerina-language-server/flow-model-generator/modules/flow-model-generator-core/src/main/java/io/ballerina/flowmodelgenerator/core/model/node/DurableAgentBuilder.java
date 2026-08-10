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

import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.PackageUtil;
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
 * (model, tools, events, human tasks) is edited on the declaration's config literal afterwards.
 */
public class DurableAgentBuilder extends FunctionDefinitionBuilder {

    public static final String LABEL = "Durable Agentic Workflow";
    public static final String DESCRIPTION = "Define a durable workflow driven by an agentic model";

    // The simplified creation form only asks for a name; the input defaults to a
    // json payload bound to a variable named "input".
    private static final String DEFAULT_INPUT_TYPE = "json";
    private static final String DEFAULT_INPUT_NAME = "input";
    private static final String RETURN_TYPE = "error?";

    // Name given to the WSO2 default model provider declared alongside an agent created in a
    // package that has none. Matches the name the webview's own bootstrap paths use, so an agent
    // created here and one created from the AI chat agent wizard converge on the same variable.
    private static final String DEFAULT_MODEL_PROVIDER_VAR = "wso2ModelProvider";

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
        // The creation form asks only for a name; the input is always a json payload
        // named "input".
        properties().functionNameTemplate("durableAgenticWorkflow", context.getAllVisibleSymbolNames());
        WorkflowBuilder.setMandatoryProperties(this, RETURN_TYPE, "", "");
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        Optional<Property> optDescription = sourceBuilder.getProperty(Property.FUNCTION_NAME_DESCRIPTION_KEY);
        String description = optDescription.map(property -> property.value().toString()).orElse("");
        Optional<Property> funcNameProperty = sourceBuilder.getProperty(Property.FUNCTION_NAME_KEY);
        if (funcNameProperty.isEmpty()) {
            throw new IllegalStateException("Function name is not present");
        }
        String funcName = funcNameProperty.get().value().toString();

        boolean isNew = Boolean.TRUE.equals(sourceBuilder.flowNode.codedata().isNew());
        if (isNew || sourceBuilder.flowNode.codedata().lineRange() == null) {
            // Object model: the agent IS the workflow — only the module-level declaration is
            // generated. It is started from other artifacts via `<name>.run(...)` or through the
            // management API, and its events/capabilities all live on the declaration's config.
            String modelVar = resolveExistingModelProvider(sourceBuilder);
            String modelProviderDeclaration = "";
            if (modelVar == null) {
                // The package has no model provider to point at, so declare the shared WSO2 default
                // one immediately above the agent. Referencing a name without declaring it is what
                // used to leave the generated package failing to compile on `wso2ModelProvider`.
                modelVar = DEFAULT_MODEL_PROVIDER_VAR;
                modelProviderDeclaration = defaultModelProviderDeclaration();
                sourceBuilder.acceptImport(BALLERINA_ORG, AI_PACKAGE);
            }
            // A backtick in the description is escaped as an interpolation rather than rewritten,
            // so the prompt the user typed survives the round trip through the box's edit form.
            String role = AiUtils.replaceBackticksForStringTemplate(funcName);
            String instructions = AiUtils.replaceBackticksForStringTemplate(description);
            // Both declarations go out as one edit: `skipFormatting` passes the text through
            // verbatim, whereas a DECLARATION edit is parsed as a single module member.
            String declaration = modelProviderDeclaration
                    + "final workflow:DurableAgent " + funcName + " = check new ({"
                    + "systemPrompt: {role: " + role + ", instructions: " + instructions
                    + "}, model: " + modelVar + "});";
            sourceBuilder
                    .token()
                        .skipFormatting()
                        .name(declaration)
                        .stepOut()
                    .textEdit(SourceBuilder.SourceKind.DECLARATION)
                    .acceptImport();
        } else {
            // Object-model agents have no function form; identity/config edits go through
            // the declaration's own forms, never this builder.
            throw new UserFacingException("A durable agent can only be created, not regenerated: "
                    + "edit the declaration through its capability forms");
        }

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

    // Picks an existing module-level ai:ModelProvider variable to reference in the pre-populated
    // run call, so creating an agent in a project that already has a provider does not force a
    // new WSO2 provider. Returns null when the package has none, which makes the caller declare
    // the WSO2 default provider alongside the agent.
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
}
