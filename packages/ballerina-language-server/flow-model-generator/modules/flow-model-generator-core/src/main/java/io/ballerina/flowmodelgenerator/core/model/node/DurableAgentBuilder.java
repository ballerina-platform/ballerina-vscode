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

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DURABLE_AGENT;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.DEFAULT_AGENT_CTX_PARAM_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Represents the properties of a durable agent function definition node. A durable agent is a workflow
 * whose body configures the agent imperatively (model provider, tools, human tasks) and hands control to
 * the durable ReAct loop via {@code ctx.buildAndRunAgent(...)}.
 *
 * @since 1.8.0
 */
public class DurableAgentBuilder extends FunctionDefinitionBuilder {

    public static final String LABEL = "Durable Agentic Workflow";
    public static final String DESCRIPTION = "Define a durable workflow driven by an agentic model";

    // The simplified creation form only asks for a name; the input defaults to a
    // json payload bound to a variable named "input".
    private static final String DEFAULT_INPUT_TYPE = "json";
    private static final String DEFAULT_INPUT_NAME = "input";
    private static final String RETURN_TYPE = "error?";

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
            if (modelVar == null) {
                // The creation wizard creates the shared WSO2 default provider when none exists.
                modelVar = "wso2ModelProvider";
            }
            String instructions = description.replace("`", "'");
            String declaration = "final workflow:DurableAgent " + funcName + " = check new ({"
                    + "systemPrompt: {role: string `" + funcName + "`, instructions: string `"
                    + instructions + "`}, model: " + modelVar + "});";
            sourceBuilder
                    .token()
                        .skipFormatting()
                        .name(declaration)
                        .stepOut()
                    .textEdit(SourceBuilder.SourceKind.DECLARATION)
                    .acceptImport();
        } else {
            if (!description.isEmpty()) {
                sourceBuilder.token().descriptionDoc(description);
            }

            sourceBuilder.token()
                    .name("@workflow:" + DURABLE_AGENT)
                    .newLine()
                    .keyword(SyntaxKind.FUNCTION_KEYWORD)
                    .name(funcName)
                    .keyword(SyntaxKind.OPEN_PAREN_TOKEN);

            // The agent context parameter comes first, followed by the optional input record
            // and the chat events record used for conversational interactions.
            WorkflowBuilder.generateParameter(sourceBuilder,
                    WORKFLOW_MODULE + ":" + AGENT_CONTEXT_CLASS_NAME, DEFAULT_AGENT_CTX_PARAM_NAME);

            // The input parameter is mandatory (the compiler plugin rejects agents without it);
            // the simplified creation always generates a json payload named "input". Editing the
            // type/name later happens through the Agent Identifier form.
            Optional<Property> inputProperty = sourceBuilder.getProperty(WorkflowBuilder.INPUT_KEY);
            String inputTypeName = inputProperty.map(p -> p.value().toString()).orElse("");
            if (inputTypeName.isEmpty()) {
                inputTypeName = DEFAULT_INPUT_TYPE;
            }
            sourceBuilder.token().keyword(SyntaxKind.COMMA_TOKEN);
            WorkflowBuilder.generateParameter(sourceBuilder, inputTypeName, DEFAULT_INPUT_NAME);

            sourceBuilder.token()
                    .keyword(SyntaxKind.CLOSE_PAREN_TOKEN)
                    .keyword(SyntaxKind.RETURNS_KEYWORD)
                    .name(RETURN_TYPE);
            sourceBuilder
                    .token().skipFormatting().stepOut()
                    .textEdit();
        }

        return sourceBuilder.build();
    }

    // Picks an existing module-level ai:ModelProvider variable to reference in the pre-populated
    // run call, so creating an agent in a project that already has a provider does not force a
    // new WSO2 provider. Falls back to the default name when the project has no provider.
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
