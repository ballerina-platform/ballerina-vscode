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
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import io.ballerina.modelgenerator.commons.FunctionData;
import io.ballerina.modelgenerator.commons.ParameterData;
import org.ballerinalang.langserver.common.utils.NameUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Represents a function call node.
 *
 * @since 1.5.1
 */
public class AgentRunBuilder extends CallBuilder {

    private static final String BALLERINA = "ballerina";
    private Set<String> cachedVisibleSymbolNames;

    // Agent Call Properties
    private static final String QUERY = "query";
    private static final String SESSION_ID = "sessionId";
    private static final String CONTEXT = "context";

    public static final String LABEL = "Agent";
    public static final String DESCRIPTION = "Executes the agent for a given user query.";
    public static final String CATEGORY_DESCRIPTION = "Create or reuse an Agent.";

    static final Set<String> AGENT_CALL_PARAMS_TO_SHOW = Set.of(QUERY, SESSION_ID, CONTEXT);
    private static final String STRING = "string";
    private static final String AI_TRACE = "ai:Trace";
    private static final List<String> TD_OPTIONS = List.of(STRING, AI_TRACE);

    // Cache for agent run function templates to avoid repeated FunctionDataBuilder.build() calls
    private static final Map<String, FlowNode> agentRunFnCache = new ConcurrentHashMap<>();

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.AGENT_RUN;
    }

    @Override
    protected FunctionData.Kind getFunctionResultKind() {
        return FunctionData.Kind.FUNCTION;
    }

    @Override
    public void setConcreteConstData() {
        codedata().node(NodeKind.AGENT_RUN);
        metadata().description(DESCRIPTION);
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        FlowNode callTemplate = getOrCreateCallFunctionTemplate(context);
        restoreFromTemplate(callTemplate);

        Codedata contextCd = context.codedata();
        codedata().lineRange(contextCd.lineRange()).sourceCode(contextCd.sourceCode());

        // TODO: This is a temporary solution until we have a proper plan for handling all generic types.
        makeInferredTypePropertyOptional();
        overrideVariableName(context);
    }

    private FlowNode getOrCreateCallFunctionTemplate(TemplateContext context) {
        Codedata cd = context.codedata();
        String cacheKey = String.format("%s|%s|%s|%s|%s",
                cd.org(), cd.packageName(), cd.version(), cd.symbol(), cd.object());
        return agentRunFnCache.computeIfAbsent(cacheKey, k -> {
            AgentRunBuilder temp = new AgentRunBuilder();
            temp.defaultModuleName(moduleInfo);
            temp.callSuperSetConcreteTemplateData(context);
            return temp.build();
        });
    }

    void callSuperSetConcreteTemplateData(TemplateContext context) {
        super.setConcreteTemplateData(context);
    }

    private void restoreFromTemplate(FlowNode template) {
        Metadata md = template.metadata();
        if (md != null) {
            metadata().label(md.label()).description(md.description());
            if (md.icon() != null) {
                metadata().icon(md.icon());
            }
        }

        Codedata cd = template.codedata();
        if (cd != null) {
            codedata().node(cd.node()).org(cd.org()).module(cd.module())
                    .packageName(cd.packageName()).object(cd.object())
                    .version(cd.version()).symbol(cd.symbol())
                    .inferredReturnType(cd.inferredReturnType());
        }

        if (template.properties() != null) {
            Map<String, Property> currentProps = properties().build();
            template.properties().forEach(currentProps::put);
        }

        if (template.flags() != 0) {
            flag(template.flags());
        }
    }

    private void makeInferredTypePropertyOptional() {
        if (formBuilder == null) {
            return;
        }
        Map<String, Property> props = formBuilder.build();
        for (Map.Entry<String, Property> entry : props.entrySet()) {
            Property prop = entry.getValue();
            if (prop.codedata() != null &&
                    ParameterData.Kind.PARAM_FOR_TYPE_INFER.name().equals(prop.codedata().kind())) {
                Property updatedProp = AiUtils.copyAsOptionalAdvanced(prop);
                // Update the label to "Type Descriptor" for better clarity
                if ("td".equals(entry.getKey()) && updatedProp.metadata() != null) {
                    updatedProp = AiUtils.createPropertyWithUpdatedLabel(updatedProp, "Type Descriptor");
                    // Default to "string" if no value is set, then convert to a select box
                    Object currentValue = updatedProp.value();
                    if (currentValue == null || currentValue.toString().isEmpty()) {
                        updatedProp = AiUtils.createUpdatedProperty(updatedProp, STRING);
                    }
                    updatedProp = AiUtils.convertToSingleSelect(updatedProp, TD_OPTIONS);
                }
                props.put(entry.getKey(), updatedProp);
            }
        }
    }

    private Set<String> getVisibleSymbolNames(TemplateContext context) {
        if (cachedVisibleSymbolNames == null) {
            cachedVisibleSymbolNames = context.getAllVisibleSymbolNames();
        }
        return cachedVisibleSymbolNames;
    }

    @Override
    protected void setReturnTypeProperties(FunctionData functionData, TemplateContext context,
                                           String label, String doc, boolean hidden) {
        properties()
                .type(functionData.returnType(), false, functionData.importStatements(), hidden,
                        Property.RESULT_TYPE_LABEL)
                .data(functionData.returnType(), getVisibleSymbolNames(context), label, doc, false);
    }

    private void overrideVariableName(TemplateContext context) {
        if (formBuilder == null) {
            return;
        }
        Map<String, Property> props = formBuilder.build();
        Property variableProp = props.get(Property.VARIABLE_KEY);
        if (variableProp == null) {
            return;
        }
        String uniqueVarName = NameUtil.generateVariableName(STRING, getVisibleSymbolNames(context));
        props.put(Property.VARIABLE_KEY, AiUtils.createUpdatedProperty(variableProp, uniqueVarName));
    }

    private void newVariableWithInferredTypeAndDefault(SourceBuilder sourceBuilder) {
        FlowNode flowNode = sourceBuilder.flowNode;
        Optional<Property> optionalType = sourceBuilder.getProperty(Property.TYPE_KEY);
        Optional<Property> variable = sourceBuilder.getProperty(Property.VARIABLE_KEY);

        if (optionalType.isEmpty() || variable.isEmpty()) {
            return;
        }

        Property type = optionalType.get();
        String typeName = sourceBuilder.requalifiedType(type);

        if (flowNode.codedata().inferredReturnType() != null) {
            Optional<Property> inferredParam = flowNode.properties().values().stream()
                    .filter(property -> property.codedata() != null && property.codedata().kind() != null &&
                            property.codedata().kind().equals(ParameterData.Kind.PARAM_FOR_TYPE_INFER.name()))
                    .findFirst();
            if (inferredParam.isPresent()) {
                String returnType = flowNode.codedata().inferredReturnType();
                Object inferredValue = inferredParam.get().value();
                // Default to STRING when the inferred type value is null or empty
                String inferredType = (inferredValue != null && !inferredValue.toString().isEmpty())
                        ? inferredValue.toString()
                        : STRING;
                String inferredTypeDef = inferredParam.get()
                        .codedata().originalName();
                typeName = returnType.replace(inferredTypeDef, inferredType);
            }
        }

        sourceBuilder.token().expressionWithType(typeName, variable.get()).keyword(SyntaxKind.EQUAL_TOKEN);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        // Use custom variable declaration with inferred type handling and default to STRING
        newVariableWithInferredTypeAndDefault(sourceBuilder);
        FlowNode agentRunNode = sourceBuilder.flowNode;
        return generateAgentCallSource(sourceBuilder, agentRunNode);
    }

    private Map<Path, List<TextEdit>> generateAgentCallSource(SourceBuilder sourceBuilder, FlowNode agentRunNode) {
        Optional<Property> connection = agentRunNode.getProperty(Property.CONNECTION_KEY);
        if (connection.isEmpty()) {
            throw new IllegalStateException("Agent variable must be defined for an agent run node");
        }

        if (FlowNodeUtil.hasCheckKeyFlagSet(agentRunNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }

        Set<String> excludeKeys = getExcludeKeys(agentRunNode);
        return sourceBuilder.token()
                .name(connection.get().toSourceCode())
                .keyword(BALLERINA.equals(agentRunNode.codedata().org()) ?
                        SyntaxKind.DOT_TOKEN : SyntaxKind.RIGHT_ARROW_TOKEN)
                .name(agentRunNode.metadata().label())
                .stepOut()
                .functionParameters(agentRunNode, excludeKeys)
                .textEdit()
                .build();
    }

    private Set<String> getExcludeKeys(FlowNode agentRunNode) {
        return agentRunNode.properties() != null
                ? agentRunNode.properties().keySet().stream()
                .filter(key -> !AGENT_CALL_PARAMS_TO_SHOW.contains(key))
                .collect(Collectors.toSet())
                : new HashSet<>();
    }
}
