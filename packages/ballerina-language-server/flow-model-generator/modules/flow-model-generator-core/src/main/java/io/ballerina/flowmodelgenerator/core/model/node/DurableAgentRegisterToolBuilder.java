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
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.ParameterData;
import io.ballerina.projects.Package;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.AGENT_CONTEXT_CLASS_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_AGENT_TOOL_METHOD_NAME;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_AGENT_TOOL_DESCRIPTION;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.REGISTER_AGENT_TOOL_LABEL;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Registers an {@code @ai:AgentTool} function as a durable agent tool. Generates
 * {@code check durableAgentContext.registerAgentTool(<tool>);}.
 *
 * @since 1.8.0
 */
public class DurableAgentRegisterToolBuilder extends CallBuilder {

    public static final String TOOL_KEY = "tool";
    public static final String TOOL_LABEL = "Tool";
    public static final String TOOL_DOC = "The @ai:AgentTool function to register with the agent";

    public static final String REQUIRES_APPROVAL_KEY = "requiresApproval";
    public static final String USER_ROLES_KEY = "userRoles";
    public static final String REQUIRES_APPROVAL_LABEL = "Requires Approval";
    public static final String REQUIRES_APPROVAL_DOC =
            "Gate this tool: before the agent runs it, a review activity is created and the agent suspends "
            + "durably until a reviewer proceeds (optionally editing the arguments) or rejects.";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.DURABLE_AGENT_REGISTER_TOOL;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(REGISTER_AGENT_TOOL_LABEL).description(REGISTER_AGENT_TOOL_DESCRIPTION);
        codedata()
                .node(NodeKind.DURABLE_AGENT_REGISTER_TOOL)
                .org(WORKFLOW_ORG)
                .module(WORKFLOW_MODULE)
                .object(AGENT_CONTEXT_CLASS_NAME)
                .symbol(REGISTER_AGENT_TOOL_METHOD_NAME);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        setConcreteConstData();

        // When the node comes from the activity search list, its codedata symbol is the chosen
        // activity function — pre-select it. (The palette entry's symbol is the method name.)
        String preSelected = "";
        String contextSymbol = context.codedata() == null ? null : context.codedata().symbol();
        if (contextSymbol != null && !contextSymbol.isEmpty()
                && !REGISTER_AGENT_TOOL_METHOD_NAME.equals(contextSymbol)) {
            preSelected = contextSymbol;
        }

        properties().custom()
                .metadata()
                    .label(TOOL_LABEL)
                    .description(TOOL_DOC)
                    .stepOut()
                .type()
                    .fieldType(Property.ValueType.SINGLE_SELECT)
                    .options(getAgentToolFunctions(context))
                    .selected(true)
                    .stepOut()
                .codedata()
                    .kind(ParameterData.Kind.REQUIRED.name())
                    .stepOut()
                .value(preSelected)
                .editable(true)
                .stepOut()
                .addProperty(TOOL_KEY);

        // ToolDecl gating: emitted as `{tool: <ref>, requiresApproval: true, userRoles: ...}`
        // on the declaration's tools list when set; a bare reference otherwise.
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
                    .description("Role(s) permitted to decide the approval review of this tool, "
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
        properties().checkError(true);
    }

    private static boolean isGated(SourceBuilder sourceBuilder) {
        return sourceBuilder.getProperty(REQUIRES_APPROVAL_KEY)
                .map(p -> p.value() != null && "true".equals(p.value().toString()))
                .orElse(false);
    }

    private static String userRolesSource(SourceBuilder sourceBuilder) {
        return sourceBuilder.getProperty(USER_ROLES_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim())
                .orElse("");
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Object model: the capability lives on the declaration's `tools` list.
        WorkflowUtil.requireDurableAgentObjectTarget(sourceBuilder);
        if (WorkflowUtil.isCapabilityDeleteRequest(sourceBuilder)) {
            return WorkflowUtil.removeAgentCapabilityEntry(sourceBuilder);
        }
        String toolRef = sourceBuilder.getProperty(TOOL_KEY)
                .map(p -> p.value() == null ? "" : p.value().toString().trim()).orElse("");
        if (toolRef.isBlank()) {
            throw new UserFacingException("An agent tool function must be selected");
        }
        boolean gated = isGated(sourceBuilder);
        String userRoles = userRolesSource(sourceBuilder);
        String entry;
        if (!gated && userRoles.isBlank()) {
            entry = toolRef;
        } else {
            StringBuilder mapping = new StringBuilder("{tool: ").append(toolRef);
            if (gated) {
                mapping.append(", requiresApproval: true");
            }
            if (!userRoles.isBlank()) {
                mapping.append(", userRoles: ").append(WorkflowUtil.quoteIfBareRole(userRoles));
            }
            entry = mapping.append("}").toString();
        }
        return WorkflowUtil.upsertAgentCapabilityEntry(sourceBuilder, "tools", entry);
    }

    private List<Option> getAgentToolFunctions(TemplateContext context) {
        List<Option> options = new ArrayList<>();
        Package currentPackage = PackageUtil.loadProject(context.workspaceManager(), context.filePath())
                .currentPackage();
        PackageUtil.getCompilation(currentPackage);
        // @ai:AgentTool functions and module-level ai toolkit variables (e.g. ai:McpToolKit)
        // are both valid entries of the declaration's `tools` list.
        currentPackage.modules().forEach(module ->
                module.getCompilation().getSemanticModel().moduleSymbols().stream()
                        .filter(symbol -> WorkflowUtil.isAiAgentToolFunction(symbol)
                                || WorkflowUtil.isAiToolKitVariable(symbol))
                        .forEach(symbol -> symbol.getName().ifPresent(name ->
                                options.add(new Option(name, name)))));
        return options;
    }
}
