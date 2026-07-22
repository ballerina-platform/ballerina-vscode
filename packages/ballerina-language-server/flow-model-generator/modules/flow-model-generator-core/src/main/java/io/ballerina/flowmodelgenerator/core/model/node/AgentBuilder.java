/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.FunctionData;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Represents agent node in the flow model.
 *
 * @since 1.0.0
 */
public class AgentBuilder extends CallBuilder {

    private static final String AGENT_LABEL = "Agent";
    private FunctionData.Kind functionKind = FunctionData.Kind.CONNECTOR;
    public static final String PARAMS_TO_HIDE = "paramsToHide";
    public static final String MODEL = "model";
    public static final String TYPE = "type";
    public static final String TOOLS = "tools";
    public static final String LABEL = "Agent";
    public static final String DESCRIPTION = "Create new agent";
    public static final String BALLERINA = "ballerina";

    // Config fields hidden from the AGENT node form because they are configured separately: tools are managed via
    // the tools panel, memory via the memory manager, and the raw systemPrompt record is hidden in favour of the
    // friendly Role + Instructions fields. The model field is visible and rendered as a connection select.
    public static final Set<String> CONFIG_PARAMS_TO_HIDE =
            Set.of(AgentCallBuilder.SYSTEM_PROMPT, TOOLS, AgentCallBuilder.MEMORY);

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.AGENT;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return functionKind;
    }

    @Override
    public void setConcreteConstData() {
        metadata().label(AGENT_LABEL);
        codedata().node(NodeKind.AGENT).symbol("init");
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        FlowNode flowNode = sourceBuilder.flowNode;

        // Reconstruct the systemPrompt record from the friendly Role + Instructions fields (mirrors AGENT_CALL).
        if (flowNode.getProperty(AgentCallBuilder.ROLE).isPresent()
                || flowNode.getProperty(AgentCallBuilder.INSTRUCTIONS).isPresent()) {
            AgentCallBuilder.writeSystemPromptFromRoleInstructions(flowNode, flowNode);
        }

        Optional<Property> scopeOpt = flowNode.getProperty(Property.SCOPE_KEY);
        boolean isServiceInitScope = scopeOpt.isPresent() && scopeOpt.get().value().equals(Property.SERVICE_INIT_SCOPE);

        if (isServiceInitScope) {
            Optional<Property> variable = sourceBuilder.getProperty(Property.VARIABLE_KEY);
            variable.ifPresent(property -> sourceBuilder.token().name(property).keyword(SyntaxKind.EQUAL_TOKEN));
        } else {
            sourceBuilder.token().keyword(SyntaxKind.FINAL_KEYWORD);
            sourceBuilder.newVariable();
        }

        sourceBuilder.token()
                .keyword(SyntaxKind.CHECK_KEYWORD)
                .keyword(SyntaxKind.NEW_KEYWORD)
                .stepOut()
                .functionParameters(flowNode, Set.of(Property.VARIABLE_KEY, Property.TYPE_KEY,
                        Property.SCOPE_KEY, Property.CHECK_ERROR_KEY,
                        AgentCallBuilder.ROLE, AgentCallBuilder.INSTRUCTIONS), true);

        return sourceBuilder.textEdit().acceptImport().build();
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        if (context == null || context.codedata() == null) {
            throw new IllegalArgumentException("Context or codedata cannot be null");
        }
        if (context.codedata().org().equals(BALLERINA)) {
            functionKind = FunctionData.Kind.CLASS_INIT;
        }
        super.setConcreteTemplateData(context);
        properties().scope(Property.GLOBAL_SCOPE);

        metadata().addData(PARAMS_TO_HIDE, List.of(TOOLS, TYPE));
        hideAgentConfigProperties(this);
        AgentCallBuilder.setAdditionalAgentProperties(this, null, false);
    }

    @Override
    protected void setReturnTypeProperties(FunctionData functionData, TemplateContext context,
                                           String label, String doc, boolean hidden) {
        super.setReturnTypeProperties(functionData, context, "Agent Name", "Name of the agent", hidden);
    }

    /**
     * Marks the agent fields that are managed outside the form ({@link #CONFIG_PARAMS_TO_HIDE}) as hidden,
     * preserving their existing values. Used for both the AGENT template and analyzed AGENT nodes.
     */
    public static void hideAgentConfigProperties(NodeBuilder nodeBuilder) {
        Map<String, Property> props = nodeBuilder.properties().build();
        for (String key : CONFIG_PARAMS_TO_HIDE) {
            Property property = props.get(key);
            if (property != null) {
                AiUtils.addPropertyFromTemplate(nodeBuilder, key, property, null, true);
            }
        }
    }
}
